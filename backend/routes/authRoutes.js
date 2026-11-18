import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { execute, query, queryOne, transaction } from '../config/db.js';
import { authenticate, recordUserSession, signAccessToken } from '../middleware/auth.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { avatarUpload, removeUploadedFile, verifyImageSignature } from '../middleware/upload.js';
import { logAudit } from '../services/auditService.js';
import { sendMail } from '../services/mailService.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';

const router = express.Router();

function validateOptionalAvatarUpload(req, res, next) {
  if (!req.file) return next();
  if (!verifyImageSignature(req.file.path)) {
    removeUploadedFile(req.file.path);
    return res.status(400).json({
      error: 'Invalid or unsafe image file. Allowed formats: JPG, JPEG, PNG, and WEBP.',
    });
  }
  next();
}

function requireValidAvatarUpload(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      error: 'Profile image is required (JPG, JPEG, PNG, or WEBP, max 5MB).',
    });
  }
  if (!verifyImageSignature(req.file.path)) {
    removeUploadedFile(req.file.path);
    return res.status(400).json({
      error: 'Invalid or unsafe image file. Allowed formats: JPG, JPEG, PNG, and WEBP.',
    });
  }
  next();
}

function parseJsonSafe(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function formatSafeUser(user, memberships = []) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    avatar_url: user.avatar_url || null,
    bio: user.bio || '',
    location: user.location || '',
    privacy_settings: parseJsonSafe(user.privacy_settings_json, {
      profile_visibility: 'workspace',
      show_online_status: true,
      activity_tracking: true,
    }),
    dashboard_preferences: parseJsonSafe(user.dashboard_preferences_json, {
      density: 'comfortable',
      default_tab: 'overview',
      widgets: {
        sales_kpis: true,
        finance_summary: true,
        daily_chart: true,
        top_products: true,
        branch_performance: true,
        audit_activity: true,
        payroll_summary: true,
      },
    }),
    must_change_password: Boolean(user.must_change_password),
    is_email_verified: user.is_email_verified,
    is_platform_admin: user.is_platform_admin,
    preferred_language: ['en', 'rw', 'fr'].includes(user.preferred_language) ? user.preferred_language : 'en',
    theme_preference: user.theme_preference || 'system',
    account_category: resolveAccountCategory(user, memberships),
    requires_password_change: Boolean(user.must_change_password),
    requires_profile_image: false,
  };
}

async function getUserMemberships(userId, isPlatformAdmin = false) {
  const direct = await query(
    `SELECT bm.id AS membership_id, bm.business_id, bm.assigned_branch_id, bm.all_branches_access,
            bm.job_title, bm.status, b.name AS business_name, b.business_code, b.slug AS business_slug,
            b.category AS business_category, b.currency_code, b.country, b.logo_url,
            b.tax_enabled, b.default_tax_rate, b.status AS business_status,
            r.code AS role_code, r.name AS role_name
     FROM business_members bm
     JOIN businesses b ON b.id = bm.business_id
     JOIN roles r ON r.id = bm.role_id
     WHERE bm.user_id = ? AND bm.status = 'active' AND b.status != 'deleted' AND b.deleted_at IS NULL
     ORDER BY bm.id ASC`,
    [userId]
  );

  if (!isPlatformAdmin) return direct;

  const directIds = new Set(direct.map((m) => m.business_id));
  const allBusinesses = await query(
    `SELECT id AS business_id, name AS business_name, business_code, slug AS business_slug,
            category AS business_category, currency_code, country, logo_url,
            tax_enabled, default_tax_rate, status AS business_status
     FROM businesses
     WHERE status != 'deleted' AND deleted_at IS NULL
     ORDER BY id DESC`
  );
  const superAdminEntries = allBusinesses
    .filter((b) => !directIds.has(b.business_id))
    .map((b) => ({
      membership_id: 0,
      business_id: b.business_id,
      assigned_branch_id: null,
      all_branches_access: 1,
      job_title: 'Platform Super Admin',
      status: 'active',
      business_name: b.business_name,
      business_code: b.business_code,
      business_slug: b.business_slug,
      business_category: b.business_category,
      currency_code: b.currency_code,
      country: b.country,
      logo_url: b.logo_url,
      tax_enabled: b.tax_enabled,
      default_tax_rate: b.default_tax_rate,
      business_status: b.business_status,
      role_code: 'business_owner',
      role_name: 'Super Admin Control',
    }));

  return [...direct, ...superAdminEntries];
}

function resolveAccountCategory(user, memberships = []) {
  if (user?.is_platform_admin) return 'platform_super_admin';
  if (memberships.some((m) => m.role_code === 'business_owner' || m.role_code === 'business_admin')) {
    return 'business_admin';
  }
  if (memberships.length > 0) return 'employee';
  return 'customer';
}

