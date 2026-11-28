import { Component, Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { PlatformConfigProvider, usePlatformConfig } from './context/PlatformConfigContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import GlobalWatermark from './components/GlobalWatermark.jsx';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal.jsx';
import RouteSeoManager from './components/RouteSeoManager.jsx';
import QuickSearchModal from './components/QuickSearchModal.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import { scheduleIdleTask, warmupCoreRoutes } from './utils/routePrefetch.js';
const HomePage = lazy(() => import('./pages/PublicPages.jsx').then((m) => ({ default: m.HomePage })));
const AboutPage = lazy(() => import('./pages/PublicPages.jsx').then((m) => ({ default: m.AboutPage })));
const FeaturesPage = lazy(() => import('./pages/PublicPages.jsx').then((m) => ({ default: m.FeaturesPage })));
const PricingPage = lazy(() => import('./pages/PublicPages.jsx').then((m) => ({ default: m.PricingPage })));
const ContactPage = lazy(() => import('./pages/PublicPages.jsx').then((m) => ({ default: m.ContactPage })));
const LegalPage = lazy(() => import('./pages/PublicPages.jsx').then((m) => ({ default: m.LegalPage })));
const PublicBusinessesPage = lazy(() => import('./pages/PublicPages.jsx').then((m) => ({ default: m.PublicBusinessesPage })));
const PublicBusinessDetailPage = lazy(() => import('./pages/PublicPages.jsx').then((m) => ({ default: m.PublicBusinessDetailPage })));
const TrackOrderPage = lazy(() => import('./pages/PublicPages.jsx').then((m) => ({ default: m.TrackOrderPage })));
const PublicJobsPage = lazy(() => import('./pages/JobsPages.jsx').then((m) => ({ default: m.PublicJobsPage })));
const PublicJobDetailPage = lazy(() => import('./pages/JobsPages.jsx').then((m) => ({ default: m.PublicJobDetailPage })));
const LoginPage = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.RegisterPage })));
const ActivateAccountPage = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.ActivateAccountPage })));
const CompleteProfilePage = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.CompleteProfilePage })));
const ForceChangePasswordPage = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.ForceChangePasswordPage })));
const ForgotPasswordPage = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.ForgotPasswordPage })));
const BusinessOnboardingPage = lazy(() => import('./modules/onboarding/BusinessOnboardingPage.jsx'));

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

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center space-y-4">
            <h1 className="text-lg font-bold text-[#0B192C] dark:text-white">BizTrade Africa</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              A temporary display error occurred while loading this page.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthLoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950" aria-busy="true" aria-label={t('common.loading')}>
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between">
        <div className="h-5 w-32 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-7 w-24 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
      <div className="max-w-7xl w-full mx-auto px-6 py-10 space-y-6">
        <div className="h-8 w-64 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
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

