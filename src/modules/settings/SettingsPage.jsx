import { useCallback, useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import ProfilePhotoUploader from '../../components/ProfilePhotoUploader.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ThemeSelector from '../../components/ThemeSelector.jsx';
import { AFRICAN_COUNTRIES, formatDate, formatDateTime, formatMoney, PAYMENT_METHOD_LABELS } from '../../utils/format.js';
import { validatePasswordStrength } from '../../utils/passwordPolicy.js';

export default function SettingsPage() {
  const { user, activeBusinessId, workspace, loadWorkspace, changeLanguage, hasPermission } = useAuth();
  const canManageBusiness = hasPermission('settings.manage');
  const [tab, setTab] = useState('account');
  const [profile, setProfile] = useState({});
  const [plans, setPlans] = useState([]);
  const [subInfo, setSubInfo] = useState({ subscription: null, payments: [] });
  const [security, setSecurity] = useState({ sessions: [], loginHistory: [] });
  const [auditLogs, setAuditLogs] = useState([]);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadSettingsData = useCallback(async () => {
    if (workspace?.business) {
      setProfile({
        ...workspace.business,
        language: workspace.settings?.language || 'en',
        receipt_header: workspace.settings?.receipt_header || '',
        receipt_footer: workspace.settings?.receipt_footer || '',
        enabled_payment_methods: workspace.settings?.enabled_payment_methods || ['cash', 'mtn_momo', 'airtel_money', 'bank_transfer', 'card'],
      });
    }
    try {
      const meRes = await api.get('/auth/me');
      setSecurity({ sessions: meRes.data.sessions || [], loginHistory: meRes.data.loginHistory || [] });
      if (activeBusinessId && canManageBusiness) {
        const [plRes, subRes, logRes] = await Promise.all([
          api.get('/subscriptions/plans'),
          api.get('/subscriptions/current'),
          api.get('/reports/audit-logs'),
        ]);
        setPlans(plRes.data.plans || []);
        setSubInfo(subRes.data);
        setAuditLogs(logRes.data.logs || []);
      }
    } catch {
      // ignore non-critical tabs
    }
  }, [activeBusinessId, workspace, canManageBusiness]);

  useEffect(() => {
    loadSettingsData();
  }, [loadSettingsData]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.put('/businesses/current', profile);
      changeLanguage(profile.language);
      await loadWorkspace(activeBusinessId);
      setMessage('Business & regional settings saved.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogoUpload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    try {
      await api.post('/businesses/current/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadWorkspace(activeBusinessId);
      setMessage('Business logo uploaded.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubscribe = async (planId) => {
    try {
      const { data } = await api.post('/subscriptions/subscribe', { plan_id: planId, billing_cycle: 'monthly', payment_method: 'mtn_momo' });
      setMessage(data.message);
      await loadSettingsData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const strengthErr = validatePasswordStrength(pwForm.new_password);
    if (strengthErr) {
      setError(strengthErr);
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      setError('New password and confirmation do not match');
      return;
    }
    try {
      const { data } = await api.post('/auth/change-password', pwForm);
      setMessage(data.message);
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleMethod = (method) => {
    const current = profile.enabled_payment_methods || [];
    const next = current.includes(method) ? current.filter((m) => m !== method) : [...current, method];
    setProfile({ ...profile, enabled_payment_methods: next });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">Account & Business Settings</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Manage your profile photo, appearance theme, password, and business workspace configuration.</p>
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
      {message && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{message}</div>}

      <div role="tablist" aria-label="Settings sections" className="inline-flex flex-wrap p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
        {[
          ['account', 'My Account & Theme'],
          ...(canManageBusiness
            ? [
                ['profile', 'Business Profile & Localization'],
                ['subscription', 'Subscription Billing'],
                ['audit', 'Audit Trail'],
              ]
            : []),
          ['security', 'Security & Sessions'],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${tab === k ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'account' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
            <ProfilePhotoUploader
              title="My Profile Image"
              description="Visible across dashboards, team chat, and audit logs. Allowed: JPG, JPEG, PNG, WEBP (max 5MB)."
            />
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">Application Theme</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Choose Light Mode, Dark Mode, or System Default. Saved automatically to your account.
              </p>
              <ThemeSelector showLabels />
            </div>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Full Name</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{user?.full_name}</div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Email Address</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{user?.email}</div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Phone</div>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 tabular-nums">{user?.phone || '—'}</div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Workspace Role</div>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {workspace?.membership?.role_name || (user?.is_platform_admin ? 'Platform Super Admin' : 'User')}
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handlePasswordChange} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">Change Password</h2>
            <p className="text-slate-500 dark:text-slate-400">
              Enter your current password and set a strong new password (min 8 chars, uppercase, lowercase, number, and special character).
            </p>
            <input
              required
              type="password"
              placeholder="Current password"
              value={pwForm.current_password}
              onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <input
              required
              minLength={8}
              type="password"
              placeholder="New password"
              value={pwForm.new_password}
              onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <input
              required
              minLength={8}
              type="password"
              placeholder="Confirm new password"
              value={pwForm.confirm_password}
              onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">Update Password</button>
          </form>
        </div>
      )}

      {tab === 'profile' && canManageBusiness && (
        <form onSubmit={handleSaveProfile} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5 text-xs max-w-4xl">
          <div className="flex items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            {profile.logo_url ? (
              <img src={profile.logo_url} alt="Logo" referrerPolicy="no-referrer" className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-slate-500 dark:text-slate-400">
                LOGO
              </div>
            )}
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Business Logo</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e.target.files?.[0])} />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Business Name</label>
              <input value={profile.name || ''} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Country & Currency Preset</label>
              <select
                value={profile.country || 'Rwanda'}
                onChange={(e) => {
                  const p = AFRICAN_COUNTRIES.find((c) => c.country === e.target.value);
                  setProfile({
                    ...profile,
                    country: e.target.value,
                    currency_code: p ? p.currency : profile.currency_code,
                    timezone: p ? p.timezone : profile.timezone,
                  });
                }}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {AFRICAN_COUNTRIES.map((c) => <option key={c.country} value={c.country}>{c.country} ({c.currency})</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Currency Code</label>
              <input value={profile.currency_code || 'RWF'} onChange={(e) => setProfile({ ...profile, currency_code: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg font-mono" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Timezone</label>
              <input value={profile.timezone || 'Africa/Kigali'} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Default Language</label>
              <select value={profile.language || 'en'} onChange={(e) => setProfile({ ...profile, language: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg">
                <option value="en">English</option>
                <option value="rw">Kinyarwanda</option>
                <option value="fr">Français</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Tax Rate (%)</label>
              <input type="number" step="0.01" value={profile.default_tax_rate ?? 18} onChange={(e) => setProfile({ ...profile, default_tax_rate: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums" />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-2">Enabled Payment Methods</label>
            <div className="flex flex-wrap gap-3">
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, label]) => (
                <label key={k} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={(profile.enabled_payment_methods || []).includes(k)}
                    onChange={() => toggleMethod(k)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Receipt Header</label>
              <input value={profile.receipt_header || ''} onChange={(e) => setProfile({ ...profile, receipt_header: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Receipt Footer</label>
              <input value={profile.receipt_footer || ''} onChange={(e) => setProfile({ ...profile, receipt_footer: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
            </div>
          </div>

          <button type="submit" className="px-5 py-2.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
            Save Configuration
          </button>
        </form>
      )}

      {tab === 'subscription' && canManageBusiness && (
        <div className="space-y-6">
          {subInfo.subscription && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Current Plan</div>
                <div className="text-lg font-bold text-[#0B192C] dark:text-white">{subInfo.subscription.plan_name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Renews / Ends: {formatDate(subInfo.subscription.ends_at)}</div>
              </div>
              <StatusBadge status={subInfo.subscription.status} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((p) => (
              <div key={p.id} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</div>
                  <div className="text-lg font-bold text-[#0B192C] dark:text-sky-400 tabular-nums mt-1">{formatMoney(p.monthly_price_rwf, 'RWF')}/mo</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {p.max_employees} staff · {p.max_branches} branches · {p.max_products} SKUs
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSubscribe(p.id)}
                  className="w-full py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                >
                  Select Plan
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handlePasswordChange} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">Change Password</h2>
            <input required type="password" placeholder="Current password" value={pwForm.current_password} onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
            <input required minLength={8} type="password" placeholder="New password (min 8 chars)" value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
            <input required minLength={8} type="password" placeholder="Confirm new password" value={pwForm.confirm_password} onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
            <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">Update Password</button>
          </form>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">Recent Login Attempts</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
              {security.loginHistory.map((h, i) => (
                <div key={i} className="py-2 flex justify-between text-slate-700 dark:text-slate-300">
                  <span>{h.was_successful ? 'Successful sign-in' : 'Failed attempt'} · {h.ip_address}</span>
                  <span className="text-slate-400 tabular-nums">{formatDateTime(h.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && canManageBusiness && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold">User</th>
                <th className="py-3 px-4 font-semibold">Action</th>
                <th className="py-3 px-4 font-semibold">Entity</th>
                <th className="py-3 px-4 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 px-4 tabular-nums text-slate-500 dark:text-slate-400">{formatDateTime(log.created_at)}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">{log.user_name || 'System'}</td>
                  <td className="py-2.5 px-4 font-mono text-sky-800 dark:text-sky-400">{log.action}</td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{log.entity_type} #{log.entity_id}</td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">{log.changes_json || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
