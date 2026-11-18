import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, SlidersHorizontal } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDateTime, formatMoney } from '../../utils/format.js';

export default function InventoryPage() {
  const { t } = useTranslation();
  const { activeBusinessId, activeBranchId, workspace, hasPermission } = useAuth();
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [summary, setSummary] = useState({ lowStockCount: 0, outOfStockCount: 0, valuation: 0 });
  const [tab, setTab] = useState('stock');
  const [showAdjust, setShowAdjust] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [adjForm, setAdjForm] = useState({ product_id: '', adjustment_type: 'add', quantity: '1', reason: '' });
  const [trfForm, setTrfForm] = useState({ from_branch_id: '', to_branch_id: '', product_id: '', quantity: '1', notes: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const currency = workspace?.business?.currency_code || 'RWF';
  const branches = workspace?.branches || [];

  const loadInventory = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const [invRes, movRes] = await Promise.all([
        api.get('/inventory'),
        api.get('/stock-movements'),
      ]);
      setItems(invRes.data.items || []);
      setSummary({
        lowStockCount: invRes.data.lowStockCount || 0,
        outOfStockCount: invRes.data.outOfStockCount || 0,
        valuation: invRes.data.valuation || 0,
      });
      setMovements(movRes.data.movements || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId, activeBranchId]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleAdjust = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post('/inventory/adjust', adjForm);
      setShowAdjust(false);
      setMessage(t('inventory.adjustedSuccess'));
      await loadInventory();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/inventory/transfer', trfForm);
      setShowTransfer(false);
      setMessage(t('inventory.transferSuccess', { ref: data.reference_number }));
      await loadInventory();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('inventory.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('inventory.subtitle')}</p>
        </div>

        {hasPermission('inventory.manage') && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAdjForm({ product_id: items[0]?.product_id || '', adjustment_type: 'add', quantity: '1', reason: '' });
                setShowAdjust(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {t('inventory.adjustStock')}
            </button>
            {branches.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setTrfForm({
                    from_branch_id: activeBranchId || branches[0]?.id || '',
                    to_branch_id: branches.find((b) => b.id !== activeBranchId)?.id || '',
                    product_id: items[0]?.product_id || '',
                    quantity: '1',
                    notes: '',
                  });
                  setShowTransfer(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                {t('inventory.transferBranches')}
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">{t('inventory.valuationLabel')}</div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1">{formatMoney(summary.valuation, currency)}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">{t('inventory.lowStockLabel')}</div>
          <div className="text-xl font-bold text-amber-700 dark:text-amber-400 tabular-nums mt-1">{summary.lowStockCount}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">{t('inventory.outOfStockLabel')}</div>
          <div className="text-xl font-bold text-rose-700 dark:text-rose-400 tabular-nums mt-1">{summary.outOfStockCount}</div>
        </div>
      </div>

      <div className="inline-flex p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
        <button
          type="button"
          onClick={() => setTab('stock')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            tab === 'stock' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          {t('inventory.tabStock', { count: items.length })}
        </button>
        <button
          type="button"
          onClick={() => setTab('movements')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            tab === 'movements' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          {t('inventory.tabMovements', { count: movements.length })}
        </button>
      </div>

      {tab === 'stock' ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-3 px-4 font-semibold">{t('inventory.colProduct')}</th>
                <th className="py-3 px-4 font-semibold">{t('inventory.colSku')}</th>
                <th className="py-3 px-4 font-semibold">{t('inventory.colBranch')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('inventory.colOnHand')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('inventory.colMinAlert')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('inventory.colStockValue')}</th>
                <th className="py-3 px-4 font-semibold">{t('inventory.colHealth')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => {
                const health = item.quantity <= 0 ? t('inventory.healthOut') : item.quantity <= item.min_stock ? t('inventory.healthLow') : t('inventory.healthHealthy');
                const healthCls =
                  item.quantity <= 0
                    ? 'text-rose-700 dark:text-rose-400 font-semibold'
                    : item.quantity <= item.min_stock
                      ? 'text-amber-700 dark:text-amber-400 font-semibold'
                      : 'text-emerald-700 dark:text-emerald-400';
                return (
                  <tr key={item.id}>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{item.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">{item.sku}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{item.branch_name}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900 dark:text-slate-100">{item.quantity}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-500 dark:text-slate-400">{item.min_stock}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(item.quantity * item.purchase_price, currency)}</td>
                    <td className={`py-3 px-4 ${healthCls}`}>{health}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-3 px-4 font-semibold">{t('inventory.colDate')}</th>
                <th className="py-3 px-4 font-semibold">{t('inventory.colProduct')}</th>
                <th className="py-3 px-4 font-semibold">{t('inventory.colBranch')}</th>
                <th className="py-3 px-4 font-semibold">{t('inventory.colType')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('inventory.colChange')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('inventory.colPrevNew')}</th>
                <th className="py-3 px-4 font-semibold">{t('inventory.colReason')}</th>
                <th className="py-3 px-4 font-semibold">{t('inventory.colUser')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="py-2.5 px-4 tabular-nums text-slate-500 dark:text-slate-400">{formatDateTime(m.created_at)}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">{m.product_name}</td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">{m.branch_name}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300">{m.movement_type}</td>
                  <td className={`py-2.5 px-4 text-right tabular-nums font-semibold ${m.quantity_change >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                    {m.quantity_change >= 0 ? `+${m.quantity_change}` : m.quantity_change}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-slate-600 dark:text-slate-400">
                    {m.previous_quantity} → {m.new_quantity}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">{m.reason}</td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">{m.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('inventory.adjustModalTitle')}</h2>
            <form onSubmit={handleAdjust} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('inventory.productLabel')}</label>
                <select value={adjForm.product_id} onChange={(e) => setAdjForm({ ...adjForm, product_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {items.map((i) => <option key={i.product_id} value={i.product_id}>{t('inventory.onHandOption', { name: i.name, qty: i.quantity })}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('inventory.adjustmentType')}</label>
                  <select value={adjForm.adjustment_type} onChange={(e) => setAdjForm({ ...adjForm, adjustment_type: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                    <option value="add">{t('inventory.adjAdd')}</option>
                    <option value="reduce">{t('inventory.adjReduce')}</option>
                    <option value="damaged">{t('inventory.adjDamaged')}</option>
                    <option value="returned">{t('inventory.adjReturned')}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('inventory.quantity')}</label>
                  <input required type="number" min="1" value={adjForm.quantity} onChange={(e) => setAdjForm({ ...adjForm, quantity: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('inventory.auditReason')}</label>
                <input required value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} placeholder={t('inventory.reasonPlaceholder')} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdjust(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">{t('inventory.applyAdjustment')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Stock Modal */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('inventory.transferModalTitle')}</h2>
            <form onSubmit={handleTransfer} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('inventory.fromBranch')}</label>
                  <select value={trfForm.from_branch_id} onChange={(e) => setTrfForm({ ...trfForm, from_branch_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('inventory.toBranch')}</label>
                  <select value={trfForm.to_branch_id} onChange={(e) => setTrfForm({ ...trfForm, to_branch_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('inventory.productLabel')}</label>
                  <select value={trfForm.product_id} onChange={(e) => setTrfForm({ ...trfForm, product_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                    {items.map((i) => <option key={i.product_id} value={i.product_id}>{i.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('inventory.quantity')}</label>
                  <input required type="number" min="1" value={trfForm.quantity} onChange={(e) => setTrfForm({ ...trfForm, quantity: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('inventory.transferNotes')}</label>
                <input value={trfForm.notes} onChange={(e) => setTrfForm({ ...trfForm, notes: e.target.value })} placeholder={t('inventory.notesPlaceholder')} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTransfer(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">{t('inventory.completeTransfer')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
