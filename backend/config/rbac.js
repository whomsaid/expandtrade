import bcrypt from 'bcryptjs';
import { execute, query, queryOne } from './db.js';
import { env } from './env.js';

export const ALL_PERMISSIONS = [
  { key: 'dashboard.view', module: 'dashboard', desc: 'View business dashboard metrics' },
  { key: 'products.view', module: 'products', desc: 'View products and categories' },
  { key: 'products.create', module: 'products', desc: 'Create new products and categories' },
  { key: 'products.update', module: 'products', desc: 'Update product details' },
  { key: 'products.delete', module: 'products', desc: 'Archive or delete products' },
  { key: 'inventory.view', module: 'inventory', desc: 'View stock levels and movements' },
  { key: 'inventory.manage', module: 'inventory', desc: 'Adjust stock, record damage, and transfer between branches' },
  { key: 'pos.sell', module: 'pos', desc: 'Process Point of Sale transactions and receipts' },
  { key: 'pos.discount', module: 'pos', desc: 'Apply discounts at POS' },
  { key: 'sales.view', module: 'sales', desc: 'View sales and payment history' },
  { key: 'sales.refund', module: 'sales', desc: 'Approve refunds and cancel sales' },
  { key: 'orders.view', module: 'orders', desc: 'View customer orders' },
  { key: 'orders.manage', module: 'orders', desc: 'Confirm, process, and dispatch orders' },
  { key: 'customers.view', module: 'customers', desc: 'View customer profiles and balances' },
  { key: 'customers.manage', module: 'customers', desc: 'Create/edit customers and loyalty notes' },
  { key: 'suppliers.view', module: 'suppliers', desc: 'View suppliers and payables' },
  { key: 'suppliers.manage', module: 'suppliers', desc: 'Manage suppliers and supplier payments' },
  { key: 'purchases.view', module: 'purchases', desc: 'View purchase orders' },
  { key: 'purchases.manage', module: 'purchases', desc: 'Create purchase orders and receive goods' },
  { key: 'finance.view', module: 'finance', desc: 'View income, expenses, and P&L statements' },
  { key: 'finance.create', module: 'finance', desc: 'Record income and expenses' },
  { key: 'finance.approve', module: 'finance', desc: 'Approve or reject expenses' },
  { key: 'employees.view', module: 'employees', desc: 'View employees and activity' },
  { key: 'employees.manage', module: 'employees', desc: 'Invite employees, assign roles and branches' },
  { key: 'branches.view', module: 'branches', desc: 'View business branches' },
  { key: 'branches.manage', module: 'branches', desc: 'Create/edit branches and assign managers' },
  { key: 'tasks.view', module: 'tasks', desc: 'View tasks and internal messages' },
  { key: 'tasks.manage', module: 'tasks', desc: 'Create and assign tasks and announcements' },
  { key: 'reports.view', module: 'reports', desc: 'View operational reports' },
  { key: 'reports.export', module: 'reports', desc: 'Export PDF/CSV reports' },
  { key: 'ai.use', module: 'ai', desc: 'Query AI Business Assistant' },
  { key: 'ads.view', module: 'ads', desc: 'View business promotional videos' },
  { key: 'ads.manage', module: 'ads', desc: 'Upload, edit, publish, and delete business promotional videos' },
  { key: 'recruitment.view', module: 'recruitment', desc: 'View job vacancies, applications, and interview schedules' },
  { key: 'recruitment.manage', module: 'recruitment', desc: 'Publish vacancies, review applications, schedule interviews, and update statuses' },
  { key: 'payroll.view', module: 'payroll', desc: 'View employee payroll schedules, salary configurations, and payroll history' },
  { key: 'payroll.manage', module: 'payroll', desc: 'Configure employee salaries, mobile money numbers, payment dates, and suspend/reactivate payroll records' },
  { key: 'payroll.pay', module: 'payroll', desc: 'Authorize and disburse individual and bulk employee payroll payments' },
  { key: 'settings.manage', module: 'settings', desc: 'Configure business profile, taxes, and subscriptions' },
];

