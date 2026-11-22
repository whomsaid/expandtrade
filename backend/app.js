import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { getDialect, queryOne } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import businessRoutes from './routes/businessRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import operationsRoutes from './routes/operationsRoutes.js';
import collaborationRoutes from './routes/collaborationRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import videoRoutes from './routes/videoRoutes.js';
import recruitmentRoutes from './routes/recruitmentRoutes.js';
import payrollRoutes from './routes/payrollRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import monitoringRoutes from './routes/monitoringRoutes.js';
import { recordMonitoringEvent } from './services/monitoringService.js';

export function createBackendApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      frameguard: false,
    })
  );

  const corsOptions =
    env.nodeEnv === 'production' && env.corsOrigins.length > 0
      ? {
          origin(origin, cb) {
            if (!origin || env.corsOrigins.includes(origin) || origin === env.appUrl) {
              return cb(null, true);
            }
            return cb(new Error('Origin not allowed by CORS policy'));
          },
          credentials: true,
        }
      : { origin: true, credentials: true };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api', (req, res, next) => {
    const start = performance.now();
    if (req.path.startsWith('/auth') || req.headers.authorization || req.headers['x-business-id']) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }
    res.on('finish', () => {
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      if (durationMs > 2500 && !req.path.startsWith('/ads/videos/uploads')) {
        void recordMonitoringEvent({
          severity: 'warning',
          category: 'performance',
          module: req.path,
          message: `Slow API response (${durationMs}ms) on ${req.method} ${req.originalUrl}`,
          meta: { statusCode: res.statusCode, durationMs },
        });
      }
      if (res.statusCode === 403 && req.path !== '/auth/me') {
        void recordMonitoringEvent({
          severity: 'info',
          category: 'security',
          module: req.path,
          message: `Access denied (403) on ${req.method} ${req.path}`,
          meta: { ip: req.ip },
        });
      }
    });
    next();
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.path.startsWith('/ads/videos/uploads') ||
      req.path.startsWith('/jobs/'),
  });

  app.use('/uploads', express.static(path.resolve(process.cwd(), 'backend', 'uploads'), { maxAge: '7d' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await queryOne('SELECT 1 AS ok');
      res.json({
        status: 'ok',
        platform: 'BizTrade Africa',
        dialect: getDialect(),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: 'Service temporarily unavailable' });
    }
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api', apiLimiter);
  app.use('/api', jobRoutes);
  app.use('/api', payrollRoutes);
  app.use('/api', businessRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', salesRoutes);
  app.use('/api', operationsRoutes);
  app.use('/api', collaborationRoutes);
  app.use('/api', customerRoutes);
  app.use('/api', videoRoutes);
  app.use('/api', recruitmentRoutes);
  app.use('/api', monitoringRoutes);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  app.use(errorHandler);
  return app;
}
