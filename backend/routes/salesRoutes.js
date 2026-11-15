import crypto from 'node:crypto';
import express from 'express';
import { body } from 'express-validator';
import { execute, query, queryOne, roundMoney, transaction } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireBusiness, requirePermission } from '../middleware/tenant.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { emitToBusiness, logAudit, notifyBusinessManagers } from '../services/auditService.js';

const router = express.Router();

// List sales with search & filters
router.get('/sales', authenticate, requireBusiness, requirePermission('sales.view'), async (req, res, next) => {
  try {
    const { search = '', payment_status = '', sale_status = '' } = req.query;
    const params = [req.businessId];
    let where = 'WHERE s.business_id = ?';

    if (!req.membership.all_branches_access && req.branchId) {
      where += ' AND s.branch_id = ?';
      params.push(req.branchId);
    }
    if (payment_status) {
      where += ' AND s.payment_status = ?';
      params.push(payment_status);
    }
    if (sale_status) {
      where += ' AND s.sale_status = ?';
      params.push(sale_status);
    }
    if (search.trim()) {
      where += ' AND (s.reference_number LIKE ? OR c.full_name LIKE ?)';
      const t = `%${search.trim()}%`;
      params.push(t, t);
    }

    const sales = await query(
      `SELECT s.*, b.name AS branch_name, c.full_name AS customer_name, u.full_name AS cashier_name,
              r.receipt_number
       FROM sales s
       JOIN branches b ON b.id = s.branch_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.cashier_user_id
       LEFT JOIN receipts r ON r.sale_id = s.id
       ${where}
       ORDER BY s.id DESC LIMIT 100`,
      params
    );
    res.json({ sales });
  } catch (err) {
    next(err);
  }
});

router.get('/sales/:id', authenticate, requireBusiness, requirePermission('sales.view'), async (req, res, next) => {
  try {
    const sale = await queryOne(
      `SELECT s.*, b.name AS branch_name, c.full_name AS customer_name, c.phone AS customer_phone,
              u.full_name AS cashier_name
       FROM sales s
       JOIN branches b ON b.id = s.branch_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.cashier_user_id
       WHERE s.id = ? AND s.business_id = ?`,
      [req.params.id, req.businessId]
    );
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const items = await query('SELECT * FROM sale_items WHERE sale_id = ? AND business_id = ?', [sale.id, req.businessId]);
    const payments = await query('SELECT * FROM payments WHERE sale_id = ? AND business_id = ? ORDER BY id ASC', [sale.id, req.businessId]);
    const refunds = await query('SELECT * FROM refunds WHERE sale_id = ? AND business_id = ? ORDER BY id DESC', [sale.id, req.businessId]);
    const receipt = await queryOne('SELECT * FROM receipts WHERE sale_id = ? AND business_id = ?', [sale.id, req.businessId]);

    res.json({
      sale,
      items,
      payments,
      refunds,
      receipt: receipt ? { ...receipt, payload: JSON.parse(receipt.payload_json) } : null,
    });
  } catch (err) {
    next(err);
  }
});

