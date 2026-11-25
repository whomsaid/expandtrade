import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';
import pg from 'pg';
import { env } from './env.js';

const { Pool: PgPool, types: pgTypes } = pg;
// Parse PostgreSQL INT8 (COUNT(*)) and NUMERIC into JS numbers for parity with SQLite & MySQL
pgTypes.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
pgTypes.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

let activeDialect = 'sqlite';
let sqliteDb = null;
let mysqlPool = null;
let pgPool = null;
let sqliteTxChain = Promise.resolve();

const TABLES_WITHOUT_SERIAL_ID = new Set([
  'role_permissions',
  'member_permissions',
  'notification_preferences',
  'video_upload_sessions',
  'background_jobs',
]);

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
  whatsapp_available INTEGER NOT NULL DEFAULT 0,
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
  phone_on_whatsapp INTEGER NOT NULL DEFAULT 0,
  setup_completed INTEGER NOT NULL DEFAULT 1,
  setup_steps_json TEXT NULL,
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
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
  whatsapp_opted_out_at TEXT NULL,
  has_whatsapp TEXT NOT NULL DEFAULT 'unknown',
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

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
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
  customer_user_id INTEGER NULL,
  order_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NULL,
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
  read_at TEXT NULL,
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

-- 12. RECRUITMENT & JOB APPLICATION MANAGEMENT SYSTEM
CREATE TABLE IF NOT EXISTS job_vacancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  created_by_user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  department TEXT NULL,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  work_mode TEXT NOT NULL DEFAULT 'on_site',
  location TEXT NOT NULL,
  salary_min REAL NULL,
  salary_max REAL NULL,
  currency_code TEXT NOT NULL DEFAULT 'RWF',
  show_salary INTEGER NOT NULL DEFAULT 0,
  summary TEXT NULL,
  description TEXT NOT NULL,
  responsibilities TEXT NULL,
  requirements TEXT NULL,
  required_education_level TEXT NULL,
  min_experience_years INTEGER NOT NULL DEFAULT 0,
  required_document_types_json TEXT NULL,
  custom_questions_json TEXT NULL,
  allow_reapplication INTEGER NOT NULL DEFAULT 0,
  positions_count INTEGER NOT NULL DEFAULT 1,
  application_deadline TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(business_id, slug)
);

