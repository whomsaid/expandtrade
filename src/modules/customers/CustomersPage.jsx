import { useCallback, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate, formatMoney } from '../../utils/format.js';
import UserAvatar from '../../components/UserAvatar.jsx';

export default function CustomersPage() {
  const { t } = useTranslation();
  const { activeBusinessId, workspace, hasPermission } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState({ sales: [], notes: [] });
  const [noteInput, setNoteInput] = useState({ note_type: 'general', content: '' });
  const [form, setForm] = useState({ full_name: '', phone: '+250', email: '', address: '', customer_type: 'retail', notes: '' });
  const [error, setError] = useState('');

  const currency = workspace?.business?.currency_code || 'RWF';

  const getCustomerTypeLabel = (type) => {
    const map = {
      retail: t('customers.typeRetail'),
      wholesale: t('customers.typeWholesale'),
      corporate: t('customers.typeCorporate'),
    };
    return map[type] || type;
  };

  const getNoteTypeLabel = (type) => {
    const map = {
      general: t('customers.noteGeneral'),
      feedback: t('customers.noteFeedback'),
      complaint: t('customers.noteComplaint'),
      credit: t('customers.noteCredit'),
    };
    return map[type] || type;
  };

  const loadCustomers = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const { data } = await api.get('/customers', { params: { search } });
      setCustomers(data.customers || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId, search]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/customers', form);
      setShowCreate(false);
      setForm({ full_name: '', phone: '+250', email: '', address: '', customer_type: 'retail', notes: '' });
      await loadCustomers();
    } catch (err) {
      setError(err.message);
    }
  };

  const openProfile = async (c) => {
    setSelected(c);
    try {
      const { data } = await api.get(`/customers/${c.id}/history`);
      setHistory({ sales: data.sales || [], notes: data.notes || [] });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!selected || !noteInput.content.trim()) return;
    setError('');
    try {
      await api.post(`/customers/${selected.id}/notes`, noteInput);
      setNoteInput({ note_type: 'general', content: '' });
      await openProfile(selected);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('customers.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('customers.subtitle')}</p>
        </div>
        {hasPermission('customers.manage') && (
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" />
            {t('customers.addCustomer')}
          </button>
        )}
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('customers.searchPlaceholder')} className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-3 px-4 font-semibold">{t('customers.colCustomer')}</th>
                <th className="py-3 px-4 font-semibold">{t('customers.colType')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('customers.colLoyaltyPts')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('customers.colOutstanding')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('customers.colProfile')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar src={c.avatar_url} name={c.full_name} size="sm" />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{c.full_name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{c.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{getCustomerTypeLabel(c.customer_type)}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-700 dark:text-slate-300">{c.loyalty_points}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-rose-700 dark:text-rose-400">{formatMoney(c.outstanding_balance, currency)}</td>
                  <td className="py-3 px-4 text-right">
                    <button type="button" onClick={() => openProfile(c)} className="text-sky-700 dark:text-sky-400 hover:underline font-medium">{t('customers.view')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          {!selected ? (
            <div className="text-xs text-slate-500 dark:text-slate-400 py-10 text-center">{t('customers.selectPrompt')}</div>
          ) : (
            <>
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-3">
                <UserAvatar src={selected.avatar_url} name={selected.full_name} size="md" />
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">{selected.full_name}</h2>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{selected.phone} · {selected.email || t('customers.noEmail')}</div>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('customers.recentPurchases', { count: history.sales.length })}</h3>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {history.sales.map((s) => (
                    <div key={s.id} className="flex justify-between text-xs py-1 border-b border-slate-50 dark:border-slate-800">
                      <span className="font-mono text-slate-700 dark:text-slate-300">{s.reference_number} · {formatDate(s.created_at)}</span>
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(s.total_amount, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('customers.feedbackNotes')}</h3>
                <div className="space-y-2 max-h-36 overflow-y-auto mb-3">
                  {history.notes.map((n) => (
                    <div key={n.id} className="p-2.5 bg-slate-50 dark:bg-slate-800/70 rounded-lg text-xs border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                        <UserAvatar src={n.author_avatar} name={n.author_name} size="xs" />
                        <span>{getNoteTypeLabel(n.note_type)} · {n.author_name}</span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 mt-1">{n.content}</div>
                    </div>
                  ))}
                </div>
                {hasPermission('customers.manage') && (
                  <form onSubmit={handleAddNote} className="space-y-2 text-xs">
                    <select value={noteInput.note_type} onChange={(e) => setNoteInput({ ...noteInput, note_type: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                      <option value="general">{t('customers.noteGeneral')}</option>
                      <option value="feedback">{t('customers.noteFeedback')}</option>
                      <option value="complaint">{t('customers.noteComplaint')}</option>
                      <option value="credit">{t('customers.noteCredit')}</option>
                    </select>
                    <div className="flex gap-2">
                      <input value={noteInput.content} onChange={(e) => setNoteInput({ ...noteInput, content: e.target.value })} placeholder={t('customers.addNotePlaceholder')} className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
                      <button type="submit" className="px-3 py-1.5 bg-[#0B192C] dark:bg-sky-600 text-white font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">{t('customers.addNoteBtn')}</button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('customers.modalTitle')}</h2>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <input required placeholder={t('customers.fullNamePlaceholder')} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input required placeholder={t('customers.phonePlaceholder')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input placeholder={t('customers.emailPlaceholder')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                <option value="retail">{t('customers.typeRetail')}</option>
                <option value="wholesale">{t('customers.typeWholesale')}</option>
                <option value="corporate">{t('customers.typeCorporate')}</option>
              </select>
              <input placeholder={t('customers.addressPlaceholder')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">{t('customers.saveCustomer')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
