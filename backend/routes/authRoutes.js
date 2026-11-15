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

function requireValidAvatarUpload(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      error: 'Profile image is required (JPG, JPEG, PNG, or WEBP, max 5MB).',
      code: 'PROFILE_IMAGE_REQUIRED',
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

async function getUserMemberships(userId) {
  return query(
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
}

function resolveAccountCategory(user, memberships = []) {
  if (user?.is_platform_admin) return 'platform_super_admin';
  if (memberships.some((m) => m.role_code === 'business_owner' || m.role_code === 'business_admin')) {
    return 'business_admin';
  }
  if (memberships.length > 0) return 'employee';
  return 'customer';
}

// Public Customer Registration ONLY (cannot register businesses or select admin/employee roles)
router.post(
  '/register',
  avatarUpload.single('avatar'),
  requireValidAvatarUpload,
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
      const { full_name, email, phone, password } = req.body;
      const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        removeUploadedFile(req.file.path);
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      const passwordHash = await bcrypt.hash(password, 10);
      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const userId = await transaction(async (tx) => {
        const uRes = await tx.execute(
          `INSERT INTO users (full_name, email, phone, avatar_url, password_hash, is_email_verified, is_platform_admin)
           VALUES (?, ?, ?, ?, ?, 0, 0)`,
          [full_name.trim(), email, phone.trim(), avatarUrl, passwordHash]
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
        subject: 'Verify your BizFlow Africa customer account',
        text: `Your BizFlow Africa email verification code is: ${otpCode}. It expires in 30 minutes.`,
      });

      const user = await queryOne(
        'SELECT id, full_name, email, phone, avatar_url, is_email_verified, is_platform_admin, theme_preference FROM users WHERE id = ?',
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
        user: { ...user, theme_preference: user.theme_preference || 'system', account_category: 'customer', must_change_password: false, requires_password_change: false, requires_profile_image: false },
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
        subject: 'Your BizFlow Africa verification code',
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

// Complete Business Admin or Employee account activation (sets password + profile image + verifies email)
router.post(
  '/activate-account',
  avatarUpload.single('avatar'),
  requireValidAvatarUpload,
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
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;

      const bizAdmin = await queryOne(
        `SELECT ba.*, b.status AS business_status, b.name AS business_name
         FROM business_admins ba
         JOIN businesses b ON b.id = ba.business_id
         WHERE ba.activation_token = ? AND ba.status = 'pending_activation'`,
        [token]
      );

      if (bizAdmin) {
        if (bizAdmin.activation_expires_at && new Date(bizAdmin.activation_expires_at).getTime() < Date.now()) {
          removeUploadedFile(req.file.path);
          return res.status(400).json({ error: 'This activation link has expired' });
        }

        await transaction(async (tx) => {
          await tx.execute(
            `UPDATE users SET password_hash = ?, avatar_url = ?, must_change_password = 0, is_email_verified = 1, is_active = 1, updated_at = datetime('now')
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
          'SELECT id, full_name, email, phone, avatar_url, is_email_verified, is_platform_admin, theme_preference FROM users WHERE id = ?',
          [bizAdmin.user_id]
        );
        const { token: jwtToken, jti } = signAccessToken(user);
        await recordUserSession(user.id, jti, req);
        const memberships = await getUserMemberships(user.id);

        return res.json({
          message: `Business Admin account activated for ${bizAdmin.business_name}.`,
          token: jwtToken,
          user: { ...user, theme_preference: user.theme_preference || 'system', account_category: resolveAccountCategory(user, memberships), must_change_password: false, requires_password_change: false, requires_profile_image: false },
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
        removeUploadedFile(req.file.path);
        return res.status(404).json({ error: 'Invalid or already used activation link' });
      }
      if (empInvite.expires_at && new Date(empInvite.expires_at).getTime() < Date.now()) {
        removeUploadedFile(req.file.path);
        return res.status(400).json({ error: 'Invitation link has expired' });
      }

      const activatedUserId = await transaction(async (tx) => {
        let user = await tx.queryOne('SELECT id FROM users WHERE email = ?', [empInvite.email]);
        if (user) {
          await tx.execute(
            `UPDATE users SET password_hash = ?, avatar_url = ?, must_change_password = 0, is_email_verified = 1, is_active = 1, updated_at = datetime('now') WHERE id = ?`,
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
        'SELECT id, full_name, email, phone, avatar_url, is_email_verified, is_platform_admin, theme_preference FROM users WHERE id = ?',
        [activatedUserId]
      );
      const { token: jwtToken, jti } = signAccessToken(user);
      await recordUserSession(user.id, jti, req);
      const memberships = await getUserMemberships(user.id);

      res.json({
        message: 'Employee account activated.',
        token: jwtToken,
        user: { ...user, theme_preference: user.theme_preference || 'system', account_category: resolveAccountCategory(user, memberships), must_change_password: false, requires_password_change: false, requires_profile_image: false },
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

      await execute(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`, [user.id]);
      const { token, jti } = signAccessToken(user);
      await recordUserSession(user.id, jti, req);

      const memberships = await getUserMemberships(user.id);
      const safeUser = {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
        must_change_password: Boolean(user.must_change_password),
        is_email_verified: user.is_email_verified,
        is_platform_admin: user.is_platform_admin,
        preferred_language: user.preferred_language,
        theme_preference: user.theme_preference || 'system',
        account_category: resolveAccountCategory(user, memberships),
        requires_password_change: Boolean(user.must_change_password),
        requires_profile_image: !user.avatar_url,
      };

      await logAudit({
        userId: user.id,
        action: 'user.login',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
      });

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
    const memberships = await getUserMemberships(req.user.id);
    const sessions = await query(
      `SELECT id, device_info, ip_address, is_revoked, created_at, expires_at
       FROM user_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 10`,
      [req.user.id]
    );
    const loginHistory = await query(
      `SELECT ip_address, was_successful, user_agent, created_at
       FROM login_attempts WHERE email = ? ORDER BY id DESC LIMIT 10`,
      [req.user.email]
    );
    res.json({
      user: {
        ...req.user,
        must_change_password: Boolean(req.user.must_change_password),
        account_category: resolveAccountCategory(req.user, memberships),
        requires_password_change: Boolean(req.user.must_change_password),
        requires_profile_image: !req.user.avatar_url,
      },
      memberships,
      sessions,
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
        `SELECT id, full_name, email, phone, avatar_url, must_change_password, is_email_verified, is_active, is_platform_admin, preferred_language, theme_preference
         FROM users WHERE id = ?`,
        [req.user.id]
      );
      const memberships = await getUserMemberships(req.user.id);

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
        user: {
          ...updated,
          theme_preference: updated.theme_preference || 'system',
          must_change_password: Boolean(updated.must_change_password),
          account_category: resolveAccountCategory(updated, memberships),
          requires_password_change: Boolean(updated.must_change_password),
          requires_profile_image: false,
        },
      });
    } catch (err) {
      if (req.file?.path) removeUploadedFile(req.file.path);
      next(err);
    }
  }
);

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
          subject: 'BizFlow Africa Password Recovery',
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
        `SELECT id, full_name, email, phone, avatar_url, must_change_password, is_email_verified, is_active, is_platform_admin, preferred_language, theme_preference
         FROM users WHERE id = ?`,
        [req.user.id]
      );
      const memberships = await getUserMemberships(req.user.id);

      res.json({
        message: 'Password changed successfully',
        user: {
          ...updated,
          theme_preference: updated.theme_preference || 'system',
          must_change_password: false,
          account_category: resolveAccountCategory(updated, memberships),
          requires_password_change: false,
          requires_profile_image: !updated.avatar_url,
        },
        memberships,
      });
    } catch (err) {
      next(err);
    }
  }
);

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

export default router;
