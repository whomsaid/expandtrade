-- BizTrade Africa - Development Seed Data (Rwanda-First Multi-Tenant SaaS)
-- Note: For development & QA verification only.

INSERT INTO subscription_plans (code, name, target_audience, monthly_price_rwf, annual_price_rwf, max_employees, max_branches, max_products, max_storage_mb, max_ai_requests_monthly, advanced_reports_enabled, integrations_enabled)
VALUES
  ('free', 'Free Starter', 'Solo micro-merchants testing digital operations', 0.00, 0.00, 3, 1, 100, 250, 25, 0, 0),
  ('starter', 'Starter', 'Growing single-shop retailers and pharmacies', 25000.00, 250000.00, 10, 2, 1000, 2048, 150, 1, 0),
  ('business', 'Business', 'Multi-branch supermarkets, hardware & wholesale distributors', 65000.00, 650000.00, 35, 10, 10000, 10240, 1000, 1, 1),
  ('enterprise', 'Enterprise', 'Regional retail chains & multi-country groups', 180000.00, 1800000.00, 250, 100, 100000, 102400, 10000, 1, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO roles (code, name, description) VALUES
  ('business_owner', 'Business Owner', 'Full authority over business profile, branches, finance, employees, and billing'),
  ('business_admin', 'Business Admin', 'Operational administration across assigned modules'),
  ('manager', 'Manager', 'Manages assigned branches, staff, stock transfers, approvals, and orders'),
  ('accountant', 'Accountant', 'Manages income, expenses, supplier payables, receivables, and financial reports'),
  ('cashier', 'Cashier', 'Processes POS sales, payments, and receipts'),
  ('salesperson', 'Salesperson', 'Manages customers, quotes, and orders'),
  ('inventory_manager', 'Inventory Manager', 'Manages products, stock adjustments, transfers, and supplier receiving'),
  ('customer', 'Customer', 'External buyer viewing orders, deliveries, and receipts')
ON DUPLICATE KEY UPDATE name = VALUES(name);
