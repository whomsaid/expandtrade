import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { execute, query, queryOne, roundMoney, transaction } from '../config/db.js';
import { authenticate, requirePlatformAdmin, requireProfileImage } from '../middleware/auth.js';
import { requireBusiness, requirePermission } from '../middleware/tenant.js';
import { platformLogoUpload, removeUploadedFile, upload, verifyPlatformLogoFile } from '../middleware/upload.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { createNotification, emitToBusiness, logAudit } from '../services/auditService.js';
import { queryBusinessAssistant } from '../services/aiService.js';
import { sendMail } from '../services/mailService.js';
import { getCached, invalidateCache, setCached } from '../services/cacheService.js';

const router = express.Router();

// ================= TASKS & INTERNAL COMMUNICATION =================
router.get('/tasks', authenticate, requireBusiness, requirePermission('tasks.view'), async (req, res, next) => {
  try {
    const tasks = await query(
      `SELECT t.*, b.name AS branch_name, u1.full_name AS assigned_to_name, u1.avatar_url AS assigned_to_avatar,
              u2.full_name AS created_by_name, u2.avatar_url AS created_by_avatar
       FROM tasks t
       LEFT JOIN branches b ON b.id = t.branch_id
       LEFT JOIN users u1 ON u1.id = t.assigned_to_user_id
       LEFT JOIN users u2 ON u2.id = t.created_by_user_id
       WHERE t.business_id = ?
       ORDER BY t.id DESC LIMIT 150`,
      [req.businessId]
    );
    if (tasks.length > 0) {
      const ids = tasks.map((t) => t.id);
      const placeholders = ids.map(() => '?').join(',');
      const allComments = await query(
        `SELECT tc.*, u.full_name AS author_name, u.avatar_url AS author_avatar
         FROM task_comments tc JOIN users u ON u.id = tc.user_id
         WHERE tc.task_id IN (${placeholders}) ORDER BY tc.id ASC`,
        ids
      );
      const byTask = new Map();
      for (const c of allComments) {
        if (!byTask.has(c.task_id)) byTask.set(c.task_id, []);
        byTask.get(c.task_id).push(c);
      }
      for (const t of tasks) {
        t.comments = byTask.get(t.id) || [];
      }
    }
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/tasks',
  authenticate,
  requireBusiness,
  requirePermission('tasks.manage'),
  [body('title').trim().notEmpty().withMessage('Task title required')],
  validateRequest,
  async (req, res, next) => {
    try {
      const { title, description = '', assigned_to_user_id = null, branch_id = null, priority = 'medium', deadline = null } = req.body;
      const r = await execute(
        `INSERT INTO tasks (business_id, branch_id, title, description, assigned_to_user_id, created_by_user_id, priority, deadline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.businessId, branch_id || req.branchId, title.trim(), description, assigned_to_user_id || null, req.user.id, priority, deadline]
      );
      if (assigned_to_user_id) {
        await createNotification({
          businessId: req.businessId,
          userId: Number(assigned_to_user_id),
          eventType: 'task_assigned',
          title: 'New Task Assigned',
          message: `You were assigned: ${title.trim()}`,
          relatedUrl: '/app/tasks',
        });
      }
      emitToBusiness(req.businessId, 'task:updated', { taskId: r.insertId });
      res.status(201).json({ id: r.insertId, message: 'Task created' });
    } catch (err) {
      next(err);
    }
  }
);

router.patch('/tasks/:id', authenticate, requireBusiness, requirePermission('tasks.view'), async (req, res, next) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ? AND business_id = ?', [req.params.id, req.businessId]);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const { status, priority } = req.body;
    await execute(
      `UPDATE tasks SET status = COALESCE(?, status), priority = COALESCE(?, priority), updated_at = datetime('now') WHERE id = ?`,
      [status || null, priority || null, task.id]
    );
    emitToBusiness(req.businessId, 'task:updated', { taskId: task.id, status });
    res.json({ message: 'Task updated' });
  } catch (err) {
    next(err);
  }
});

router.post('/tasks/:id/comments', authenticate, requireBusiness, requirePermission('tasks.view'), async (req, res, next) => {
  try {
    const { comment } = req.body;
    if (!comment?.trim()) return res.status(400).json({ error: 'Comment required' });
    const task = await queryOne('SELECT id FROM tasks WHERE id = ? AND business_id = ?', [req.params.id, req.businessId]);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    await execute('INSERT INTO task_comments (task_id, user_id, comment) VALUES (?, ?, ?)', [task.id, req.user.id, comment.trim()]);
    res.status(201).json({ message: 'Comment posted' });
  } catch (err) {
    next(err);
  }
});

router.get('/announcements', authenticate, requireBusiness, async (req, res, next) => {
  try {
    const announcements = await query(
      `SELECT a.*, u.full_name AS author_name
       FROM announcements a LEFT JOIN users u ON u.id = a.author_user_id
       WHERE a.business_id = ? ORDER BY a.id DESC LIMIT 30`,
      [req.businessId]
    );
    res.json({ announcements });
  } catch (err) {
    next(err);
  }
});

router.post('/announcements', authenticate, requireBusiness, requirePermission('tasks.manage'), async (req, res, next) => {
  try {
    const { title, body: msgBody } = req.body;
    if (!title?.trim() || !msgBody?.trim()) return res.status(400).json({ error: 'Title and message body required' });
    const r = await execute(
      'INSERT INTO announcements (business_id, branch_id, title, body, author_user_id) VALUES (?, ?, ?, ?, ?)',
      [req.businessId, req.branchId, title.trim(), msgBody.trim(), req.user.id]
    );
    emitToBusiness(req.businessId, 'announcement:created', { id: r.insertId, title });
    res.status(201).json({ id: r.insertId });
  } catch (err) {
    next(err);
  }
});

router.get('/messages', authenticate, requireBusiness, async (req, res, next) => {
  try {
    const messages = await query(
      `SELECT m.*, u.full_name AS sender_name, u.avatar_url AS sender_avatar, b.name AS branch_name
       FROM messages m
       JOIN users u ON u.id = m.sender_user_id
       LEFT JOIN branches b ON b.id = m.branch_id
       WHERE m.business_id = ?
       ORDER BY m.id DESC LIMIT 60`,
      [req.businessId]
    );
    res.json({ messages: messages.reverse() });
  } catch (err) {
    next(err);
  }
});

router.post('/messages', authenticate, requireBusiness, async (req, res, next) => {
  try {
    const { body: msgBody, channel_type = 'general', recipient_user_id = null } = req.body;
    if (!msgBody?.trim()) return res.status(400).json({ error: 'Message text required' });
    const r = await execute(
      `INSERT INTO messages (business_id, branch_id, sender_user_id, recipient_user_id, channel_type, body)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.businessId, req.branchId, req.user.id, recipient_user_id || null, channel_type, msgBody.trim()]
    );
    const created = await queryOne(
      `SELECT m.*, u.full_name AS sender_name, u.avatar_url AS sender_avatar, b.name AS branch_name
       FROM messages m JOIN users u ON u.id = m.sender_user_id LEFT JOIN branches b ON b.id = m.branch_id
       WHERE m.id = ?`,
      [r.insertId]
    );
    emitToBusiness(req.businessId, 'message:new', created);
    res.status(201).json({ message: created });
  } catch (err) {
    next(err);
  }
});

// ================= NOTIFICATIONS =================
router.get('/notifications', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const notifications = await query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50',
      [req.user.id]
    );
    const prefs = await queryOne('SELECT * FROM notification_preferences WHERE user_id = ?', [req.user.id]);
    res.json({ notifications, preferences: prefs });
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/read-all', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    await execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'All notifications marked read' });
  } catch (err) {
    next(err);
  }
});

router.put('/notifications/preferences', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const {
      in_app_enabled = 1,
      email_enabled = 1,
      sms_enabled = 0,
      low_stock_alerts = 1,
      order_alerts = 1,
      expense_alerts = 1,
      payroll_alerts = 1,
    } = req.body;
    await execute(
      `UPDATE notification_preferences SET
         in_app_enabled = ?, email_enabled = ?, sms_enabled = ?,
         low_stock_alerts = ?, order_alerts = ?, expense_alerts = ?, payroll_alerts = ?
       WHERE user_id = ?`,
      [
        in_app_enabled ? 1 : 0,
        email_enabled ? 1 : 0,
        sms_enabled ? 1 : 0,
        low_stock_alerts ? 1 : 0,
        order_alerts ? 1 : 0,
        expense_alerts ? 1 : 0,
        payroll_alerts ? 1 : 0,
        req.user.id,
      ]
    );
    res.json({ message: 'Notification preferences saved' });
  } catch (err) {
    next(err);
  }
});

