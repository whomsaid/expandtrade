import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, ArrowUpRight, Banknote, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { formatDateTime, formatMoney } from '../../utils/format.js';

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user, activeBusinessId, activeBranchId, workspace, socket, hasPermission, savePreferences } = useAuth();
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState(null);
  const [branchFilter, setBranchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const currency = workspace?.business?.currency_code || 'RWF';
  const isDark = resolvedTheme === 'dark';

  const prefs = user?.dashboard_preferences || {};
  const widgets = prefs.widgets || {};
  const isCompact = prefs.density === 'compact';

  const loadDashboard = useCallback(async () => {
    if (!activeBusinessId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/reports/dashboard', {
        params: branchFilter ? { branch_id: branchFilter } : {},
      });
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeBusinessId, activeBranchId, branchFilter]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!socket) return;
    const handler = () => loadDashboard();
    socket.on('sale:created', handler);
    socket.on('inventory:updated', handler);
    socket.on('payroll:updated', handler);
    return () => {
      socket.off('sale:created', handler);
      socket.off('inventory:updated', handler);
      socket.off('payroll:updated', handler);
    };
  }, [socket, loadDashboard]);

  const toggleWidget = async (key) => {
    const nextWidgets = { ...widgets, [key]: widgets[key] === false };
    try {
      await savePreferences({
        dashboard_preferences: {
          ...prefs,
          widgets: nextWidgets,
        },
      });
    } catch {
      // ignore transient toggle error
    }
  };

  const toggleDensity = async () => {
    try {
      await savePreferences({
        dashboard_preferences: {
          ...prefs,
          density: isCompact ? 'comfortable' : 'compact',
        },
      });
    } catch {
      // ignore
    }
  };

  if (!activeBusinessId) {
    return (
      <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('dashboard.noWorkspaceTitle')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('dashboard.noWorkspaceDesc')}
        </p>
        <Link
          to="/app/admin"
          className="inline-flex px-4 py-2 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors"
        >
          {t('dashboard.openSuperAdmin')}
        </Link>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};
  const cardPad = isCompact ? 'p-3.5' : 'p-5';
  const gridGap = isCompact ? 'gap-3' : 'gap-4';

  const quickWidgetControls = [
    ['sales_kpis', t('dashboard.widgetSales')],
    ...(kpis.total_expenses !== null ? [['finance_summary', t('dashboard.widgetFinance')]] : []),
    ...(kpis.payroll ? [['payroll_summary', t('dashboard.widgetPayroll')]] : []),
    ['daily_chart', t('dashboard.widgetDailyChart')],
    ['top_products', t('dashboard.widgetTopProducts')],
    ['branch_performance', t('dashboard.widgetBranchSales')],
    ['audit_activity', t('dashboard.widgetAuditStream')],
  ];

  return (
    <div className={isCompact ? 'space-y-4' : 'space-y-6'}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">
            {workspace?.business?.name || t('dashboard.fallbackTitle')}
          </h1>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
            <span>{workspace?.business?.category}</span>
            <span aria-hidden="true">·</span>
            <span>{workspace?.business?.country}</span>
            <span aria-hidden="true">·</span>
            <span>{t('dashboard.liveMetrics')}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {workspace?.membership?.all_branches_access === 1 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
            >
              <option value="">{t('dashboard.allBranches')}</option>
              {(workspace?.branches || []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setCustomizeOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {t('dashboard.customize')}
          </button>
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('dashboard.refresh')}
          </button>
          {hasPermission('pos.sell') && (
            <Link
              to="/app/pos"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap transition-colors"
            >
              {t('dashboard.openPos')}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {customizeOpen && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-900 dark:text-white">{t('dashboard.visibleWidgets')}</span>
            {quickWidgetControls.map(([k, label]) => (
              <label key={k} className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={widgets[k] !== false}
                  onChange={() => toggleWidget(k)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleDensity}
              className="px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
            >
              {t('dashboard.densityLabel', { mode: isCompact ? t('dashboard.densityCompact') : t('dashboard.densityComfortable') })}
            </button>
            <Link to="/app/settings" className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">
              {t('dashboard.fullPreferences')}
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadDashboard}
            className="px-2.5 py-1 font-semibold bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 rounded hover:bg-rose-100 shrink-0"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className={`grid grid-cols-2 lg:grid-cols-4 ${gridGap}`}>
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-24 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Primary KPI Strip */}
          {widgets.sales_kpis !== false && (
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${gridGap} animate-fade-up`}>
              <div className={`bg-white dark:bg-slate-900 ${cardPad} rounded-xl border border-slate-200 dark:border-slate-800`}>
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.salesToday')}</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                  {formatMoney(kpis.sales_today, currency)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {t('dashboard.completedSalesCount', { count: kpis.sales_today_count || 0 })}
                </div>
              </div>
              <div className={`bg-white dark:bg-slate-900 ${cardPad} rounded-xl border border-slate-200 dark:border-slate-800`}>
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.salesThisMonth')}</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                  {formatMoney(kpis.sales_month, currency)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {t('dashboard.ytdLabel', { amount: formatMoney(kpis.sales_year, currency) })}
                </div>
              </div>
              <div className={`bg-white dark:bg-slate-900 ${cardPad} rounded-xl border border-slate-200 dark:border-slate-800`}>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {kpis.gross_profit !== null ? t('dashboard.netOperatingProfit') : t('dashboard.activeCatalog')}
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                  {kpis.gross_profit !== null
                    ? formatMoney(kpis.net_operating_profit, currency)
                    : t('dashboard.skusCount', { count: kpis.total_products || 0 })}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {kpis.gross_profit !== null
                    ? t('dashboard.grossProfitLabel', { amount: formatMoney(kpis.gross_profit, currency) })
                    : t('dashboard.registeredCustomersCount', { count: kpis.total_customers || 0 })}
                </div>
              </div>
              <div className={`bg-white dark:bg-slate-900 ${cardPad} rounded-xl border border-slate-200 dark:border-slate-800`}>
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.inventoryOrdersAlerts')}</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                  {t('dashboard.alertsCount', { count: (kpis.low_stock_products || 0) + (kpis.out_of_stock_products || 0) })}
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1 tabular-nums">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {t('dashboard.outAndPending', { out: kpis.out_of_stock_products || 0, pending: kpis.pending_orders || 0 })}
                </div>
              </div>
            </div>
          )}

          {/* Payroll Summary Strip (Authorized Payroll Roles) */}
          {kpis.payroll && widgets.payroll_summary !== false && (
            <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">{t('dashboard.payrollOverview')}</div>
                  <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                    {t('dashboard.payrollStats', {
                      employees: kpis.payroll.configured_employees,
                      due: kpis.payroll.due_count,
                      pending: kpis.payroll.pending_count,
                      paid: kpis.payroll.paid_count,
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('dashboard.availableBalance')}</div>
                  <div className="font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatMoney(kpis.payroll.available_balance, currency)}
                  </div>
                </div>
                <Link
                  to="/app/payroll"
                  className="px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                >
                  {t('dashboard.openPayroll')}
                </Link>
              </div>
            </div>
          )}

          {/* Financial Secondary Strip (Authorized roles only) */}
          {kpis.total_expenses !== null && widgets.finance_summary !== false && (
            <div className={`grid grid-cols-2 lg:grid-cols-4 ${gridGap}`}>
              <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.approvedExpenses')}</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{formatMoney(kpis.total_expenses, currency)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.customerReceivables')}</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{formatMoney(kpis.outstanding_customer_balances, currency)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.supplierBalances')}</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{formatMoney(kpis.supplier_balances, currency)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.totalCustomers')}</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{kpis.total_customers || 0}</div>
              </div>
            </div>
          )}

          {/* Charts Row */}
          {(widgets.daily_chart !== false || widgets.top_products !== false) && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {widgets.daily_chart !== false && (
                <div className={`${widgets.top_products !== false ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-slate-900 ${cardPad} rounded-xl border border-slate-200 dark:border-slate-800 space-y-4`}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('dashboard.dailySalesRevenue')}</h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.last14Days')}</span>
                  </div>
                  <div className="h-64">
                    {(charts.daily_sales || []).length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                        {t('dashboard.completeSaleToPopulate')}
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={charts.daily_sales}>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#E2E8F0'} />
                          <XAxis dataKey="day" tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }} />
                          <YAxis tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }} />
                          <Tooltip
                            formatter={(v) => formatMoney(v, currency)}
                            contentStyle={{
                              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                              borderColor: isDark ? '#334155' : '#E2E8F0',
                              color: isDark ? '#F1F5F9' : '#0F172A',
                              borderRadius: '8px',
                              fontSize: '12px',
                            }}
                          />
                          <Bar dataKey="revenue" fill={isDark ? '#38BDF8' : '#0B192C'} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              )}

              {widgets.top_products !== false && (
                <div className={`${widgets.daily_chart !== false ? 'lg:col-span-4' : 'lg:col-span-12'} bg-white dark:bg-slate-900 ${cardPad} rounded-xl border border-slate-200 dark:border-slate-800 space-y-4`}>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('dashboard.bestSellingProducts')}</h2>
                  {(charts.top_products || []).length === 0 ? (
                    <div className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">{t('dashboard.noSalesRecorded')}</div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {charts.top_products.map((p, idx) => (
                        <div key={idx} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{p.product_name}</div>
                            <div className="text-slate-500 dark:text-slate-400 tabular-nums">{t('dashboard.unitsSold', { count: p.qty })}</div>
                          </div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                            {formatMoney(p.revenue, currency)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Branch Performance & Recent Audit Activity */}
          {(widgets.branch_performance !== false || widgets.audit_activity !== false) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {widgets.branch_performance !== false && (
                <div className={`bg-white dark:bg-slate-900 ${cardPad} rounded-xl border border-slate-200 dark:border-slate-800 space-y-3`}>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('dashboard.salesByBranch')}</h2>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(charts.sales_by_branch || []).map((b, idx) => (
                      <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{b.branch_name}</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{formatMoney(b.revenue, currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {widgets.audit_activity !== false && (
                <div className={`bg-white dark:bg-slate-900 ${cardPad} rounded-xl border border-slate-200 dark:border-slate-800 space-y-3`}>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('dashboard.recentAuditActivity')}</h2>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(data?.recentActivities || []).slice(0, 6).map((act) => (
                      <div key={act.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex items-center gap-2">
                          <UserAvatar src={act.user_avatar} name={act.user_name || t('dashboard.systemUser')} size="xs" />
                          <div className="min-w-0 truncate">
                            <span className="font-medium text-slate-900 dark:text-slate-100">{act.action}</span>
                            <span className="text-slate-500 dark:text-slate-400"> · {act.user_name || t('dashboard.systemUser')}</span>
                          </div>
                        </div>
                        <span className="text-slate-400 dark:text-slate-500 tabular-nums shrink-0">{formatDateTime(act.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
