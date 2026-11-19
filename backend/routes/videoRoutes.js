import crypto from 'node:crypto';
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
  MAX_VIDEO_FILE_BYTES,
  removeChunkSessionDir,
  removeUploadedFile,
  verifyFileNonEmpty,
  verifyImageSignature,
  verifyVideoSignature,
  VIDEO_CHUNKS_DIR,
  VIDEO_STORAGE_DIR,
  videoChunkUpload,
  videoThumbUpload,
} from '../middleware/upload.js';
import { logAudit } from '../services/auditService.js';
import { createBackgroundJob, getBackgroundJob, updateBackgroundJob } from '../services/jobService.js';

const router = express.Router();

const MAX_STREAM_CHUNK_BYTES = 1024 * 1024; // 1MB progressive streaming window
const DEFAULT_UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024; // 2MB resumable chunk size

function disableRequestTimeout(req, res, next) {
  req.setTimeout(0);
  res.setTimeout(0);
  next();
}

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
    const requestedEnd = match[2] ? Number(match[2]) : Math.min(start + MAX_STREAM_CHUNK_BYTES - 1, total - 1);
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

function scanSessionChunksOnDisk(session) {
  const uploadedChunks = [];
  let uploadedBytes = 0;
  if (!session?.temp_dir || !fs.existsSync(session.temp_dir)) {
    return { uploadedChunks, uploadedBytes };
  }
  for (let i = 0; i < session.total_chunks; i += 1) {
    const partPath = path.join(session.temp_dir, `chunk_${i}.part`);
    if (fs.existsSync(partPath)) {
      try {
        const stat = fs.statSync(partPath);
        if (stat.isFile() && stat.size > 0) {
          uploadedChunks.push(i);
          uploadedBytes += stat.size;
        }
      } catch {
        // skip unreadable part
      }
    }
  }
  return { uploadedChunks, uploadedBytes };
}

function appendFileToWriteStream(srcPath, writeStream) {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(srcPath, { highWaterMark: 256 * 1024 });
    readStream.on('error', reject);
    readStream.on('end', resolve);
    readStream.pipe(writeStream, { end: false });
  });
}

async function loadUploadSession(req, res, next) {
  try {
    const session = await queryOne(
      'SELECT * FROM video_upload_sessions WHERE upload_id = ? AND business_id = ?',
      [req.params.uploadId, req.businessId]
    );
    if (!session) {
      return res.status(404).json({ error: 'Video upload session not found for this business.' });
    }
    req.uploadSession = session;
    next();
  } catch (err) {
    next(err);
  }
}

