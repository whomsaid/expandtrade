import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, Printer } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatMoney, getPaymentMethodLabel } from '../../utils/format.js';
import ViewMoreFooter from '../../components/ViewMoreFooter.jsx';
import { useExpandableList } from '../../utils/listOrder.js';

export default function ReportsPage() {
  const { t } = useTranslation();
  const { activeBusinessId, workspace, socket } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState('');
  const [exportJob, setExportJob] = useState(null);
  const [exporting, setExporting] = useState(false);

  const currency = workspace?.business?.currency_code || 'RWF';

  const loadReports = useCallback(async () => {
    if (!activeBusinessId) return;
    setError('');
    try {
      const { data } = await api.get('/reports/analytics');
      setAnalytics(data);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId]);

  const salesByEmployeeBox = useExpandableList(analytics?.salesByEmployee || [], { initialLimit: 6, sortNewest: false });
  const paymentBreakdownBox = useExpandableList(analytics?.paymentBreakdown || [], { initialLimit: 6, sortNewest: false });
  const topCustomersBox = useExpandableList(analytics?.topCustomers || [], { initialLimit: 6, sortNewest: false });

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (!socket || !exportJob?.id) return;
    const handler = (job) => {
      if (job?.id === exportJob.id) {
        setExportJob(job);
      }
    };
    socket.on('job:progress', handler);
    return () => socket.off('job:progress', handler);
  }, [socket, exportJob?.id]);

  const handleExportReport = async () => {
    if (exporting) return;
    setError('');
    setExporting(true);
    try {
      const { data } = await api.post('/reports/export-job');
      const jobId = data.jobId;
      setExportJob(data.job || { id: jobId, status: 'queued', progress: 0 });

      while (true) {
        const res = await api.get(`/jobs/${jobId}`, { skipRetry: true });
        const job = res.data.job;
        setExportJob(job);
        if (job?.status === 'completed') {
          const csv = job.result?.csvContent || '';
          const filename = job.result?.filename || 'biztrade-report.csv';
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          break;
        }
        if (job?.status === 'failed' || job?.status === 'cancelled') {
          throw new Error(job.error_message || t('common.requestFailed'));
        }
        await new Promise((r) => setTimeout(r, 450));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('reports.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('reports.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0B192C] dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60 transition-colors"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {exporting ? t('reports.generatingCsv', { progress: exportJob?.progress || 0 }) : t('reports.exportCsv')}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            {t('reports.printExport')}
          </button>
        </div>
      </div>

      {exporting && exportJob && (
        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 tabular-nums">
            <span>{t('reports.exportJobRunning')}</span>
            <span>{exportJob.progress || 0}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-[#0B192C] dark:bg-sky-500 transition-all" style={{ width: `${exportJob.progress || 0}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadReports}
            className="px-2.5 py-1 font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 space-y-3 overflow-x-auto">
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
                  {salesByEmployeeBox.visibleItems.map((e, i) => (
                    <tr key={i}>
                      <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">{e.employee_name}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{e.sales_count}</td>
                      <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatMoney(e.revenue, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ViewMoreFooter
              shownCount={salesByEmployeeBox.visibleItems.length}
              totalCount={salesByEmployeeBox.totalCount}
              hasMore={salesByEmployeeBox.hasMore}
              expanded={salesByEmployeeBox.expanded}
              onToggle={salesByEmployeeBox.toggle}
            />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 space-y-3 overflow-x-auto">
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
                  {paymentBreakdownBox.visibleItems.map((p, i) => (
                    <tr key={i}>
                      <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">{getPaymentMethodLabel(p.payment_method)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{p.tx_count}</td>
                      <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatMoney(p.total, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ViewMoreFooter
              shownCount={paymentBreakdownBox.visibleItems.length}
              totalCount={paymentBreakdownBox.totalCount}
              hasMore={paymentBreakdownBox.hasMore}
              expanded={paymentBreakdownBox.expanded}
              onToggle={paymentBreakdownBox.toggle}
            />
          </div>

          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 space-y-3 overflow-x-auto">
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
                  {topCustomersBox.visibleItems.map((c, i) => (
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
            <ViewMoreFooter
              shownCount={topCustomersBox.visibleItems.length}
              totalCount={topCustomersBox.totalCount}
              hasMore={topCustomersBox.hasMore}
              expanded={topCustomersBox.expanded}
              onToggle={topCustomersBox.toggle}
            />
          </div>
        </div>
      )}
    </div>
  );
}