// Public Customer Registration ONLY (profile image is optional — users receive default avatar and can upload later)
router.post(
  '/register',
  avatarUpload.single('avatar'),
  validateOptionalAvatarUpload,
  [
    body('full_name').trim().isLength({ min: 2, max: 140 }).withMessage('Full name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email address is required'),
    body('phone').trim().matches(/^\+?[0-9\s-]{8,20}$/).withMessage('Valid phone number is required (e.g. +250788123456)'),
    body('password').custom((val) => {
      const err = validatePasswordStrength(val);
      if (err) throw new Error(err);
      return true;
    }),
    body('confirm_password').custom((val, { req }) => {
      if (val !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { full_name, email, phone, password, preferred_language } = req.body;
      const safeLang = ['en', 'rw', 'fr'].includes(preferred_language) ? preferred_language : 'en';
      const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        if (req.file?.path) removeUploadedFile(req.file.path);
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : null;
      const passwordHash = await bcrypt.hash(password, 10);
      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const userId = await transaction(async (tx) => {
        const uRes = await tx.execute(
          `INSERT INTO users (full_name, email, phone, avatar_url, password_hash, is_email_verified, is_platform_admin, preferred_language)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
          [full_name.trim(), email, phone.trim(), avatarUrl, passwordHash, safeLang]
        );
        const newUserId = uRes.insertId;

        await tx.execute('INSERT INTO customer_profiles (user_id) VALUES (?)', [newUserId]);
        await tx.execute(
          'INSERT INTO email_verifications (user_id, otp_code, expires_at) VALUES (?, ?, ?)',
          [newUserId, otpCode, expiresAt]
        );
        await tx.execute('INSERT INTO notification_preferences (user_id) VALUES (?)', [newUserId]);
        return newUserId;
      });

      const mailResult = await sendMail({
        to: email,
        subject: 'Verify your BizTrade Africa customer account',
        text: `Your BizTrade Africa email verification code is: ${otpCode}. It expires in 30 minutes.`,
      });

      const user = await queryOne(
        `SELECT id, full_name, email, phone, avatar_url, bio, location, privacy_settings_json, dashboard_preferences_json,
                must_change_password, is_email_verified, is_platform_admin, preferred_language, theme_preference
         FROM users WHERE id = ?`,
        [userId]
      );
      const { token, jti } = signAccessToken(user);
      await recordUserSession(user.id, jti, req);

      await logAudit({
        userId: user.id,
        action: 'customer.registered',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
      });

      res.status(201).json({
        message: mailResult.delivered
          ? 'Customer account created. Check your email for the 6-digit OTP code.'
          : 'Customer account created. Verify your email using the 6-digit OTP code.',
        token,
        user: formatSafeUser(user, []),
        memberships: [],
        devOtpPreview: !mailResult.delivered || process.env.NODE_ENV !== 'production' ? otpCode : undefined,
      });
    } catch (err) {
      if (req.file?.path) removeUploadedFile(req.file.path);
      next(err);
    }
  }
);

router.post(
  '/verify-email',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('otp_code').trim().isLength({ min: 4, max: 10 }).withMessage('Verification code required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { email, otp_code } = req.body;
      const user = await queryOne('SELECT id, is_email_verified FROM users WHERE email = ?', [email]);
      if (!user) return res.status(404).json({ error: 'Account not found' });

      const record = await queryOne(
        `SELECT * FROM email_verifications
         WHERE user_id = ? AND otp_code = ? AND verified_at IS NULL
         ORDER BY id DESC LIMIT 1`,
        [user.id, otp_code]
      );
      if (!record || new Date(record.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }

      await execute(`UPDATE email_verifications SET verified_at = datetime('now') WHERE id = ?`, [record.id]);
      await execute('UPDATE users SET is_email_verified = 1 WHERE id = ?', [user.id]);

      res.json({ message: 'Email verified successfully' });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/resend-verification',
  [body('email').isEmail().normalizeEmail().withMessage('Valid email required')],
  validateRequest,
  async (req, res, next) => {
    try {
      const user = await queryOne('SELECT id, email, is_email_verified FROM users WHERE email = ?', [req.body.email]);
      if (!user) return res.status(404).json({ error: 'Account not found' });
      if (user.is_email_verified) return res.json({ message: 'Email is already verified' });

      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await execute('INSERT INTO email_verifications (user_id, otp_code, expires_at) VALUES (?, ?, ?)', [
        user.id,
        otpCode,
        expiresAt,
      ]);

      const mailResult = await sendMail({
        to: user.email,
        subject: 'Your BizTrade Africa verification code',
        text: `Your verification code is: ${otpCode}. It expires in 30 minutes.`,
      });

      res.json({
        message: 'A new verification code has been issued.',
        devOtpPreview: !mailResult.delivered || process.env.NODE_ENV !== 'production' ? otpCode : undefined,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Preview Business Admin or Employee activation/invitation token before setting password
router.get('/activation-preview', async (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Activation token is required' });

    const bizAdmin = await queryOne(
      `SELECT ba.id, ba.business_id, ba.user_id, ba.activation_expires_at, ba.status,
              b.name AS business_name, b.business_code, u.full_name, u.email
       FROM business_admins ba
       JOIN businesses b ON b.id = ba.business_id
       JOIN users u ON u.id = ba.user_id
       WHERE ba.activation_token = ? AND ba.status = 'pending_activation'`,
      [token]
    );
    if (bizAdmin) {
      if (bizAdmin.activation_expires_at && new Date(bizAdmin.activation_expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: 'This activation link has expired. Contact Platform Super Admin.' });
      }
      return res.json({
        type: 'business_admin',
        business_name: bizAdmin.business_name,
        business_code: bizAdmin.business_code,
        role_name: 'Business Admin',
        full_name: bizAdmin.full_name,
        email: bizAdmin.email,
      });
    }

    const empInvite = await queryOne(
      `SELECT ei.*, b.name AS business_name, b.business_code, r.name AS role_name
       FROM employee_invitations ei
       JOIN businesses b ON b.id = ei.business_id
       JOIN roles r ON r.id = ei.role_id
       WHERE ei.invite_token = ? AND ei.status = 'pending'`,
      [token]
    );
    if (empInvite) {
      if (empInvite.expires_at && new Date(empInvite.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: 'This employee invitation link has expired.' });
      }
      return res.json({
        type: 'employee',
        business_name: empInvite.business_name,
        business_code: empInvite.business_code,
        role_name: empInvite.role_name,
        full_name: empInvite.full_name,
        email: empInvite.email,
      });
    }

    return res.status(404).json({ error: 'Invalid or already used activation link' });
  } catch (err) {
    next(err);
  }
});

// Complete Business Admin or Employee account activation (profile image optional)
router.post(
  '/activate-account',
  avatarUpload.single('avatar'),
  validateOptionalAvatarUpload,
  [
    body('token').trim().notEmpty().withMessage('Activation token is required'),
    body('password').custom((val) => {
      const err = validatePasswordStrength(val);
      if (err) throw new Error(err);
      return true;
    }),
    body('confirm_password').custom((val, { req }) => {
      if (val !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { token, password } = req.body;
      const passwordHash = await bcrypt.hash(password, 10);
      const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : null;

      const bizAdmin = await queryOne(
        `SELECT ba.*, b.status AS business_status, b.name AS business_name
         FROM business_admins ba
         JOIN businesses b ON b.id = ba.business_id
         WHERE ba.activation_token = ? AND ba.status = 'pending_activation'`,
        [token]
      );

      if (bizAdmin) {
        if (bizAdmin.activation_expires_at && new Date(bizAdmin.activation_expires_at).getTime() < Date.now()) {
          if (req.file?.path) removeUploadedFile(req.file.path);
          return res.status(400).json({ error: 'This activation link has expired' });
        }

        await transaction(async (tx) => {
          await tx.execute(
            `UPDATE users SET password_hash = ?, avatar_url = COALESCE(?, avatar_url), must_change_password = 0, is_email_verified = 1, is_active = 1, updated_at = datetime('now')
             WHERE id = ?`,
            [passwordHash, avatarUrl, bizAdmin.user_id]
          );
          await tx.execute(
            `UPDATE business_admins
             SET status = 'active', activated_at = datetime('now'), activation_token = NULL, updated_at = datetime('now')
             WHERE id = ?`,
            [bizAdmin.id]
          );
          await tx.execute(
            `UPDATE business_members SET status = 'active' WHERE business_id = ? AND user_id = ?`,
            [bizAdmin.business_id, bizAdmin.user_id]
          );
          if (bizAdmin.business_status === 'pending_activation') {
            await tx.execute(
              `UPDATE businesses SET status = 'active', updated_at = datetime('now') WHERE id = ?`,
              [bizAdmin.business_id]
            );
          }
        });

        await logAudit({
          businessId: bizAdmin.business_id,
          userId: bizAdmin.user_id,
          action: 'business_admin.activated',
          entityType: 'business_admin',
          entityId: bizAdmin.id,
          ipAddress: req.ip,
        });

        const user = await queryOne(
          `SELECT id, full_name, email, phone, avatar_url, bio, location, privacy_settings_json, dashboard_preferences_json,
                  must_change_password, is_email_verified, is_platform_admin, preferred_language, theme_preference
           FROM users WHERE id = ?`,
          [bizAdmin.user_id]
        );
        const { token: jwtToken, jti } = signAccessToken(user);
        await recordUserSession(user.id, jti, req);
        const memberships = await getUserMemberships(user.id, Boolean(user.is_platform_admin));

        return res.json({
          message: `Business Admin account activated for ${bizAdmin.business_name}.`,
          token: jwtToken,
          user: formatSafeUser(user, memberships),
          memberships,
        });
      }

      const empInvite = await queryOne(
        `SELECT ei.*, r.code AS role_code
         FROM employee_invitations ei
         JOIN roles r ON r.id = ei.role_id
         WHERE ei.invite_token = ? AND ei.status = 'pending'`,
        [token]
      );
      if (!empInvite) {
        if (req.file?.path) removeUploadedFile(req.file.path);
        return res.status(404).json({ error: 'Invalid or already used activation link' });
      }
      if (empInvite.expires_at && new Date(empInvite.expires_at).getTime() < Date.now()) {
        if (req.file?.path) removeUploadedFile(req.file.path);
        return res.status(400).json({ error: 'Invitation link has expired' });
      }

      const activatedUserId = await transaction(async (tx) => {
        let user = await tx.queryOne('SELECT id FROM users WHERE email = ?', [empInvite.email]);
        if (user) {
          await tx.execute(
            `UPDATE users SET password_hash = ?, avatar_url = COALESCE(?, avatar_url), must_change_password = 0, is_email_verified = 1, is_active = 1, updated_at = datetime('now') WHERE id = ?`,
            [passwordHash, avatarUrl, user.id]
          );
        } else {
          const uRes = await tx.execute(
            `INSERT INTO users (full_name, email, phone, avatar_url, password_hash, must_change_password, is_email_verified, is_active, is_platform_admin)
             VALUES (?, ?, ?, ?, ?, 0, 1, 1, 0)`,
            [empInvite.full_name, empInvite.email, empInvite.phone || '+250788000000', avatarUrl, passwordHash]
          );
          user = { id: uRes.insertId };
          await tx.execute('INSERT INTO notification_preferences (user_id) VALUES (?)', [user.id]);
        }

        const existingMember = await tx.queryOne(
          'SELECT id FROM business_members WHERE business_id = ? AND user_id = ?',
          [empInvite.business_id, user.id]
        );
        const allBranches = empInvite.role_code === 'manager' ? 1 : 0;
        if (!existingMember) {
          await tx.execute(
            `INSERT INTO business_members (business_id, user_id, role_id, assigned_branch_id, all_branches_access, job_title, status)
             VALUES (?, ?, ?, ?, ?, ?, 'active')`,
            [empInvite.business_id, user.id, empInvite.role_id, empInvite.branch_id, allBranches, empInvite.job_title || '']
          );
        } else {
          await tx.execute(
            `UPDATE business_members SET role_id = ?, assigned_branch_id = ?, status = 'active' WHERE id = ?`,
            [empInvite.role_id, empInvite.branch_id, existingMember.id]
          );
        }

        await tx.execute(
          `UPDATE employee_invitations SET status = 'accepted', accepted_at = datetime('now') WHERE id = ?`,
          [empInvite.id]
        );
        await tx.execute(
          `UPDATE invitations SET status = 'accepted' WHERE invite_token = ?`,
          [token]
        );
        return user.id;
      });

      await logAudit({
        businessId: empInvite.business_id,
        userId: activatedUserId,
        action: 'employee.activated',
        entityType: 'employee_invitation',
        entityId: empInvite.id,
        ipAddress: req.ip,
      });

      const user = await queryOne(
        `SELECT id, full_name, email, phone, avatar_url, bio, location, privacy_settings_json, dashboard_preferences_json,
                must_change_password, is_email_verified, is_platform_admin, preferred_language, theme_preference
         FROM users WHERE id = ?`,
        [activatedUserId]
      );
      const { token: jwtToken, jti } = signAccessToken(user);
      await recordUserSession(user.id, jti, req);
      const memberships = await getUserMemberships(user.id, Boolean(user.is_platform_admin));

      res.json({
        message: 'Employee account activated.',
        token: jwtToken,
        user: formatSafeUser(user, memberships),
        memberships,
      });
    } catch (err) {
      if (req.file?.path) removeUploadedFile(req.file.path);
      next(err);
    }
  }
);

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
      const valid = user ? await bcrypt.compare(password, user.password_hash) : false;

      await execute(
        'INSERT INTO login_attempts (email, ip_address, was_successful, user_agent) VALUES (?, ?, ?, ?)',
        [email, req.ip || 'unknown', valid ? 1 : 0, String(req.headers['user-agent'] || '').slice(0, 250)]
      );

      if (!user || !valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      if (!user.is_active) {
        return res.status(403).json({ error: 'Your account has been deactivated' });
      }

      const { token, jti } = signAccessToken(user);
      const [, , memberships] = await Promise.all([
        execute(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`, [user.id]),
        recordUserSession(user.id, jti, req),
        getUserMemberships(user.id, Boolean(user.is_platform_admin)),
        logAudit({
          userId: user.id,
          action: 'user.login',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
        }),
      ]);
      const safeUser = formatSafeUser(user, memberships);

      res.json({ token, user: safeUser, memberships });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await execute('UPDATE user_sessions SET is_revoked = 1 WHERE token_jti = ?', [req.tokenJti]);
    res.json({ message: 'Signed out cleanly' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [memberships, sessions, loginHistory] = await Promise.all([
      getUserMemberships(req.user.id, Boolean(req.user.is_platform_admin)),
      query(
        `SELECT id, token_jti, device_info, ip_address, is_revoked, created_at, expires_at
         FROM user_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 12`,
        [req.user.id]
      ),
      query(
        `SELECT ip_address, was_successful, user_agent, created_at
         FROM login_attempts WHERE email = ? ORDER BY id DESC LIMIT 10`,
        [req.user.email]
      ),
    ]);

    res.json({
      user: formatSafeUser(req.user, memberships),
      memberships,
      sessions: sessions.map((s) => ({
        ...s,
        is_current: s.token_jti === req.tokenJti,
        token_jti: undefined,
      })),
      loginHistory,
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/avatar',
  authenticate,
  avatarUpload.single('avatar'),
  requireValidAvatarUpload,
  async (req, res, next) => {
    try {
      const previousAvatar = req.user.avatar_url;
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      await execute(
        `UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?`,
        [avatarUrl, req.user.id]
      );
      if (previousAvatar && previousAvatar !== avatarUrl) {
        removeUploadedFile(previousAvatar);
      }

      const updated = await queryOne(
        `SELECT id, full_name, email, phone, avatar_url, bio, location, privacy_settings_json, dashboard_preferences_json,
                must_change_password, is_email_verified, is_active, is_platform_admin, preferred_language, theme_preference
         FROM users WHERE id = ?`,
        [req.user.id]
      );
      const memberships = await getUserMemberships(req.user.id, Boolean(req.user.is_platform_admin));

      await logAudit({
        userId: req.user.id,
        action: 'user.avatar_updated',
        entityType: 'user',
        entityId: req.user.id,
        ipAddress: req.ip,
      });

      res.json({
        message: 'Profile image updated successfully',
        avatar_url: avatarUrl,
        user: formatSafeUser(updated, memberships),
      });
    } catch (err) {
      if (req.file?.path) removeUploadedFile(req.file.path);
      next(err);
    }
  }
);

router.delete('/avatar', authenticate, async (req, res, next) => {
  try {
    const previousAvatar = req.user.avatar_url;
    await execute(`UPDATE users SET avatar_url = NULL, updated_at = datetime('now') WHERE id = ?`, [req.user.id]);
    if (previousAvatar) {
      removeUploadedFile(previousAvatar);
    }

    const updated = await queryOne(
      `SELECT id, full_name, email, phone, avatar_url, bio, location, privacy_settings_json, dashboard_preferences_json,
              must_change_password, is_email_verified, is_active, is_platform_admin, preferred_language, theme_preference
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    const memberships = await getUserMemberships(req.user.id, Boolean(req.user.is_platform_admin));

    await logAudit({
      userId: req.user.id,
      action: 'user.avatar_removed',
      entityType: 'user',
      entityId: req.user.id,
      ipAddress: req.ip,
    });

    res.json({
      message: 'Profile photo removed. Default initials avatar restored.',
      user: formatSafeUser(updated, memberships),
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail().withMessage('Valid email required')],
  validateRequest,
  async (req, res, next) => {
    try {
      const { email } = req.body;
      const user = await queryOne('SELECT id, email FROM users WHERE email = ?', [email]);
      let devResetToken;
      if (user) {
        const token = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await execute(
          'INSERT INTO password_resets (user_id, reset_token, expires_at) VALUES (?, ?, ?)',
          [user.id, token, expiresAt]
        );
        const mailResult = await sendMail({
          to: email,
          subject: 'BizTrade Africa Password Recovery',
          text: `Use this recovery token to reset your password: ${token}`,
        });
        if (!mailResult.delivered || process.env.NODE_ENV !== 'production') {
          devResetToken = token;
        }
      }
      res.json({
        message: 'If an account matches that email, password recovery instructions have been sent.',
        devResetToken,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/reset-password',
  [
    body('reset_token').trim().notEmpty().withMessage('Reset token is required'),
    body('new_password').custom((val) => {
      const err = validatePasswordStrength(val);
      if (err) throw new Error(err);
      return true;
    }),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { reset_token, new_password } = req.body;
      const record = await queryOne(
        'SELECT * FROM password_resets WHERE reset_token = ? AND used_at IS NULL',
        [reset_token]
      );
      if (!record || new Date(record.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      const hash = await bcrypt.hash(new_password, 10);
      await execute(
        `UPDATE users SET password_hash = ?, must_change_password = 0, is_email_verified = 1, updated_at = datetime('now') WHERE id = ?`,
        [hash, record.user_id]
      );
      await execute(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`, [record.id]);
      await execute('UPDATE user_sessions SET is_revoked = 1 WHERE user_id = ?', [record.user_id]);

      res.json({ message: 'Password updated successfully. Please sign in.' });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/change-password',
  authenticate,
  [
    body('current_password').notEmpty().withMessage('Current password is required'),
    body('new_password').custom((val) => {
      const err = validatePasswordStrength(val);
      if (err) throw new Error(err);
      return true;
    }),
    body('confirm_password').custom((val, { req }) => {
      if (val !== req.body.new_password) throw new Error('New password and confirmation do not match');
      return true;
    }),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { current_password, new_password } = req.body;
      const user = await queryOne('SELECT id, password_hash, must_change_password FROM users WHERE id = ?', [req.user.id]);
      const match = await bcrypt.compare(current_password, user.password_hash);
      if (!match) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      if (current_password === new_password) {
        return res.status(400).json({ error: 'New password must be different from your current password' });
      }
      const newHash = await bcrypt.hash(new_password, 10);

      await transaction(async (tx) => {
        await tx.execute(
          `UPDATE users
           SET password_hash = ?, must_change_password = 0,
               is_email_verified = CASE WHEN ? = 1 THEN 1 ELSE is_email_verified END,
               updated_at = datetime('now')
           WHERE id = ?`,
          [newHash, user.must_change_password ? 1 : 0, req.user.id]
        );

        if (user.must_change_password) {
          const pendingAdmins = await tx.query(
            `SELECT ba.id, ba.business_id, b.status AS business_status
             FROM business_admins ba
             JOIN businesses b ON b.id = ba.business_id
             WHERE ba.user_id = ? AND ba.status = 'pending_activation'`,
            [req.user.id]
          );
          for (const pa of pendingAdmins) {
            await tx.execute(
              `UPDATE business_admins
               SET status = 'active', activated_at = datetime('now'), activation_token = NULL, updated_at = datetime('now')
               WHERE id = ?`,
              [pa.id]
            );
            await tx.execute(
              `UPDATE business_members SET status = 'active' WHERE business_id = ? AND user_id = ?`,
              [pa.business_id, req.user.id]
            );
            if (pa.business_status === 'pending_activation') {
              await tx.execute(
                `UPDATE businesses SET status = 'active', updated_at = datetime('now') WHERE id = ?`,
                [pa.business_id]
              );
            }
          }
        }
      });

      await logAudit({
        userId: req.user.id,
        action: 'user.password_changed',
        entityType: 'user',
        entityId: req.user.id,
        ipAddress: req.ip,
      });

      const updated = await queryOne(
        `SELECT id, full_name, email, phone, avatar_url, bio, location, privacy_settings_json, dashboard_preferences_json,
                must_change_password, is_email_verified, is_active, is_platform_admin, preferred_language, theme_preference
         FROM users WHERE id = ?`,
        [req.user.id]
      );
      const memberships = await getUserMemberships(req.user.id, Boolean(req.user.is_platform_admin));

      res.json({
        message: 'Password changed successfully',
        user: formatSafeUser(updated, memberships),
        memberships,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/profile',
  authenticate,
  [
    body('full_name').optional().trim().isLength({ min: 2, max: 140 }).withMessage('Full name must be at least 2 characters'),
    body('phone').optional().trim().matches(/^\+?[0-9\s-]{8,20}$/).withMessage('Valid phone number is required'),
    body('bio').optional().trim().isLength({ max: 500 }),
    body('location').optional().trim().isLength({ max: 160 }),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { full_name, phone, bio, location, privacy_settings, preferred_language } = req.body;
      const currentPrivacy = parseJsonSafe(req.user.privacy_settings_json, {
        profile_visibility: 'workspace',
        show_online_status: true,
        activity_tracking: true,
      });
      const nextPrivacy = privacy_settings && typeof privacy_settings === 'object'
        ? {
            profile_visibility: ['public', 'workspace', 'private'].includes(privacy_settings.profile_visibility)
              ? privacy_settings.profile_visibility
              : currentPrivacy.profile_visibility,
            show_online_status: privacy_settings.show_online_status !== undefined ? Boolean(privacy_settings.show_online_status) : currentPrivacy.show_online_status,
            activity_tracking: privacy_settings.activity_tracking !== undefined ? Boolean(privacy_settings.activity_tracking) : currentPrivacy.activity_tracking,
          }
        : currentPrivacy;

      await execute(
        `UPDATE users
         SET full_name = COALESCE(?, full_name),
             phone = COALESCE(?, phone),
             bio = ?,
             location = ?,
             privacy_settings_json = ?,
             preferred_language = COALESCE(?, preferred_language),
             updated_at = datetime('now')
         WHERE id = ?`,
        [
          full_name?.trim() || null,
          phone?.trim() || null,
          bio !== undefined ? String(bio).trim() : req.user.bio || '',
          location !== undefined ? String(location).trim() : req.user.location || '',
          JSON.stringify(nextPrivacy),
          preferred_language && ['en', 'rw', 'fr'].includes(preferred_language) ? preferred_language : null,
          req.user.id,
        ]
      );

      const updated = await queryOne(
        `SELECT id, full_name, email, phone, avatar_url, bio, location, privacy_settings_json, dashboard_preferences_json,
                must_change_password, is_email_verified, is_active, is_platform_admin, preferred_language, theme_preference
         FROM users WHERE id = ?`,
        [req.user.id]
      );
      const memberships = await getUserMemberships(req.user.id, Boolean(req.user.is_platform_admin));

      await logAudit({
        userId: req.user.id,
        action: 'user.profile_updated',
        entityType: 'user',
        entityId: req.user.id,
        ipAddress: req.ip,
      });

      res.json({
        message: 'Profile information updated successfully.',
        user: formatSafeUser(updated, memberships),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/request-email-change',
  authenticate,
  [
    body('new_email').isEmail().normalizeEmail().withMessage('Valid new email address is required'),
    body('current_password').notEmpty().withMessage('Current password is required to change your email'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { new_email, current_password } = req.body;
      const user = await queryOne('SELECT id, email, password_hash FROM users WHERE id = ?', [req.user.id]);
      const valid = user ? await bcrypt.compare(current_password, user.password_hash) : false;
      if (!valid) {
        return res.status(403).json({ error: 'Current password verification failed.' });
      }
      if (new_email === user.email) {
        return res.status(400).json({ error: 'New email address must differ from your current email.' });
      }
      const taken = await queryOne('SELECT id FROM users WHERE email = ? AND id != ?', [new_email, req.user.id]);
      if (taken) {
        return res.status(409).json({ error: 'This email address is already registered to another account.' });
      }

      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      await execute(
        'INSERT INTO email_change_requests (user_id, new_email, otp_code, expires_at) VALUES (?, ?, ?, ?)',
        [req.user.id, new_email, otpCode, expiresAt]
      );

      const mailResult = await sendMail({
        to: new_email,
        subject: 'BizTrade Africa Email Change Verification',
        text: `Your verification code to change your BizTrade Africa email to ${new_email} is: ${otpCode}. It expires in 20 minutes.`,
      });

      res.json({
        message: mailResult.delivered
          ? `A 6-digit verification OTP has been sent to ${new_email}.`
          : `Verification OTP generated for ${new_email}. Enter the 6-digit code to confirm.`,
        devOtpPreview: !mailResult.delivered || process.env.NODE_ENV !== 'production' ? otpCode : undefined,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/verify-email-change',
  authenticate,
  [
    body('new_email').isEmail().normalizeEmail().withMessage('Valid new email required'),
    body('otp_code').trim().isLength({ min: 4, max: 10 }).withMessage('OTP code required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { new_email, otp_code } = req.body;
      const reqRow = await queryOne(
        `SELECT * FROM email_change_requests
         WHERE user_id = ? AND new_email = ? AND otp_code = ? AND verified_at IS NULL
         ORDER BY id DESC LIMIT 1`,
        [req.user.id, new_email, otp_code]
      );
      if (!reqRow || new Date(reqRow.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired email verification code.' });
      }
      const taken = await queryOne('SELECT id FROM users WHERE email = ? AND id != ?', [new_email, req.user.id]);
      if (taken) {
        return res.status(409).json({ error: 'This email address is already in use.' });
      }

      await transaction(async (tx) => {
        await tx.execute(`UPDATE email_change_requests SET verified_at = datetime('now') WHERE id = ?`, [reqRow.id]);
        await tx.execute(`UPDATE users SET email = ?, is_email_verified = 1, updated_at = datetime('now') WHERE id = ?`, [
          new_email,
          req.user.id,
        ]);
      });

      await logAudit({
        userId: req.user.id,
        action: 'user.email_changed',
        entityType: 'user',
        entityId: req.user.id,
        changes: { new_email },
        ipAddress: req.ip,
      });

      const updated = await queryOne(
        `SELECT id, full_name, email, phone, avatar_url, bio, location, privacy_settings_json, dashboard_preferences_json,
                must_change_password, is_email_verified, is_active, is_platform_admin, preferred_language, theme_preference
         FROM users WHERE id = ?`,
        [req.user.id]
      );
      const memberships = await getUserMemberships(req.user.id, Boolean(req.user.is_platform_admin));
      res.json({
        message: 'Email address verified and updated successfully.',
        user: formatSafeUser(updated, memberships),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/preferences', authenticate, async (req, res, next) => {
  try {
    const memberships = await getUserMemberships(req.user.id, Boolean(req.user.is_platform_admin));
    const notifPrefs = await queryOne('SELECT * FROM notification_preferences WHERE user_id = ?', [req.user.id]);
    const formatted = formatSafeUser(req.user, memberships);
    res.json({
      dashboard_preferences: formatted.dashboard_preferences,
      theme_preference: formatted.theme_preference,
      preferred_language: formatted.preferred_language || 'en',
      privacy_settings: formatted.privacy_settings,
      notification_preferences: notifPrefs || {},
    });
  } catch (err) {
    next(err);
  }
});

router.put('/preferences', authenticate, async (req, res, next) => {
  try {
    const { dashboard_preferences, theme_preference, preferred_language } = req.body;
    const currentPrefs = parseJsonSafe(req.user.dashboard_preferences_json, {
      density: 'comfortable',
      default_tab: 'overview',
      widgets: {
        sales_kpis: true,
        finance_summary: true,
        daily_chart: true,
        top_products: true,
        branch_performance: true,
        audit_activity: true,
        payroll_summary: true,
      },
    });

    const nextPrefs = dashboard_preferences && typeof dashboard_preferences === 'object'
      ? {
          density: ['compact', 'comfortable'].includes(dashboard_preferences.density)
            ? dashboard_preferences.density
            : currentPrefs.density,
          default_tab: String(dashboard_preferences.default_tab || currentPrefs.default_tab || 'overview').slice(0, 40),
          widgets: {
            ...(currentPrefs.widgets || {}),
            ...(dashboard_preferences.widgets && typeof dashboard_preferences.widgets === 'object'
              ? Object.fromEntries(
                  Object.entries(dashboard_preferences.widgets).map(([k, v]) => [k, Boolean(v)])
                )
              : {}),
          },
        }
      : currentPrefs;

    const validTheme = theme_preference && ['light', 'dark', 'system'].includes(theme_preference) ? theme_preference : null;
    const validLanguage = preferred_language && ['en', 'rw', 'fr'].includes(preferred_language) ? preferred_language : null;

    await execute(
      `UPDATE users
       SET dashboard_preferences_json = ?,
           theme_preference = COALESCE(?, theme_preference),
           preferred_language = COALESCE(?, preferred_language),
           updated_at = datetime('now')
       WHERE id = ?`,
      [JSON.stringify(nextPrefs), validTheme, validLanguage, req.user.id]
    );

    const updated = await queryOne(
      `SELECT id, full_name, email, phone, avatar_url, bio, location, privacy_settings_json, dashboard_preferences_json,
              must_change_password, is_email_verified, is_active, is_platform_admin, preferred_language, theme_preference
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    const memberships = await getUserMemberships(req.user.id, Boolean(req.user.is_platform_admin));

    res.json({
      message: 'Dashboard and interface preferences saved.',
      dashboard_preferences: nextPrefs,
      user: formatSafeUser(updated, memberships),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions/:id', authenticate, async (req, res, next) => {
  try {
    const sess = await queryOne('SELECT id, token_jti FROM user_sessions WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    if (!sess) return res.status(404).json({ error: 'Session not found' });
    if (sess.token_jti === req.tokenJti) {
      return res.status(400).json({ error: 'Use Sign Out to end your current session.' });
    }
    await execute('UPDATE user_sessions SET is_revoked = 1 WHERE id = ? AND user_id = ?', [sess.id, req.user.id]);
    res.json({ message: 'Session revoked cleanly' });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/revoke-others', authenticate, async (req, res, next) => {
  try {
    await execute('UPDATE user_sessions SET is_revoked = 1 WHERE user_id = ? AND token_jti != ?', [
      req.user.id,
      req.tokenJti,
    ]);
    res.json({ message: 'All other active sessions have been signed out.' });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/theme',
  authenticate,
  [
    body('theme_preference')
      .trim()
      .isIn(['light', 'dark', 'system'])
      .withMessage('Theme preference must be light, dark, or system'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { theme_preference } = req.body;
      await execute(
        `UPDATE users SET theme_preference = ?, updated_at = datetime('now') WHERE id = ?`,
        [theme_preference, req.user.id]
      );
      res.json({
        message: 'Theme preference saved',
        theme_preference,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/language',
  authenticate,
  [
    body('preferred_language')
      .trim()
      .isIn(['en', 'rw', 'fr'])
      .withMessage('Language preference must be en, rw, or fr'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { preferred_language } = req.body;
      await execute(
        `UPDATE users SET preferred_language = ?, updated_at = datetime('now') WHERE id = ?`,
        [preferred_language, req.user.id]
      );
      res.json({
        message: 'Language preference saved',
        preferred_language,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
