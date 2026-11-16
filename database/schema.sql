-- BizTrade Africa - Production MySQL 8+ Schema
-- Multi-tenant, Branch-aware, Rwanda-first Business Management Platform

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. AUTHENTICATION & SESSIONS
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(40) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500) NULL,
  is_email_verified TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_platform_admin TINYINT(1) NOT NULL DEFAULT 0,
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_jti VARCHAR(100) NOT NULL UNIQUE,
  device_info VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  is_revoked TINYINT(1) NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS email_verifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  otp_code VARCHAR(20) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ev_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_resets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  reset_token VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_attempts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  ip_address VARCHAR(64) NULL,
  was_successful TINYINT(1) NOT NULL DEFAULT 0,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_attempts_email (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. SAAS PLANS & PLATFORM ADMINISTRATION
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  target_audience VARCHAR(160) NOT NULL,
  monthly_price_rwf DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  annual_price_rwf DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  max_employees INT NOT NULL DEFAULT 3,
  max_branches INT NOT NULL DEFAULT 1,
  max_products INT NOT NULL DEFAULT 100,
  max_storage_mb INT NOT NULL DEFAULT 250,
  max_ai_requests_monthly INT NOT NULL DEFAULT 25,
  advanced_reports_enabled TINYINT(1) NOT NULL DEFAULT 0,
  integrations_enabled TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS platform_admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  admin_level ENUM('super_admin', 'support_admin', 'billing_admin') NOT NULL DEFAULT 'super_admin',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. BUSINESSES, BRANCHES & RBAC
CREATE TABLE IF NOT EXISTS businesses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_user_id INT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL,
  logo_url VARCHAR(500) NULL,
  description TEXT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  country VARCHAR(80) NOT NULL DEFAULT 'Rwanda',
  province VARCHAR(100) NOT NULL DEFAULT 'Kigali City',
  district VARCHAR(100) NOT NULL DEFAULT 'Gasabo',
  physical_address VARCHAR(255) NOT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'RWF',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Kigali',
  tax_enabled TINYINT(1) NOT NULL DEFAULT 1,
  default_tax_rate DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  tax_identification_number VARCHAR(80) NULL,
  operating_hours VARCHAR(180) NULL,
  status ENUM('active', 'suspended', 'archived') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_biz_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS business_settings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL UNIQUE,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  date_format VARCHAR(30) NOT NULL DEFAULT 'YYYY-MM-DD',
  number_format VARCHAR(30) NOT NULL DEFAULT '1,000.00',
  receipt_header TEXT NULL,
  receipt_footer TEXT NULL,
  enabled_payment_methods JSON NULL,
  allow_partial_payments TINYINT(1) NOT NULL DEFAULT 1,
  allow_unpaid_sales TINYINT(1) NOT NULL DEFAULT 1,
  low_stock_threshold_default INT NOT NULL DEFAULT 5,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bs_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS branches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  name VARCHAR(140) NOT NULL,
  code VARCHAR(40) NOT NULL,
  province VARCHAR(100) NULL,
  district VARCHAR(100) NULL,
  address VARCHAR(255) NULL,
  phone VARCHAR(40) NULL,
  manager_user_id INT UNSIGNED NULL,
  is_main TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branch_code (business_id, code),
  CONSTRAINT fk_br_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_br_manager FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  perm_key VARCHAR(80) NOT NULL UNIQUE,
  module VARCHAR(50) NOT NULL,
  description VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS business_members (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  assigned_branch_id INT UNSIGNED NULL,
  all_branches_access TINYINT(1) NOT NULL DEFAULT 0,
  job_title VARCHAR(100) NULL,
  status ENUM('active', 'invited', 'deactivated') NOT NULL DEFAULT 'active',
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_biz_user (business_id, user_id),
  CONSTRAINT fk_bm_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_bm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_bm_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_bm_branch FOREIGN KEY (assigned_branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_permissions (
  business_member_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  is_allowed TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (business_member_id, permission_id),
  CONSTRAINT fk_mp_member FOREIGN KEY (business_member_id) REFERENCES business_members(id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invitations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  email VARCHAR(190) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(40) NULL,
  role_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NULL,
  invite_token VARCHAR(128) NOT NULL UNIQUE,
  invited_by_user_id INT UNSIGNED NOT NULL,
  status ENUM('pending', 'accepted', 'expired', 'revoked') NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_inv_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. SUBSCRIPTIONS & SUPPORT
CREATE TABLE IF NOT EXISTS subscriptions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  plan_id INT UNSIGNED NOT NULL,
  billing_cycle ENUM('monthly', 'annual') NOT NULL DEFAULT 'monthly',
  status ENUM('trialing', 'active', 'past_due', 'grace_period', 'cancelled', 'expired') NOT NULL DEFAULT 'trialing',
  starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TIMESTAMP NULL,
  grace_ends_at TIMESTAMP NULL,
  auto_renew TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sub_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subscription_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subscription_id INT UNSIGNED NOT NULL,
  business_id INT UNSIGNED NOT NULL,
  amount_rwf DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  reference_number VARCHAR(100) NOT NULL UNIQUE,
  status ENUM('pending', 'verified', 'failed') NOT NULL DEFAULT 'verified',
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sp_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS support_tickets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
  status ENUM('open', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'open',
  admin_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. SUPPLIERS & CUSTOMERS
CREATE TABLE IF NOT EXISTS suppliers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  contact_person VARCHAR(150) NULL,
  phone VARCHAR(40) NOT NULL,
  email VARCHAR(190) NULL,
  address VARCHAR(255) NULL,
  tax_number VARCHAR(80) NULL,
  notes TEXT NULL,
  outstanding_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sup_biz (business_id),
  CONSTRAINT fk_sup_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_contacts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  supplier_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  role_title VARCHAR(100) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  CONSTRAINT fk_sc_sup FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  full_name VARCHAR(180) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  email VARCHAR(190) NULL,
  address VARCHAR(255) NULL,
  customer_type ENUM('walk_in', 'retail', 'wholesale', 'corporate') NOT NULL DEFAULT 'retail',
  loyalty_points INT NOT NULL DEFAULT 0,
  outstanding_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cust_biz (business_id, phone),
  CONSTRAINT fk_cust_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_addresses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  label VARCHAR(80) NOT NULL,
  address_line VARCHAR(255) NOT NULL,
  district VARCHAR(100) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_ca_cust FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  author_user_id INT UNSIGNED NOT NULL,
  note_type ENUM('general', 'complaint', 'feedback', 'credit') NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cn_cust FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. PRODUCTS & INVENTORY
CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  UNIQUE KEY uq_cat_biz_name (business_id, name),
  CONSTRAINT fk_cat_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NULL,
  supplier_id INT UNSIGNED NULL,
  name VARCHAR(180) NOT NULL,
  sku VARCHAR(80) NOT NULL,
  barcode VARCHAR(80) NULL,
  description TEXT NULL,
  unit VARCHAR(40) NOT NULL DEFAULT 'pcs',
  purchase_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  min_stock INT NOT NULL DEFAULT 5,
  image_url VARCHAR(500) NULL,
  status ENUM('active', 'inactive', 'archived') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_prod_sku (business_id, sku),
  INDEX idx_prod_barcode (business_id, barcode),
  CONSTRAINT fk_prod_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_prod_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_prod_sup FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pi_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_inv_branch_prod (business_id, branch_id, product_id),
  CONSTRAINT fk_inv_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_movements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  movement_type ENUM('initial', 'purchase_receive', 'sale', 'refund_return', 'transfer_out', 'transfer_in', 'adjustment_add', 'adjustment_reduce', 'damaged') NOT NULL,
  quantity_change INT NOT NULL,
  previous_quantity INT NOT NULL,
  new_quantity INT NOT NULL,
  reason VARCHAR(255) NULL,
  related_type VARCHAR(50) NULL,
  related_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sm_biz_prod (business_id, product_id, created_at),
  CONSTRAINT fk_sm_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  adjustment_type ENUM('add', 'reduce', 'damaged', 'returned') NOT NULL,
  quantity INT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_transfers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  from_branch_id INT UNSIGNED NOT NULL,
  to_branch_id INT UNSIGNED NOT NULL,
  reference_number VARCHAR(60) NOT NULL UNIQUE,
  status ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'completed',
  notes VARCHAR(255) NULL,
  created_by_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stock_transfer_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  CONSTRAINT fk_sti_transfer FOREIGN KEY (stock_transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. SALES, PAYMENTS, REFUNDS & RECEIPTS
CREATE TABLE IF NOT EXISTS sales (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NULL,
  cashier_user_id INT UNSIGNED NOT NULL,
  reference_number VARCHAR(60) NOT NULL,
  idempotency_key VARCHAR(100) NULL,
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  amount_paid DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  balance_due DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  sale_status ENUM('completed', 'cancelled', 'refunded', 'partially_refunded') NOT NULL DEFAULT 'completed',
  payment_status ENUM('paid', 'partial', 'unpaid') NOT NULL DEFAULT 'paid',
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sale_ref (business_id, reference_number),
  UNIQUE KEY uq_sale_idemp (business_id, idempotency_key),
  INDEX idx_sales_biz_date (business_id, created_at),
  CONSTRAINT fk_sales_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_sales_cust FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sale_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  sale_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  quantity INT NOT NULL,
  unit_cost DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  unit_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  CONSTRAINT fk_si_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_prod FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  sale_id INT UNSIGNED NULL,
  order_id INT UNSIGNED NULL,
  customer_id INT UNSIGNED NULL,
  payment_method ENUM('cash', 'mtn_momo', 'airtel_money', 'bank_transfer', 'card', 'other') NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  external_reference VARCHAR(120) NULL,
  verification_status ENUM('verified', 'pending', 'failed') NOT NULL DEFAULT 'verified',
  recorded_by_user_id INT UNSIGNED NOT NULL,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pay_biz (business_id, paid_at),
  CONSTRAINT fk_pay_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payment_attempts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  sale_id INT UNSIGNED NULL,
  provider VARCHAR(60) NOT NULL,
  phone_or_account VARCHAR(80) NULL,
  amount DECIMAL(15,2) NOT NULL,
  provider_tx_id VARCHAR(120) NULL,
  status ENUM('initiated', 'confirmed', 'failed') NOT NULL DEFAULT 'initiated',
  raw_payload TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refunds (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  sale_id INT UNSIGNED NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  restock_items TINYINT(1) NOT NULL DEFAULT 1,
  approved_by_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ref_sale FOREIGN KEY (sale_id) REFERENCES sales(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refund_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  refund_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  refund_amount DECIMAL(15,2) NOT NULL,
  CONSTRAINT fk_ri_refund FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS receipts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  sale_id INT UNSIGNED NOT NULL UNIQUE,
  receipt_number VARCHAR(60) NOT NULL UNIQUE,
  payload_json JSON NOT NULL,
  printed_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rec_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. PURCHASES & CUSTOMER ORDERS
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  supplier_id INT UNSIGNED NOT NULL,
  po_number VARCHAR(60) NOT NULL,
  status ENUM('draft', 'ordered', 'partially_received', 'received', 'cancelled') NOT NULL DEFAULT 'ordered',
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  amount_paid DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  expected_delivery_date DATE NULL,
  invoice_number VARCHAR(80) NULL,
  notes VARCHAR(255) NULL,
  created_by_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_po_num (business_id, po_number),
  CONSTRAINT fk_po_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_po_sup FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  ordered_qty INT NOT NULL,
  received_qty INT NOT NULL DEFAULT 0,
  unit_cost DECIMAL(15,2) NOT NULL,
  CONSTRAINT fk_pi_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS goods_receipts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  purchase_order_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  received_by_user_id INT UNSIGNED NOT NULL,
  notes VARCHAR(255) NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NULL,
  order_number VARCHAR(60) NOT NULL UNIQUE,
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(40) NOT NULL,
  delivery_address VARCHAR(255) NULL,
  order_status ENUM('pending', 'confirmed', 'processing', 'ready_for_collection', 'out_for_delivery', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  payment_status ENUM('unpaid', 'partial', 'paid') NOT NULL DEFAULT 'unpaid',
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  assigned_user_id INT UNSIGNED NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ord_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_status_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  old_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NOT NULL,
  changed_by_user_id INT UNSIGNED NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_osh_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS deliveries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED NOT NULL,
  driver_name VARCHAR(120) NULL,
  driver_phone VARCHAR(40) NULL,
  status ENUM('assigned', 'in_transit', 'delivered', 'failed') NOT NULL DEFAULT 'assigned',
  dispatched_at TIMESTAMP NULL,
  delivered_at TIMESTAMP NULL,
  CONSTRAINT fk_del_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. FINANCE (INCOME, EXPENSES, APPROVALS)
CREATE TABLE IF NOT EXISTS expense_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  UNIQUE KEY uq_ec_biz (business_id, name),
  CONSTRAINT fk_ec_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS financial_accounts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  account_type ENUM('cash', 'mobile_money', 'bank') NOT NULL,
  balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  CONSTRAINT fk_fa_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS income (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  category VARCHAR(100) NOT NULL,
  source VARCHAR(150) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  description VARCHAR(255) NULL,
  recorded_by_user_id INT UNSIGNED NOT NULL,
  income_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inc_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  expense_category_id INT UNSIGNED NULL,
  category_name VARCHAR(120) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  receipt_file_url VARCHAR(500) NULL,
  approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  recorded_by_user_id INT UNSIGNED NOT NULL,
  approved_by_user_id INT UNSIGNED NULL,
  expense_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exp_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expense_approvals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  expense_id INT UNSIGNED NOT NULL,
  approver_user_id INT UNSIGNED NOT NULL,
  decision ENUM('approved', 'rejected') NOT NULL,
  note VARCHAR(255) NULL,
  decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ea_exp FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS financial_adjustments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  reference_type VARCHAR(50) NOT NULL,
  reference_id INT UNSIGNED NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. EMPLOYEES, TASKS & INTERNAL COMMUNICATION
CREATE TABLE IF NOT EXISTS employees (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  business_member_id INT UNSIGNED NOT NULL UNIQUE,
  employee_code VARCHAR(50) NULL,
  salary_rwf DECIMAL(15,2) NULL,
  hire_date DATE NULL,
  CONSTRAINT fk_emp_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_emp_bm FOREIGN KEY (business_member_id) REFERENCES business_members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_activity (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  activity_type VARCHAR(80) NOT NULL,
  details VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tasks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  assigned_to_user_id INT UNSIGNED NULL,
  created_by_user_id INT UNSIGNED NOT NULL,
  priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
  status ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  deadline DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tc_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_attachments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  uploaded_by_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ta_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  author_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ann_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NULL,
  sender_user_id INT UNSIGNED NOT NULL,
  recipient_user_id INT UNSIGNED NULL,
  channel_type ENUM('branch', 'direct', 'general') NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  attachment_url VARCHAR(500) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. NOTIFICATIONS, AUDIT LOGS & EXPORTS
CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  related_url VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INT UNSIGNED PRIMARY KEY,
  in_app_enabled TINYINT(1) NOT NULL DEFAULT 1,
  email_enabled TINYINT(1) NOT NULL DEFAULT 1,
  sms_enabled TINYINT(1) NOT NULL DEFAULT 0,
  low_stock_alerts TINYINT(1) NOT NULL DEFAULT 1,
  order_alerts TINYINT(1) NOT NULL DEFAULT 1,
  expense_alerts TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_np_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NULL,
  branch_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  changes_json JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_biz (business_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS report_exports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  report_type VARCHAR(80) NOT NULL,
  export_format ENUM('csv', 'pdf', 'xlsx') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. RECRUITMENT & JOB APPLICATION MANAGEMENT SYSTEM
CREATE TABLE IF NOT EXISTS job_vacancies (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NULL,
  created_by_user_id INT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  department VARCHAR(120) NULL,
  employment_type ENUM('full_time', 'part_time', 'contract', 'internship', 'temporary') NOT NULL DEFAULT 'full_time',
  work_mode ENUM('on_site', 'hybrid', 'remote') NOT NULL DEFAULT 'on_site',
  location VARCHAR(180) NOT NULL,
  salary_min DECIMAL(15,2) NULL,
  salary_max DECIMAL(15,2) NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'RWF',
  show_salary TINYINT(1) NOT NULL DEFAULT 0,
  summary TEXT NULL,
  description TEXT NOT NULL,
  responsibilities TEXT NULL,
  requirements TEXT NULL,
  required_education_level VARCHAR(100) NULL,
  min_experience_years INT UNSIGNED NOT NULL DEFAULT 0,
  required_document_types_json JSON NULL,
  custom_questions_json JSON NULL,
  allow_reapplication TINYINT(1) NOT NULL DEFAULT 0,
  positions_count INT UNSIGNED NOT NULL DEFAULT 1,
  application_deadline DATE NULL,
  status ENUM('draft', 'published', 'closed', 'archived') NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vac_biz_slug (business_id, slug),
  INDEX idx_vac_biz_status (business_id, status),
  CONSTRAINT fk_vac_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_vac_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_vac_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_applications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference_number VARCHAR(64) NULL UNIQUE,
  vacancy_id INT UNSIGNED NOT NULL,
  business_id INT UNSIGNED NOT NULL,
  applicant_user_id INT UNSIGNED NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  profile_photo_url VARCHAR(500) NULL,
  date_of_birth DATE NULL,
  gender VARCHAR(40) NULL,
  phone VARCHAR(40) NOT NULL,
  email VARCHAR(190) NOT NULL,
  nationality VARCHAR(80) NULL,
  country VARCHAR(80) NULL,
  province VARCHAR(80) NULL,
  district VARCHAR(80) NULL,
  sector VARCHAR(80) NULL,
  residential_address VARCHAR(255) NULL,
  has_work_experience TINYINT(1) NULL,
  years_of_experience INT UNSIGNED NOT NULL DEFAULT 0,
  skills_summary TEXT NULL,
  availability VARCHAR(120) NULL,
  preferred_employment_type VARCHAR(60) NULL,
  expected_salary DECIMAL(15,2) NULL,
  why_want_position TEXT NULL,
  why_select_you TEXT NULL,
  cover_letter TEXT NULL,
  accuracy_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('draft', 'submitted', 'under_review', 'shortlisted', 'interview_scheduled', 'interview_completed', 'accepted', 'rejected', 'withdrawn') NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMP NULL,
  withdrawn_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_apps_biz_vac_status (business_id, vacancy_id, status),
  INDEX idx_apps_user (applicant_user_id, vacancy_id),
  CONSTRAINT fk_ja_vac FOREIGN KEY (vacancy_id) REFERENCES job_vacancies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ja_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_ja_user FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applicant_education (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  education_level VARCHAR(100) NOT NULL,
  institution_name VARCHAR(180) NOT NULL,
  field_of_study VARCHAR(150) NOT NULL,
  qualification_obtained VARCHAR(150) NOT NULL,
  start_year SMALLINT UNSIGNED NULL,
  graduation_year SMALLINT UNSIGNED NULL,
  country VARCHAR(80) NULL,
  education_status ENUM('Completed', 'In Progress', 'Graduated') NOT NULL DEFAULT 'Completed',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_edu_app FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applicant_experiences (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  company_name VARCHAR(180) NOT NULL,
  job_title VARCHAR(150) NOT NULL,
  employment_type VARCHAR(80) NULL,
  work_location VARCHAR(150) NULL,
  start_date VARCHAR(20) NOT NULL,
  end_date VARCHAR(20) NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  responsibilities TEXT NULL,
  achievements TEXT NULL,
  reason_for_leaving VARCHAR(255) NULL,
  reference_person VARCHAR(150) NULL,
  reference_phone VARCHAR(50) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exp_app FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applicant_skills (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  skill_category ENUM('technical', 'professional', 'computer', 'training', 'language', 'other') NOT NULL DEFAULT 'technical',
  skill_name VARCHAR(150) NOT NULL,
  proficiency_level VARCHAR(60) NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sk_app FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  business_id INT UNSIGNED NOT NULL,
  applicant_user_id INT UNSIGNED NOT NULL,
  document_category ENUM('cv', 'certificate') NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  document_name VARCHAR(200) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_app_docs_app (application_id, is_active),
  CONSTRAINT fk_doc_app FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_user FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_answers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  vacancy_id INT UNSIGNED NOT NULL,
  question_key VARCHAR(100) NOT NULL,
  question_label VARCHAR(255) NOT NULL,
  answer_text TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ans_app FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_ans_vac FOREIGN KEY (vacancy_id) REFERENCES job_vacancies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_status_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  previous_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  changed_by_user_id INT UNSIGNED NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ash_app FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_ash_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_interviews (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  business_id INT UNSIGNED NOT NULL,
  vacancy_id INT UNSIGNED NOT NULL,
  scheduled_by_user_id INT UNSIGNED NOT NULL,
  interview_date VARCHAR(20) NOT NULL,
  interview_time VARCHAR(20) NOT NULL,
  interview_mode VARCHAR(60) NOT NULL DEFAULT 'In-person',
  location_or_link VARCHAR(300) NULL,
  interviewer_name VARCHAR(150) NULL,
  instructions TEXT NULL,
  feedback TEXT NULL,
  outcome ENUM('pending', 'passed', 'failed', 'no_show', 'rescheduled') NOT NULL DEFAULT 'pending',
  status ENUM('scheduled', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_app_int (application_id, business_id),
  CONSTRAINT fk_int_app FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_int_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_int_vac FOREIGN KEY (vacancy_id) REFERENCES job_vacancies(id) ON DELETE CASCADE,
  CONSTRAINT fk_int_user FOREIGN KEY (scheduled_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recruitment_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  business_id INT UNSIGNED NOT NULL,
  author_user_id INT UNSIGNED NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rn_app (application_id, business_id),
  CONSTRAINT fk_rn_app FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_rn_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_rn_user FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
