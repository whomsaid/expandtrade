import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { body } from 'express-validator';
import { execute, query, queryOne, transaction } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireBusiness, requirePermission } from '../middleware/tenant.js';
import { cleanupMulterFiles, imageUpload, removeUploadedFile, verifyFileNonEmpty, verifyImageSignature } from '../middleware/upload.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { emitToBusiness, logAudit, notifyBusinessManagers } from '../services/auditService.js';
import { invalidatePrefix } from '../services/cacheService.js';

const router = express.Router();

const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      return cb(null, true);
    }
    const err = new Error('Unsupported file format. Please upload a .csv or .xlsx file.');
    err.statusCode = 400;
    return cb(err);
  },
});

const productImageFields = imageUpload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 8 },
]);

function collectUploadedProductImages(req) {
  const files = [];
  if (req.file) files.push(req.file);
  if (req.files && !Array.isArray(req.files)) {
    if (Array.isArray(req.files.image)) files.push(...req.files.image);
    if (Array.isArray(req.files.images)) files.push(...req.files.images);
  } else if (Array.isArray(req.files)) {
    files.push(...req.files);
  }
  return files;
}

async function attachProductImages(productsList) {
  if (!productsList || productsList.length === 0) return productsList;
  const ids = productsList.map((p) => p.id);
  const placeholders = ids.map(() => '?').join(',');
  const imgs = await query(
    `SELECT id, product_id, image_url, is_primary, sort_order, created_at
     FROM product_images
     WHERE product_id IN (${placeholders})
     ORDER BY is_primary DESC, sort_order ASC, id ASC`,
    ids
  );
  const byProd = new Map();
  for (const img of imgs) {
    if (!byProd.has(img.product_id)) byProd.set(img.product_id, []);
    byProd.get(img.product_id).push({
      ...img,
      is_primary: Boolean(img.is_primary),
    });
  }
  return productsList.map((p) => {
    const gallery = byProd.get(p.id) || (p.image_url ? [{ id: 0, product_id: p.id, image_url: p.image_url, is_primary: true }] : []);
    return { ...p, images: gallery };
  });
}

