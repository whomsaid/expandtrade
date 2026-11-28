import express from 'express';
import { getDialect, query, queryOne, execute } from '../config/db.js';
import { authenticate, requirePlatformAdmin } from '../middleware/auth.js';
import { isSmtpConfigured } from '../services/mailService.js';
import { getCacheStats, resetCacheStats } from '../services/cacheService.js';
import { getLiveDiagnosticsSnapshot, resetMetricsWindow } from '../services/metricsService.js';
import {
  recordMonitoringEvent,
  runSystemVerificationSuite,
  seedRequirementsRegister,
} from '../services/monitoringService.js';

const router = express.Router();

// Super Admin ONLY: Monitoring Dashboard Overview + Verification Register
router.get('/admin/monitoring/overview', authenticate, requirePlatformAdmin, async (_req, res, next) => {
  try {
    await seedRequirementsRegister();
    const [requirements, recentRuns, recentEvents, stats] = await Promise.all([
      query('SELECT * FROM requirements_register ORDER BY requirement_id ASC'),
      query('SELECT * FROM monitoring_runs ORDER BY id DESC LIMIT 20'),
      query('SELECT * FROM monitoring_events ORDER BY id DESC LIMIT 50'),
      queryOne(`
        SELECT
          (SELECT COUNT(*) FROM monitoring_events WHERE severity = 'critical' AND resolved = 0) AS unresolved_critical,
          (SELECT COUNT(*) FROM monitoring_events WHERE category = 'security' AND resolved = 0) AS security_alerts,
          (SELECT COUNT(*) FROM login_attempts WHERE was_successful = 0) AS failed_logins_total,
          (SELECT COUNT(*) FROM businesses WHERE deleted_at IS NULL) AS active_businesses,
          (SELECT COUNT(*) FROM users WHERE is_active = 1) AS active_users
      `),
    ]);

    res.json({
      systemHealth: {
        dialect: getDialect(),
        smtpConfigured: isSmtpConfigured(),
        uptimeSeconds: Math.round(process.uptime()),
        memoryRssMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      },
      stats: stats || {},
      requirements,
      recentRuns,
      recentEvents,
    });
  } catch (err) {
    next(err);
  }
});

// Super Admin ONLY: Trigger repeatable verification suite on demand
router.post('/admin/monitoring/run', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const result = await runSystemVerificationSuite({
      triggerType: 'manual',
      triggeredByUserId: req.user.id,
    });
    await recordMonitoringEvent({
      severity: result.failed_count > 0 ? 'warning' : 'info',
      category: 'verification',
      module: 'Verification Runner',
      message: `Manual QA run completed: ${result.passed_count}/${result.total_count} checks passed (avg ${result.avg_response_ms}ms).`,
    });
    res.json({ result });
  } catch (err) {
    next(err);
  }
});

// Super Admin ONLY: Resolve monitoring event
router.patch('/admin/monitoring/events/:id/resolve', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    await execute('UPDATE monitoring_events SET resolved = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Monitoring alert marked as resolved.' });
  } catch (err) {
    next(err);
  }
});

