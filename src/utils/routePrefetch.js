const prefetchedKeys = new Set();

const ROUTE_LOADERS = [
  ['/app/dashboard', () => import('../modules/dashboard/DashboardPage.jsx')],
  ['/app/products', () => import('../modules/products/ProductsPage.jsx')],
  ['/app/inventory', () => import('../modules/inventory/InventoryPage.jsx')],
  ['/app/pos', () => import('../modules/pos/PosPage.jsx')],
  ['/app/sales', () => import('../modules/sales/SalesPage.jsx')],
  ['/app/orders', () => import('../modules/orders/OrdersPage.jsx')],
  ['/app/customers', () => import('../modules/customers/CustomersPage.jsx')],
  ['/app/suppliers', () => import('../modules/suppliers/SuppliersPage.jsx')],
  ['/app/purchases', () => import('../modules/purchases/PurchasesPage.jsx')],
  ['/app/finance', () => import('../modules/finance/FinancePage.jsx')],
  ['/app/payroll', () => import('../modules/payroll/PayrollPage.jsx')],
  ['/app/my-payroll', () => import('../modules/payroll/MyPayrollPage.jsx')],
  ['/app/employees', () => import('../modules/employees/EmployeesPage.jsx')],
  ['/app/recruitment', () => import('../modules/recruitment/RecruitmentPage.jsx')],
  ['/app/branches', () => import('../modules/branches/BranchesPage.jsx')],
  ['/app/ads', () => import('../modules/ads/AdvertisementsPage.jsx')],
  ['/app/onboarding', () => import('../modules/onboarding/BusinessOnboardingPage.jsx')],
  ['/app/tasks', () => import('../modules/tasks/TasksPage.jsx')],
  ['/app/reports', () => import('../modules/reports/ReportsPage.jsx')],
  ['/app/ai', () => import('../modules/ai/AiAssistantPage.jsx')],
  ['/app/notifications', () => import('../modules/notifications/NotificationsPage.jsx')],
  ['/app/settings', () => import('../modules/settings/SettingsPage.jsx')],
  ['/app/admin', () => import('../modules/admin/SuperAdminPage.jsx')],
  ['/customer', () => import('../modules/customer/CustomerPortalPage.jsx')],
  ['/businesses', () => import('../pages/PublicPages.jsx')],
  ['/about', () => import('../pages/PublicPages.jsx')],
  ['/features', () => import('../pages/PublicPages.jsx')],
  ['/pricing', () => import('../pages/PublicPages.jsx')],
  ['/contact', () => import('../pages/PublicPages.jsx')],
  ['/track-order', () => import('../pages/PublicPages.jsx')],
  ['/terms', () => import('../pages/PublicPages.jsx')],
  ['/privacy', () => import('../pages/PublicPages.jsx')],
  ['/jobs', () => import('../pages/JobsPages.jsx')],
  ['/login', () => import('../pages/AuthPages.jsx')],
  ['/register', () => import('../pages/AuthPages.jsx')],
];

export function prefetchRoute(to) {
  if (!to || typeof to !== 'string') return;
  const pathOnly = to.split('?')[0].split('#')[0];
  for (const [prefix, loader] of ROUTE_LOADERS) {
    if (pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)) {
      if (prefetchedKeys.has(prefix)) return;
      prefetchedKeys.add(prefix);
      loader().catch(() => {
        prefetchedKeys.delete(prefix);
      });
      return;
    }
  }
}