// Customers are strictly blocked from /app/* business administration routes;
// Business Admins must complete required guided onboarding before accessing operational tools.
function BusinessProtectedRoute({ children }) {
  const { user, memberships, activeBusinessId, workspace, workspaceLoading, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-temporary-password" replace />;
  if (!user.is_platform_admin && (!memberships || memberships.length === 0)) {
    return <Navigate to="/customer" replace />;
  }
  if (memberships?.length > 0 && (!activeBusinessId || workspaceLoading)) {
    return <AuthLoadingScreen />;
  }

  const isBizAdmin = ['business_admin', 'business_owner'].includes(workspace?.membership?.role_code);
  const setupRequired = Boolean(
    workspace?.business &&
      Number(workspace.business.setup_completed) === 0 &&
      !user.is_platform_admin &&
      isBizAdmin
  );
  const allowedDuringSetup = ['/app/onboarding', '/app/settings', '/app/notifications'];
  if (setupRequired && !allowedDuringSetup.some((p) => location.pathname.startsWith(p))) {
    return <Navigate to="/app/onboarding" replace />;
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

function AppShell({ searchOpen, setSearchOpen }) {
  const { t } = useTranslation();
  const { user, memberships, loading } = useAuth();
  const { config, isDevelopmentMode, isMaintenanceMode } = usePlatformConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const inWorkspace = location.pathname.startsWith('/app') && Boolean(user);

  const triggerGlobalSearch = useCallback(() => {
    setShortcutsOpen(false);
    const hasInlineBar = Boolean(document.querySelector('[data-global-search-input="true"]'));
    if (hasInlineBar) {
      window.dispatchEvent(new CustomEvent('biztrade:focus-global-search'));
    } else {
      setSearchOpen((prev) => !prev);
    }
  }, [setSearchOpen]);

  const triggerNewItem = useCallback(() => {
    setShortcutsOpen(false);
    setSearchOpen(false);
    const ev = new CustomEvent('biztrade:new-item', { cancelable: true });
    const notCanceled = window.dispatchEvent(ev);
    if (!notCanceled) return;

    const newBtn = document.querySelector('[data-shortcut-new="true"]');
    if (newBtn instanceof HTMLElement) {
      newBtn.click();
      return;
    }

    if (user && (user.is_platform_admin || memberships?.length > 0)) {
      navigate('/app/products?new=1');
    } else if (user) {
      navigate('/customer?tab=businesses');
    } else {
      navigate('/register');
    }
  }, [user, memberships, navigate, setSearchOpen]);

  const triggerHome = useCallback(() => {
    setShortcutsOpen(false);
    setSearchOpen(false);
    if (user?.is_platform_admin) {
      navigate('/app/admin');
    } else if (inWorkspace || (user && memberships?.length > 0)) {
      navigate('/app/dashboard');
    } else if (user) {
      navigate('/customer');
    } else {
      navigate('/');
    }
  }, [user, memberships, inWorkspace, navigate, setSearchOpen]);

  useEffect(() => {
    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.isContentEditable);
    };

    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        triggerGlobalSearch();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(document.activeElement)) {
        return;
      }

      const key = e.key.toLowerCase();
      if (e.key === '/' || e.key === '?') {
        e.preventDefault();
        setSearchOpen(false);
        setShortcutsOpen((prev) => !prev);
      } else if (key === 's') {
        e.preventDefault();
        triggerGlobalSearch();
      } else if (key === 'n') {
        e.preventDefault();
        triggerNewItem();
      } else if (key === 'h') {
        e.preventDefault();
        triggerHome();
      }
    };

    const onOpenSearch = () => triggerGlobalSearch();
    const onOpenShortcuts = () => {
      setSearchOpen(false);
      setShortcutsOpen(true);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('biztrade:open-search', onOpenSearch);
    window.addEventListener('biztrade:open-shortcuts', onOpenShortcuts);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('biztrade:open-search', onOpenSearch);
      window.removeEventListener('biztrade:open-shortcuts', onOpenShortcuts);
    };
  }, [triggerGlobalSearch, triggerNewItem, triggerHome, setSearchOpen]);

  useEffect(() => {
    if (loading) return undefined;
    const cancel = scheduleIdleTask(() => {
      warmupCoreRoutes(Boolean(user));
    }, 1200);
    return cancel;
  }, [loading, user]);

  const isAppWorkspaceRoute = location.pathname.startsWith('/app');
  const isLoginOrAdminRoute =
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/app/admin') ||
    location.pathname.startsWith('/forgot-password');

  if (!loading && isMaintenanceMode && !user?.is_platform_admin && !isLoginOrAdminRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-4 shadow-sm animate-page-enter">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {t('system.maintenanceBadge', { defaultValue: 'Scheduled System Maintenance' })}
          </div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">
            {config.platform_name || 'BizTrade Africa'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {config.maintenance_message || t('system.maintenanceDefaultMsg', { defaultValue: 'We are currently performing scheduled upgrades to improve performance and reliability. Please check back shortly.' })}
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors"
            >
              {t('common.retry')}
            </button>
            <a
              href="/login"
              className="btn-auth-login-live inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <span>{t('nav.signIn')}</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <RouteSeoManager />
      <QuickSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        onTriggerNewItem={triggerNewItem}
        onTriggerSearch={triggerGlobalSearch}
        onTriggerHome={triggerHome}
        inWorkspace={inWorkspace}
      />
      <GlobalWatermark />
      {user?.is_platform_admin && isDevelopmentMode && (
        <div className="bg-amber-500 text-slate-950 text-xs font-semibold px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 no-print">
          <span>
            {t('system.devModeBannerTitle', { defaultValue: 'Development Mode ON:' })}{' '}
            {config.development_banner_message || t('system.devModeBannerDefault', { defaultValue: 'Staging and system feature controls are active for Super Admin testing.' })}
          </span>
          <a
            href="/app/admin"
            className="px-2.5 py-0.5 rounded bg-slate-950 text-amber-300 hover:bg-slate-900 transition-colors"
          >
            {t('system.manageDevModeBtn', { defaultValue: 'Manage / Confirm Release' })}
          </a>
        </div>
      )}
      <AppErrorBoundary>
        <Suspense fallback={<AuthLoadingScreen />}>
          <div key={isAppWorkspaceRoute ? 'app-shell' : location.pathname} className={isAppWorkspaceRoute ? '' : 'animate-page-enter'}>
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
                <Route path="onboarding" element={<BusinessOnboardingPage />} />
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
          </div>
        </Suspense>
      </AppErrorBoundary>
    </>
  );
}

export default function App() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <AuthProvider>
      <ThemeProvider>
        <PlatformConfigProvider>
          <BrowserRouter>
            <AppShell searchOpen={searchOpen} setSearchOpen={setSearchOpen} />
          </BrowserRouter>
        </PlatformConfigProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
