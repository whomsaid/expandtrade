import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { execute, queryOne } from '../config/db.js';

export function signAccessToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      isPlatformAdmin: Boolean(user.is_platform_admin),
      jti,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
  return { token, jti };
}

export async function recordUserSession(userId, jti, req) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await execute(
    `INSERT INTO user_sessions (user_id, token_jti, device_info, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      userId,
      jti,
      String(req.headers['user-agent'] || 'Unknown device').slice(0, 250),
      req.ip || req.socket?.remoteAddress || 'unknown',
      expiresAt,
    ]
  );
}

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, env.jwtSecret);
    const session = await queryOne(
      'SELECT id, is_revoked FROM user_sessions WHERE token_jti = ? AND user_id = ?',
      [decoded.jti, decoded.sub]
    );
    if (!session || session.is_revoked) {
      return res.status(401).json({ error: 'Session expired or revoked. Please sign in again.' });
    }

    const user = await queryOne(
      `SELECT id, full_name, email, phone, avatar_url, must_change_password, is_email_verified, is_active, is_platform_admin, preferred_language, theme_preference
       FROM users WHERE id = ?`,
      [decoded.sub]
    );
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Account inactive or not found' });
    }

    req.user = user;
    req.tokenJti = decoded.jti;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

export function requirePasswordChanged(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.must_change_password) {
    return res.status(403).json({
      error: 'Temporary password must be changed immediately before accessing the application.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  next();
}

export function requireProfileImage(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.must_change_password) {
    return res.status(403).json({
      error: 'Temporary password must be changed immediately before accessing the application.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  if (!req.user.avatar_url || !String(req.user.avatar_url).trim()) {
    return res.status(403).json({
      error: 'A profile image is required before accessing the application.',
      code: 'PROFILE_IMAGE_REQUIRED',
    });
  }
  next();
}

export function requirePlatformAdmin(req, res, next) {
  if (!req.user || !req.user.is_platform_admin) {
    return res.status(403).json({ error: 'Platform Super Admin authorization required' });
  }
  if (req.user.must_change_password) {
    return res.status(403).json({
      error: 'Temporary password must be changed immediately before accessing the application.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  if (!req.user.avatar_url || !String(req.user.avatar_url).trim()) {
    return res.status(403).json({
      error: 'A profile image is required before accessing the application.',
      code: 'PROFILE_IMAGE_REQUIRED',
    });
  }
  next();
}
