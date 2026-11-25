import express from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireBusiness } from '../middleware/tenant.js';
import { getCached, setCached } from '../services/cacheService.js';

const router = express.Router();

// ================= PUBLIC GLOBAL SEARCH ENGINE =================
router.get('/public/search', async (req, res, next) => {
  const started = performance.now();
  try {
    const rawQ = String(req.query.q || '').trim();
    const q = rawQ.toLowerCase();
    const limit = Math.min(12, Math.max(2, parseInt(String(req.query.limit || '6'), 10) || 6));

    if (!q || q.length < 1) {
      return res.json({
        query: '',
        businesses: [],
        products: [],
        jobs: [],
        videos: [],
        elapsed_ms: 0,
      });
    }

    const cacheKey = `public:search:${q}:${limit}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const contains = `%${q}%`;
    const prefix = `${q}%`;

    const [businesses, products, jobs, videos] = await Promise.all([
      query(
        `SELECT b.id, b.business_code, b.name, b.slug, b.category, b.district, b.province, b.logo_url
         FROM businesses b
         WHERE b.status = 'active'
           AND b.is_public_listed = 1
           AND b.deleted_at IS NULL
           AND (
             LOWER(b.name) LIKE ?
             OR LOWER(b.category) LIKE ?
             OR LOWER(COALESCE(b.district, '')) LIKE ?
             OR LOWER(COALESCE(b.description, '')) LIKE ?
             OR LOWER(COALESCE(b.business_code, '')) LIKE ?
           )
         ORDER BY
           CASE WHEN LOWER(b.name) LIKE ? THEN 0 ELSE 1 END,
           b.id DESC
         LIMIT ?`,
        [contains, contains, contains, contains, contains, prefix, limit]
      ),
      query(
        `SELECT p.id, p.name, p.sku, p.selling_price, p.unit, p.image_url,
                c.name AS category_name,
                b.id AS business_id, b.name AS business_name, b.slug AS business_slug, b.currency_code
         FROM products p
         JOIN businesses b ON b.id = p.business_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.status = 'active'
           AND b.status = 'active'
           AND b.is_public_listed = 1
           AND b.deleted_at IS NULL
           AND (
             LOWER(p.name) LIKE ?
             OR LOWER(p.sku) LIKE ?
             OR LOWER(COALESCE(p.description, '')) LIKE ?
             OR LOWER(COALESCE(c.name, '')) LIKE ?
           )
         ORDER BY
           CASE WHEN LOWER(p.name) LIKE ? THEN 0 ELSE 1 END,
           p.id DESC
         LIMIT ?`,
        [contains, contains, contains, contains, prefix, limit]
      ),
      query(
        `SELECT v.id, v.title, v.slug, v.department, v.employment_type, v.work_mode, v.location,
                b.name AS business_name, b.slug AS business_slug
         FROM job_vacancies v
         JOIN businesses b ON b.id = v.business_id
         WHERE v.status = 'published'
           AND b.status = 'active'
           AND b.is_public_listed = 1
           AND b.deleted_at IS NULL
           AND (
             LOWER(v.title) LIKE ?
             OR LOWER(COALESCE(v.department, '')) LIKE ?
             OR LOWER(v.location) LIKE ?
             OR LOWER(b.name) LIKE ?
           )
         ORDER BY
           CASE WHEN LOWER(v.title) LIKE ? THEN 0 ELSE 1 END,
           v.id DESC
         LIMIT ?`,
        [contains, contains, contains, contains, prefix, limit]
      ),
      query(
        `SELECT bv.id, bv.title, bv.thumbnail_url,
                b.name AS business_name, b.slug AS business_slug
         FROM business_videos bv
         JOIN businesses b ON b.id = bv.business_id
         WHERE bv.is_published = 1
           AND b.status = 'active'
           AND b.is_public_listed = 1
           AND b.deleted_at IS NULL
           AND (
             LOWER(bv.title) LIKE ?
             OR LOWER(COALESCE(bv.description, '')) LIKE ?
             OR LOWER(b.name) LIKE ?
           )
         ORDER BY bv.id DESC
         LIMIT ?`,
        [contains, contains, contains, Math.min(4, limit)]
      ),
    ]);

    const elapsed_ms = Math.round((performance.now() - started) * 100) / 100;
    const payload = {
      query: rawQ,
      businesses,
      products,
      jobs,
      videos,
      elapsed_ms,
    };
    setCached(cacheKey, payload, 15_000);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// ================= WORKSPACE GLOBAL SEARCH ENGINE =================
router.get('/app/search', authenticate, requireBusiness, async (req, res, next) => {
  const started = performance.now();
  try {
    const rawQ = String(req.query.q || '').trim();
    const q = rawQ.toLowerCase();
    const limit = Math.min(10, Math.max(2, parseInt(String(req.query.limit || '5'), 10) || 5));

    if (!q || q.length < 1) {
      return res.json({
        query: '',
        results: { products: [], customers: [], sales: [], orders: [], suppliers: [], tasks: [] },
        elapsed_ms: 0,
      });
    }

    const isOwnerOrAdmin =
      Boolean(req.user?.is_platform_admin) ||
      ['business_owner', 'business_admin'].includes(req.membership?.role_code);
    const hasPerm = (perm) => isOwnerOrAdmin || (req.permissions || []).includes(perm);
    const branchRestricted =
      !Boolean(req.user?.is_platform_admin) &&
      !isOwnerOrAdmin &&
      !req.membership?.all_branches_access &&
      Boolean(req.branchId);
    const branchId = req.branchId || null;

    const contains = `%${q}%`;
    const prefix = `${q}%`;

    const [products, customers, sales, orders, suppliers, tasks] = await Promise.all([
      hasPerm('products.view')
        ? query(
            `SELECT p.id, p.name, p.sku, p.barcode, p.selling_price, p.status,
                    c.name AS category_name
             FROM products p
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.business_id = ?
               AND (LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(COALESCE(p.barcode, '')) LIKE ?)
             ORDER BY CASE WHEN LOWER(p.name) LIKE ? THEN 0 ELSE 1 END, p.id DESC
             LIMIT ?`,
            [req.businessId, contains, contains, contains, prefix, limit]
          )
        : Promise.resolve([]),
      hasPerm('customers.view')
        ? query(
            `SELECT id, full_name, phone, email, customer_type
             FROM customers
             WHERE business_id = ?
               AND (LOWER(full_name) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(COALESCE(email, '')) LIKE ?)
             ORDER BY CASE WHEN LOWER(full_name) LIKE ? THEN 0 ELSE 1 END, id DESC
             LIMIT ?`,
            [req.businessId, contains, contains, contains, prefix, limit]
          )
        : Promise.resolve([]),
      hasPerm('sales.view')
        ? query(
            `SELECT s.id, s.reference_number, s.total_amount, s.sale_status, s.payment_status, s.created_at,
                    c.full_name AS customer_name
             FROM sales s
             LEFT JOIN customers c ON c.id = s.customer_id
             WHERE s.business_id = ?
               ${branchRestricted ? 'AND s.branch_id = ?' : ''}
               AND (LOWER(s.reference_number) LIKE ? OR LOWER(COALESCE(c.full_name, '')) LIKE ?)
             ORDER BY s.id DESC
             LIMIT ?`,
            branchRestricted
              ? [req.businessId, branchId, contains, contains, limit]
              : [req.businessId, contains, contains, limit]
          )
        : Promise.resolve([]),
      hasPerm('orders.view')
        ? query(
            `SELECT id, order_number, customer_name, customer_phone, total_amount, order_status, created_at
             FROM orders
             WHERE business_id = ?
               ${branchRestricted ? 'AND branch_id = ?' : ''}
               AND (LOWER(order_number) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(customer_phone) LIKE ?)
             ORDER BY id DESC
             LIMIT ?`,
            branchRestricted
              ? [req.businessId, branchId, contains, contains, contains, limit]
              : [req.businessId, contains, contains, contains, limit]
          )
        : Promise.resolve([]),
      hasPerm('suppliers.view')
        ? query(
            `SELECT id, name, phone, email, contact_person
             FROM suppliers
             WHERE business_id = ?
               AND (LOWER(name) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(COALESCE(contact_person, '')) LIKE ?)
             ORDER BY id DESC
             LIMIT ?`,
            [req.businessId, contains, contains, contains, limit]
          )
        : Promise.resolve([]),
      hasPerm('tasks.view')
        ? query(
            `SELECT id, title, status, priority, deadline
             FROM tasks
             WHERE business_id = ?
               AND (LOWER(title) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ?)
             ORDER BY id DESC
             LIMIT ?`,
            [req.businessId, contains, contains, limit]
          )
        : Promise.resolve([]),
    ]);

    const elapsed_ms = Math.round((performance.now() - started) * 100) / 100;
    res.json({
      query: rawQ,
      currency_code: req.business?.currency_code || 'RWF',
      results: { products, customers, sales, orders, suppliers, tasks },
      elapsed_ms,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
