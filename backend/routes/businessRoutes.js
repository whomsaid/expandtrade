import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { execute, query, queryOne, transaction } from '../config/db.js';
import { authenticate, requirePlatformAdmin, requireProfileImage } from '../middleware/auth.js';
import { loadMemberPermissions, requireBusiness, requirePermission } from '../middleware/tenant.js';
import { upload } from '../middleware/upload.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { createNotification, logAudit } from '../services/auditService.js';
import { sendMail } from '../services/mailService.js';
import { getCached, setCached } from '../services/cacheService.js';

const ALLOWED_EMPLOYEE_ROLES = ['manager', 'branch_manager', 'accountant', 'cashier', 'salesperson', 'inventory_manager', 'customer_service'];

const router = express.Router();

// List businesses user belongs to
router.get('/businesses', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT b.*, bm.id AS membership_id, bm.assigned_branch_id, bm.all_branches_access,
              r.code AS role_code, r.name AS role_name
       FROM business_members bm
       JOIN businesses b ON b.id = bm.business_id
       JOIN roles r ON r.id = bm.role_id
       WHERE bm.user_id = ? AND bm.status = 'active' AND b.status != 'deleted' AND b.deleted_at IS NULL
       ORDER BY b.id ASC`,
      [req.user.id]
    );
    res.json({ businesses: rows });
  } catch (err) {
    next(err);
  }
});

// Only Platform Super Admin can register new businesses
router.post(
  '/businesses',
  authenticate,
  requirePlatformAdmin,
  [
    body('name').trim().isLength({ min: 2, max: 160 }).withMessage('Business name is required'),
    body('category').trim().notEmpty().withMessage('Business category is required'),
    body('email').isEmail().withMessage('Valid business email is required'),
    body('phone').trim().notEmpty().withMessage('Business phone is required'),
    body('physical_address').trim().notEmpty().withMessage('Physical address is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const {
        name,
        category,
        description = '',
        email,
        phone,
        country = 'Rwanda',
        province = 'Kigali City',
        district = 'Gasabo',
        physical_address,
        currency_code = 'RWF',
        timezone = 'Africa/Kigali',
        tax_enabled = 1,
        default_tax_rate = 18,
        tax_identification_number = '',
        operating_hours = 'Mon-Sat 08:00 - 20:00',
        language = 'en',
        branch_name = 'Main Headquarters',
      } = req.body;

      const baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const slug = `${baseSlug || 'business'}-${crypto.randomBytes(2).toString('hex')}`;
      const businessCode = `BIZ-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const result = await transaction(async (tx) => {
        const bizRes = await tx.execute(
          `INSERT INTO businesses (business_code, owner_user_id, name, slug, category, description, email, phone, country, province, district, physical_address, currency_code, timezone, tax_enabled, default_tax_rate, tax_identification_number, operating_hours)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            businessCode,
            req.user.id,
            name.trim(),
            slug,
            category,
            description,
            email,
            phone,
            country,
            province,
            district,
            physical_address,
            currency_code,
            timezone,
            tax_enabled ? 1 : 0,
            Number(default_tax_rate || 0),
            tax_identification_number,
            operating_hours,
          ]
        );
        const businessId = bizRes.insertId;

        await tx.execute(
          `INSERT INTO business_settings (business_id, language, receipt_header, receipt_footer, enabled_payment_methods)
           VALUES (?, ?, ?, ?, ?)`,
          [
            businessId,
            language,
            `Thank you for choosing ${name.trim()}`,
            'Powered by BizTrade Africa',
            JSON.stringify(['cash', 'mtn_momo', 'airtel_money', 'bank_transfer', 'card']),
          ]
        );

        const branchRes = await tx.execute(
          `INSERT INTO branches (business_id, name, code, province, district, address, phone, manager_user_id, is_main)
           VALUES (?, ?, 'HQ-01', ?, ?, ?, ?, ?, 1)`,
          [businessId, branch_name, province, district, physical_address, phone, req.user.id]
        );

        const adminRole = await tx.queryOne(`SELECT id FROM roles WHERE code = 'business_admin'`);
        await tx.execute(
          `INSERT INTO business_admins (business_id, user_id, is_primary, assigned_by_admin_id, status, activated_at)
           VALUES (?, ?, 1, ?, 'active', datetime('now'))`,
          [businessId, req.user.id, req.user.id]
        );
        await tx.execute(
          `INSERT INTO business_members (business_id, user_id, role_id, assigned_branch_id, all_branches_access, job_title)
           VALUES (?, ?, ?, ?, 1, 'Business Admin')`,
          [businessId, req.user.id, adminRole.id, branchRes.insertId]
        );

        const defaultExpenseCats = ['Rent & Utilities', 'Transport & Delivery', 'Salaries & Wages', 'Supplies & Packaging'];
        for (const ec of defaultExpenseCats) {
          await tx.execute('INSERT INTO expense_categories (business_id, name) VALUES (?, ?)', [businessId, ec]);
        }

        const freePlan = await tx.queryOne(`SELECT id FROM subscription_plans WHERE code = 'starter'`);
        if (freePlan) {
          await tx.execute(
            `INSERT INTO subscriptions (business_id, plan_id, billing_cycle, status, ends_at)
             VALUES (?, ?, 'monthly', 'trialing', datetime('now', '+14 days'))`,
            [businessId, freePlan.id]
          );
        }

        return { businessId, branchId: branchRes.insertId };
      });

      await logAudit({
        businessId: result.businessId,
        branchId: result.branchId,
        userId: req.user.id,
        action: 'business.created',
        entityType: 'business',
        entityId: result.businessId,
        ipAddress: req.ip,
      });

      const created = await queryOne('SELECT * FROM businesses WHERE id = ?', [result.businessId]);
      res.status(201).json({ business: created, mainBranchId: result.branchId });
    } catch (err) {
      next(err);
    }
  }
);

// Current workspace context (profile, settings, branches, permissions)
router.get('/businesses/current', authenticate, requireBusiness, async (req, res, next) => {
  try {
    const settings = await queryOne('SELECT * FROM business_settings WHERE business_id = ?', [req.businessId]);
    const branches = req.membership.all_branches_access
      ? await query('SELECT * FROM branches WHERE business_id = ? ORDER BY is_main DESC, id ASC', [req.businessId])
      : await query('SELECT * FROM branches WHERE id = ? AND business_id = ?', [req.branchId, req.businessId]);

    res.json({
      business: req.business,
      settings: settings
        ? {
            ...settings,
            enabled_payment_methods: settings.enabled_payment_methods
              ? JSON.parse(settings.enabled_payment_methods)
              : ['cash', 'mtn_momo', 'airtel_money', 'bank_transfer', 'card'],
          }
        : null,
      membership: req.membership,
      permissions: req.permissions,
      branches,
      activeBranchId: req.branchId,
    });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/businesses/current',
  authenticate,
  requireBusiness,
  requirePermission('settings.manage'),
  async (req, res, next) => {
    try {
      const {
        name,
        category,
        description,
        email,
        phone,
        country,
        province,
        district,
        physical_address,
        currency_code,
        timezone,
        tax_enabled,
        default_tax_rate,
        tax_identification_number,
        operating_hours,
        language,
        date_format,
        receipt_header,
        receipt_footer,
        enabled_payment_methods,
        allow_partial_payments,
        allow_unpaid_sales,
        low_stock_threshold_default,
      } = req.body;

      await execute(
        `UPDATE businesses SET
           name = COALESCE(?, name),
           category = COALESCE(?, category),
           description = COALESCE(?, description),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           country = COALESCE(?, country),
           province = COALESCE(?, province),
           district = COALESCE(?, district),
           physical_address = COALESCE(?, physical_address),
           currency_code = COALESCE(?, currency_code),
           timezone = COALESCE(?, timezone),
           tax_enabled = COALESCE(?, tax_enabled),
           default_tax_rate = COALESCE(?, default_tax_rate),
           tax_identification_number = COALESCE(?, tax_identification_number),
           operating_hours = COALESCE(?, operating_hours),
           updated_at = datetime('now')
         WHERE id = ?`,
        [
          name, category, description, email, phone, country, province, district,
          physical_address, currency_code, timezone,
          tax_enabled !== undefined ? (tax_enabled ? 1 : 0) : null,
          default_tax_rate !== undefined ? Number(default_tax_rate) : null,
          tax_identification_number, operating_hours, req.businessId,
        ]
      );

      await execute(
        `UPDATE business_settings SET
           language = COALESCE(?, language),
           date_format = COALESCE(?, date_format),
           receipt_header = COALESCE(?, receipt_header),
           receipt_footer = COALESCE(?, receipt_footer),
           enabled_payment_methods = COALESCE(?, enabled_payment_methods),
           allow_partial_payments = COALESCE(?, allow_partial_payments),
           allow_unpaid_sales = COALESCE(?, allow_unpaid_sales),
           low_stock_threshold_default = COALESCE(?, low_stock_threshold_default),
           updated_at = datetime('now')
         WHERE business_id = ?`,
        [
          language,
          date_format,
          receipt_header,
          receipt_footer,
          enabled_payment_methods ? JSON.stringify(enabled_payment_methods) : null,
          allow_partial_payments !== undefined ? (allow_partial_payments ? 1 : 0) : null,
          allow_unpaid_sales !== undefined ? (allow_unpaid_sales ? 1 : 0) : null,
          low_stock_threshold_default !== undefined ? Number(low_stock_threshold_default) : null,
          req.businessId,
        ]
      );

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'business.settings_updated',
        entityType: 'business',
        entityId: req.businessId,
      });

      const updated = await queryOne('SELECT * FROM businesses WHERE id = ?', [req.businessId]);
      res.json({ business: updated, message: 'Business settings saved' });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/businesses/current/logo',
  authenticate,
  requireBusiness,
  requirePermission('settings.manage'),
  upload.single('logo'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Logo image file is required' });
      const logoUrl = `/uploads/${req.file.filename}`;
      await execute('UPDATE businesses SET logo_url = ? WHERE id = ?', [logoUrl, req.businessId]);
      res.json({ logo_url: logoUrl });
    } catch (err) {
      next(err);
    }
  }
);

// Branches CRUD + performance
router.get('/branches', authenticate, requireBusiness, async (req, res, next) => {
  try {
    const branches = await query(
      `SELECT b.*, u.full_name AS manager_name,
              (SELECT COUNT(*) FROM business_members bm WHERE bm.assigned_branch_id = b.id AND bm.status = 'active') AS staff_count,
              (SELECT COALESCE(SUM(s.total_amount), 0) FROM sales s WHERE s.branch_id = b.id AND s.sale_status != 'cancelled') AS total_sales
       FROM branches b
       LEFT JOIN users u ON u.id = b.manager_user_id
       WHERE b.business_id = ?
       ORDER BY b.is_main DESC, b.id ASC`,
      [req.businessId]
    );
    res.json({ branches });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/branches',
  authenticate,
  requireBusiness,
  requirePermission('branches.manage'),
  [
    body('name').trim().notEmpty().withMessage('Branch name required'),
    body('code').trim().notEmpty().withMessage('Branch code required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { name, code, province = '', district = '', address = '', phone = '', manager_user_id = null } = req.body;
      const resInsert = await execute(
        `INSERT INTO branches (business_id, name, code, province, district, address, phone, manager_user_id, is_main)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [req.businessId, name.trim(), code.trim().toUpperCase(), province, district, address, phone, manager_user_id || null]
      );

      // Initialize zero-quantity inventory rows for existing products in the new branch
      const products = await query('SELECT id FROM products WHERE business_id = ?', [req.businessId]);
      for (const p of products) {
        await execute(
          'INSERT INTO inventory (business_id, branch_id, product_id, quantity) VALUES (?, ?, ?, 0)',
          [req.businessId, resInsert.insertId, p.id]
        );
      }

      await logAudit({
        businessId: req.businessId,
        branchId: resInsert.insertId,
        userId: req.user.id,
        action: 'branch.created',
        entityType: 'branch',
        entityId: resInsert.insertId,
        changes: { name, code },
      });

      const branch = await queryOne('SELECT * FROM branches WHERE id = ?', [resInsert.insertId]);
      res.status(201).json({ branch });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/branches/:id',
  authenticate,
  requireBusiness,
  requirePermission('branches.manage'),
  async (req, res, next) => {
    try {
      const branch = await queryOne('SELECT * FROM branches WHERE id = ? AND business_id = ?', [
        req.params.id,
        req.businessId,
      ]);
      if (!branch) return res.status(404).json({ error: 'Branch not found' });

      const { name, province, district, address, phone, manager_user_id, is_active } = req.body;
      await execute(
        `UPDATE branches SET
           name = COALESCE(?, name),
           province = COALESCE(?, province),
           district = COALESCE(?, district),
           address = COALESCE(?, address),
           phone = COALESCE(?, phone),
           manager_user_id = ?,
           is_active = COALESCE(?, is_active)
         WHERE id = ? AND business_id = ?`,
        [
          name, province, district, address, phone,
          manager_user_id !== undefined ? manager_user_id || null : branch.manager_user_id,
          is_active !== undefined ? (is_active ? 1 : 0) : null,
          req.params.id, req.businessId,
        ]
      );
      const updated = await queryOne('SELECT * FROM branches WHERE id = ?', [req.params.id]);
      res.json({ branch: updated });
    } catch (err) {
      next(err);
    }
  }
);

// Roles & Employees / Members
router.get('/roles', authenticate, requireBusiness, async (_req, res, next) => {
  try {
    const cached = getCached('rbac:roles-perms');
    if (cached) return res.json(cached);
    const [roles, permissions] = await Promise.all([
      query('SELECT * FROM roles ORDER BY id ASC'),
      query('SELECT * FROM permissions ORDER BY module, id'),
    ]);
    const payload = { roles, permissions };
    setCached('rbac:roles-perms', payload, 120_000);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get('/members', authenticate, requireBusiness, requirePermission('employees.view'), async (req, res, next) => {
  try {
    const members = await query(
      `SELECT bm.*, u.full_name, u.email, u.phone, u.avatar_url, u.last_login_at,
              r.code AS role_code, r.name AS role_name, b.name AS branch_name,
              (SELECT COUNT(*) FROM sales s WHERE s.business_id = bm.business_id AND s.cashier_user_id = bm.user_id) AS sales_count,
              (SELECT COALESCE(SUM(s.total_amount), 0) FROM sales s WHERE s.business_id = bm.business_id AND s.cashier_user_id = bm.user_id AND s.sale_status != 'cancelled') AS total_sales_amount
       FROM business_members bm
       JOIN users u ON u.id = bm.user_id
       JOIN roles r ON r.id = bm.role_id
       LEFT JOIN branches b ON b.id = bm.assigned_branch_id
       WHERE bm.business_id = ?
       ORDER BY bm.id ASC`,
      [req.businessId]
    );

    const invitations = await query(
      `SELECT ei.*, r.name AS role_name, b.name AS branch_name
       FROM employee_invitations ei
       JOIN roles r ON r.id = ei.role_id
       LEFT JOIN branches b ON b.id = ei.branch_id
       WHERE ei.business_id = ? AND ei.status = 'pending'
       ORDER BY ei.id DESC`,
      [req.businessId]
    );

    res.json({ members, invitations });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/members/invite',
  authenticate,
  requireBusiness,
  requirePermission('employees.manage'),
  [
    body('full_name').trim().notEmpty().withMessage('Employee full name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('role_id').isInt().withMessage('Role is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { full_name, email, phone = '+250788000000', role_id, branch_id = null, job_title = '' } = req.body;
      const role = await queryOne('SELECT * FROM roles WHERE id = ?', [role_id]);
      if (!role || !ALLOWED_EMPLOYEE_ROLES.includes(role.code)) {
        return res.status(403).json({ error: 'Invalid employee role. Business Admin roles can only be assigned by Platform Super Admin.' });
      }

      const existingUser = await queryOne('SELECT id, is_platform_admin FROM users WHERE email = ?', [email]);
      if (existingUser) {
        if (existingUser.is_platform_admin) {
          return res.status(403).json({ error: 'Platform Super Admin accounts cannot be added as business employees' });
        }
        const existingMember = await queryOne(
          'SELECT id FROM business_members WHERE business_id = ? AND user_id = ?',
          [req.businessId, existingUser.id]
        );
        if (existingMember) {
          return res.status(409).json({ error: 'This user is already a member of your business' });
        }
        const mRes = await execute(
          `INSERT INTO business_members (business_id, user_id, role_id, assigned_branch_id, all_branches_access, job_title, status)
           VALUES (?, ?, ?, ?, ?, ?, 'active')`,
          [req.businessId, existingUser.id, role_id, branch_id || req.branchId, role.code === 'manager' ? 1 : 0, job_title]
        );
        await createNotification({
          businessId: req.businessId,
          userId: existingUser.id,
          eventType: 'employee_invitation',
          title: `Added to ${req.business.name}`,
          message: `You were assigned the ${role.name} role at ${req.business.name}.`,
        });
        await logAudit({
          businessId: req.businessId,
          userId: req.user.id,
          action: 'employee.added',
          entityType: 'business_member',
          entityId: mRes.insertId,
          changes: { email, role: role.code },
        });
        return res.status(201).json({ membershipId: mRes.insertId, message: 'Existing account linked as employee in your business workspace' });
      }

      const inviteToken = crypto.randomBytes(20).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const invRes = await execute(
        `INSERT INTO employee_invitations (business_id, email, full_name, phone, role_id, branch_id, job_title, invite_token, invited_by_user_id, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.businessId, email, full_name.trim(), phone.trim(), role_id, branch_id || req.branchId, job_title, inviteToken, req.user.id, expiresAt]
      );

      const activationUrl = `/activate-account?token=${inviteToken}`;
      const mailResult = await sendMail({
        to: email,
        subject: `Invitation to join ${req.business.name} on BizTrade Africa`,
        text: `Hello ${full_name.trim()}, you have been invited to join ${req.business.name} as ${role.name}. Open ${activationUrl} to set your password and activate your account.`,
      });

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'employee.invited',
        entityType: 'employee_invitation',
        entityId: invRes.insertId,
        changes: { email, role: role.code },
      });

      res.status(201).json({
        invitationId: invRes.insertId,
        invite_token: inviteToken,
        activation_url: !mailResult.delivered || process.env.NODE_ENV !== 'production' ? activationUrl : undefined,
        message: mailResult.delivered
          ? 'Employee activation invitation sent via email'
          : 'Employee invitation created. Share the secure activation link with the employee.',
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/members/:id',
  authenticate,
  requireBusiness,
  requirePermission('employees.manage'),
  async (req, res, next) => {
    try {
      const member = await queryOne(
        `SELECT bm.*, r.code AS current_role_code
         FROM business_members bm
         JOIN roles r ON r.id = bm.role_id
         WHERE bm.id = ? AND bm.business_id = ?`,
        [req.params.id, req.businessId]
      );
      if (!member) return res.status(404).json({ error: 'Employee membership not found' });
      if (member.current_role_code === 'business_owner' || member.current_role_code === 'business_admin') {
        return res.status(403).json({ error: 'Primary Business Admin role changes can only be performed by Platform Super Admin' });
      }

      const { role_id, assigned_branch_id, all_branches_access, status, job_title } = req.body;
      if (role_id) {
        const nextRole = await queryOne('SELECT code FROM roles WHERE id = ?', [role_id]);
        if (!nextRole || !ALLOWED_EMPLOYEE_ROLES.includes(nextRole.code)) {
          return res.status(403).json({ error: 'Cannot promote an employee to Business Admin or Owner without Platform Super Admin authorization' });
        }
      }

      await execute(
        `UPDATE business_members SET
           role_id = COALESCE(?, role_id),
           assigned_branch_id = ?,
           all_branches_access = COALESCE(?, all_branches_access),
           status = COALESCE(?, status),
           job_title = COALESCE(?, job_title)
         WHERE id = ? AND business_id = ?`,
        [
          role_id || null,
          assigned_branch_id !== undefined ? assigned_branch_id || null : member.assigned_branch_id,
          all_branches_access !== undefined ? (all_branches_access ? 1 : 0) : null,
          status || null,
          job_title !== undefined ? job_title : null,
          req.params.id,
          req.businessId,
        ]
      );

      const perms = await loadMemberPermissions(member.id, role_id || member.role_id);
      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'employee.updated',
        entityType: 'business_member',
        entityId: member.id,
        changes: { role_id, status, assigned_branch_id },
      });

      res.json({ message: 'Employee updated', permissions: perms });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
