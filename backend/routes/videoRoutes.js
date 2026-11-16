import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import { execute, query, queryOne } from '../config/db.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { loadMemberPermissions, requireBusiness, requirePermission } from '../middleware/tenant.js';
import {
  adVideoUpload,
  cleanupMulterFiles,
  removeUploadedFile,
  verifyImageSignature,
  verifyVideoSignature,
  VIDEO_STORAGE_DIR,
} from '../middleware/upload.js';
import { logAudit } from '../services/auditService.js';

const router = express.Router();

const MAX_CHUNK_BYTES = 1024 * 1024; // 1MB progressive chunk cap for slower connections

function formatVideoRow(row) {
  if (!row) return null;
  return {
    ...row,
    is_published: Boolean(row.is_published),
    stream_url: row.is_published ? `/api/public/videos/${row.id}/stream` : null,
  };
}

function streamVideoFile(req, res, video) {
  const safeName = path.basename(video.video_path || '');
  const filePath = path.resolve(VIDEO_STORAGE_DIR, safeName);
  if (!filePath.startsWith(VIDEO_STORAGE_DIR + path.sep) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video file not found on storage' });
  }

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const contentType = video.video_mime_type || 'video/mp4';
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Type', contentType);

  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range.trim());
    if (!match) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : Math.min(start + MAX_CHUNK_BYTES - 1, total - 1);
    const end = Math.min(requestedEnd, total - 1);

    if (Number.isNaN(start) || Number.isNaN(end) || start >= total || start > end) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', chunkSize);
    const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 128 * 1024 });
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    return stream.pipe(res);
  }

  res.status(200);
  res.setHeader('Content-Length', total);
  const stream = fs.createReadStream(filePath, { highWaterMark: 128 * 1024 });
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).end();
  });
  return stream.pipe(res);
}

// ================= PUBLIC & CUSTOMER-FACING VIDEO ENDPOINTS =================
router.get('/public/videos', async (req, res, next) => {
  try {
    const businessId = req.query.business_id ? Number(req.query.business_id) : null;
    const category = String(req.query.category || '').trim();
    const q = String(req.query.q || '').trim().toLowerCase();

    let sql = `
      SELECT bv.id, bv.business_id, bv.product_id, bv.title, bv.description,
             bv.video_mime_type, bv.file_size_bytes, bv.thumbnail_url, bv.is_published, bv.published_at, bv.created_at,
             b.name AS business_name, b.slug AS business_slug, b.category AS business_category,
             b.logo_url AS business_logo, b.district AS business_district, b.country AS business_country,
             b.currency_code,
             p.name AS product_name, p.selling_price AS product_price
      FROM business_videos bv
      JOIN businesses b ON b.id = bv.business_id
      LEFT JOIN products p ON p.id = bv.product_id
      WHERE bv.is_published = 1
        AND b.status = 'active'
        AND b.is_public_listed = 1
        AND b.deleted_at IS NULL
    `;
    const params = [];

    if (businessId && !Number.isNaN(businessId)) {
      sql += ' AND bv.business_id = ?';
      params.push(businessId);
    }
    if (category) {
      sql += ' AND b.category = ?';
      params.push(category);
    }
    if (q) {
      sql += ` AND (LOWER(bv.title) LIKE ? OR LOWER(COALESCE(bv.description, '')) LIKE ? OR LOWER(b.name) LIKE ? OR LOWER(COALESCE(p.name, '')) LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    sql += ' ORDER BY COALESCE(bv.published_at, bv.created_at) DESC, bv.id DESC LIMIT 40';
    const rows = await query(sql, params);
    res.json({ videos: rows.map(formatVideoRow) });
  } catch (err) {
    next(err);
  }
});

router.get('/public/videos/:id/stream', async (req, res, next) => {
  try {
    const video = await queryOne(
      `SELECT bv.*
       FROM business_videos bv
       JOIN businesses b ON b.id = bv.business_id
       WHERE bv.id = ?
         AND bv.is_published = 1
         AND b.status = 'active'
         AND b.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!video) {
      return res.status(404).json({ error: 'Published advertisement video not found' });
    }
    return streamVideoFile(req, res, video);
  } catch (err) {
    next(err);
  }
});

