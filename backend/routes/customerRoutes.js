import crypto from 'node:crypto';
import express from 'express';
import { body } from 'express-validator';
import { execute, query, queryOne, roundMoney, transaction } from '../config/db.js';
import { authenticate, requireProfileImage } from '../middleware/auth.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { logAudit, notifyBusinessManagers } from '../services/auditService.js';
import { getCached, invalidatePrefix, setCached } from '../services/cacheService.js';
import { sendMail } from '../services/mailService.js';

const router = express.Router();

const PUBLIC_CONFIG_KEYS = [
  'platform_name',
  'platform_logo_url',
  'support_email',
  'support_phone',
  'platform_location',
  'social_facebook_url',
  'social_instagram_url',
  'social_x_url',
  'social_linkedin_url',
  'developer_name',
  'developer_role',
  'developer_bio',
  'developer_email',
  'developer_portfolio_url',
  'developer_github_url',
  'developer_linkedin_url',
];

// ================= PUBLIC PLATFORM CONFIG =================
router.get('/public/platform-config', async (_req, res, next) => {
  try {
    const cached = getCached('public:platform-config');
    if (cached) return res.json({ config: cached });

    const rows = await query('SELECT setting_key, setting_value FROM platform_settings');
    const config = {};
    for (const k of PUBLIC_CONFIG_KEYS) {
      config[k] = '';
    }
    config.platform_name = 'BizTrade Africa';
    config.support_email = 'allofme140@gmail.com';
    config.platform_location = 'KN 4 Ave, Kigali, Rwanda';
    config.developer_role = 'Full Stack Developer';

    for (const row of rows) {
      if (PUBLIC_CONFIG_KEYS.includes(row.setting_key)) {
        config[row.setting_key] = row.setting_value ?? '';
      }
    }
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    setCached('public:platform-config', config, 30_000);
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

// ================= PUBLIC BUSINESS DIRECTORY & STOREFRONT =================
router.get('/public/businesses', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const category = String(req.query.category || '').trim();
    const district = String(req.query.district || '').trim();
    const sort = String(req.query.sort || 'newest').trim().toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(60, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24));
    const offset = (page - 1) * limit;

    const cacheKey = `public:businesses:${q}:${category}:${district}:${sort}:${page}:${limit}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
      return res.json(cached);
    }

    let whereSql = `WHERE b.status = 'active' AND b.is_public_listed = 1 AND b.deleted_at IS NULL`;
    const params = [];

    if (category) {
      whereSql += ' AND b.category = ?';
      params.push(category);
    }
    if (district) {
      whereSql += ' AND b.district = ?';
      params.push(district);
    }
    if (q) {
      whereSql += ` AND (
        LOWER(b.name) LIKE ?
        OR LOWER(b.category) LIKE ?
        OR LOWER(COALESCE(b.description, '')) LIKE ?
        OR LOWER(b.district) LIKE ?
        OR LOWER(COALESCE(b.business_code, '')) LIKE ?
        OR EXISTS (
          SELECT 1 FROM products p
          WHERE p.business_id = b.id AND p.status = 'active'
            AND (LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ?)
        )
      )`;
      const likeQ = `%${q}%`;
      params.push(likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
    }

    const orderBySql =
      sort === 'name'
        ? 'ORDER BY LOWER(b.name) ASC, b.id DESC'
        : sort === 'products'
          ? 'ORDER BY (SELECT COUNT(*) FROM products px WHERE px.business_id = b.id AND px.status = \'active\') DESC, b.id DESC'
          : q
            ? 'ORDER BY CASE WHEN LOWER(b.name) LIKE ? THEN 0 ELSE 1 END, b.id DESC'
            : 'ORDER BY b.id DESC';

    const listSql = `
      SELECT b.id, b.business_code, b.name, b.slug, b.category, b.logo_url, b.description,
             b.country, b.province, b.district, b.physical_address, b.currency_code, b.operating_hours
      FROM businesses b
      ${whereSql}
      ${orderBySql}
      LIMIT ? OFFSET ?
    `;
    const listParams = q && sort !== 'name' && sort !== 'products' ? [...params, `${q}%`, limit, offset] : [...params, limit, offset];

    const [baseBusinesses, countRow, categories, districts] = await Promise.all([
      query(listSql, listParams),
      queryOne(`SELECT COUNT(*) AS total FROM businesses b ${whereSql}`, params),
      query(
        `SELECT DISTINCT category FROM businesses WHERE status = 'active' AND is_public_listed = 1 AND deleted_at IS NULL ORDER BY category ASC`
      ),
      query(
        `SELECT DISTINCT district FROM businesses WHERE status = 'active' AND is_public_listed = 1 AND deleted_at IS NULL AND district IS NOT NULL AND district != '' ORDER BY district ASC`
      ),
    ]);

    let businesses = [];
    if (baseBusinesses.length > 0) {
      const ids = baseBusinesses.map((b) => b.id);
      const placeholders = ids.map(() => '?').join(',');
      const [prodCounts, branchCounts, reviewAggs] = await Promise.all([
        query(
          `SELECT business_id, COUNT(*) AS product_count FROM products WHERE status = 'active' AND business_id IN (${placeholders}) GROUP BY business_id`,
          ids
        ),
        query(
          `SELECT business_id, COUNT(*) AS branch_count FROM branches WHERE is_active = 1 AND business_id IN (${placeholders}) GROUP BY business_id`,
          ids
        ),
        query(
          `SELECT business_id, ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS review_count FROM product_reviews WHERE business_id IN (${placeholders}) GROUP BY business_id`,
          ids
        ),
      ]);
      const pMap = new Map(prodCounts.map((r) => [r.business_id, Number(r.product_count || 0)]));
      const bMap = new Map(branchCounts.map((r) => [r.business_id, Number(r.branch_count || 0)]));
      const rMap = new Map(reviewAggs.map((r) => [r.business_id, { avg_rating: r.avg_rating, review_count: Number(r.review_count || 0) }]));

      businesses = baseBusinesses.map((b) => {
        const rev = rMap.get(b.id);
        return {
          ...b,
          product_count: pMap.get(b.id) || 0,
          branch_count: bMap.get(b.id) || 0,
          avg_rating: rev?.avg_rating ?? null,
          review_count: rev?.review_count || 0,
        };
      });
    }

    const total = Number(countRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const payload = {
      businesses,
      categories: categories.map((c) => c.category),
      districts: districts.map((d) => d.district),
      total,
      page,
      limit,
      totalPages,
    };
    setCached(cacheKey, payload, 15_000);
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get('/public/businesses/:slug', async (req, res, next) => {
  try {
    const business = await queryOne(
      `SELECT id, business_code, name, slug, category, logo_url, description, email, phone, phone_on_whatsapp,
              country, province, district, physical_address, currency_code, tax_enabled, default_tax_rate,
              operating_hours
       FROM businesses
       WHERE slug = ? AND status = 'active' AND is_public_listed = 1 AND deleted_at IS NULL`,
      [req.params.slug]
    );
    if (!business) {
      return res.status(404).json({ error: 'Business not found or not publicly listed' });
    }

    const [branches, products, reviews, videos, vacancies, reviewSetting] = await Promise.all([
      query(
        `SELECT id, name, code, province, district, address, phone, is_main
         FROM branches WHERE business_id = ? AND is_active = 1 ORDER BY is_main DESC, id ASC`,
        [business.id]
      ),
      // Public catalog intentionally hides cost/purchase_price and private exact warehouse stock counts
      query(
        `SELECT p.id, p.name, p.sku, p.description, p.unit, p.selling_price, p.image_url,
                c.name AS category_name,
                CASE WHEN COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.product_id = p.id), 0) > 0 THEN 1 ELSE 0 END AS in_stock
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.business_id = ? AND p.status = 'active'
         ORDER BY p.id DESC`,
        [business.id]
      ),
      query(
        `SELECT pr.id, pr.product_id, pr.rating, pr.comment, pr.created_at,
                u.full_name AS customer_name, u.avatar_url AS customer_avatar,
                p.name AS product_name
         FROM product_reviews pr
         JOIN users u ON u.id = pr.user_id
         LEFT JOIN products p ON p.id = pr.product_id
         WHERE pr.business_id = ?
         ORDER BY pr.id DESC LIMIT 30`,
        [business.id]
      ),
      query(
        `SELECT bv.id, bv.business_id, bv.product_id, bv.title, bv.description,
                bv.video_mime_type, bv.file_size_bytes, bv.thumbnail_url, bv.is_published, bv.published_at, bv.created_at,
                p.name AS product_name, p.selling_price AS product_price
         FROM business_videos bv
         LEFT JOIN products p ON p.id = bv.product_id
         WHERE bv.business_id = ? AND bv.is_published = 1
         ORDER BY COALESCE(bv.published_at, bv.created_at) DESC, bv.id DESC`,
        [business.id]
      ),
      query(
        `SELECT id, title, slug, department, employment_type, work_mode, location, application_deadline, positions_count, published_at
         FROM job_vacancies
         WHERE business_id = ? AND status = 'published'
         ORDER BY COALESCE(published_at, created_at) DESC, id DESC`,
        [business.id]
      ),
      queryOne(`SELECT setting_value FROM platform_settings WHERE setting_key = 'allow_customer_reviews'`),
    ]);

    res.json({
      business,
      branches,
      products,
      reviews,
      vacancies,
      videos: videos.map((v) => ({
        ...v,
        is_published: true,
        stream_url: `/api/public/videos/${v.id}/stream`,
      })),
      allow_customer_reviews: reviewSetting ? reviewSetting.setting_value !== '0' : true,
    });
  } catch (err) {
    next(err);
  }
});

// ================= CUSTOMER ACCOUNT PORTAL =================
router.get('/customer/profile', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    let profile = await queryOne('SELECT * FROM customer_profiles WHERE user_id = ?', [req.user.id]);
    if (!profile) {
      await execute('INSERT INTO customer_profiles (user_id) VALUES (?)', [req.user.id]);
      profile = await queryOne('SELECT * FROM customer_profiles WHERE user_id = ?', [req.user.id]);
    }
    res.json({ user: req.user, profile });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/customer/profile',
  authenticate,
  requireProfileImage,
  [
    body('full_name').optional().trim().isLength({ min: 2, max: 140 }),
    body('phone').optional().trim().matches(/^\+?[0-9\s-]{8,20}$/),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { full_name, phone, default_address, city, country, preferred_currency, notes } = req.body;
      if (full_name || phone) {
        await execute(
          `UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), updated_at = datetime('now') WHERE id = ?`,
          [full_name?.trim() || null, phone?.trim() || null, req.user.id]
        );
      }

      const existing = await queryOne('SELECT id FROM customer_profiles WHERE user_id = ?', [req.user.id]);
      if (!existing) {
        await execute(
          `INSERT INTO customer_profiles (user_id, default_address, city, country, preferred_currency, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [req.user.id, default_address || null, city || null, country || 'Rwanda', preferred_currency || 'RWF', notes || null]
        );
      } else {
        await execute(
          `UPDATE customer_profiles SET
             default_address = COALESCE(?, default_address),
             city = COALESCE(?, city),
             country = COALESCE(?, country),
             preferred_currency = COALESCE(?, preferred_currency),
             notes = COALESCE(?, notes),
             updated_at = datetime('now')
           WHERE user_id = ?`,
          [default_address ?? null, city ?? null, country ?? null, preferred_currency ?? null, notes ?? null, req.user.id]
        );
      }

      const user = await queryOne(
        'SELECT id, full_name, email, phone, avatar_url, is_email_verified, is_platform_admin FROM users WHERE id = ?',
        [req.user.id]
      );
      const profile = await queryOne('SELECT * FROM customer_profiles WHERE user_id = ?', [req.user.id]);
      res.json({ message: 'Customer profile updated', user, profile });
    } catch (err) {
      next(err);
    }
  }
);

