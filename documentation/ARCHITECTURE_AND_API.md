# BizFlow Africa — Architecture, Database & API Reference

## 1. Multi-Tenant & RBAC Architecture

### Tenant Isolation Model
1. A user authenticates via `/api/auth/login` and receives a signed JWT containing `{ sub, jti, email, is_platform_admin }`.
2. Every request to `/api/*` checks `user_sessions.is_revoked` against `token_jti`.
3. Every business-scoped route enforces `requireBusiness`, validating `x-business-id` against `business_members` where `status = 'active'`.
4. Branch scoping checks `x-branch-id` against `branches` belonging to `req.businessId`; users without `all_branches_access` are pinned to `assigned_branch_id`.
5. `requirePermission(permKey)` resolves base `role_permissions` merged with `member_permissions` overrides (`is_allowed = 1 | 0`).

### 8 Pre-Configured Roles
- `owner` (Full business access)
- `general_manager`
- `branch_manager`
- `accountant`
- `inventory_manager`
- `cashier`
- `sales_staff`
- `staff`

---

## 2. Database Schema Summary

Normalized 3NF schema across 38 tables in `/database/schema.sql`:
- **Identity & Auth**: `users`, `user_sessions`, `email_verifications`, `password_resets`, `login_attempts`, `platform_admins`
- **Multi-Tenancy & RBAC**: `businesses`, `business_settings`, `branches`, `roles`, `permissions`, `role_permissions`, `business_members`, `member_permissions`, `invitations`
- **Subscriptions & Support**: `subscription_plans`, `subscriptions`, `subscription_payments`, `support_tickets`
- **Catalog & Inventory**: `categories`, `products`, `inventory`, `stock_movements`, `stock_transfers`, `stock_transfer_items`
- **POS, Sales & Orders**: `sales`, `sale_items`, `payments`, `refunds`, `receipts`, `orders`, `order_items`, `order_status_history`
- **CRM & Procurement**: `customers`, `customer_notes`, `suppliers`, `purchase_orders`, `purchase_items`, `supplier_payments`
- **Finance**: `expense_categories`, `income`, `expenses`, `expense_approvals`
- **Collaboration & Audit**: `tasks`, `task_comments`, `announcements`, `messages`, `notifications`, `notification_preferences`, `activity_logs`, `contact_inquiries`

---

## 3. API Endpoint Catalog

### Public & Auth (`/api/public/*`, `/api/auth/*`)
- `GET /api/health` — System health & active database dialect
- `GET /api/subscriptions/plans` — Active SaaS subscription plans
- `GET /api/public/orders/track?order_number=...&phone=...` — Public order status timeline
- `POST /api/public/contact` — Contact form inquiry submission
- `GET /api/auth/verification-channels` — Active verification channels (Email, SMS, WhatsApp)
- `POST /api/auth/register` — Validate full registration, create pending user, return `pending_token` + masked contacts
- `POST /api/auth/registration/send-otp` — Issue 6-digit OTP via Email, SMS, or WhatsApp (supports method switching)
- `POST /api/auth/registration/verify-otp` — Verify 6-digit OTP, activate account, and issue session JWT
- `POST /api/auth/login` — Authenticate & create `user_sessions` record (returns `403 ACCOUNT_VERIFICATION_REQUIRED` if pending)
- `POST /api/auth/logout` — Revoke current JWT session and clear auth cache
- `POST /api/auth/forgot-password` & `POST /api/auth/reset-password`
- `GET /api/auth/me` — Active user, memberships & permissions
- `PATCH /api/auth/profile`, `PATCH /api/auth/whatsapp-consent` & `POST /api/auth/change-password`

### Businesses & Team (`/api/*`)
- `GET /api/businesses`, `POST /api/businesses`, `PUT /api/businesses/current`
- `GET /api/branches`, `POST /api/branches`, `PATCH /api/branches/:id`
- `GET /api/employees`, `POST /api/employees/invite`, `PATCH /api/employees/:id`, `GET /api/roles`
- `GET /api/settings`, `PUT /api/settings`
- `GET /api/subscriptions/current`, `POST /api/subscriptions/subscribe`

### Catalog & Inventory
- `GET /api/categories`, `POST /api/categories`
- `GET /api/products`, `GET /api/products/export/csv`, `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`
- `GET /api/inventory`, `GET /api/stock-movements`
- `POST /api/inventory/adjust`, `POST /api/inventory/transfer`

### POS, Sales, Orders & Customers
- `POST /api/sales` (Atomic transaction + idempotency key + conditional stock decrement)
- `GET /api/sales`, `GET /api/sales/:id`, `GET /api/receipts/:saleId`, `POST /api/sales/:id/payments`, `POST /api/sales/:id/refund`
- `GET /api/orders`, `POST /api/orders`, `PATCH /api/orders/:id/status`
- `GET /api/customers`, `POST /api/customers`, `GET /api/customers/:id`, `POST /api/customers/:id/notes`

### WhatsApp Communication (`/api/whatsapp/*`)
- `GET /api/whatsapp/webhook` — Meta webhook verification challenge
- `POST /api/whatsapp/webhook` — HMAC-SHA256 verified delivery/read/failure statuses, inbound replies & `STOP` opt-out
- `GET /api/whatsapp/status`, `GET /api/whatsapp/messages`, `POST /api/whatsapp/send`, `PATCH /api/whatsapp/consent`

### Procurement, Finance, Tasks, Reports, AI & Admin
- `GET/POST /api/suppliers`, `POST /api/suppliers/:id/pay`
- `GET/POST /api/purchases`, `POST /api/purchases/:id/receive`
- `GET /api/finance/summary`, `GET/POST /api/finance/income`, `GET/POST /api/finance/expenses`, `PATCH /api/finance/expenses/:id/approval`
- `GET/POST /api/tasks`, `PATCH /api/tasks/:id`, `POST /api/tasks/:id/comments`
- `GET/POST /api/announcements`, `GET/POST /api/messages`
- `GET /api/reports/dashboard`, `GET /api/reports/analytics`, `GET /api/reports/audit-logs`
- `POST /api/ai/ask` (Server-side Gemini business insights)
- `GET /api/notifications`, `PATCH /api/notifications/read-all`, `PUT /api/notifications/preferences`
- `GET /api/admin/overview`, `PATCH /api/admin/businesses/:id/status`, `POST /api/support/tickets`, `PATCH /api/admin/tickets/:id`
