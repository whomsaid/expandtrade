import { validationResult } from 'express-validator';
import { cleanupMulterFiles } from './upload.js';

export function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    cleanupMulterFiles(req);
    return res.status(400).json({
      error: errors.array()[0].msg || 'Validation failed',
      details: errors.array(),
    });
  }
  next();
}

export function errorHandler(err, req, res, _next) {
  if (!res.headersSent && (err.statusCode || 500) >= 400) {
    cleanupMulterFiles(req);
  }

  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 400;
    message = 'Uploaded file exceeds the maximum allowed size limit.';
  } else if (err.name === 'MulterError') {
    status = 400;
  } else if (err.message?.includes('Unsupported')) {
    status = 400;
  }

  if (status >= 500) {
    console.error('[API Error]', err);
  }
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : message,
  });
}
