import { validationResult } from 'express-validator';
import { cleanupMulterFiles } from './upload.js';

export function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    cleanupMulterFiles(req);
    return res.status(422).json({
      error: errors.array()[0].msg || 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array(),
    });
  }
  next();
}

export function errorHandler(err, req, res, _next) {
  let status = Number(err.statusCode || err.status || 500);
  let message = err.message || 'Internal server error';
  let code = err.code || undefined;

  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && status === 400)) {
    status = 400;
    message = 'Malformed JSON request payload.';
    code = 'INVALID_JSON';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'Uploaded file exceeds the maximum allowed size limit.';
    code = 'FILE_TOO_LARGE';
  } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' || err.name === 'MulterError') {
    status = 400;
    message = err.message || 'Invalid file upload request.';
    code = err.code || 'UPLOAD_ERROR';
  } else if (err.message?.includes('Unsupported') || err.message?.includes('Invalid or unsafe')) {
    status = 400;
  } else if (
    err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    err.code === 'ER_DUP_ENTRY' ||
    err.errcode === 2067 ||
    err.errcode === 1555 ||
    err.errcode === 2579 ||
    (err.message && /UNIQUE constraint failed/i.test(err.message))
  ) {
    status = 409;
    message = 'A record with this unique value already exists.';
    code = 'DUPLICATE_CONFLICT';
  } else if (
    err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
    err.code === 'ER_NO_REFERENCED_ROW_2' ||
    err.errcode === 787 ||
    err.errcode === 1811 ||
    (err.message && /FOREIGN KEY constraint failed/i.test(err.message))
  ) {
    status = 400;
    message = 'Referenced record does not exist or cannot be linked.';
    code = 'INVALID_REFERENCE';
  } else if (
    err.code === 'SQLITE_BUSY' ||
    err.errcode === 5 ||
    err.errcode === 6 ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'PROTOCOL_CONNECTION_LOST' ||
    err.code === 'ETIMEDOUT'
  ) {
    status = 503;
    message = 'Database service is temporarily busy. Please try again.';
    code = 'SERVICE_UNAVAILABLE';
  }

  if (!res.headersSent && status >= 400) {
    cleanupMulterFiles(req);
  }

  if (status >= 500) {
    console.error('[API Error]', err);
    import('../services/monitoringService.js')
      .then(({ recordMonitoringEvent }) =>
        recordMonitoringEvent({
          severity: 'critical',
          category: 'error',
          module: req.path || 'api',
          message: `Unhandled server error (${status}) on ${req.method} ${req.originalUrl}: ${String(err?.message || '').slice(0, 180)}`,
          notifySuperAdmins: true,
        })
      )
      .catch(() => {});
  }
  res.status(status).json({
    error: status >= 500 && status !== 503 ? 'Something went wrong on our end. Please try again shortly.' : message,
    ...(code ? { code } : {}),
  });
}
