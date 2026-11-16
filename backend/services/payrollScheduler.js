import { execute, query, queryOne } from '../config/db.js';
import { createNotification } from './auditService.js';

let schedulerTimer = null;
let cycleRunning = false;

export function computeDuePeriod(config, referenceDateStr) {
  const d = String(referenceDateStr || config?.next_payment_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (config?.payment_frequency === 'monthly') {
    return d.slice(0, 7); // YYYY-MM
  }
  return d; // Exact cycle date for weekly / custom
}

export function computeNextPaymentDate(config, fromDateStr = null) {
  const baseStr = String(fromDateStr || config?.next_payment_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const parts = baseStr.split('-').map((n) => parseInt(n, 10));
  const dt = parts.length === 3 ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])) : new Date();

  if (config?.payment_frequency === 'weekly') {
    dt.setUTCDate(dt.getUTCDate() + 7);
    return dt.toISOString().slice(0, 10);
  }
  if (config?.payment_frequency === 'custom') {
    const days = Math.max(1, Number(config.custom_interval_days || 14));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }
  // Monthly
  const targetDay = Number(config?.pay_day_of_month || dt.getUTCDate());
  const nextMonth = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1));
  const daysInNextMonth = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate();
  nextMonth.setUTCDate(Math.min(targetDay, daysInNextMonth));
  return nextMonth.toISOString().slice(0, 10);
}

export async function runPayrollMonitoringCycle() {
  if (cycleRunning) return { skipped: true, alertsCreated: 0 };
  cycleRunning = true;
  let alertsCreated = 0;

  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueConfigs = await query(
      `SELECT epc.*, u.full_name AS employee_name, b.name AS business_name
       FROM employee_payroll_configs epc
       JOIN business_members bm ON bm.id = epc.business_member_id
       JOIN users u ON u.id = epc.user_id
       JOIN businesses b ON b.id = epc.business_id
       WHERE epc.payroll_status = 'active'
         AND bm.status = 'active'
         AND b.status = 'active'
         AND b.deleted_at IS NULL
         AND epc.next_payment_date <= ?`,
      [todayStr]
    );

    if (!dueConfigs.length) {
      return { skipped: false, alertsCreated: 0 };
    }

    // Load responsible payroll admins grouped by business
    const bizIds = Array.from(new Set(dueConfigs.map((c) => c.business_id)));
    const adminPlaceholders = bizIds.map(() => '?').join(',');
    const adminRows = await query(
      `SELECT DISTINCT bm.business_id, bm.user_id, COALESCE(np.payroll_alerts, 1) AS payroll_alerts
       FROM business_members bm
       JOIN roles r ON r.id = bm.role_id
       LEFT JOIN notification_preferences np ON np.user_id = bm.user_id
       WHERE bm.business_id IN (${adminPlaceholders})
         AND bm.status = 'active'
         AND (
           r.code IN ('business_owner', 'business_admin', 'manager')
           OR EXISTS (
             SELECT 1 FROM role_permissions rp
             JOIN permissions p ON p.id = rp.permission_id
             WHERE rp.role_id = bm.role_id AND p.perm_key = 'payroll.pay'
           )
         )`,
      bizIds
    );

    const adminsByBusiness = new Map();
    for (const row of adminRows) {
      if (!row.payroll_alerts) continue;
      if (!adminsByBusiness.has(row.business_id)) adminsByBusiness.set(row.business_id, []);
      adminsByBusiness.get(row.business_id).push(row.user_id);
    }

    for (const cfg of dueConfigs) {
      const duePeriod = computeDuePeriod(cfg, cfg.next_payment_date);

      // Skip if already paid or currently processing for this due period
      const existingTx = await queryOne(
        `SELECT id FROM payroll_transactions
         WHERE payroll_config_id = ? AND payment_period = ? AND status IN ('paid', 'processing', 'pending')
         LIMIT 1`,
        [cfg.id, duePeriod]
      );
      if (existingTx) continue;

      // Prevent duplicate alerts/notifications for same config + due period
      const existingAlert = await queryOne(
        `SELECT id FROM payroll_due_alerts WHERE payroll_config_id = ? AND due_period = ?`,
        [cfg.id, duePeriod]
      );
      if (existingAlert) continue;

      await execute(
        `INSERT INTO payroll_due_alerts (business_id, payroll_config_id, employee_user_id, due_period, due_date, amount, momo_phone, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [cfg.business_id, cfg.id, cfg.user_id, duePeriod, cfg.next_payment_date, cfg.salary_amount, cfg.momo_phone]
      );
      alertsCreated += 1;

      const recipients = adminsByBusiness.get(cfg.business_id) || [];
      const formattedAmount = `${Number(cfg.salary_amount).toLocaleString()} ${cfg.currency_code}`;
      const title = `Salary Due: ${cfg.employee_name}`;
      const message = `${cfg.employee_name} — ${formattedAmount} to ${cfg.momo_phone} is due on ${cfg.next_payment_date} (${duePeriod}).`;
      const relatedUrl = `/app/payroll?payConfigId=${cfg.id}`;

      for (const adminUserId of recipients) {
        await createNotification({
          businessId: cfg.business_id,
          userId: adminUserId,
          eventType: 'payroll_due',
          title,
          message,
          relatedUrl,
        });
      }
    }

    return { skipped: false, alertsCreated };
  } catch (err) {
    console.error('[PayrollScheduler Error]', err.message);
    return { error: err.message, alertsCreated };
  } finally {
    cycleRunning = false;
  }
}

export function startPayrollScheduler(intervalMs = 60_000) {
  if (schedulerTimer) return;
  // Delay initial scan slightly after boot so HTTP binds instantaneously
  setTimeout(() => {
    runPayrollMonitoringCycle().catch(() => {});
  }, 4000);
  schedulerTimer = setInterval(() => {
    runPayrollMonitoringCycle().catch(() => {});
  }, intervalMs);
}

export function stopPayrollScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
