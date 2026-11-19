import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { body } from 'express-validator';
import { execute, query, queryOne, roundMoney, transaction } from '../config/db.js';
import { authenticate, requirePasswordChanged } from '../middleware/auth.js';
import { requireBusiness, requirePermission } from '../middleware/tenant.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { createNotification, emitToBusiness, logAudit } from '../services/auditService.js';
import {
  initiateMobileMoneyDisbursement,
  isValidMobileMoneyPhone,
  queryMobileMoneyTransferStatus,
  resolveProviderConfig,
  verifyWebhookSignature,
} from '../services/momoService.js';
import {
  computeDuePeriod,
  computeNextPaymentDate,
  runPayrollMonitoringCycle,
} from '../services/payrollScheduler.js';

const router = express.Router();

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payroll payment requests. Please wait a moment and try again.' },
});

async function ensureBusinessPayrollAccount(businessId, currencyCode = 'RWF') {
  let account = await queryOne('SELECT * FROM business_payroll_accounts WHERE business_id = ?', [businessId]);
  if (!account) {
    await execute(
      `INSERT INTO business_payroll_accounts (business_id, available_balance, reserved_balance, currency_code, default_provider)
       VALUES (?, 0, 0, ?, 'mtn_momo')`,
      [businessId, currencyCode]
    );
    account = await queryOne('SELECT * FROM business_payroll_accounts WHERE business_id = ?', [businessId]);
  }
  return account;
}

function sanitizePayrollAccount(account) {
  if (!account) return null;
  const mtnResolved = resolveProviderConfig('mtn_momo', account);
  const airtelResolved = resolveProviderConfig('airtel_money', account);
  return {
    business_id: account.business_id,
    available_balance: roundMoney(account.available_balance || 0),
    reserved_balance: roundMoney(account.reserved_balance || 0),
    currency_code: account.currency_code || 'RWF',
    default_provider: account.default_provider || 'mtn_momo',
    business_momo_number: account.business_momo_number || '',
    mtn_environment: account.mtn_environment || mtnResolved.targetEnv,
    airtel_environment: account.airtel_environment || airtelResolved.environment,
    mtn_configured: mtnResolved.configured,
    airtel_configured: airtelResolved.configured,
    has_business_mtn_keys: Boolean(account.mtn_subscription_key && account.mtn_api_user && account.mtn_api_key),
    has_business_airtel_keys: Boolean(account.airtel_client_id && account.airtel_client_secret),
    updated_at: account.updated_at,
  };
}

function monthlyEquivalentMultiplier(freq, customDays) {
  if (freq === 'weekly') return 4.333;
  if (freq === 'custom') return 30 / Math.max(1, Number(customDays || 14));
  return 1;
}

async function finalizeTransactionSuccess(txRow, providerFinancialTxId = null, rawPayload = null) {
  if (!txRow || txRow.status === 'paid') return txRow;

  const paidAt = new Date().toISOString();
  const cfg = await queryOne('SELECT * FROM employee_payroll_configs WHERE id = ?', [txRow.payroll_config_id]);
  const mainBranch = await queryOne(
    'SELECT id FROM branches WHERE business_id = ? AND is_active = 1 ORDER BY is_main DESC, id ASC LIMIT 1',
    [txRow.business_id]
  );

  await transaction(async (tx) => {
    // Re-check inside lock to avoid double finalization
    const current = await tx.queryOne('SELECT * FROM payroll_transactions WHERE id = ?', [txRow.id]);
    if (!current || current.status === 'paid') return;

    // Release reserved balance into final completed state
    await tx.execute(
      `UPDATE business_payroll_accounts
       SET reserved_balance = MAX(0, reserved_balance - ?), updated_at = datetime('now')
       WHERE business_id = ?`,
      [current.salary_amount, current.business_id]
    );

    let expenseId = current.expense_id || null;
    if (!expenseId && mainBranch?.id) {
      const expRes = await tx.execute(
        `INSERT INTO expenses (business_id, branch_id, category_name, title, amount, payment_method, description, approval_status, recorded_by_user_id, approved_by_user_id, expense_date)
         VALUES (?, ?, 'Salaries & Wages', ?, ?, ?, ?, 'approved', ?, ?, date('now'))`,
        [
          current.business_id,
          mainBranch.id,
          `Salary Payout - ${current.employee_name} (${current.payment_period})`,
          current.salary_amount,
          current.momo_provider,
          `Ref ${current.payment_reference} | MoMo ${current.momo_phone}`,
          current.authorized_by_user_id,
          current.authorized_by_user_id,
        ]
      );
      expenseId = expRes.insertId;
    }

    await tx.execute(
      `UPDATE payroll_transactions
       SET status = 'paid',
           provider_status = 'SUCCESSFUL',
           provider_transaction_id = COALESCE(provider_transaction_id, ?),
           provider_raw_response = COALESCE(?, provider_raw_response),
           expense_id = ?,
           verified_at = datetime('now'),
           paid_at = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        providerFinancialTxId,
        rawPayload ? JSON.stringify(rawPayload) : null,
        expenseId,
        paidAt,
        current.id,
      ]
    );

    if (cfg) {
      const nextDate = computeNextPaymentDate(cfg, cfg.next_payment_date);
      await tx.execute(
        `UPDATE employee_payroll_configs
         SET last_paid_date = ?, last_paid_period = ?, next_payment_date = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [paidAt.slice(0, 10), current.payment_period, nextDate, cfg.id]
      );
    }

    await tx.execute(
      `UPDATE payroll_due_alerts SET status = 'paid' WHERE payroll_config_id = ? AND due_period = ?`,
      [current.payroll_config_id, current.payment_period]
    );

    if (current.batch_id) {
      await tx.execute(
        `UPDATE payroll_batches
         SET success_count = (SELECT COUNT(*) FROM payroll_transactions WHERE batch_id = ? AND status = 'paid'),
             failed_count = (SELECT COUNT(*) FROM payroll_transactions WHERE batch_id = ? AND status = 'failed'),
             pending_count = (SELECT COUNT(*) FROM payroll_transactions WHERE batch_id = ? AND status IN ('pending', 'processing'))
         WHERE id = ?`,
        [current.batch_id, current.batch_id, current.batch_id, current.batch_id]
      );
      const bStats = await tx.queryOne(
        'SELECT total_employees, success_count, failed_count, pending_count FROM payroll_batches WHERE id = ?',
        [current.batch_id]
      );
      if (bStats) {
        let bStatus = 'processing';
        if (bStats.pending_count === 0) {
          if (bStats.failed_count === 0) bStatus = 'completed';
          else if (bStats.success_count === 0) bStatus = 'failed';
          else bStatus = 'partial';
        }
        await tx.execute('UPDATE payroll_batches SET status = ? WHERE id = ?', [bStatus, current.batch_id]);
      }
    }
  });

  await createNotification({
    businessId: txRow.business_id,
    userId: txRow.employee_user_id,
    eventType: 'payroll_paid',
    title: 'Salary Payment Confirmed',
    message: `Your salary of ${Number(txRow.salary_amount).toLocaleString()} ${txRow.currency_code} (${txRow.payment_period}) was sent to ${txRow.momo_phone}. Ref: ${txRow.payment_reference}`,
    relatedUrl: '/app/my-payroll',
  });

  await createNotification({
    businessId: txRow.business_id,
    userId: txRow.authorized_by_user_id,
    eventType: 'payroll_paid',
    title: `Payroll Confirmed: ${txRow.employee_name}`,
    message: `${Number(txRow.salary_amount).toLocaleString()} ${txRow.currency_code} paid to ${txRow.momo_phone}. Ref: ${txRow.payment_reference}`,
    relatedUrl: '/app/payroll',
  });

  emitToBusiness(txRow.business_id, 'payroll:updated', { transactionId: txRow.id, status: 'paid' });
  return queryOne('SELECT * FROM payroll_transactions WHERE id = ?', [txRow.id]);
}

