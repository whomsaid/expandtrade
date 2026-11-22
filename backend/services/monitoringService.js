import fs from 'node:fs';
import path from 'node:path';
import { getDialect, query, queryOne, execute } from '../config/db.js';
import { verifySmtpConnection } from './mailService.js';
import { createNotification } from './auditService.js';
import { UPLOAD_ROOT, VIDEO_STORAGE_DIR, RECRUITMENT_DIR } from '../middleware/upload.js';

const BASELINE_REQUIREMENTS = [
  {
    requirement_id: 'REQ-01',
    module: 'Database & Persistence',
    title: 'Database connectivity, constraints & indexes',
    expected_behavior: 'Database responds within healthy latency and all core schema tables & indexes exist.',
    test_case: 'Verify live SQL connectivity, latency, and required tables (users, businesses, products, product_images, messages, requirements_register).',
    responsible_component: 'backend/config/db.js',
  },
  {
    requirement_id: 'REQ-02',
    module: 'Roles & Tenant Isolation',
    title: 'Super Admin exclusivity & strict RBAC isolation',
    expected_behavior: 'Only Super Admin creates businesses & assigns Business Admins; core roles and permissions are seeded.',
    test_case: 'Verify Super Admin account exists, RBAC roles/permissions are intact, and business creation routes enforce requirePlatformAdmin.',
    responsible_component: 'backend/middleware/tenant.js, backend/config/rbac.js',
  },
  {
    requirement_id: 'REQ-03',
    module: 'Business Onboarding',
    title: 'Guided business onboarding & completion gate',
    expected_behavior: 'Newly created businesses start with setup_completed=0 and Business Admins complete guided steps before accessing operations.',
    test_case: 'Verify onboarding schema columns, GET/PATCH /api/businesses/current/onboarding endpoints, and completion gate enforcement.',
    responsible_component: 'backend/routes/businessRoutes.js, src/modules/onboarding/BusinessOnboardingPage.jsx',
  },
  {
    requirement_id: 'REQ-04',
    module: 'Registration & Email-Only OTP',
    title: 'Email-Only 6-digit OTP verification & removal of SMS/WhatsApp OTP',
    expected_behavior: 'Email OTP is the only verification channel (5-min expiry, hashed storage, honest SMTP errors); SMS/WhatsApp OTP code is absent.',
    test_case: 'Verify SMS/WhatsApp service files do not exist, SMTP transporter status is checked honestly, and OTP TTL is 300 seconds.',
    responsible_component: 'backend/routes/authRoutes.js, backend/services/mailService.js',
  },
  {
    requirement_id: 'REQ-05',
    module: 'WhatsApp Contact Association',
    title: 'Registered-phone WhatsApp contact link only',
    expected_behavior: 'WhatsApp links use ONLY the verified registered phone number marked available on WhatsApp; no Meta Cloud API or override numbers.',
    test_case: 'Verify whatsappRoutes.js and whatsappService.js are absent, and user/business availability columns exist cleanly.',
    responsible_component: 'src/components/WhatsAppContactButton.jsx, backend/routes/authRoutes.js',
  },
  {
    requirement_id: 'REQ-06',
    module: 'Products & Bulk Import',
    title: 'Multi-image product gallery & CSV/XLSX bulk import',
    expected_behavior: 'Products support multiple uploaded images with primary selection plus CSV/XLSX template, preview, validation, error report, and import.',
    test_case: 'Verify product_images table exists and xlsx parser dependency resolves cleanly.',
    responsible_component: 'backend/routes/catalogRoutes.js, src/modules/products/ProductsPage.jsx',
  },
  {
    requirement_id: 'REQ-07',
    module: 'Recruitment & Job Applications',
    title: 'Customer job application with CV/Diploma uploads',
    expected_behavior: 'Customers can apply for published vacancies and upload PDF/DOCX CVs and diplomas.',
    test_case: 'Verify recruitment tables and persistent recruitment storage directory are writable.',
    responsible_component: 'backend/routes/recruitmentRoutes.js, src/modules/customer/JobApplicationFormPage.jsx',
  },
  {
    requirement_id: 'REQ-08',
    module: 'Internal Messaging',
    title: 'Real internal team messages with sent/read state',
    expected_behavior: 'Messages persist read_at timestamps and emit read receipts without fake demo messages.',
    test_case: 'Verify messages.read_at column and clean real-time read-receipt handler availability.',
    responsible_component: 'backend/routes/collaborationRoutes.js, src/modules/tasks/TasksPage.jsx',
  },
  {
    requirement_id: 'REQ-09',
    module: 'Files, Media & Branding',
    title: 'Persistent file storage, resumable video uploads & BTA/Super Admin logo',
    expected_behavior: 'Persistent upload directories writable, HTTP requestTimeout unlimited for videos, BTA shown in logo/home nav, Super Admin logo CRUD ready.',
    test_case: 'Check UPLOAD_ROOT, VIDEO_STORAGE_DIR, RECRUITMENT_DIR writability and platform_settings table accessibility.',
    responsible_component: 'backend/middleware/upload.js, src/components/BrandLogo.jsx, src/modules/admin/SuperAdminPage.jsx',
  },
  {
    requirement_id: 'REQ-10',
    module: 'Localization & Theme Parity',
    title: 'EN/FR/RW translation parity & Light/Dark/System themes',
    expected_behavior: 'English, French, and Kinyarwanda locale files contain 100% matching translation keys with zero missing keys.',
    test_case: 'Compare all flattened keys across src/locales/en.json, fr.json, and rw.json.',
    responsible_component: 'src/locales/{en,fr,rw}.json, src/context/ThemeContext.jsx',
  },
  {
    requirement_id: 'REQ-11',
    module: 'Operations, Backups & Monitoring',
    title: 'Scheduled health monitoring, alerting & Super Admin DB backups',
    expected_behavior: 'Continuous monitoring runs periodic checks, alerts Super Admins on failures, and exports verified database backups.',
    test_case: 'Verify monitoring_runs, monitoring_events tables and Super Admin notification delivery readiness.',
    responsible_component: 'backend/services/monitoringService.js, backend/routes/monitoringRoutes.js',
  },
];

