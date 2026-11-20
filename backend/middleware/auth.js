import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { execute, queryOne } from '../config/db.js';

const SESSION_CACHE_TTL_MS = 15_000;
const REVOKED_JTI_TTL_MS = 15 * 60 * 1000;
const sessionAuthCache = new Map();
const revokedJtiMap = new Map();

function pruneAuthCaches() {
  const now = Date.now();
  if (sessionAuthCache.size > 4000) {
    for (const [k, v] of sessionAuthCache) {
      if (v.expiresAt <= now) sessionAuthCache.delete(k);
    }
  }
  if (revokedJtiMap.size > 4000) {
    for (const [k, exp] of revokedJtiMap) {
      if (exp <= now) revokedJtiMap.delete(k);
    }
  }
}

export function markJtiRevoked(jti) {
  if (!jti) return;
  sessionAuthCache.delete(jti);
  revokedJtiMap.set(jti, Date.now() + REVOKED_JTI_TTL_MS);
  pruneAuthCaches();
}

export function invalidateUserAuthCache(userId, exceptJti = null) {
  const uid = Number(userId);
  for (const [jti, entry] of sessionAuthCache) {
    if (Number(entry.user?.id) === uid && jti !== exceptJti) {
      sessionAuthCache.delete(jti);
      if (exceptJti !== undefined && exceptJti !== null) {
        revokedJtiMap.set(jti, Date.now() + REVOKED_JTI_TTL_MS);
      }
    }
  }
}

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
    const jti = decoded?.jti;
    if (jti) {
      const revokedUntil = revokedJtiMap.get(jti);
      if (revokedUntil) {
        if (revokedUntil > Date.now()) {
          return res.status(401).json({ error: 'Session expired or revoked. Please sign in again.' });
        }
        revokedJtiMap.delete(jti);
      }
      const cached = sessionAuthCache.get(jti);
      if (cached && cached.expiresAt > Date.now() && Number(cached.user.id) === Number(decoded.sub)) {
        req.user = cached.user;
        req.tokenJti = jti;
        return next();
      }
    }

    const row = await queryOne(
      `SELECT u.id, u.full_name, u.email, u.phone, u.avatar_url, u.bio, u.location,
              u.privacy_settings_json, u.dashboard_preferences_json,
              u.must_change_password, u.is_email_verified, u.is_phone_verified,
              u.whatsapp_opt_in, u.whatsapp_opted_out_at,
              u.is_active, u.is_platform_admin,
              u.preferred_language, u.theme_preference, us.is_revoked
       FROM user_sessions us
       JOIN users u ON u.id = us.user_id
       WHERE us.token_jti = ? AND us.user_id = ?`,
      [jti, decoded.sub]
    );
    if (!row || row.is_revoked) {
      if (jti) markJtiRevoked(jti);
      return res.status(401).json({ error: 'Session expired or revoked. Please sign in again.' });
    }
    if (!row.is_active) {
      if (jti) sessionAuthCache.delete(jti);
      return res.status(401).json({ error: 'Account inactive or not found' });
    }

    const { is_revoked: _revoked, ...user } = row;
    if (jti) {
      sessionAuthCache.set(jti, { user, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
      pruneAuthCaches();
    }
    req.user = user;
    req.tokenJti = jti;
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

// Profile image is now optional; kept as an exported alias for password-change enforcement across routes.
export function requireProfileImage(req, res, next) {
  return requirePasswordChanged(req, res, next);
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
  next();
}