async function finalizeTransactionFailure(txRow, reason, providerStatus = 'FAILED', rawPayload = null) {
  if (!txRow || txRow.status === 'paid' || txRow.status === 'failed') return txRow;

  await transaction(async (tx) => {
    const current = await tx.queryOne('SELECT * FROM payroll_transactions WHERE id = ?', [txRow.id]);
    if (!current || current.status === 'paid' || current.status === 'failed') return;

    const acc = await tx.queryOne('SELECT available_balance FROM business_payroll_accounts WHERE business_id = ?', [
      current.business_id,
    ]);
    const nextAvail = roundMoney(Number(acc?.available_balance || 0) + Number(current.salary_amount));

    await tx.execute(
      `UPDATE business_payroll_accounts
       SET available_balance = ?,
           reserved_balance = MAX(0, reserved_balance - ?),
           updated_at = datetime('now')
       WHERE business_id = ?`,
      [nextAvail, current.salary_amount, current.business_id]
    );

    await tx.execute(
      `INSERT INTO business_payroll_ledger (business_id, entry_type, amount, balance_after, reference, note, created_by_user_id)
       VALUES (?, 'payroll_refund', ?, ?, ?, ?, ?)`,
      [
        current.business_id,
        current.salary_amount,
        nextAvail,
        current.payment_reference,
        `Refunded failed salary disbursement for ${current.employee_name}: ${reason}`,
        current.authorized_by_user_id,
      ]
    );

    await tx.execute(
      `UPDATE payroll_transactions
       SET status = 'failed',
           provider_status = ?,
           failure_reason = ?,
           provider_raw_response = COALESCE(?, provider_raw_response),
           updated_at = datetime('now')
       WHERE id = ?`,
      [providerStatus, reason, rawPayload ? JSON.stringify(rawPayload) : null, current.id]
    );

    if (current.batch_id) {
      await tx.execute(
        `UPDATE payroll_batches
         SET success_count = (SELECT COUNT(*) FROM payroll_transactions WHERE batch_id = ? AND status = 'paid'),
             failed_count = (SELECT COUNT(*) FROM payroll_transactions WHERE batch_id = ? AND status = 'failed'),
             pending_count = (SELECT COUNT(*) FROM payroll_transactions WHERE batch_id = ? AND status IN ('pending', 'processing'))
         WHERE id = ?`,
        [current.batch_id, current.batch_id, current.batch_id, current.batch_id]
      );
      const bStats = await tx.queryOne(
        'SELECT total_employees, success_count, failed_count, pending_count FROM payroll_batches WHERE id = ?',
        [current.batch_id]
      );
      if (bStats) {
        let bStatus = 'processing';
        if (bStats.pending_count === 0) {
          if (bStats.failed_count === 0) bStatus = 'completed';
          else if (bStats.success_count === 0) bStatus = 'failed';
          else bStatus = 'partial';
        }
        await tx.execute('UPDATE payroll_batches SET status = ? WHERE id = ?', [bStatus, current.batch_id]);
      }
    }
  });

  await createNotification({
    businessId: txRow.business_id,
    userId: txRow.authorized_by_user_id,
    eventType: 'payroll_failed',
    title: `Payroll Disbursement Failed: ${txRow.employee_name}`,
    message: `Ref ${txRow.payment_reference} failed (${reason}). Reserved funds were returned to the payroll balance.`,
    relatedUrl: '/app/payroll',
  });

  emitToBusiness(txRow.business_id, 'payroll:updated', { transactionId: txRow.id, status: 'failed' });
  return queryOne('SELECT * FROM payroll_transactions WHERE id = ?', [txRow.id]);
}