// Atomic POS Sale Creation (prevents duplicate submissions & simultaneous overselling)
router.post(
  '/sales',
  authenticate,
  requireBusiness,
  requirePermission('pos.sell'),
  [
    body('items').isArray({ min: 1 }).withMessage('Cart must contain at least one product'),
    body('items.*.product_id').isInt().withMessage('Valid product ID required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Item quantity must be at least 1'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const {
        items,
        customer_id = null,
        discount_amount = 0,
        payments = [],
        notes = '',
        idempotency_key = null,
      } = req.body;

      const cleanIdempotency = idempotency_key ? String(idempotency_key).trim() : `pos-${crypto.randomUUID()}`;
      const existingSale = await queryOne(
        'SELECT id, reference_number FROM sales WHERE business_id = ? AND idempotency_key = ?',
        [req.businessId, cleanIdempotency]
      );
      if (existingSale) {
        return res.status(200).json({ message: 'Sale already recorded', saleId: existingSale.id, reference_number: existingSale.reference_number });
      }

      const discountVal = Math.max(0, roundMoney(discount_amount));
      if (discountVal > 0 && !['business_owner', 'business_admin'].includes(req.membership.role_code) && !req.permissions.includes('pos.discount')) {
        return res.status(403).json({ error: 'You are not authorized to apply discounts' });
      }

      const lowStockTriggered = [];

      const outcome = await transaction(async (tx) => {
        const branch = await tx.queryOne('SELECT id, name, code FROM branches WHERE id = ? AND business_id = ?', [
          req.branchId,
          req.businessId,
        ]);
        if (!branch) throw Object.assign(new Error('Active branch not found'), { statusCode: 400 });

        let subtotal = 0;
        const resolvedItems = [];

        for (const row of items) {
          const qty = parseInt(row.quantity, 10);
          const product = await tx.queryOne(
            `SELECT id, name, sku, purchase_price, selling_price, min_stock, status
             FROM products WHERE id = ? AND business_id = ?`,
            [row.product_id, req.businessId]
          );
          if (!product || product.status !== 'active') {
            throw Object.assign(new Error(`Product #${row.product_id} is unavailable`), { statusCode: 400 });
          }

          const inv = await tx.queryOne(
            'SELECT id, quantity FROM inventory WHERE business_id = ? AND branch_id = ? AND product_id = ?',
            [req.businessId, req.branchId, product.id]
          );
          const available = inv ? Number(inv.quantity) : 0;
          if (available < qty) {
            throw Object.assign(
              new Error(`Insufficient stock for ${product.name}: ${available} available, ${qty} requested`),
              { statusCode: 409 }
            );
          }

          // Atomic conditional decrement to guard against two cashiers selling the last unit simultaneously
          const decRes = await tx.execute(
            `UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now')
             WHERE business_id = ? AND branch_id = ? AND product_id = ? AND quantity >= ?`,
            [qty, req.businessId, req.branchId, product.id, qty]
          );
          if (decRes.affectedRows === 0) {
            throw Object.assign(
              new Error(`Concurrent stock conflict: ${product.name} just sold out`),
              { statusCode: 409 }
            );
          }

          const newQty = available - qty;
          if (newQty <= product.min_stock) {
            lowStockTriggered.push({ name: product.name, remaining: newQty });
          }

          const lineTotal = roundMoney(Number(product.selling_price) * qty);
          subtotal = roundMoney(subtotal + lineTotal);
          resolvedItems.push({
            product_id: product.id,
            product_name: product.name,
            quantity: qty,
            unit_cost: roundMoney(product.purchase_price),
            unit_price: roundMoney(product.selling_price),
            line_total: lineTotal,
            prev_qty: available,
            new_qty: newQty,
          });
        }

        const taxableBase = Math.max(0, roundMoney(subtotal - discountVal));
        const taxRate = req.business.tax_enabled ? Number(req.business.default_tax_rate || 0) : 0;
        const taxAmount = roundMoney((taxableBase * taxRate) / 100);
        const totalAmount = roundMoney(taxableBase + taxAmount);

        const validPayments = Array.isArray(payments)
          ? payments.filter((p) => Number(p.amount) > 0)
          : [];
        const amountPaid = roundMoney(validPayments.reduce((s, p) => s + roundMoney(p.amount), 0));
        const effectivePaid = Math.min(amountPaid, totalAmount);
        const balanceDue = Math.max(0, roundMoney(totalAmount - effectivePaid));

        let paymentStatus = 'paid';
        if (effectivePaid <= 0 && totalAmount > 0) paymentStatus = 'unpaid';
        else if (balanceDue > 0) paymentStatus = 'partial';

        if (balanceDue > 0 && !customer_id) {
          throw Object.assign(new Error('Select a registered customer for partial or unpaid credit sales'), { statusCode: 400 });
        }

        const refNum = `SL-${branch.code}-${Date.now().toString().slice(-6)}`;
        const receiptNum = `RCP-${branch.code}-${Date.now().toString().slice(-6)}`;

        const saleRes = await tx.execute(
          `INSERT INTO sales (business_id, branch_id, customer_id, cashier_user_id, reference_number, idempotency_key, subtotal, discount_amount, tax_amount, total_amount, amount_paid, balance_due, sale_status, payment_status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
          [
            req.businessId,
            req.branchId,
            customer_id ? Number(customer_id) : null,
            req.user.id,
            refNum,
            cleanIdempotency,
            subtotal,
            discountVal,
            taxAmount,
            totalAmount,
            effectivePaid,
            balanceDue,
            paymentStatus,
            notes,
          ]
        );
        const saleId = saleRes.insertId;

        for (const item of resolvedItems) {
          await tx.execute(
            `INSERT INTO sale_items (business_id, sale_id, product_id, product_name, quantity, unit_cost, unit_price, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.businessId, saleId, item.product_id, item.product_name, item.quantity, item.unit_cost, item.unit_price, item.line_total]
          );

          await tx.execute(
            `INSERT INTO stock_movements (business_id, branch_id, product_id, movement_type, quantity_change, previous_quantity, new_quantity, reason, related_type, related_id, user_id)
             VALUES (?, ?, ?, 'sale', ?, ?, ?, ?, 'sale', ?, ?)`,
            [req.businessId, req.branchId, item.product_id, -item.quantity, item.prev_qty, item.new_qty, `POS Sale ${refNum}`, saleId, req.user.id]
          );
        }

        for (const p of validPayments) {
          await tx.execute(
            `INSERT INTO payments (business_id, branch_id, sale_id, customer_id, payment_method, amount, external_reference, verification_status, recorded_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', ?)`,
            [
              req.businessId,
              req.branchId,
              saleId,
              customer_id ? Number(customer_id) : null,
              p.payment_method || 'cash',
              roundMoney(p.amount),
              p.external_reference || null,
              req.user.id,
            ]
          );
        }

        if (customer_id) {
          const pointsEarned = Math.floor(effectivePaid / 1000);
          await tx.execute(
            `UPDATE customers
             SET outstanding_balance = outstanding_balance + ?, loyalty_points = loyalty_points + ?
             WHERE id = ? AND business_id = ?`,
            [balanceDue, pointsEarned, Number(customer_id), req.businessId]
          );
        }

        const customer = customer_id
          ? await tx.queryOne('SELECT full_name, phone FROM customers WHERE id = ?', [Number(customer_id)])
          : null;

        const receiptPayload = {
          receipt_number: receiptNum,
          reference_number: refNum,
          date: new Date().toISOString(),
          business_name: req.business.name,
          business_phone: req.business.phone,
          business_address: req.business.physical_address,
          business_tin: req.business.tax_identification_number,
          business_logo: req.business.logo_url,
          branch_name: branch.name,
          currency_code: req.business.currency_code,
          cashier_name: req.user.full_name,
          customer_name: customer?.full_name || 'Walk-in Customer',
          items: resolvedItems.map((i) => ({
            name: i.product_name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            line_total: i.line_total,
          })),
          subtotal,
          discount_amount: discountVal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          amount_paid: effectivePaid,
          balance_due: balanceDue,
          payment_status: paymentStatus,
          payments: validPayments,
        };

        await tx.execute(
          `INSERT INTO receipts (business_id, sale_id, receipt_number, payload_json)
           VALUES (?, ?, ?, ?)`,
          [req.businessId, saleId, receiptNum, JSON.stringify(receiptPayload)]
        );

        return { saleId, reference_number: refNum, receipt: receiptPayload };
      });

      for (const ls of lowStockTriggered) {
        await notifyBusinessManagers(
          req.businessId,
          ls.remaining === 0 ? 'out_of_stock' : 'low_inventory',
          ls.remaining === 0 ? `Out of stock: ${ls.name}` : `Low stock: ${ls.name}`,
          `${ls.name} has ${ls.remaining} units remaining after POS sale.`,
          '/app/inventory'
        );
      }

      emitToBusiness(req.businessId, 'sale:created', {
        saleId: outcome.saleId,
        reference_number: outcome.reference_number,
        total_amount: outcome.receipt.total_amount,
      });

      await logAudit({
        businessId: req.businessId,
        branchId: req.branchId,
        userId: req.user.id,
        action: 'sale.completed',
        entityType: 'sale',
        entityId: outcome.saleId,
        changes: { total: outcome.receipt.total_amount, payment_status: outcome.receipt.payment_status },
      });

      res.status(201).json(outcome);
    } catch (err) {
      next(err);
    }
  }
);