export const ROLE_DEFINITIONS = [
  {
    code: 'business_owner',
    name: 'Business Owner',
    description: 'Full authority over business profile, branches, finance, employees, and subscriptions',
    permissions: ALL_PERMISSIONS.map((p) => p.key),
  },
  {
    code: 'business_admin',
    name: 'Business Admin',
    description: 'Full administrative control over assigned business operations, staff, branches, finance, and settings',
    permissions: ALL_PERMISSIONS.map((p) => p.key),
  },
  {
    code: 'manager',
    name: 'Business Manager',
    description: 'Manages business operations, staff, stock transfers, approvals, and orders',
    permissions: [
      'dashboard.view', 'products.view', 'products.create', 'products.update',
      'inventory.view', 'inventory.manage', 'pos.sell', 'pos.discount',
      'sales.view', 'sales.refund', 'orders.view', 'orders.manage',
      'customers.view', 'customers.manage', 'suppliers.view', 'purchases.view',
      'purchases.manage', 'finance.view', 'finance.create', 'finance.approve',
      'employees.view', 'branches.view', 'tasks.view', 'tasks.manage',
      'reports.view', 'reports.export', 'ai.use', 'ads.view', 'ads.manage',
      'recruitment.view', 'recruitment.manage',
      'payroll.view', 'payroll.manage', 'payroll.pay',
    ],
  },
  {
    code: 'branch_manager',
    name: 'Branch Manager',
    description: 'Manages assigned branch inventory, POS staff, approvals, and daily operations',
    permissions: [
      'dashboard.view', 'products.view', 'products.create', 'products.update',
      'inventory.view', 'inventory.manage', 'pos.sell', 'pos.discount',
      'sales.view', 'sales.refund', 'orders.view', 'orders.manage',
      'customers.view', 'customers.manage', 'suppliers.view', 'purchases.view',
      'purchases.manage', 'finance.view', 'finance.create',
      'employees.view', 'branches.view', 'tasks.view', 'tasks.manage',
      'reports.view', 'ai.use', 'recruitment.view', 'payroll.view',
    ],
  },
  {
    code: 'accountant',
    name: 'Accountant',
    description: 'Manages financial records, expenses, supplier payments, receivables, and reports',
    permissions: [
      'dashboard.view', 'sales.view', 'customers.view', 'suppliers.view',
      'suppliers.manage', 'purchases.view', 'finance.view', 'finance.create',
      'finance.approve', 'payroll.view', 'payroll.manage',
      'reports.view', 'reports.export', 'ai.use', 'tasks.view',
    ],
  },
  {
    code: 'cashier',
    name: 'Cashier',
    description: 'Processes POS sales, payments, and receipts',
    permissions: [
      'dashboard.view', 'products.view', 'inventory.view', 'pos.sell',
      'sales.view', 'customers.view', 'customers.manage', 'orders.view', 'tasks.view',
    ],
  },
  {
    code: 'salesperson',
    name: 'Salesperson',
    description: 'Manages customers, sales, and assigned orders',
    permissions: [
      'dashboard.view', 'products.view', 'inventory.view', 'pos.sell',
      'sales.view', 'orders.view', 'orders.manage', 'customers.view', 'customers.manage', 'tasks.view',
    ],
  },
  {
    code: 'inventory_manager',
    name: 'Inventory Manager',
    description: 'Manages products, stock levels, adjustments, transfers, and receiving',
    permissions: [
      'dashboard.view', 'products.view', 'products.create', 'products.update',
      'inventory.view', 'inventory.manage', 'suppliers.view', 'purchases.view',
      'purchases.manage', 'branches.view', 'reports.view', 'tasks.view',
    ],
  },
  {
    code: 'customer_service',
    name: 'Customer Service Representative',
    description: 'Handles customer orders, CRM records, feedback, and inquiries',
    permissions: [
      'dashboard.view', 'products.view', 'orders.view', 'orders.manage',
      'customers.view', 'customers.manage', 'tasks.view',
    ],
  },
  {
    code: 'customer',
    name: 'Customer',
    description: 'Customer portal access for tracking orders and viewing receipts',
    permissions: ['orders.view'],
  },
];

