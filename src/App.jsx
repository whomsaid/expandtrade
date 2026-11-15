import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { PlatformConfigProvider } from './context/PlatformConfigContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
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
import {
  ActivateAccountPage,
  CompleteProfilePage,
  ForceChangePasswordPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
} from './pages/AuthPages.jsx';
import CustomerPortalPage from './modules/customer/CustomerPortalPage.jsx';
import DashboardPage from './modules/dashboard/DashboardPage.jsx';
import ProductsPage from './modules/products/ProductsPage.jsx';
import InventoryPage from './modules/inventory/InventoryPage.jsx';
import PosPage from './modules/pos/PosPage.jsx';
import SalesPage from './modules/sales/SalesPage.jsx';
import OrdersPage from './modules/orders/OrdersPage.jsx';
import CustomersPage from './modules/customers/CustomersPage.jsx';
import SuppliersPage from './modules/suppliers/SuppliersPage.jsx';
import PurchasesPage from './modules/purchases/PurchasesPage.jsx';
import FinancePage from './modules/finance/FinancePage.jsx';
import EmployeesPage from './modules/employees/EmployeesPage.jsx';
import BranchesPage from './modules/branches/BranchesPage.jsx';
import TasksPage from './modules/tasks/TasksPage.jsx';
import ReportsPage from './modules/reports/ReportsPage.jsx';
import AiAssistantPage from './modules/ai/AiAssistantPage.jsx';
import NotificationsPage from './modules/notifications/NotificationsPage.jsx';
import SettingsPage from './modules/settings/SettingsPage.jsx';
import SuperAdminPage from './modules/admin/SuperAdminPage.jsx';
import AdvertisementsPage from './modules/ads/AdvertisementsPage.jsx';

function AuthLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500 dark:text-slate-400">
      Loading BizFlow Africa...
    </div>
  );
}

function ForcePasswordChangeProtectedRoute({ children }) {
  const { user, memberships, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.must_change_password) {
    if (!user.avatar_url) return <Navigate to="/complete-profile" replace />;
    if (user.is_platform_admin) return <Navigate to="/app/admin" replace />;
    if (memberships?.length > 0) return <Navigate to="/app/dashboard" replace />;
    return <Navigate to="/customer" replace />;
  }
  return children;
}

function CompleteProfileProtectedRoute({ children }) {
  const { user, memberships, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-temporary-password" replace />;
  if (user.avatar_url) {
    if (user.is_platform_admin) return <Navigate to="/app/admin" replace />;
    if (memberships?.length > 0) return <Navigate to="/app/dashboard" replace />;
    return <Navigate to="/customer" replace />;
  }
  return children;
}

// Customers are strictly blocked from /app/* business administration routes
function BusinessProtectedRoute({ children }) {
  const { user, memberships, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-temporary-password" replace />;
  if (!user.avatar_url) return <Navigate to="/complete-profile" replace />;
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
  if (!user.avatar_url) return <Navigate to="/complete-profile" replace />;
  if (!user.is_platform_admin) return <Navigate to="/app/dashboard" replace />;
  return children;
}

// Customer Portal guard
function CustomerProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-temporary-password" replace />;
  if (!user.avatar_url) return <Navigate to="/complete-profile" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <PlatformConfigProvider>
          <BrowserRouter>
            <Routes>
          {/* Public Website Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/businesses" element={<PublicBusinessesPage />} />
          <Route path="/businesses/:slug" element={<PublicBusinessDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/track-order" element={<TrackOrderPage />} />
          <Route path="/terms" element={<LegalPage title="Terms of Service" />} />
          <Route path="/privacy" element={<LegalPage title="Privacy Policy" />} />
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
            <Route path="employees" element={<EmployeesPage />} />
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
          </BrowserRouter>
        </PlatformConfigProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