async function finalizeChunkedVideoJob({ session, jobId, ipAddress }) {
  const ext = path.extname(session.original_filename || '').toLowerCase() === '.webm' || session.video_mime_type === 'video/webm'
    ? '.webm'
    : '.mp4';
  const finalFilename = `${crypto.randomUUID()}${ext}`;
  const finalAbsPath = path.join(VIDEO_STORAGE_DIR, finalFilename);

  try {
    await updateBackgroundJob(jobId, { status: 'processing', progress: 10, stageLabel: 'processing' });

    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(finalAbsPath);
      ws.on('error', reject);
      ws.on('finish', resolve);

      (async () => {
        for (let i = 0; i < session.total_chunks; i += 1) {
          const partPath = path.join(session.temp_dir, `chunk_${i}.part`);
          if (!fs.existsSync(partPath)) {
            throw new Error(`Missing chunk ${i} during assembly.`);
          }
          await appendFileToWriteStream(partPath, ws);
          if (i % 5 === 0 || i === session.total_chunks - 1) {
            const pct = 10 + Math.round(((i + 1) / session.total_chunks) * 60);
            await updateBackgroundJob(jobId, { status: 'processing', progress: pct, stageLabel: 'processing' });
          }
        }
        ws.end();
      })().catch((err) => {
        ws.destroy();
        reject(err);
      });
    });

    if (!fs.existsSync(finalAbsPath)) {
      throw new Error('Assembled video file could not be verified on storage.');
    }
    const finalStat = fs.statSync(finalAbsPath);
    if (finalStat.size !== Number(session.total_size_bytes) || finalStat.size <= 0) {
      throw new Error(`Uploaded file size mismatch (${finalStat.size} vs expected ${session.total_size_bytes} bytes).`);
    }
    if (!verifyVideoSignature(finalAbsPath, session.video_mime_type)) {
      throw new Error('Assembled video failed format header verification. Upload a valid MP4 or WEBM file.');
    }

    await updateBackgroundJob(jobId, { status: 'processing', progress: 85, stageLabel: 'saving' });

    let savedVideoId = null;
    if (session.editing_video_id) {
      const existing = await queryOne(
        'SELECT * FROM business_videos WHERE id = ? AND business_id = ?',
        [session.editing_video_id, session.business_id]
      );
      if (!existing) {
        throw new Error('Target advertisement video no longer exists for this business.');
      }

      const nextThumb = session.thumbnail_url || existing.thumbnail_url;
      await execute(
        `UPDATE business_videos
         SET title = ?, description = ?, product_id = ?, video_path = ?, video_mime_type = ?, file_size_bytes = ?, thumbnail_url = ?, updated_at = datetime('now')
         WHERE id = ? AND business_id = ?`,
        [
          session.title,
          session.description || '',
          session.product_id || null,
          finalFilename,
          session.video_mime_type,
          finalStat.size,
          nextThumb,
          existing.id,
          session.business_id,
        ]
      );
      savedVideoId = existing.id;

      if (existing.video_path && existing.video_path !== finalFilename) {
        removeUploadedFile(path.join(VIDEO_STORAGE_DIR, path.basename(existing.video_path)));
      }
      if (session.thumbnail_url && existing.thumbnail_url && existing.thumbnail_url !== session.thumbnail_url) {
        removeUploadedFile(existing.thumbnail_url);
      }

      await logAudit({
        businessId: session.business_id,
        userId: session.user_id,
        action: 'ads.video_updated',
        entityType: 'business_video',
        entityId: existing.id,
        changes: { title: session.title, productId: session.product_id || null },
        ipAddress,
      });
    } else {
      const publishFlag = session.is_published ? 1 : 0;
      const ins = await execute(
        `INSERT INTO business_videos
           (business_id, created_by_user_id, product_id, title, description, video_path, video_mime_type, file_size_bytes, thumbnail_url, is_published, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END)`,
        [
          session.business_id,
          session.user_id,
          session.product_id || null,
          session.title,
          session.description || '',
          finalFilename,
          session.video_mime_type,
          finalStat.size,
          session.thumbnail_url || null,
          publishFlag,
          publishFlag,
        ]
      );
      savedVideoId = ins.insertId;

      await logAudit({
        businessId: session.business_id,
        userId: session.user_id,
        action: 'ads.video_created',
        entityType: 'business_video',
        entityId: savedVideoId,
        changes: { title: session.title, productId: session.product_id || null, is_published: Boolean(publishFlag) },
        ipAddress,
      });
    }

    const saved = await queryOne(
      `SELECT bv.*, p.name AS product_name, p.selling_price AS product_price,
              u.full_name AS author_name, u.avatar_url AS author_avatar
       FROM business_videos bv
       LEFT JOIN products p ON p.id = bv.product_id
       LEFT JOIN users u ON u.id = bv.created_by_user_id
       WHERE bv.id = ? AND bv.business_id = ?`,
      [savedVideoId, session.business_id]
    );
    if (!saved || !fs.existsSync(path.join(VIDEO_STORAGE_DIR, path.basename(saved.video_path)))) {
      throw new Error('Database and storage post-save verification failed.');
    }

    await execute(
      `UPDATE video_upload_sessions
       SET status = 'completed', video_id = ?, updated_at = datetime('now')
       WHERE upload_id = ?`,
      [saved.id, session.upload_id]
    );

    removeChunkSessionDir(session.temp_dir);

    const payloadVideo = {
      ...formatVideoRow(saved),
      admin_stream_url: `/api/ads/videos/${saved.id}/stream`,
    };
    await updateBackgroundJob(jobId, {
      status: 'completed',
      progress: 100,
      stageLabel: 'completed',
      result: {
        message: session.editing_video_id
          ? 'Promotional video updated and verified successfully.'
          : saved.is_published
            ? 'Promotional video uploaded, verified, and published.'
            : 'Promotional video uploaded and saved as draft for preview.',
        video: payloadVideo,
      },
    });
  } catch (err) {
    removeUploadedFile(finalAbsPath);
    await execute(
      `UPDATE video_upload_sessions
       SET status = 'failed', error_message = ?, updated_at = datetime('now')
       WHERE upload_id = ?`,
      [err.message || 'Video processing failed', session.upload_id]
    );
    await updateBackgroundJob(jobId, {
      status: 'failed',
      stageLabel: 'failed',
      errorMessage: err.message || 'Video processing failed',
    });
  }
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