// ================= DASHBOARD, REPORTS & AUDIT =================
router.get('/reports/dashboard', authenticate, requireBusiness, async (req, res, next) => {
  try {
    const branchFilter = !req.membership.all_branches_access && req.branchId ? ' AND branch_id = ?' : req.query.branch_id ? ' AND branch_id = ?' : '';
    const filterBranchId = !req.membership.all_branches_access && req.branchId ? req.branchId : req.query.branch_id ? Number(req.query.branch_id) : null;
    const baseParams = filterBranchId ? [req.businessId, filterBranchId] : [req.businessId];
    const canViewFinance = ['business_owner', 'business_admin'].includes(req.membership.role_code) || req.permissions.includes('finance.view');
    const canViewPayroll = ['business_owner', 'business_admin'].includes(req.membership.role_code) || req.permissions.includes('payroll.view');

    const [
      today,
      month,
      year,
      exp,
      cogs,
      invStats,
      pendingOrders,
      custStats,
      supStats,
      dailyChart,
      topProducts,
      salesByCategory,
      salesByBranch,
      recentActivities,
      payrollSummary,
    ] = await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
         FROM sales WHERE business_id = ? AND sale_status != 'cancelled' AND sale_status != 'refunded' AND date(created_at) = date('now')${branchFilter}`,
        baseParams
      ),
      queryOne(
        `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
         FROM sales WHERE business_id = ? AND sale_status != 'cancelled' AND sale_status != 'refunded' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')${branchFilter}`,
        baseParams
      ),
      queryOne(
        `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
         FROM sales WHERE business_id = ? AND sale_status != 'cancelled' AND sale_status != 'refunded' AND strftime('%Y', created_at) = strftime('%Y', 'now')${branchFilter}`,
        baseParams
      ),
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE business_id = ? AND approval_status = 'approved'${branchFilter}`,
        baseParams
      ),
      queryOne(
        `SELECT COALESCE(SUM(si.quantity * si.unit_cost), 0) AS total
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.business_id = ? AND s.sale_status != 'cancelled' AND s.sale_status != 'refunded'${filterBranchId ? ' AND s.branch_id = ?' : ''}`,
        baseParams
      ),
      queryOne(
        `SELECT COUNT(DISTINCT p.id) AS total_products,
                SUM(CASE WHEN COALESCE(i.quantity, 0) > 0 AND COALESCE(i.quantity, 0) <= p.min_stock THEN 1 ELSE 0 END) AS low_stock,
                SUM(CASE WHEN COALESCE(i.quantity, 0) <= 0 THEN 1 ELSE 0 END) AS out_of_stock
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = ?
         WHERE p.business_id = ? AND p.status = 'active'`,
        [filterBranchId || req.branchId || 0, req.businessId]
      ),
      queryOne(
        `SELECT COUNT(*) AS cnt FROM orders WHERE business_id = ? AND order_status IN ('pending', 'confirmed', 'processing')`,
        [req.businessId]
      ),
      queryOne(
        `SELECT COUNT(*) AS total_customers, COALESCE(SUM(outstanding_balance), 0) AS customer_balances FROM customers WHERE business_id = ?`,
        [req.businessId]
      ),
      queryOne(
        `SELECT COALESCE(SUM(outstanding_balance), 0) AS supplier_balances FROM suppliers WHERE business_id = ?`,
        [req.businessId]
      ),
      query(
        `SELECT date(created_at) AS day, COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS transactions
         FROM sales WHERE business_id = ? AND sale_status != 'cancelled'${branchFilter}
         GROUP BY date(created_at) ORDER BY day DESC LIMIT 14`,
        baseParams
      ),
      query(
        `SELECT si.product_name, SUM(si.quantity) AS qty, SUM(si.line_total) AS revenue
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.business_id = ? AND s.sale_status != 'cancelled'
         GROUP BY si.product_id, si.product_name ORDER BY revenue DESC LIMIT 6`,
        [req.businessId]
      ),
      query(
        `SELECT COALESCE(c.name, 'Uncategorized') AS category, SUM(si.line_total) AS revenue
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE s.business_id = ? AND s.sale_status != 'cancelled'
         GROUP BY c.name ORDER BY revenue DESC`,
        [req.businessId]
      ),
      query(
        `SELECT b.name AS branch_name, COALESCE(SUM(s.total_amount), 0) AS revenue
         FROM branches b
         LEFT JOIN sales s ON s.branch_id = b.id AND s.business_id = ? AND s.sale_status != 'cancelled'
         WHERE b.business_id = ?
         GROUP BY b.id, b.name ORDER BY revenue DESC`,
        [req.businessId, req.businessId]
      ),
      query(
        `SELECT al.*, u.full_name AS user_name, u.avatar_url AS user_avatar
         FROM activity_logs al LEFT JOIN users u ON u.id = al.user_id
         WHERE al.business_id = ? ORDER BY al.id DESC LIMIT 12`,
        [req.businessId]
      ),
      canViewPayroll
        ? queryOne(
            `SELECT
               (SELECT COUNT(*) FROM employee_payroll_configs WHERE business_id = ? AND payroll_status = 'active') AS active_employees,
               (SELECT COUNT(*) FROM employee_payroll_configs WHERE business_id = ?) AS configured_employees,
               (SELECT COUNT(*) FROM employee_payroll_configs WHERE business_id = ? AND payroll_status = 'active' AND next_payment_date <= date('now')) AS due_count,
               (SELECT COALESCE(SUM(salary_amount), 0) FROM employee_payroll_configs WHERE business_id = ? AND payroll_status = 'active' AND next_payment_date <= date('now')) AS due_amount,
               (SELECT COUNT(*) FROM payroll_transactions WHERE business_id = ? AND status IN ('pending', 'processing')) AS pending_count,
               (SELECT COUNT(*) FROM payroll_transactions WHERE business_id = ? AND status = 'paid') AS paid_count,
               (SELECT COALESCE(available_balance, 0) FROM business_payroll_accounts WHERE business_id = ?) AS available_balance`,
            [req.businessId, req.businessId, req.businessId, req.businessId, req.businessId, req.businessId, req.businessId]
          )
        : Promise.resolve(null),
    ]);

    const grossProfit = roundMoney(Number(year.total) - Number(cogs.total));
    const netProfit = roundMoney(grossProfit - Number(exp.total));

    res.json({
      kpis: {
        sales_today: roundMoney(today.total),
        sales_today_count: Number(today.count),
        sales_month: roundMoney(month.total),
        sales_year: roundMoney(year.total),
        total_expenses: canViewFinance ? roundMoney(exp.total) : null,
        gross_profit: canViewFinance ? grossProfit : null,
        net_operating_profit: canViewFinance ? netProfit : null,
        total_products: Number(invStats?.total_products || 0),
        low_stock_products: Number(invStats?.low_stock || 0),
        out_of_stock_products: Number(invStats?.out_of_stock || 0),
        pending_orders: Number(pendingOrders?.cnt || 0),
        total_customers: Number(custStats?.total_customers || 0),
        outstanding_customer_balances: canViewFinance ? roundMoney(custStats?.customer_balances || 0) : null,
        supplier_balances: canViewFinance ? roundMoney(supStats?.supplier_balances || 0) : null,
        payroll: canViewPayroll
          ? {
              active_employees: Number(payrollSummary?.active_employees || 0),
              configured_employees: Number(payrollSummary?.configured_employees || 0),
              due_count: Number(payrollSummary?.due_count || 0),
              due_amount: roundMoney(payrollSummary?.due_amount || 0),
              pending_count: Number(payrollSummary?.pending_count || 0),
              paid_count: Number(payrollSummary?.paid_count || 0),
              available_balance: roundMoney(payrollSummary?.available_balance || 0),
            }
          : null,
      },
      charts: {
        daily_sales: dailyChart.reverse(),
        top_products: topProducts,
        sales_by_category: salesByCategory,
        sales_by_branch: salesByBranch,
      },
      recentActivities,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/reports/analytics', authenticate, requireBusiness, requirePermission('reports.view'), async (req, res, next) => {
  try {
    const salesByEmployee = await query(
      `SELECT u.full_name AS employee_name, COUNT(s.id) AS sales_count, COALESCE(SUM(s.total_amount), 0) AS revenue
       FROM sales s JOIN users u ON u.id = s.cashier_user_id
       WHERE s.business_id = ? AND s.sale_status != 'cancelled'
       GROUP BY s.cashier_user_id, u.full_name ORDER BY revenue DESC`,
      [req.businessId]
    );
    const paymentBreakdown = await query(
      `SELECT payment_method, COUNT(*) AS tx_count, COALESCE(SUM(amount), 0) AS total
       FROM payments WHERE business_id = ? GROUP BY payment_method ORDER BY total DESC`,
      [req.businessId]
    );
    const topCustomers = await query(
      `SELECT c.full_name, c.phone, c.loyalty_points, c.outstanding_balance, COUNT(s.id) AS orders_count, COALESCE(SUM(s.total_amount), 0) AS total_spent
       FROM customers c LEFT JOIN sales s ON s.customer_id = c.id AND s.sale_status != 'cancelled'
       WHERE c.business_id = ? GROUP BY c.id ORDER BY total_spent DESC LIMIT 10`,
      [req.businessId]
    );
    res.json({ salesByEmployee, paymentBreakdown, topCustomers });
  } catch (err) {
    next(err);
  }
});

router.get('/reports/audit-logs', authenticate, requireBusiness, requirePermission('settings.manage'), async (req, res, next) => {
  try {
    let logs = await query(
      `SELECT bal.*, u.full_name AS user_name
       FROM business_activity_logs bal LEFT JOIN users u ON u.id = bal.user_id
       WHERE bal.business_id = ? ORDER BY bal.id DESC LIMIT 100`,
      [req.businessId]
    );
    if (!logs.length) {
      logs = await query(
        `SELECT al.*, u.full_name AS user_name
         FROM activity_logs al LEFT JOIN users u ON u.id = al.user_id
         WHERE al.business_id = ? ORDER BY al.id DESC LIMIT 100`,
        [req.businessId]
      );
    }
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

// ================= AI BUSINESS ASSISTANT =================
router.post(
  '/ai/ask',
  authenticate,
  requireBusiness,
  requirePermission('ai.use'),
  [body('prompt').trim().notEmpty().withMessage('Please enter a business question')],
  validateRequest,
  async (req, res, next) => {
    try {
      const result = await queryBusinessAssistant({
        businessId: req.businessId,
        branchId: req.branchId,
        allBranchesAccess: Boolean(req.membership.all_branches_access),
        userPrompt: req.body.prompt,
        businessName: req.business.name,
        currencyCode: req.business.currency_code,
      });
      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'ai.queried',
        entityType: 'ai_assistant',
        changes: { prompt: req.body.prompt.slice(0, 120) },
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ================= SUBSCRIPTIONS & PLATFORM SUPER ADMIN =================
router.get('/subscriptions/plans', async (_req, res, next) => {
  try {
    const cached = getCached('public:subscription-plans');
    if (cached) return res.json({ plans: cached });
    const plans = await query('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY monthly_price_rwf ASC');
    setCached('public:subscription-plans', plans, 60_000);
    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

router.get('/subscriptions/current', authenticate, requireBusiness, async (req, res, next) => {
  try {
    const sub = await queryOne(
      `SELECT s.*, p.code AS plan_code, p.name AS plan_name, p.monthly_price_rwf, p.max_employees, p.max_branches, p.max_products
       FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
       WHERE s.business_id = ? ORDER BY s.id DESC LIMIT 1`,
      [req.businessId]
    );
    const payments = await query(
      'SELECT * FROM subscription_payments WHERE business_id = ? ORDER BY id DESC',
      [req.businessId]
    );
    res.json({ subscription: sub, payments });
  } catch (err) {
    next(err);
  }
});

router.post('/subscriptions/subscribe', authenticate, requireBusiness, requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const { plan_id, billing_cycle = 'monthly', payment_method = 'mtn_momo' } = req.body;
    const plan = await queryOne('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1', [plan_id]);
    if (!plan) return res.status(404).json({ error: 'Subscription plan not found' });

    const amount = billing_cycle === 'annual' ? Number(plan.annual_price_rwf) : Number(plan.monthly_price_rwf);
    const days = billing_cycle === 'annual' ? 365 : 30;
    const subRes = await execute(
      `INSERT INTO subscriptions (business_id, plan_id, billing_cycle, status, ends_at)
       VALUES (?, ?, ?, 'active', datetime('now', '+${days} days'))`,
      [req.businessId, plan.id, billing_cycle]
    );
    if (amount > 0) {
      await execute(
        `INSERT INTO subscription_payments (subscription_id, business_id, amount_rwf, payment_method, reference_number, status)
         VALUES (?, ?, ?, ?, ?, 'verified')`,
        [subRes.insertId, req.businessId, amount, payment_method, `SUB-${Date.now()}`]
      );
    }
    res.json({ message: `Subscribed to ${plan.name} (${billing_cycle})`, subscriptionId: subRes.insertId });
  } catch (err) {
    next(err);
  }
});

// Platform Super Admin endpoints (full platform governance, business registration, admin assignment, settings)
router.get('/admin/overview', authenticate, requirePlatformAdmin, async (_req, res, next) => {
  try {
    const [
      stats,
      businesses,
      rawUsers,
      admins,
      plans,
      tickets,
      inquiries,
      activityLogs,
      loginAttempts,
      settingsRows,
    ] = await Promise.all([
      queryOne(
        `SELECT (SELECT COUNT(*) FROM businesses WHERE status != 'deleted' AND deleted_at IS NULL) AS total_businesses,
                (SELECT COUNT(*) FROM businesses WHERE status = 'active' AND deleted_at IS NULL) AS active_businesses,
                (SELECT COUNT(*) FROM businesses WHERE status = 'suspended' AND deleted_at IS NULL) AS suspended_businesses,
                (SELECT COUNT(*) FROM businesses WHERE status = 'pending_activation' AND deleted_at IS NULL) AS pending_activation_businesses,
                (SELECT COUNT(*) FROM businesses WHERE status = 'deleted' OR deleted_at IS NOT NULL) AS deleted_businesses,
                (SELECT COUNT(*) FROM users) AS total_users,
                (SELECT COUNT(*) FROM users WHERE is_active = 1) AS active_users,
                (SELECT COUNT(*) FROM users u WHERE u.is_platform_admin = 0 AND NOT EXISTS (SELECT 1 FROM business_members bm WHERE bm.user_id = u.id AND bm.status = 'active')) AS customer_count,
                (SELECT COUNT(*) FROM user_sessions WHERE is_revoked = 0) AS active_sessions,
                (SELECT COUNT(*) FROM support_tickets WHERE status != 'resolved') AS open_tickets,
                (SELECT COUNT(*) FROM activity_logs) AS total_audit_events,
                (SELECT COUNT(*) FROM sales WHERE sale_status != 'cancelled') AS total_sales_count,
                (SELECT COALESCE(SUM(amount_rwf), 0) FROM subscription_payments WHERE status = 'verified') AS platform_subscription_revenue`
      ),
      query(
        `SELECT b.id, b.business_code, b.name, b.slug, b.category, b.logo_url, b.description,
                b.email, b.phone, b.country, b.province, b.district, b.physical_address,
                b.currency_code, b.timezone, b.tax_enabled, b.default_tax_rate,
                b.tax_identification_number, b.operating_hours, b.is_public_listed,
                b.status, b.deleted_at, b.created_at,
                COALESCE(ba_user.id, u.id) AS primary_admin_user_id,
                COALESCE(ba_user.full_name, u.full_name) AS owner_name,
                COALESCE(ba_user.email, u.email) AS owner_email,
                COALESCE(ba_user.phone, u.phone) AS owner_phone,
                COALESCE(ba_user.avatar_url, u.avatar_url) AS owner_avatar,
                ba.status AS admin_activation_status,
                ba.activation_token AS admin_activation_token,
                ba.activated_at AS admin_activated_at,
                p.id AS plan_id, p.name AS plan_name, s.status AS subscription_status, s.billing_cycle, s.ends_at AS subscription_ends_at,
                (SELECT COUNT(*) FROM business_members bm WHERE bm.business_id = b.id AND bm.status = 'active') AS employee_count,
                (SELECT COUNT(*) FROM branches br WHERE br.business_id = b.id) AS branch_count,
                (SELECT COUNT(*) FROM sales sl WHERE sl.business_id = b.id AND sl.sale_status != 'cancelled') AS sales_count
         FROM businesses b
         JOIN users u ON u.id = b.owner_user_id
         LEFT JOIN business_admins ba ON ba.id = (
           SELECT id FROM business_admins WHERE business_id = b.id AND is_primary = 1 ORDER BY id DESC LIMIT 1
         )
         LEFT JOIN users ba_user ON ba_user.id = ba.user_id
         LEFT JOIN subscriptions s ON s.id = (SELECT id FROM subscriptions WHERE business_id = b.id ORDER BY id DESC LIMIT 1)
         LEFT JOIN subscription_plans p ON p.id = s.plan_id
         ORDER BY b.id DESC`
      ),
      query(
        `SELECT u.id, u.full_name, u.email, u.phone, u.avatar_url, u.is_email_verified, u.is_active, u.is_platform_admin,
                u.last_login_at, u.created_at,
                cp.city AS customer_city, cp.country AS customer_country, cp.loyalty_tier,
                (SELECT COUNT(*) FROM business_members bm JOIN businesses b ON b.id = bm.business_id WHERE bm.user_id = u.id AND bm.status = 'active' AND b.deleted_at IS NULL) AS business_count,
                (SELECT COUNT(*) FROM business_admins ba JOIN businesses b ON b.id = ba.business_id WHERE ba.user_id = u.id AND b.deleted_at IS NULL) AS admin_business_count,
                (SELECT COUNT(*) FROM user_sessions us WHERE us.user_id = u.id AND us.is_revoked = 0) AS active_sessions
         FROM users u
         LEFT JOIN customer_profiles cp ON cp.user_id = u.id
         ORDER BY u.is_platform_admin DESC, u.id DESC LIMIT 300`
      ),
      query(
        `SELECT u.id, u.full_name, u.email, u.phone, u.avatar_url, u.is_active, u.last_login_at, u.created_at,
                COALESCE(pa.admin_level, 'super_admin') AS admin_level
         FROM users u
         LEFT JOIN platform_admins pa ON pa.user_id = u.id
         WHERE u.is_platform_admin = 1
         ORDER BY u.id ASC`
      ),
      query('SELECT * FROM subscription_plans ORDER BY monthly_price_rwf ASC'),
      query(
        `SELECT st.*, u.full_name AS user_name, u.email AS user_email, u.avatar_url AS user_avatar, b.name AS business_name
         FROM support_tickets st
         LEFT JOIN users u ON u.id = st.user_id
         LEFT JOIN businesses b ON b.id = st.business_id
         ORDER BY st.id DESC`
      ),
      query(
        `SELECT ci.*, b.name AS target_business_name
         FROM contact_inquiries ci
         LEFT JOIN businesses b ON b.id = ci.business_id
         ORDER BY ci.id DESC LIMIT 100`
      ),
      query(
        `SELECT al.*, u.full_name AS user_name, u.email AS user_email, u.avatar_url AS user_avatar, b.name AS business_name
         FROM activity_logs al
         LEFT JOIN users u ON u.id = al.user_id
         LEFT JOIN businesses b ON b.id = al.business_id
         ORDER BY al.id DESC LIMIT 200`
      ),
      query('SELECT * FROM login_attempts ORDER BY id DESC LIMIT 100'),
      query('SELECT setting_key, setting_value FROM platform_settings ORDER BY id ASC'),
    ]);

    const users = rawUsers.map((u) => {
      let account_category = 'customer';
      if (u.is_platform_admin) account_category = 'platform_super_admin';
      else if (Number(u.admin_business_count) > 0) account_category = 'business_admin';
      else if (Number(u.business_count) > 0) account_category = 'employee';
      return { ...u, account_category };
    });

    const platformSettings = settingsRows.reduce((acc, row) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});

    res.json({
      stats,
      businesses,
      users,
      admins,
      plans,
      tickets,
      inquiries,
      activityLogs,
      loginAttempts,
      platformSettings,
    });
  } catch (err) {
    next(err);
  }
});

// Super Admin: Register a new business + create/assign initial Business Admin with activation link
router.post(
  '/admin/businesses',
  authenticate,
  requirePlatformAdmin,
  upload.single('logo'),
  [
    body('name').trim().isLength({ min: 2, max: 160 }).withMessage('Business name is required'),
    body('category').trim().notEmpty().withMessage('Business category is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid business email is required'),
    body('phone').trim().notEmpty().withMessage('Business phone number is required'),
    body('physical_address').trim().notEmpty().withMessage('Physical address is required'),
    body('admin_full_name').trim().isLength({ min: 2, max: 140 }).withMessage('Initial Business Admin full name is required'),
    body('admin_email').isEmail().normalizeEmail().withMessage('Initial Business Admin email is required'),
    body('admin_phone').trim().notEmpty().withMessage('Initial Business Admin phone is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const {
        name,
        category,
        description = '',
        email,
        phone,
        country = 'Rwanda',
        province = 'Kigali City',
        district = 'Gasabo',
        physical_address,
        currency_code = 'RWF',
        timezone = 'Africa/Kigali',
        tax_enabled = 1,
        default_tax_rate = 18,
        tax_identification_number = '',
        operating_hours = 'Mon-Sat 08:00 - 20:00',
        initial_status = 'pending_activation',
        is_public_listed = 1,
        plan_id = null,
        branch_name = 'Main Headquarters',
        admin_full_name,
        admin_email,
        admin_phone,
      } = req.body;

      const allowedStatuses = ['active', 'pending_activation'];
      const bizStatus = allowedStatuses.includes(initial_status) ? initial_status : 'pending_activation';
      const logoUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.logo_url || null);

      const existingAdminUser = await queryOne('SELECT id, is_platform_admin, is_email_verified FROM users WHERE email = ?', [admin_email]);
      if (existingAdminUser?.is_platform_admin) {
        return res.status(400).json({ error: 'Platform Super Admin email cannot be assigned as a tenant Business Admin' });
      }

      const baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const slug = `${baseSlug || 'business'}-${crypto.randomBytes(2).toString('hex')}`;
      const businessCode = `BIZ-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const activationToken = crypto.randomBytes(24).toString('hex');
      const activationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const tempPasswordHash = await bcrypt.hash('admin@123', 10);

      const result = await transaction(async (tx) => {
        let adminUserId = existingAdminUser?.id;
        if (!adminUserId) {
          const uRes = await tx.execute(
            `INSERT INTO users (full_name, email, phone, password_hash, must_change_password, is_email_verified, is_active, is_platform_admin)
             VALUES (?, ?, ?, ?, 1, 0, 1, 0)`,
            [admin_full_name.trim(), admin_email, admin_phone.trim(), tempPasswordHash]
          );
          adminUserId = uRes.insertId;
          await tx.execute('INSERT INTO notification_preferences (user_id) VALUES (?)', [adminUserId]);
        } else if (!existingAdminUser.is_email_verified) {
          await tx.execute(
            `UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?`,
            [tempPasswordHash, adminUserId]
          );
        }

        const taxFlag = tax_enabled === false || tax_enabled === 'false' || tax_enabled === 0 || tax_enabled === '0' ? 0 : 1;
        const publicFlag = is_public_listed === false || is_public_listed === 'false' || is_public_listed === 0 || is_public_listed === '0' ? 0 : 1;

        const bizRes = await tx.execute(
          `INSERT INTO businesses (business_code, owner_user_id, name, slug, category, logo_url, description, email, phone, country, province, district, physical_address, currency_code, timezone, tax_enabled, default_tax_rate, tax_identification_number, operating_hours, is_public_listed, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            businessCode,
            adminUserId,
            name.trim(),
            slug,
            category.trim(),
            logoUrl,
            description,
            email,
            phone.trim(),
            country.trim(),
            province.trim(),
            district.trim(),
            physical_address.trim(),
            currency_code.trim().toUpperCase(),
            timezone,
            taxFlag,
            Number(default_tax_rate || 0),
            tax_identification_number,
            operating_hours,
            publicFlag,
            bizStatus,
          ]
        );
        const businessId = bizRes.insertId;

        await tx.execute(
          `INSERT INTO business_settings (business_id, language, receipt_header, receipt_footer, enabled_payment_methods)
           VALUES (?, 'en', ?, ?, ?)`,
          [
            businessId,
            `Thank you for choosing ${name.trim()}`,
            'Powered by BizTrade Africa',
            JSON.stringify(['cash', 'mtn_momo', 'airtel_money', 'bank_transfer', 'card']),
          ]
        );

        const branchRes = await tx.execute(
          `INSERT INTO branches (business_id, name, code, province, district, address, phone, manager_user_id, is_main)
           VALUES (?, ?, 'HQ-01', ?, ?, ?, ?, ?, 1)`,
          [businessId, branch_name.trim() || 'Main Headquarters', province, district, physical_address, phone, adminUserId]
        );

        const bizAdminRole = await tx.queryOne(`SELECT id FROM roles WHERE code = 'business_admin'`);
        await tx.execute(
          `INSERT INTO business_admins (business_id, user_id, is_primary, assigned_by_admin_id, activation_token, activation_expires_at, status)
           VALUES (?, ?, 1, ?, ?, ?, 'pending_activation')`,
          [businessId, adminUserId, req.user.id, activationToken, activationExpiresAt]
        );
        await tx.execute(
          `INSERT INTO business_members (business_id, user_id, role_id, assigned_branch_id, all_branches_access, job_title, status)
           VALUES (?, ?, ?, ?, 1, 'Business Admin', 'pending')`,
          [businessId, adminUserId, bizAdminRole.id, branchRes.insertId]
        );

        const defaultExpenseCats = ['Rent & Utilities', 'Transport & Delivery', 'Salaries & Wages', 'Supplies & Packaging'];
        for (const ec of defaultExpenseCats) {
          await tx.execute('INSERT INTO expense_categories (business_id, name) VALUES (?, ?)', [businessId, ec]);
        }

        const chosenPlan = plan_id
          ? await tx.queryOne('SELECT id FROM subscription_plans WHERE id = ?', [plan_id])
          : await tx.queryOne(`SELECT id FROM subscription_plans WHERE code = 'starter'`);
        if (chosenPlan) {
          await tx.execute(
            `INSERT INTO subscriptions (business_id, plan_id, billing_cycle, status, ends_at)
             VALUES (?, ?, 'monthly', 'trialing', datetime('now', '+14 days'))`,
            [businessId, chosenPlan.id]
          );
        }

        await tx.execute(
          `INSERT INTO notifications (business_id, user_id, event_type, title, message, related_url)
           VALUES (?, ?, 'security_alert', ?, ?, '/app/settings')`,
          [
            businessId,
            adminUserId,
            'Temporary Password Must Be Changed',
            `Your initial Business Admin account for ${name.trim()} uses a temporary password that must be changed immediately after first login before accessing the dashboard.`,
          ]
        );

        return { businessId, adminUserId, branchId: branchRes.insertId };
      });

      const activationUrl = `/activate-account?token=${activationToken}`;
      const mailResult = await sendMail({
        to: admin_email,
        subject: `Activate your Business Admin account for ${name.trim()}`,
        text: `Hello ${admin_full_name.trim()}, Platform Super Admin registered ${name.trim()} (${businessCode}) on BizTrade Africa and assigned you as Business Admin. Open ${activationUrl} to verify your email, upload your profile photo, and set your permanent password. If you sign in with the temporary initial password, you will be required to change it immediately before accessing the business dashboard. For security, passwords are never sent via email.`,
      });

      await logAudit({
        businessId: result.businessId,
        branchId: result.branchId,
        userId: req.user.id,
        action: 'platform.business_registered',
        entityType: 'business',
        entityId: result.businessId,
        changes: { businessCode, admin_email, initial_status: bizStatus },
        ipAddress: req.ip,
      });

      const created = await queryOne('SELECT * FROM businesses WHERE id = ?', [result.businessId]);
      res.status(201).json({
        message: mailResult.delivered
          ? `Business ${created.name} (${businessCode}) registered and activation link emailed.`
          : `Business ${created.name} (${businessCode}) registered. Share the secure activation link with ${admin_email}.`,
        business: created,
        activation_url: !mailResult.delivered || process.env.NODE_ENV !== 'production' ? activationUrl : undefined,
        activation_token: !mailResult.delivered || process.env.NODE_ENV !== 'production' ? activationToken : undefined,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Super Admin: Edit business metadata
router.put(
  '/admin/businesses/:id',
  authenticate,
  requirePlatformAdmin,
  upload.single('logo'),
  async (req, res, next) => {
    try {
      const biz = await queryOne('SELECT * FROM businesses WHERE id = ?', [req.params.id]);
      if (!biz) return res.status(404).json({ error: 'Business not found' });

      const {
        name,
        category,
        description,
        email,
        phone,
        country,
        province,
        district,
        physical_address,
        currency_code,
        tax_enabled,
        default_tax_rate,
        tax_identification_number,
        operating_hours,
        is_public_listed,
      } = req.body;

      const logoUrl = req.file ? `/uploads/${req.file.filename}` : null;
      const taxFlag = tax_enabled === undefined ? null : (tax_enabled === false || tax_enabled === 'false' || tax_enabled === 0 || tax_enabled === '0' ? 0 : 1);
      const publicFlag = is_public_listed === undefined ? null : (is_public_listed === false || is_public_listed === 'false' || is_public_listed === 0 || is_public_listed === '0' ? 0 : 1);

      await execute(
        `UPDATE businesses SET
           name = COALESCE(?, name),
           category = COALESCE(?, category),
           description = COALESCE(?, description),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           country = COALESCE(?, country),
           province = COALESCE(?, province),
           district = COALESCE(?, district),
           physical_address = COALESCE(?, physical_address),
           currency_code = COALESCE(?, currency_code),
           tax_enabled = COALESCE(?, tax_enabled),
           default_tax_rate = COALESCE(?, default_tax_rate),
           tax_identification_number = COALESCE(?, tax_identification_number),
           operating_hours = COALESCE(?, operating_hours),
           is_public_listed = COALESCE(?, is_public_listed),
           logo_url = COALESCE(?, logo_url),
           updated_at = datetime('now')
         WHERE id = ?`,
        [
          name?.trim() || null,
          category?.trim() || null,
          description !== undefined ? description : null,
          email || null,
          phone?.trim() || null,
          country?.trim() || null,
          province?.trim() || null,
          district?.trim() || null,
          physical_address?.trim() || null,
          currency_code?.trim().toUpperCase() || null,
          taxFlag,
          default_tax_rate !== undefined && default_tax_rate !== '' ? Number(default_tax_rate) : null,
          tax_identification_number !== undefined ? tax_identification_number : null,
          operating_hours !== undefined ? operating_hours : null,
          publicFlag,
          logoUrl,
          req.params.id,
        ]
      );

      await logAudit({
        businessId: Number(req.params.id),
        userId: req.user.id,
        action: 'platform.business_updated',
        entityType: 'business',
        entityId: req.params.id,
        changes: { name, category, currency_code },
        ipAddress: req.ip,
      });

      const updated = await queryOne('SELECT * FROM businesses WHERE id = ?', [req.params.id]);
      res.json({ message: 'Business details updated', business: updated });
    } catch (err) {
      next(err);
    }
  }
);

router.patch('/admin/businesses/:id/status', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended', 'deactivated', 'pending_activation'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const biz = await queryOne('SELECT id, deleted_at FROM businesses WHERE id = ?', [req.params.id]);
    if (!biz || biz.deleted_at) {
      return res.status(404).json({ error: 'Active business not found' });
    }
    await execute(`UPDATE businesses SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, req.params.id]);
    await logAudit({
      businessId: Number(req.params.id),
      userId: req.user.id,
      action: `platform.business_${status}`,
      entityType: 'business',
      entityId: req.params.id,
      ipAddress: req.ip,
    });
    res.json({ message: `Business status updated to ${status}` });
  } catch (err) {
    next(err);
  }
});

