import { useCallback, useEffect, useState } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatMoney, RWANDA_PROVINCES } from '../../utils/format.js';

export default function BranchesPage() {
  const { activeBusinessId, workspace, loadWorkspace, hasPermission } = useAuth();
  const [branches, setBranches] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', province: 'Kigali City', district: '', address: '', phone: '+250' });
  const [error, setError] = useState('');

  const currency = workspace?.business?.currency_code || 'RWF';

  const loadBranches = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const { data } = await api.get('/branches');
      setBranches(data.branches || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/branches', form);
      setShowCreate(false);
      setForm({ name: '', code: '', province: 'Kigali City', district: '', address: '', phone: '+250' });
      await loadBranches();
      await loadWorkspace(activeBusinessId);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">Branches & Locations</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Compare sales performance and manage operations across Kigali, Huye, Musanze, and new regions.</p>
        </div>
        {hasPermission('branches.manage') && (
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Add Branch
          </button>
        )}
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {branches.map((b) => (
          <div key={b.id} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-mono text-sky-700 dark:text-sky-400 font-semibold">{b.code}{b.is_main ? ' · HQ' : ''}</div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">{b.name}</h2>
                <div className="text-xs text-slate-500 dark:text-slate-400">{b.district || b.province} · {b.address}</div>
              </div>
              <GitBranch className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Total Sales</div>
                <div className="font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{formatMoney(b.total_sales, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Assigned Staff</div>
                <div className="font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{b.staff_count || 0}</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Manager: {b.manager_name || 'Unassigned'} · Tel: {b.phone || '—'}
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">Create New Branch</h2>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <input required placeholder="Branch Name (e.g. Rubavu)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="col-span-2 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
                <input required placeholder="Code (RUB-01)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono uppercase placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {RWANDA_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <input placeholder="District / City" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              </div>
              <input placeholder="Street / Market Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input placeholder="Branch Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">Create Branch</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