// ================= RESUMABLE CHUNKED VIDEO UPLOAD ENDPOINTS (NO TIME LIMIT) =================
router.post(
  '/ads/videos/uploads/init',
  authenticate,
  requireBusiness,
  requirePermission('ads.manage'),
  disableRequestTimeout,
  videoThumbUpload.single('thumbnail'),
  [
    body('title').trim().isLength({ min: 2, max: 160 }).withMessage('Video title is required (2–160 characters)'),
    body('description').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
    body('filename').trim().notEmpty().withMessage('Original video filename is required'),
    body('total_size_bytes').isInt({ min: 1, max: MAX_VIDEO_FILE_BYTES }).withMessage(`Video size must be between 1 byte and ${Math.round(MAX_VIDEO_FILE_BYTES / (1024 * 1024))}MB`),
    body('product_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Invalid product selection'),
    body('editing_video_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Invalid video reference'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const thumbFile = req.file || null;
      if (thumbFile) {
        if (!verifyFileNonEmpty(thumbFile) || thumbFile.size > 5 * 1024 * 1024 || !verifyImageSignature(thumbFile.path)) {
          cleanupMulterFiles(req);
          return res.status(400).json({ error: 'Invalid or empty video thumbnail. Allowed: JPG, JPEG, PNG, or WEBP (max 5MB).' });
        }
      }

      const originalFilename = String(req.body.filename || '').trim();
      const ext = path.extname(originalFilename).toLowerCase();
      const rawMime = String(req.body.mimetype || '').toLowerCase();
      if (!['.mp4', '.webm'].includes(ext) && !['video/mp4', 'video/webm'].includes(rawMime)) {
        cleanupMulterFiles(req);
        return res.status(400).json({ error: 'Unsupported video format. Allowed: MP4 and WEBM.' });
      }
      const canonicalMime = rawMime === 'video/webm' || (rawMime !== 'video/mp4' && ext === '.webm') ? 'video/webm' : 'video/mp4';

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

      let editingVideoId = null;
      if (req.body.editing_video_id) {
        const existing = await queryOne('SELECT id FROM business_videos WHERE id = ? AND business_id = ?', [
          Number(req.body.editing_video_id),
          req.businessId,
        ]);
        if (!existing) {
          cleanupMulterFiles(req);
          return res.status(404).json({ error: 'Target advertisement video not found for this business' });
        }
        editingVideoId = existing.id;
      }

      const totalSizeBytes = Number(req.body.total_size_bytes);
      const requestedChunk = Number(req.body.chunk_size_bytes || DEFAULT_UPLOAD_CHUNK_BYTES);
      const chunkSizeBytes = Math.max(64 * 1024, Math.min(16 * 1024 * 1024, Number.isFinite(requestedChunk) ? requestedChunk : DEFAULT_UPLOAD_CHUNK_BYTES));
      const totalChunks = Math.ceil(totalSizeBytes / chunkSizeBytes);
      const uploadId = crypto.randomUUID();
      const tempDir = path.join(VIDEO_CHUNKS_DIR, uploadId);
      fs.mkdirSync(tempDir, { recursive: true });

      const publishFlag = req.body.is_published === '1' || req.body.is_published === 'true' || req.body.is_published === true ? 1 : 0;
      const thumbnailUrl = thumbFile ? `/uploads/video-thumbnails/${thumbFile.filename}` : null;

      await execute(
        `INSERT INTO video_upload_sessions
           (upload_id, business_id, user_id, editing_video_id, product_id, title, description, is_published, original_filename, video_mime_type, total_size_bytes, chunk_size_bytes, total_chunks, uploaded_chunks_json, thumbnail_url, temp_dir, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, 'uploading')`,
        [
          uploadId,
          req.businessId,
          req.user.id,
          editingVideoId,
          productId,
          req.body.title.trim(),
          (req.body.description || '').trim(),
          publishFlag,
          originalFilename,
          canonicalMime,
          totalSizeBytes,
          chunkSizeBytes,
          totalChunks,
          thumbnailUrl,
          tempDir,
        ]
      );

      res.status(201).json({
        uploadId,
        chunkSize: chunkSizeBytes,
        totalChunks,
        totalSizeBytes,
        uploadedChunks: [],
        uploadedBytes: 0,
        status: 'uploading',
      });
    } catch (err) {
      cleanupMulterFiles(req);
      next(err);
    }
  }
);

