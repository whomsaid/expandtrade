import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import WhatsAppContactButton from '../../components/WhatsAppContactButton.jsx';
import { formatMoney } from '../../utils/format.js';

const ALLOWED_EMPLOYEE_ROLE_CODES = [
  'manager',
  'branch_manager',
  'accountant',
  'cashier',
  'salesperson',
  'inventory_manager',
  'customer_service',
];

export default function EmployeesPage() {
  const { t } = useTranslation();
  const { activeBusinessId, workspace, hasPermission } = useAuth();
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '+250', role_id: '', branch_id: '', job_title: '' });
  const [message, setMessage] = useState('');
  const [activationPreviewUrl, setActivationPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  const currency = workspace?.business?.currency_code || 'RWF';
  const employeeRoles = roles.filter((r) => ALLOWED_EMPLOYEE_ROLE_CODES.includes(r.code));

  const loadData = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const [mRes, rRes, bRes] = await Promise.all([
        api.get('/members'),
        api.get('/roles'),
        api.get('/branches'),
      ]);
      setMembers(mRes.data.members || []);
      setInvitations(mRes.data.invitations || []);
      setRoles(rRes.data.roles || []);
      setBranches(bRes.data.branches || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setMessage('');
    setActivationPreviewUrl('');
    setSaving(true);
    try {
      const { data } = await api.post('/members/invite', form);
      setShowInvite(false);
      setMessage(data.message);
      if (data.activation_url) {
        setActivationPreviewUrl(`${window.location.origin}${data.activation_url}`);
      }
      await loadData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMember = async (memberId, patch) => {
    setError('');
    try {
      await api.put(`/members/${memberId}`, patch);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('employees.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('employees.subtitle')}</p>
        </div>
        {hasPermission('employees.manage') && (
          <button
            type="button"
            onClick={() => {
              const cashierRole = employeeRoles.find((r) => r.code === 'cashier') || employeeRoles[0];
              setModalError('');
              setForm({
                full_name: '',
                email: '',
                phone: '+250',
                role_id: cashierRole?.id || '',
                branch_id: branches[0]?.id || '',
                job_title: '',
              });
              setShowInvite(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {t('employees.inviteEmployee')}
          </button>
        )}
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
      {message && (
        <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg space-y-1">
          <div>{message}</div>
          {activationPreviewUrl && (
            <div className="font-mono text-[11px] break-all text-slate-800 dark:text-slate-200">
              {t('employees.activationLinkPrefix')} {activationPreviewUrl}
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            <tr>
              <th className="py-3 px-4 font-semibold">{t('employees.colEmployee')}</th>
              <th className="py-3 px-4 font-semibold">{t('employees.colRole')}</th>
              <th className="py-3 px-4 font-semibold">{t('employees.colBranch')}</th>
              <th className="py-3 px-4 font-semibold text-right">{t('employees.colSalesCount')}</th>
              <th className="py-3 px-4 font-semibold text-right">{t('employees.colSalesVolume')}</th>
              <th className="py-3 px-4 font-semibold">{t('employees.colStatus')}</th>
              {hasPermission('employees.manage') && <th className="py-3 px-4 font-semibold text-right">{t('employees.colAccess')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((m) => {
              const isPrimaryAdmin = m.role_code === 'business_owner' || m.role_code === 'business_admin';
              return (
                <tr key={m.id}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar src={m.avatar_url} name={m.full_name} size="sm" />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{m.full_name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                          <span className="truncate">{m.email} · {m.phone}</span>
                          <WhatsAppContactButton
                            phone={m.phone}
                            available={Boolean(m.whatsapp_available)}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {hasPermission('employees.manage') && !isPrimaryAdmin ? (
                      <select
                        value={m.role_id}
                        onChange={(e) => handleUpdateMember(m.id, { role_id: Number(e.target.value) })}
                        className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      >
                        {employeeRoles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-medium text-slate-800 dark:text-slate-200">{m.role_name}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {m.all_branches_access ? (
                      <span className="text-sky-700 dark:text-sky-400 font-medium">{t('employees.allBranches')}</span>
                    ) : (
                      <span className="text-slate-700 dark:text-slate-300">{m.branch_name || t('employees.unassigned')}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-700 dark:text-slate-300">{m.sales_count || 0}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatMoney(m.total_sales_amount, currency)}</td>
                  <td className="py-3 px-4"><StatusBadge status={m.status} /></td>
                  {hasPermission('employees.manage') && (
                    <td className="py-3 px-4 text-right">
                      {!isPrimaryAdmin && (
                        <button
                          type="button"
                          onClick={() => handleUpdateMember(m.id, { status: m.status === 'active' ? 'deactivated' : 'active' })}
                          className="text-sky-700 dark:text-sky-400 hover:underline font-medium"
                        >
                          {m.status === 'active' ? t('employees.deactivate') : t('employees.activate')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {invitations.length > 0 && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('employees.pendingInvitations')}</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {invitations.map((inv) => (
              <div key={inv.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-slate-700 dark:text-slate-300">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{inv.full_name}</span> ({inv.email}) — {inv.role_name}
                </div>
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all">
                  /activate-account?token={inv.invite_token}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('employees.modalTitle')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('employees.modalSubtitle')}
            </p>
            {modalError && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{modalError}</div>}
            <form onSubmit={handleInvite} className="space-y-3 text-xs">
              <input required placeholder={t('employees.fullNamePlaceholder')} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input required type="email" placeholder={t('employees.emailPlaceholder')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input placeholder={t('employees.phonePlaceholder')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {employeeRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <input placeholder={t('employees.jobTitlePlaceholder')} value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setShowInvite(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50">{saving ? t('common.saving') : t('employees.sendInvite')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