// ================= ADMIN PAYROLL OVERVIEW & REPORTS =================
router.get('/payroll/overview', authenticate, requireBusiness, requirePermission('payroll.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(10, Number(req.query.limit || 25)));
    const offset = (page - 1) * limit;
    const statusFilter = String(req.query.status || '').trim();
    const todayStr = new Date().toISOString().slice(0, 10);

    const accountRow = await ensureBusinessPayrollAccount(req.businessId, req.business.currency_code || 'RWF');

    const [members, configs, alerts, batches, ledger] = await Promise.all([
      query(
        `SELECT bm.id AS business_member_id, bm.user_id, bm.job_title, bm.status AS member_status,
                u.full_name, u.email, u.phone, u.avatar_url,
                r.code AS role_code, r.name AS role_name, b.name AS branch_name
         FROM business_members bm
         JOIN users u ON u.id = bm.user_id
         JOIN roles r ON r.id = bm.role_id
         LEFT JOIN branches b ON b.id = bm.assigned_branch_id
         WHERE bm.business_id = ? AND bm.status = 'active'
         ORDER BY bm.id ASC`,
        [req.businessId]
      ),
      query(
        `SELECT epc.*, u.full_name AS employee_name, u.email AS employee_email, u.avatar_url AS employee_avatar,
                bm.job_title, r.name AS role_name, b.name AS branch_name
         FROM employee_payroll_configs epc
         JOIN business_members bm ON bm.id = epc.business_member_id
         JOIN users u ON u.id = epc.user_id
         JOIN roles r ON r.id = bm.role_id
         LEFT JOIN branches b ON b.id = bm.assigned_branch_id
         WHERE epc.business_id = ?
         ORDER BY epc.payroll_status ASC, epc.next_payment_date ASC`,
        [req.businessId]
      ),
      query(
        `SELECT pda.*, u.full_name AS employee_name, epc.momo_provider, epc.payment_frequency
         FROM payroll_due_alerts pda
         JOIN employee_payroll_configs epc ON epc.id = pda.payroll_config_id
         JOIN users u ON u.id = pda.employee_user_id
         WHERE pda.business_id = ? AND pda.status = 'pending'
         ORDER BY pda.due_date ASC, pda.id DESC`,
        [req.businessId]
      ),
      query(
        `SELECT pb.*, u.full_name AS authorized_by_name
         FROM payroll_batches pb
         LEFT JOIN users u ON u.id = pb.authorized_by_user_id
         WHERE pb.business_id = ?
         ORDER BY pb.id DESC LIMIT 20`,
        [req.businessId]
      ),
      query(
        `SELECT l.*, u.full_name AS created_by_name
         FROM business_payroll_ledger l
         LEFT JOIN users u ON u.id = l.created_by_user_id
         WHERE l.business_id = ?
         ORDER BY l.id DESC LIMIT 30`,
        [req.businessId]
      ),
    ]);

    const txWhere = ['pt.business_id = ?'];
    const txParams = [req.businessId];
    if (statusFilter && ['pending', 'processing', 'paid', 'failed'].includes(statusFilter)) {
      txWhere.push('pt.status = ?');
      txParams.push(statusFilter);
    }

    const [transactions, txSummaryRow, countRow] = await Promise.all([
      query(
        `SELECT pt.*, u.full_name AS authorized_by_name, emp.avatar_url AS employee_avatar
         FROM payroll_transactions pt
         LEFT JOIN users u ON u.id = pt.authorized_by_user_id
         LEFT JOIN users emp ON emp.id = pt.employee_user_id
         WHERE ${txWhere.join(' AND ')}
         ORDER BY pt.id DESC LIMIT ? OFFSET ?`,
        [...txParams, limit, offset]
      ),
      queryOne(
        `SELECT
           SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
           COALESCE(SUM(CASE WHEN status = 'paid' THEN salary_amount ELSE 0 END), 0) AS paid_amount,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
           SUM(CASE WHEN status IN ('pending', 'processing') THEN 1 ELSE 0 END) AS pending_count,
           COALESCE(SUM(CASE WHEN status IN ('pending', 'processing') THEN salary_amount ELSE 0 END), 0) AS pending_amount
         FROM payroll_transactions
         WHERE business_id = ?`,
        [req.businessId]
      ),
      queryOne(`SELECT COUNT(*) AS total FROM payroll_transactions pt WHERE ${txWhere.join(' AND ')}`, txParams),
    ]);

    const activeConfigs = configs.filter((c) => c.payroll_status === 'active');
    const dueConfigs = activeConfigs.filter((c) => c.next_payment_date <= todayStr);
    const totalMonthlyPayroll = roundMoney(
      activeConfigs.reduce(
        (sum, c) => sum + Number(c.salary_amount) * monthlyEquivalentMultiplier(c.payment_frequency, c.custom_interval_days),
        0
      )
    );
    const totalDueAmount = roundMoney(dueConfigs.reduce((sum, c) => sum + Number(c.salary_amount), 0));

    res.json({
      account: sanitizePayrollAccount(accountRow),
      stats: {
        total_employees: members.length,
        configured_employees: configs.length,
        active_payroll_employees: activeConfigs.length,
        total_monthly_payroll: totalMonthlyPayroll,
        due_payments_count: dueConfigs.length,
        due_payments_amount: totalDueAmount,
        successful_payments: Number(txSummaryRow?.paid_count || 0),
        successful_amount: roundMoney(txSummaryRow?.paid_amount || 0),
        failed_payments: Number(txSummaryRow?.failed_count || 0),
        pending_transactions: Number(txSummaryRow?.pending_count || 0),
        pending_amount: roundMoney(txSummaryRow?.pending_amount || 0),
      },
      employees: members,
      configs: configs.map((c) => ({
        ...c,
        is_due: c.payroll_status === 'active' && c.next_payment_date <= todayStr,
        due_period: computeDuePeriod(c, c.next_payment_date),
      })),
      dueAlerts: alerts,
      batches,
      transactions,
      ledger,
      pagination: {
        page,
        limit,
        total: Number(countRow?.total || 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ================= PAYROLL ACCOUNT & FUNDING =================
router.put(
  '/payroll/account/config',
  authenticate,
  requireBusiness,
  requirePermission('payroll.manage'),
  async (req, res, next) => {
    try {
      const account = await ensureBusinessPayrollAccount(req.businessId, req.business.currency_code || 'RWF');
      const {
        default_provider,
        business_momo_number,
        mtn_subscription_key,
        mtn_api_user,
        mtn_api_key,
        mtn_environment,
        airtel_client_id,
        airtel_client_secret,
        airtel_environment,
      } = req.body;

      if (business_momo_number && !isValidMobileMoneyPhone(business_momo_number)) {
        return res.status(400).json({ error: 'Valid business mobile money phone number is required' });
      }

      await execute(
        `UPDATE business_payroll_accounts
         SET default_provider = COALESCE(?, default_provider),
             business_momo_number = COALESCE(?, business_momo_number),
             mtn_subscription_key = COALESCE(?, mtn_subscription_key),
             mtn_api_user = COALESCE(?, mtn_api_user),
             mtn_api_key = COALESCE(?, mtn_api_key),
             mtn_environment = COALESCE(?, mtn_environment),
             airtel_client_id = COALESCE(?, airtel_client_id),
             airtel_client_secret = COALESCE(?, airtel_client_secret),
             airtel_environment = COALESCE(?, airtel_environment),
             updated_by_user_id = ?,
             updated_at = datetime('now')
         WHERE business_id = ?`,
        [
          default_provider && ['mtn_momo', 'airtel_money'].includes(default_provider) ? default_provider : null,
          business_momo_number !== undefined ? String(business_momo_number).trim() : null,
          mtn_subscription_key ? String(mtn_subscription_key).trim() : null,
          mtn_api_user ? String(mtn_api_user).trim() : null,
          mtn_api_key ? String(mtn_api_key).trim() : null,
          mtn_environment && ['sandbox', 'mtcrwanda', 'production'].includes(mtn_environment) ? mtn_environment : null,
          airtel_client_id ? String(airtel_client_id).trim() : null,
          airtel_client_secret ? String(airtel_client_secret).trim() : null,
          airtel_environment && ['staging', 'production'].includes(airtel_environment) ? airtel_environment : null,
          req.user.id,
          account.business_id,
        ]
      );

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'payroll.account_configured',
        entityType: 'business_payroll_account',
        entityId: account.id,
        changes: { default_provider, mtn_environment, airtel_environment },
        ipAddress: req.ip,
      });

      const refreshed = await queryOne('SELECT * FROM business_payroll_accounts WHERE business_id = ?', [req.businessId]);
      res.json({ message: 'Payroll payment account settings updated', account: sanitizePayrollAccount(refreshed) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/account/topup',
  authenticate,
  requireBusiness,
  requirePermission('payroll.pay'),
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Funding amount must be greater than zero'),
    body('reference').optional().trim(),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const amount = roundMoney(req.body.amount);
      const ref = String(req.body.reference || `FUND-${Date.now().toString().slice(-6)}`).trim();
      const note = String(req.body.note || 'Business payroll balance allocation').trim();

      await ensureBusinessPayrollAccount(req.businessId, req.business.currency_code || 'RWF');

      const updatedAccount = await transaction(async (tx) => {
        const acc = await tx.queryOne('SELECT * FROM business_payroll_accounts WHERE business_id = ?', [req.businessId]);
        const nextBal = roundMoney(Number(acc.available_balance || 0) + amount);
        await tx.execute(
          `UPDATE business_payroll_accounts SET available_balance = ?, updated_by_user_id = ?, updated_at = datetime('now') WHERE business_id = ?`,
          [nextBal, req.user.id, req.businessId]
        );
        await tx.execute(
          `INSERT INTO business_payroll_ledger (business_id, entry_type, amount, balance_after, reference, note, created_by_user_id)
           VALUES (?, 'topup', ?, ?, ?, ?, ?)`,
          [req.businessId, amount, nextBal, ref, note, req.user.id]
        );
        return tx.queryOne('SELECT * FROM business_payroll_accounts WHERE business_id = ?', [req.businessId]);
      });

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'payroll.balance_funded',
        entityType: 'business_payroll_account',
        entityId: updatedAccount.id,
        changes: { amount, reference: ref, available_balance: updatedAccount.available_balance },
        ipAddress: req.ip,
      });

      res.json({
        message: `Added ${amount.toLocaleString()} ${updatedAccount.currency_code} to business payroll balance.`,
        account: sanitizePayrollAccount(updatedAccount),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ================= EMPLOYEE PAYROLL CONFIGURATION CRUD =================
router.post(
  '/payroll/configs',
  authenticate,
  requireBusiness,
  requirePermission('payroll.manage'),
  [
    body('business_member_id').isInt({ gt: 0 }).withMessage('Employee membership is required'),
    body('salary_amount').isFloat({ gt: 0 }).withMessage('Salary amount must be greater than zero'),
    body('payment_frequency').isIn(['weekly', 'monthly', 'custom']).withMessage('Valid frequency required'),
    body('next_payment_date').trim().notEmpty().withMessage('Next payment date is required'),
    body('momo_provider').isIn(['mtn_momo', 'airtel_money']).withMessage('Valid Mobile Money provider required'),
    body('momo_phone').custom((v) => {
      if (!isValidMobileMoneyPhone(v)) throw new Error('Valid Mobile Money phone number is required');
      return true;
    }),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const {
        business_member_id,
        salary_amount,
        payment_frequency,
        custom_interval_days = null,
        next_payment_date,
        momo_provider,
        momo_phone,
        notes = '',
      } = req.body;

      const member = await queryOne(
        `SELECT bm.id, bm.user_id, u.full_name
         FROM business_members bm JOIN users u ON u.id = bm.user_id
         WHERE bm.id = ? AND bm.business_id = ? AND bm.status = 'active'`,
        [business_member_id, req.businessId]
      );
      if (!member) return res.status(404).json({ error: 'Active employee membership not found' });

      const cleanDate = String(next_payment_date).slice(0, 10);
      const dayOfMonth = Number(cleanDate.split('-')[2] || 28);
      const customDays = payment_frequency === 'custom' ? Math.max(1, Number(custom_interval_days || 14)) : null;
      const currency = req.business.currency_code || 'RWF';

      const existing = await queryOne(
        'SELECT id FROM employee_payroll_configs WHERE business_member_id = ? AND business_id = ?',
        [member.id, req.businessId]
      );

      let configId;
      if (existing) {
        await execute(
          `UPDATE employee_payroll_configs
           SET salary_amount = ?, currency_code = ?, payment_frequency = ?, custom_interval_days = ?,
               pay_day_of_month = ?, next_payment_date = ?, momo_provider = ?, momo_phone = ?,
               notes = ?, updated_by_user_id = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [
            roundMoney(salary_amount),
            currency,
            payment_frequency,
            customDays,
            dayOfMonth,
            cleanDate,
            momo_provider,
            String(momo_phone).trim(),
            notes,
            req.user.id,
            existing.id,
          ]
        );
        configId = existing.id;
      } else {
        const ins = await execute(
          `INSERT INTO employee_payroll_configs
           (business_id, business_member_id, user_id, salary_amount, currency_code, payment_frequency, custom_interval_days, pay_day_of_month, next_payment_date, momo_provider, momo_phone, notes, created_by_user_id, updated_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.businessId,
            member.id,
            member.user_id,
            roundMoney(salary_amount),
            currency,
            payment_frequency,
            customDays,
            dayOfMonth,
            cleanDate,
            momo_provider,
            String(momo_phone).trim(),
            notes,
            req.user.id,
            req.user.id,
          ]
        );
        configId = ins.insertId;
      }

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: existing ? 'payroll.config_updated' : 'payroll.config_created',
        entityType: 'employee_payroll_config',
        entityId: configId,
        changes: { employee: member.full_name, salary_amount, payment_frequency, next_payment_date: cleanDate, momo_provider },
        ipAddress: req.ip,
      });

      const saved = await queryOne('SELECT * FROM employee_payroll_configs WHERE id = ?', [configId]);
      // Trigger due check immediately in case date <= today
      runPayrollMonitoringCycle().catch(() => {});

      res.status(existing ? 200 : 201).json({ message: 'Employee payroll configuration saved', config: saved });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/payroll/configs/:id/status',
  authenticate,
  requireBusiness,
  requirePermission('payroll.manage'),
  [body('payroll_status').isIn(['active', 'suspended']).withMessage('Status must be active or suspended')],
  validateRequest,
  async (req, res, next) => {
    try {
      const cfg = await queryOne('SELECT * FROM employee_payroll_configs WHERE id = ? AND business_id = ?', [
        req.params.id,
        req.businessId,
      ]);
      if (!cfg) return res.status(404).json({ error: 'Payroll configuration not found' });

      await execute(
        `UPDATE employee_payroll_configs SET payroll_status = ?, updated_by_user_id = ?, updated_at = datetime('now') WHERE id = ?`,
        [req.body.payroll_status, req.user.id, cfg.id]
      );

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: req.body.payroll_status === 'suspended' ? 'payroll.suspended' : 'payroll.reactivated',
        entityType: 'employee_payroll_config',
        entityId: cfg.id,
        ipAddress: req.ip,
      });

      res.json({ message: `Payroll record ${req.body.payroll_status}` });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/payroll/monitor/run', authenticate, requireBusiness, requirePermission('payroll.view'), async (_req, res, next) => {
  try {
    const result = await runPayrollMonitoringCycle();
    res.json({ message: 'Payroll due-date monitor completed', ...result });
  } catch (err) {
    next(err);
  }
});

// ================= PAYMENT AUTHORIZATION (INDIVIDUAL & BULK) =================
router.post(
  '/payroll/pay/individual',
  paymentLimiter,
  authenticate,
  requireBusiness,
  requirePermission('payroll.pay'),
  [
    body('payroll_config_id').isInt({ gt: 0 }).withMessage('Payroll configuration ID required'),
    body('confirm_authorization')
      .custom((v) => v === true || v === 'true')
      .withMessage('Explicit administrator authorization confirmation is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { payroll_config_id, payment_period, idempotency_key } = req.body;
      const cfg = await queryOne(
        `SELECT epc.*, u.full_name AS employee_name
         FROM employee_payroll_configs epc
         JOIN business_members bm ON bm.id = epc.business_member_id
         JOIN users u ON u.id = epc.user_id
         WHERE epc.id = ? AND epc.business_id = ? AND bm.status = 'active'`,
        [payroll_config_id, req.businessId]
      );
      if (!cfg) return res.status(404).json({ error: 'Employee payroll configuration not found' });
      if (cfg.payroll_status !== 'active') {
        return res.status(400).json({ error: 'Payroll record is currently suspended. Reactivate before paying.' });
      }
      if (!isValidMobileMoneyPhone(cfg.momo_phone)) {
        return res.status(400).json({ error: 'Employee Mobile Money number is invalid or missing.' });
      }

      const period = String(payment_period || computeDuePeriod(cfg, cfg.next_payment_date)).trim();
      const idempKey = String(idempotency_key || `pay-${req.businessId}-${cfg.id}-${period}`).trim();

      const existingIdemp = await queryOne(
        'SELECT * FROM payroll_transactions WHERE business_id = ? AND idempotency_key = ?',
        [req.businessId, idempKey]
      );
      if (existingIdemp) {
        return res.json({
          message: `Existing payroll transaction found (${existingIdemp.status})`,
          transaction: existingIdemp,
          deduplicated: true,
        });
      }

      const existingPeriod = await queryOne(
        `SELECT id, status, payment_reference FROM payroll_transactions
         WHERE payroll_config_id = ? AND payment_period = ? AND status IN ('paid', 'processing', 'pending')`,
        [cfg.id, period]
      );
      if (existingPeriod) {
        return res.status(409).json({
          error: `Salary for period ${period} already has an active or completed transaction (${existingPeriod.payment_reference}).`,
        });
      }

      const account = await ensureBusinessPayrollAccount(req.businessId, cfg.currency_code);
      const salaryAmount = roundMoney(cfg.salary_amount);
      if (Number(account.available_balance) < salaryAmount) {
        return res.status(400).json({
          error: `Insufficient business payroll balance (${Number(account.available_balance).toLocaleString()} ${account.currency_code} available, ${salaryAmount.toLocaleString()} ${account.currency_code} required). Fund the payroll balance first.`,
        });
      }

      const txUuid = crypto.randomUUID();
      const payRef = `PAY-${req.businessId}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      // Phase 1: Reserve funds & create pending transaction atomically
      const createdTx = await transaction(async (tx) => {
        const freshAcc = await tx.queryOne('SELECT available_balance FROM business_payroll_accounts WHERE business_id = ?', [
          req.businessId,
        ]);
        if (Number(freshAcc.available_balance) < salaryAmount) {
          throw Object.assign(new Error('Insufficient business payroll balance'), { statusCode: 400 });
        }
        const nextAvail = roundMoney(Number(freshAcc.available_balance) - salaryAmount);
        await tx.execute(
          `UPDATE business_payroll_accounts
           SET available_balance = ?, reserved_balance = reserved_balance + ?, updated_at = datetime('now')
           WHERE business_id = ?`,
          [nextAvail, salaryAmount, req.businessId]
        );
        await tx.execute(
          `INSERT INTO business_payroll_ledger (business_id, entry_type, amount, balance_after, reference, note, created_by_user_id)
           VALUES (?, 'payroll_debit', ?, ?, ?, ?, ?)`,
          [req.businessId, -salaryAmount, nextAvail, payRef, `Salary reservation for ${cfg.employee_name} (${period})`, req.user.id]
        );

        const ins = await tx.execute(
          `INSERT INTO payroll_transactions
           (business_id, payroll_config_id, business_member_id, employee_user_id, employee_name, momo_provider, momo_phone, salary_amount, currency_code, payment_period, payment_reference, idempotency_key, provider_transaction_id, status, authorized_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
          [
            req.businessId,
            cfg.id,
            cfg.business_member_id,
            cfg.user_id,
            cfg.employee_name,
            cfg.momo_provider,
            cfg.momo_phone,
            salaryAmount,
            cfg.currency_code,
            period,
            payRef,
            idempKey,
            txUuid,
            req.user.id,
          ]
        );
        return tx.queryOne('SELECT * FROM payroll_transactions WHERE id = ?', [ins.insertId]);
      });

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'payroll.payment_authorized',
        entityType: 'payroll_transaction',
        entityId: createdTx.id,
        changes: {
          employee: cfg.employee_name,
          amount: salaryAmount,
          period,
          provider: cfg.momo_provider,
          reference: payRef,
        },
        ipAddress: req.ip,
      });

      // Phase 2: Call real Mobile Money API OUTSIDE database transaction
      const gatewayResult = await initiateMobileMoneyDisbursement({
        provider: cfg.momo_provider,
        businessAccount: account,
        referenceId: txUuid,
        externalReference: payRef,
        amount: salaryAmount,
        currencyCode: cfg.currency_code,
        payeePhone: cfg.momo_phone,
        payeeName: cfg.employee_name,
        note: `Salary ${period}`,
      });

      if (!gatewayResult.ok) {
        const failedTx = await finalizeTransactionFailure(
          createdTx,
          gatewayResult.error,
          gatewayResult.providerStatus,
          gatewayResult.raw
        );
        return res.status(gatewayResult.configured ? 502 : 422).json({
          error: gatewayResult.error,
          transaction: failedTx,
          configured: gatewayResult.configured,
        });
      }

      await execute(
        `UPDATE payroll_transactions
         SET status = 'processing', provider_status = ?, provider_transaction_id = ?, provider_raw_response = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [
          gatewayResult.providerStatus,
          gatewayResult.providerTransactionId || txUuid,
          gatewayResult.raw ? JSON.stringify(gatewayResult.raw) : null,
          createdTx.id,
        ]
      );

      const processingTx = await queryOne('SELECT * FROM payroll_transactions WHERE id = ?', [createdTx.id]);
      emitToBusiness(req.businessId, 'payroll:updated', { transactionId: processingTx.id, status: 'processing' });

      res.status(202).json({
        message: `Disbursement submitted to ${cfg.momo_provider === 'airtel_money' ? 'Airtel Money' : 'MTN Mobile Money'} (${payRef}). Awaiting provider confirmation.`,
        transaction: processingTx,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/pay/bulk',
  paymentLimiter,
  authenticate,
  requireBusiness,
  requirePermission('payroll.pay'),
  [
    body('payroll_config_ids').isArray({ min: 1 }).withMessage('Select at least one employee for bulk payroll'),
    body('confirm_authorization')
      .custom((v) => v === true || v === 'true')
      .withMessage('Explicit administrator authorization confirmation is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const configIds = Array.from(new Set(req.body.payroll_config_ids.map((id) => Number(id)).filter((id) => id > 0)));
      if (!configIds.length) return res.status(400).json({ error: 'No valid employees selected' });

      const placeholders = configIds.map(() => '?').join(',');
      const configs = await query(
        `SELECT epc.*, u.full_name AS employee_name
         FROM employee_payroll_configs epc
         JOIN business_members bm ON bm.id = epc.business_member_id
         JOIN users u ON u.id = epc.user_id
         WHERE epc.id IN (${placeholders}) AND epc.business_id = ? AND epc.payroll_status = 'active' AND bm.status = 'active'`,
        [...configIds, req.businessId]
      );
      if (!configs.length) return res.status(400).json({ error: 'No active payroll records matched selection' });

      const currency = req.business.currency_code || 'RWF';
      const account = await ensureBusinessPayrollAccount(req.businessId, currency);
      const batchRef = `BATCH-${req.businessId}-${Date.now().toString().slice(-6)}`;
      const batchPeriod = String(req.body.payment_period || new Date().toISOString().slice(0, 7));

      // Filter out any already paid/processing for current due period
      const eligible = [];
      const skipped = [];
      for (const cfg of configs) {
        const period = String(req.body.payment_period || computeDuePeriod(cfg, cfg.next_payment_date));
        const dup = await queryOne(
          `SELECT id, payment_reference FROM payroll_transactions
           WHERE payroll_config_id = ? AND payment_period = ? AND status IN ('paid', 'processing', 'pending')`,
          [cfg.id, period]
        );
        if (dup) {
          skipped.push({ employee_name: cfg.employee_name, reason: `Already ${dup.payment_reference}` });
        } else if (!isValidMobileMoneyPhone(cfg.momo_phone)) {
          skipped.push({ employee_name: cfg.employee_name, reason: 'Invalid MoMo phone number' });
        } else {
          eligible.push({ cfg, period });
        }
      }

      if (!eligible.length) {
        return res.status(409).json({
          error: 'All selected employees already have active/paid payroll records for their period or invalid MoMo phones.',
          skipped,
        });
      }

      const totalAmount = roundMoney(eligible.reduce((s, e) => s + Number(e.cfg.salary_amount), 0));
      if (Number(account.available_balance) < totalAmount) {
        return res.status(400).json({
          error: `Insufficient payroll balance for bulk run (${Number(account.available_balance).toLocaleString()} ${currency} available, ${totalAmount.toLocaleString()} ${currency} needed).`,
        });
      }

      const { batchId, createdTxs } = await transaction(async (tx) => {
        const freshAcc = await tx.queryOne('SELECT available_balance FROM business_payroll_accounts WHERE business_id = ?', [
          req.businessId,
        ]);
        if (Number(freshAcc.available_balance) < totalAmount) {
          throw Object.assign(new Error('Insufficient business payroll balance'), { statusCode: 400 });
        }

        const nextAvail = roundMoney(Number(freshAcc.available_balance) - totalAmount);
        await tx.execute(
          `UPDATE business_payroll_accounts
           SET available_balance = ?, reserved_balance = reserved_balance + ?, updated_at = datetime('now')
           WHERE business_id = ?`,
          [nextAvail, totalAmount, req.businessId]
        );
        await tx.execute(
          `INSERT INTO business_payroll_ledger (business_id, entry_type, amount, balance_after, reference, note, created_by_user_id)
           VALUES (?, 'payroll_debit', ?, ?, ?, ?, ?)`,
          [req.businessId, -totalAmount, nextAvail, batchRef, `Bulk payroll (${eligible.length} employees)`, req.user.id]
        );

        const batchRes = await tx.execute(
          `INSERT INTO payroll_batches (business_id, batch_reference, payment_mode, payment_period, total_employees, total_amount, currency_code, pending_count, status, authorized_by_user_id)
           VALUES (?, ?, 'bulk', ?, ?, ?, ?, ?, 'processing', ?)`,
          [req.businessId, batchRef, batchPeriod, eligible.length, totalAmount, currency, eligible.length, req.user.id]
        );

        const txs = [];
        for (const { cfg, period } of eligible) {
          const txUuid = crypto.randomUUID();
          const payRef = `PAY-${req.businessId}-${batchRes.insertId}-${cfg.id}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
          const idemp = `bulk-${batchRes.insertId}-${cfg.id}-${period}`;
          const ins = await tx.execute(
            `INSERT INTO payroll_transactions
             (business_id, batch_id, payroll_config_id, business_member_id, employee_user_id, employee_name, momo_provider, momo_phone, salary_amount, currency_code, payment_period, payment_reference, idempotency_key, provider_transaction_id, status, authorized_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [
              req.businessId,
              batchRes.insertId,
              cfg.id,
              cfg.business_member_id,
              cfg.user_id,
              cfg.employee_name,
              cfg.momo_provider,
              cfg.momo_phone,
              roundMoney(cfg.salary_amount),
              cfg.currency_code,
              period,
              payRef,
              idemp,
              txUuid,
              req.user.id,
            ]
          );
          txs.push(await tx.queryOne('SELECT * FROM payroll_transactions WHERE id = ?', [ins.insertId]));
        }

        return { batchId: batchRes.insertId, createdTxs: txs };
      });

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'payroll.bulk_authorized',
        entityType: 'payroll_batch',
        entityId: batchId,
        changes: { batch_reference: batchRef, total_employees: createdTxs.length, total_amount: totalAmount },
        ipAddress: req.ip,
      });

      const results = [];
      for (const txRow of createdTxs) {
        const gw = await initiateMobileMoneyDisbursement({
          provider: txRow.momo_provider,
          businessAccount: account,
          referenceId: txRow.provider_transaction_id,
          externalReference: txRow.payment_reference,
          amount: txRow.salary_amount,
          currencyCode: txRow.currency_code,
          payeePhone: txRow.momo_phone,
          payeeName: txRow.employee_name,
          note: `Bulk Salary ${txRow.payment_period}`,
        });

        if (!gw.ok) {
          const failed = await finalizeTransactionFailure(txRow, gw.error, gw.providerStatus, gw.raw);
          results.push(failed);
        } else {
          await execute(
            `UPDATE payroll_transactions
             SET status = 'processing', provider_status = ?, provider_transaction_id = ?, provider_raw_response = ?, updated_at = datetime('now')
             WHERE id = ?`,
            [
              gw.providerStatus,
              gw.providerTransactionId || txRow.provider_transaction_id,
              gw.raw ? JSON.stringify(gw.raw) : null,
              txRow.id,
            ]
          );
          results.push(await queryOne('SELECT * FROM payroll_transactions WHERE id = ?', [txRow.id]));
        }
      }

      const batch = await queryOne('SELECT * FROM payroll_batches WHERE id = ?', [batchId]);
      emitToBusiness(req.businessId, 'payroll:updated', { batchId });

      res.status(202).json({
        message: `Bulk payroll batch ${batchRef} processed (${results.filter((r) => r.status === 'processing').length} submitted to Mobile Money, ${results.filter((r) => r.status === 'failed').length} failed).`,
        batch,
        transactions: results,
        skipped,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ================= STATUS VERIFICATION & SAFE RETRY =================
router.get(
  '/payroll/transactions/:id/verify-status',
  authenticate,
  requireBusiness,
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const txRow = await queryOne('SELECT * FROM payroll_transactions WHERE id = ? AND business_id = ?', [
        req.params.id,
        req.businessId,
      ]);
      if (!txRow) return res.status(404).json({ error: 'Payroll transaction not found' });
      if (txRow.status === 'paid') {
        return res.json({ transaction: txRow, verified: true });
      }
      if (!txRow.provider_transaction_id) {
        return res.json({ transaction: txRow, message: 'No provider transaction reference recorded' });
      }

      const account = await ensureBusinessPayrollAccount(req.businessId, txRow.currency_code);
      const check = await queryMobileMoneyTransferStatus({
        provider: txRow.momo_provider,
        businessAccount: account,
        referenceId: txRow.provider_transaction_id,
      });

      if (check.status === 'paid') {
        const finalized = await finalizeTransactionSuccess(txRow, check.providerFinancialTxId, check.raw);
        return res.json({ message: 'Mobile Money transfer confirmed paid.', transaction: finalized, verified: true });
      }
      if (check.status === 'failed') {
        const failed = await finalizeTransactionFailure(txRow, check.error || 'Provider declined transfer', check.providerStatus, check.raw);
        return res.json({ message: 'Provider reported transfer failed.', transaction: failed, verified: true });
      }

      res.json({
        message: check.error || `Transaction is still ${check.providerStatus || txRow.status}`,
        transaction: txRow,
        provider_check: check,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/transactions/:id/retry',
  paymentLimiter,
  authenticate,
  requireBusiness,
  requirePermission('payroll.pay'),
  async (req, res, next) => {
    try {
      const origTx = await queryOne('SELECT * FROM payroll_transactions WHERE id = ? AND business_id = ?', [
        req.params.id,
        req.businessId,
      ]);
      if (!origTx) return res.status(404).json({ error: 'Original transaction not found' });
      if (origTx.status === 'paid') {
        return res.status(409).json({ error: 'This salary payment is already confirmed paid.' });
      }

      const account = await ensureBusinessPayrollAccount(req.businessId, origTx.currency_code);

      // MANDATORY SAFETY CHECK: Verify original provider status before issuing any retry
      if (origTx.provider_transaction_id) {
        const originalCheck = await queryMobileMoneyTransferStatus({
          provider: origTx.momo_provider,
          businessAccount: account,
          referenceId: origTx.provider_transaction_id,
        });
        if (originalCheck.status === 'paid') {
          const paidTx = await finalizeTransactionSuccess(origTx, originalCheck.providerFinancialTxId, originalCheck.raw);
          return res.json({
            message: 'Original transaction was already confirmed successful by provider. Retry cancelled to prevent double payment.',
            transaction: paidTx,
          });
        }
        if (origTx.status === 'processing' && originalCheck.status === 'processing') {
          return res.status(409).json({
            error: 'Original transfer is still processing at the Mobile Money provider. Wait for callback before retrying.',
          });
        }
      }

      if (origTx.status !== 'failed') {
        return res.status(400).json({ error: 'Only confirmed failed transactions can be retried.' });
      }

      const cfg = await queryOne('SELECT * FROM employee_payroll_configs WHERE id = ? AND business_id = ?', [
        origTx.payroll_config_id,
        req.businessId,
      ]);
      if (!cfg || cfg.payroll_status !== 'active') {
        return res.status(400).json({ error: 'Employee payroll configuration is not active.' });
      }

      const salaryAmount = roundMoney(cfg.salary_amount);
      if (Number(account.available_balance) < salaryAmount) {
        return res.status(400).json({ error: 'Insufficient business payroll balance for retry.' });
      }

      const txUuid = crypto.randomUUID();
      const payRef = `RETRY-${req.businessId}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const idempKey = `retry-${origTx.id}-${Date.now()}`;

      const retryTx = await transaction(async (tx) => {
        const freshAcc = await tx.queryOne('SELECT available_balance FROM business_payroll_accounts WHERE business_id = ?', [
          req.businessId,
        ]);
        if (Number(freshAcc.available_balance) < salaryAmount) {
          throw Object.assign(new Error('Insufficient payroll balance'), { statusCode: 400 });
        }
        const nextAvail = roundMoney(Number(freshAcc.available_balance) - salaryAmount);
        await tx.execute(
          `UPDATE business_payroll_accounts
           SET available_balance = ?, reserved_balance = reserved_balance + ?, updated_at = datetime('now')
           WHERE business_id = ?`,
          [nextAvail, salaryAmount, req.businessId]
        );
        await tx.execute(
          `INSERT INTO business_payroll_ledger (business_id, entry_type, amount, balance_after, reference, note, created_by_user_id)
           VALUES (?, 'payroll_debit', ?, ?, ?, ?, ?)`,
          [req.businessId, -salaryAmount, nextAvail, payRef, `Retry of ${origTx.payment_reference}`, req.user.id]
        );

        const ins = await tx.execute(
          `INSERT INTO payroll_transactions
           (business_id, payroll_config_id, business_member_id, employee_user_id, employee_name, momo_provider, momo_phone, salary_amount, currency_code, payment_period, payment_reference, idempotency_key, provider_transaction_id, status, retry_of_transaction_id, authorized_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [
            req.businessId,
            cfg.id,
            cfg.business_member_id,
            cfg.user_id,
            origTx.employee_name,
            cfg.momo_provider,
            cfg.momo_phone,
            salaryAmount,
            cfg.currency_code,
            origTx.payment_period,
            payRef,
            idempKey,
            txUuid,
            origTx.id,
            req.user.id,
          ]
        );
        return tx.queryOne('SELECT * FROM payroll_transactions WHERE id = ?', [ins.insertId]);
      });

      const gw = await initiateMobileMoneyDisbursement({
        provider: cfg.momo_provider,
        businessAccount: account,
        referenceId: txUuid,
        externalReference: payRef,
        amount: salaryAmount,
        currencyCode: cfg.currency_code,
        payeePhone: cfg.momo_phone,
        payeeName: origTx.employee_name,
        note: `Retry Salary ${origTx.payment_period}`,
      });

      if (!gw.ok) {
        const failed = await finalizeTransactionFailure(retryTx, gw.error, gw.providerStatus, gw.raw);
        return res.status(gw.configured ? 502 : 422).json({ error: gw.error, transaction: failed });
      }

      await execute(
        `UPDATE payroll_transactions
         SET status = 'processing', provider_status = ?, provider_transaction_id = ?, provider_raw_response = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [gw.providerStatus, gw.providerTransactionId || txUuid, gw.raw ? JSON.stringify(gw.raw) : null, retryTx.id]
      );

      res.status(202).json({
        message: 'Safe retry submitted to Mobile Money provider.',
        transaction: await queryOne('SELECT * FROM payroll_transactions WHERE id = ?', [retryTx.id]),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ================= EMPLOYEE SELF-SERVICE PAYROLL PORTAL =================
router.get('/payroll/my', authenticate, requirePasswordChanged, async (req, res, next) => {
  try {
    const configs = await query(
      `SELECT epc.*, b.name AS business_name, b.currency_code AS business_currency,
              bm.job_title, r.name AS role_name
       FROM employee_payroll_configs epc
       JOIN businesses b ON b.id = epc.business_id
       JOIN business_members bm ON bm.id = epc.business_member_id
       JOIN roles r ON r.id = bm.role_id
       WHERE epc.user_id = ? AND bm.status = 'active' AND b.deleted_at IS NULL
       ORDER BY epc.id DESC`,
      [req.user.id]
    );

    const transactions = await query(
      `SELECT pt.*, b.name AS business_name
       FROM payroll_transactions pt
       JOIN businesses b ON b.id = pt.business_id
       WHERE pt.employee_user_id = ?
       ORDER BY pt.id DESC LIMIT 60`,
      [req.user.id]
    );

    const notifications = await query(
      `SELECT * FROM notifications
       WHERE user_id = ? AND event_type IN ('payroll_paid', 'payroll_due', 'payroll_failed')
       ORDER BY id DESC LIMIT 20`,
      [req.user.id]
    );

    res.json({ configs, transactions, notifications });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/payroll/my/momo',
  authenticate,
  requirePasswordChanged,
  [
    body('payroll_config_id').isInt({ gt: 0 }).withMessage('Payroll record ID required'),
    body('momo_provider').isIn(['mtn_momo', 'airtel_money']).withMessage('Select MTN Mobile Money or Airtel Money'),
    body('momo_phone').custom((v) => {
      if (!isValidMobileMoneyPhone(v)) throw new Error('Enter a valid Mobile Money phone number (e.g. +250788123456)');
      return true;
    }),
    body('current_password').notEmpty().withMessage('Current account password is required to verify MoMo number changes'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { payroll_config_id, momo_provider, momo_phone, current_password } = req.body;
      const user = await queryOne('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
      const match = user ? await bcrypt.compare(current_password, user.password_hash) : false;
      if (!match) {
        return res.status(403).json({ error: 'Account password verification failed. Mobile money number was not changed.' });
      }

      const cfg = await queryOne('SELECT * FROM employee_payroll_configs WHERE id = ? AND user_id = ?', [
        payroll_config_id,
        req.user.id,
      ]);
      if (!cfg) return res.status(404).json({ error: 'Employee payroll record not found' });

      const cleanPhone = String(momo_phone).trim();
      await execute(
        `UPDATE employee_payroll_configs
         SET momo_provider = ?, momo_phone = ?, momo_phone_verified_at = datetime('now'), updated_by_user_id = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [momo_provider, cleanPhone, req.user.id, cfg.id]
      );

      await logAudit({
        businessId: cfg.business_id,
        userId: req.user.id,
        action: 'payroll.employee_momo_updated',
        entityType: 'employee_payroll_config',
        entityId: cfg.id,
        changes: { momo_provider, previous_phone: cfg.momo_phone, new_phone: cleanPhone },
        ipAddress: req.ip,
      });

      res.json({ message: 'Mobile money number verified and updated successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

// ================= MOBILE MONEY PROVIDER CALLBACK WEBHOOKS =================
router.post('/webhooks/momo/mtn', async (req, res, next) => {
  try {
    if (!verifyWebhookSignature('mtn_momo', req)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    const { externalId, financialTransactionId, status, reason } = req.body || {};
    const referenceId = req.headers['x-reference-id'] || req.body?.referenceId || '';
    const txRow = await queryOne(
      `SELECT * FROM payroll_transactions
       WHERE provider_transaction_id = ? OR payment_reference = ?
       LIMIT 1`,
      [String(referenceId), String(externalId || '')]
    );
    if (!txRow) return res.status(200).json({ received: true, matched: false });

    const norm = String(status || '').toUpperCase();
    if (norm === 'SUCCESSFUL') {
      await finalizeTransactionSuccess(txRow, financialTransactionId || null, req.body);
    } else if (norm === 'FAILED' || norm === 'REJECTED' || norm === 'TIMEOUT') {
      await finalizeTransactionFailure(txRow, reason || `MTN MoMo status: ${norm}`, norm, req.body);
    }
    res.json({ received: true, matched: true });
  } catch (err) {
    next(err);
  }
});

router.post('/webhooks/momo/airtel', async (req, res, next) => {
  try {
    if (!verifyWebhookSignature('airtel_money', req)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    const txPayload = req.body?.transaction || req.body?.data?.transaction || req.body || {};
    const txId = txPayload.id || txPayload.transaction_id || '';
    const statusCode = String(txPayload.status_code || txPayload.status || '').toUpperCase();
    const txRow = await queryOne(
      `SELECT * FROM payroll_transactions
       WHERE provider_transaction_id = ? OR payment_reference = ?
       LIMIT 1`,
      [String(txId), String(txPayload.reference || '')]
    );
    if (!txRow) return res.status(200).json({ received: true, matched: false });

    if (statusCode === 'TS' || statusCode === 'SUCCESS' || statusCode === 'SUCCESSFUL') {
      await finalizeTransactionSuccess(txRow, txPayload.airtel_money_id || txId, req.body);
    } else if (statusCode === 'TF' || statusCode === 'FAILED') {
      await finalizeTransactionFailure(txRow, txPayload.message || 'Airtel disbursement failed', statusCode, req.body);
    }
    res.json({ received: true, matched: true });
  } catch (err) {
    next(err);
  }
});

export default router;
