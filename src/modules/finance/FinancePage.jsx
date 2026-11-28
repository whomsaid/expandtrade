import { useCallback, useEffect, useState } from 'react';
import { Check, Plus, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ViewMoreFooter from '../../components/ViewMoreFooter.jsx';
import { formatDate, formatMoney, getPaymentMethodLabel, PAYMENT_METHOD_LABELS } from '../../utils/format.js';
import { useExpandableList } from '../../utils/listOrder.js';

export default function FinancePage() {
  const { t } = useTranslation();
  const { activeBusinessId, workspace, hasPermission } = useAuth();
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [income, setIncome] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tab, setTab] = useState('pnl');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [expForm, setExpForm] = useState({ title: '', category_name: 'Rent & Utilities', amount: '', payment_method: 'mtn_momo', description: '', receipt: null });
  const [incForm, setIncForm] = useState({ category: 'Service Fee', source: '', amount: '', payment_method: 'cash', description: '' });
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [receiptPreview, setReceiptPreview] = useState('');

  const currency = workspace?.business?.currency_code || 'RWF';

  const loadFinance = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const [sumRes, expRes, incRes] = await Promise.all([
        api.get('/finance/summary'),
        api.get('/finance/expenses'),
        api.get('/finance/income'),
      ]);
      setSummary(sumRes.data);
      setExpenses(expRes.data.expenses || []);
      setCategories(expRes.data.categories || []);
      setIncome(incRes.data.income || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId]);

  const expensesBox = useExpandableList(expenses, { initialLimit: 6, sortNewest: true });
  const incomeBox = useExpandableList(income, { initialLimit: 6, sortNewest: true });

  useEffect(() => {
    loadFinance();
  }, [loadFinance]);

  useEffect(() => {
    return () => {
      if (receiptPreview && receiptPreview.startsWith('blob:')) {
        URL.revokeObjectURL(receiptPreview);
      }
    };
  }, [receiptPreview]);

  const handleReceiptSelect = (file) => {
    setModalError('');
    if (!file) {
      setExpForm((prev) => ({ ...prev, receipt: null }));
      setReceiptPreview('');
      return;
    }
    if (file.size === 0) {
      setModalError(t('validation.emptyFile'));
      return;
    }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isGenericMime = !file.type || file.type === 'application/octet-stream';
    if (!allowed.includes(file.type) && !(isGenericMime && ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext))) {
      setModalError(t('validation.unsupportedReceiptFormat'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setModalError(t('validation.fileTooLarge'));
      return;
    }
    const isImage = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
    setExpForm((prev) => ({ ...prev, receipt: file }));
    setReceiptPreview((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return isImage ? URL.createObjectURL(file) : '';
    });
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setSaving(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      Object.entries(expForm).forEach(([k, v]) => {
        if (k === 'receipt' && v) fd.append('receipt', v);
        else if (k !== 'receipt' && v) fd.append(k, v);
      });
      await api.post('/finance/expenses', fd, {
        onUploadProgress: (evt) => {
          if (evt.total && expForm.receipt) {
            setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        },
      });
      setShowExpenseModal(false);
      setExpForm({ title: '', category_name: 'Rent & Utilities', amount: '', payment_method: 'mtn_momo', description: '', receipt: null });
      setReceiptPreview('');
      await loadFinance();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleAddIncome = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setSaving(true);
    try {
      await api.post('/finance/income', incForm);
      setShowIncomeModal(false);
      setIncForm({ category: 'Service Fee', source: '', amount: '', payment_method: 'cash', description: '' });
      await loadFinance();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApproveExpense = async (id, decision) => {
    if (approvingId === id) return;
    setApprovingId(id);
    setError('');
    try {
      await api.patch(`/finance/expenses/${id}/approval`, { decision });
      await loadFinance();
    } catch (err) {
      setError(err.message);
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('finance.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('finance.subtitle')}</p>
        </div>
        {hasPermission('finance.create') && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setModalError(''); setShowIncomeModal(true); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              {t('finance.recordIncome')}
            </button>
            <button type="button" data-shortcut-new="true" onClick={() => { setModalError(''); setUploadProgress(0); setReceiptPreview(''); setShowExpenseModal(true); }} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" />
              {t('finance.recordExpense')}
            </button>
          </div>
        )}
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

      <div className="inline-flex p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
        <button type="button" onClick={() => setTab('pnl')} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === 'pnl' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>
          {t('finance.tabPnl')}
        </button>
        <button type="button" onClick={() => setTab('expenses')} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === 'expenses' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>
          {t('finance.tabExpenses', { count: expenses.length })}
        </button>
        <button type="button" onClick={() => setTab('income')} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === 'income' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>
          {t('finance.tabIncome', { count: income.length })}
        </button>
      </div>

      {tab === 'pnl' && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-sm tabular-nums">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">{t('finance.incomeStatementTitle')}</h2>
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">{t('finance.salesRevenue')}</span><span className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(summary.revenue, currency)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">{t('finance.cogs')}</span><span className="text-rose-700 dark:text-rose-400">-{formatMoney(summary.cogs, currency)}</span></div>
            <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-2 font-semibold text-slate-900 dark:text-slate-100"><span>{t('finance.grossProfit')}</span><span>{formatMoney(summary.gross_profit, currency)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">{t('finance.otherRecordedIncome')}</span><span className="text-emerald-700 dark:text-emerald-400">+{formatMoney(summary.other_income, currency)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">{t('finance.approvedExpenses')}</span><span className="text-rose-700 dark:text-rose-400">-{formatMoney(summary.operating_expenses, currency)}</span></div>
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-3 text-base font-bold text-[#0B192C] dark:text-slate-100">
              <span>{t('finance.netOperatingProfit')}</span>
              <span>{formatMoney(summary.net_operating_profit, currency)}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-sm tabular-nums">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">{t('finance.cashFlowTitle')}</h2>
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">{t('finance.cashReceived')}</span><span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatMoney(summary.cash_received, currency)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">{t('finance.cashOutflow')}</span><span className="text-rose-700 dark:text-rose-400">-{formatMoney(summary.operating_expenses, currency)}</span></div>
            <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-2 font-bold text-[#0B192C] dark:text-slate-100"><span>{t('finance.netCashFlow')}</span><span>{formatMoney(summary.net_cash_flow, currency)}</span></div>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">{t('finance.outstandingReceivables')}</span><span className="font-semibold text-amber-700 dark:text-amber-400">{formatMoney(summary.outstanding_receivables, currency)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">{t('finance.supplierPayables')}</span><span className="font-semibold text-rose-700 dark:text-rose-400">{formatMoney(summary.supplier_payables, currency)}</span></div>
            </div>
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-3 px-4 font-semibold">{t('finance.colDate')}</th>
                <th className="py-3 px-4 font-semibold">{t('finance.colTitle')}</th>
                <th className="py-3 px-4 font-semibold">{t('finance.colCategory')}</th>
                <th className="py-3 px-4 font-semibold">{t('finance.colBranch')}</th>
                <th className="py-3 px-4 font-semibold">{t('finance.colMethod')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('finance.colAmount')}</th>
                <th className="py-3 px-4 font-semibold">{t('finance.colApproval')}</th>
                {hasPermission('finance.approve') && <th className="py-3 px-4 font-semibold text-right">{t('finance.colReview')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {expensesBox.visibleItems.map((ex) => (
                <tr key={ex.id}>
                  <td className="py-3 px-4 tabular-nums text-slate-500 dark:text-slate-400">{formatDate(ex.expense_date)}</td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{ex.title}</div>
                    {ex.receipt_file_url && (
                      <a href={ex.receipt_file_url} target="_blank" rel="noreferrer" className="text-[11px] text-sky-700 dark:text-sky-400 hover:underline">
                        {t('finance.viewReceipt')}
                      </a>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{ex.category_name}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{ex.branch_name}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{getPaymentMethodLabel(ex.payment_method)}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatMoney(ex.amount, currency)}</td>
                  <td className="py-3 px-4"><StatusBadge status={ex.approval_status} /></td>
                  {hasPermission('finance.approve') && (
                    <td className="py-3 px-4 text-right space-x-2">
                      {ex.approval_status === 'pending' && (
                        <>
                          <button type="button" disabled={approvingId === ex.id} onClick={() => handleApproveExpense(ex.id, 'approved')} className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400 hover:underline font-medium disabled:opacity-40">
                            <Check className="w-3.5 h-3.5" /> {t('finance.approve')}
                          </button>
                          <button type="button" disabled={approvingId === ex.id} onClick={() => handleApproveExpense(ex.id, 'rejected')} className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400 hover:underline font-medium disabled:opacity-40">
                            <X className="w-3.5 h-3.5" /> {t('finance.reject')}
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <ViewMoreFooter
            shownCount={expensesBox.visibleItems.length}
            totalCount={expensesBox.totalCount}
            hasMore={expensesBox.hasMore}
            expanded={expensesBox.expanded}
            onToggle={expensesBox.toggle}
          />
        </div>
      )}

      {tab === 'income' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-3 px-4 font-semibold">{t('finance.colDate')}</th>
                <th className="py-3 px-4 font-semibold">{t('finance.colCategory')}</th>
                <th className="py-3 px-4 font-semibold">{t('finance.colSource')}</th>
                <th className="py-3 px-4 font-semibold">{t('finance.colBranch')}</th>
                <th className="py-3 px-4 font-semibold">{t('finance.colMethod')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('finance.colAmount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {incomeBox.totalCount === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">{t('finance.emptyIncome')}</td></tr>
              ) : (
                incomeBox.visibleItems.map((i) => (
                  <tr key={i.id}>
                    <td className="py-3 px-4 tabular-nums text-slate-500 dark:text-slate-400">{formatDate(i.income_date)}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{i.category}</td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{i.source}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{i.branch_name}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{getPaymentMethodLabel(i.payment_method)}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{formatMoney(i.amount, currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
          <ViewMoreFooter
            shownCount={incomeBox.visibleItems.length}
            totalCount={incomeBox.totalCount}
            hasMore={incomeBox.hasMore}
            expanded={incomeBox.expanded}
            onToggle={incomeBox.toggle}
          />
        </div>
      )}

      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('finance.expenseModalTitle')}</h2>
            {modalError && (
              <div className="p-2.5 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">
                {modalError}
              </div>
            )}
            <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
              <input required placeholder={t('finance.expenseTitlePlaceholder')} value={expForm.title} onChange={(e) => setExpForm({ ...expForm, title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <select value={expForm.category_name} onChange={(e) => setExpForm({ ...expForm, category_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                {(categories.length ? categories : [{ name: 'Rent & Utilities' }, { name: 'Transport & Delivery' }, { name: 'Salaries & Wages' }]).map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input required type="number" min="1" placeholder={t('finance.amountPlaceholder', { currency })} value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums placeholder:text-slate-400 dark:placeholder:text-slate-500" />
                <select value={expForm.payment_method} onChange={(e) => setExpForm({ ...expForm, payment_method: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {Object.keys(PAYMENT_METHOD_LABELS).map((k) => <option key={k} value={k}>{getPaymentMethodLabel(k)}</option>)}
                </select>
              </div>
              <textarea rows={2} placeholder={t('finance.descriptionPlaceholder')} value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  {receiptPreview && (
                    <img
                      src={receiptPreview}
                      alt={expForm.receipt?.name || 'Receipt'}
                      className="w-11 h-11 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  )}
                  <label className="flex-1 flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <Upload className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span className="truncate">{expForm.receipt ? expForm.receipt.name : t('finance.uploadReceipt')}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        handleReceiptSelect(e.target.files?.[0] || null);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                {saving && expForm.receipt && uploadProgress > 0 && (
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-600 transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setShowExpenseModal(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60">{saving ? t('common.saving') : t('finance.submitExpense')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showIncomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('finance.incomeModalTitle')}</h2>
            {modalError && (
              <div className="p-2.5 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">
                {modalError}
              </div>
            )}
            <form onSubmit={handleAddIncome} className="space-y-3 text-xs">
              <input required placeholder={t('finance.incomeCategoryPlaceholder')} value={incForm.category} onChange={(e) => setIncForm({ ...incForm, category: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input required placeholder={t('finance.incomeSourcePlaceholder')} value={incForm.source} onChange={(e) => setIncForm({ ...incForm, source: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="grid grid-cols-2 gap-3">
                <input required type="number" min="1" placeholder={t('finance.amountPlaceholder', { currency })} value={incForm.amount} onChange={(e) => setIncForm({ ...incForm, amount: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums placeholder:text-slate-400 dark:placeholder:text-slate-500" />
                <select value={incForm.payment_method} onChange={(e) => setIncForm({ ...incForm, payment_method: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {Object.keys(PAYMENT_METHOD_LABELS).map((k) => <option key={k} value={k}>{getPaymentMethodLabel(k)}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setShowIncomeModal(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60">{saving ? t('common.saving') : t('finance.saveIncome')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
