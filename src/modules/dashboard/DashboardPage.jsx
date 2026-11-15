import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { formatDateTime, formatMoney } from '../../utils/format.js';

export default function DashboardPage() {
  const { activeBusinessId, activeBranchId, workspace, socket, hasPermission } = useAuth();
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState(null);
  const [branchFilter, setBranchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const currency = workspace?.business?.currency_code || 'RWF';
  const isDark = resolvedTheme === 'dark';

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
    return () => {
      socket.off('sale:created', handler);
      socket.off('inventory:updated', handler);
    };
  }, [socket, loadDashboard]);

  if (!activeBusinessId) {
    return (
      <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">No Active Business Workspace Selected</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Business workspaces are registered and assigned by the Platform Super Admin.
        </p>
        <Link
          to="/app/admin"
          className="inline-flex px-4 py-2 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors"
        >
          Open Platform Super Admin
        </Link>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">
            {workspace?.business?.name || 'Business Dashboard'}
          </h1>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
            <span>{workspace?.business?.category}</span>
            <span aria-hidden="true">·</span>
            <span>{workspace?.business?.country}</span>
            <span aria-hidden="true">·</span>
            <span>Live Database Metrics</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {workspace?.membership?.all_branches_access === 1 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
            >
              <option value="">All Branches Combined</option>
              {(workspace?.branches || []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {hasPermission('pos.sell') && (
            <Link
              to="/app/pos"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap transition-colors"
            >
              Open POS
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-24 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Primary KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 transition-transform duration-200 hover:-translate-y-0.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Sales Today</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {formatMoney(kpis.sales_today, currency)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">{kpis.sales_today_count || 0} completed sales</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 transition-transform duration-200 hover:-translate-y-0.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Sales This Month</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {formatMoney(kpis.sales_month, currency)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">YTD: {formatMoney(kpis.sales_year, currency)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 transition-transform duration-200 hover:-translate-y-0.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {kpis.gross_profit !== null ? 'Net Operating Profit' : 'Active Catalog'}
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {kpis.gross_profit !== null
                  ? formatMoney(kpis.net_operating_profit, currency)
                  : `${kpis.total_products || 0} SKUs`}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {kpis.gross_profit !== null
                  ? `Gross Profit: ${formatMoney(kpis.gross_profit, currency)}`
                  : `${kpis.total_customers || 0} registered customers`}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 transition-transform duration-200 hover:-translate-y-0.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Inventory & Orders Alerts</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {(kpis.low_stock_products || 0) + (kpis.out_of_stock_products || 0)} Alerts
              </div>
              <div className="text-xs text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1 tabular-nums">
                <AlertTriangle className="w-3.5 h-3.5" />
                {kpis.out_of_stock_products || 0} out of stock · {kpis.pending_orders || 0} pending orders
              </div>
            </div>
          </div>

          {/* Financial Secondary Strip (Authorized roles only) */}
          {kpis.total_expenses !== null && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Approved Expenses</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{formatMoney(kpis.total_expenses, currency)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Customer Receivables</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{formatMoney(kpis.outstanding_customer_balances, currency)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Supplier Balances</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{formatMoney(kpis.supplier_balances, currency)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Total Customers</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{kpis.total_customers || 0}</div>
              </div>
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Daily Sales Revenue</h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">Last 14 active days</span>
              </div>
              <div className="h-64">
                {(charts.daily_sales || []).length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                    Complete a POS sale to populate daily sales analytics.
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

            <div className="lg:col-span-4 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Best-Selling Products</h2>
              {(charts.top_products || []).length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">No sales recorded yet.</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {charts.top_products.map((p, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{p.product_name}</div>
                        <div className="text-slate-500 dark:text-slate-400 tabular-nums">{p.qty} units sold</div>
                      </div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                        {formatMoney(p.revenue, currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Branch Performance & Recent Audit Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sales by Branch</h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(charts.sales_by_branch || []).map((b, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{b.branch_name}</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{formatMoney(b.revenue, currency)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Audit Activity</h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.recentActivities || []).slice(0, 6).map((act) => (
                  <div key={act.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex items-center gap-2">
                      <UserAvatar src={act.user_avatar} name={act.user_name || 'System'} size="xs" />
                      <div className="min-w-0 truncate">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{act.action}</span>
                        <span className="text-slate-500 dark:text-slate-400"> · {act.user_name || 'System'}</span>
                      </div>
                    </div>
                    <span className="text-slate-400 dark:text-slate-500 tabular-nums shrink-0">{formatDateTime(act.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