// ================= BUSINESS ADMIN TENANT-ISOLATED VIDEO MANAGEMENT =================
router.get('/ads/videos', authenticate, requireBusiness, requirePermission('ads.view'), async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT bv.*, p.name AS product_name, p.selling_price AS product_price,
              u.full_name AS author_name, u.avatar_url AS author_avatar
       FROM business_videos bv
       LEFT JOIN products p ON p.id = bv.product_id
       LEFT JOIN users u ON u.id = bv.created_by_user_id
       WHERE bv.business_id = ?
       ORDER BY bv.id DESC`,
      [req.businessId]
    );
    res.json({
      videos: rows.map((row) => ({
        ...formatVideoRow(row),
        admin_stream_url: `/api/ads/videos/${row.id}/stream`,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Authenticated draft & published video preview stream (supports Bearer header or ?token= for HTML5 <video>)
router.get('/ads/videos/:id/stream', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : String(req.query.token || '').trim();
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }

    const session = await queryOne(
      'SELECT id, is_revoked FROM user_sessions WHERE token_jti = ? AND user_id = ?',
      [decoded.jti, decoded.sub]
    );
    if (!session || session.is_revoked) {
      return res.status(401).json({ error: 'Session expired or revoked' });
    }

    const user = await queryOne(
      'SELECT id, avatar_url, must_change_password, is_active FROM users WHERE id = ?',
      [decoded.sub]
    );
    if (!user || !user.is_active || user.must_change_password) {
      return res.status(403).json({ error: 'Account authorization incomplete' });
    }

    const businessId = Number(req.headers['x-business-id'] || req.query.businessId || 0);
    const video = await queryOne(
      `SELECT bv.*
       FROM business_videos bv
       JOIN businesses b ON b.id = bv.business_id
       WHERE bv.id = ? AND b.status != 'deleted' AND b.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!video) {
      return res.status(404).json({ error: 'Advertisement video not found' });
    }
    if (businessId && businessId !== video.business_id) {
      return res.status(403).json({ error: 'Tenant isolation violation' });
    }

    const membership = await queryOne(
      `SELECT bm.*, r.code AS role_code
       FROM business_members bm
       JOIN roles r ON r.id = bm.role_id
       WHERE bm.business_id = ? AND bm.user_id = ? AND bm.status = 'active'`,
      [video.business_id, user.id]
    );
    if (!membership) {
      return res.status(403).json({ error: 'Tenant isolation violation' });
    }

    if (!['business_owner', 'business_admin'].includes(membership.role_code)) {
      const perms = await loadMemberPermissions(membership.id, membership.role_id);
      if (!perms.includes('ads.view')) {
        return res.status(403).json({ error: 'Permission denied' });
      }
    }

    return streamVideoFile(req, res, video);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/ads/videos',
  authenticate,
  requireBusiness,
  requirePermission('ads.manage'),
  adVideoUpload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  [
    body('title').trim().isLength({ min: 2, max: 160 }).withMessage('Video title is required (2–160 characters)'),
    body('description').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
    body('product_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Invalid product selection'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const videoFile = req.files?.video?.[0];
      const thumbFile = req.files?.thumbnail?.[0] || null;

      if (!videoFile) {
        cleanupMulterFiles(req);
        return res.status(400).json({ error: 'Promotional video file is required (MP4 or WEBM, max 50MB).' });
      }

      if (!verifyVideoSignature(videoFile.path, videoFile.mimetype)) {
        cleanupMulterFiles(req);
        return res.status(400).json({ error: 'Invalid or unsafe video file. Only valid MP4 and WEBM files are allowed.' });
      }

      if (thumbFile) {
        if (thumbFile.size > 5 * 1024 * 1024 || !verifyImageSignature(thumbFile.path)) {
          cleanupMulterFiles(req);
          return res.status(400).json({ error: 'Invalid video thumbnail. Allowed: JPG, JPEG, PNG, or WEBP (max 5MB).' });
        }
      }

      let productId = null;
      if (req.body.product_id) {
        const product = await queryOne('SELECT id FROM products WHERE id = ? AND business_id = ?', [
          Number(req.body.product_id),
          req.businessId,
        ]);
        if (!product) {
          cleanupMulterFiles(req);
          return res.status(400).json({ error: 'Selected product or service does not belong to this business' });
        }
        productId = product.id;
      }

      const publishFlag = req.body.is_published === '1' || req.body.is_published === 'true' || req.body.is_published === true ? 1 : 0;
      const thumbnailUrl = thumbFile ? `/uploads/video-thumbnails/${thumbFile.filename}` : null;

      const ins = await execute(
        `INSERT INTO business_videos
           (business_id, created_by_user_id, product_id, title, description, video_path, video_mime_type, file_size_bytes, thumbnail_url, is_published, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END)`,
        [
          req.businessId,
          req.user.id,
          productId,
          req.body.title.trim(),
          (req.body.description || '').trim(),
          videoFile.filename,
          videoFile.mimetype,
          videoFile.size,
          thumbnailUrl,
          publishFlag,
          publishFlag,
        ]
      );

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'ads.video_created',
        entityType: 'business_video',
        entityId: ins.insertId,
        changes: { title: req.body.title.trim(), productId, is_published: Boolean(publishFlag) },
        ipAddress: req.ip,
      });

      const created = await queryOne(
        `SELECT bv.*, p.name AS product_name, p.selling_price AS product_price,
                u.full_name AS author_name, u.avatar_url AS author_avatar
         FROM business_videos bv
         LEFT JOIN products p ON p.id = bv.product_id
         LEFT JOIN users u ON u.id = bv.created_by_user_id
         WHERE bv.id = ?`,
        [ins.insertId]
      );

      res.status(201).json({
        message: publishFlag ? 'Promotional video uploaded and published.' : 'Promotional video saved as draft for preview.',
        video: {
          ...formatVideoRow(created),
          admin_stream_url: `/api/ads/videos/${created.id}/stream`,
        },
      });
    } catch (err) {
      cleanupMulterFiles(req);
      next(err);
    }
  }
);