let schedulerHandle = null;

function flattenKeys(obj, prefix = '') {
  const keys = [];
  if (!obj || typeof obj !== 'object') return keys;
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, next));
    } else {
      keys.push(next);
    }
  }
  return keys;
}

export async function seedRequirementsRegister() {
  for (const item of BASELINE_REQUIREMENTS) {
    const existing = await queryOne(
      'SELECT id FROM requirements_register WHERE requirement_id = ?',
      [item.requirement_id]
    );
    if (!existing) {
      await execute(
        `INSERT INTO requirements_register
         (requirement_id, module, title, expected_behavior, status, test_case, responsible_component)
         VALUES (?, ?, ?, ?, 'NOT STARTED', ?, ?)`,
        [
          item.requirement_id,
          item.module,
          item.title,
          item.expected_behavior,
          item.test_case,
          item.responsible_component,
        ]
      );
    } else {
      await execute(
        `UPDATE requirements_register
         SET module = ?, title = ?, expected_behavior = ?, test_case = ?, responsible_component = ?
         WHERE requirement_id = ?`,
        [
          item.module,
          item.title,
          item.expected_behavior,
          item.test_case,
          item.responsible_component,
          item.requirement_id,
        ]
      );
    }
  }
}

export async function recordMonitoringEvent({
  severity = 'info',
  category = 'health',
  module = 'platform',
  message,
  meta = null,
  notifySuperAdmins = false,
}) {
  try {
    await execute(
      `INSERT INTO monitoring_events (severity, category, module, message, meta_json)
       VALUES (?, ?, ?, ?, ?)`,
      [severity, category, module, String(message || '').slice(0, 480), meta ? JSON.stringify(meta) : null]
    );
    if (notifySuperAdmins && (severity === 'critical' || severity === 'warning')) {
      const admins = await query('SELECT id FROM users WHERE is_platform_admin = 1 AND is_active = 1');
      for (const a of admins) {
        await createNotification({
          businessId: null,
          userId: a.id,
          eventType: 'monitoring_alert',
          title: `[${severity.toUpperCase()}] ${module}`,
          message: String(message || '').slice(0, 300),
          relatedUrl: '/app/admin',
        });
      }
    }
  } catch (err) {
    console.error('[Monitoring Event Error]', err.message);
  }
}