function normalizeSpreadsheetHeader(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseBulkSpreadsheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rawRows.map((row, idx) => {
    const mapped = {};
    for (const [k, v] of Object.entries(row)) {
      mapped[normalizeSpreadsheetHeader(k)] = typeof v === 'string' ? v.trim() : v;
    }
    return {
      rowNumber: idx + 2,
      name: String(mapped.name || mapped.productname || '').trim(),
      sku: String(mapped.sku || mapped.productcode || '').trim().toUpperCase(),
      barcode: String(mapped.barcode || '').trim(),
      category: String(mapped.category || mapped.categoryname || '').trim(),
      supplier: String(mapped.supplier || mapped.suppliername || '').trim(),
      unit: String(mapped.unit || 'pcs').trim() || 'pcs',
      purchase_price: mapped.purchaseprice !== '' && mapped.purchaseprice !== undefined ? Number(mapped.purchaseprice) : 0,
      selling_price: mapped.sellingprice !== '' && mapped.sellingprice !== undefined ? Number(mapped.sellingprice) : NaN,
      min_stock: mapped.minstock !== '' && mapped.minstock !== undefined ? parseInt(mapped.minstock, 10) : 5,
      quantity: mapped.quantity !== '' && mapped.quantity !== undefined ? parseInt(mapped.quantity, 10) : 0,
      description: String(mapped.description || '').trim(),
    };
  });
}

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

    const enriched = await attachProductImages(products);
    res.json({
      products: enriched,
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

// Download CSV or XLSX Bulk Product Import Template
router.get('/products/import/template', authenticate, requireBusiness, requirePermission('products.create'), async (req, res, next) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
    const sampleRows = [
      {
        Name: 'Arabica Whole Bean Coffee 1kg',
        SKU: 'COF-ARB-1000',
        Barcode: '5901234123457',
        Category: 'Beverages',
        Supplier: '',
        Unit: 'bag',
        PurchasePrice: 8500,
        SellingPrice: 12500,
        MinStock: 10,
        Quantity: 40,
        Description: 'Washed single-origin highland Arabica beans',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    if (format === 'xlsx') {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="bta-products-import-template.xlsx"');
      return res.send(buf);
    }
    const csvStr = XLSX.utils.sheet_to_csv(ws);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bta-products-import-template.csv"');
    return res.send(csvStr);
  } catch (err) {
    next(err);
  }
});

async function validateBulkRows(rows, businessId) {
  const existingProducts = await query('SELECT id, sku FROM products WHERE business_id = ?', [businessId]);
  const existingSkus = new Set(existingProducts.map((p) => String(p.sku || '').trim().toUpperCase()));
  const seenSkus = new Set();

  const evaluated = rows.map((row) => {
    const errors = [];
    if (!row.name) errors.push('Product Name is required');
    if (!row.sku) {
      errors.push('SKU is required');
    } else if (existingSkus.has(row.sku)) {
      errors.push(`SKU ${row.sku} already exists in catalog`);
    } else if (seenSkus.has(row.sku)) {
      errors.push(`Duplicate SKU ${row.sku} inside file`);
    } else {
      seenSkus.add(row.sku);
    }

    if (Number.isNaN(row.selling_price) || row.selling_price < 0) {
      errors.push('SellingPrice must be a valid number >= 0');
    }
    if (Number.isNaN(row.purchase_price) || row.purchase_price < 0) {
      errors.push('PurchasePrice must be >= 0');
    }
    if (Number.isNaN(row.quantity) || row.quantity < 0) {
      errors.push('Quantity must be an integer >= 0');
    }
    if (Number.isNaN(row.min_stock) || row.min_stock < 0) {
      errors.push('MinStock must be an integer >= 0');
    }

    return {
      ...row,
      purchase_price: Number.isNaN(row.purchase_price) ? 0 : row.purchase_price,
      selling_price: Number.isNaN(row.selling_price) ? 0 : row.selling_price,
      min_stock: Number.isNaN(row.min_stock) ? 5 : row.min_stock,
      quantity: Number.isNaN(row.quantity) ? 0 : row.quantity,
      valid: errors.length === 0,
      errors,
    };
  });

  const invalidRows = evaluated.filter((r) => !r.valid);
  let errorCsv = '';
  if (invalidRows.length > 0) {
    const header = 'Row,Name,SKU,SellingPrice,Errors';
    const lines = invalidRows.map((r) =>
      [r.rowNumber, r.name, r.sku, r.selling_price, r.errors.join('; ')]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    errorCsv = [header, ...lines].join('\n');
  }

  return {
    summary: {
      total: evaluated.length,
      valid: evaluated.length - invalidRows.length,
      invalid: invalidRows.length,
    },
    rows: evaluated,
    errorCsv,
  };
}

router.post(
  '/products/import/preview',
  authenticate,
  requireBusiness,
  requirePermission('products.create'),
  spreadsheetUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Please select a CSV or XLSX spreadsheet file to preview.' });
      }
      const parsed = parseBulkSpreadsheet(req.file.buffer);
      if (parsed.length === 0) {
        return res.status(400).json({ error: 'The uploaded spreadsheet contains no product rows.' });
      }
      if (parsed.length > 1000) {
        return res.status(400).json({ error: 'Maximum 1,000 products per bulk import batch.' });
      }
      const report = await validateBulkRows(parsed, req.businessId);
      res.json(report);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/products/import/commit',
  authenticate,
  requireBusiness,
  requirePermission('products.create'),
  [body('rows').isArray({ min: 1 }).withMessage('Validated product rows are required')],
  validateRequest,
  async (req, res, next) => {
    try {
      const incoming = req.body.rows.slice(0, 1000).map((r, idx) => ({
        rowNumber: Number(r.rowNumber || idx + 2),
        name: String(r.name || '').trim(),
        sku: String(r.sku || '').trim().toUpperCase(),
        barcode: String(r.barcode || '').trim(),
        category: String(r.category || '').trim(),
        supplier: String(r.supplier || '').trim(),
        unit: String(r.unit || 'pcs').trim() || 'pcs',
        purchase_price: Number(r.purchase_price || 0),
        selling_price: r.selling_price !== undefined && r.selling_price !== '' ? Number(r.selling_price) : NaN,
        min_stock: r.min_stock !== undefined && r.min_stock !== '' ? parseInt(r.min_stock, 10) : 5,
        quantity: r.quantity !== undefined && r.quantity !== '' ? parseInt(r.quantity, 10) : 0,
        description: String(r.description || '').trim(),
      }));

      const checked = await validateBulkRows(incoming, req.businessId);
      const validRows = checked.rows.filter((r) => r.valid);
      if (validRows.length === 0) {
        return res.status(400).json({
          error: 'No valid product rows to import. Review the validation errors first.',
          summary: checked.summary,
          errorCsv: checked.errorCsv,
        });
      }

      const importedIds = await transaction(async (tx) => {
        const categories = await tx.query('SELECT id, name FROM categories WHERE business_id = ?', [req.businessId]);
        const catMap = new Map(categories.map((c) => [String(c.name).trim().toLowerCase(), c.id]));
        const suppliers = await tx.query('SELECT id, name FROM suppliers WHERE business_id = ?', [req.businessId]);
        const supMap = new Map(suppliers.map((s) => [String(s.name).trim().toLowerCase(), s.id]));
        const branches = await tx.query('SELECT id FROM branches WHERE business_id = ?', [req.businessId]);

        const createdIds = [];
        for (const r of validRows) {
          let categoryId = null;
          if (r.category) {
            const cKey = r.category.toLowerCase();
            if (catMap.has(cKey)) {
              categoryId = catMap.get(cKey);
            } else {
              const cRes = await tx.execute(
                'INSERT INTO categories (business_id, name, description) VALUES (?, ?, ?)',
                [req.businessId, r.category, 'Created via bulk product import']
              );
              categoryId = cRes.insertId;
              catMap.set(cKey, categoryId);
            }
          }
          const supplierId = r.supplier ? supMap.get(r.supplier.toLowerCase()) || null : null;

          const pRes = await tx.execute(
            `INSERT INTO products (business_id, category_id, supplier_id, name, sku, barcode, description, unit, purchase_price, selling_price, min_stock, image_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            [
              req.businessId,
              categoryId,
              supplierId,
              r.name,
              r.sku,
              r.barcode || null,
              r.description || '',
              r.unit,
              r.purchase_price,
              r.selling_price,
              r.min_stock,
            ]
          );
          const productId = pRes.insertId;
          createdIds.push(productId);

          for (const b of branches) {
            const branchQty = b.id === req.branchId ? r.quantity : 0;
            await tx.execute(
              'INSERT INTO inventory (business_id, branch_id, product_id, quantity) VALUES (?, ?, ?, ?)',
              [req.businessId, b.id, productId, branchQty]
            );
            if (b.id === req.branchId && r.quantity > 0) {
              await tx.execute(
                `INSERT INTO stock_movements (business_id, branch_id, product_id, movement_type, quantity_change, previous_quantity, new_quantity, reason, user_id)
                 VALUES (?, ?, ?, 'initial', ?, 0, ?, 'Initial bulk import stock', ?)`,
                [req.businessId, b.id, productId, r.quantity, r.quantity, req.user.id]
              );
            }
          }
        }
        return createdIds;
      });

      await logAudit({
        businessId: req.businessId,
        branchId: req.branchId,
        userId: req.user.id,
        action: 'products.bulk_imported',
        entityType: 'product',
        changes: { imported: importedIds.length, skipped: checked.summary.invalid },
      });
      invalidatePrefix('public:businesses:');

      res.status(201).json({
        message: `${importedIds.length} product(s) imported successfully.`,
        importedCount: importedIds.length,
        skippedCount: checked.summary.invalid,
        errorCsv: checked.errorCsv,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/products',
  authenticate,
  requireBusiness,
  requirePermission('products.create'),
  productImageFields,
  [
    body('name').trim().notEmpty().withMessage('Product name is required'),
    body('sku').trim().notEmpty().withMessage('SKU is required'),
    body('selling_price').isFloat({ min: 0 }).withMessage('Valid selling price is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const uploadedFiles = collectUploadedProductImages(req);
      for (const f of uploadedFiles) {
        if (!verifyFileNonEmpty(f) || !verifyImageSignature(f.path)) {
          cleanupMulterFiles(req);
          return res.status(400).json({ error: 'Invalid or empty product image. Allowed: JPG, JPEG, PNG, or WEBP (max 5MB).' });
        }
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

      const uploadedUrls = uploadedFiles.map((f) => `/uploads/${f.filename}`);
      const primaryUrl = uploadedUrls[0] || null;

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
            primaryUrl,
          ]
        );
        const newProductId = pRes.insertId;
        for (let i = 0; i < uploadedUrls.length; i += 1) {
          await tx.execute(
            `INSERT INTO product_images (product_id, business_id, image_url, is_primary, sort_order)
             VALUES (?, ?, ?, ?, ?)`,
            [newProductId, req.businessId, uploadedUrls[i], i === 0 ? 1 : 0, i]
          );
        }

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
      const [enriched] = await attachProductImages([created]);
      res.status(201).json({ product: enriched });
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
  productImageFields,
  async (req, res, next) => {
    try {
      const uploadedFiles = collectUploadedProductImages(req);
      for (const f of uploadedFiles) {
        if (!verifyFileNonEmpty(f) || !verifyImageSignature(f.path)) {
          cleanupMulterFiles(req);
          return res.status(400).json({ error: 'Invalid or empty product image. Allowed: JPG, JPEG, PNG, or WEBP (max 5MB).' });
        }
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
      const uploadedUrls = uploadedFiles.map((f) => `/uploads/${f.filename}`);
      const existingGallery = await query('SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, id ASC', [
        existing.id,
      ]);
      const nextImageUrl = uploadedUrls[0] && existingGallery.length === 0 && !existing.image_url
        ? uploadedUrls[0]
        : (req.files?.image?.[0] ? `/uploads/${req.files.image[0].filename}` : existing.image_url || uploadedUrls[0] || null);

      await transaction(async (tx) => {
        await tx.execute(
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
            nextImageUrl,
            req.params.id,
            req.businessId,
          ]
        );

        let sortOffset = existingGallery.length;
        for (let i = 0; i < uploadedUrls.length; i += 1) {
          const isPrimary = existingGallery.length === 0 && i === 0 ? 1 : 0;
          await tx.execute(
            `INSERT INTO product_images (product_id, business_id, image_url, is_primary, sort_order)
             VALUES (?, ?, ?, ?, ?)`,
            [existing.id, req.businessId, uploadedUrls[i], isPrimary, sortOffset + i]
          );
        }
      });

      invalidatePrefix('public:businesses:');

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'product.updated',
        entityType: 'product',
        entityId: req.params.id,
      });

      const updated = await queryOne('SELECT * FROM products WHERE id = ?', [req.params.id]);
      const [enriched] = await attachProductImages([updated]);
      res.json({ product: enriched });
    } catch (err) {
      cleanupMulterFiles(req);
      next(err);
    }
  }
);

router.post(
  '/products/:id/images',
  authenticate,
  requireBusiness,
  requirePermission('products.update'),
  imageUpload.array('images', 8),
  async (req, res, next) => {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length === 0) {
        return res.status(400).json({ error: 'Select one or more JPG, PNG, or WEBP product images.' });
      }
      for (const f of files) {
        if (!verifyFileNonEmpty(f) || !verifyImageSignature(f.path)) {
          cleanupMulterFiles(req);
          return res.status(400).json({ error: 'Invalid or empty product image. Allowed: JPG, JPEG, PNG, or WEBP (max 5MB).' });
        }
      }
      const product = await queryOne('SELECT * FROM products WHERE id = ? AND business_id = ?', [
        req.params.id,
        req.businessId,
      ]);
      if (!product) {
        cleanupMulterFiles(req);
        return res.status(404).json({ error: 'Product not found' });
      }

      const existing = await query('SELECT id FROM product_images WHERE product_id = ?', [product.id]);
      await transaction(async (tx) => {
        for (let i = 0; i < files.length; i += 1) {
          const url = `/uploads/${files[i].filename}`;
          const isPrimary = existing.length === 0 && !product.image_url && i === 0 ? 1 : 0;
          await tx.execute(
            `INSERT INTO product_images (product_id, business_id, image_url, is_primary, sort_order)
             VALUES (?, ?, ?, ?, ?)`,
            [product.id, req.businessId, url, isPrimary, existing.length + i]
          );
          if (isPrimary) {
            await tx.execute('UPDATE products SET image_url = ? WHERE id = ?', [url, product.id]);
          }
        }
      });

      invalidatePrefix('public:businesses:');
      const updated = await queryOne('SELECT * FROM products WHERE id = ?', [product.id]);
      const [enriched] = await attachProductImages([updated]);
      res.status(201).json({ product: enriched });
    } catch (err) {
      cleanupMulterFiles(req);
      next(err);
    }
  }
);

router.patch(
  '/products/:id/images/:imageId/primary',
  authenticate,
  requireBusiness,
  requirePermission('products.update'),
  async (req, res, next) => {
    try {
      const img = await queryOne(
        'SELECT * FROM product_images WHERE id = ? AND product_id = ? AND business_id = ?',
        [req.params.imageId, req.params.id, req.businessId]
      );
      if (!img) return res.status(404).json({ error: 'Product image not found' });

      await transaction(async (tx) => {
        await tx.execute('UPDATE product_images SET is_primary = 0 WHERE product_id = ?', [req.params.id]);
        await tx.execute('UPDATE product_images SET is_primary = 1 WHERE id = ?', [img.id]);
        await tx.execute(`UPDATE products SET image_url = ?, updated_at = datetime('now') WHERE id = ?`, [
          img.image_url,
          req.params.id,
        ]);
      });

      invalidatePrefix('public:businesses:');
      const updated = await queryOne('SELECT * FROM products WHERE id = ?', [req.params.id]);
      const [enriched] = await attachProductImages([updated]);
      res.json({ product: enriched });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/products/:id/images/:imageId',
  authenticate,
  requireBusiness,
  requirePermission('products.update'),
  async (req, res, next) => {
    try {
      const img = await queryOne(
        'SELECT * FROM product_images WHERE id = ? AND product_id = ? AND business_id = ?',
        [req.params.imageId, req.params.id, req.businessId]
      );
      if (!img) return res.status(404).json({ error: 'Product image not found' });

      await transaction(async (tx) => {
        await tx.execute('DELETE FROM product_images WHERE id = ?', [img.id]);
        const remaining = await tx.query(
          'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC, id ASC',
          [req.params.id]
        );
        if (img.is_primary) {
          const nextPrimary = remaining[0] || null;
          if (nextPrimary) {
            await tx.execute('UPDATE product_images SET is_primary = 1 WHERE id = ?', [nextPrimary.id]);
            await tx.execute('UPDATE products SET image_url = ? WHERE id = ?', [nextPrimary.image_url, req.params.id]);
          } else {
            await tx.execute('UPDATE products SET image_url = NULL WHERE id = ?', [req.params.id]);
          }
        }
      });

      removeUploadedFile(img.image_url);
      invalidatePrefix('public:businesses:');
      const updated = await queryOne('SELECT * FROM products WHERE id = ?', [req.params.id]);
      const [enriched] = await attachProductImages([updated]);
      res.json({ product: enriched });
    } catch (err) {
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