// Super Admin: Controlled Retention Policy soft-delete (preserves financial & audit records while locking workspace)
router.delete('/admin/businesses/:id', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const biz = await queryOne('SELECT id, name, deleted_at FROM businesses WHERE id = ?', [req.params.id]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    if (biz.deleted_at) return res.status(400).json({ error: 'Business is already archived/deleted under retention policy' });

    const reason = String(req.body?.reason || 'Archived under Super Admin controlled retention policy').trim();

    await transaction(async (tx) => {
      await tx.execute(
        `UPDATE businesses SET status = 'deleted', is_public_listed = 0, deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        [biz.id]
      );
      await tx.execute(
        `UPDATE business_members SET status = 'deactivated' WHERE business_id = ?`,
        [biz.id]
      );
      await tx.execute(
        `UPDATE business_admins SET status = 'revoked', updated_at = datetime('now') WHERE business_id = ?`,
        [biz.id]
      );
    });

    await logAudit({
      businessId: biz.id,
      userId: req.user.id,
      action: 'platform.business_deleted_retention',
      entityType: 'business',
      entityId: biz.id,
      changes: { reason },
      ipAddress: req.ip,
    });

    res.json({ message: `Business "${biz.name}" deactivated and scheduled under controlled retention policy.` });
  } catch (err) {
    next(err);
  }
});

// Super Admin: Assign or replace primary Business Admin
router.post(
  '/admin/businesses/:id/assign-admin',
  authenticate,
  requirePlatformAdmin,
  [
    body('full_name').trim().isLength({ min: 2 }).withMessage('Full name required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('phone').trim().notEmpty().withMessage('Phone number required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const biz = await queryOne('SELECT * FROM businesses WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      if (!biz) return res.status(404).json({ error: 'Business not found' });

      const { full_name, email, phone, replace_previous = true } = req.body;
      const existingUser = await queryOne('SELECT id, is_platform_admin, is_email_verified FROM users WHERE email = ?', [email]);
      if (existingUser?.is_platform_admin) {
        return res.status(400).json({ error: 'Platform Super Admin cannot be assigned as a Business Admin' });
      }

      const activationToken = crypto.randomBytes(24).toString('hex');
      const activationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const tempPasswordHash = await bcrypt.hash('admin@123', 10);

      await transaction(async (tx) => {
        let adminUserId = existingUser?.id;
        if (!adminUserId) {
          const uRes = await tx.execute(
            `INSERT INTO users (full_name, email, phone, password_hash, must_change_password, is_email_verified, is_active, is_platform_admin)
             VALUES (?, ?, ?, ?, 1, 0, 1, 0)`,
            [full_name.trim(), email, phone.trim(), tempPasswordHash]
          );
          adminUserId = uRes.insertId;
          await tx.execute('INSERT INTO notification_preferences (user_id) VALUES (?)', [adminUserId]);
        } else if (!existingUser.is_email_verified) {
          await tx.execute(
            `UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?`,
            [tempPasswordHash, adminUserId]
          );
        }

        if (replace_previous) {
          const previousAdmins = await tx.query(
            `SELECT user_id FROM business_admins WHERE business_id = ? AND is_primary = 1 AND user_id != ?`,
            [biz.id, adminUserId]
          );
          await tx.execute(
            `UPDATE business_admins SET is_primary = 0, status = 'replaced', updated_at = datetime('now') WHERE business_id = ? AND user_id != ?`,
            [biz.id, adminUserId]
          );
          for (const prev of previousAdmins) {
            await tx.execute(
              `UPDATE business_members SET status = 'deactivated' WHERE business_id = ? AND user_id = ?`,
              [biz.id, prev.user_id]
            );
          }
        }

        await tx.execute('UPDATE businesses SET owner_user_id = ?, updated_at = datetime(\'now\') WHERE id = ?', [adminUserId, biz.id]);

        const existingBa = await tx.queryOne('SELECT id FROM business_admins WHERE business_id = ? AND user_id = ?', [biz.id, adminUserId]);
        if (existingBa) {
          await tx.execute(
            `UPDATE business_admins
             SET is_primary = 1, assigned_by_admin_id = ?, activation_token = ?, activation_expires_at = ?, status = 'pending_activation', updated_at = datetime('now')
             WHERE id = ?`,
            [req.user.id, activationToken, activationExpiresAt, existingBa.id]
          );
        } else {
          await tx.execute(
            `INSERT INTO business_admins (business_id, user_id, is_primary, assigned_by_admin_id, activation_token, activation_expires_at, status)
             VALUES (?, ?, 1, ?, ?, ?, 'pending_activation')`,
            [biz.id, adminUserId, req.user.id, activationToken, activationExpiresAt]
          );
        }

        const bizAdminRole = await tx.queryOne(`SELECT id FROM roles WHERE code = 'business_admin'`);
        const mainBranch = await tx.queryOne('SELECT id FROM branches WHERE business_id = ? ORDER BY is_main DESC, id ASC LIMIT 1', [biz.id]);
        const existingMember = await tx.queryOne('SELECT id FROM business_members WHERE business_id = ? AND user_id = ?', [biz.id, adminUserId]);
        if (existingMember) {
          await tx.execute(
            `UPDATE business_members SET role_id = ?, all_branches_access = 1, job_title = 'Business Admin', status = 'pending' WHERE id = ?`,
            [bizAdminRole.id, existingMember.id]
          );
        } else {
          await tx.execute(
            `INSERT INTO business_members (business_id, user_id, role_id, assigned_branch_id, all_branches_access, job_title, status)
             VALUES (?, ?, ?, ?, 1, 'Business Admin', 'pending')`,
            [biz.id, adminUserId, bizAdminRole.id, mainBranch?.id || null]
          );
        }
        await tx.execute(
          `INSERT INTO notifications (business_id, user_id, event_type, title, message, related_url)
           VALUES (?, ?, 'security_alert', ?, ?, '/app/settings')`,
          [
            biz.id,
            adminUserId,
            'Temporary Password Must Be Changed',
            `You have been assigned as Business Admin for ${biz.name}. If signing in with the temporary initial password, you must change it immediately before accessing the dashboard.`,
          ]
        );
      });

      const activationUrl = `/activate-account?token=${activationToken}`;
      const mailResult = await sendMail({
        to: email,
        subject: `Business Admin assignment for ${biz.name}`,
        text: `Hello ${full_name.trim()}, you have been assigned as Business Admin for ${biz.name}. Open ${activationUrl} to upload your profile photo, set your permanent password, and activate access. Note: Any temporary initial password must be changed immediately on first login. For security, passwords are never sent via email.`,
      });

      await logAudit({
        businessId: biz.id,
        userId: req.user.id,
        action: 'platform.business_admin_assigned',
        entityType: 'business',
        entityId: biz.id,
        changes: { new_admin_email: email, replace_previous },
        ipAddress: req.ip,
      });

      res.json({
        message: `Assigned ${email} as primary Business Admin for ${biz.name}.`,
        activation_url: !mailResult.delivered || process.env.NODE_ENV !== 'production' ? activationUrl : undefined,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Super Admin: Securely reset primary Business Admin's access (revokes sessions + sends password reset link)
router.post('/admin/businesses/:id/reset-admin-access', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const biz = await queryOne('SELECT id, name, owner_user_id FROM businesses WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const primaryAdmin = await queryOne(
      `SELECT u.id, u.full_name, u.email
       FROM users u
       LEFT JOIN business_admins ba ON ba.business_id = ? AND ba.is_primary = 1
       WHERE u.id = COALESCE(ba.user_id, ?)
       LIMIT 1`,
      [biz.id, biz.owner_user_id]
    );
    if (!primaryAdmin) return res.status(404).json({ error: 'Primary Business Admin account not found' });

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await execute('UPDATE user_sessions SET is_revoked = 1 WHERE user_id = ?', [primaryAdmin.id]);
    await execute('INSERT INTO password_resets (user_id, reset_token, expires_at) VALUES (?, ?, ?)', [
      primaryAdmin.id,
      token,
      expiresAt,
    ]);

    const mailResult = await sendMail({
      to: primaryAdmin.email,
      subject: `Account Access Reset for ${biz.name} — BizTrade Africa`,
      text: `Platform Super Admin initiated an account access reset for ${biz.name}. Use recovery token ${token} on the Forgot Password page to set a new password.`,
    });

    await logAudit({
      businessId: biz.id,
      userId: req.user.id,
      action: 'platform.business_admin_access_reset',
      entityType: 'user',
      entityId: primaryAdmin.id,
      changes: { business_id: biz.id, target_email: primaryAdmin.email },
      ipAddress: req.ip,
    });

    res.json({
      message: `Revoked active sessions and sent recovery instructions to ${primaryAdmin.email}.`,
      devResetToken: !mailResult.delivered || process.env.NODE_ENV !== 'production' ? token : undefined,
    });
  } catch (err) {
    next(err);
  }
});

// Super Admin: Platform-wide settings
router.get('/admin/settings', authenticate, requirePlatformAdmin, async (_req, res, next) => {
  try {
    const rows = await query('SELECT setting_key, setting_value FROM platform_settings ORDER BY id ASC');
    const settings = rows.reduce((acc, row) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

router.put('/admin/settings', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const updates = req.body || {};
    const allowedKeys = [
      'platform_name',
      'support_email',
      'support_phone',
      'platform_location',
      'social_facebook_url',
      'social_instagram_url',
      'social_x_url',
      'social_linkedin_url',
      'developer_name',
      'developer_role',
      'developer_bio',
      'developer_email',
      'developer_portfolio_url',
      'developer_github_url',
      'developer_linkedin_url',
      'default_currency',
      'default_tax_rate',
      'allow_customer_reviews',
      'business_retention_days',
      'require_email_verification',
    ];
    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        const val = String(updates[key]);
        const existing = await queryOne('SELECT id FROM platform_settings WHERE setting_key = ?', [key]);
        if (existing) {
          await execute(
            `UPDATE platform_settings SET setting_value = ?, updated_by_user_id = ?, updated_at = datetime('now') WHERE id = ?`,
            [val, req.user.id, existing.id]
          );
        } else {
          await execute(
            `INSERT INTO platform_settings (setting_key, setting_value, updated_by_user_id) VALUES (?, ?, ?)`,
            [key, val, req.user.id]
          );
        }
      }
    }

    await logAudit({
      userId: req.user.id,
      action: 'platform.settings_updated',
      entityType: 'platform_settings',
      changes: updates,
      ipAddress: req.ip,
    });

    const rows = await query('SELECT setting_key, setting_value FROM platform_settings ORDER BY id ASC');
    const settings = rows.reduce((acc, row) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});
    invalidateCache('public:platform-config');
    res.json({ message: 'Platform settings saved', settings });
  } catch (err) {
    next(err);
  }
});

// Super Admin ONLY: Upload or replace official platform logo
router.post(
  '/admin/platform-logo',
  authenticate,
  requirePlatformAdmin,
  platformLogoUpload.single('logo'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Please select a PNG, JPG, JPEG, SVG, or WEBP logo file (max 5MB).' });
      }
      if (!verifyPlatformLogoFile(req.file.path, req.file.mimetype)) {
        removeUploadedFile(req.file.path);
        return res.status(400).json({
          error: 'Invalid or unsafe logo file. Allowed: valid PNG, JPG, JPEG, WEBP, or sanitized SVG.',
        });
      }

      const nextLogoUrl = `/uploads/platform/${req.file.filename}`;
      const existing = await queryOne(`SELECT id, setting_value FROM platform_settings WHERE setting_key = 'platform_logo_url'`);
      const previousUrl = existing?.setting_value || '';

      if (existing) {
        await execute(
          `UPDATE platform_settings SET setting_value = ?, updated_by_user_id = ?, updated_at = datetime('now') WHERE id = ?`,
          [nextLogoUrl, req.user.id, existing.id]
        );
      } else {
        await execute(
          `INSERT INTO platform_settings (setting_key, setting_value, updated_by_user_id) VALUES ('platform_logo_url', ?, ?)`,
          [nextLogoUrl, req.user.id]
        );
      }

      if (previousUrl && previousUrl.startsWith('/uploads/platform/') && previousUrl !== nextLogoUrl) {
        removeUploadedFile(previousUrl);
      }

      await logAudit({
        userId: req.user.id,
        action: 'platform.logo_updated',
        entityType: 'platform_settings',
        changes: { platform_logo_url: nextLogoUrl },
        ipAddress: req.ip,
      });
      invalidateCache('public:platform-config');

      res.json({ message: 'Official platform logo updated.', platform_logo_url: nextLogoUrl });
    } catch (err) {
      if (req.file?.path) removeUploadedFile(req.file.path);
      next(err);
    }
  }
);

// Super Admin ONLY: Remove official platform logo
router.delete('/admin/platform-logo', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const existing = await queryOne(`SELECT id, setting_value FROM platform_settings WHERE setting_key = 'platform_logo_url'`);
    const previousUrl = existing?.setting_value || '';

    if (existing) {
      await execute(
        `UPDATE platform_settings SET setting_value = '', updated_by_user_id = ?, updated_at = datetime('now') WHERE id = ?`,
        [req.user.id, existing.id]
      );
    } else {
      await execute(
        `INSERT INTO platform_settings (setting_key, setting_value, updated_by_user_id) VALUES ('platform_logo_url', '', ?)`,
        [req.user.id]
      );
    }

    if (previousUrl && previousUrl.startsWith('/uploads/platform/')) {
      removeUploadedFile(previousUrl);
    }

    await logAudit({
      userId: req.user.id,
      action: 'platform.logo_removed',
      entityType: 'platform_settings',
      ipAddress: req.ip,
    });
    invalidateCache('public:platform-config');

    res.json({ message: 'Official platform logo removed.', platform_logo_url: '' });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/businesses/:id/subscription', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const { plan_id, billing_cycle = 'monthly', status = 'active', days = 30 } = req.body;
    const plan = await queryOne('SELECT * FROM subscription_plans WHERE id = ?', [plan_id]);
    if (!plan) return res.status(404).json({ error: 'Subscription plan not found' });

    const durationDays = Math.max(1, Math.min(1095, parseInt(days || 30, 10)));
    const subRes = await execute(
      `INSERT INTO subscriptions (business_id, plan_id, billing_cycle, status, ends_at)
       VALUES (?, ?, ?, ?, datetime('now', '+${durationDays} days'))`,
      [req.params.id, plan.id, billing_cycle, status]
    );
    await logAudit({
      userId: req.user.id,
      businessId: Number(req.params.id),
      action: 'platform.subscription_updated',
      entityType: 'subscription',
      entityId: subRes.insertId,
      changes: { plan: plan.name, status, billing_cycle, durationDays },
      ipAddress: req.ip,
    });
    res.json({ message: `Assigned ${plan.name} (${status}) for ${durationDays} days` });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/users/:id/status', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own active Super Admin account' });
    }
    const { is_active } = req.body;
    const activeVal = is_active ? 1 : 0;
    await execute('UPDATE users SET is_active = ? WHERE id = ?', [activeVal, targetId]);
    if (!activeVal) {
      await execute('UPDATE user_sessions SET is_revoked = 1 WHERE user_id = ?', [targetId]);
    }
    await logAudit({
      userId: req.user.id,
      action: activeVal ? 'platform.user_activated' : 'platform.user_deactivated',
      entityType: 'user',
      entityId: targetId,
      ipAddress: req.ip,
    });
    res.json({ message: activeVal ? 'User activated' : 'User deactivated and active sessions revoked' });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/users/:id/revoke-sessions', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    await execute('UPDATE user_sessions SET is_revoked = 1 WHERE user_id = ?', [targetId]);
    await logAudit({
      userId: req.user.id,
      action: 'platform.sessions_revoked',
      entityType: 'user',
      entityId: targetId,
      ipAddress: req.ip,
    });
    res.json({ message: 'All user sessions revoked' });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/users/:id/verify-email', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    await execute(`UPDATE users SET is_email_verified = 1, updated_at = datetime('now') WHERE id = ?`, [targetId]);
    await logAudit({
      userId: req.user.id,
      action: 'platform.user_email_verified',
      entityType: 'user',
      entityId: targetId,
      ipAddress: req.ip,
    });
    res.json({ message: 'User email marked verified' });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/admin/users/:id/reset-password',
  authenticate,
  requirePlatformAdmin,
  [body('new_password').optional({ values: 'falsy' }).isLength({ min: 8 }).withMessage('Password must be at least 8 characters')],
  validateRequest,
  async (req, res, next) => {
    try {
      const targetId = Number(req.params.id);
      const target = await queryOne('SELECT id, full_name, email FROM users WHERE id = ?', [targetId]);
      if (!target) return res.status(404).json({ error: 'User not found' });

      const tempPassword = String(req.body.new_password || 'BizTrade@123').trim();
      const hash = await bcrypt.hash(tempPassword, 10);
      await execute(
        `UPDATE users SET password_hash = ?, must_change_password = 1, is_active = 1, updated_at = datetime('now') WHERE id = ?`,
        [hash, targetId]
      );
      await execute('UPDATE user_sessions SET is_revoked = 1 WHERE user_id = ?', [targetId]);
      await logAudit({
        userId: req.user.id,
        action: 'platform.user_password_reset',
        entityType: 'user',
        entityId: targetId,
        changes: { email: target.email },
        ipAddress: req.ip,
      });
      res.json({
        message: `Temporary password configured for ${target.full_name} and active sessions revoked.`,
        temporary_password: tempPassword,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.patch('/admin/plans/:id', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const {
      monthly_price_rwf,
      annual_price_rwf,
      max_employees,
      max_branches,
      max_products,
      max_ai_requests_monthly,
      is_active,
    } = req.body;
    await execute(
      `UPDATE subscription_plans SET
         monthly_price_rwf = COALESCE(?, monthly_price_rwf),
         annual_price_rwf = COALESCE(?, annual_price_rwf),
         max_employees = COALESCE(?, max_employees),
         max_branches = COALESCE(?, max_branches),
         max_products = COALESCE(?, max_products),
         max_ai_requests_monthly = COALESCE(?, max_ai_requests_monthly),
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        monthly_price_rwf !== undefined ? Number(monthly_price_rwf) : null,
        annual_price_rwf !== undefined ? Number(annual_price_rwf) : null,
        max_employees !== undefined ? Number(max_employees) : null,
        max_branches !== undefined ? Number(max_branches) : null,
        max_products !== undefined ? Number(max_products) : null,
        max_ai_requests_monthly !== undefined ? Number(max_ai_requests_monthly) : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        req.params.id,
      ]
    );
    await logAudit({
      userId: req.user.id,
      action: 'platform.plan_updated',
      entityType: 'subscription_plan',
      entityId: req.params.id,
      changes: req.body,
      ipAddress: req.ip,
    });
    res.json({ message: 'Subscription plan updated' });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/admin/admins',
  authenticate,
  requirePlatformAdmin,
  [
    body('full_name').trim().isLength({ min: 2 }).withMessage('Full name required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('phone').trim().notEmpty().withMessage('Phone required'),
    body('password').optional({ values: 'falsy' }).isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { full_name, email, phone, password, admin_level = 'super_admin' } = req.body;
      let user = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
      if (user) {
        if (password) {
          const hash = await bcrypt.hash(password, 10);
          await execute(
            'UPDATE users SET full_name = ?, phone = ?, password_hash = ?, is_platform_admin = 1, is_email_verified = 1, is_active = 1 WHERE id = ?',
            [full_name.trim(), phone.trim(), hash, user.id]
          );
        } else {
          await execute(
            'UPDATE users SET is_platform_admin = 1, is_email_verified = 1, is_active = 1 WHERE id = ?',
            [user.id]
          );
        }
        const pa = await queryOne('SELECT id FROM platform_admins WHERE user_id = ?', [user.id]);
        if (!pa) {
          await execute('INSERT INTO platform_admins (user_id, admin_level) VALUES (?, ?)', [user.id, admin_level]);
        }
      } else {
        if (!password) {
          return res.status(400).json({ error: 'Password (min 8 characters) is required for a new Super Admin account' });
        }
        const hash = await bcrypt.hash(password, 10);
        const ins = await execute(
          `INSERT INTO users (full_name, email, phone, password_hash, is_email_verified, is_active, is_platform_admin)
           VALUES (?, ?, ?, ?, 1, 1, 1)`,
          [full_name.trim(), email, phone.trim(), hash]
        );
        user = { id: ins.insertId };
        await execute('INSERT INTO platform_admins (user_id, admin_level) VALUES (?, ?)', [user.id, admin_level]);
        await execute('INSERT INTO notification_preferences (user_id) VALUES (?)', [user.id]);
      }

      await logAudit({
        userId: req.user.id,
        action: 'platform.admin_granted',
        entityType: 'user',
        entityId: user.id,
        changes: { email, admin_level },
        ipAddress: req.ip,
      });
      res.status(201).json({ message: 'Super Admin credentials configured', userId: user.id });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/admin/credentials',
  authenticate,
  requirePlatformAdmin,
  [
    body('full_name').optional().trim().isLength({ min: 2 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('new_password').optional({ values: 'falsy' }).isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { full_name, email, phone, current_password, new_password } = req.body;
      const current = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
      if (!current) return res.status(404).json({ error: 'Admin user not found' });

      if (email && email !== current.email) {
        const conflict = await queryOne('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id]);
        if (conflict) return res.status(409).json({ error: 'Another user already uses that email' });
      }

      let nextHash = current.password_hash;
      if (new_password) {
        if (!current_password) {
          return res.status(400).json({ error: 'Enter your current password to set a new password' });
        }
        const ok = await bcrypt.compare(current_password, current.password_hash);
        if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
        nextHash = await bcrypt.hash(new_password, 10);
      }

      await execute(
        `UPDATE users SET
           full_name = COALESCE(?, full_name),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           password_hash = ?,
           updated_at = datetime('now')
         WHERE id = ?`,
        [full_name?.trim() || null, email || null, phone?.trim() || null, nextHash, req.user.id]
      );

      await logAudit({
        userId: req.user.id,
        action: 'platform.admin_credentials_updated',
        entityType: 'user',
        entityId: req.user.id,
        ipAddress: req.ip,
      });

      const updated = await queryOne(
        'SELECT id, full_name, email, phone, avatar_url, is_email_verified, is_platform_admin FROM users WHERE id = ?',
        [req.user.id]
      );
      res.json({ message: 'Super Admin credentials updated', user: updated });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/support/tickets', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const { subject, message, priority = 'medium', business_id = null } = req.body;
    if (!subject?.trim() || !message?.trim()) return res.status(400).json({ error: 'Subject and message required' });
    const r = await execute(
      'INSERT INTO support_tickets (business_id, user_id, subject, message, priority) VALUES (?, ?, ?, ?, ?)',
      [business_id, req.user.id, subject.trim(), message.trim(), priority]
    );

    const supportRow = await queryOne(`SELECT setting_value FROM platform_settings WHERE setting_key = 'support_email'`);
    const recipients = Array.from(new Set(['allofme140@gmail.com', supportRow?.setting_value].filter(Boolean))).join(',');
    void sendMail({
      to: recipients,
      replyTo: req.user.email,
      subject: `[BizTrade Africa Support Ticket #${r.insertId}] ${subject.trim()}`,
      text: `New support ticket from ${req.user.full_name} (${req.user.email})\nPriority: ${priority}\n\n${message.trim()}`,
    });

    const superAdmins = await query('SELECT id FROM users WHERE is_platform_admin = 1 AND is_active = 1');
    void Promise.all(
      superAdmins.map((sa) =>
        createNotification({
          userId: sa.id,
          eventType: 'support_ticket',
          title: `New Support Ticket: ${subject.trim()}`,
          message: `${req.user.full_name} (${req.user.email}) — ${message.trim().slice(0, 120)}`,
          relatedUrl: '/app/admin',
        })
      )
    );

    res.status(201).json({ id: r.insertId, message: 'Support ticket submitted' });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/tickets/:id', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const { status, admin_notes } = req.body;
    await execute(
      `UPDATE support_tickets SET status = COALESCE(?, status), admin_notes = COALESCE(?, admin_notes), updated_at = datetime('now') WHERE id = ?`,
      [status || null, admin_notes || null, req.params.id]
    );
    await logAudit({
      userId: req.user.id,
      action: 'platform.ticket_updated',
      entityType: 'support_ticket',
      entityId: req.params.id,
      changes: { status },
      ipAddress: req.ip,
    });
    res.json({ message: 'Ticket updated' });
  } catch (err) {
    next(err);
  }
});

router.delete('/admin/inquiries/:id', authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    await execute('DELETE FROM contact_inquiries WHERE id = ?', [req.params.id]);
    res.json({ message: 'Inquiry deleted' });
  } catch (err) {
    next(err);
  }
});

// Public Contact Form — saves to DB, notifies Super Admins, and sends inquiry email to allofme140@gmail.com
router.post(
  '/public/contact',
  [
    body('full_name').trim().notEmpty().withMessage('Full name required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('message').trim().notEmpty().withMessage('Message required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { full_name, email, phone = '', business_name = '', message } = req.body;
      const cleanName = full_name.trim();
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanMsg = message.trim();

      const [insRes, supportRow, superAdmins] = await Promise.all([
        execute(
          'INSERT INTO contact_inquiries (full_name, email, phone, business_name, message) VALUES (?, ?, ?, ?, ?)',
          [cleanName, cleanEmail, phone, business_name, cleanMsg]
        ),
        queryOne(`SELECT setting_value FROM platform_settings WHERE setting_key = 'support_email'`),
        query('SELECT id FROM users WHERE is_platform_admin = 1 AND is_active = 1'),
      ]);

      const recipients = Array.from(new Set(['allofme140@gmail.com', supportRow?.setting_value].filter(Boolean))).join(',');
      const emailBody = [
        `New BizTrade Africa Inquiry (#${insRes.insertId})`,
        `From: ${cleanName}`,
        `Email: ${cleanEmail}`,
        `Phone: ${phone || 'Not provided'}`,
        `Business: ${business_name || 'Not specified'}`,
        '',
        'Message:',
        cleanMsg,
      ].join('\n');

      void sendMail({
        to: recipients,
        replyTo: cleanEmail,
        subject: `BizTrade Africa Inquiry from ${cleanName}${business_name ? ` (${business_name})` : ''}`,
        text: emailBody,
      });

      void Promise.all(
        superAdmins.map((sa) =>
          createNotification({
            userId: sa.id,
            eventType: 'contact_inquiry',
            title: `New Inquiry from ${cleanName}`,
            message: `${cleanEmail}${business_name ? ` · ${business_name}` : ''} — ${cleanMsg.slice(0, 140)}`,
            relatedUrl: '/app/admin',
          })
        )
      );

      res.status(201).json({
        id: insRes.insertId,
        routed_to: 'allofme140@gmail.com',
        message: 'Thank you! Your inquiry has been sent to our support team (allofme140@gmail.com) and we will reach out shortly.',
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