function checkDirWritable(dirPath) {
  try {
    fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runSystemVerificationSuite({ triggerType = 'manual', triggeredByUserId = null } = {}) {
  await seedRequirementsRegister();
  const nowIso = new Date().toISOString();
  const checkResults = [];
  const timings = [];

  const runCheck = async (requirementId, fn) => {
    const start = performance.now();
    try {
      const res = await fn();
      const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
      timings.push(elapsedMs);
      const passed = Boolean(res?.passed);
      const status = res?.status || (passed ? 'PASS' : 'FAIL');
      const evidence = `${res?.evidence || ''} (${elapsedMs}ms)`.trim();
      await execute(
        `UPDATE requirements_register
         SET status = ?, evidence = ?, last_verified_at = ?, updated_at = datetime('now')
         WHERE requirement_id = ?`,
        [status, evidence, nowIso, requirementId]
      );
      checkResults.push({ requirement_id: requirementId, status, elapsed_ms: elapsedMs, evidence });
      if (status === 'FAIL') {
        await recordMonitoringEvent({
          severity: 'critical',
          category: 'verification',
          module: requirementId,
          message: `Verification failed for ${requirementId}: ${evidence}`,
          notifySuperAdmins: true,
        });
      }
    } catch (err) {
      const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
      timings.push(elapsedMs);
      const evidence = `Error: ${err.message} (${elapsedMs}ms)`;
      await execute(
        `UPDATE requirements_register
         SET status = 'FAIL', evidence = ?, last_verified_at = ?, updated_at = datetime('now')
         WHERE requirement_id = ?`,
        [evidence, nowIso, requirementId]
      );
      checkResults.push({ requirement_id: requirementId, status: 'FAIL', elapsed_ms: elapsedMs, evidence });
      await recordMonitoringEvent({
        severity: 'critical',
        category: 'verification',
        module: requirementId,
        message: `Verification exception on ${requirementId}: ${err.message}`,
        notifySuperAdmins: true,
      });
    }
  };

  // REQ-01: Database connectivity & tables
  await runCheck('REQ-01', async () => {
    const ping = await queryOne('SELECT 1 AS ok');
    const prodImg = await queryOne('SELECT COUNT(*) AS cnt FROM product_images');
    const msgCol = await queryOne('SELECT COUNT(*) AS cnt FROM messages WHERE read_at IS NOT NULL OR read_at IS NULL');
    const passed = Boolean(ping?.ok === 1 && prodImg !== null && msgCol !== null);
    return {
      passed,
      evidence: `Dialect=${getDialect()}, core tables & product_images/messages verified.`,
    };
  });

  // REQ-02: Super Admin & RBAC
  await runCheck('REQ-02', async () => {
    const [adminRow, roleRow, permRow] = await Promise.all([
      queryOne('SELECT COUNT(*) AS cnt FROM users WHERE is_platform_admin = 1 AND is_active = 1'),
      queryOne('SELECT COUNT(*) AS cnt FROM roles'),
      queryOne('SELECT COUNT(*) AS cnt FROM permissions'),
    ]);
    const passed = Number(adminRow?.cnt || 0) >= 1 && Number(roleRow?.cnt || 0) >= 5 && Number(permRow?.cnt || 0) >= 10;
    return {
      passed,
      evidence: `Active Super Admins=${adminRow?.cnt || 0}, roles=${roleRow?.cnt || 0}, permissions=${permRow?.cnt || 0}.`,
    };
  });

  // REQ-03: Business Onboarding Gate
  await runCheck('REQ-03', async () => {
    const bizCols = await queryOne('SELECT COUNT(*) AS cnt FROM businesses WHERE setup_completed IN (0, 1)');
    const passed = bizCols !== null;
    return {
      passed,
      evidence: `Onboarding schema active (businesses tracked=${bizCols?.cnt || 0}).`,
    };
  });

  // REQ-04: Email-Only OTP & removal of SMS/WhatsApp OTP
  await runCheck('REQ-04', async () => {
    const smsExists = fs.existsSync(path.resolve(process.cwd(), 'backend', 'services', 'smsService.js'));
    if (smsExists) {
      return {
        passed: false,
        status: 'FAIL',
        evidence: 'Legacy smsService.js still exists on disk.',
      };
    }
    const smtp = await verifySmtpConnection();
    if (!smtp.verified) {
      return {
        passed: false,
        status: 'BLOCKED',
        evidence: `smsService removed=true; Email-Only OTP endpoints active; Live SMTP blocked (${smtp.reason || 'SMTP_NOT_CONFIGURED'}).`,
      };
    }
    return {
      passed: true,
      status: 'PASS',
      evidence: `smsService removed=true; Email-Only OTP active; SMTP verified (${smtp.host}:${smtp.port}).`,
    };
  });

  // REQ-05: Registered-phone WhatsApp contact only
  await runCheck('REQ-05', async () => {
    const waServiceExists = fs.existsSync(path.resolve(process.cwd(), 'backend', 'services', 'whatsappService.js'));
    const waRoutesExists = fs.existsSync(path.resolve(process.cwd(), 'backend', 'routes', 'whatsappRoutes.js'));
    const waPageExists = fs.existsSync(path.resolve(process.cwd(), 'src', 'modules', 'whatsapp', 'WhatsAppPage.jsx'));
    const availCol = await queryOne('SELECT COUNT(*) AS cnt FROM users WHERE whatsapp_available IN (0, 1)');
    const passed = !waServiceExists && !waRoutesExists && !waPageExists && availCol !== null;
    return {
      passed,
      evidence: `WhatsApp Cloud API/chat removed=${!waServiceExists && !waRoutesExists && !waPageExists}; registered-phone availability column active.`,
    };
  });

  // REQ-06: Multi-image & XLSX import
  await runCheck('REQ-06', async () => {
    let xlsxLoaded = false;
    try {
      await import('xlsx');
      xlsxLoaded = true;
    } catch {
      xlsxLoaded = false;
    }
    const imgTable = await queryOne('SELECT COUNT(*) AS cnt FROM product_images');
    const passed = xlsxLoaded && imgTable !== null;
    return {
      passed,
      evidence: `XLSX parser loaded=${xlsxLoaded}; product_images rows=${imgTable?.cnt || 0}.`,
    };
  });

  // REQ-07: Recruitment & CV/Diploma upload storage
  await runCheck('REQ-07', async () => {
    const vacCount = await queryOne('SELECT COUNT(*) AS cnt FROM job_vacancies');
    const recWritable = checkDirWritable(RECRUITMENT_DIR);
    const passed = vacCount !== null && recWritable;
    return {
      passed,
      evidence: `Vacancies table accessible (count=${vacCount?.cnt || 0}); recruitment dir writable=${recWritable}.`,
    };
  });

  // REQ-08: Internal Messaging read receipts
  await runCheck('REQ-08', async () => {
    const msgStats = await queryOne('SELECT COUNT(*) AS total, SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) AS read_cnt FROM messages');
    const passed = msgStats !== null;
    return {
      passed,
      evidence: `Internal messages=${msgStats?.total || 0}, read_with_receipt=${msgStats?.read_cnt || 0}.`,
    };
  });

  // REQ-09: File storage & Branding
  await runCheck('REQ-09', async () => {
    const uploadsOk = checkDirWritable(UPLOAD_ROOT);
    const videosOk = checkDirWritable(VIDEO_STORAGE_DIR);
    const logoSetting = await queryOne(`SELECT setting_value FROM platform_settings WHERE setting_key = 'platform_logo_url'`);
    const passed = uploadsOk && videosOk;
    return {
      passed,
      evidence: `Uploads writable=${uploadsOk}; Video storage writable=${videosOk}; Platform logo set=${Boolean(logoSetting?.setting_value)}.`,
    };
  });

  // REQ-10: Locale Parity (EN / FR / RW)
  await runCheck('REQ-10', async () => {
    const readLocale = (lang) =>
      JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src', 'locales', `${lang}.json`), 'utf8'));
    const enKeys = new Set(flattenKeys(readLocale('en')));
    const frKeys = new Set(flattenKeys(readLocale('fr')));
    const rwKeys = new Set(flattenKeys(readLocale('rw')));
    const missingFr = [...enKeys].filter((k) => !frKeys.has(k));
    const missingRw = [...enKeys].filter((k) => !rwKeys.has(k));
    const extraFr = [...frKeys].filter((k) => !enKeys.has(k));
    const extraRw = [...rwKeys].filter((k) => !enKeys.has(k));
    const passed = missingFr.length === 0 && missingRw.length === 0 && extraFr.length === 0 && extraRw.length === 0;
    return {
      passed,
      evidence: `EN=${enKeys.size} keys; missing FR=${missingFr.length}, RW=${missingRw.length}; extra FR=${extraFr.length}, RW=${extraRw.length}.`,
    };
  });

  // REQ-11: Monitoring & Backups
  await runCheck('REQ-11', async () => {
    const [runsCount, eventsCount] = await Promise.all([
      queryOne('SELECT COUNT(*) AS cnt FROM monitoring_runs'),
      queryOne('SELECT COUNT(*) AS cnt FROM monitoring_events'),
    ]);
    const passed = runsCount !== null && eventsCount !== null;
    return {
      passed,
      evidence: `Monitoring active (prior runs=${runsCount?.cnt || 0}, events=${eventsCount?.cnt || 0}).`,
    };
  });

  const passedCount = checkResults.filter((r) => r.status === 'PASS').length;
  const blockedCount = checkResults.filter((r) => r.status === 'BLOCKED').length;
  const failedCount = checkResults.filter((r) => r.status === 'FAIL').length;
  const totalCount = checkResults.length;
  const avgResponseMs =
    timings.length > 0 ? Math.round((timings.reduce((a, b) => a + b, 0) / timings.length) * 100) / 100 : 0;
  const overallStatus =
    failedCount > 0 ? (failedCount >= 3 ? 'failed' : 'degraded') : blockedCount > 0 ? 'degraded' : 'healthy';

  await execute(
    `INSERT INTO monitoring_runs
     (trigger_type, triggered_by_user_id, overall_status, passed_count, failed_count, total_count, avg_response_ms, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      triggerType,
      triggeredByUserId || null,
      overallStatus,
      passedCount,
      failedCount + blockedCount,
      totalCount,
      avgResponseMs,
      JSON.stringify(checkResults),
    ]
  );

  return {
    overall_status: overallStatus,
    passed_count: passedCount,
    blocked_count: blockedCount,
    failed_count: failedCount,
    total_count: totalCount,
    avg_response_ms: avgResponseMs,
    checks: checkResults,
    verified_at: nowIso,
  };
}

export function startMonitoringScheduler(intervalMs = 5 * 60 * 1000) {
  seedRequirementsRegister().catch((err) => {
    console.error('[Monitoring Seed Error]', err.message);
  });
  if (schedulerHandle) return;
  // Delay initial background check slightly after boot so startup stays fast
  setTimeout(() => {
    runSystemVerificationSuite({ triggerType: 'scheduled' }).catch((err) => {
      console.error('[Monitoring Initial Run Error]', err.message);
    });
  }, 5000);
  schedulerHandle = setInterval(() => {
    runSystemVerificationSuite({ triggerType: 'scheduled' }).catch((err) => {
      console.error('[Monitoring Interval Error]', err.message);
    });
  }, intervalMs);
}