// Customer's own orders only
router.get('/customer/orders', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const orders = await query(
      `SELECT o.*, b.name AS business_name, b.slug AS business_slug, b.currency_code, br.name AS branch_name
       FROM orders o
       JOIN businesses b ON b.id = o.business_id
       LEFT JOIN branches br ON br.id = o.branch_id
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.customer_user_id = ? OR c.user_id = ?
       ORDER BY o.id DESC LIMIT 100`,
      [req.user.id, req.user.id]
    );

    if (orders.length > 0) {
      const ids = orders.map((o) => o.id);
      const placeholders = ids.map(() => '?').join(',');
      const [allItems, allHistory] = await Promise.all([
        query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, ids),
        query(
          `SELECT order_id, old_status, new_status, note, created_at FROM order_status_history WHERE order_id IN (${placeholders}) ORDER BY id ASC`,
          ids
        ),
      ]);
      const itemsByOrder = new Map();
      const histByOrder = new Map();
      for (const it of allItems) {
        if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
        itemsByOrder.get(it.order_id).push(it);
      }
      for (const h of allHistory) {
        if (!histByOrder.has(h.order_id)) histByOrder.set(h.order_id, []);
        histByOrder.get(h.order_id).push(h);
      }
      for (const o of orders) {
        o.items = itemsByOrder.get(o.id) || [];
        o.history = histByOrder.get(o.id) || [];
      }
    }
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// Authenticated customer places an order with a publicly listed active business
router.post(
  '/customer/orders',
  authenticate,
  requireProfileImage,
  [
    body('business_id').isInt({ gt: 0 }).withMessage('Valid business is required'),
    body('items').isArray({ min: 1 }).withMessage('Order must include at least one item'),
    body('items.*.product_id').isInt({ gt: 0 }).withMessage('Valid product ID is required for every order item'),
    body('items.*.quantity').isInt({ min: 1, max: 10000 }).withMessage('Order item quantity must be at least 1'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { business_id, branch_id = null, delivery_address = '', notes = '', items, idempotency_key = null } = req.body;
      const cleanIdempotency = idempotency_key ? String(idempotency_key).trim().slice(0, 120) : null;

      if (cleanIdempotency) {
        const existingOrder = await queryOne(
          'SELECT * FROM orders WHERE business_id = ? AND idempotency_key = ?',
          [business_id, cleanIdempotency]
        );
        if (existingOrder) {
          return res.status(200).json({ order: existingOrder, message: `Order ${existingOrder.order_number} already placed.` });
        }
      }

      const business = await queryOne(
        `SELECT * FROM businesses WHERE id = ? AND status = 'active' AND is_public_listed = 1 AND deleted_at IS NULL`,
        [business_id]
      );
      if (!business) {
        return res.status(404).json({ error: 'Business is unavailable for customer ordering' });
      }

      const branch = branch_id
        ? await queryOne('SELECT * FROM branches WHERE id = ? AND business_id = ? AND is_active = 1', [branch_id, business.id])
        : await queryOne('SELECT * FROM branches WHERE business_id = ? AND is_active = 1 ORDER BY is_main DESC, id ASC LIMIT 1', [business.id]);
      if (!branch) {
        return res.status(400).json({ error: 'No active branch available for this business' });
      }

      const outcome = await transaction(async (tx) => {
        let total = 0;
        const resolved = [];
        for (const item of items) {
          const qty = Math.max(1, parseInt(item.quantity || 1, 10));
          const prod = await tx.queryOne(
            `SELECT id, name, selling_price FROM products WHERE id = ? AND business_id = ? AND status = 'active'`,
            [item.product_id, business.id]
          );
          if (!prod) {
            throw Object.assign(new Error(`Product #${item.product_id} is unavailable`), { statusCode: 400 });
          }
          const lineTotal = roundMoney(Number(prod.selling_price) * qty);
          total = roundMoney(total + lineTotal);
          resolved.push({
            product_id: prod.id,
            product_name: prod.name,
            quantity: qty,
            unit_price: Number(prod.selling_price),
          });
        }

        // Link or create customer CRM record for this business so business staff can fulfill cleanly
        let cust = await tx.queryOne(
          'SELECT id FROM customers WHERE business_id = ? AND (user_id = ? OR email = ?)',
          [business.id, req.user.id, req.user.email]
        );
        if (!cust) {
          const cRes = await tx.execute(
            `INSERT INTO customers (business_id, user_id, full_name, phone, email, address, customer_type)
             VALUES (?, ?, ?, ?, ?, ?, 'retail')`,
            [business.id, req.user.id, req.user.full_name, req.user.phone, req.user.email, delivery_address || '']
          );
          cust = { id: cRes.insertId };
        } else {
          await tx.execute('UPDATE customers SET user_id = COALESCE(user_id, ?) WHERE id = ?', [req.user.id, cust.id]);
        }

        const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${crypto.randomBytes(1).toString('hex').toUpperCase()}`;
        const ordRes = await tx.execute(
          `INSERT INTO orders (business_id, branch_id, customer_id, customer_user_id, order_number, idempotency_key, customer_name, customer_phone, delivery_address, total_amount, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            business.id,
            branch.id,
            cust.id,
            req.user.id,
            orderNumber,
            cleanIdempotency,
            req.user.full_name,
            req.user.phone,
            delivery_address || '',
            total,
            notes || '',
          ]
        );

        for (const r of resolved) {
          await tx.execute(
            `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
             VALUES (?, ?, ?, ?, ?)`,
            [ordRes.insertId, r.product_id, r.product_name, r.quantity, r.unit_price]
          );
        }

        await tx.execute(
          `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by_user_id, note)
           VALUES (?, NULL, 'pending', ?, 'Order placed via Customer Portal')`,
          [ordRes.insertId, req.user.id]
        );

        return { orderId: ordRes.insertId, orderNumber, total };
      });

      await notifyBusinessManagers(
        business.id,
        'new_customer_order',
        `New customer order ${outcome.orderNumber}`,
        `${req.user.full_name} placed an order totaling ${outcome.total} ${business.currency_code}.`,
        '/app/orders'
      );

      await logAudit({
        businessId: business.id,
        branchId: branch.id,
        userId: req.user.id,
        action: 'customer.order_placed',
        entityType: 'order',
        entityId: outcome.orderId,
        changes: { orderNumber: outcome.orderNumber, total: outcome.total },
        ipAddress: req.ip,
      });

      const created = await queryOne('SELECT * FROM orders WHERE id = ?', [outcome.orderId]);
      res.status(201).json({ order: created, message: `Order ${outcome.orderNumber} placed successfully.` });
    } catch (err) {
      next(err);
    }
  }
);

