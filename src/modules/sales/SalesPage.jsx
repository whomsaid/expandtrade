import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CreditCard, Printer, RotateCcw, Search } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ReceiptModal from '../../components/ReceiptModal.jsx';
import ViewMoreFooter from '../../components/ViewMoreFooter.jsx';
import { formatDateTime, formatMoney, getPaymentMethodLabel, PAYMENT_METHOD_LABELS } from '../../utils/format.js';
import { useExpandableList } from '../../utils/listOrder.js';

export default function SalesPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { activeBusinessId, activeBranchId, workspace, hasPermission } = useAuth();
  const [sales, setSales] = useState([]);
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [paymentModalSale, setPaymentModalSale] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'mtn_momo', external_reference: '' });
  const [refundSale, setRefundSale] = useState(null);
  const [refundReason, setRefundReason] = useState('');
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const currency = workspace?.business?.currency_code || 'RWF';
  const salesBox = useExpandableList(sales, { initialLimit: 6, sortNewest: true });

  const loadSales = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const { data } = await api.get('/sales', {
        params: { search, payment_status: paymentFilter },
      });
      setSales(data.sales || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId, activeBranchId, search, paymentFilter]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const handleOpenReceipt = async (saleId) => {
    try {
      const { data } = await api.get(`/receipts/${saleId}`);
      setReceipt(data.receipt.payload);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setSaving(true);
    try {
      await api.post(`/sales/${paymentModalSale.id}/payments`, payForm);
      setPaymentModalSale(null);
      setMessage(t('sales.paymentRecorded'));
      await loadSales();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRefund = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setSaving(true);
    try {
      await api.post(`/sales/${refundSale.id}/refund`, { reason: refundReason, restock_items: true });
      setRefundSale(null);
      setRefundReason('');
      setMessage(t('sales.refundProcessed'));
      await loadSales();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('sales.title')}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('sales.subtitle')}</p>
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
      {message && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">{message}</div>}

      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('sales.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="text-xs border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        >
          <option value="">{t('sales.allStatuses')}</option>
          <option value="paid">{t('sales.filterPaid')}</option>
          <option value="partial">{t('sales.filterPartial')}</option>
          <option value="unpaid">{t('sales.filterUnpaid')}</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-3 px-4 font-semibold">{t('sales.colReference')}</th>
                <th className="py-3 px-4 font-semibold">{t('sales.colDate')}</th>
                <th className="py-3 px-4 font-semibold">{t('sales.colBranch')}</th>
                <th className="py-3 px-4 font-semibold">{t('sales.colCustomer')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('sales.colTotal')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('sales.colPaid')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('sales.colBalance')}</th>
                <th className="py-3 px-4 font-semibold">{t('sales.colPayment')}</th>
                <th className="py-3 px-4 font-semibold">{t('sales.colStatus')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('sales.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {salesBox.totalCount === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 dark:text-slate-400">{t('sales.empty')}</td>
                </tr>
              ) : (
                salesBox.visibleItems.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">{s.reference_number}</td>
                  <td className="py-3 px-4 tabular-nums text-slate-500 dark:text-slate-400">{formatDateTime(s.created_at)}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{s.branch_name}</td>
                  <td className="py-3 px-4 text-slate-800 dark:text-slate-200">{s.customer_name || t('sales.walkIn')}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatMoney(s.total_amount, currency)}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatMoney(s.amount_paid, currency)}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-rose-700 dark:text-rose-400 font-medium">{formatMoney(s.balance_due, currency)}</td>
                  <td className="py-3 px-4"><StatusBadge status={s.payment_status} /></td>
                  <td className="py-3 px-4"><StatusBadge status={s.sale_status} /></td>
                  <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleOpenReceipt(s.id)}
                      className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 hover:underline font-medium"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {t('sales.receiptBtn')}
                    </button>
                    {Number(s.balance_due) > 0 && s.sale_status !== 'refunded' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalError('');
                          setPaymentModalSale(s);
                          setPayForm({ amount: String(s.balance_due), payment_method: 'mtn_momo', external_reference: '' });
                        }}
                        className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        {t('sales.payBtn')}
                      </button>
                    )}
                    {hasPermission('sales.refund') && s.sale_status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => { setModalError(''); setRefundSale(s); }}
                        className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 hover:underline font-medium"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {t('sales.refundBtn')}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        <ViewMoreFooter
          totalCount={salesBox.totalCount}
          visibleCount={salesBox.visibleCount}
          initialLimit={6}
          expanded={salesBox.expanded}
          onToggle={salesBox.toggleExpanded}
        />
      </div>

      {/* Record Follow-up Payment Modal */}
      {paymentModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('sales.recordPaymentTitle', { ref: paymentModalSale.reference_number })}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
              {t('sales.outstandingBalance')} <strong>{formatMoney(paymentModalSale.balance_due, currency)}</strong>
            </p>
            {modalError && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{modalError}</div>}
            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('sales.amount')}</label>
                <input required type="number" min="1" max={paymentModalSale.balance_due} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('sales.method')}</label>
                <select value={payForm.payment_method} onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {Object.keys(PAYMENT_METHOD_LABELS).map((k) => <option key={k} value={k}>{getPaymentMethodLabel(k)}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('sales.reference')}</label>
                <input value={payForm.external_reference} onChange={(e) => setPayForm({ ...payForm, external_reference: e.target.value })} placeholder={t('sales.refPlaceholder')} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setPaymentModalSale(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50">{saving ? t('common.saving') : t('sales.savePayment')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-rose-800 dark:text-rose-400">{t('sales.refundModalTitle', { ref: refundSale.reference_number })}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t('sales.refundNote')}
            </p>
            {modalError && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{modalError}</div>}
            <form onSubmit={handleRefund} className="space-y-3 text-xs">
              <textarea required rows={3} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder={t('sales.refundReasonPlaceholder')} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="flex justify-end gap-2">
                <button type="button" disabled={saving} onClick={() => setRefundSale(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg disabled:opacity-50">{saving ? t('common.saving') : t('sales.confirmRefund')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