router.put(
  '/ads/videos/:id',
  authenticate,
  requireBusiness,
  requirePermission('ads.manage'),
  adVideoUpload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  [
    body('title').trim().isLength({ min: 2, max: 160 }).withMessage('Video title is required (2–160 characters)'),
    body('description').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
    body('product_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Invalid product selection'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const existing = await queryOne('SELECT * FROM business_videos WHERE id = ? AND business_id = ?', [
        req.params.id,
        req.businessId,
      ]);
      if (!existing) {
        cleanupMulterFiles(req);
        return res.status(404).json({ error: 'Advertisement video not found for this business' });
      }

      const videoFile = req.files?.video?.[0] || null;
      const thumbFile = req.files?.thumbnail?.[0] || null;

      if (videoFile && !verifyVideoSignature(videoFile.path, videoFile.mimetype)) {
        cleanupMulterFiles(req);
        return res.status(400).json({ error: 'Invalid or unsafe video file. Only valid MP4 and WEBM files are allowed.' });
      }
      if (thumbFile && (thumbFile.size > 5 * 1024 * 1024 || !verifyImageSignature(thumbFile.path))) {
        cleanupMulterFiles(req);
        return res.status(400).json({ error: 'Invalid video thumbnail. Allowed: JPG, JPEG, PNG, or WEBP (max 5MB).' });
      }

      let productId = null;
      if (req.body.product_id) {
        const product = await queryOne('SELECT id FROM products WHERE id = ? AND business_id = ?', [
          Number(req.body.product_id),
          req.businessId,
        ]);
        if (!product) {
          cleanupMulterFiles(req);
          return res.status(400).json({ error: 'Selected product or service does not belong to this business' });
        }
        productId = product.id;
      }

      const nextVideoPath = videoFile ? videoFile.filename : existing.video_path;
      const nextMimeType = videoFile ? videoFile.mimetype : existing.video_mime_type;
      const nextSize = videoFile ? videoFile.size : existing.file_size_bytes;
      const nextThumbnail = thumbFile ? `/uploads/video-thumbnails/${thumbFile.filename}` : existing.thumbnail_url;

      await execute(
        `UPDATE business_videos
         SET title = ?, description = ?, product_id = ?, video_path = ?, video_mime_type = ?, file_size_bytes = ?, thumbnail_url = ?, updated_at = datetime('now')
         WHERE id = ? AND business_id = ?`,
        [
          req.body.title.trim(),
          (req.body.description || '').trim(),
          productId,
          nextVideoPath,
          nextMimeType,
          nextSize,
          nextThumbnail,
          existing.id,
          req.businessId,
        ]
      );

      if (videoFile && existing.video_path && existing.video_path !== nextVideoPath) {
        removeUploadedFile(path.join(VIDEO_STORAGE_DIR, path.basename(existing.video_path)));
      }
      if (thumbFile && existing.thumbnail_url && existing.thumbnail_url !== nextThumbnail) {
        removeUploadedFile(existing.thumbnail_url);
      }

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'ads.video_updated',
        entityType: 'business_video',
        entityId: existing.id,
        changes: { title: req.body.title.trim(), productId },
        ipAddress: req.ip,
      });

      const updated = await queryOne(
        `SELECT bv.*, p.name AS product_name, p.selling_price AS product_price,
                u.full_name AS author_name, u.avatar_url AS author_avatar
         FROM business_videos bv
         LEFT JOIN products p ON p.id = bv.product_id
         LEFT JOIN users u ON u.id = bv.created_by_user_id
         WHERE bv.id = ?`,
        [existing.id]
      );

      res.json({
        message: 'Promotional video updated successfully.',
        video: {
          ...formatVideoRow(updated),
          admin_stream_url: `/api/ads/videos/${updated.id}/stream`,
        },
      });
    } catch (err) {
      cleanupMulterFiles(req);
      next(err);
    }
  }
);

