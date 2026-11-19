import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, LayoutGrid, Mail, MonitorSmartphone, Shield, Upload } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import LanguageSelector from '../../components/LanguageSelector.jsx';
import ProfilePhotoUploader from '../../components/ProfilePhotoUploader.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ThemeSelector from '../../components/ThemeSelector.jsx';
import { AFRICAN_COUNTRIES, formatDate, formatDateTime, formatMoney, getPaymentMethodLabel, PAYMENT_METHOD_LABELS } from '../../utils/format.js';
import { validatePasswordStrength } from '../../utils/passwordPolicy.js';

const DEFAULT_DASHBOARD_PREFS = {
  density: 'comfortable',
  default_tab: 'overview',
  widgets: {
    sales_kpis: true,
    finance_summary: true,
    payroll_summary: true,
    daily_chart: true,
    top_products: true,
    branch_performance: true,
    audit_activity: true,
  },
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, activeBusinessId, workspace, loadWorkspace, changeLanguage, hasPermission, refreshMe, savePreferences } = useAuth();
  const canManageBusiness = hasPermission('settings.manage');
  const [tab, setTab] = useState('account');
  const [profile, setProfile] = useState({});
  const [plans, setPlans] = useState([]);
  const [subInfo, setSubInfo] = useState({ subscription: null, payments: [] });
  const [security, setSecurity] = useState({ sessions: [], loginHistory: [] });
  const [auditLogs, setAuditLogs] = useState([]);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });

  // Personal Profile, Privacy & Email Change
  const [personalForm, setPersonalForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
    location: user?.location || '',
    privacy_settings: {
      profile_visibility: user?.privacy_settings?.profile_visibility || 'workspace',
      show_online_status: user?.privacy_settings?.show_online_status !== false,
      activity_tracking: user?.privacy_settings?.activity_tracking !== false,
    },
  });
  const [emailChange, setEmailChange] = useState({
    open: false,
    step: 'request',
    new_email: '',
    current_password: '',
    otp_code: '',
    devOtpPreview: '',
  });
  const [dashPrefs, setDashPrefs] = useState(() => ({
    ...DEFAULT_DASHBOARD_PREFS,
    ...(user?.dashboard_preferences || {}),
    widgets: {
      ...DEFAULT_DASHBOARD_PREFS.widgets,
      ...(user?.dashboard_preferences?.widgets || {}),
    },
  }));

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingAction, setSavingAction] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoProgress, setLogoProgress] = useState(0);

  useEffect(() => {
    if (!user) return;
    setPersonalForm({
      full_name: user.full_name || '',
      phone: user.phone || '',
      bio: user.bio || '',
      location: user.location || '',
      privacy_settings: {
        profile_visibility: user.privacy_settings?.profile_visibility || 'workspace',
        show_online_status: user.privacy_settings?.show_online_status !== false,
        activity_tracking: user.privacy_settings?.activity_tracking !== false,
      },
    });
    setDashPrefs({
      ...DEFAULT_DASHBOARD_PREFS,
      ...(user.dashboard_preferences || {}),
      widgets: {
        ...DEFAULT_DASHBOARD_PREFS.widgets,
        ...(user.dashboard_preferences?.widgets || {}),
      },
    });
  }, [user]);

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

  const handleSavePersonal = async (e) => {
    e.preventDefault();
    if (savingAction) return;
    setError('');
    setMessage('');
    setSavingAction('personal');
    try {
      const { data } = await api.put('/auth/profile', personalForm);
      await refreshMe();
      setMessage(data.message || t('settings.personalUpdated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleRequestEmailChange = async (e) => {
    e.preventDefault();
    if (savingAction) return;
    setError('');
    setMessage('');
    setSavingAction('emailRequest');
    try {
      const { data } = await api.post('/auth/request-email-change', {
        new_email: emailChange.new_email,
        current_password: emailChange.current_password,
      });
      setEmailChange((prev) => ({
        ...prev,
        step: 'verify',
        devOtpPreview: data.devOtpPreview || '',
      }));
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleVerifyEmailChange = async (e) => {
    e.preventDefault();
    if (savingAction) return;
    setError('');
    setMessage('');
    setSavingAction('emailVerify');
    try {
      const { data } = await api.post('/auth/verify-email-change', {
        new_email: emailChange.new_email,
        otp_code: emailChange.otp_code,
      });
      await refreshMe();
      setEmailChange({ open: false, step: 'request', new_email: '', current_password: '', otp_code: '', devOtpPreview: '' });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleSaveDashPrefs = async (e) => {
    e.preventDefault();
    if (savingAction) return;
    setError('');
    setMessage('');
    setSavingAction('dashPrefs');
    try {
      const data = await savePreferences({ dashboard_preferences: dashPrefs });
      setMessage(data.message || t('settings.dashPrefsSaved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (savingAction) return;
    setError('');
    setMessage('');
    setSavingAction('business');
    try {
      await api.put('/businesses/current', profile);
      changeLanguage(profile.language);
      await loadWorkspace(activeBusinessId);
      setMessage(t('settings.businessSaved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleLogoUpload = async (file) => {
    if (!file || uploadingLogo) return;
    setError('');
    setMessage('');
    if (file.size === 0) {
      setError(t('validation.emptyFile'));
      return;
    }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isGenericMime = !file.type || file.type === 'application/octet-stream';
    if (!allowed.includes(file.type) && !(isGenericMime && ['jpg', 'jpeg', 'png', 'webp'].includes(ext))) {
      setError(t('validation.unsupportedImageFormat'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t('validation.imageTooLarge'));
      return;
    }
    setUploadingLogo(true);
    setLogoProgress(0);
    const fd = new FormData();
    fd.append('logo', file);
    try {
      await api.post('/businesses/current/logo', fd, {
        timeout: 0,
        onUploadProgress: (evt) => {
          if (evt.total) {
            setLogoProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        },
      });
      await loadWorkspace(activeBusinessId);
      setMessage(t('settings.logoUploaded'));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingLogo(false);
      setLogoProgress(0);
    }
  };

  const handleSubscribe = async (planId) => {
    if (savingAction) return;
    setError('');
    setMessage('');
    setSavingAction(`subscribe-${planId}`);
    try {
      const { data } = await api.post('/subscriptions/subscribe', { plan_id: planId, billing_cycle: 'monthly', payment_method: 'mtn_momo' });
      setMessage(data.message);
      await loadSettingsData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction('');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (savingAction) return;
    setError('');
    setMessage('');
    const strengthErr = validatePasswordStrength(pwForm.new_password);
    if (strengthErr) {
      setError(strengthErr);
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      setError(t('settings.passwordMismatch'));
      return;
    }
    setSavingAction('password');
    try {
      const { data } = await api.post('/auth/change-password', pwForm);
      setMessage(data.message);
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleRevokeSession = async (sessionId) => {
    if (savingAction) return;
    setError('');
    setMessage('');
    setSavingAction(`revoke-${sessionId}`);
    try {
      const { data } = await api.delete(`/auth/sessions/${sessionId}`);
      setMessage(data.message);
      await loadSettingsData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleRevokeOtherSessions = async () => {
    if (savingAction) return;
    setError('');
    setMessage('');
    setSavingAction('revokeOthers');
    try {
      const { data } = await api.post('/auth/sessions/revoke-others');
      setMessage(data.message);
      await loadSettingsData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction('');
    }
  };

  const toggleMethod = (method) => {
    const current = profile.enabled_payment_methods || [];
    const next = current.includes(method) ? current.filter((m) => m !== method) : [...current, method];
    setProfile({ ...profile, enabled_payment_methods: next });
  };

  // RBAC-filtered widget customization options
  const widgetOptions = [
    ...(hasPermission('dashboard.view') || user?.is_platform_admin
      ? [
          ['sales_kpis', t('settings.widgetSalesKpis')],
          ['daily_chart', t('settings.widgetDailyChart')],
          ['top_products', t('settings.widgetTopProducts')],
          ['branch_performance', t('settings.widgetBranchPerf')],
        ]
      : []),
    ...(hasPermission('finance.view') || user?.is_platform_admin ? [['finance_summary', t('settings.widgetFinance')]] : []),
    ...(hasPermission('payroll.view') || user?.is_platform_admin ? [['payroll_summary', t('settings.widgetPayroll')]] : []),
    ...(hasPermission('reports.view') || user?.is_platform_admin ? [['audit_activity', t('settings.widgetAudit')]] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('settings.title')}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('settings.subtitle')}
        </p>
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
      {message && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{message}</div>}

      <div role="tablist" aria-label={t('settings.tabsLabel')} className="inline-flex flex-wrap p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
        {[
          ['account', t('settings.tabAccount')],
          ['customize', t('settings.tabCustomize')],
          ...(canManageBusiness
            ? [
                ['profile', t('settings.tabProfile')],
                ['subscription', t('settings.tabSubscription')],
                ['audit', t('settings.tabAudit')],
              ]
            : []),
          ['security', t('settings.tabSecurity')],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === k ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'account' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
              <ProfilePhotoUploader
                title={t('settings.profileImageTitle')}
                description={t('settings.profileImageDesc')}
              />

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">{t('settings.accountEmail')}</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{user?.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmailChange((prev) => ({ ...prev, open: !prev.open }))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {t('settings.changeEmail')}
                  </button>
                </div>

                {emailChange.open && (
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                    {emailChange.step === 'request' ? (
                      <form onSubmit={handleRequestEmailChange} className="space-y-2.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{t('settings.verifyNewEmail')}</div>
                        <input
                          required
                          type="email"
                          placeholder={t('settings.newEmailPlaceholder')}
                          value={emailChange.new_email}
                          onChange={(e) => setEmailChange({ ...emailChange, new_email: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                        <input
                          required
                          type="password"
                          placeholder={t('settings.currentPasswordPlaceholder')}
                          value={emailChange.current_password}
                          onChange={(e) => setEmailChange({ ...emailChange, current_password: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                        <div className="flex gap-2">
                          <button type="submit" disabled={Boolean(savingAction)} className="px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg disabled:opacity-60">
                            {savingAction === 'emailRequest' ? t('common.saving') : t('settings.sendOtpBtn')}
                          </button>
                          <button type="button" onClick={() => setEmailChange({ ...emailChange, open: false })} className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg">
                            {t('common.cancel')}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyEmailChange} className="space-y-2.5">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {t('settings.enterOtpFor', { email: emailChange.new_email })}
                        </div>
                        {emailChange.devOtpPreview && (
                          <div className="p-2 rounded bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200">
                            {t('settings.otpPreviewLabel')} <span className="font-mono font-bold">{emailChange.devOtpPreview}</span>
                          </div>
                        )}
                        <input
                          required
                          placeholder={t('settings.otpPlaceholder')}
                          value={emailChange.otp_code}
                          onChange={(e) => setEmailChange({ ...emailChange, otp_code: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                        />
                        <div className="flex gap-2">
                          <button type="submit" disabled={Boolean(savingAction)} className="px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg disabled:opacity-60">
                            {savingAction === 'emailVerify' ? t('common.saving') : t('settings.verifyUpdateEmail')}
                          </button>
                          <button type="button" onClick={() => setEmailChange({ ...emailChange, step: 'request' })} className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg">
                            {t('common.back')}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSavePersonal} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3.5 text-xs">
              <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('settings.personalPrivacyTitle')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.fullName')}</label>
                  <input
                    required
                    value={personalForm.full_name}
                    onChange={(e) => setPersonalForm({ ...personalForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.phoneNumber')}</label>
                  <input
                    required
                    value={personalForm.phone}
                    onChange={(e) => setPersonalForm({ ...personalForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.location')}</label>
                <input
                  value={personalForm.location}
                  onChange={(e) => setPersonalForm({ ...personalForm, location: e.target.value })}
                  placeholder={t('settings.locationPlaceholder')}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.biography')}</label>
                <textarea
                  rows={2}
                  value={personalForm.bio}
                  onChange={(e) => setPersonalForm({ ...personalForm, bio: e.target.value })}
                  placeholder={t('settings.biographyPlaceholder')}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="font-semibold text-slate-800 dark:text-slate-200">{t('settings.privacyControls')}</div>
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1">{t('settings.profileVisibility')}</label>
                  <select
                    value={personalForm.privacy_settings.profile_visibility}
                    onChange={(e) =>
                      setPersonalForm({
                        ...personalForm,
                        privacy_settings: { ...personalForm.privacy_settings, profile_visibility: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="workspace">{t('settings.visWorkspace')}</option>
                    <option value="public">{t('settings.visPublic')}</option>
                    <option value="private">{t('settings.visPrivate')}</option>
                  </select>
                </div>
                <label className="flex items-center justify-between py-1">
                  <span className="text-slate-700 dark:text-slate-300">{t('settings.showOnlineStatus')}</span>
                  <input
                    type="checkbox"
                    checked={personalForm.privacy_settings.show_online_status}
                    onChange={(e) =>
                      setPersonalForm({
                        ...personalForm,
                        privacy_settings: { ...personalForm.privacy_settings, show_online_status: e.target.checked },
                      })
                    }
                  />
                </label>
              </div>
              <button type="submit" disabled={Boolean(savingAction)} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60">
                {savingAction === 'personal' ? t('common.saving') : t('settings.savePersonalBtn')}
              </button>
            </form>
          </div>

          <form onSubmit={handlePasswordChange} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs self-start">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('settings.changePasswordTitle')}</h2>
            <p className="text-slate-500 dark:text-slate-400">
              {t('settings.changePasswordDesc')}
            </p>
            <input
              required
              type="password"
              placeholder={t('settings.currentPw')}
              value={pwForm.current_password}
              onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <input
              required
              minLength={8}
              type="password"
              placeholder={t('settings.newPw')}
              value={pwForm.new_password}
              onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <input
              required
              minLength={8}
              type="password"
              placeholder={t('settings.confirmNewPw')}
              value={pwForm.confirm_password}
              onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <button type="submit" disabled={Boolean(savingAction)} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60">
              {savingAction === 'password' ? t('common.saving') : t('settings.updatePasswordBtn')}
            </button>
          </form>
        </div>
      )}

      {tab === 'customize' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('settings.languagePrefTitle')}</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settings.languagePrefDesc')}
              </p>
              <LanguageSelector showFullNames />
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('settings.themeTitle')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settings.themeDesc')}
              </p>
              <ThemeSelector showLabels />
            </div>
          </div>

          <form onSubmit={handleSaveDashPrefs} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs self-start">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('settings.dashLayoutTitle')}</h2>
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              {t('settings.dashLayoutDesc')}
            </p>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.spacingDensity')}</label>
              <select
                value={dashPrefs.density}
                onChange={(e) => setDashPrefs({ ...dashPrefs, density: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="comfortable">{t('settings.densityComfortable')}</option>
                <option value="compact">{t('settings.densityCompact')}</option>
              </select>
            </div>

            {widgetOptions.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="font-semibold text-slate-800 dark:text-slate-200">{t('settings.visibleWidgets')}</div>
                {widgetOptions.map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between py-1">
                    <span className="text-slate-700 dark:text-slate-300">{label}</span>
                    <input
                      type="checkbox"
                      checked={dashPrefs.widgets[key] !== false}
                      onChange={(e) =>
                        setDashPrefs({
                          ...dashPrefs,
                          widgets: { ...dashPrefs.widgets, [key]: e.target.checked },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            )}

            <button type="submit" disabled={Boolean(savingAction)} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60">
              {savingAction === 'dashPrefs' ? t('common.saving') : t('settings.savePrefsBtn')}
            </button>
          </form>
        </div>
      )}

      {tab === 'profile' && canManageBusiness && (
        <form onSubmit={handleSaveProfile} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5 text-xs max-w-4xl">
          <div className="flex flex-wrap items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            {profile.logo_url ? (
              <img src={profile.logo_url} alt={t('settings.logoAlt')} referrerPolicy="no-referrer" className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-slate-500 dark:text-slate-400">
                {t('settings.logoBadge')}
              </div>
            )}
            <div className="space-y-1.5">
              <label className={`inline-flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 rounded-lg ${uploadingLogo ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingLogo ? t('superAdmin.uploadingBtn') : t('settings.uploadLogo')}</span>
                <input
                  type="file"
                  disabled={uploadingLogo}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    handleLogoUpload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {uploadingLogo && logoProgress > 0 && (
                <div className="w-40 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-600 transition-all duration-150" style={{ width: `${logoProgress}%` }} />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.businessName')}</label>
              <input value={profile.name || ''} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.countryPreset')}</label>
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
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.currencyCode')}</label>
              <input value={profile.currency_code || 'RWF'} onChange={(e) => setProfile({ ...profile, currency_code: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg font-mono" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.timezone')}</label>
              <input value={profile.timezone || 'Africa/Kigali'} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.defaultLang')}</label>
              <select value={profile.language || 'en'} onChange={(e) => setProfile({ ...profile, language: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg">
                <option value="en">{t('language.en')}</option>
                <option value="rw">{t('language.rw')}</option>
                <option value="fr">{t('language.fr')}</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.taxRate')}</label>
              <input type="number" step="0.01" value={profile.default_tax_rate ?? 18} onChange={(e) => setProfile({ ...profile, default_tax_rate: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums" />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-2">{t('settings.enabledPayMethods')}</label>
            <div className="flex flex-wrap gap-3">
              {Object.keys(PAYMENT_METHOD_LABELS).map((k) => (
                <label key={k} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={(profile.enabled_payment_methods || []).includes(k)}
                    onChange={() => toggleMethod(k)}
                  />
                  <span>{getPaymentMethodLabel(k)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.receiptHeader')}</label>
              <input value={profile.receipt_header || ''} onChange={(e) => setProfile({ ...profile, receipt_header: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('settings.receiptFooter')}</label>
              <input value={profile.receipt_footer || ''} onChange={(e) => setProfile({ ...profile, receipt_footer: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
            </div>
          </div>

          <button type="submit" disabled={Boolean(savingAction)} className="px-5 py-2.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60">
            {savingAction === 'business' ? t('common.saving') : t('settings.saveConfigBtn')}
          </button>
        </form>
      )}

      {tab === 'subscription' && canManageBusiness && (
        <div className="space-y-6">
          {subInfo.subscription && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('settings.currentPlan')}</div>
                <div className="text-lg font-bold text-[#0B192C] dark:text-white">{subInfo.subscription.plan_name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t('settings.renewsEnds', { date: formatDate(subInfo.subscription.ends_at) })}
                </div>
              </div>
              <StatusBadge status={subInfo.subscription.status} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((p) => (
              <div key={p.id} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</div>
                  <div className="text-lg font-bold text-[#0B192C] dark:text-sky-400 tabular-nums mt-1">
                    {formatMoney(p.monthly_price_rwf, 'RWF')}{t('settings.perMonth')}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {t('settings.planLimits', { staff: p.max_employees, branches: p.max_branches, products: p.max_products })}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={Boolean(savingAction)}
                  onClick={() => handleSubscribe(p.id)}
                  className="w-full py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
                >
                  {savingAction === `subscribe-${p.id}` ? t('common.saving') : t('settings.selectPlan')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-sm text-[#0B192C] dark:text-white">
                <MonitorSmartphone className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                {t('settings.activeSessions')}
              </div>
              <button
                type="button"
                onClick={handleRevokeOtherSessions}
                className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                {t('settings.signOutOthers')}
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
              {security.sessions.map((s) => (
                <div key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {s.device_info || t('settings.browserSession')} {s.is_current ? t('settings.currentTag') : ''}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      IP: {s.ip_address || t('settings.ipUnknown')} · {formatDateTime(s.created_at)}
                    </div>
                  </div>
                  {s.is_revoked ? (
                    <StatusBadge status="inactive" />
                  ) : s.is_current ? (
                    <StatusBadge status="active" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.id)}
                      className="px-2.5 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                    >
                      {t('settings.revoke')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-sm text-[#0B192C] dark:text-white">
              <Shield className="w-4 h-4 text-slate-500" />
              {t('settings.recentLogins')}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
              {security.loginHistory.map((h, i) => (
                <div key={i} className="py-2 flex justify-between text-slate-700 dark:text-slate-300">
                  <span>{h.was_successful ? t('settings.loginSuccess') : t('settings.loginFailed')} · {h.ip_address}</span>
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
                <th className="py-3 px-4 font-semibold">{t('settings.auditTimestamp')}</th>
                <th className="py-3 px-4 font-semibold">{t('settings.auditUser')}</th>
                <th className="py-3 px-4 font-semibold">{t('settings.auditAction')}</th>
                <th className="py-3 px-4 font-semibold">{t('settings.auditEntity')}</th>
                <th className="py-3 px-4 font-semibold">{t('settings.auditDetails')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 px-4 tabular-nums text-slate-500 dark:text-slate-400">{formatDateTime(log.created_at)}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">{log.user_name || t('settings.systemUser')}</td>
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