CREATE TABLE IF NOT EXISTS job_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_number TEXT UNIQUE NULL,
  vacancy_id INTEGER NOT NULL,
  business_id INTEGER NOT NULL,
  applicant_user_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  profile_photo_url TEXT NULL,
  date_of_birth TEXT NULL,
  gender TEXT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  nationality TEXT NULL,
  country TEXT NULL,
  province TEXT NULL,
  district TEXT NULL,
  sector TEXT NULL,
  residential_address TEXT NULL,
  has_work_experience INTEGER NULL,
  years_of_experience INTEGER NOT NULL DEFAULT 0,
  skills_summary TEXT NULL,
  availability TEXT NULL,
  preferred_employment_type TEXT NULL,
  expected_salary REAL NULL,
  why_want_position TEXT NULL,
  why_select_you TEXT NULL,
  cover_letter TEXT NULL,
  accuracy_confirmed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TEXT NULL,
  withdrawn_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (vacancy_id) REFERENCES job_vacancies(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applicant_education (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  education_level TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  field_of_study TEXT NOT NULL,
  qualification_obtained TEXT NOT NULL,
  start_year INTEGER NULL,
  graduation_year INTEGER NULL,
  country TEXT NULL,
  education_status TEXT NOT NULL DEFAULT 'Completed',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applicant_experiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  employment_type TEXT NULL,
  work_location TEXT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  responsibilities TEXT NULL,
  achievements TEXT NULL,
  reason_for_leaving TEXT NULL,
  reference_person TEXT NULL,
  reference_phone TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applicant_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  skill_category TEXT NOT NULL DEFAULT 'technical',
  skill_name TEXT NOT NULL,
  proficiency_level TEXT NULL,
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  business_id INTEGER NOT NULL,
  applicant_user_id INTEGER NOT NULL,
  document_category TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_name TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  vacancy_id INTEGER NOT NULL,
  question_key TEXT NOT NULL,
  question_label TEXT NOT NULL,
  answer_text TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (vacancy_id) REFERENCES job_vacancies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  previous_status TEXT NULL,
  new_status TEXT NOT NULL,
  changed_by_user_id INTEGER NOT NULL,
  note TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_interviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  business_id INTEGER NOT NULL,
  vacancy_id INTEGER NOT NULL,
  scheduled_by_user_id INTEGER NOT NULL,
  interview_date TEXT NOT NULL,
  interview_time TEXT NOT NULL,
  interview_mode TEXT NOT NULL DEFAULT 'In-person',
  location_or_link TEXT NULL,
  interviewer_name TEXT NULL,
  instructions TEXT NULL,
  feedback TEXT NULL,
  outcome TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (vacancy_id) REFERENCES job_vacancies(id) ON DELETE CASCADE,
  FOREIGN KEY (scheduled_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recruitment_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  business_id INTEGER NOT NULL,
  author_user_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_products_biz ON products(business_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_biz_branch ON inventory(business_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_biz_created ON sales(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sm_biz ON stock_movements(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_biz ON activity_logs(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_biz_videos ON business_videos(business_id, is_published);
CREATE INDEX IF NOT EXISTS idx_vacancies_biz_status ON job_vacancies(business_id, status);
CREATE INDEX IF NOT EXISTS idx_apps_biz_vac_status ON job_applications(business_id, vacancy_id, status);
CREATE INDEX IF NOT EXISTS idx_apps_user ON job_applications(applicant_user_id, vacancy_id);
CREATE INDEX IF NOT EXISTS idx_app_docs_app ON application_documents(application_id, is_active);
CREATE INDEX IF NOT EXISTS idx_app_interviews_app ON job_interviews(application_id, business_id);
CREATE INDEX IF NOT EXISTS idx_app_notes_app ON recruitment_notes(application_id, business_id);

CREATE TABLE IF NOT EXISTS email_change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  new_email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_payroll_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER UNIQUE NOT NULL,
  available_balance REAL NOT NULL DEFAULT 0,
  reserved_balance REAL NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'RWF',
  default_provider TEXT NOT NULL DEFAULT 'mtn_momo',
  business_momo_number TEXT NULL,
  mtn_subscription_key TEXT NULL,
  mtn_api_user TEXT NULL,
  mtn_api_key TEXT NULL,
  mtn_environment TEXT NOT NULL DEFAULT 'sandbox',
  airtel_client_id TEXT NULL,
  airtel_client_secret TEXT NULL,
  airtel_environment TEXT NOT NULL DEFAULT 'staging',
  updated_by_user_id INTEGER NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS business_payroll_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  reference TEXT NOT NULL,
  note TEXT NULL,
  created_by_user_id INTEGER NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employee_payroll_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  business_member_id INTEGER UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  salary_amount REAL NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'RWF',
  payment_frequency TEXT NOT NULL DEFAULT 'monthly',
  custom_interval_days INTEGER NULL,
  pay_day_of_month INTEGER NULL,
  pay_day_of_week INTEGER NULL,
  next_payment_date TEXT NOT NULL,
  last_paid_date TEXT NULL,
  last_paid_period TEXT NULL,
  momo_provider TEXT NOT NULL DEFAULT 'mtn_momo',
  momo_phone TEXT NOT NULL,
  momo_phone_verified_at TEXT NULL,
  payroll_status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_by_user_id INTEGER NOT NULL,
  updated_by_user_id INTEGER NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (business_member_id) REFERENCES business_members(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  batch_reference TEXT UNIQUE NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'bulk',
  payment_period TEXT NOT NULL,
  total_employees INTEGER NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'RWF',
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  authorized_by_user_id INTEGER NOT NULL,
  authorized_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (authorized_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  batch_id INTEGER NULL,
  payroll_config_id INTEGER NOT NULL,
  business_member_id INTEGER NOT NULL,
  employee_user_id INTEGER NOT NULL,
  employee_name TEXT NOT NULL,
  momo_provider TEXT NOT NULL,
  momo_phone TEXT NOT NULL,
  salary_amount REAL NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'RWF',
  payment_period TEXT NOT NULL,
  payment_reference TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  provider_transaction_id TEXT NULL,
  provider_status TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  failure_reason TEXT NULL,
  authorized_by_user_id INTEGER NOT NULL,
  authorized_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT NULL,
  paid_at TEXT NULL,
  expense_id INTEGER NULL,
  retry_of_transaction_id INTEGER NULL,
  provider_raw_response TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES payroll_batches(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_config_id) REFERENCES employee_payroll_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (business_member_id) REFERENCES business_members(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (authorized_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_due_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  payroll_config_id INTEGER NOT NULL,
  employee_user_id INTEGER NOT NULL,
  due_period TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  momo_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notified_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_config_id) REFERENCES employee_payroll_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(payroll_config_id, due_period)
);

CREATE TABLE IF NOT EXISTS video_upload_sessions (
  upload_id TEXT PRIMARY KEY,
  business_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  editing_video_id INTEGER NULL,
  product_id INTEGER NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  is_published INTEGER NOT NULL DEFAULT 0,
  original_filename TEXT NOT NULL,
  video_mime_type TEXT NOT NULL DEFAULT 'video/mp4',
  total_size_bytes INTEGER NOT NULL,
  chunk_size_bytes INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  uploaded_chunks_json TEXT NOT NULL DEFAULT '[]',
  thumbnail_url TEXT NULL,
  temp_dir TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading',
  job_id TEXT NULL,
  video_id INTEGER NULL,
  error_message TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  business_id INTEGER NULL,
  user_id INTEGER NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  stage_label TEXT NULL,
  result_json TEXT NULL,
  error_message TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS otp_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  phone TEXT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  destination_masked TEXT NULL,
  provider_message_id TEXT NULL,
  user_id INTEGER NULL,
  purpose TEXT NOT NULL DEFAULT 'registration',
  otp_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  ip_address TEXT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requirements_register (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  title TEXT NOT NULL,
  expected_behavior TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT STARTED',
  test_case TEXT NOT NULL,
  evidence TEXT NULL,
  last_verified_at TEXT NULL,
  responsible_component TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monitoring_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  triggered_by_user_id INTEGER NULL,
  overall_status TEXT NOT NULL DEFAULT 'healthy',
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  avg_response_ms REAL NOT NULL DEFAULT 0,
  details_json TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monitoring_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  severity TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL DEFAULT 'health',
  module TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json TEXT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

async function ensureMySqlSchemaAndIndexes(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS video_upload_sessions (
      upload_id VARCHAR(64) PRIMARY KEY,
      business_id INT NOT NULL,
      user_id INT NOT NULL,
      editing_video_id INT NULL,
      product_id INT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT NULL,
      is_published TINYINT(1) NOT NULL DEFAULT 0,
      original_filename VARCHAR(255) NOT NULL,
      video_mime_type VARCHAR(100) NOT NULL DEFAULT 'video/mp4',
      total_size_bytes BIGINT NOT NULL,
      chunk_size_bytes INT NOT NULL,
      total_chunks INT NOT NULL,
      uploaded_chunks_json LONGTEXT NOT NULL,
      thumbnail_url VARCHAR(500) NULL,
      temp_dir VARCHAR(500) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'uploading',
      job_id VARCHAR(64) NULL,
      video_id INT NULL,
      error_message TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS background_jobs (
      id VARCHAR(64) PRIMARY KEY,
      business_id INT NULL,
      user_id INT NOT NULL,
      job_type VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued',
      progress INT NOT NULL DEFAULT 0,
      stage_label VARCHAR(160) NULL,
      result_json LONGTEXT NULL,
      error_message TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      completed_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(190) NOT NULL,
      phone VARCHAR(32) NULL,
      channel VARCHAR(24) NOT NULL DEFAULT 'email',
      destination_masked VARCHAR(190) NULL,
      provider_message_id VARCHAR(190) NULL,
      user_id INT NULL,
      purpose VARCHAR(40) NOT NULL DEFAULT 'registration',
      otp_hash VARCHAR(128) NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 5,
      ip_address VARCHAR(64) NULL,
      expires_at VARCHAR(48) NOT NULL,
      used_at VARCHAR(48) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_id INT NOT NULL,
      product_id INT NOT NULL,
      image_url VARCHAR(500) NOT NULL,
      is_primary TINYINT(1) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS requirements_register (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requirement_id VARCHAR(32) NOT NULL UNIQUE,
      module VARCHAR(100) NOT NULL,
      title VARCHAR(200) NOT NULL,
      expected_behavior TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'NOT STARTED',
      test_case TEXT NOT NULL,
      evidence TEXT NULL,
      last_verified_at VARCHAR(48) NULL,
      responsible_component VARCHAR(255) NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitoring_runs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      trigger_type VARCHAR(24) NOT NULL DEFAULT 'manual',
      triggered_by_user_id INT NULL,
      overall_status VARCHAR(24) NOT NULL DEFAULT 'healthy',
      passed_count INT NOT NULL DEFAULT 0,
      failed_count INT NOT NULL DEFAULT 0,
      total_count INT NOT NULL DEFAULT 0,
      avg_response_ms DOUBLE NOT NULL DEFAULT 0,
      details_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitoring_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      severity VARCHAR(24) NOT NULL DEFAULT 'info',
      category VARCHAR(32) NOT NULL DEFAULT 'health',
      module VARCHAR(100) NOT NULL,
      message VARCHAR(500) NOT NULL,
      meta_json LONGTEXT NULL,
      resolved TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const ensureMySqlColumn = async (table, col, ddl) => {
    try {
      const [rows] = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
        [table, col]
      );
      if (!rows.length) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
      }
    } catch {
      // Ignore if table not present yet
    }
  };

  await ensureMySqlColumn('users', 'whatsapp_available', 'whatsapp_available TINYINT(1) NOT NULL DEFAULT 0');
  await ensureMySqlColumn('businesses', 'phone_on_whatsapp', 'phone_on_whatsapp TINYINT(1) NOT NULL DEFAULT 0');
  await ensureMySqlColumn('businesses', 'setup_completed', 'setup_completed TINYINT(1) NOT NULL DEFAULT 1');
  await ensureMySqlColumn('businesses', 'setup_steps_json', 'setup_steps_json LONGTEXT NULL');
  await ensureMySqlColumn('messages', 'read_at', 'read_at VARCHAR(48) NULL');
  await ensureMySqlColumn('otp_tokens', 'destination_masked', 'destination_masked VARCHAR(190) NULL');
  await ensureMySqlColumn('otp_tokens', 'provider_message_id', 'provider_message_id VARCHAR(190) NULL');

  const indexes = [
    ['businesses', 'idx_businesses_pub_cat_dist', 'status, is_public_listed, deleted_at, category, district, id DESC'],
    ['products', 'idx_products_biz_status', 'business_id, status'],
    ['product_images', 'idx_prod_images_prod', 'product_id, is_primary DESC, sort_order ASC'],
    ['inventory', 'idx_inventory_product', 'product_id'],
    ['inventory', 'idx_inventory_biz_branch', 'business_id, branch_id'],
    ['sales', 'idx_sales_customer', 'customer_id'],
    ['sales', 'idx_sales_biz_branch_status_date', 'business_id, branch_id, sale_status, created_at'],
    ['sale_items', 'idx_sale_items_sale', 'sale_id'],
    ['sale_items', 'idx_sale_items_prod', 'product_id'],
    ['expenses', 'idx_expenses_biz_status_branch', 'business_id, approval_status, branch_id'],
    ['messages', 'idx_messages_biz_id', 'business_id, id DESC'],
    ['notifications', 'idx_notifications_user', 'user_id, id DESC'],
    ['user_sessions', 'idx_sessions_user_revoked', 'user_id, is_revoked'],
    ['activity_logs', 'idx_activity_biz', 'business_id, id DESC'],
    ['business_activity_logs', 'idx_biz_activity_biz', 'business_id, id DESC'],
    ['business_videos', 'idx_videos_pub', 'is_published, business_id, id DESC'],
    ['video_upload_sessions', 'idx_vus_biz_user', 'business_id, user_id, status'],
    ['background_jobs', 'idx_bg_jobs_user', 'user_id, status'],
    ['otp_tokens', 'idx_otp_email_purpose', 'email, purpose, id DESC'],
    ['users', 'idx_users_phone', 'phone'],
    ['customers', 'idx_customers_biz_phone', 'business_id, phone'],
    ['monitoring_events', 'idx_mon_events_created', 'severity, category, id DESC'],
    ['monitoring_runs', 'idx_mon_runs_created', 'id DESC'],
  ];

  for (const [table, indexName, cols] of indexes) {
    try {
      const [existing] = await pool.query(
        `SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
        [table, indexName]
      );
      if (!existing.length) {
        await pool.query(`CREATE INDEX ${indexName} ON ${table}(${cols})`);
      }
    } catch {
      // Ignore if table not present yet in external schema
    }
  }
}

const SHARED_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_businesses_public ON businesses(status, is_public_listed, deleted_at, id DESC);
  CREATE INDEX IF NOT EXISTS idx_businesses_pub_cat_dist ON businesses(status, is_public_listed, deleted_at, category, district, id DESC);
  CREATE INDEX IF NOT EXISTS idx_businesses_category ON businesses(category);
  CREATE INDEX IF NOT EXISTS idx_businesses_district ON businesses(district);
  CREATE INDEX IF NOT EXISTS idx_products_biz_status ON products(business_id, status);
  CREATE INDEX IF NOT EXISTS idx_prod_images_prod ON product_images(product_id, is_primary DESC, id ASC);
  CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_biz_branch ON inventory(business_id, branch_id);
  CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
  CREATE INDEX IF NOT EXISTS idx_sales_biz_branch_status_date ON sales(business_id, branch_id, sale_status, created_at);
  CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
  CREATE INDEX IF NOT EXISTS idx_sale_items_prod ON sale_items(product_id);
  CREATE INDEX IF NOT EXISTS idx_videos_pub ON business_videos(is_published, business_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_branches_biz_active ON branches(business_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_reviews_biz ON product_reviews(business_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_user ON product_reviews(user_id);
  CREATE INDEX IF NOT EXISTS idx_inquiries_user ON contact_inquiries(user_id);
  CREATE INDEX IF NOT EXISTS idx_sales_biz_status_date ON sales(business_id, sale_status, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_jti ON user_sessions(token_jti, user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_revoked ON user_sessions(user_id, is_revoked);
  CREATE INDEX IF NOT EXISTS idx_bm_biz_status ON business_members(business_id, status);
  CREATE INDEX IF NOT EXISTS idx_bm_user_status ON business_members(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_ba_biz_primary ON business_admins(business_id, is_primary, id DESC);
  CREATE INDEX IF NOT EXISTS idx_ba_user ON business_admins(user_id);
  CREATE INDEX IF NOT EXISTS idx_subs_biz ON subscriptions(business_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_orders_biz_created ON orders(business_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_cust_user ON orders(customer_user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(business_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_expenses_biz_status ON expenses(business_id, approval_status);
  CREATE INDEX IF NOT EXISTS idx_expenses_biz_status_branch ON expenses(business_id, approval_status, branch_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_biz_id ON messages(business_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_biz ON activity_logs(business_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_biz_activity_biz ON business_activity_logs(business_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_email_ver_user ON email_verifications(user_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, id DESC);
  CREATE INDEX IF NOT EXISTS idx_vacancies_biz_status ON job_vacancies(business_id, status);
  CREATE INDEX IF NOT EXISTS idx_job_apps_user ON job_applications(applicant_user_id);
  CREATE INDEX IF NOT EXISTS idx_payroll_cfg_biz_due ON employee_payroll_configs(business_id, payroll_status, next_payment_date);
  CREATE INDEX IF NOT EXISTS idx_payroll_cfg_user ON employee_payroll_configs(user_id);
  CREATE INDEX IF NOT EXISTS idx_payroll_tx_biz_status ON payroll_transactions(business_id, status, created_at);
  CREATE INDEX IF NOT EXISTS idx_payroll_tx_emp ON payroll_transactions(employee_user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_payroll_alerts_biz ON payroll_due_alerts(business_id, status);
  CREATE INDEX IF NOT EXISTS idx_vus_biz_user ON video_upload_sessions(business_id, user_id, status);
  CREATE INDEX IF NOT EXISTS idx_bg_jobs_user ON background_jobs(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp_tokens(email, purpose, id DESC);
  CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
  CREATE INDEX IF NOT EXISTS idx_customers_biz_phone ON customers(business_id, phone);
  CREATE INDEX IF NOT EXISTS idx_mon_events_created ON monitoring_events(severity, category, id DESC);
  CREATE INDEX IF NOT EXISTS idx_mon_runs_created ON monitoring_runs(id DESC);
`;

export function buildPostgresSchemaSql() {
  const base = SQLITE_SCHEMA_SQL
    .replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*ON;\s*/im, '')
    .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'SERIAL PRIMARY KEY')
    .replace(/DEFAULT\s*\(\s*datetime\(\s*'now'\s*\)\s*\)/gi, "DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))")
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION');

  const extraAlterStatements = `
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'system';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_available INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_settings_json TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_preferences_json TEXT NULL;
    ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS payroll_alerts INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_code TEXT NULL;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS phone_on_whatsapp INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_public_listed INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS setup_completed INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS setup_steps_json TEXT NULL;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS deleted_at TEXT NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_user_id INTEGER NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL;
    ALTER TABLE contact_inquiries ADD COLUMN IF NOT EXISTS business_id INTEGER NULL;
    ALTER TABLE contact_inquiries ADD COLUMN IF NOT EXISTS user_id INTEGER NULL;
    ALTER TABLE otp_tokens ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email';
    ALTER TABLE otp_tokens ADD COLUMN IF NOT EXISTS destination_masked TEXT NULL;
    ALTER TABLE otp_tokens ADD COLUMN IF NOT EXISTS provider_message_id TEXT NULL;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TEXT NULL;
  `;

  return `${base}\n${extraAlterStatements}\n${SHARED_INDEXES_SQL}`;
}

async function ensurePostgresSchemaAndIndexes(pool) {
  const ddl = buildPostgresSchemaSql();
  await pool.query(ddl);
}

export async function initDatabase() {
  if (env.dbClient === 'postgres' && env.databaseUrl) {
    if (env.databaseUrl.includes('[YOUR-DATABASE-PASSWORD]')) {
      console.warn(
        '[DB] DATABASE_URL still contains [YOUR-DATABASE-PASSWORD] placeholder; falling back to local persistent SQLite until a real password is provided.'
      );
    } else {
      try {
        pgPool = new PgPool({
          connectionString: env.databaseUrl,
          max: 20,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
          ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
        });
        pgPool.on('error', (poolErr) => {
          console.error('[DB] Unexpected PostgreSQL pool error:', poolErr.message);
        });
        await pgPool.query('SELECT 1');
        await ensurePostgresSchemaAndIndexes(pgPool);
        activeDialect = 'postgres';
        console.log('[DB] Connected to PostgreSQL (Supabase) database');
        return { dialect: activeDialect };
      } catch (err) {
        console.warn('[DB] PostgreSQL unavailable, falling back to persistent SQLite:', err.message);
        if (pgPool) {
          await pgPool.end().catch(() => {});
          pgPool = null;
        }
      }
    }
  }

  if (env.dbClient === 'mysql' && env.mysql.host) {
    try {
      mysqlPool = mysql.createPool({
        host: env.mysql.host,
        port: env.mysql.port,
        user: env.mysql.user,
        password: env.mysql.password,
        database: env.mysql.database,
        waitForConnections: true,
        connectionLimit: 25,
        maxIdle: 10,
        idleTimeout: 60_000,
        queueLimit: 0,
        connectTimeout: 10_000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10_000,
        namedPlaceholders: false,
      });
      await mysqlPool.query('SELECT 1');
      await ensureMySqlSchemaAndIndexes(mysqlPool);
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
  const dbPath = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.join(dataDir, 'bizflow.sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
    PRAGMA cache_size = -64000;
    PRAGMA wal_autocheckpoint = 1000;
    PRAGMA busy_timeout = 15000;
  `);
  sqliteDb.exec(SQLITE_SCHEMA_SQL);
  const ensureColumn = (table, col, ddl) => {
    const cols = sqliteDb.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === col)) {
      sqliteDb.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };
  ensureColumn('users', 'must_change_password', 'must_change_password INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'preferred_language', "preferred_language TEXT NOT NULL DEFAULT 'en'");
  ensureColumn('users', 'theme_preference', "theme_preference TEXT NOT NULL DEFAULT 'system'");
  ensureColumn('users', 'whatsapp_available', 'whatsapp_available INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'bio', 'bio TEXT NULL');
  ensureColumn('users', 'location', 'location TEXT NULL');
  ensureColumn('users', 'privacy_settings_json', 'privacy_settings_json TEXT NULL');
  ensureColumn('users', 'dashboard_preferences_json', 'dashboard_preferences_json TEXT NULL');
  ensureColumn('notification_preferences', 'payroll_alerts', 'payroll_alerts INTEGER NOT NULL DEFAULT 1');
  ensureColumn('businesses', 'business_code', 'business_code TEXT NULL');
  ensureColumn('businesses', 'phone_on_whatsapp', 'phone_on_whatsapp INTEGER NOT NULL DEFAULT 0');
  ensureColumn('businesses', 'is_public_listed', 'is_public_listed INTEGER NOT NULL DEFAULT 1');
  ensureColumn('businesses', 'setup_completed', 'setup_completed INTEGER NOT NULL DEFAULT 1');
  ensureColumn('businesses', 'setup_steps_json', 'setup_steps_json TEXT NULL');
  ensureColumn('businesses', 'deleted_at', 'deleted_at TEXT NULL');
  ensureColumn('orders', 'customer_user_id', 'customer_user_id INTEGER NULL');
  ensureColumn('orders', 'idempotency_key', 'idempotency_key TEXT NULL');
  ensureColumn('contact_inquiries', 'business_id', 'business_id INTEGER NULL');
  ensureColumn('contact_inquiries', 'user_id', 'user_id INTEGER NULL');
  ensureColumn('otp_tokens', 'channel', "channel TEXT NOT NULL DEFAULT 'email'");
  ensureColumn('otp_tokens', 'destination_masked', 'destination_masked TEXT NULL');
  ensureColumn('otp_tokens', 'provider_message_id', 'provider_message_id TEXT NULL');
  ensureColumn('messages', 'read_at', 'read_at TEXT NULL');
  sqliteDb.exec(SHARED_INDEXES_SQL);
  activeDialect = 'sqlite';
  console.log('[DB] Connected to persistent SQLite database at', dbPath);
  return { dialect: activeDialect };
}

export function getDialect() {
  return activeDialect;
}

function replaceOutsideSqlLiterals(sql, transformNonLiteral) {
  let result = '';
  let i = 0;
  let buf = '';

  const flush = () => {
    if (buf) {
      result += transformNonLiteral(buf);
      buf = '';
    }
  };

  while (i < sql.length) {
    if (sql[i] === "'") {
      flush();
      let lit = "'";
      i += 1;
      while (i < sql.length) {
        lit += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            lit += "'";
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      result += lit;
    } else {
      buf += sql[i];
      i += 1;
    }
  }
  flush();
  return result;
}

export function adaptSqlForPostgres(sql, forExecute = false) {
  let out = sql
    .replace(
      /datetime\(\s*'now'\s*,\s*'\+(\d+)\s+days'\s*\)/gi,
      "TO_CHAR((NOW() + INTERVAL '$1 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"
    )
    .replace(
      /datetime\(\s*'now'\s*,\s*'-(\d+)\s+days'\s*\)/gi,
      "TO_CHAR((NOW() - INTERVAL '$1 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"
    )
    .replace(
      /datetime\(\s*'now'\s*\)/gi,
      "TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"
    )
    .replace(/date\(\s*'now'\s*\)/gi, "TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD')")
    .replace(/date\(\s*([a-zA-Z0-9_.]+)\s*\)/gi, 'SUBSTRING(($1)::text, 1, 10)')
    .replace(/strftime\(\s*'%Y-%m'\s*,\s*'now'\s*\)/gi, "TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM')")
    .replace(/strftime\(\s*'%Y'\s*,\s*'now'\s*\)/gi, "TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY')")
    .replace(/strftime\(\s*'%Y-%m'\s*,\s*([^)]+)\)/gi, 'SUBSTRING(($1)::text, 1, 7)')
    .replace(/strftime\(\s*'%Y'\s*,\s*([^)]+)\)/gi, 'SUBSTRING(($1)::text, 1, 4)')
    .replace(/MAX\(\s*0\s*,/gi, 'GREATEST(0,');

  let paramIdx = 0;
  out = replaceOutsideSqlLiterals(out, (segment) =>
    segment
      .replace(/\bLIKE\b/gi, 'ILIKE')
      .replace(/\?/g, () => `$${++paramIdx}`)
  );

  if (forExecute) {
    const insertMatch = out.match(/^\s*INSERT\s+INTO\s+([a-zA-Z0-9_"]+)/i);
    if (insertMatch && !/\bRETURNING\b/i.test(out)) {
      const tableName = insertMatch[1].replace(/"/g, '').toLowerCase();
      if (!TABLES_WITHOUT_SERIAL_ID.has(tableName)) {
        out = `${out.replace(/;\s*$/, '')} RETURNING id`;
      }
    }
  }

  return out;
}

function adaptSqlForDialect(sql, forExecute = false) {
  if (activeDialect === 'postgres') {
    return adaptSqlForPostgres(sql, forExecute);
  }
  if (activeDialect !== 'mysql') return sql;
  return sql
    .replace(/datetime\(\s*'now'\s*,\s*'\+(\d+)\s+days'\s*\)/gi, 'DATE_ADD(NOW(), INTERVAL $1 DAY)')
    .replace(/datetime\(\s*'now'\s*,\s*'-(\d+)\s+days'\s*\)/gi, 'DATE_SUB(NOW(), INTERVAL $1 DAY)')
    .replace(/datetime\(\s*'now'\s*\)/gi, 'NOW()')
    .replace(/date\(\s*'now'\s*\)/gi, 'CURDATE()')
    .replace(/strftime\(\s*'%Y-%m'\s*,\s*([^)]+)\)/gi, "DATE_FORMAT($1, '%Y-%m')")
    .replace(/strftime\(\s*'%Y'\s*,\s*([^)]+)\)/gi, "DATE_FORMAT($1, '%Y')")
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
  const adapted = adaptSqlForDialect(sql, false);
  if (activeDialect === 'postgres') {
    const res = await pgPool.query(adapted, safeParams);
    return res.rows;
  }
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
  const adapted = adaptSqlForDialect(sql, true);
  if (activeDialect === 'postgres') {
    const res = await pgPool.query(adapted, safeParams);
    return {
      insertId: Number(res.rows?.[0]?.id || 0),
      affectedRows: Number(res.rowCount || 0),
    };
  }
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
  if (activeDialect === 'postgres') {
    const client = await pgPool.connect();
    await client.query('BEGIN');
    try {
      const tx = {
        query: async (sql, params = []) => {
          const res = await client.query(adaptSqlForPostgres(sql, false), normalizeParams(params));
          return res.rows;
        },
        queryOne: async (sql, params = []) => {
          const res = await client.query(adaptSqlForPostgres(sql, false), normalizeParams(params));
          return res.rows[0] || null;
        },
        execute: async (sql, params = []) => {
          const res = await client.query(adaptSqlForPostgres(sql, true), normalizeParams(params));
          return {
            insertId: Number(res.rows?.[0]?.id || 0),
            affectedRows: Number(res.rowCount || 0),
          };
        },
      };
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  if (activeDialect === 'mysql') {
    const conn = await mysqlPool.getConnection();
    await conn.beginTransaction();
    try {
      const tx = {
        query: async (sql, params = []) => {
          const [rows] = await conn.execute(adaptSqlForDialect(sql, false), normalizeParams(params));
          return rows;
        },
        queryOne: async (sql, params = []) => {
          const [rows] = await conn.execute(adaptSqlForDialect(sql, false), normalizeParams(params));
          return rows[0] || null;
        },
        execute: async (sql, params = []) => {
          const [res] = await conn.execute(adaptSqlForDialect(sql, true), normalizeParams(params));
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

  const runSerialized = async () => {
    sqliteDb.exec('BEGIN IMMEDIATE');
    try {
      const tx = {
        query: async (sql, params = []) => sqliteDb.prepare(adaptSqlForDialect(sql, false)).all(...normalizeParams(params)),
        queryOne: async (sql, params = []) => sqliteDb.prepare(adaptSqlForDialect(sql, false)).get(...normalizeParams(params)) || null,
        execute: async (sql, params = []) => {
          const res = sqliteDb.prepare(adaptSqlForDialect(sql, true)).run(...normalizeParams(params));
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
  };

  const pending = sqliteTxChain.then(runSerialized, runSerialized);
  sqliteTxChain = pending.catch(() => {});
  return pending;
}

export function roundMoney(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}
