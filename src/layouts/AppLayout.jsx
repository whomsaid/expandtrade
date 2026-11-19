import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Banknote,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Users,
  Video,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageSelector from '../components/LanguageSelector.jsx';
import LogoutConfirmModal from '../components/LogoutConfirmModal.jsx';
import ThemeSelector from '../components/ThemeSelector.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { api } from '../services/api.js';

export default function AppLayout() {
  const { t } = useTranslation();
  const {
    user,
    memberships,
    activeBusinessId,
    activeBranchId,
    workspace,
    notifications,
    logout,
    switchBusiness,
    switchBranch,
    hasPermission,
    refreshNotifications,
  } = useAuth();

  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const navItems = [
    { to: '/app/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, perm: 'dashboard.view' },
    { to: '/app/pos', label: t('nav.pos'), icon: ShoppingCart, perm: 'pos.sell' },
    { to: '/app/products', label: t('nav.products'), icon: Package, perm: 'products.view' },
    { to: '/app/inventory', label: t('nav.inventory'), icon: Boxes, perm: 'inventory.view' },
    { to: '/app/sales', label: t('nav.sales'), icon: Receipt, perm: 'sales.view' },
    { to: '/app/orders', label: t('nav.orders'), icon: ShoppingBag, perm: 'orders.view' },
    { to: '/app/customers', label: t('nav.customers'), icon: Users, perm: 'customers.view' },
    { to: '/app/suppliers', label: t('nav.suppliers'), icon: Truck, perm: 'suppliers.view' },
    { to: '/app/purchases', label: t('nav.purchases'), icon: CreditCard, perm: 'purchases.view' },
    { to: '/app/finance', label: t('nav.finance'), icon: Wallet, perm: 'finance.view' },
    { to: '/app/payroll', label: t('nav.payroll'), icon: Banknote, perm: 'payroll.view' },
    { to: '/app/my-payroll', label: t('nav.myPayroll'), icon: BarChart3, perm: null, requiresMember: true },
    { to: '/app/employees', label: t('nav.employees'), icon: Users, perm: 'employees.view' },
    { to: '/app/recruitment', label: t('nav.recruitment'), icon: Briefcase, perm: 'recruitment.view' },
    { to: '/app/branches', label: t('nav.branches'), icon: GitBranch, perm: 'branches.view' },
    { to: '/app/ads', label: t('nav.ads'), icon: Video, perm: 'ads.view' },
    { to: '/app/tasks', label: t('nav.tasks'), icon: ClipboardList, perm: 'tasks.view' },
    { to: '/app/reports', label: t('nav.reports'), icon: FileSpreadsheet, perm: 'reports.view' },
    { to: '/app/ai', label: t('nav.ai'), icon: Bot, perm: 'ai.use' },
    { to: '/app/notifications', label: t('nav.notifications'), icon: Bell, perm: null },
    { to: '/app/settings', label: t('nav.settings'), icon: Settings, perm: null },
  ];

  const visibleNav = navItems.filter((item) => {
    if (item.requiresMember && memberships.length === 0) return false;
    return !item.perm || hasPermission(item.perm);
  });

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      await refreshNotifications();
    } catch {
      // ignore notification sync failures in header dropdown
    }
  };

  const handleConfirmLogout = async () => {
    await logout();
    setLogoutConfirmOpen(false);
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 dark:bg-black/70 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0B192C] text-slate-200 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 no-print ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <Link to="/app/dashboard" className="text-lg font-bold tracking-tight text-white whitespace-nowrap min-w-0">
            <BrandLogo textClassName="text-lg font-bold tracking-tight text-white truncate" imgClassName="h-7 w-auto max-w-[120px] object-contain shrink-0" />
          </Link>
          <button
            type="button"
            className="lg:hidden p-1 text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
            aria-label={t('nav.closeNav')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}

          {Boolean(user?.is_platform_admin) && (
            <div className="pt-3 mt-3 border-t border-slate-800">
              <NavLink
                to="/app/admin"
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-amber-300 hover:bg-slate-800/70 hover:text-white'
                  }`
                }
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{t('nav.admin')}</span>
              </NavLink>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-800 space-y-2">
          <div className="sm:hidden flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <LanguageSelector compact />
            <ThemeSelector compact />
          </div>
          <button
            type="button"
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('nav.signOut')}</span>
          </button>
          <div className="px-3 text-[11px] text-slate-500">
            {t('common.developedBy')} <span className="font-semibold text-slate-400">softworld</span>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 lg:px-6 py-3 flex items-center justify-between gap-2 sm:gap-4 no-print">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
              aria-label={t('nav.openMenu')}
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Business Switcher */}
            {memberships.length > 0 && (
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
                <select
                  aria-label={t('nav.switchBusiness')}
                  value={activeBusinessId || ''}
                  onChange={(e) => switchBusiness(e.target.value)}
                  className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 sm:px-2.5 py-1.5 min-w-0 max-w-[125px] sm:max-w-[200px] truncate"
                >
                  {memberships.map((m) => (
                    <option key={m.business_id} value={m.business_id}>
                      {m.business_name} ({m.role_name})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Branch Selector */}
            {workspace?.branches?.length > 0 && (
              <select
                aria-label={t('nav.selectBranch')}
                value={activeBranchId || ''}
                onChange={(e) => switchBranch(e.target.value)}
                className="text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 sm:px-2.5 py-1.5 min-w-0 max-w-[95px] sm:max-w-[160px] truncate"
              >
                {workspace.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="hidden sm:flex items-center gap-2">
              <LanguageSelector compact />
              <ThemeSelector compact />
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700"
                aria-label={t('nav.notifications')}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 text-[10px] font-bold text-white bg-sky-600 rounded-full tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="animate-slide-down absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-sm sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-50">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/70">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{t('nav.notifications')}</span>
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
                    >
                      {t('nav.markAllRead')}
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">{t('nav.noNotifications')}</div>
                    ) : (
                      notifications.slice(0, 8).map((n) => (
                        <div key={n.id} className={`p-3 text-xs ${n.is_read ? 'bg-white dark:bg-slate-900' : 'bg-sky-50/50 dark:bg-sky-950/40'}`}>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{n.title}</div>
                          <div className="text-slate-600 dark:text-slate-300 mt-0.5">{n.message}</div>
                          {n.related_url && (
                            <Link
                              to={n.related_url}
                              onClick={() => setNotifOpen(false)}
                              className="inline-block mt-1 text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:underline"
                            >
                              {t('common.open')} →
                            </Link>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <Link
                    to="/app/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="block text-center py-2 text-xs font-medium text-sky-700 dark:text-sky-400 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {t('nav.viewAllNotifications')}
                  </Link>
                </div>
              )}
            </div>

            <Link to="/app/settings" className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-slate-200 dark:border-slate-700 hover:opacity-85">
              <div className="text-right">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">{user?.full_name}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  {workspace?.membership?.role_name || (user?.is_platform_admin ? t('nav.superAdminRole') : t('nav.member'))}
                </div>
              </div>
              <UserAvatar src={user?.avatar_url} name={user?.full_name} size="sm" />
            </Link>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 max-w-[1440px] w-full mx-auto min-w-0">
          <Outlet />
        </main>
      </div>

      <LogoutConfirmModal
        open={logoutConfirmOpen}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
}
