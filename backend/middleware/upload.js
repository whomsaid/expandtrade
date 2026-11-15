import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

export const UPLOAD_ROOT = path.resolve(process.cwd(), 'backend', 'uploads');
const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');
export const PLATFORM_DIR = path.join(UPLOAD_ROOT, 'platform');
export const VIDEO_THUMB_DIR = path.join(UPLOAD_ROOT, 'video-thumbnails');
export const VIDEO_STORAGE_DIR = path.resolve(process.cwd(), 'backend', 'storage', 'videos');

for (const dir of [UPLOAD_ROOT, AVATAR_DIR, PLATFORM_DIR, VIDEO_THUMB_DIR, VIDEO_STORAGE_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const AVATAR_MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const AVATAR_ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const VIDEO_MIME_TO_EXT = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const VIDEO_ALLOWED_EXT = new Set(['.mp4', '.webm']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext) ? ext : '.bin';
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Unsupported file type. Allowed: JPG, PNG, WebP, PDF (max 5MB).'));
    }
    cb(null, true);
  },
});

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = AVATAR_ALLOWED_EXT.has(ext) ? ext : AVATAR_MIME_TO_EXT[file.mimetype] || '.jpg';
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

export const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mimeOk = Boolean(AVATAR_MIME_TO_EXT[file.mimetype]);
    const extOk = !ext || AVATAR_ALLOWED_EXT.has(ext);
    if (!mimeOk || !extOk) {
      const err = new Error('Unsupported profile image format. Allowed: JPG, JPEG, PNG, and WEBP (max 5MB).');
      err.statusCode = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

const adMediaStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === 'thumbnail') return cb(null, VIDEO_THUMB_DIR);
    return cb(null, VIDEO_STORAGE_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (file.fieldname === 'thumbnail') {
      const safeExt = AVATAR_ALLOWED_EXT.has(ext) ? ext : AVATAR_MIME_TO_EXT[file.mimetype] || '.jpg';
      return cb(null, `${crypto.randomUUID()}${safeExt}`);
    }
    const safeExt = VIDEO_ALLOWED_EXT.has(ext) ? ext : VIDEO_MIME_TO_EXT[file.mimetype] || '.mp4';
    return cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

export const adVideoUpload = multer({
  storage: adMediaStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max video size
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (file.fieldname === 'video') {
      const mimeOk = Boolean(VIDEO_MIME_TO_EXT[file.mimetype]);
      const extOk = !ext || VIDEO_ALLOWED_EXT.has(ext);
      if (!mimeOk || !extOk) {
        const err = new Error('Unsupported video format. Allowed formats: MP4 and WEBM (max 50MB).');
        err.statusCode = 400;
        return cb(err);
      }
      return cb(null, true);
    }
    if (file.fieldname === 'thumbnail') {
      const mimeOk = Boolean(AVATAR_MIME_TO_EXT[file.mimetype]);
      const extOk = !ext || AVATAR_ALLOWED_EXT.has(ext);
      if (!mimeOk || !extOk) {
        const err = new Error('Unsupported thumbnail format. Allowed: JPG, JPEG, PNG, and WEBP (max 5MB).');
        err.statusCode = 400;
        return cb(err);
      }
      return cb(null, true);
    }
    const err = new Error('Unexpected upload field.');
    err.statusCode = 400;
    return cb(err);
  },
});

const PLATFORM_LOGO_MIME_TO_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

const PLATFORM_LOGO_ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);

const platformLogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PLATFORM_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = PLATFORM_LOGO_ALLOWED_EXT.has(ext)
      ? ext
      : PLATFORM_LOGO_MIME_TO_EXT[file.mimetype] || '.png';
    cb(null, `platform-logo-${crypto.randomUUID()}${safeExt}`);
  },
});

export const platformLogoUpload = multer({
  storage: platformLogoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mimeOk = Boolean(PLATFORM_LOGO_MIME_TO_EXT[file.mimetype]);
    const extOk = !ext || PLATFORM_LOGO_ALLOWED_EXT.has(ext);
    if (!mimeOk || !extOk) {
      const err = new Error('Unsupported logo format. Allowed: PNG, JPG, JPEG, SVG, and WEBP (max 5MB).');
      err.statusCode = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

/**
 * Inspect actual binary magic bytes so spoofed extensions or MIME headers are rejected.
 */
export function verifyImageSignature(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (bytesRead < 4) return false;

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytesRead >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return true;
    }
    // WEBP: RIFF....WEBP
    if (
      bytesRead >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function verifyPlatformLogoFile(filePath, mimetype) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (mimetype === 'image/svg+xml' || ext === '.svg') {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const trimmed = raw.trim();
      if (!trimmed.includes('<svg') || !trimmed.includes('</svg>')) return false;
      const unsafePatterns = [
        /<script[\s>]/i,
        /on[a-z]+\s*=/i,
        /javascript\s*:/i,
        /vbscript\s*:/i,
        /<foreignObject[\s>]/i,
        /<iframe[\s>]/i,
        /<object[\s>]/i,
        /<embed[\s>]/i,
        /data\s*:\s*text\/html/i,
      ];
      return !unsafePatterns.some((re) => re.test(raw));
    } catch {
      return false;
    }
  }
  return verifyImageSignature(filePath);
}

/**
 * Verify binary container header for MP4 (ISO BMFF 'ftyp') or WEBM (EBML 0x1A 0x45 0xDF 0xA3).
 */
export function verifyVideoSignature(filePath, mimetype) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(32);
    const bytesRead = fs.readSync(fd, buf, 0, 32, 0);
    fs.closeSync(fd);
    if (bytesRead < 8) return false;

    const isMp4 = buf.toString('ascii', 4, 8) === 'ftyp';
    const isWebm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;

    if (mimetype === 'video/mp4') return isMp4;
    if (mimetype === 'video/webm') return isWebm;
    return isMp4 || isWebm;
  } catch {
    return false;
  }
}

export function removeUploadedFile(filePathOrUrl) {
  if (!filePathOrUrl) return;
  try {
    let target = filePathOrUrl;
    if (filePathOrUrl.startsWith('/uploads/')) {
      const rel = filePathOrUrl.slice('/uploads/'.length);
      target = path.resolve(UPLOAD_ROOT, rel);
    } else {
      target = path.resolve(filePathOrUrl);
    }
    const allowedRoots = [UPLOAD_ROOT + path.sep, VIDEO_STORAGE_DIR + path.sep];
    if (!allowedRoots.some((root) => target.startsWith(root))) return;
    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      fs.unlinkSync(target);
    }
  } catch {
    // ignore cleanup errors
  }
}

export function cleanupMulterFiles(req) {
  if (req?.file?.path) removeUploadedFile(req.file.path);
  if (req?.files && typeof req.files === 'object') {
    const list = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
    for (const f of list) {
      if (f?.path) removeUploadedFile(f.path);
    }
  }
}
