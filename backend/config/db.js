import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';
import { env } from './env.js';

let activeDialect = 'sqlite';
let sqliteDb = null;
let mysqlPool = null;

const SQLITE_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  is_email_verified INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_platform_admin INTEGER NOT NULL DEFAULT 0,
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  theme_preference TEXT NOT NULL DEFAULT 'system',
  last_login_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_jti TEXT NOT NULL UNIQUE,
  device_info TEXT NULL,
  ip_address TEXT NULL,
  is_revoked INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  reset_token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip_address TEXT NULL,
  was_successful INTEGER NOT NULL DEFAULT 0,
  user_agent TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  monthly_price_rwf REAL NOT NULL DEFAULT 0,
  annual_price_rwf REAL NOT NULL DEFAULT 0,
  max_employees INTEGER NOT NULL DEFAULT 3,
  max_branches INTEGER NOT NULL DEFAULT 1,
  max_products INTEGER NOT NULL DEFAULT 100,
  max_storage_mb INTEGER NOT NULL DEFAULT 250,
  max_ai_requests_monthly INTEGER NOT NULL DEFAULT 25,
  advanced_reports_enabled INTEGER NOT NULL DEFAULT 0,
  integrations_enabled INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  admin_level TEXT NOT NULL DEFAULT 'super_admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_code TEXT NULL UNIQUE,
  owner_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  logo_url TEXT NULL,
  description TEXT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Rwanda',
  province TEXT NOT NULL DEFAULT 'Kigali City',
  district TEXT NOT NULL DEFAULT 'Gasabo',
  physical_address TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'RWF',
  timezone TEXT NOT NULL DEFAULT 'Africa/Kigali',
  tax_enabled INTEGER NOT NULL DEFAULT 1,
  default_tax_rate REAL NOT NULL DEFAULT 18.0,
  tax_identification_number TEXT NULL,
  operating_hours TEXT NULL,
  is_public_listed INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  deleted_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS business_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 1,
  assigned_by_admin_id INTEGER NULL,
  activation_token TEXT NULL UNIQUE,
  activation_expires_at TEXT NULL,
  activated_at TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending_activation',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, user_id),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'en',
  date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
  number_format TEXT NOT NULL DEFAULT '1,000.00',
  receipt_header TEXT NULL,
  receipt_footer TEXT NULL,
  enabled_payment_methods TEXT NULL,
  allow_partial_payments INTEGER NOT NULL DEFAULT 1,
  allow_unpaid_sales INTEGER NOT NULL DEFAULT 1,
  low_stock_threshold_default INTEGER NOT NULL DEFAULT 5,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  province TEXT NULL,
  district TEXT NULL,
  address TEXT NULL,
  phone TEXT NULL,
  manager_user_id INTEGER NULL,
  is_main INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, code),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  perm_key TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  assigned_branch_id INTEGER NULL,
  all_branches_access INTEGER NOT NULL DEFAULT 0,
  job_title TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, user_id),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (assigned_branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS member_permissions (
  business_member_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  is_allowed INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (business_member_id, permission_id),
  FOREIGN KEY (business_member_id) REFERENCES business_members(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NULL,
  role_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  invite_token TEXT NOT NULL UNIQUE,
  invited_by_user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS employee_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NULL,
  role_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  job_title TEXT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  invited_by_user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  accepted_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  default_address TEXT NULL,
  city TEXT NULL,
  country TEXT NOT NULL DEFAULT 'Rwanda',
  preferred_currency TEXT NOT NULL DEFAULT 'RWF',
  loyalty_tier TEXT NOT NULL DEFAULT 'standard',
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  updated_by_user_id INTEGER NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'trialing',
  starts_at TEXT NOT NULL DEFAULT (datetime('now')),
  ends_at TEXT NULL,
  grace_ends_at TEXT NULL,
  auto_renew INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  business_id INTEGER NOT NULL,
  amount_rwf REAL NOT NULL,
  payment_method TEXT NOT NULL,
  reference_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'verified',
  paid_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NULL,
  user_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  admin_notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT NULL,
  phone TEXT NOT NULL,
  email TEXT NULL,
  address TEXT NULL,
  tax_number TEXT NULL,
  notes TEXT NULL,
  outstanding_balance REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  user_id INTEGER NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NULL,
  address TEXT NULL,
  customer_type TEXT NOT NULL DEFAULT 'retail',
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  outstanding_balance REAL NOT NULL DEFAULT 0,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  author_user_id INTEGER NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  UNIQUE (business_id, name),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  category_id INTEGER NULL,
  supplier_id INTEGER NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT NULL,
  description TEXT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  purchase_price REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  image_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, sku),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, branch_id, product_id),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL,
  quantity_change INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  reason TEXT NULL,
  related_type TEXT NULL,
  related_id INTEGER NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  from_branch_id INTEGER NOT NULL,
  to_branch_id INTEGER NOT NULL,
  reference_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_transfer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  FOREIGN KEY (stock_transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  customer_id INTEGER NULL,
  cashier_user_id INTEGER NOT NULL,
  reference_number TEXT NOT NULL,
  idempotency_key TEXT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  balance_due REAL NOT NULL DEFAULT 0,
  sale_status TEXT NOT NULL DEFAULT 'completed',
  payment_status TEXT NOT NULL DEFAULT 'paid',
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, reference_number),
  UNIQUE (business_id, idempotency_key),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  sale_id INTEGER NULL,
  order_id INTEGER NULL,
  customer_id INTEGER NULL,
  payment_method TEXT NOT NULL,
  amount REAL NOT NULL,
  external_reference TEXT NULL,
  verification_status TEXT NOT NULL DEFAULT 'verified',
  recorded_by_user_id INTEGER NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  sale_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  restock_items INTEGER NOT NULL DEFAULT 1,
  approved_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  sale_id INTEGER NOT NULL UNIQUE,
  receipt_number TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  printed_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  po_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ordered',
  total_amount REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  expected_delivery_date TEXT NULL,
  invoice_number TEXT NULL,
  notes TEXT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, po_number),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  ordered_qty INTEGER NOT NULL,
  received_qty INTEGER NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  purchase_order_id INTEGER NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  reference_number TEXT NULL,
  recorded_by_user_id INTEGER NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  customer_id INTEGER NULL,
  order_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_address TEXT NULL,
  order_status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  total_amount REAL NOT NULL DEFAULT 0,
  assigned_user_id INTEGER NULL,
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  old_status TEXT NULL,
  new_status TEXT NOT NULL,
  changed_by_user_id INTEGER NULL,
  note TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (business_id, name)
);

