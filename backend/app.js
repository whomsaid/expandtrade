import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

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
      res.status(500).json({ status: 'error', error: err.message });
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

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  app.use(errorHandler);
  return app;
}
