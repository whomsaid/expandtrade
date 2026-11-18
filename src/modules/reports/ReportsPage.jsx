import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatMoney, getPaymentMethodLabel } from '../../utils/format.js';

export default function ReportsPage() {
  const { t } = useTranslation();
  const { activeBusinessId, workspace } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState('');

  const currency = workspace?.business?.currency_code || 'RWF';

  const loadReports = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const { data } = await api.get('/reports/analytics');
      setAnalytics(data);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('reports.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('reports.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 no-print transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          {t('reports.printExport')}
        </button>
      </div>

      {error && (
        <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">
          {error}
        </div>
      )}

      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('reports.salesByEmployee')}</h2>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2">{t('reports.colEmployee')}</th>
                  <th className="py-2 text-right">{t('reports.colTransactions')}</th>
                  <th className="py-2 text-right">{t('reports.colRevenue')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {analytics.salesByEmployee.map((e, i) => (
                  <tr key={i}>
                    <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">{e.employee_name}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{e.sales_count}</td>
                    <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatMoney(e.revenue, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('reports.collectionsByChannel')}</h2>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2">{t('reports.colMethod')}</th>
                  <th className="py-2 text-right">{t('reports.colPayments')}</th>
                  <th className="py-2 text-right">{t('reports.colCollected')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {analytics.paymentBreakdown.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">{getPaymentMethodLabel(p.payment_method)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{p.tx_count}</td>
                    <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatMoney(p.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 overflow-x-auto">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('reports.topCustomers')}</h2>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2">{t('reports.colCustomer')}</th>
                  <th className="py-2">{t('reports.colPhone')}</th>
                  <th className="py-2 text-right">{t('reports.colOrders')}</th>
                  <th className="py-2 text-right">{t('reports.colLoyaltyPts')}</th>
                  <th className="py-2 text-right">{t('reports.colOutstanding')}</th>
                  <th className="py-2 text-right">{t('reports.colTotalSpent')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {analytics.topCustomers.map((c, i) => (
                  <tr key={i}>
                    <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">{c.full_name}</td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-400">{c.phone}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{c.orders_count}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{c.loyalty_points}</td>
                    <td className="py-2.5 text-right tabular-nums text-rose-700 dark:text-rose-400">{formatMoney(c.outstanding_balance, currency)}</td>
                    <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatMoney(c.total_spent, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
