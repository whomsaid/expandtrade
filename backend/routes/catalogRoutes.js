import express from 'express';
import { body } from 'express-validator';
import { execute, query, queryOne, transaction } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireBusiness, requirePermission } from '../middleware/tenant.js';
import { cleanupMulterFiles, imageUpload, removeUploadedFile, verifyFileNonEmpty, verifyImageSignature } from '../middleware/upload.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { emitToBusiness, logAudit, notifyBusinessManagers } from '../services/auditService.js';
import { invalidatePrefix } from '../services/cacheService.js';

const router = express.Router();

// Categories
router.get('/categories', authenticate, requireBusiness, async (req, res, next) => {
  try {
    const categories = await query(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status != 'archived') AS product_count
       FROM categories c WHERE c.business_id = ? ORDER BY c.name ASC`,
      [req.businessId]
    );
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/categories',
  authenticate,
  requireBusiness,
  requirePermission('products.create'),
  [body('name').trim().notEmpty().withMessage('Category name is required')],
  validateRequest,
  async (req, res, next) => {
    try {
      const { name, description = '' } = req.body;
      const resInsert = await execute(
        'INSERT INTO categories (business_id, name, description) VALUES (?, ?, ?)',
        [req.businessId, name.trim(), description]
      );
      const category = await queryOne('SELECT * FROM categories WHERE id = ?', [resInsert.insertId]);
      res.status(201).json({ category });
    } catch (err) {
      next(err);
    }
  }
);

// Products list with branch stock, pagination, search & filters
router.get('/products', authenticate, requireBusiness, requirePermission('products.view'), async (req, res, next) => {
  try {
    const { search = '', category_id = '', status = '', page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, Number(page)) - 1) * Math.min(200, Number(limit));
    const params = [req.branchId || 0, req.businessId];

    let where = 'WHERE p.business_id = ?';
    if (status) {
      where += ' AND p.status = ?';
      params.push(status);
    } else {
      where += " AND p.status != 'archived'";
    }
    if (category_id) {
      where += ' AND p.category_id = ?';
      params.push(Number(category_id));
    }
    if (search.trim()) {
      where += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const products = await query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name,
              COALESCE(i.quantity, 0) AS quantity
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = ?
       ${where}
       ORDER BY p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Math.min(200, Number(limit)), offset]
    );

    const countRow = await queryOne(
      `SELECT COUNT(*) AS total FROM products p ${where}`,
      params.slice(1)
    );

    res.json({
      products,
      total: Number(countRow?.total || 0),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/products/export/csv', authenticate, requireBusiness, requirePermission('products.view'), async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT p.name, p.sku, p.barcode, c.name AS category, p.unit, p.purchase_price, p.selling_price, p.min_stock, COALESCE(i.quantity, 0) AS quantity, p.status
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = ?
       WHERE p.business_id = ? AND p.status != 'archived'
       ORDER BY p.name ASC`,
      [req.branchId || 0, req.businessId]
    );
    const header = 'Name,SKU,Barcode,Category,Unit,PurchasePrice,SellingPrice,MinStock,Quantity,Status';
    const csvLines = rows.map((r) =>
      [r.name, r.sku, r.barcode || '', r.category || '', r.unit, r.purchase_price, r.selling_price, r.min_stock, r.quantity, r.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products-export.csv"');
    res.send([header, ...csvLines].join('\n'));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/products',
  authenticate,
  requireBusiness,
  requirePermission('products.create'),
  imageUpload.single('image'),
  [
    body('name').trim().notEmpty().withMessage('Product name is required'),
    body('sku').trim().notEmpty().withMessage('SKU is required'),
    body('selling_price').isFloat({ min: 0 }).withMessage('Valid selling price is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      if (req.file && (!verifyFileNonEmpty(req.file) || !verifyImageSignature(req.file.path))) {
        cleanupMulterFiles(req);
        return res.status(400).json({ error: 'Invalid or empty product image. Allowed: JPG, JPEG, PNG, or WEBP (max 5MB).' });
      }
      const {
        name,
        sku,
        barcode = '',
        category_id = null,
        supplier_id = null,
        description = '',
        unit = 'pcs',
        purchase_price = 0,
        selling_price,
        quantity = 0,
        min_stock = 5,
      } = req.body;

      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

      const productId = await transaction(async (tx) => {
        const pRes = await tx.execute(
          `INSERT INTO products (business_id, category_id, supplier_id, name, sku, barcode, description, unit, purchase_price, selling_price, min_stock, image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.businessId,
            category_id ? Number(category_id) : null,
            supplier_id ? Number(supplier_id) : null,
            name.trim(),
            sku.trim().toUpperCase(),
            barcode.trim() || null,
            description,
            unit,
            Number(purchase_price || 0),
            Number(selling_price),
            Number(min_stock || 5),
            imageUrl,
          ]
        );
        const newProductId = pRes.insertId;
        const branches = await tx.query('SELECT id FROM branches WHERE business_id = ?', [req.businessId]);
        const initQty = Math.max(0, parseInt(quantity || 0, 10));

        for (const b of branches) {
          const branchQty = b.id === req.branchId ? initQty : 0;
          await tx.execute(
            'INSERT INTO inventory (business_id, branch_id, product_id, quantity) VALUES (?, ?, ?, ?)',
            [req.businessId, b.id, newProductId, branchQty]
          );
          if (b.id === req.branchId && initQty > 0) {
            await tx.execute(
              `INSERT INTO stock_movements (business_id, branch_id, product_id, movement_type, quantity_change, previous_quantity, new_quantity, reason, user_id)
               VALUES (?, ?, ?, 'initial', ?, 0, ?, 'Initial product stock', ?)`,
              [req.businessId, b.id, newProductId, initQty, initQty, req.user.id]
            );
          }
        }
        return newProductId;
      });

      await logAudit({
        businessId: req.businessId,
        branchId: req.branchId,
        userId: req.user.id,
        action: 'product.created',
        entityType: 'product',
        entityId: productId,
        changes: { name, sku, selling_price },
      });

      invalidatePrefix('public:businesses:');
      const created = await queryOne('SELECT * FROM products WHERE id = ?', [productId]);
      res.status(201).json({ product: created });
    } catch (err) {
      cleanupMulterFiles(req);
      next(err);
    }
  }
);

router.put(
  '/products/:id',
  authenticate,
  requireBusiness,
  requirePermission('products.update'),
  imageUpload.single('image'),
  async (req, res, next) => {
    try {
      if (req.file && (!verifyFileNonEmpty(req.file) || !verifyImageSignature(req.file.path))) {
        cleanupMulterFiles(req);
        return res.status(400).json({ error: 'Invalid or empty product image. Allowed: JPG, JPEG, PNG, or WEBP (max 5MB).' });
      }
      const existing = await queryOne('SELECT * FROM products WHERE id = ? AND business_id = ?', [
        req.params.id,
        req.businessId,
      ]);
      if (!existing) {
        cleanupMulterFiles(req);
        return res.status(404).json({ error: 'Product not found' });
      }

      const {
        name,
        sku,
        barcode,
        category_id,
        supplier_id,
        description,
        unit,
        purchase_price,
        selling_price,
        min_stock,
        status,
      } = req.body;
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : existing.image_url;

      await execute(
        `UPDATE products SET
           name = COALESCE(?, name),
           sku = COALESCE(?, sku),
           barcode = ?,
           category_id = ?,
           supplier_id = ?,
           description = COALESCE(?, description),
           unit = COALESCE(?, unit),
           purchase_price = COALESCE(?, purchase_price),
           selling_price = COALESCE(?, selling_price),
           min_stock = COALESCE(?, min_stock),
           status = COALESCE(?, status),
           image_url = ?,
           updated_at = datetime('now')
         WHERE id = ? AND business_id = ?`,
        [
          name,
          sku ? sku.toUpperCase() : null,
          barcode !== undefined ? barcode : existing.barcode,
          category_id !== undefined ? (category_id ? Number(category_id) : null) : existing.category_id,
          supplier_id !== undefined ? (supplier_id ? Number(supplier_id) : null) : existing.supplier_id,
          description,
          unit,
          purchase_price !== undefined ? Number(purchase_price) : null,
          selling_price !== undefined ? Number(selling_price) : null,
          min_stock !== undefined ? Number(min_stock) : null,
          status,
          imageUrl,
          req.params.id,
          req.businessId,
        ]
      );

      if (req.file && existing.image_url && existing.image_url !== imageUrl) {
        removeUploadedFile(existing.image_url);
      }
      invalidatePrefix('public:businesses:');

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'product.updated',
        entityType: 'product',
        entityId: req.params.id,
      });

      const updated = await queryOne('SELECT * FROM products WHERE id = ?', [req.params.id]);
      res.json({ product: updated });
    } catch (err) {
      cleanupMulterFiles(req);
      next(err);
    }
  }
);

router.delete(
  '/products/:id',
  authenticate,
  requireBusiness,
  requirePermission('products.delete'),
  async (req, res, next) => {
    try {
      const existing = await queryOne('SELECT id FROM products WHERE id = ? AND business_id = ?', [
        req.params.id,
        req.businessId,
      ]);
      if (!existing) return res.status(404).json({ error: 'Product not found' });
      await execute(`UPDATE products SET status = 'archived' WHERE id = ? AND business_id = ?`, [
        req.params.id,
        req.businessId,
      ]);
      invalidatePrefix('public:businesses:');
      res.json({ message: 'Product archived' });
    } catch (err) {
      next(err);
    }
  }
);

// Inventory & Movements
router.get('/inventory', authenticate, requireBusiness, requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const branchId = req.branchId;
    const items = await query(
      `SELECT i.id, i.branch_id, i.product_id, i.quantity, i.updated_at,
              p.name, p.sku, p.barcode, p.unit, p.purchase_price, p.selling_price, p.min_stock, p.status,
              c.name AS category_name, b.name AS branch_name
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       JOIN branches b ON b.id = i.branch_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE i.business_id = ? AND i.branch_id = ? AND p.status = 'active'
       ORDER BY i.quantity ASC, p.name ASC`,
      [req.businessId, branchId]
    );

    const lowStock = items.filter((item) => item.quantity > 0 && item.quantity <= item.min_stock);
    const outOfStock = items.filter((item) => item.quantity <= 0);
    const valuation = items.reduce((acc, item) => acc + Number(item.quantity) * Number(item.purchase_price), 0);

    res.json({ items, lowStockCount: lowStock.length, outOfStockCount: outOfStock.length, valuation });
  } catch (err) {
    next(err);
  }
});

router.get('/stock-movements', authenticate, requireBusiness, requirePermission('inventory.view'), async (req, res, next) => {
  try {
    const movements = await query(
      `SELECT sm.*, p.name AS product_name, p.sku, b.name AS branch_name, u.full_name AS user_name
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       JOIN branches b ON b.id = sm.branch_id
       LEFT JOIN users u ON u.id = sm.user_id
       WHERE sm.business_id = ? AND (? = 1 OR sm.branch_id = ?)
       ORDER BY sm.id DESC LIMIT 150`,
      [req.businessId, req.membership.all_branches_access ? 1 : 0, req.branchId]
    );
    res.json({ movements });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/inventory/adjust',
  authenticate,
  requireBusiness,
  requirePermission('inventory.manage'),
  [
    body('product_id').isInt().withMessage('Product is required'),
    body('adjustment_type').isIn(['add', 'reduce', 'damaged', 'returned']).withMessage('Invalid adjustment type'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('reason').trim().notEmpty().withMessage('Reason is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { product_id, adjustment_type, quantity, reason } = req.body;
      const qty = parseInt(quantity, 10);
      const isDeduction = adjustment_type === 'reduce' || adjustment_type === 'damaged';

      const result = await transaction(async (tx) => {
        const inv = await tx.queryOne(
          'SELECT id, quantity FROM inventory WHERE business_id = ? AND branch_id = ? AND product_id = ?',
          [req.businessId, req.branchId, product_id]
        );
        if (!inv) throw Object.assign(new Error('Inventory record not found for branch'), { statusCode: 404 });

        const prevQty = Number(inv.quantity);
        if (isDeduction && prevQty < qty) {
          throw Object.assign(new Error(`Insufficient stock (${prevQty} available)`), { statusCode: 400 });
        }

        const delta = isDeduction ? -qty : qty;
        const newQty = prevQty + delta;

        await tx.execute(
          `UPDATE inventory SET quantity = ?, updated_at = datetime('now') WHERE id = ?`,
          [newQty, inv.id]
        );

        const moveMap = {
          add: 'adjustment_add',
          reduce: 'adjustment_reduce',
          damaged: 'damaged',
          returned: 'refund_return',
        };

        await tx.execute(
          `INSERT INTO stock_movements (business_id, branch_id, product_id, movement_type, quantity_change, previous_quantity, new_quantity, reason, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.businessId, req.branchId, product_id, moveMap[adjustment_type], delta, prevQty, newQty, reason.trim(), req.user.id]
        );

        return { prevQty, newQty };
      });

      const prod = await queryOne('SELECT name, min_stock FROM products WHERE id = ?', [product_id]);
      if (prod && result.newQty <= prod.min_stock) {
        await notifyBusinessManagers(
          req.businessId,
          result.newQty === 0 ? 'out_of_stock' : 'low_inventory',
          result.newQty === 0 ? `Out of stock: ${prod.name}` : `Low stock: ${prod.name}`,
          `${prod.name} now has ${result.newQty} units remaining.`,
          '/app/inventory'
        );
      }

      emitToBusiness(req.businessId, 'inventory:updated', { product_id, branch_id: req.branchId, quantity: result.newQty });
      await logAudit({
        businessId: req.businessId,
        branchId: req.branchId,
        userId: req.user.id,
        action: `inventory.${adjustment_type}`,
        entityType: 'product',
        entityId: product_id,
        changes: { quantity: qty, reason, ...result },
      });

      res.json({ message: 'Stock adjusted and movement logged', ...result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/inventory/transfer',
  authenticate,
  requireBusiness,
  requirePermission('inventory.manage'),
  [
    body('from_branch_id').isInt().withMessage('Source branch required'),
    body('to_branch_id').isInt().withMessage('Destination branch required'),
    body('product_id').isInt().withMessage('Product required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { from_branch_id, to_branch_id, product_id, quantity, notes = '' } = req.body;
      if (Number(from_branch_id) === Number(to_branch_id)) {
        return res.status(400).json({ error: 'Source and destination branches must be different' });
      }
      const qty = parseInt(quantity, 10);

      const transferRef = `TRF-${Date.now().toString().slice(-6)}`;
      await transaction(async (tx) => {
        const srcBranch = await tx.queryOne('SELECT id, name FROM branches WHERE id = ? AND business_id = ?', [from_branch_id, req.businessId]);
        const dstBranch = await tx.queryOne('SELECT id, name FROM branches WHERE id = ? AND business_id = ?', [to_branch_id, req.businessId]);
        if (!srcBranch || !dstBranch) {
          throw Object.assign(new Error('Invalid branch selection for this business'), { statusCode: 403 });
        }

        const srcInv = await tx.queryOne(
          'SELECT id, quantity FROM inventory WHERE business_id = ? AND branch_id = ? AND product_id = ?',
          [req.businessId, from_branch_id, product_id]
        );
        if (!srcInv || srcInv.quantity < qty) {
          throw Object.assign(new Error(`Insufficient stock in ${srcBranch.name}`), { statusCode: 400 });
        }

        const updSrc = await tx.execute(
          `UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now')
           WHERE business_id = ? AND branch_id = ? AND product_id = ? AND quantity >= ?`,
          [qty, req.businessId, from_branch_id, product_id, qty]
        );
        if (updSrc.affectedRows === 0) {
          throw Object.assign(new Error('Concurrent stock conflict during transfer'), { statusCode: 409 });
        }

        let dstInv = await tx.queryOne(
          'SELECT id, quantity FROM inventory WHERE business_id = ? AND branch_id = ? AND product_id = ?',
          [req.businessId, to_branch_id, product_id]
        );
        const dstPrev = dstInv ? Number(dstInv.quantity) : 0;
        if (dstInv) {
          await tx.execute(
            `UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`,
            [qty, dstInv.id]
          );
        } else {
          await tx.execute(
            'INSERT INTO inventory (business_id, branch_id, product_id, quantity) VALUES (?, ?, ?, ?)',
            [req.businessId, to_branch_id, product_id, qty]
          );
        }

        const trfRes = await tx.execute(
          `INSERT INTO stock_transfers (business_id, from_branch_id, to_branch_id, reference_number, status, notes, created_by_user_id)
           VALUES (?, ?, ?, ?, 'completed', ?, ?)`,
          [req.businessId, from_branch_id, to_branch_id, transferRef, notes, req.user.id]
        );
        await tx.execute(
          'INSERT INTO stock_transfer_items (stock_transfer_id, product_id, quantity) VALUES (?, ?, ?)',
          [trfRes.insertId, product_id, qty]
        );

        await tx.execute(
          `INSERT INTO stock_movements (business_id, branch_id, product_id, movement_type, quantity_change, previous_quantity, new_quantity, reason, related_type, related_id, user_id)
           VALUES (?, ?, ?, 'transfer_out', ?, ?, ?, ?, 'stock_transfer', ?, ?)`,
          [req.businessId, from_branch_id, product_id, -qty, srcInv.quantity, srcInv.quantity - qty, `Transfer to ${dstBranch.name}`, trfRes.insertId, req.user.id]
        );
        await tx.execute(
          `INSERT INTO stock_movements (business_id, branch_id, product_id, movement_type, quantity_change, previous_quantity, new_quantity, reason, related_type, related_id, user_id)
           VALUES (?, ?, ?, 'transfer_in', ?, ?, ?, ?, 'stock_transfer', ?, ?)`,
          [req.businessId, to_branch_id, product_id, qty, dstPrev, dstPrev + qty, `Transfer from ${srcBranch.name}`, trfRes.insertId, req.user.id]
        );
      });

      emitToBusiness(req.businessId, 'inventory:updated', { product_id });
      res.status(201).json({ message: 'Stock transferred between branches', reference_number: transferRef });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
