import express from 'express';
import { body } from 'express-validator';
import { execute, query, queryOne, roundMoney, transaction } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireBusiness, requirePermission } from '../middleware/tenant.js';
import { upload } from '../middleware/upload.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { emitToBusiness, logAudit, notifyBusinessManagers } from '../services/auditService.js';

const router = express.Router();

// ================= CUSTOMERS (CRM) =================
router.get('/customers', authenticate, requireBusiness, requirePermission('customers.view'), async (req, res, next) => {
  try {
    const { search = '' } = req.query;
    const params = [req.businessId];
    let where = 'WHERE c.business_id = ?';
    if (search.trim()) {
      where += ' AND (c.full_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)';
      const t = `%${search.trim()}%`;
      params.push(t, t, t);
    }
    const customers = await query(
      `SELECT c.*, u.avatar_url AS avatar_url,
              (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id) AS total_orders
       FROM customers c
       LEFT JOIN users u ON u.id = c.user_id
       ${where} ORDER BY c.id DESC`,
      params
    );
    res.json({ customers });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/customers',
  authenticate,
  requireBusiness,
  requirePermission('customers.manage'),
  [
    body('full_name').trim().notEmpty().withMessage('Customer name required'),
    body('phone').trim().notEmpty().withMessage('Phone number required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { full_name, phone, email = '', address = '', customer_type = 'retail', notes = '' } = req.body;
      const r = await execute(
        `INSERT INTO customers (business_id, full_name, phone, email, address, customer_type, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.businessId, full_name.trim(), phone.trim(), email, address, customer_type, notes]
      );
      const customer = await queryOne('SELECT * FROM customers WHERE id = ?', [r.insertId]);
      res.status(201).json({ customer });
    } catch (err) {
      next(err);
    }
  }
);

router.put('/customers/:id', authenticate, requireBusiness, requirePermission('customers.manage'), async (req, res, next) => {
  try {
    const existing = await queryOne('SELECT * FROM customers WHERE id = ? AND business_id = ?', [req.params.id, req.businessId]);
    if (!existing) return res.status(404).json({ error: 'Customer not found' });
    const { full_name, phone, email, address, customer_type, notes, status } = req.body;
    await execute(
      `UPDATE customers SET
         full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), email = COALESCE(?, email),
         address = COALESCE(?, address), customer_type = COALESCE(?, customer_type),
         notes = COALESCE(?, notes), status = COALESCE(?, status)
       WHERE id = ? AND business_id = ?`,
      [full_name, phone, email, address, customer_type, notes, status, req.params.id, req.businessId]
    );
    const customer = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    res.json({ customer });
  } catch (err) {
    next(err);
  }
});

router.get('/customers/:id/history', authenticate, requireBusiness, requirePermission('customers.view'), async (req, res, next) => {
  try {
    const customer = await queryOne(
      `SELECT c.*, u.avatar_url AS avatar_url
       FROM customers c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = ? AND c.business_id = ?`,
      [req.params.id, req.businessId]
    );
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const sales = await query('SELECT * FROM sales WHERE customer_id = ? AND business_id = ? ORDER BY id DESC', [customer.id, req.businessId]);
    const notes = await query(
      `SELECT cn.*, u.full_name AS author_name, u.avatar_url AS author_avatar FROM customer_notes cn
       LEFT JOIN users u ON u.id = cn.author_user_id
       WHERE cn.customer_id = ? AND cn.business_id = ? ORDER BY cn.id DESC`,
      [customer.id, req.businessId]
    );
    res.json({ customer, sales, notes });
  } catch (err) {
    next(err);
  }
});

router.post('/customers/:id/notes', authenticate, requireBusiness, requirePermission('customers.manage'), async (req, res, next) => {
  try {
    const { note_type = 'general', content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Note content required' });
    await execute(
      'INSERT INTO customer_notes (business_id, customer_id, author_user_id, note_type, content) VALUES (?, ?, ?, ?, ?)',
      [req.businessId, req.params.id, req.user.id, note_type, content.trim()]
    );
    res.status(201).json({ message: 'Customer note added' });
  } catch (err) {
    next(err);
  }
});

// ================= SUPPLIERS =================
router.get('/suppliers', authenticate, requireBusiness, requirePermission('suppliers.view'), async (req, res, next) => {
  try {
    const suppliers = await query('SELECT * FROM suppliers WHERE business_id = ? ORDER BY id DESC', [req.businessId]);
    res.json({ suppliers });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/suppliers',
  authenticate,
  requireBusiness,
  requirePermission('suppliers.manage'),
  [
    body('name').trim().notEmpty().withMessage('Supplier name required'),
    body('phone').trim().notEmpty().withMessage('Supplier phone required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { name, contact_person = '', phone, email = '', address = '', tax_number = '', notes = '' } = req.body;
      const r = await execute(
        `INSERT INTO suppliers (business_id, name, contact_person, phone, email, address, tax_number, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.businessId, name.trim(), contact_person, phone.trim(), email, address, tax_number, notes]
      );
      const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ?', [r.insertId]);
      res.status(201).json({ supplier });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/suppliers/:id/payments', authenticate, requireBusiness, requirePermission('suppliers.manage'), async (req, res, next) => {
  try {
    const { amount, payment_method = 'bank_transfer', reference_number = '' } = req.body;
    const payAmt = roundMoney(amount);
    if (payAmt <= 0) return res.status(400).json({ error: 'Payment amount must be positive' });

    await transaction(async (tx) => {
      const sup = await tx.queryOne('SELECT * FROM suppliers WHERE id = ? AND business_id = ?', [req.params.id, req.businessId]);
      if (!sup) throw Object.assign(new Error('Supplier not found'), { statusCode: 404 });
      await tx.execute(
        `INSERT INTO supplier_payments (business_id, supplier_id, amount, payment_method, reference_number, recorded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.businessId, sup.id, payAmt, payment_method, reference_number, req.user.id]
      );
      await tx.execute(
        'UPDATE suppliers SET outstanding_balance = MAX(0, outstanding_balance - ?) WHERE id = ?',
        [payAmt, sup.id]
      );
    });
    res.json({ message: 'Supplier payment recorded' });
  } catch (err) {
    next(err);
  }
});

// ================= PURCHASES (PO + RECEIVING) =================
router.get('/purchases', authenticate, requireBusiness, requirePermission('purchases.view'), async (req, res, next) => {
  try {
    const orders = await query(
      `SELECT po.*, s.name AS supplier_name, b.name AS branch_name, u.full_name AS created_by_name
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN branches b ON b.id = po.branch_id
       LEFT JOIN users u ON u.id = po.created_by_user_id
       WHERE po.business_id = ?
       ORDER BY po.id DESC`,
      [req.businessId]
    );
    for (const po of orders) {
      po.items = await query(
        `SELECT pi.*, p.name AS product_name, p.sku
         FROM purchase_items pi JOIN products p ON p.id = pi.product_id
         WHERE pi.purchase_order_id = ?`,
        [po.id]
      );
    }
    res.json({ purchases: orders });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/purchases',
  authenticate,
  requireBusiness,
  requirePermission('purchases.manage'),
  [
    body('supplier_id').isInt().withMessage('Supplier required'),
    body('items').isArray({ min: 1 }).withMessage('At least one product required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { supplier_id, expected_delivery_date = null, invoice_number = '', notes = '', items } = req.body;
      const poNumber = `PO-${Date.now().toString().slice(-6)}`;

      const poId = await transaction(async (tx) => {
        let total = 0;
        for (const it of items) {
          total = roundMoney(total + Number(it.ordered_qty) * Number(it.unit_cost));
        }
        const poRes = await tx.execute(
          `INSERT INTO purchase_orders (business_id, branch_id, supplier_id, po_number, status, total_amount, expected_delivery_date, invoice_number, notes, created_by_user_id)
           VALUES (?, ?, ?, ?, 'ordered', ?, ?, ?, ?, ?)`,
          [req.businessId, req.branchId, supplier_id, poNumber, total, expected_delivery_date, invoice_number, notes, req.user.id]
        );
        for (const it of items) {
          await tx.execute(
            `INSERT INTO purchase_items (purchase_order_id, product_id, ordered_qty, received_qty, unit_cost)
             VALUES (?, ?, ?, 0, ?)`,
            [poRes.insertId, it.product_id, parseInt(it.ordered_qty, 10), roundMoney(it.unit_cost)]
          );
        }
        return poRes.insertId;
      });

      res.status(201).json({ purchaseOrderId: poId, po_number: poNumber });
    } catch (err) {
      next(err);
    }
  }
);

// Inventory increases ONLY when goods are actually received
router.post('/purchases/:id/receive', authenticate, requireBusiness, requirePermission('purchases.manage'), async (req, res, next) => {
  try {
    const { items } = req.body; // [{ purchase_item_id, receive_qty }]
    await transaction(async (tx) => {
      const po = await tx.queryOne('SELECT * FROM purchase_orders WHERE id = ? AND business_id = ?', [req.params.id, req.businessId]);
      if (!po) throw Object.assign(new Error('Purchase order not found'), { statusCode: 404 });

      const poItems = await tx.query('SELECT * FROM purchase_items WHERE purchase_order_id = ?', [po.id]);
      let receivedValue = 0;

      for (const pItem of poItems) {
        const input = Array.isArray(items)
          ? items.find((i) => Number(i.purchase_item_id) === pItem.id)
          : { receive_qty: pItem.ordered_qty - pItem.received_qty };
        const qty = Math.min(Number(input?.receive_qty || 0), pItem.ordered_qty - pItem.received_qty);
        if (qty <= 0) continue;

        receivedValue = roundMoney(receivedValue + qty * Number(pItem.unit_cost));
        await tx.execute('UPDATE purchase_items SET received_qty = received_qty + ? WHERE id = ?', [qty, pItem.id]);

        const inv = await tx.queryOne(
          'SELECT id, quantity FROM inventory WHERE business_id = ? AND branch_id = ? AND product_id = ?',
          [req.businessId, po.branch_id, pItem.product_id]
        );
        const prevQty = inv ? Number(inv.quantity) : 0;
        const newQty = prevQty + qty;
        if (inv) {
          await tx.execute(`UPDATE inventory SET quantity = ?, updated_at = datetime('now') WHERE id = ?`, [newQty, inv.id]);
        } else {
          await tx.execute(
            'INSERT INTO inventory (business_id, branch_id, product_id, quantity) VALUES (?, ?, ?, ?)',
            [req.businessId, po.branch_id, pItem.product_id, newQty]
          );
        }

        await tx.execute(
          `INSERT INTO stock_movements (business_id, branch_id, product_id, movement_type, quantity_change, previous_quantity, new_quantity, reason, related_type, related_id, user_id)
           VALUES (?, ?, ?, 'purchase_receive', ?, ?, ?, ?, 'purchase_order', ?, ?)`,
          [req.businessId, po.branch_id, pItem.product_id, qty, prevQty, newQty, `Goods received ${po.po_number}`, po.id, req.user.id]
        );
      }

      const refreshed = await tx.query('SELECT ordered_qty, received_qty FROM purchase_items WHERE purchase_order_id = ?', [po.id]);
      const allDone = refreshed.every((r) => r.received_qty >= r.ordered_qty);
      const anyDone = refreshed.some((r) => r.received_qty > 0);
      const nextStatus = allDone ? 'received' : anyDone ? 'partially_received' : po.status;

      await tx.execute('UPDATE purchase_orders SET status = ? WHERE id = ?', [nextStatus, po.id]);
      if (receivedValue > 0) {
        await tx.execute('UPDATE suppliers SET outstanding_balance = outstanding_balance + ? WHERE id = ?', [
          receivedValue,
          po.supplier_id,
        ]);
      }
    });

    emitToBusiness(req.businessId, 'inventory:updated', { purchaseOrderId: req.params.id });
    res.json({ message: 'Goods received and inventory updated' });
  } catch (err) {
    next(err);
  }
});

// ================= CUSTOMER ORDERS =================
router.get('/orders', authenticate, requireBusiness, requirePermission('orders.view'), async (req, res, next) => {
  try {
    const orders = await query(
      `SELECT o.*, b.name AS branch_name, u.avatar_url AS customer_avatar
       FROM orders o
       JOIN branches b ON b.id = o.branch_id
       LEFT JOIN users u ON u.id = o.customer_user_id
       WHERE o.business_id = ?
       ORDER BY o.id DESC`,
      [req.businessId]
    );
    for (const o of orders) {
      o.items = await query('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
    }
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/orders',
  authenticate,
  requireBusiness,
  requirePermission('orders.manage'),
  [
    body('customer_name').trim().notEmpty().withMessage('Customer name required'),
    body('customer_phone').trim().notEmpty().withMessage('Customer phone required'),
    body('items').isArray({ min: 1 }).withMessage('Order items required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { customer_name, customer_phone, customer_id = null, delivery_address = '', notes = '', items } = req.body;
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

      const orderId = await transaction(async (tx) => {
        let total = 0;
        const resolved = [];
        for (const it of items) {
          const prod = await tx.queryOne('SELECT id, name, selling_price FROM products WHERE id = ? AND business_id = ?', [
            it.product_id,
            req.businessId,
          ]);
          if (!prod) throw Object.assign(new Error('Invalid product in order'), { statusCode: 400 });
          const qty = parseInt(it.quantity, 10);
          total = roundMoney(total + Number(prod.selling_price) * qty);
          resolved.push({ product_id: prod.id, name: prod.name, quantity: qty, unit_price: prod.selling_price });
        }

        const oRes = await tx.execute(
          `INSERT INTO orders (business_id, branch_id, customer_id, order_number, customer_name, customer_phone, delivery_address, total_amount, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.businessId, req.branchId, customer_id, orderNumber, customer_name, customer_phone, delivery_address, total, notes]
        );
        for (const r of resolved) {
          await tx.execute(
            'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
            [oRes.insertId, r.product_id, r.name, r.quantity, r.unit_price]
          );
        }
        await tx.execute(
          'INSERT INTO order_status_history (order_id, old_status, new_status, changed_by_user_id, note) VALUES (?, NULL, ?, ?, ?)',
          [oRes.insertId, 'pending', req.user.id, 'Order placed']
        );
        return oRes.insertId;
      });

      await notifyBusinessManagers(
        req.businessId,
        'new_order',
        `New Order ${orderNumber}`,
        `${customer_name} (${customer_phone}) placed order ${orderNumber}.`,
        '/app/orders'
      );
      emitToBusiness(req.businessId, 'order:updated', { orderId, order_number: orderNumber, status: 'pending' });
      res.status(201).json({ orderId, order_number: orderNumber });
    } catch (err) {
      next(err);
    }
  }
);

router.patch('/orders/:id/status', authenticate, requireBusiness, requirePermission('orders.manage'), async (req, res, next) => {
  try {
    const { order_status, payment_status, note = '' } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'ready_for_collection', 'out_for_delivery', 'completed', 'cancelled'];
    if (order_status && !validStatuses.includes(order_status)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const order = await queryOne('SELECT * FROM orders WHERE id = ? AND business_id = ?', [req.params.id, req.businessId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await execute(
      `UPDATE orders SET
         order_status = COALESCE(?, order_status),
         payment_status = COALESCE(?, payment_status),
         updated_at = datetime('now')
       WHERE id = ? AND business_id = ?`,
      [order_status || null, payment_status || null, order.id, req.businessId]
    );
    if (order_status && order_status !== order.order_status) {
      await execute(
        'INSERT INTO order_status_history (order_id, old_status, new_status, changed_by_user_id, note) VALUES (?, ?, ?, ?, ?)',
        [order.id, order.order_status, order_status, req.user.id, note]
      );
    }

    emitToBusiness(req.businessId, 'order:updated', { orderId: order.id, order_status });
    res.json({ message: 'Order updated' });
  } catch (err) {
    next(err);
  }
});

// Public Customer Order Tracking
router.get('/public/orders/track', async (req, res, next) => {
  try {
    const { order_number = '', phone = '' } = req.query;
    if (!order_number.trim() || !phone.trim()) {
      return res.status(400).json({ error: 'Order number and phone number are required' });
    }
    const order = await queryOne(
      `SELECT o.order_number, o.customer_name, o.order_status, o.payment_status, o.total_amount, o.delivery_address, o.created_at,
              b.name AS business_name, b.currency_code, br.name AS branch_name
       FROM orders o
       JOIN businesses b ON b.id = o.business_id
       JOIN branches br ON br.id = o.branch_id
       WHERE o.order_number = ? AND o.customer_phone = ?`,
      [order_number.trim(), phone.trim()]
    );
    if (!order) return res.status(404).json({ error: 'No matching order found' });
    const history = await query(
      `SELECT h.new_status, h.note, h.created_at
       FROM order_status_history h
       JOIN orders o ON o.id = h.order_id
       WHERE o.order_number = ? ORDER BY h.id ASC`,
      [order_number.trim()]
    );
    res.json({ order, history });
  } catch (err) {
    next(err);
  }
});

// ================= FINANCE (INCOME, EXPENSES, P&L) =================
router.get('/finance/summary', authenticate, requireBusiness, requirePermission('finance.view'), async (req, res, next) => {
  try {
    const branchClause = !req.membership.all_branches_access && req.branchId ? ' AND branch_id = ?' : '';
    const params = !req.membership.all_branches_access && req.branchId ? [req.businessId, req.branchId] : [req.businessId];

    const salesRev = await queryOne(
      `SELECT COALESCE(SUM(total_amount), 0) AS revenue,
              COALESCE(SUM(amount_paid), 0) AS cash_from_sales,
              COALESCE(SUM(balance_due), 0) AS receivables
       FROM sales WHERE business_id = ? AND sale_status != 'cancelled' AND sale_status != 'refunded'${branchClause}`,
      params
    );
    const cogsRow = await queryOne(
      `SELECT COALESCE(SUM(si.quantity * si.unit_cost), 0) AS cogs
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.business_id = ? AND s.sale_status != 'cancelled' AND s.sale_status != 'refunded'${!req.membership.all_branches_access && req.branchId ? ' AND s.branch_id = ?' : ''}`,
      params
    );
    const otherIncome = await queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE business_id = ?${branchClause}`,
      params
    );
    const approvedExpenses = await queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE business_id = ? AND approval_status = 'approved'${branchClause}`,
      params
    );
    const supplierDebt = await queryOne(
      `SELECT COALESCE(SUM(outstanding_balance), 0) AS payables FROM suppliers WHERE business_id = ?`,
      [req.businessId]
    );

    const revenue = roundMoney(salesRev.revenue);
    const cogs = roundMoney(cogsRow.cogs);
    const grossProfit = roundMoney(revenue - cogs);
    const extraIncome = roundMoney(otherIncome.total);
    const operatingExpenses = roundMoney(approvedExpenses.total);
    const netOperatingProfit = roundMoney(grossProfit + extraIncome - operatingExpenses);
    const cashReceived = roundMoney(Number(salesRev.cash_from_sales) + extraIncome);
    const netCashFlow = roundMoney(cashReceived - operatingExpenses);

    res.json({
      revenue,
      cogs,
      gross_profit: grossProfit,
      other_income: extraIncome,
      operating_expenses: operatingExpenses,
      net_operating_profit: netOperatingProfit,
      cash_received: cashReceived,
      net_cash_flow: netCashFlow,
      outstanding_receivables: roundMoney(salesRev.receivables),
      supplier_payables: roundMoney(supplierDebt.payables),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/finance/income', authenticate, requireBusiness, requirePermission('finance.view'), async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT i.*, b.name AS branch_name, u.full_name AS recorded_by_name
       FROM income i
       JOIN branches b ON b.id = i.branch_id
       LEFT JOIN users u ON u.id = i.recorded_by_user_id
       WHERE i.business_id = ? ORDER BY i.id DESC`,
      [req.businessId]
    );
    res.json({ income: rows });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/finance/income',
  authenticate,
  requireBusiness,
  requirePermission('finance.create'),
  [
    body('category').trim().notEmpty().withMessage('Category required'),
    body('source').trim().notEmpty().withMessage('Source required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Valid amount required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { category, source, amount, payment_method = 'cash', description = '', income_date } = req.body;
      const dateStr = income_date || new Date().toISOString().slice(0, 10);
      const r = await execute(
        `INSERT INTO income (business_id, branch_id, category, source, amount, payment_method, description, recorded_by_user_id, income_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.businessId, req.branchId, category, source, roundMoney(amount), payment_method, description, req.user.id, dateStr]
      );
      await logAudit({
        businessId: req.businessId,
        branchId: req.branchId,
        userId: req.user.id,
        action: 'income.recorded',
        entityType: 'income',
        entityId: r.insertId,
        changes: { amount, category },
      });
      res.status(201).json({ id: r.insertId, message: 'Income recorded' });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/finance/expenses', authenticate, requireBusiness, requirePermission('finance.view'), async (req, res, next) => {
  try {
    const expenses = await query(
      `SELECT e.*, b.name AS branch_name, u.full_name AS recorded_by_name, ap.full_name AS approved_by_name
       FROM expenses e
       JOIN branches b ON b.id = e.branch_id
       LEFT JOIN users u ON u.id = e.recorded_by_user_id
       LEFT JOIN users ap ON ap.id = e.approved_by_user_id
       WHERE e.business_id = ? ORDER BY e.id DESC`,
      [req.businessId]
    );
    const categories = await query('SELECT * FROM expense_categories WHERE business_id = ? ORDER BY name ASC', [req.businessId]);
    res.json({ expenses, categories });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/finance/expenses',
  authenticate,
  requireBusiness,
  requirePermission('finance.create'),
  upload.single('receipt'),
  [
    body('title').trim().notEmpty().withMessage('Expense title required'),
    body('category_name').trim().notEmpty().withMessage('Expense category required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { title, category_name, description = '', amount, payment_method = 'cash', expense_date } = req.body;
      const dateStr = expense_date || new Date().toISOString().slice(0, 10);
      const receiptUrl = req.file ? `/uploads/${req.file.filename}` : null;

      // Business Admins/Owners auto-approve their own expenses; others submit for approval
      const autoApprove = ['business_owner', 'business_admin'].includes(req.membership.role_code);
      const status = autoApprove ? 'approved' : 'pending';

      const r = await execute(
        `INSERT INTO expenses (business_id, branch_id, category_name, title, description, amount, payment_method, receipt_file_url, approval_status, recorded_by_user_id, approved_by_user_id, expense_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.businessId,
          req.branchId,
          category_name,
          title.trim(),
          description,
          roundMoney(amount),
          payment_method,
          receiptUrl,
          status,
          req.user.id,
          autoApprove ? req.user.id : null,
          dateStr,
        ]
      );

      if (!autoApprove) {
        await notifyBusinessManagers(
          req.businessId,
          'expense_approval',
          'Expense awaiting approval',
          `${req.user.full_name} submitted ${title} (${roundMoney(amount)} ${req.business.currency_code}).`,
          '/app/finance'
        );
      }

      res.status(201).json({ id: r.insertId, approval_status: status });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/finance/expenses/:id/approval',
  authenticate,
  requireBusiness,
  requirePermission('finance.approve'),
  [body('decision').isIn(['approved', 'rejected']).withMessage('Decision must be approved or rejected')],
  validateRequest,
  async (req, res, next) => {
    try {
      const { decision, note = '' } = req.body;
      const exp = await queryOne('SELECT * FROM expenses WHERE id = ? AND business_id = ?', [req.params.id, req.businessId]);
      if (!exp) return res.status(404).json({ error: 'Expense not found' });

      await execute(
        'UPDATE expenses SET approval_status = ?, approved_by_user_id = ? WHERE id = ?',
        [decision, req.user.id, exp.id]
      );
      await execute(
        'INSERT INTO expense_approvals (expense_id, approver_user_id, decision, note) VALUES (?, ?, ?, ?)',
        [exp.id, req.user.id, decision, note]
      );
      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: `expense.${decision}`,
        entityType: 'expense',
        entityId: exp.id,
        changes: { amount: exp.amount, decision },
      });
      res.json({ message: `Expense ${decision}` });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
