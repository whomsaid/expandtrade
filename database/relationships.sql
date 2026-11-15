-- BizFlow Africa - Entity Relationships & Tenant Isolation Verification Queries
-- Every tenant-owned entity references businesses(id) via business_id.
-- Branch-scoped operational tables additionally reference branches(id) via branch_id.

-- 1. Core Tenant Hierarchy:
--    users (1) <---> (N) business_members (N) <---> (1) businesses
--    businesses (1) ---> (N) branches
--    business_members (N) ---> (1) roles ---> (N) role_permissions ---> (1) permissions
--    business_members (1) ---> (N) member_permissions (per-user overrides)

-- 2. Inventory Integrity Hierarchy:
--    products (N) ---> (1) businesses
--    inventory (unique: business_id + branch_id + product_id)
--    stock_movements (audit trail: previous_quantity, quantity_change, new_quantity, related_type, related_id)

-- 3. Financial Integrity Hierarchy:
--    sales ---> sale_items (captures unit_cost at sale time for accurate COGS & Gross Profit)
--    sales ---> payments (supports partial, split, cash, MTN MoMo, Airtel Money, bank, card)
--    sales ---> receipts (immutable JSON snapshot for printing/reprinting)
--    sales ---> refunds ---> refund_items (never deletes completed financial records)

-- Verify Foreign Key Graph in MySQL:
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, COLUMN_NAME;