// Record follow-up payment on partial/unpaid sale
router.post(
  '/sales/:id/payments',
  authenticate,
  requireBusiness,
  requirePermission('pos.sell'),
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Payment amount must be greater than 0'),
    body('payment_method').notEmpty().withMessage('Payment method required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { amount, payment_method, external_reference = '' } = req.body;
      const payAmt = roundMoney(amount);

      const updated = await transaction(async (tx) => {
        const sale = await tx.queryOne('SELECT * FROM sales WHERE id = ? AND business_id = ?', [
          req.params.id,
          req.businessId,
        ]);
        if (!sale) throw Object.assign(new Error('Sale not found'), { statusCode: 404 });
        if (sale.balance_due <= 0) throw Object.assign(new Error('Sale is already fully paid'), { statusCode: 400 });

        const applied = Math.min(payAmt, roundMoney(sale.balance_due));
        const newPaid = roundMoney(Number(sale.amount_paid) + applied);
        const newBalance = Math.max(0, roundMoney(Number(sale.total_amount) - newPaid));
        const newStatus = newBalance === 0 ? 'paid' : 'partial';

        await tx.execute(
          `INSERT INTO payments (business_id, branch_id, sale_id, customer_id, payment_method, amount, external_reference, verification_status, recorded_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', ?)`,
          [req.businessId, sale.branch_id, sale.id, sale.customer_id, payment_method, applied, external_reference, req.user.id]
        );
        await tx.execute(
          'UPDATE sales SET amount_paid = ?, balance_due = ?, payment_status = ? WHERE id = ?',
          [newPaid, newBalance, newStatus, sale.id]
        );
        if (sale.customer_id) {
          await tx.execute(
            'UPDATE customers SET outstanding_balance = MAX(0, outstanding_balance - ?) WHERE id = ? AND business_id = ?',
            [applied, sale.customer_id, req.businessId]
          );
        }
        return { amount_paid: newPaid, balance_due: newBalance, payment_status: newStatus };
      });

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'payment.recorded',
        entityType: 'sale',
        entityId: req.params.id,
        changes: { amount: payAmt, payment_method },
      });

      res.json({ message: 'Payment recorded', ...updated });
    } catch (err) {
      next(err);
    }
  }
);