CREATE TABLE IF NOT EXISTS income (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  description TEXT NULL,
  recorded_by_user_id INTEGER NOT NULL,
  income_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  expense_category_id INTEGER NULL,
  category_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  receipt_file_url TEXT NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  recorded_by_user_id INTEGER NOT NULL,
  approved_by_user_id INTEGER NULL,
  expense_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expense_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL,
  approver_user_id INTEGER NOT NULL,
  decision TEXT NOT NULL,
  note TEXT NULL,
  decided_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  assigned_to_user_id INTEGER NULL,
  created_by_user_id INTEGER NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  deadline TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  sender_user_id INTEGER NOT NULL,
  recipient_user_id INTEGER NULL,
  channel_type TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  attachment_url TEXT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NULL,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  related_url TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER PRIMARY KEY,
  in_app_enabled INTEGER NOT NULL DEFAULT 1,
  email_enabled INTEGER NOT NULL DEFAULT 1,
  sms_enabled INTEGER NOT NULL DEFAULT 0,
  low_stock_alerts INTEGER NOT NULL DEFAULT 1,
  order_alerts INTEGER NOT NULL DEFAULT 1,
  expense_alerts INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NULL,
  branch_id INTEGER NULL,
  user_id INTEGER NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NULL,
  changes_json TEXT NULL,
  ip_address TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS business_activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  user_id INTEGER NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NULL,
  changes_json TEXT NULL,
  ip_address TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  product_id INTEGER NULL,
  user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NULL,
  user_id INTEGER NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NULL,
  business_name TEXT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS business_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  product_id INTEGER NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  video_path TEXT NOT NULL,
  video_mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  thumbnail_url TEXT NULL,
  is_published INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_products_biz ON products(business_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_biz_branch ON inventory(business_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_biz_created ON sales(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sm_biz ON stock_movements(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_biz ON activity_logs(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_biz_videos ON business_videos(business_id, is_published);
`;

export async function initDatabase() {
  if (env.dbClient === 'mysql' && env.mysql.host) {
    try {
      mysqlPool = mysql.createPool({
        host: env.mysql.host,
        port: env.mysql.port,
        user: env.mysql.user,
        password: env.mysql.password,
        database: env.mysql.database,
        waitForConnections: true,
        connectionLimit: 10,
        namedPlaceholders: false,
      });
      await mysqlPool.query('SELECT 1');
      activeDialect = 'mysql';
      console.log('[DB] Connected to MySQL server:', env.mysql.host);
      return { dialect: activeDialect };
    } catch (err) {
      console.warn('[DB] MySQL unavailable, falling back to persistent SQLite:', err.message);
    }
  }

  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'bizflow.sqlite');
  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec(SQLITE_SCHEMA_SQL);
  const ensureColumn = (table, col, ddl) => {
    const cols = sqliteDb.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === col)) {
      sqliteDb.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };
  ensureColumn('users', 'must_change_password', 'must_change_password INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'theme_preference', "theme_preference TEXT NOT NULL DEFAULT 'system'");
  ensureColumn('businesses', 'business_code', 'business_code TEXT NULL');
  ensureColumn('businesses', 'is_public_listed', 'is_public_listed INTEGER NOT NULL DEFAULT 1');
  ensureColumn('businesses', 'deleted_at', 'deleted_at TEXT NULL');
  ensureColumn('orders', 'customer_user_id', 'customer_user_id INTEGER NULL');
  ensureColumn('contact_inquiries', 'business_id', 'business_id INTEGER NULL');
  ensureColumn('contact_inquiries', 'user_id', 'user_id INTEGER NULL');
  activeDialect = 'sqlite';
  console.log('[DB] Connected to persistent SQLite database at', dbPath);
  return { dialect: activeDialect };
}

export function getDialect() {
  return activeDialect;
}

function adaptSqlForDialect(sql) {
  if (activeDialect !== 'mysql') return sql;
  return sql
    .replace(/datetime\(\s*'now'\s*,\s*'-(\d+)\s+days'\s*\)/gi, 'DATE_SUB(NOW(), INTERVAL $1 DAY)')
    .replace(/datetime\(\s*'now'\s*\)/gi, 'NOW()')
    .replace(/date\(\s*'now'\s*\)/gi, 'CURDATE()')
    .replace(/strftime\(\s*'%Y-%m'\s*,\s*([^)]+)\)/gi, "DATE_FORMAT($1, '%Y-%m')")
    .replace(/MAX\(\s*0\s*,/gi, 'GREATEST(0,');
}

function normalizeParams(params = []) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

export async function query(sql, params = []) {
  const safeParams = normalizeParams(params);
  const adapted = adaptSqlForDialect(sql);
  if (activeDialect === 'mysql') {
    const [rows] = await mysqlPool.execute(adapted, safeParams);
    return rows;
  }
  const stmt = sqliteDb.prepare(adapted);
  return stmt.all(...safeParams);
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function execute(sql, params = []) {
  const safeParams = normalizeParams(params);
  const adapted = adaptSqlForDialect(sql);
  if (activeDialect === 'mysql') {
    const [res] = await mysqlPool.execute(adapted, safeParams);
    return {
      insertId: Number(res.insertId || 0),
      affectedRows: Number(res.affectedRows || 0),
    };
  }
  const stmt = sqliteDb.prepare(adapted);
  const res = stmt.run(...safeParams);
  return {
    insertId: Number(res.lastInsertRowid || 0),
    affectedRows: Number(res.changes || 0),
  };
}

export async function transaction(callback) {
  if (activeDialect === 'mysql') {
    const conn = await mysqlPool.getConnection();
    await conn.beginTransaction();
    try {
      const tx = {
        query: async (sql, params = []) => {
          const [rows] = await conn.execute(adaptSqlForDialect(sql), normalizeParams(params));
          return rows;
        },
        queryOne: async (sql, params = []) => {
          const [rows] = await conn.execute(adaptSqlForDialect(sql), normalizeParams(params));
          return rows[0] || null;
        },
        execute: async (sql, params = []) => {
          const [res] = await conn.execute(adaptSqlForDialect(sql), normalizeParams(params));
          return {
            insertId: Number(res.insertId || 0),
            affectedRows: Number(res.affectedRows || 0),
          };
        },
      };
      const result = await callback(tx);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  sqliteDb.exec('BEGIN IMMEDIATE');
  try {
    const tx = {
      query: async (sql, params = []) => sqliteDb.prepare(sql).all(...normalizeParams(params)),
      queryOne: async (sql, params = []) => sqliteDb.prepare(sql).get(...normalizeParams(params)) || null,
      execute: async (sql, params = []) => {
        const res = sqliteDb.prepare(sql).run(...normalizeParams(params));
        return {
          insertId: Number(res.lastInsertRowid || 0),
          affectedRows: Number(res.changes || 0),
        };
      },
    };
    const result = await callback(tx);
    sqliteDb.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      sqliteDb.exec('ROLLBACK');
    } catch {
      // ignore if already rolled back
    }
    throw err;
  }
}

export function roundMoney(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}
