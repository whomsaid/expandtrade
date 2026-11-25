-- BizTrade Africa (BTA) initial PostgreSQL schema for Supabase (project: mmazhuahlboedleiremx)
-- Generated from backend/config/db.js with Row Level Security enabled for PostgREST defense-in-depth

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_jti TEXT NOT NULL UNIQUE,
  device_info TEXT NULL,
  ip_address TEXT NULL,
  is_revoked INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  reset_token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT NULL,
  was_successful INTEGER NOT NULL DEFAULT 0,
  user_agent TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  monthly_price_rwf DOUBLE PRECISION NOT NULL DEFAULT 0,
  annual_price_rwf DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_employees INTEGER NOT NULL DEFAULT 3,
  max_branches INTEGER NOT NULL DEFAULT 1,
  max_products INTEGER NOT NULL DEFAULT 100,
  max_storage_mb INTEGER NOT NULL DEFAULT 250,
  max_ai_requests_monthly INTEGER NOT NULL DEFAULT 25,
  advanced_reports_enabled INTEGER NOT NULL DEFAULT 0,
  integrations_enabled INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS platform_admins (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  admin_level TEXT NOT NULL DEFAULT 'super_admin',
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS businesses (
  id SERIAL PRIMARY KEY,
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
  default_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 18.0,
  tax_identification_number TEXT NULL,
  operating_hours TEXT NULL,
  is_public_listed INTEGER NOT NULL DEFAULT 1,
  phone_on_whatsapp INTEGER NOT NULL DEFAULT 0,
  setup_completed INTEGER NOT NULL DEFAULT 1,
  setup_steps_json TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  deleted_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS business_admins (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 1,
  assigned_by_admin_id INTEGER NULL,
  activation_token TEXT NULL UNIQUE,
  activation_expires_at TEXT NULL,
  activated_at TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending_activation',
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE (business_id, user_id),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_settings (
  id SERIAL PRIMARY KEY,
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
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE (business_id, code),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  assigned_branch_id INTEGER NULL,
  all_branches_access INTEGER NOT NULL DEFAULT 0,
  job_title TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
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
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS employee_invitations (
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  default_address TEXT NULL,
  city TEXT NULL,
  country TEXT NOT NULL DEFAULT 'Rwanda',
  preferred_currency TEXT NOT NULL DEFAULT 'RWF',
  loyalty_tier TEXT NOT NULL DEFAULT 'standard',
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS platform_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  updated_by_user_id INTEGER NULL,
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'trialing',
  starts_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ends_at TEXT NULL,
  grace_ends_at TEXT NULL,
  auto_renew INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL,
  business_id INTEGER NOT NULL,
  amount_rwf DOUBLE PRECISION NOT NULL,
  payment_method TEXT NOT NULL,
  reference_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'verified',
  paid_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NULL,
  user_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  admin_notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT NULL,
  phone TEXT NOT NULL,
  email TEXT NULL,
  address TEXT NULL,
  tax_number TEXT NULL,
  notes TEXT NULL,
  outstanding_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  user_id INTEGER NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NULL,
  address TEXT NULL,
  customer_type TEXT NOT NULL DEFAULT 'retail',
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  outstanding_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT NULL,
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
  whatsapp_opted_out_at TEXT NULL,
  has_whatsapp TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_notes (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  author_user_id INTEGER NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  UNIQUE (business_id, name),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  category_id INTEGER NULL,
  supplier_id INTEGER NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT NULL,
  description TEXT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  purchase_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  selling_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  image_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE (business_id, sku),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE (business_id, branch_id, product_id),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  from_branch_id INTEGER NOT NULL,
  to_branch_id INTEGER NOT NULL,
  reference_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id SERIAL PRIMARY KEY,
  stock_transfer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  FOREIGN KEY (stock_transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  customer_id INTEGER NULL,
  cashier_user_id INTEGER NOT NULL,
  reference_number TEXT NOT NULL,
  idempotency_key TEXT NULL,
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  amount_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
  balance_due DOUBLE PRECISION NOT NULL DEFAULT 0,
  sale_status TEXT NOT NULL DEFAULT 'completed',
  payment_status TEXT NOT NULL DEFAULT 'paid',
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE (business_id, reference_number),
  UNIQUE (business_id, idempotency_key),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  line_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  sale_id INTEGER NULL,
  order_id INTEGER NULL,
  customer_id INTEGER NULL,
  payment_method TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  external_reference TEXT NULL,
  verification_status TEXT NOT NULL DEFAULT 'verified',
  recorded_by_user_id INTEGER NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS refunds (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  sale_id INTEGER NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  restock_items INTEGER NOT NULL DEFAULT 1,
  approved_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS receipts (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  sale_id INTEGER NOT NULL UNIQUE,
  receipt_number TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  printed_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  po_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ordered',
  total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  amount_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
  expected_delivery_date TEXT NULL,
  invoice_number TEXT NULL,
  notes TEXT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE (business_id, po_number),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  ordered_qty INTEGER NOT NULL,
  received_qty INTEGER NOT NULL DEFAULT 0,
  unit_cost DOUBLE PRECISION NOT NULL,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  purchase_order_id INTEGER NULL,
  amount DOUBLE PRECISION NOT NULL,
  payment_method TEXT NOT NULL,
  reference_number TEXT NULL,
  recorded_by_user_id INTEGER NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
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
  total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  assigned_user_id INTEGER NULL,
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  old_status TEXT NULL,
  new_status TEXT NOT NULL,
  changed_by_user_id INTEGER NULL,
  note TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (business_id, name)
);

CREATE TABLE IF NOT EXISTS income (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  payment_method TEXT NOT NULL,
  description TEXT NULL,
  recorded_by_user_id INTEGER NOT NULL,
  income_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  expense_category_id INTEGER NULL,
  category_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  amount DOUBLE PRECISION NOT NULL,
  payment_method TEXT NOT NULL,
  receipt_file_url TEXT NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  recorded_by_user_id INTEGER NOT NULL,
  approved_by_user_id INTEGER NULL,
  expense_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS expense_approvals (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL,
  approver_user_id INTEGER NOT NULL,
  decision TEXT NOT NULL,
  note TEXT NULL,
  decided_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  assigned_to_user_id INTEGER NULL,
  created_by_user_id INTEGER NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  deadline TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS task_comments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  sender_user_id INTEGER NOT NULL,
  recipient_user_id INTEGER NULL,
  channel_type TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  attachment_url TEXT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NULL,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  related_url TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
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
  id SERIAL PRIMARY KEY,
  business_id INTEGER NULL,
  branch_id INTEGER NULL,
  user_id INTEGER NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NULL,
  changes_json TEXT NULL,
  ip_address TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS business_activity_logs (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  user_id INTEGER NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NULL,
  changes_json TEXT NULL,
  ip_address TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  product_id INTEGER NULL,
  user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NULL,
  user_id INTEGER NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NULL,
  business_name TEXT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS business_videos (
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- 12. RECRUITMENT & JOB APPLICATION MANAGEMENT SYSTEM
CREATE TABLE IF NOT EXISTS job_vacancies (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  created_by_user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  department TEXT NULL,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  work_mode TEXT NOT NULL DEFAULT 'on_site',
  location TEXT NOT NULL,
  salary_min DOUBLE PRECISION NULL,
  salary_max DOUBLE PRECISION NULL,
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(business_id, slug)
);

CREATE TABLE IF NOT EXISTS job_applications (
  id SERIAL PRIMARY KEY,
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
  expected_salary DOUBLE PRECISION NULL,
  why_want_position TEXT NULL,
  why_select_you TEXT NULL,
  cover_letter TEXT NULL,
  accuracy_confirmed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TEXT NULL,
  withdrawn_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (vacancy_id) REFERENCES job_vacancies(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applicant_education (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL,
  education_level TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  field_of_study TEXT NOT NULL,
  qualification_obtained TEXT NOT NULL,
  start_year INTEGER NULL,
  graduation_year INTEGER NULL,
  country TEXT NULL,
  education_status TEXT NOT NULL DEFAULT 'Completed',
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applicant_experiences (
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applicant_skills (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL,
  skill_category TEXT NOT NULL DEFAULT 'technical',
  skill_name TEXT NOT NULL,
  proficiency_level TEXT NULL,
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_documents (
  id SERIAL PRIMARY KEY,
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
  uploaded_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_answers (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL,
  vacancy_id INTEGER NOT NULL,
  question_key TEXT NOT NULL,
  question_label TEXT NOT NULL,
  answer_text TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (vacancy_id) REFERENCES job_vacancies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_status_history (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL,
  previous_status TEXT NULL,
  new_status TEXT NOT NULL,
  changed_by_user_id INTEGER NOT NULL,
  note TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_interviews (
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (vacancy_id) REFERENCES job_vacancies(id) ON DELETE CASCADE,
  FOREIGN KEY (scheduled_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recruitment_notes (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL,
  business_id INTEGER NOT NULL,
  author_user_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
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
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  new_email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_payroll_accounts (
  id SERIAL PRIMARY KEY,
  business_id INTEGER UNIQUE NOT NULL,
  available_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  reserved_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
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
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS business_payroll_ledger (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  balance_after DOUBLE PRECISION NOT NULL,
  reference TEXT NOT NULL,
  note TEXT NULL,
  created_by_user_id INTEGER NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employee_payroll_configs (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  business_member_id INTEGER UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  salary_amount DOUBLE PRECISION NOT NULL,
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (business_member_id) REFERENCES business_members(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_batches (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  batch_reference TEXT UNIQUE NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'bulk',
  payment_period TEXT NOT NULL,
  total_employees INTEGER NOT NULL DEFAULT 0,
  total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'RWF',
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  authorized_by_user_id INTEGER NOT NULL,
  authorized_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (authorized_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_transactions (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  batch_id INTEGER NULL,
  payroll_config_id INTEGER NOT NULL,
  business_member_id INTEGER NOT NULL,
  employee_user_id INTEGER NOT NULL,
  employee_name TEXT NOT NULL,
  momo_provider TEXT NOT NULL,
  momo_phone TEXT NOT NULL,
  salary_amount DOUBLE PRECISION NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'RWF',
  payment_period TEXT NOT NULL,
  payment_reference TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  provider_transaction_id TEXT NULL,
  provider_status TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  failure_reason TEXT NULL,
  authorized_by_user_id INTEGER NOT NULL,
  authorized_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  verified_at TEXT NULL,
  paid_at TEXT NULL,
  expense_id INTEGER NULL,
  retry_of_transaction_id INTEGER NULL,
  provider_raw_response TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES payroll_batches(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_config_id) REFERENCES employee_payroll_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (business_member_id) REFERENCES business_members(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (authorized_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_due_alerts (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  payroll_config_id INTEGER NOT NULL,
  employee_user_id INTEGER NOT NULL,
  due_period TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  momo_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notified_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  completed_at TEXT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS otp_tokens (
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requirements_register (
  id SERIAL PRIMARY KEY,
  requirement_id TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  title TEXT NOT NULL,
  expected_behavior TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT STARTED',
  test_case TEXT NOT NULL,
  evidence TEXT NULL,
  last_verified_at TEXT NULL,
  responsible_component TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS monitoring_runs (
  id SERIAL PRIMARY KEY,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  triggered_by_user_id INTEGER NULL,
  overall_status TEXT NOT NULL DEFAULT 'healthy',
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  avg_response_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  details_json TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS monitoring_events (
  id SERIAL PRIMARY KEY,
  severity TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL DEFAULT 'health',
  module TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json TEXT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);


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

-- Enable RLS on all public tables (Express backend connects via DATABASE_URL postgres role; blocks unauthenticated PostgREST access)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_vacancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicant_education ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicant_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicant_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_payroll_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_payroll_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payroll_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_due_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirements_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_events ENABLE ROW LEVEL SECURITY;
