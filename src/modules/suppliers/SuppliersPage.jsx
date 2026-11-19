import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatMoney, getPaymentMethodLabel } from '../../utils/format.js';

export default function SuppliersPage() {
  const { t } = useTranslation();
  const { activeBusinessId, workspace, hasPermission } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'bank_transfer', reference_number: '' });
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '+250', email: '', address: '', tax_number: '', notes: '' });
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  const currency = workspace?.business?.currency_code || 'RWF';

  const loadSuppliers = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const { data } = await api.get('/suppliers');
      setSuppliers(data.suppliers || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setSaving(true);
    try {
      await api.post('/suppliers', form);
      setShowCreate(false);
      setForm({ name: '', contact_person: '', phone: '+250', email: '', address: '', tax_number: '', notes: '' });
      await loadSuppliers();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePaySupplier = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setSaving(true);
    try {
      await api.post(`/suppliers/${payModal.id}/payments`, payForm);
      setPayModal(null);
      await loadSuppliers();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('suppliers.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('suppliers.subtitle')}</p>
        </div>
        {hasPermission('suppliers.manage') && (
          <button type="button" onClick={() => { setModalError(''); setShowCreate(true); }} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" />
            {t('suppliers.addSupplier')}
          </button>
        )}
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            <tr>
              <th className="py-3 px-4 font-semibold">{t('suppliers.colSupplier')}</th>
              <th className="py-3 px-4 font-semibold">{t('suppliers.colContact')}</th>
              <th className="py-3 px-4 font-semibold">{t('suppliers.colPhoneEmail')}</th>
              <th className="py-3 px-4 font-semibold">{t('suppliers.colAddress')}</th>
              <th className="py-3 px-4 font-semibold text-right">{t('suppliers.colBalanceOwed')}</th>
              {hasPermission('suppliers.manage') && <th className="py-3 px-4 font-semibold text-right">{t('suppliers.colAction')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{s.name}</td>
                <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{s.contact_person || '—'}</td>
                <td className="py-3 px-4">
                  <div className="text-slate-900 dark:text-slate-100">{s.phone}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{s.email}</div>
                </td>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{s.address || '—'}</td>
                <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900 dark:text-slate-100">{formatMoney(s.outstanding_balance, currency)}</td>
                {hasPermission('suppliers.manage') && (
                  <td className="py-3 px-4 text-right">
                    {Number(s.outstanding_balance) > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalError('');
                          setPayModal(s);
                          setPayForm({ amount: String(s.outstanding_balance), payment_method: 'bank_transfer', reference_number: '' });
                        }}
                        className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 hover:underline font-medium"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        {t('suppliers.recordPayment')}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('suppliers.addModalTitle')}</h2>
            {modalError && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{modalError}</div>}
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <input required placeholder={t('suppliers.companyNamePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input placeholder={t('suppliers.contactPlaceholder')} value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input required placeholder={t('suppliers.phonePlaceholder')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input placeholder={t('suppliers.emailPlaceholder')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input placeholder={t('suppliers.addressPlaceholder')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setShowCreate(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50">{saving ? t('common.saving') : t('suppliers.saveSupplier')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('suppliers.payModalTitle', { name: payModal.name })}</h2>
            {modalError && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{modalError}</div>}
            <form onSubmit={handlePaySupplier} className="space-y-3 text-xs">
              <input required type="number" min="1" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
              <select value={payForm.payment_method} onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                <option value="bank_transfer">{getPaymentMethodLabel('bank_transfer')}</option>
                <option value="mtn_momo">{getPaymentMethodLabel('mtn_momo')}</option>
                <option value="cash">{getPaymentMethodLabel('cash')}</option>
              </select>
              <input placeholder={t('suppliers.refPlaceholder')} value={payForm.reference_number} onChange={(e) => setPayForm({ ...payForm, reference_number: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setPayModal(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50">{saving ? t('common.saving') : t('suppliers.recordPayment')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