// Authorized Refund / Reversal (never deletes financial records)
router.post(
  '/sales/:id/refund',
  authenticate,
  requireBusiness,
  requirePermission('sales.refund'),
  [body('reason').trim().notEmpty().withMessage('Refund reason is required')],
  validateRequest,
  async (req, res, next) => {
    try {
      const { reason, restock_items = true } = req.body;
      await transaction(async (tx) => {
        const sale = await tx.queryOne('SELECT * FROM sales WHERE id = ? AND business_id = ?', [
          req.params.id,
          req.businessId,
        ]);
        if (!sale) throw Object.assign(new Error('Sale not found'), { statusCode: 404 });
        if (sale.sale_status === 'refunded') throw Object.assign(new Error('Sale already refunded'), { statusCode: 400 });

        await tx.execute(
          `INSERT INTO refunds (business_id, branch_id, sale_id, amount, reason, restock_items, approved_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [req.businessId, sale.branch_id, sale.id, sale.amount_paid, reason.trim(), restock_items ? 1 : 0, req.user.id]
        );
        await tx.execute(`UPDATE sales SET sale_status = 'refunded' WHERE id = ?`, [sale.id]);

        if (restock_items) {
          const items = await tx.query('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id]);
          for (const item of items) {
            const inv = await tx.queryOne(
              'SELECT id, quantity FROM inventory WHERE business_id = ? AND branch_id = ? AND product_id = ?',
              [req.businessId, sale.branch_id, item.product_id]
            );
            const prevQty = inv ? Number(inv.quantity) : 0;
            const newQty = prevQty + Number(item.quantity);
            if (inv) {
              await tx.execute('UPDATE inventory SET quantity = ? WHERE id = ?', [newQty, inv.id]);
            }
            await tx.execute(
              `INSERT INTO stock_movements (business_id, branch_id, product_id, movement_type, quantity_change, previous_quantity, new_quantity, reason, related_type, related_id, user_id)
               VALUES (?, ?, ?, 'refund_return', ?, ?, ?, ?, 'sale', ?, ?)`,
              [req.businessId, sale.branch_id, item.product_id, item.quantity, prevQty, newQty, `Refund ${sale.reference_number}: ${reason}`, sale.id, req.user.id]
            );
          }
        }
        if (sale.customer_id && sale.balance_due > 0) {
          await tx.execute(
            'UPDATE customers SET outstanding_balance = MAX(0, outstanding_balance - ?) WHERE id = ?',
            [sale.balance_due, sale.customer_id]
          );
        }
      });

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'sale.refunded',
        entityType: 'sale',
        entityId: req.params.id,
        changes: { reason, restock_items },
      });

      res.json({ message: 'Sale refunded and logged cleanly' });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/receipts/:saleId', authenticate, requireBusiness, async (req, res, next) => {
  try {
    const receipt = await queryOne('SELECT * FROM receipts WHERE sale_id = ? AND business_id = ?', [
      req.params.saleId,
      req.businessId,
    ]);
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    await execute('UPDATE receipts SET printed_count = printed_count + 1 WHERE id = ?', [receipt.id]);
    res.json({ receipt: { ...receipt, payload: JSON.parse(receipt.payload_json) } });
  } catch (err) {
    next(err);
  }
});

export default router;