router.patch('/ads/videos/:id/publish', authenticate, requireBusiness, requirePermission('ads.manage'), async (req, res, next) => {
  try {
    const existing = await queryOne('SELECT * FROM business_videos WHERE id = ? AND business_id = ?', [
      req.params.id,
      req.businessId,
    ]);
    if (!existing) {
      return res.status(404).json({ error: 'Advertisement video not found for this business' });
    }

    const nextPublished = req.body.is_published === undefined
      ? (existing.is_published ? 0 : 1)
      : (req.body.is_published ? 1 : 0);

    await execute(
      `UPDATE business_videos
       SET is_published = ?,
           published_at = CASE WHEN ? = 1 THEN COALESCE(published_at, datetime('now')) ELSE published_at END,
           updated_at = datetime('now')
       WHERE id = ? AND business_id = ?`,
      [nextPublished, nextPublished, existing.id, req.businessId]
    );

    await logAudit({
      businessId: req.businessId,
      userId: req.user.id,
      action: nextPublished ? 'ads.video_published' : 'ads.video_unpublished',
      entityType: 'business_video',
      entityId: existing.id,
      ipAddress: req.ip,
    });

    const updated = await queryOne(
      `SELECT bv.*, p.name AS product_name, p.selling_price AS product_price,
              u.full_name AS author_name, u.avatar_url AS author_avatar
       FROM business_videos bv
       LEFT JOIN products p ON p.id = bv.product_id
       LEFT JOIN users u ON u.id = bv.created_by_user_id
       WHERE bv.id = ?`,
      [existing.id]
    );

    res.json({
      message: nextPublished ? 'Advertisement published to public profile and customer pages.' : 'Advertisement unpublished.',
      video: {
        ...formatVideoRow(updated),
        admin_stream_url: `/api/ads/videos/${updated.id}/stream`,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/ads/videos/:id', authenticate, requireBusiness, requirePermission('ads.manage'), async (req, res, next) => {
  try {
    const existing = await queryOne('SELECT * FROM business_videos WHERE id = ? AND business_id = ?', [
      req.params.id,
      req.businessId,
    ]);
    if (!existing) {
      return res.status(404).json({ error: 'Advertisement video not found for this business' });
    }

    await execute('DELETE FROM business_videos WHERE id = ? AND business_id = ?', [existing.id, req.businessId]);

    if (existing.video_path) {
      removeUploadedFile(path.join(VIDEO_STORAGE_DIR, path.basename(existing.video_path)));
    }
    if (existing.thumbnail_url) {
      removeUploadedFile(existing.thumbnail_url);
    }

    await logAudit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'ads.video_deleted',
      entityType: 'business_video',
      entityId: existing.id,
      changes: { title: existing.title },
      ipAddress: req.ip,
    });

    res.json({ message: 'Promotional video advertisement deleted.' });
  } catch (err) {
    next(err);
  }
});

export default router;