router.get(
  '/ads/videos/uploads/:uploadId',
  authenticate,
  requireBusiness,
  requirePermission('ads.view'),
  loadUploadSession,
  async (req, res, next) => {
    try {
      const session = req.uploadSession;
      const { uploadedChunks, uploadedBytes } = scanSessionChunksOnDisk(session);
      const job = session.job_id ? await getBackgroundJob(session.job_id) : null;
      res.json({
        uploadId: session.upload_id,
        title: session.title,
        description: session.description || '',
        productId: session.product_id,
        editingVideoId: session.editing_video_id,
        filename: session.original_filename,
        mimetype: session.video_mime_type,
        totalSizeBytes: Number(session.total_size_bytes),
        chunkSize: Number(session.chunk_size_bytes),
        totalChunks: Number(session.total_chunks),
        uploadedChunks,
        uploadedBytes,
        status: session.status,
        jobId: session.job_id,
        job,
        videoId: session.video_id,
        errorMessage: session.error_message,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/ads/videos/uploads/:uploadId/chunk/:chunkIndex',
  authenticate,
  requireBusiness,
  requirePermission('ads.manage'),
  disableRequestTimeout,
  loadUploadSession,
  (req, res, next) => {
    const idx = Number(req.params.chunkIndex);
    const session = req.uploadSession;
    if (!Number.isInteger(idx) || idx < 0 || idx >= session.total_chunks) {
      return res.status(400).json({ error: 'Invalid chunk index for this upload session.' });
    }
    if (session.status !== 'uploading') {
      return res.status(409).json({ error: `Cannot upload chunk while session status is "${session.status}".` });
    }
    return next();
  },
  videoChunkUpload.single('chunk'),
  async (req, res, next) => {
    try {
      const session = req.uploadSession;
      const idx = Number(req.params.chunkIndex);
      const chunkFile = req.file;
      if (!chunkFile || !verifyFileNonEmpty(chunkFile)) {
        if (chunkFile?.path && fs.existsSync(chunkFile.path)) fs.unlinkSync(chunkFile.path);
        return res.status(400).json({ error: 'Empty or missing video chunk payload.' });
      }

      if (idx === 0 && !verifyVideoSignature(chunkFile.path, session.video_mime_type)) {
        fs.unlinkSync(chunkFile.path);
        return res.status(400).json({ error: 'Invalid or corrupted video header. Only valid MP4 and WEBM files are allowed.' });
      }

      const finalPartPath = path.join(session.temp_dir, `chunk_${idx}.part`);
      fs.renameSync(chunkFile.path, finalPartPath);

      const { uploadedChunks, uploadedBytes } = scanSessionChunksOnDisk(session);
      await execute(
        `UPDATE video_upload_sessions
         SET uploaded_chunks_json = ?, updated_at = datetime('now')
         WHERE upload_id = ?`,
        [JSON.stringify(uploadedChunks), session.upload_id]
      );

      res.json({
        uploadId: session.upload_id,
        chunkIndex: idx,
        uploadedChunks,
        uploadedBytes,
        totalSizeBytes: Number(session.total_size_bytes),
        totalChunks: Number(session.total_chunks),
      });
    } catch (err) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      }
      next(err);
    }
  }
);

router.post(
  '/ads/videos/uploads/:uploadId/complete',
  authenticate,
  requireBusiness,
  requirePermission('ads.manage'),
  loadUploadSession,
  async (req, res, next) => {
    try {
      const session = req.uploadSession;

      if (session.status === 'completed' && session.job_id) {
        const existingJob = await getBackgroundJob(session.job_id);
        return res.json({ message: 'Video upload already completed.', uploadId: session.upload_id, jobId: session.job_id, job: existingJob });
      }
      if (session.status === 'processing' && session.job_id) {
        const existingJob = await getBackgroundJob(session.job_id);
        return res.status(202).json({ message: 'Video finalization already in progress.', uploadId: session.upload_id, jobId: session.job_id, job: existingJob });
      }
      if (session.status === 'cancelled') {
        return res.status(409).json({ error: 'This upload session was cancelled.' });
      }

      const { uploadedChunks, uploadedBytes } = scanSessionChunksOnDisk(session);
      const missingChunks = [];
      const uploadedSet = new Set(uploadedChunks);
      for (let i = 0; i < session.total_chunks; i += 1) {
        if (!uploadedSet.has(i)) missingChunks.push(i);
      }

      if (missingChunks.length > 0 || uploadedBytes !== Number(session.total_size_bytes)) {
        return res.status(400).json({
          error: 'Upload is incomplete. Some video chunks have not been received yet.',
          missingChunks,
          uploadedChunks,
          uploadedBytes,
          expectedBytes: Number(session.total_size_bytes),
        });
      }

      const job = await createBackgroundJob({
        businessId: req.businessId,
        userId: req.user.id,
        jobType: 'video_finalize',
        stageLabel: 'processing',
      });

      await execute(
        `UPDATE video_upload_sessions
         SET status = 'processing', job_id = ?, error_message = NULL, updated_at = datetime('now')
         WHERE upload_id = ?`,
        [job.id, session.upload_id]
      );

      setImmediate(() => {
        finalizeChunkedVideoJob({
          session: { ...session, job_id: job.id },
          jobId: job.id,
          ipAddress: req.ip,
        });
      });

      res.status(202).json({
        message: 'Video upload received. Assembling, verifying, and saving video...',
        uploadId: session.upload_id,
        jobId: job.id,
        job,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/ads/videos/uploads/:uploadId',
  authenticate,
  requireBusiness,
  requirePermission('ads.manage'),
  loadUploadSession,
  async (req, res, next) => {
    try {
      const session = req.uploadSession;
      if (session.status !== 'completed') {
        removeChunkSessionDir(session.temp_dir);
        if (session.thumbnail_url) {
          const used = await queryOne('SELECT id FROM business_videos WHERE thumbnail_url = ?', [session.thumbnail_url]);
          if (!used) removeUploadedFile(session.thumbnail_url);
        }
        await execute(
          `UPDATE video_upload_sessions
           SET status = 'cancelled', updated_at = datetime('now')
           WHERE upload_id = ?`,
          [session.upload_id]
        );
        if (session.job_id) {
          const job = await getBackgroundJob(session.job_id);
          if (job && ['queued', 'processing'].includes(job.status)) {
            await updateBackgroundJob(session.job_id, { status: 'cancelled', stageLabel: 'cancelled' });
          }
        }
      }
      res.json({ message: 'Upload session cancelled and temporary chunks cleaned up.' });
    } catch (err) {
      next(err);
    }
  }
);

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
      'SELECT id, avatar_url, must_change_password, is_active, is_platform_admin FROM users WHERE id = ?',
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
    if (!user.is_platform_admin && businessId && businessId !== video.business_id) {
      return res.status(403).json({ error: 'Tenant isolation violation' });
    }

    if (!user.is_platform_admin) {
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
  disableRequestTimeout,
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
        return res.status(400).json({ error: 'Promotional video file is required (MP4 or WEBM, max 250MB).' });
      }

      if (!verifyFileNonEmpty(videoFile) || !verifyVideoSignature(videoFile.path, videoFile.mimetype)) {
        cleanupMulterFiles(req);
        return res.status(400).json({ error: 'Invalid or empty video file. Only valid MP4 and WEBM files are allowed.' });
      }

      if (thumbFile) {
        if (!verifyFileNonEmpty(thumbFile) || thumbFile.size > 5 * 1024 * 1024 || !verifyImageSignature(thumbFile.path)) {
          cleanupMulterFiles(req);
          return res.status(400).json({ error: 'Invalid or empty video thumbnail. Allowed: JPG, JPEG, PNG, or WEBP (max 5MB).' });
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

      const storedVideoPath = path.resolve(VIDEO_STORAGE_DIR, path.basename(videoFile.filename));
      if (!fs.existsSync(storedVideoPath) || fs.statSync(storedVideoPath).size <= 0) {
        cleanupMulterFiles(req);
        return res.status(500).json({ error: 'Video storage verification failed. Please retry.' });
      }

      const publishFlag = req.body.is_published === '1' || req.body.is_published === 'true' || req.body.is_published === true ? 1 : 0;
      const thumbnailUrl = thumbFile ? `/uploads/video-thumbnails/${thumbFile.filename}` : null;
      const videoExt = path.extname(videoFile.filename || videoFile.originalname || '').toLowerCase();
      const canonicalVideoMime =
        videoFile.mimetype === 'video/webm' || (videoFile.mimetype !== 'video/mp4' && videoExt === '.webm')
          ? 'video/webm'
          : 'video/mp4';

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
          canonicalVideoMime,
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
  disableRequestTimeout,
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

      if (videoFile && (!verifyFileNonEmpty(videoFile) || !verifyVideoSignature(videoFile.path, videoFile.mimetype))) {
        cleanupMulterFiles(req);
        return res.status(400).json({ error: 'Invalid or empty video file. Only valid MP4 and WEBM files are allowed.' });
      }
      if (thumbFile && (!verifyFileNonEmpty(thumbFile) || thumbFile.size > 5 * 1024 * 1024 || !verifyImageSignature(thumbFile.path))) {
        cleanupMulterFiles(req);
        return res.status(400).json({ error: 'Invalid or empty video thumbnail. Allowed: JPG, JPEG, PNG, or WEBP (max 5MB).' });
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

      if (videoFile) {
        const storedVideoPath = path.resolve(VIDEO_STORAGE_DIR, path.basename(videoFile.filename));
        if (!fs.existsSync(storedVideoPath) || fs.statSync(storedVideoPath).size <= 0) {
          cleanupMulterFiles(req);
          return res.status(500).json({ error: 'Video storage verification failed. Please retry.' });
        }
      }

      const nextVideoPath = videoFile ? videoFile.filename : existing.video_path;
      const nextVideoExt = videoFile ? path.extname(videoFile.filename || videoFile.originalname || '').toLowerCase() : '';
      const nextMimeType = videoFile
        ? (videoFile.mimetype === 'video/webm' || (videoFile.mimetype !== 'video/mp4' && nextVideoExt === '.webm')
            ? 'video/webm'
            : 'video/mp4')
        : existing.video_mime_type;
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

    const storedPath = path.resolve(VIDEO_STORAGE_DIR, path.basename(existing.video_path || ''));
    if (!fs.existsSync(storedPath) || fs.statSync(storedPath).size <= 0) {
      return res.status(400).json({ error: 'Cannot publish: video file is missing from storage.' });
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