// Customer's own receipts (never exposes other customers' sales or receipts)
router.get('/customer/receipts', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const receipts = await query(
      `SELECT r.id, r.receipt_number, r.payload_json, r.created_at,
              s.reference_number, s.total_amount, s.amount_paid, s.payment_status, s.created_at AS sale_date,
              b.name AS business_name, b.currency_code
       FROM receipts r
       JOIN sales s ON s.id = r.sale_id
       JOIN customers c ON c.id = s.customer_id
       JOIN businesses b ON b.id = s.business_id
       WHERE c.user_id = ?
       ORDER BY r.id DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({
      receipts: receipts.map((r) => ({
        ...r,
        payload: r.payload_json ? JSON.parse(r.payload_json) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Submit product or business review (where platform allows reviews)
router.post(
  '/customer/businesses/:businessId/reviews',
  authenticate,
  requireProfileImage,
  [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment').trim().isLength({ min: 3, max: 800 }).withMessage('Review comment is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const reviewSetting = await queryOne(
        `SELECT setting_value FROM platform_settings WHERE setting_key = 'allow_customer_reviews'`
      );
      if (reviewSetting && reviewSetting.setting_value === '0') {
        return res.status(403).json({ error: 'Customer reviews are currently disabled by platform policy' });
      }

      const business = await queryOne(
        `SELECT id, name FROM businesses WHERE id = ? AND status = 'active' AND is_public_listed = 1 AND deleted_at IS NULL`,
        [req.params.businessId]
      );
      if (!business) return res.status(404).json({ error: 'Business not found' });

      const { rating, comment, product_id = null } = req.body;
      const r = await execute(
        `INSERT INTO product_reviews (business_id, product_id, user_id, rating, comment) VALUES (?, ?, ?, ?, ?)`,
        [business.id, product_id || null, req.user.id, Number(rating), comment.trim()]
      );

      await logAudit({
        businessId: business.id,
        userId: req.user.id,
        action: 'customer.review_submitted',
        entityType: 'product_review',
        entityId: r.insertId,
        changes: { rating },
      });

      invalidatePrefix('public:businesses:');

      res.status(201).json({ id: r.insertId, message: 'Thank you for submitting your review.' });
    } catch (err) {
      next(err);
    }
  }
);

// Contact a listed business directly
router.post(
  '/customer/businesses/:businessId/contact',
  authenticate,
  requireProfileImage,
  [body('message').trim().isLength({ min: 3, max: 1500 }).withMessage('Message is required')],
  validateRequest,
  async (req, res, next) => {
    try {
      const business = await queryOne(
        `SELECT id, name, email FROM businesses WHERE id = ? AND status = 'active' AND is_public_listed = 1 AND deleted_at IS NULL`,
        [req.params.businessId]
      );
      if (!business) return res.status(404).json({ error: 'Business not found' });

      const r = await execute(
        `INSERT INTO contact_inquiries (business_id, user_id, full_name, email, phone, business_name, message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [business.id, req.user.id, req.user.full_name, req.user.email, req.user.phone, business.name, req.body.message.trim()]
      );

      await notifyBusinessManagers(
        business.id,
        'customer_inquiry',
        `Customer message from ${req.user.full_name}`,
        req.body.message.trim().slice(0, 160),
        '/app/customers'
      );

      const recipients = Array.from(new Set(['allofme140@gmail.com', business.email].filter(Boolean))).join(',');
      void sendMail({
        to: recipients,
        replyTo: req.user.email,
        subject: `Customer Inquiry for ${business.name} from ${req.user.full_name}`,
        text: `Business: ${business.name}\nCustomer: ${req.user.full_name} (${req.user.email} · ${req.user.phone})\n\nMessage:\n${req.body.message.trim()}`,
      });

      res.status(201).json({ id: r.insertId, message: `Message sent to ${business.name}.` });
    } catch (err) {
      next(err);
    }
  }
);

// Customer account history summary (own orders, reviews, inquiries, login history)
router.get('/customer/history', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const reviews = await query(
      `SELECT pr.*, b.name AS business_name, p.name AS product_name
       FROM product_reviews pr
       JOIN businesses b ON b.id = pr.business_id
       LEFT JOIN products p ON p.id = pr.product_id
       WHERE pr.user_id = ? ORDER BY pr.id DESC LIMIT 50`,
      [req.user.id]
    );
    const inquiries = await query(
      `SELECT ci.*, b.name AS target_business_name
       FROM contact_inquiries ci
       LEFT JOIN businesses b ON b.id = ci.business_id
       WHERE ci.user_id = ? ORDER BY ci.id DESC LIMIT 50`,
      [req.user.id]
    );
    const logins = await query(
      `SELECT ip_address, was_successful, user_agent, created_at
       FROM login_attempts WHERE email = ? ORDER BY id DESC LIMIT 15`,
      [req.user.email]
    );
    res.json({ reviews, inquiries, logins });
  } catch (err) {
    next(err);
  }
});

export default router;
