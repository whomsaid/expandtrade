import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { getDialect, query, queryOne } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { httpCompressionMiddleware } from './middleware/compression.js';
import { getCached, setCached } from './services/cacheService.js';
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
import searchRoutes from './routes/searchRoutes.js';
import { recordMonitoringEvent } from './services/monitoringService.js';

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function createBackendApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(httpCompressionMiddleware);
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

  // Search Engine Optimization: robots.txt & dynamic sitemap.xml
  app.get('/robots.txt', (req, res) => {
    const origin = env.appUrl || `${req.protocol}://${req.get('host')}`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(
      [
        'User-agent: *',
        'Allow: /',
        'Allow: /businesses',
        'Allow: /jobs',
        'Allow: /features',
        'Allow: /pricing',
        'Allow: /about',
        'Allow: /contact',
        'Disallow: /app/',
        'Disallow: /api/',
        'Disallow: /customer',
        `Sitemap: ${origin.replace(/\/$/, '')}/sitemap.xml`,
      ].join('\n')
    );
  });

  app.get('/sitemap.xml', async (req, res) => {
    try {
      const origin = (env.appUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const cacheKey = `seo:sitemap:${origin}`;
      const cached = getCached(cacheKey);
      if (cached) {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=120');
        return res.send(cached);
      }

      const [businesses, jobs] = await Promise.all([
        query(
          `SELECT slug, updated_at FROM businesses
           WHERE status = 'active' AND is_public_listed = 1 AND deleted_at IS NULL
           ORDER BY id DESC LIMIT 500`
        ),
        query(
          `SELECT v.id, v.updated_at FROM job_vacancies v
           JOIN businesses b ON b.id = v.business_id
           WHERE v.status = 'published' AND b.status = 'active' AND b.is_public_listed = 1 AND b.deleted_at IS NULL
           ORDER BY v.id DESC LIMIT 500`
        ),
      ]);

      const staticPaths = [
        { loc: '/', changefreq: 'daily', priority: '1.0' },
        { loc: '/businesses', changefreq: 'daily', priority: '0.9' },
        { loc: '/jobs', changefreq: 'daily', priority: '0.9' },
        { loc: '/features', changefreq: 'weekly', priority: '0.8' },
        { loc: '/pricing', changefreq: 'weekly', priority: '0.8' },
        { loc: '/about', changefreq: 'monthly', priority: '0.7' },
        { loc: '/contact', changefreq: 'monthly', priority: '0.7' },
        { loc: '/track-order', changefreq: 'weekly', priority: '0.6' },
      ];

      const urls = [
        ...staticPaths.map(
          (item) =>
            `  <url><loc>${escapeXml(`${origin}${item.loc}`)}</loc><changefreq>${item.changefreq}</changefreq><priority>${item.priority}</priority></url>`
        ),
        ...businesses.map((b) => {
          const lastmod = b.updated_at ? `<lastmod>${escapeXml(String(b.updated_at).slice(0, 10))}</lastmod>` : '';
          return `  <url><loc>${escapeXml(`${origin}/businesses/${b.slug}`)}</loc>${lastmod}<changefreq>daily</changefreq><priority>0.8</priority></url>`;
        }),
        ...jobs.map((j) => {
          const lastmod = j.updated_at ? `<lastmod>${escapeXml(String(j.updated_at).slice(0, 10))}</lastmod>` : '';
          return `  <url><loc>${escapeXml(`${origin}/jobs/${j.id}`)}</loc>${lastmod}<changefreq>daily</changefreq><priority>0.7</priority></url>`;
        }),
      ];

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
      setCached(cacheKey, xml, 60_000);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.send(xml);
    } catch {
      res.status(500).type('text/plain').send('Unable to generate sitemap');
    }
  });

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
  app.use('/api', searchRoutes);
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
