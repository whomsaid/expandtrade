import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { PlatformConfigProvider } from './context/PlatformConfigContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import GlobalWatermark from './components/GlobalWatermark.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import {
  AboutPage,
  ContactPage,
  FeaturesPage,
  HomePage,
  LegalPage,
  PricingPage,
  PublicBusinessDetailPage,
  PublicBusinessesPage,
  TrackOrderPage,
} from './pages/PublicPages.jsx';
import { PublicJobDetailPage, PublicJobsPage } from './pages/JobsPages.jsx';
import {
  ActivateAccountPage,
  CompleteProfilePage,
  ForceChangePasswordPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
} from './pages/AuthPages.jsx';

const CustomerPortalPage = lazy(() => import('./modules/customer/CustomerPortalPage.jsx'));
const JobApplicationFormPage = lazy(() => import('./modules/customer/JobApplicationFormPage.jsx'));
const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage.jsx'));
const ProductsPage = lazy(() => import('./modules/products/ProductsPage.jsx'));
const InventoryPage = lazy(() => import('./modules/inventory/InventoryPage.jsx'));
const PosPage = lazy(() => import('./modules/pos/PosPage.jsx'));
const SalesPage = lazy(() => import('./modules/sales/SalesPage.jsx'));
const OrdersPage = lazy(() => import('./modules/orders/OrdersPage.jsx'));
const CustomersPage = lazy(() => import('./modules/customers/CustomersPage.jsx'));
const SuppliersPage = lazy(() => import('./modules/suppliers/SuppliersPage.jsx'));
const PurchasesPage = lazy(() => import('./modules/purchases/PurchasesPage.jsx'));
const FinancePage = lazy(() => import('./modules/finance/FinancePage.jsx'));
const PayrollPage = lazy(() => import('./modules/payroll/PayrollPage.jsx'));
const MyPayrollPage = lazy(() => import('./modules/payroll/MyPayrollPage.jsx'));
const EmployeesPage = lazy(() => import('./modules/employees/EmployeesPage.jsx'));
const BranchesPage = lazy(() => import('./modules/branches/BranchesPage.jsx'));
const TasksPage = lazy(() => import('./modules/tasks/TasksPage.jsx'));
const ReportsPage = lazy(() => import('./modules/reports/ReportsPage.jsx'));
const AiAssistantPage = lazy(() => import('./modules/ai/AiAssistantPage.jsx'));
const NotificationsPage = lazy(() => import('./modules/notifications/NotificationsPage.jsx'));
const SettingsPage = lazy(() => import('./modules/settings/SettingsPage.jsx'));
const SuperAdminPage = lazy(() => import('./modules/admin/SuperAdminPage.jsx'));
const AdvertisementsPage = lazy(() => import('./modules/ads/AdvertisementsPage.jsx'));
const RecruitmentPage = lazy(() => import('./modules/recruitment/RecruitmentPage.jsx'));

function AuthLoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500 dark:text-slate-400">
      {t('common.loading')}
    </div>
  );
}

function ForcePasswordChangeProtectedRoute({ children }) {
  const { user, memberships, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.must_change_password) {
    if (user.is_platform_admin) return <Navigate to="/app/admin" replace />;
    if (memberships?.length > 0) return <Navigate to="/app/dashboard" replace />;
    return <Navigate to="/customer" replace />;
  }
  return children;
}

function CompleteProfileProtectedRoute() {
  const { user, memberships, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-temporary-password" replace />;
  if (user.is_platform_admin) return <Navigate to="/app/admin" replace />;
  if (memberships?.length > 0) return <Navigate to="/app/dashboard" replace />;
  return <Navigate to="/customer" replace />;
}

// Customers are strictly blocked from /app/* business administration routes
function BusinessProtectedRoute({ children }) {
  const { user, memberships, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-temporary-password" replace />;
  if (!user.is_platform_admin && (!memberships || memberships.length === 0)) {
    return <Navigate to="/customer" replace />;
  }
  return children;
}

// Super Admin route guard
function SuperAdminProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-temporary-password" replace />;
  if (!user.is_platform_admin) return <Navigate to="/app/dashboard" replace />;
  return children;
}

// Customer Portal guard
function CustomerProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoadingScreen />;
  const redirectParam = `?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
  if (!user) return <Navigate to={`/login${redirectParam}`} replace />;
  if (user.must_change_password) return <Navigate to={`/change-temporary-password${redirectParam}`} replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <PlatformConfigProvider>
          <BrowserRouter>
            <GlobalWatermark />
            <Suspense fallback={<AuthLoadingScreen />}>
              <Routes>
                {/* Public Website Routes */}
                <Route path="/" element={<HomePage />} />
                <Route path="/businesses" element={<PublicBusinessesPage />} />
                <Route path="/businesses/:slug" element={<PublicBusinessDetailPage />} />
                <Route path="/jobs" element={<PublicJobsPage />} />
                <Route path="/jobs/:id" element={<PublicJobDetailPage />} />
                <Route
                  path="/jobs/:id/apply"
                  element={
                    <CustomerProtectedRoute>
                      <JobApplicationFormPage />
                    </CustomerProtectedRoute>
                  }
                />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/features" element={<FeaturesPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/track-order" element={<TrackOrderPage />} />
                <Route path="/terms" element={<LegalPage type="terms" />} />
                <Route path="/privacy" element={<LegalPage type="privacy" />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/activate-account" element={<ActivateAccountPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route
                  path="/change-temporary-password"
                  element={
                    <ForcePasswordChangeProtectedRoute>
                      <ForceChangePasswordPage />
                    </ForcePasswordChangeProtectedRoute>
                  }
                />
                <Route
                  path="/complete-profile"
                  element={
                    <CompleteProfileProtectedRoute>
                      <CompleteProfilePage />
                    </CompleteProfileProtectedRoute>
                  }
                />

                {/* Customer Portal */}
                <Route
                  path="/customer"
                  element={
                    <CustomerProtectedRoute>
                      <CustomerPortalPage />
                    </CustomerProtectedRoute>
                  }
                />

                {/* Authenticated Business & Super Admin SaaS Workspace Routes */}
                <Route
                  path="/app"
                  element={
                    <BusinessProtectedRoute>
                      <AppLayout />
                    </BusinessProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="inventory" element={<InventoryPage />} />
                  <Route path="pos" element={<PosPage />} />
                  <Route path="sales" element={<SalesPage />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="customers" element={<CustomersPage />} />
                  <Route path="suppliers" element={<SuppliersPage />} />
                  <Route path="purchases" element={<PurchasesPage />} />
                  <Route path="finance" element={<FinancePage />} />
                  <Route path="payroll" element={<PayrollPage />} />
                  <Route path="my-payroll" element={<MyPayrollPage />} />
                  <Route path="employees" element={<EmployeesPage />} />
                  <Route path="recruitment" element={<RecruitmentPage />} />
                  <Route path="branches" element={<BranchesPage />} />
                  <Route path="ads" element={<AdvertisementsPage />} />
                  <Route path="tasks" element={<TasksPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="ai" element={<AiAssistantPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route
                    path="admin"
                    element={
                      <SuperAdminProtectedRoute>
                        <SuperAdminPage />
                      </SuperAdminProtectedRoute>
                    }
                  />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </PlatformConfigProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