// Super Admin ONLY: Real-time scalability & latency diagnostics snapshot
router.get('/admin/diagnostics/live', authenticate, requirePlatformAdmin, async (_req, res, next) => {
  try {
    const dbStart = performance.now();
    await queryOne('SELECT 1 AS ok');
    const dbLatencyMs = Math.round((performance.now() - dbStart) * 100) / 100;

    const [sessionRow, settingsRows] = await Promise.all([
      queryOne('SELECT COUNT(*) AS active_sessions FROM user_sessions WHERE is_revoked = 0'),
      query(
        `SELECT setting_key, setting_value FROM platform_settings
         WHERE setting_key IN ('development_mode', 'maintenance_mode', 'api_rate_limit_rpm')`
      ),
    ]);

    const flags = settingsRows.reduce((acc, row) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});

    const snapshot = getLiveDiagnosticsSnapshot();
    const cache = getCacheStats();

    res.json({
      ...snapshot,
      cache,
      database: {
        dialect: getDialect(),
        pingLatencyMs: dbLatencyMs,
        activeSessions: Number(sessionRow?.active_sessions || 0),
      },
      platformMode: {
        developmentMode: flags.development_mode === '1',
        maintenanceMode: flags.maintenance_mode === '1',
        rateLimitRpm: Number(flags.api_rate_limit_rpm || 1200),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Super Admin ONLY: Execute live latency probe across DB & cached endpoints
router.post('/admin/diagnostics/benchmark', authenticate, requirePlatformAdmin, async (_req, res, next) => {
  try {
    const probes = [];

    const tDb = performance.now();
    await queryOne('SELECT 1 AS ok');
    probes.push({ id: 'db_ping', label: 'Database Ping (SELECT 1)', durationMs: Math.round((performance.now() - tDb) * 100) / 100 });

    const tPlans = performance.now();
    await query('SELECT id, code, monthly_price_rwf FROM subscription_plans WHERE is_active = 1');
    probes.push({ id: 'plans_query', label: 'Pricing Plans Query', durationMs: Math.round((performance.now() - tPlans) * 100) / 100 });

    const tSettings = performance.now();
    await query('SELECT setting_key, setting_value FROM platform_settings');
    probes.push({ id: 'config_query', label: 'System Config Query', durationMs: Math.round((performance.now() - tSettings) * 100) / 100 });

    const tBiz = performance.now();
    await queryOne(`SELECT COUNT(*) AS count FROM businesses WHERE status = 'active' AND deleted_at IS NULL`);
    probes.push({ id: 'directory_count', label: 'Active Directory Count', durationMs: Math.round((performance.now() - tBiz) * 100) / 100 });

    const totalMs = Math.round(probes.reduce((s, p) => s + p.durationMs, 0) * 100) / 100;
    res.json({
      probes,
      totalMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// Super Admin ONLY: Reset real-time telemetry counters for a fresh scalability window
router.post('/admin/diagnostics/reset', authenticate, requirePlatformAdmin, async (_req, res, next) => {
  try {
    resetMetricsWindow();
    resetCacheStats();
    res.json({ message: 'Live diagnostics metrics window reset.' });
  } catch (err) {
    next(err);
  }
});

// Super Admin ONLY: Complete Platform Database Backup Export (JSON Snapshot)
router.get('/admin/backup', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const tableNames = [
      'users',
      'platform_settings',
      'subscription_plans',
      'businesses',
      'business_settings',
      'branches',
      'business_admins',
      'business_members',
      'categories',
      'suppliers',
      'products',
      'product_images',
      'inventory',
      'customers',
      'sales',
      'sale_items',
      'orders',
      'order_items',
      'expenses',
      'income',
      'tasks',
      'announcements',
      'messages',
      'job_vacancies',
      'job_applications',
      'requirements_register',
    ];
    const snapshot = {
      exported_at: new Date().toISOString(),
      exported_by_user_id: req.user.id,
      platform: 'BizTrade Africa (BTA)',
      dialect: getDialect(),
      tables: {},
    };

    for (const tbl of tableNames) {
      try {
        const rows = await query(`SELECT * FROM ${tbl}`);
        // Strip password hashes from backup JSON for security hygiene
        snapshot.tables[tbl] =
          tbl === 'users'
            ? rows.map(({ password_hash: _ph, ...safe }) => safe)
            : rows;
      } catch {
        snapshot.tables[tbl] = [];
      }
    }

    await recordMonitoringEvent({
      severity: 'info',
      category: 'health',
      module: 'Database Backup',
      message: `Super Admin exported full database snapshot (${Object.keys(snapshot.tables).length} tables).`,
    });

    const filename = `bta-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(snapshot, null, 2));
  } catch (err) {
    next(err);
  }
});

export default router;
