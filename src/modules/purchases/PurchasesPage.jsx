import { useCallback, useEffect, useState } from 'react';
import { PackageCheck, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { formatDate, formatMoney } from '../../utils/format.js';

export default function PurchasesPage() {
  const { t } = useTranslation();
  const { activeBusinessId, workspace, hasPermission } = useAuth();
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', product_id: '', ordered_qty: '10', unit_cost: '', expected_delivery_date: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const currency = workspace?.business?.currency_code || 'RWF';

  const loadAll = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const [poRes, supRes, prodRes] = await Promise.all([
        api.get('/purchases'),
        api.get('/suppliers'),
        api.get('/products'),
      ]);
      setPurchases(poRes.data.purchases || []);
      setSuppliers(supRes.data.suppliers || []);
      setProducts(prodRes.data.products || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreatePo = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/purchases', {
        supplier_id: Number(form.supplier_id),
        expected_delivery_date: form.expected_delivery_date || null,
        items: [{ product_id: Number(form.product_id), ordered_qty: Number(form.ordered_qty), unit_cost: Number(form.unit_cost) }],
      });
      setShowCreate(false);
      setMessage(t('purchases.poCreatedMsg'));
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReceiveAll = async (po) => {
    setError('');
    try {
      await api.post(`/purchases/${po.id}/receive`, {
        items: po.items.map((it) => ({
          purchase_item_id: it.id,
          receive_qty: it.ordered_qty - it.received_qty,
        })),
      });
      setMessage(t('purchases.goodsReceivedMsg', { po: po.po_number }));
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('purchases.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('purchases.subtitle')}</p>
        </div>
        {hasPermission('purchases.manage') && (
          <button
            type="button"
            onClick={() => {
              const firstProd = products[0];
              setForm({
                supplier_id: suppliers[0]?.id || '',
                product_id: firstProd?.id || '',
                ordered_qty: '10',
                unit_cost: firstProd ? String(firstProd.purchase_price) : '',
                expected_delivery_date: '',
              });
              setShowCreate(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('purchases.createPo')}
          </button>
        )}
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
      {message && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">{message}</div>}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            <tr>
              <th className="py-3 px-4 font-semibold">{t('purchases.colPoNum')}</th>
              <th className="py-3 px-4 font-semibold">{t('purchases.colSupplier')}</th>
              <th className="py-3 px-4 font-semibold">{t('purchases.colBranch')}</th>
              <th className="py-3 px-4 font-semibold">{t('purchases.colItems')}</th>
              <th className="py-3 px-4 font-semibold text-right">{t('purchases.colTotal')}</th>
              <th className="py-3 px-4 font-semibold">{t('purchases.colExpected')}</th>
              <th className="py-3 px-4 font-semibold">{t('purchases.colStatus')}</th>
              {hasPermission('purchases.manage') && <th className="py-3 px-4 font-semibold text-right">{t('purchases.colReceiving')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {purchases.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-slate-500 dark:text-slate-400">{t('purchases.empty')}</td></tr>
            ) : (
              purchases.map((po) => (
                <tr key={po.id}>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">{po.po_number}</td>
                  <td className="py-3 px-4 text-slate-800 dark:text-slate-200">{po.supplier_name}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{po.branch_name}</td>
                  <td className="py-3 px-4">
                    {(po.items || []).map((it) => (
                      <div key={it.id} className="text-[11px] text-slate-700 dark:text-slate-300">
                        {it.product_name}: <span className="tabular-nums">{it.received_qty}/{it.ordered_qty}</span>
                      </div>
                    ))}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatMoney(po.total_amount, currency)}</td>
                  <td className="py-3 px-4 tabular-nums text-slate-500 dark:text-slate-400">{formatDate(po.expected_delivery_date)}</td>
                  <td className="py-3 px-4"><StatusBadge status={po.status} /></td>
                  {hasPermission('purchases.manage') && (
                    <td className="py-3 px-4 text-right">
                      {po.status !== 'received' && po.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => handleReceiveAll(po)}
                          className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          {t('purchases.confirmReceived')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('purchases.modalTitle')}</h2>
            <form onSubmit={handleCreatePo} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('purchases.supplier')}</label>
                <select required value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('purchases.product')}</label>
                <select required value={form.product_id} onChange={(e) => {
                  const p = products.find((x) => x.id === Number(e.target.value));
                  setForm({ ...form, product_id: e.target.value, unit_cost: p ? String(p.purchase_price) : form.unit_cost });
                }} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('purchases.orderedQty')}</label>
                  <input required type="number" min="1" value={form.ordered_qty} onChange={(e) => setForm({ ...form, ordered_qty: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('purchases.unitCost', { currency })}</label>
                  <input required type="number" min="0" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('purchases.expectedDate')}</label>
                <input type="date" value={form.expected_delivery_date} onChange={(e) => setForm({ ...form, expected_delivery_date: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">{t('purchases.issuePo')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
