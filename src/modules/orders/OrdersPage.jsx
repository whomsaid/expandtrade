import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import WhatsAppContactButton from '../../components/WhatsAppContactButton.jsx';
import { formatDateTime, formatMoney } from '../../utils/format.js';

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'ready_for_collection',
  'out_for_delivery',
  'completed',
  'cancelled',
];

export default function OrdersPage() {
  const { t } = useTranslation();
  const { activeBusinessId, workspace, hasPermission } = useAuth();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ customer_name: '', customer_phone: '+250', delivery_address: '', product_id: '', quantity: '1', notes: '' });
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  const currency = workspace?.business?.currency_code || 'RWF';

  const loadOrders = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const [ordRes, prodRes] = await Promise.all([api.get('/orders'), api.get('/products')]);
      setOrders(ordRes.data.orders || []);
      setProducts(prodRes.data.products || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setSaving(true);
    try {
      await api.post('/orders', {
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        delivery_address: form.delivery_address,
        notes: form.notes,
        items: [{ product_id: Number(form.product_id), quantity: Number(form.quantity) }],
      });
      setShowCreate(false);
      await loadOrders();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id, order_status) => {
    try {
      await api.patch(`/orders/${id}/status`, { order_status });
      await loadOrders();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('orders.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('orders.subtitle')}</p>
        </div>
        {hasPermission('orders.manage') && (
          <button
            type="button"
            onClick={() => {
              setModalError('');
              setForm({ customer_name: '', customer_phone: '+250', delivery_address: '', product_id: products[0]?.id || '', quantity: '1', notes: '' });
              setShowCreate(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('orders.newOrder')}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => { setError(''); loadOrders(); }}
            className="px-2.5 py-1 font-semibold bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 rounded hover:bg-rose-100 shrink-0"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            <tr>
              <th className="py-3 px-4 font-semibold">{t('orders.colOrderNum')}</th>
              <th className="py-3 px-4 font-semibold">{t('orders.colDate')}</th>
              <th className="py-3 px-4 font-semibold">{t('orders.colCustomer')}</th>
              <th className="py-3 px-4 font-semibold">{t('orders.colAddress')}</th>
              <th className="py-3 px-4 font-semibold text-right">{t('orders.colTotal')}</th>
              <th className="py-3 px-4 font-semibold">{t('orders.colStatus')}</th>
              {hasPermission('orders.manage') && <th className="py-3 px-4 font-semibold">{t('orders.colUpdateStage')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {orders.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">{t('orders.empty')}</td></tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">{o.order_number}</td>
                  <td className="py-3 px-4 tabular-nums text-slate-500 dark:text-slate-400">{formatDateTime(o.created_at)}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar src={o.customer_avatar} name={o.customer_name} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{o.customer_name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                          <span className="truncate">{o.customer_phone}</span>
                          <WhatsAppContactButton
                            phone={o.customer_phone}
                            available={Boolean(o.customer_whatsapp_available)}
                            prefillText={`Hello ${o.customer_name}, update regarding order ${o.order_number}: `}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{o.delivery_address || t('orders.branchPickup')}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatMoney(o.total_amount, currency)}</td>
                  <td className="py-3 px-4"><StatusBadge status={o.order_status} /></td>
                  {hasPermission('orders.manage') && (
                    <td className="py-3 px-4">
                      <select
                        value={o.order_status}
                        onChange={(e) => handleStatusChange(o.id, e.target.value)}
                        className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      >
                        {ORDER_STATUSES.map((st) => (
                          <option key={st} value={st}>{t(`status.${st}`, { defaultValue: st.replace(/_/g, ' ') })}</option>
                        ))}
                      </select>
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
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('orders.modalTitle')}</h2>
            {modalError && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{modalError}</div>}
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <input required placeholder={t('orders.customerNamePlaceholder')} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input required placeholder={t('orders.customerPhonePlaceholder')} value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input placeholder={t('orders.addressPlaceholder')} value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="grid grid-cols-3 gap-2">
                <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} className="col-span-2 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatMoney(p.selling_price, currency)})</option>)}
                </select>
                <input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setShowCreate(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50">{saving ? t('common.saving') : t('orders.createOrder')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