export async function seedCoreRbacAndPlans() {
  const plans = [
    ['free', 'Free Starter', 'Solo micro-merchants starting digital operations', 0, 0, 3, 1, 100, 250, 25, 0, 0],
    ['starter', 'Starter', 'Growing single-shop retailers and pharmacies', 25000, 250000, 10, 2, 1000, 2048, 150, 1, 0],
    ['business', 'Business', 'Multi-branch supermarkets, hardware & wholesale distributors', 65000, 650000, 35, 10, 10000, 10240, 1000, 1, 1],
    ['enterprise', 'Enterprise', 'Regional retail chains & multi-country groups', 180000, 1800000, 250, 100, 100000, 102400, 10000, 1, 1],
  ];

  const existingPlanRows = await query('SELECT code FROM subscription_plans');
  const existingPlans = new Set(existingPlanRows.map((r) => r.code));
  for (const p of plans) {
    if (!existingPlans.has(p[0])) {
      await execute(
        `INSERT INTO subscription_plans
        (code, name, target_audience, monthly_price_rwf, annual_price_rwf, max_employees, max_branches, max_products, max_storage_mb, max_ai_requests_monthly, advanced_reports_enabled, integrations_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p
      );
    }
  }

  const existingPermRows = await query('SELECT id, perm_key FROM permissions');
  const permIdByKey = new Map(existingPermRows.map((r) => [r.perm_key, r.id]));
  for (const perm of ALL_PERMISSIONS) {
    if (!permIdByKey.has(perm.key)) {
      const res = await execute(
        'INSERT INTO permissions (perm_key, module, description) VALUES (?, ?, ?)',
        [perm.key, perm.module, perm.desc]
      );
      permIdByKey.set(perm.key, res.insertId);
    }
  }

  const existingRoleRows = await query('SELECT id, code FROM roles');
  const roleIdByCode = new Map(existingRoleRows.map((r) => [r.code, r.id]));
  const existingRolePermRows = await query('SELECT role_id, permission_id FROM role_permissions');
  const rolePermSet = new Set(existingRolePermRows.map((r) => `${r.role_id}:${r.permission_id}`));

  for (const roleDef of ROLE_DEFINITIONS) {
    let roleId = roleIdByCode.get(roleDef.code);
    if (!roleId) {
      const res = await execute(
        'INSERT INTO roles (code, name, description) VALUES (?, ?, ?)',
        [roleDef.code, roleDef.name, roleDef.description]
      );
      roleId = res.insertId;
      roleIdByCode.set(roleDef.code, roleId);
    }
    for (const permKey of roleDef.permissions) {
      const permId = permIdByKey.get(permKey);
      if (permId) {
        const pairKey = `${roleId}:${permId}`;
        if (!rolePermSet.has(pairKey)) {
          await execute(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
            [roleId, permId]
          );
          rolePermSet.add(pairKey);
        }
      }
    }
  }

  const defaultSettings = [
    ['platform_name', 'BizTrade Africa'],
    ['platform_logo_url', ''],
    ['support_email', 'allofme140@gmail.com'],
    ['support_phone', ''],
    ['platform_location', 'KN 4 Ave, Kigali, Rwanda'],
    ['social_facebook_url', ''],
    ['social_instagram_url', ''],
    ['social_x_url', ''],
    ['social_linkedin_url', ''],
    ['developer_name', 'Xavine Hakim'],
    ['developer_role', 'Full Stack Developer'],
    ['developer_bio', 'Full Stack Developer at softworld specializing in multi-tenant commercial platforms, relational database architecture, and responsive web applications built for African businesses and digital retail.'],
    ['developer_email', 'allofme140@gmail.com'],
    ['developer_portfolio_url', 'https://xavineanoited.vercel.app/'],
    ['developer_github_url', ''],
    ['developer_linkedin_url', ''],
    ['default_currency', 'RWF'],
    ['default_tax_rate', '18'],
    ['allow_customer_reviews', '1'],
    ['business_retention_days', '365'],
    ['require_email_verification', '1'],
    ['development_mode', '0'],
    [
      'development_banner_message',
      'Development & Feature Staging Mode is active. New features can be previewed and verified before confirming production release.',
    ],
    [
      'feature_flags_json',
      JSON.stringify({
        pos_enabled: true,
        marketplace_orders_enabled: true,
        jobs_portal_enabled: true,
        ai_assistant_enabled: true,
        video_ads_enabled: true,
        customer_registration_enabled: true,
        beta_analytics_enabled: false,
      }),
    ],
    ['development_last_confirmed_at', ''],
    ['development_last_confirmed_by', ''],
    ['maintenance_mode', '0'],
    [
      'maintenance_message',
      'BizTrade Africa is undergoing scheduled maintenance to improve reliability and speed. Please check back shortly.',
    ],
    ['allow_business_onboarding', '1'],
    ['allow_customer_registration', '1'],
    ['session_timeout_minutes', '480'],
    ['max_upload_size_mb', '25'],
    ['api_rate_limit_rpm', '1200'],
    ['audit_log_retention_days', '365'],
    ['auto_backup_enabled', '1'],
  ];
  const existingSettingRows = await query('SELECT setting_key FROM platform_settings');
  const existingSettings = new Set(existingSettingRows.map((r) => r.setting_key));
  for (const [key, val] of defaultSettings) {
    if (!existingSettings.has(key)) {
      await execute('INSERT INTO platform_settings (setting_key, setting_value) VALUES (?, ?)', [key, val]);
    }
  }

  // Safely migrate legacy default brand strings without overwriting custom Super Admin settings
  await execute(
    `UPDATE platform_settings SET setting_value = 'BizTrade Africa' WHERE setting_key = 'platform_name' AND setting_value = 'BizFlow Africa'`
  );
  await execute(
    `UPDATE platform_settings SET setting_value = 'allofme140@gmail.com' WHERE setting_key = 'support_email' AND setting_value IN ('support@bizflow.africa', 'support@biztrade.africa')`
  );
  await execute(
    `UPDATE business_settings SET receipt_footer = 'Powered by BizTrade Africa' WHERE receipt_footer = 'Powered by BizFlow Africa'`
  );
}

export async function ensureSuperAdmin() {
  const targetEmail = (env.superAdmin.email || '').trim().toLowerCase();
  const targetPassword = (env.superAdmin.password || '').trim();

  if (targetEmail) {
    const existing = await queryOne('SELECT id, is_platform_admin FROM users WHERE email = ?', [targetEmail]);
    if (existing) {
      if (targetPassword) {
        const hash = await bcrypt.hash(targetPassword, 10);
        await execute(
          'UPDATE users SET full_name = ?, phone = ?, password_hash = ?, is_email_verified = 1, is_active = 1, is_platform_admin = 1 WHERE id = ?',
          [env.superAdmin.name, env.superAdmin.phone, hash, existing.id]
        );
      } else {
        await execute(
          'UPDATE users SET is_email_verified = 1, is_active = 1, is_platform_admin = 1 WHERE id = ?',
          [existing.id]
        );
      }
      const pa = await queryOne('SELECT id FROM platform_admins WHERE user_id = ?', [existing.id]);
      if (!pa) {
        await execute('INSERT INTO platform_admins (user_id, admin_level) VALUES (?, ?)', [existing.id, 'super_admin']);
      }
    } else {
      const hash = await bcrypt.hash(targetPassword || 'BizTrade@2026!', 10);
      const res = await execute(
        `INSERT INTO users (full_name, email, phone, password_hash, is_email_verified, is_active, is_platform_admin)
         VALUES (?, ?, ?, ?, 1, 1, 1)`,
        [env.superAdmin.name, targetEmail, env.superAdmin.phone, hash]
      );
      await execute('INSERT INTO platform_admins (user_id, admin_level) VALUES (?, ?)', [res.insertId, 'super_admin']);
    }
    return;
  }

  const anyAdmin = await queryOne('SELECT id FROM users WHERE is_platform_admin = 1 LIMIT 1');
  if (!anyAdmin) {
    const hash = await bcrypt.hash('BizTrade@2026!', 10);
    const res = await execute(
      `INSERT INTO users (full_name, email, phone, password_hash, is_email_verified, is_active, is_platform_admin)
       VALUES (?, ?, ?, ?, 1, 1, 1)`,
      ['Jean Claude Ndayisaba', 'admin@biztrade.africa', '+250788000001', hash]
    );
    await execute('INSERT INTO platform_admins (user_id, admin_level) VALUES (?, ?)', [res.insertId, 'super_admin']);
  }
}

export async function removeLegacySeedAccounts() {
  const seedSlugs = ['kigali-tech-trading', 'nyabugogo-pharmacy'];
  for (const slug of seedSlugs) {
    const biz = await queryOne('SELECT id FROM businesses WHERE slug = ?', [slug]);
    if (biz) {
      const saleRows = await query('SELECT id FROM sales WHERE business_id = ?', [biz.id]);
      for (const s of saleRows) {
        await execute('DELETE FROM refunds WHERE sale_id = ?', [s.id]);
        await execute('DELETE FROM receipts WHERE sale_id = ?', [s.id]);
        await execute('DELETE FROM sale_items WHERE sale_id = ?', [s.id]);
      }
      await execute('DELETE FROM payments WHERE business_id = ?', [biz.id]);
      await execute('DELETE FROM sales WHERE business_id = ?', [biz.id]);
      await execute('DELETE FROM expenses WHERE business_id = ?', [biz.id]);
      await execute('DELETE FROM tasks WHERE business_id = ?', [biz.id]);
      await execute('DELETE FROM announcements WHERE business_id = ?', [biz.id]);
      await execute('DELETE FROM activity_logs WHERE business_id = ?', [biz.id]);
      await execute('DELETE FROM businesses WHERE id = ?', [biz.id]);
    }
  }

  const seedEmails = ['owner@kigalitech.rw', 'cashier@kigalitech.rw', 'owner@nyabugogopharma.rw'];
  for (const email of seedEmails) {
    const u = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (u) {
      await execute('DELETE FROM notifications WHERE user_id = ?', [u.id]);
      await execute('DELETE FROM notification_preferences WHERE user_id = ?', [u.id]);
      await execute('DELETE FROM users WHERE id = ?', [u.id]);
    }
  }
}
