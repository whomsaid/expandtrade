import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Building2,
  CreditCard,
  Image as ImageIcon,
  KeyRound,
  LifeBuoy,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePlatformConfig } from '../../context/PlatformConfigContext.jsx';
import ProfilePhotoUploader from '../../components/ProfilePhotoUploader.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { AFRICAN_COUNTRIES, BUSINESS_CATEGORIES, formatDate, formatMoney } from '../../utils/format.js';

const TABS = [
  { id: 'activities', labelKey: 'superAdmin.tabActivities', icon: Activity },
  { id: 'businesses', labelKey: 'superAdmin.tabBusinesses', icon: Building2 },
  { id: 'users', labelKey: 'superAdmin.tabUsers', icon: Users },
  { id: 'plans', labelKey: 'superAdmin.tabPlans', icon: CreditCard },
  { id: 'support', labelKey: 'superAdmin.tabSupport', icon: LifeBuoy },
  { id: 'settings', labelKey: 'superAdmin.tabSettings', icon: Settings },
  { id: 'credentials', labelKey: 'superAdmin.tabCredentials', icon: KeyRound },
];

const INITIAL_BIZ_FORM = {
  name: '',
  category: 'Retail & Supermarket',
  description: '',
  email: '',
  phone: '+250',
  country: 'Rwanda',
  province: 'Kigali City',
  district: 'Gasabo',
  physical_address: '',
  currency_code: 'RWF',
  timezone: 'Africa/Kigali',
  tax_enabled: true,
  default_tax_rate: '18',
  tax_identification_number: '',
  operating_hours: 'Mon-Sat 08:00 - 20:00',
  initial_status: 'pending_activation',
  is_public_listed: true,
  plan_id: '',
  branch_name: 'Main Headquarters',
  admin_full_name: '',
  admin_email: '',
  admin_phone: '+250',
};

const USER_CATEGORY_KEYS = {
  platform_super_admin: 'superAdmin.catSuperAdmin',
  business_admin: 'superAdmin.catBizAdmin',
  employee: 'superAdmin.catEmployee',
  customer: 'superAdmin.catCustomer',
};

export default function SuperAdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refreshMe, switchBusiness } = useAuth();
  const { refreshPlatformConfig } = usePlatformConfig();
  const [tab, setTab] = useState('businesses');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activationResult, setActivationResult] = useState(null);
  const [search, setSearch] = useState('');
  const [bizStatusFilter, setBizStatusFilter] = useState('all');
  const [userCategoryFilter, setUserCategoryFilter] = useState('all');

  // Register Business Wizard Modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regStep, setRegStep] = useState(1);
  const [regForm, setRegForm] = useState(INITIAL_BIZ_FORM);
  const [regLogo, setRegLogo] = useState(null);
  const [submittingReg, setSubmittingReg] = useState(false);

  // Edit Business Modal
  const [editBiz, setEditBiz] = useState(null);
  const [editLogo, setEditLogo] = useState(null);

  // Assign / Replace Business Admin Modal
  const [assignAdminBiz, setAssignAdminBiz] = useState(null);
  const [assignForm, setAssignForm] = useState({ full_name: '', email: '', phone: '+250', replace_previous: true });

  // Delete Business (Retention Policy) Modal
  const [deleteBiz, setDeleteBiz] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');

  // Business subscription editor
  const [subDraft, setSubDraft] = useState(null);

  // Plan editor
  const [planDraft, setPlanDraft] = useState(null);

  // Ticket note editor
  const [ticketNotes, setTicketNotes] = useState({});

  // Platform settings & official logo upload
  const [platformSettings, setPlatformSettings] = useState({});
  const [platformLogoFile, setPlatformLogoFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Credentials forms
  const [myCreds, setMyCreds] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    current_password: '',
    new_password: '',
  });
  const [newAdmin, setNewAdmin] = useState({
    full_name: '',
    email: '',
    phone: '+250',
    password: '',
    admin_level: 'super_admin',
  });

  const loadOverview = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/admin/overview');
      setData(res.data);
      if (res.data.platformSettings) {
        setPlatformSettings(res.data.platformSettings);
      }
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (user) {
      setMyCreds((prev) => ({
        ...prev,
        full_name: user.full_name || prev.full_name,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
      }));
    }
  }, [user]);

  const showFlash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 6000);
  };

  const handleRegisterBusiness = async (e) => {
    e.preventDefault();
    setError('');
    setSubmittingReg(true);
    try {
      const fd = new FormData();
      Object.entries(regForm).forEach(([k, v]) => {
        if (v !== null && v !== undefined) fd.append(k, String(v));
      });
      if (regLogo) fd.append('logo', regLogo);

      const res = await api.post('/admin/businesses', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setShowRegisterModal(false);
      setRegStep(1);
      setRegForm(INITIAL_BIZ_FORM);
      setRegLogo(null);
      showFlash(res.data.message);
      if (res.data.activation_url) {
        setActivationResult({
          title: `Business Registered: ${res.data.business?.name} (${res.data.business?.business_code})`,
          url: `${window.location.origin}${res.data.activation_url}`,
        });
      }
      await loadOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingReg(false);
    }
  };

  const handleEditBusiness = async (e) => {
    e.preventDefault();
    if (!editBiz) return;
    setError('');
    try {
      const fd = new FormData();
      const fields = [
        'name', 'category', 'description', 'email', 'phone', 'country',
        'province', 'district', 'physical_address', 'currency_code',
        'tax_enabled', 'default_tax_rate', 'tax_identification_number',
        'operating_hours', 'is_public_listed',
      ];
      fields.forEach((f) => {
        if (editBiz[f] !== undefined && editBiz[f] !== null) {
          fd.append(f, String(editBiz[f]));
        }
      });
      if (editLogo) fd.append('logo', editLogo);

      const res = await api.put(`/admin/businesses/${editBiz.id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setEditBiz(null);
      setEditLogo(null);
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBusinessStatus = async (bizId, nextStatus) => {
    setError('');
    try {
      const res = await api.patch(`/admin/businesses/${bizId}/status`, { status: nextStatus });
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssignAdmin = async (e) => {
    e.preventDefault();
    if (!assignAdminBiz) return;
    setError('');
    try {
      const res = await api.post(`/admin/businesses/${assignAdminBiz.id}/assign-admin`, assignForm);
      setAssignAdminBiz(null);
      showFlash(res.data.message);
      if (res.data.activation_url) {
        setActivationResult({
          title: `Business Admin Assigned for ${assignAdminBiz.name}`,
          url: `${window.location.origin}${res.data.activation_url}`,
        });
      }
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetAdminAccess = async (biz) => {
    setError('');
    try {
      const res = await api.post(`/admin/businesses/${biz.id}/reset-admin-access`);
      showFlash(res.data.message);
      if (res.data.devResetToken) {
        setActivationResult({
          title: `Password Recovery Token for ${biz.owner_email}`,
          url: `Recovery Token: ${res.data.devResetToken} (Use on /forgot-password)`,
        });
      }
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteBusiness = async (e) => {
    e.preventDefault();
    if (!deleteBiz) return;
    setError('');
    try {
      const res = await api.delete(`/admin/businesses/${deleteBiz.id}`, {
        data: { reason: deleteReason || 'Controlled retention policy deactivation' },
      });
      setDeleteBiz(null);
      setDeleteReason('');
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveSubscription = async (e) => {
    e.preventDefault();
    if (!subDraft) return;
    try {
      const res = await api.patch(`/admin/businesses/${subDraft.businessId}/subscription`, {
        plan_id: Number(subDraft.plan_id),
        billing_cycle: subDraft.billing_cycle,
        status: subDraft.status,
        days: Number(subDraft.days),
      });
      setSubDraft(null);
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleUserStatus = async (u) => {
    try {
      const res = await api.patch(`/admin/users/${u.id}/status`, { is_active: !u.is_active });
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevokeSessions = async (u) => {
    try {
      const res = await api.post(`/admin/users/${u.id}/revoke-sessions`);
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpenWorkspace = async (biz) => {
    try {
      setError('');
      await switchBusiness(biz.id);
      navigate('/app/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleVerifyUserEmail = async (u) => {
    try {
      setError('');
      const res = await api.patch(`/admin/users/${u.id}/verify-email`);
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetUserPassword = async (u) => {
    try {
      setError('');
      const res = await api.post(`/admin/users/${u.id}/reset-password`, {});
      showFlash(res.data.message);
      if (res.data.temporary_password) {
        setActivationResult({
          title: `Temporary Password for ${u.full_name} (${u.email})`,
          url: `Temporary Password: ${res.data.temporary_password} (User must change password on next login)`,
        });
      }
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    if (!planDraft) return;
    try {
      const res = await api.patch(`/admin/plans/${planDraft.id}`, {
        monthly_price_rwf: Number(planDraft.monthly_price_rwf),
        annual_price_rwf: Number(planDraft.annual_price_rwf),
        max_employees: Number(planDraft.max_employees),
        max_branches: Number(planDraft.max_branches),
        max_products: Number(planDraft.max_products),
        max_ai_requests_monthly: Number(planDraft.max_ai_requests_monthly),
        is_active: Boolean(planDraft.is_active),
      });
      setPlanDraft(null);
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateTicket = async (id, status) => {
    try {
      const res = await api.patch(`/admin/tickets/${id}`, {
        status,
        admin_notes: ticketNotes[id] || undefined,
      });
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteInquiry = async (inqId) => {
    try {
      setError('');
      const res = await api.delete(`/admin/inquiries/${inqId}`);
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSavePlatformSettings = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.put('/admin/settings', platformSettings);
      setPlatformSettings(res.data.settings || platformSettings);
      await refreshPlatformConfig();
      showFlash(res.data.message);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUploadPlatformLogo = async (e) => {
    e.preventDefault();
    if (!platformLogoFile) {
      setError(t('superAdmin.selectLogoErr'));
      return;
    }
    setError('');
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('logo', platformLogoFile);
      const res = await api.post('/admin/platform-logo', fd);
      setPlatformSettings((prev) => ({ ...prev, platform_logo_url: res.data.platform_logo_url || '' }));
      setPlatformLogoFile(null);
      await refreshPlatformConfig();
      showFlash(res.data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemovePlatformLogo = async () => {
    setError('');
    setUploadingLogo(true);
    try {
      const res = await api.delete('/admin/platform-logo');
      setPlatformSettings((prev) => ({ ...prev, platform_logo_url: '' }));
      setPlatformLogoFile(null);
      await refreshPlatformConfig();
      showFlash(res.data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleUpdateMyCredentials = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const res = await api.patch('/admin/credentials', myCreds);
      setMyCreds((prev) => ({ ...prev, current_password: '', new_password: '' }));
      showFlash(res.data.message);
      await refreshMe();
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const res = await api.post('/admin/admins', newAdmin);
      setNewAdmin({ full_name: '', email: '', phone: '+250', password: '', admin_level: 'super_admin' });
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!data && error) {
    return <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-200">{error}</div>;
  }
  if (!data) return <div className="text-xs text-slate-500 dark:text-slate-400">{t('superAdmin.loadingControlCenter')}</div>;

  const q = search.trim().toLowerCase();
  const filteredActivities = (data.activityLogs || []).filter(
    (a) =>
      !q ||
      a.action?.toLowerCase().includes(q) ||
      a.user_email?.toLowerCase().includes(q) ||
      a.user_name?.toLowerCase().includes(q) ||
      a.business_name?.toLowerCase().includes(q) ||
      a.entity_type?.toLowerCase().includes(q)
  );
  const filteredBusinesses = (data.businesses || []).filter((b) => {
    const matchesSearch =
      !q ||
      b.name?.toLowerCase().includes(q) ||
      b.business_code?.toLowerCase().includes(q) ||
      b.owner_email?.toLowerCase().includes(q) ||
      b.owner_name?.toLowerCase().includes(q) ||
      b.category?.toLowerCase().includes(q);
    const matchesStatus = bizStatusFilter === 'all' || b.status === bizStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const filteredUsers = (data.users || []).filter((u) => {
    const matchesSearch =
      !q ||
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q);
    const matchesCat = userCategoryFilter === 'all' || u.account_category === userCategoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('superAdmin.title')}</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('superAdmin.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            onClick={() => {
              setRegForm({ ...INITIAL_BIZ_FORM, plan_id: data.plans?.[1]?.id || data.plans?.[0]?.id || '' });
              setRegStep(1);
              setShowRegisterModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('superAdmin.registerNewBusiness')}
          </button>
          <button
            type="button"
            onClick={loadOverview}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-800 dark:text-rose-200">{error}</div>}
      {notice && <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-200">{notice}</div>}
      {activationResult && (
        <div className="p-4 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl text-xs space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-slate-900 dark:text-slate-100">{activationResult.title}</span>
            <button type="button" onClick={() => setActivationResult(null)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">{t('superAdmin.dismiss')}</button>
          </div>
          <div className="font-mono text-[11px] text-sky-900 dark:text-sky-200 break-all">{activationResult.url}</div>
        </div>
      )}

      {/* Global KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('superAdmin.kpiRegisteredBiz')}</div>
          <div className="text-xl font-bold tabular-nums mt-1 text-slate-900 dark:text-slate-100">{data.stats.total_businesses}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {t('superAdmin.kpiActivePending', { active: data.stats.active_businesses, pending: data.stats.pending_activation_businesses || 0 })}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('superAdmin.kpiTotalAccounts')}</div>
          <div className="text-xl font-bold tabular-nums mt-1 text-slate-900 dark:text-slate-100">{data.stats.total_users}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">{t('superAdmin.kpiCustomersCount', { count: data.stats.customer_count || 0 })}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('superAdmin.kpiActiveSessions')}</div>
          <div className="text-xl font-bold tabular-nums mt-1 text-slate-900 dark:text-slate-100">{data.stats.active_sessions}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('superAdmin.kpiAuditEvents')}</div>
          <div className="text-xl font-bold tabular-nums mt-1 text-slate-900 dark:text-slate-100">{data.stats.total_audit_events}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('superAdmin.kpiOpenTickets')}</div>
          <div className="text-xl font-bold tabular-nums mt-1 text-slate-900 dark:text-slate-100">{data.stats.open_tickets}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('superAdmin.kpiSubRevenue')}</div>
          <div className="text-lg font-bold tabular-nums mt-1 text-slate-900 dark:text-slate-100">{formatMoney(data.stats.platform_subscription_revenue, 'RWF')}</div>
        </div>
      </div>

      {/* Control Tabs + Search */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div role="tablist" aria-label={t('superAdmin.tabsAria')} className="flex flex-wrap gap-1.5">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#0B192C] dark:bg-sky-600 text-white border-[#0B192C] dark:border-sky-600 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>
        {(tab === 'activities' || tab === 'businesses' || tab === 'users') && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('superAdmin.filterPlaceholder')}
            className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 w-full lg:w-72"
          />
        )}
      </div>

      {/* TAB 1: System Activities */}
      {tab === 'activities' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('superAdmin.activityStreamTitle')}
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">{t('superAdmin.colTimestamp')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('superAdmin.colAction')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('superAdmin.colActor')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('superAdmin.colTenant')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('superAdmin.colEntity')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredActivities.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 px-4 text-center text-slate-500 dark:text-slate-400">{t('superAdmin.noActivities')}</td>
                  </tr>
                ) : (
                  filteredActivities.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">{formatDate(log.created_at)}</td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">{log.action}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <UserAvatar src={log.user_avatar} name={log.user_name || t('superAdmin.systemActor')} size="xs" />
                          <div>
                            <div className="text-slate-900 dark:text-slate-100">{log.user_name || t('superAdmin.systemActor')}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{log.user_email || log.ip_address || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">{log.business_name || t('superAdmin.platformTenant')}</td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                        {log.entity_type} {log.entity_id ? `#${log.entity_id}` : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('superAdmin.recentAuthTitle')}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto text-xs">
              {(data.loginAttempts || []).map((la) => (
                <div key={la.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{la.email}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {la.ip_address || t('superAdmin.unknownIp')} · {formatDate(la.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={la.was_successful ? 'active' : 'rejected'} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Businesses & Governance */}
      {tab === 'businesses' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {[
              ['all', t('superAdmin.filterAllBiz')],
              ['active', t('status.active')],
              ['pending_activation', t('status.pending_activation')],
              ['suspended', t('status.suspended')],
              ['deactivated', t('status.deactivated')],
              ['deleted', t('superAdmin.filterArchived')],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setBizStatusFilter(val)}
                className={`px-3 py-1 rounded-lg border font-medium transition-colors ${
                  bizStatusFilter === val
                    ? 'bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-600'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {subDraft && (
            <form onSubmit={handleSaveSubscription} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.assignSubTitle', { name: subDraft.businessName })}</div>
                <button type="button" onClick={() => setSubDraft(null)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                  {t('common.cancel')}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.planLabel')}</label>
                  <select
                    value={subDraft.plan_id}
                    onChange={(e) => setSubDraft({ ...subDraft, plan_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {data.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatMoney(p.monthly_price_rwf, 'RWF')}{t('superAdmin.perMonthSuffix')})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.cycleLabel')}</label>
                  <select
                    value={subDraft.billing_cycle}
                    onChange={(e) => setSubDraft({ ...subDraft, billing_cycle: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="monthly">{t('superAdmin.cycleMonthly')}</option>
                    <option value="annual">{t('superAdmin.cycleAnnual')}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.status')}</label>
                  <select
                    value={subDraft.status}
                    onChange={(e) => setSubDraft({ ...subDraft, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="active">{t('status.active')}</option>
                    <option value="trialing">{t('status.trialing')}</option>
                    <option value="past_due">{t('superAdmin.statusPastDue')}</option>
                    <option value="cancelled">{t('status.cancelled')}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.durationDays')}</label>
                  <input
                    type="number"
                    min="1"
                    max="1095"
                    value={subDraft.days}
                    onChange={(e) => setSubDraft({ ...subDraft, days: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                  />
                </div>
              </div>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                {t('superAdmin.saveSubOverride')}
              </button>
            </form>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-3 px-4 font-semibold">{t('superAdmin.colBusiness')}</th>
                  <th className="py-3 px-4 font-semibold">{t('superAdmin.colBizAdmin')}</th>
                  <th className="py-3 px-4 font-semibold">{t('superAdmin.colSubscription')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('superAdmin.colBranchesStaff')}</th>
                  <th className="py-3 px-4 font-semibold">{t('common.status')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('superAdmin.colGovernance')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredBusinesses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 px-4 text-center text-slate-500 dark:text-slate-400">
                      {t('superAdmin.emptyBusinesses')}
                    </td>
                  </tr>
                ) : (
                  filteredBusinesses.map((b) => (
                    <tr key={b.id}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{b.name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{b.business_code || `ID-${b.id}`}</span> · {b.category} · {b.district || b.province}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar src={b.owner_avatar} name={b.owner_name} size="sm" />
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-100">{b.owner_name}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{b.owner_email}</div>
                          </div>
                        </div>
                        {b.admin_activation_status === 'pending_activation' && b.admin_activation_token && (
                          <div className="text-[11px] font-mono text-amber-700 dark:text-amber-400 mt-0.5">
                            {t('status.pending')}: /activate-account?token={b.admin_activation_token}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{b.plan_name || t('superAdmin.unassigned')}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{b.subscription_status || t('common.none').toLowerCase()} · {b.billing_cycle || 'monthly'}</div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {b.branch_count} / {b.employee_count}
                      </td>
                      <td className="py-3 px-4"><StatusBadge status={b.status} /></td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2.5">
                        {b.status !== 'deleted' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenWorkspace(b)}
                              className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                            >
                              {t('superAdmin.openWorkspace')}
                            </button>
                            <button type="button" onClick={() => setEditBiz({ ...b })} className="font-medium text-slate-700 dark:text-slate-300 hover:underline">
                              {t('common.edit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAssignAdminBiz(b);
                                setAssignForm({ full_name: '', email: '', phone: '+250', replace_previous: true });
                              }}
                              className="font-medium text-sky-700 dark:text-sky-400 hover:underline"
                            >
                              {t('superAdmin.assignAdmin')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetAdminAccess(b)}
                              className="font-medium text-amber-700 dark:text-amber-400 hover:underline"
                            >
                              {t('superAdmin.resetAccess')}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSubDraft({
                                  businessId: b.id,
                                  businessName: b.name,
                                  plan_id: b.plan_id || data.plans[0]?.id || 1,
                                  billing_cycle: b.billing_cycle || 'monthly',
                                  status: b.subscription_status || 'active',
                                  days: 30,
                                })
                              }
                              className="font-medium text-sky-700 dark:text-sky-400 hover:underline"
                            >
                              {t('superAdmin.planBtn')}
                            </button>
                            {b.status === 'active' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleBusinessStatus(b.id, 'suspended')}
                                  className="font-medium text-amber-700 dark:text-amber-400 hover:underline"
                                >
                                  {t('superAdmin.suspend')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleBusinessStatus(b.id, 'deactivated')}
                                  className="font-medium text-rose-600 dark:text-rose-400 hover:underline"
                                >
                                  {t('superAdmin.deactivate')}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleBusinessStatus(b.id, 'active')}
                                className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                              >
                                {b.status === 'suspended' ? t('superAdmin.reactivate') : t('superAdmin.activate')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeleteBiz(b)}
                              className="font-medium text-rose-700 dark:text-rose-400 hover:underline"
                            >
                              {t('common.delete')}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Users & Sessions */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              ['all', t('superAdmin.catAll')],
              ['platform_super_admin', t('superAdmin.catSuperAdmins')],
              ['business_admin', t('superAdmin.catBizAdmins')],
              ['employee', t('superAdmin.catEmployees')],
              ['customer', t('superAdmin.catCustomers')],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setUserCategoryFilter(val)}
                className={`px-3 py-1 rounded-lg border font-medium transition-colors ${
                  userCategoryFilter === val
                    ? 'bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-600'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-3 px-4 font-semibold">{t('superAdmin.colUser')}</th>
                  <th className="py-3 px-4 font-semibold">{t('common.phone')}</th>
                  <th className="py-3 px-4 font-semibold">{t('superAdmin.colAccountCategory')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('superAdmin.colWorkspaces')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('superAdmin.colActiveSessions')}</th>
                  <th className="py-3 px-4 font-semibold">{t('superAdmin.colAccountStatus')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('superAdmin.colControls')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar src={u.avatar_url} name={u.full_name} size="sm" />
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{u.full_name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 tabular-nums">{u.phone}</td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{t(USER_CATEGORY_KEYS[u.account_category] || 'superAdmin.catCustomer')}</span>
                      {!u.is_email_verified && <span className="text-amber-700 dark:text-amber-400"> · {t('superAdmin.unverifiedTag')}</span>}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-700 dark:text-slate-300">{u.business_count}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-700 dark:text-slate-300">{u.active_sessions}</td>
                    <td className="py-3 px-4"><StatusBadge status={u.is_active ? 'active' : 'suspended'} /></td>
                    <td className="py-3 px-4 text-right space-x-3 whitespace-nowrap">
                      {!u.is_email_verified && (
                        <button
                          type="button"
                          onClick={() => handleVerifyUserEmail(u)}
                          className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          {t('superAdmin.verifyEmail')}
                        </button>
                      )}
                      {u.id !== user?.id && (
                        <button
                          type="button"
                          onClick={() => handleResetUserPassword(u)}
                          className="font-medium text-amber-700 dark:text-amber-400 hover:underline"
                        >
                          {t('superAdmin.resetPassword')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRevokeSessions(u)}
                        className="font-medium text-sky-700 dark:text-sky-400 hover:underline"
                      >
                        {t('superAdmin.revokeSessions')}
                      </button>
                      {u.id !== user?.id && (
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(u)}
                          className={`font-medium hover:underline ${u.is_active ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}
                        >
                          {u.is_active ? t('superAdmin.deactivate') : t('superAdmin.activate')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Plans & Quotas */}
      {tab === 'plans' && (
        <div className="space-y-4">
          {planDraft && (
            <form onSubmit={handleSavePlan} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.editPlanTitle', { name: planDraft.name })}</div>
                <button type="button" onClick={() => setPlanDraft(null)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                  {t('common.cancel')}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.monthlyRwf')}</label>
                  <input type="number" value={planDraft.monthly_price_rwf} onChange={(e) => setPlanDraft({ ...planDraft, monthly_price_rwf: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.annualRwf')}</label>
                  <input type="number" value={planDraft.annual_price_rwf} onChange={(e) => setPlanDraft({ ...planDraft, annual_price_rwf: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.maxStaff')}</label>
                  <input type="number" value={planDraft.max_employees} onChange={(e) => setPlanDraft({ ...planDraft, max_employees: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.maxBranches')}</label>
                  <input type="number" value={planDraft.max_branches} onChange={(e) => setPlanDraft({ ...planDraft, max_branches: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.maxProducts')}</label>
                  <input type="number" value={planDraft.max_products} onChange={(e) => setPlanDraft({ ...planDraft, max_products: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.monthlyAiCalls')}</label>
                  <input type="number" value={planDraft.max_ai_requests_monthly} onChange={(e) => setPlanDraft({ ...planDraft, max_ai_requests_monthly: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
              </div>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                {t('superAdmin.savePlanSettings')}
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.plans.map((p) => (
              <div key={p.id} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-slate-900 dark:text-slate-100">{p.name}</div>
                    <StatusBadge status={p.is_active ? 'active' : 'suspended'} />
                  </div>
                  <div className="text-lg font-bold text-[#0B192C] dark:text-sky-400 tabular-nums">{formatMoney(p.monthly_price_rwf, 'RWF')}{t('superAdmin.perMonthSuffix')}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{p.target_audience}</div>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 pt-2 space-y-1 tabular-nums">
                    <li>{t('superAdmin.staffLimit', { count: p.max_employees })}</li>
                    <li>{t('superAdmin.branchLimit', { count: p.max_branches })}</li>
                    <li>{t('superAdmin.productLimit', { count: p.max_products })}</li>
                    <li>{t('superAdmin.aiQueriesMo', { count: p.max_ai_requests_monthly })}</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => setPlanDraft({ ...p })}
                  className="w-full py-2 text-xs font-semibold text-[#0B192C] dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t('superAdmin.editLimitsPricing')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: Support Tickets & Public Contact Inquiries */}
      {tab === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.supportTicketsTitle', { count: data.tickets.length })}</h2>
            {data.tickets.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('superAdmin.noTickets')}</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-3 text-xs">
                {data.tickets.map((ticket) => (
                  <div key={ticket.id} className="pt-3 first:pt-0 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{ticket.subject}</div>
                        <div className="text-slate-500 dark:text-slate-400">{ticket.user_name} ({ticket.user_email}) · {ticket.business_name || t('superAdmin.generalTag')}</div>
                        <div className="text-slate-700 dark:text-slate-300 mt-1">{ticket.message}</div>
                      </div>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={ticketNotes[ticket.id] ?? ticket.admin_notes ?? ''}
                        onChange={(e) => setTicketNotes({ ...ticketNotes, [ticket.id]: e.target.value })}
                        placeholder={t('superAdmin.adminNotePlaceholder')}
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateTicket(ticket.id, 'in_progress')}
                        className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        {t('superAdmin.inProgressBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTicket(ticket.id, 'resolved')}
                        className="px-2.5 py-1.5 bg-[#0B192C] dark:bg-sky-600 text-white rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-sky-500"
                      >
                        {t('superAdmin.resolveBtn')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.inquiriesTitle', { count: (data.inquiries || []).length })}</h2>
            {!data.inquiries?.length ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('superAdmin.noInquiries')}</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {data.inquiries.map((inq) => (
                  <div key={inq.id} className="py-3 first:pt-0 space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {inq.full_name} {inq.target_business_name || inq.business_name ? `(${inq.target_business_name || inq.business_name})` : ''}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-slate-400 dark:text-slate-500 tabular-nums">{formatDate(inq.created_at)}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteInquiry(inq.id)}
                          className="text-rose-600 dark:text-rose-400 hover:underline font-medium"
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">{inq.email} {inq.phone ? `· ${inq.phone}` : ''}</div>
                    <div className="text-slate-700 dark:text-slate-300">{inq.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: Platform Settings */}
      {tab === 'settings' && (
        <div className="space-y-6 max-w-4xl">
          {/* Official Platform Logo Management (Super Admin Exclusively) */}
          <form onSubmit={handleUploadPlatformLogo} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-[#0B192C] dark:text-slate-100">{t('superAdmin.officialLogoTitle')}</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('superAdmin.officialLogoDesc')}
                </p>
              </div>
              {platformSettings.platform_logo_url && (
                <button
                  type="button"
                  disabled={uploadingLogo}
                  onClick={handleRemovePlatformLogo}
                  className="inline-flex items-center gap-1.5 px-3 py-2 font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('superAdmin.removeLogoBtn')}
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 pt-2">
              <div className="h-20 min-w-[160px] px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                {platformSettings.platform_logo_url ? (
                  <img
                    src={platformSettings.platform_logo_url}
                    alt={platformSettings.platform_name || 'BizTrade Africa'}
                    referrerPolicy="no-referrer"
                    className="max-h-14 max-w-[180px] object-contain"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <ImageIcon className="w-4 h-4" />
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{t('superAdmin.textWordmarkActive')}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 w-full space-y-2">
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => setPlatformLogoFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={!platformLogoFile || uploadingLogo}
                    className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingLogo ? t('superAdmin.uploadingBtn') : platformSettings.platform_logo_url ? t('superAdmin.replaceLogoBtn') : t('superAdmin.uploadLogoBtn')}
                  </button>
                  {platformLogoFile && (
                    <span className="text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{platformLogoFile.name}</span>
                  )}
                </div>
              </div>
            </div>
          </form>

          <form onSubmit={handleSavePlatformSettings} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6 text-xs">
            <div>
              <h2 className="text-sm font-bold text-[#0B192C] dark:text-slate-100">{t('superAdmin.platformConfigTitle')}</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">{t('superAdmin.platformConfigDesc')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.platformName')}</label>
                <input
                  value={platformSettings.platform_name || 'BizTrade Africa'}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, platform_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.supportEmail')}</label>
                <input
                  type="email"
                  value={platformSettings.support_email || ''}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, support_email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.supportPhone')}</label>
                <input
                  value={platformSettings.support_phone || ''}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, support_phone: e.target.value })}
                  placeholder="+250788..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.officeLocation')}</label>
                <input
                  value={platformSettings.platform_location || ''}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, platform_location: e.target.value })}
                  placeholder="KN 4 Ave, Kigali, Rwanda"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.defaultCurrency')}</label>
                <input
                  value={platformSettings.default_currency || 'RWF'}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, default_currency: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.defaultTaxRate')}</label>
                <input
                  type="number"
                  value={platformSettings.default_tax_rate || '18'}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, default_tax_rate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.retentionDays')}</label>
                <input
                  type="number"
                  value={platformSettings.business_retention_days || '365'}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, business_retention_days: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.socialLinksTitle')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="url"
                  value={platformSettings.social_linkedin_url || ''}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, social_linkedin_url: e.target.value })}
                  placeholder={t('superAdmin.linkedinPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="url"
                  value={platformSettings.social_x_url || ''}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, social_x_url: e.target.value })}
                  placeholder={t('superAdmin.xPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="url"
                  value={platformSettings.social_instagram_url || ''}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, social_instagram_url: e.target.value })}
                  placeholder={t('superAdmin.instagramPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="url"
                  value={platformSettings.social_facebook_url || ''}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, social_facebook_url: e.target.value })}
                  placeholder={t('superAdmin.facebookPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.devSectionTitle')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.devNameLabel')}</label>
                  <input
                    value={platformSettings.developer_name || ''}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, developer_name: e.target.value })}
                    placeholder={t('superAdmin.devNamePlaceholder')}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.devRoleLabel')}</label>
                  <input
                    value={platformSettings.developer_role || 'Full Stack Developer'}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, developer_role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.devEmailLabel')}</label>
                  <input
                    type="email"
                    value={platformSettings.developer_email || ''}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, developer_email: e.target.value })}
                    placeholder="developer@example.com"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.devPortfolioLabel')}</label>
                  <input
                    type="url"
                    value={platformSettings.developer_portfolio_url || ''}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, developer_portfolio_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.devGithubLabel')}</label>
                  <input
                    type="url"
                    value={platformSettings.developer_github_url || ''}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, developer_github_url: e.target.value })}
                    placeholder="https://github.com/..."
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.devLinkedinLabel')}</label>
                  <input
                    type="url"
                    value={platformSettings.developer_linkedin_url || ''}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, developer_linkedin_url: e.target.value })}
                    placeholder="https://linkedin.com/in/..."
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.devBioLabel')}</label>
                <textarea
                  rows={2}
                  value={platformSettings.developer_bio || ''}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, developer_bio: e.target.value })}
                  placeholder={t('superAdmin.devBioPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={platformSettings.allow_customer_reviews !== '0'}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, allow_customer_reviews: e.target.checked ? '1' : '0' })}
                />
                <span>{t('superAdmin.enableReviewsLabel')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={platformSettings.require_email_verification !== '0'}
                  onChange={(e) => setPlatformSettings({ ...platformSettings, require_email_verification: e.target.checked ? '1' : '0' })}
                />
                <span>{t('superAdmin.requireEmailVerifLabel')}</span>
              </label>
            </div>
            <button type="submit" className="px-5 py-2.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors">
              {t('superAdmin.savePlatformSettingsBtn')}
            </button>
          </form>
        </div>
      )}

      {/* TAB 7: Super Admin Credentials & Team */}
      {tab === 'credentials' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
              <ProfilePhotoUploader
                title={t('superAdmin.superAdminPhotoTitle')}
                description={t('superAdmin.superAdminPhotoDesc')}
                onUploaded={() => loadOverview()}
              />
            </div>

            <form onSubmit={handleUpdateMyCredentials} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.updateCredsTitle')}</h2>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('auth.fullName')}</label>
                  <input required value={myCreds.full_name} onChange={(e) => setMyCreds({ ...myCreds, full_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.loginEmailLabel')}</label>
                    <input required type="email" value={myCreds.email} onChange={(e) => setMyCreds({ ...myCreds, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.phone')}</label>
                    <input required value={myCreds.phone} onChange={(e) => setMyCreds({ ...myCreds, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.currentPwLabel')}</label>
                    <input type="password" value={myCreds.current_password} onChange={(e) => setMyCreds({ ...myCreds, current_password: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.newPwLabel')}</label>
                    <input minLength={8} type="password" value={myCreds.new_password} onChange={(e) => setMyCreds({ ...myCreds, new_password: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                  </div>
                </div>
              </div>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                {t('superAdmin.saveCredsBtn')}
              </button>
            </form>
          </div>

          <div className="space-y-6">
            <form onSubmit={handleCreateAdmin} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.addSuperAdminTitle')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('auth.fullName')}</label>
                  <input required value={newAdmin.full_name} onChange={(e) => setNewAdmin({ ...newAdmin, full_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.email')}</label>
                  <input required type="email" value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.phone')}</label>
                  <input required value={newAdmin.phone} onChange={(e) => setNewAdmin({ ...newAdmin, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.passwordMinLabel')}</label>
                  <input required minLength={8} type="password" value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
              </div>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                {t('superAdmin.createAdminBtn')}
              </button>
            </form>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.activeAdminsTitle')}</h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {(data.admins || []).map((a) => (
                  <div key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar src={a.avatar_url} name={a.full_name} size="sm" />
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{a.full_name}</div>
                        <div className="text-slate-500 dark:text-slate-400">{a.email} · {a.phone}</div>
                      </div>
                    </div>
                    <StatusBadge status={a.is_active ? 'active' : 'suspended'} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Super Admin Register Business Wizard */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 my-8 animate-scale-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('superAdmin.regModalTitle')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('superAdmin.regStepHeader', {
                    step: regStep,
                    desc: regStep === 1 ? t('superAdmin.regStepDesc1') : regStep === 2 ? t('superAdmin.regStepDesc2') : t('superAdmin.regStepDesc3'),
                  })}
                </p>
              </div>
              <button type="button" onClick={() => setShowRegisterModal(false)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                {t('common.close')}
              </button>
            </div>

            <form onSubmit={handleRegisterBusiness} className="space-y-4 text-xs">
              {regStep === 1 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.businessName')}</label>
                      <input required value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.category')}</label>
                      <select value={regForm.category} onChange={(e) => setRegForm({ ...regForm, category: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                        {BUSINESS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.bizDescLabel')}</label>
                    <textarea rows={2} value={regForm.description} onChange={(e) => setRegForm({ ...regForm, description: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.bizEmailLabel')}</label>
                      <input required type="email" value={regForm.email} onChange={(e) => setRegForm({ ...regForm, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.bizPhoneLabel')}</label>
                      <input required value={regForm.phone} onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.country')}</label>
                      <select
                        value={regForm.country}
                        onChange={(e) => {
                          const p = AFRICAN_COUNTRIES.find((c) => c.country === e.target.value);
                          setRegForm({
                            ...regForm,
                            country: e.target.value,
                            currency_code: p ? p.currency : regForm.currency_code,
                            timezone: p ? p.timezone : regForm.timezone,
                          });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      >
                        {AFRICAN_COUNTRIES.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.provinceLabel')}</label>
                      <input required value={regForm.province} onChange={(e) => setRegForm({ ...regForm, province: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.districtLabel')}</label>
                      <input required value={regForm.district} onChange={(e) => setRegForm({ ...regForm, district: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.physicalAddrLabel')}</label>
                      <input required value={regForm.physical_address} onChange={(e) => setRegForm({ ...regForm, physical_address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.bizLogoOptLabel')}</label>
                      <input type="file" accept="image/*" onChange={(e) => setRegLogo(e.target.files?.[0] || null)} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
                    </div>
                  </div>
                </div>
              )}

              {regStep === 2 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.currency')}</label>
                      <input required value={regForm.currency_code} onChange={(e) => setRegForm({ ...regForm, currency_code: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.defaultTaxLabel')}</label>
                      <input type="number" step="0.01" value={regForm.default_tax_rate} onChange={(e) => setRegForm({ ...regForm, default_tax_rate: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.tinLabel')}</label>
                      <input value={regForm.tax_identification_number} onChange={(e) => setRegForm({ ...regForm, tax_identification_number: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.opHoursLabel')}</label>
                      <input value={regForm.operating_hours} onChange={(e) => setRegForm({ ...regForm, operating_hours: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.hqBranchLabel')}</label>
                      <input value={regForm.branch_name} onChange={(e) => setRegForm({ ...regForm, branch_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.subPlanLabel')}</label>
                      <select value={regForm.plan_id} onChange={(e) => setRegForm({ ...regForm, plan_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                        {data.plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatMoney(p.monthly_price_rwf, 'RWF')}{t('superAdmin.perMonthSuffix')})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.initStatusLabel')}</label>
                      <select value={regForm.initial_status} onChange={(e) => setRegForm({ ...regForm, initial_status: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                        <option value="pending_activation">{t('superAdmin.initStatusPending')}</option>
                        <option value="active">{t('superAdmin.initStatusActive')}</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6 pt-1 text-slate-700 dark:text-slate-300">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={regForm.tax_enabled} onChange={(e) => setRegForm({ ...regForm, tax_enabled: e.target.checked })} />
                      <span>{t('superAdmin.enableTaxLabel')}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={regForm.is_public_listed} onChange={(e) => setRegForm({ ...regForm, is_public_listed: e.target.checked })} />
                      <span>{t('superAdmin.listPublicLabel')}</span>
                    </label>
                  </div>
                </div>
              )}

              {regStep === 3 && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300">
                    {t('superAdmin.adminInviteNotice')}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.adminFullNameLabel')}</label>
                      <input required value={regForm.admin_full_name} onChange={(e) => setRegForm({ ...regForm, admin_full_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.adminEmailLabel')}</label>
                      <input required type="email" value={regForm.admin_email} onChange={(e) => setRegForm({ ...regForm, admin_email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.adminPhoneLabel')}</label>
                      <input required value={regForm.admin_phone} onChange={(e) => setRegForm({ ...regForm, admin_phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => (regStep > 1 ? setRegStep(regStep - 1) : setShowRegisterModal(false))}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {regStep > 1 ? t('common.back') : t('common.cancel')}
                </button>
                {regStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => setRegStep(regStep + 1)}
                    className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                  >
                    {t('superAdmin.continueBtn')}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={submittingReg}
                    className="px-5 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
                  >
                    {submittingReg ? t('superAdmin.registeringBtn') : t('superAdmin.registerSendBtn')}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Business Info */}
      {editBiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 my-8 animate-scale-in">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('superAdmin.editBizTitle', { name: editBiz.name })}</h2>
              <button type="button" onClick={() => setEditBiz(null)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">{t('common.close')}</button>
            </div>
            <form onSubmit={handleEditBusiness} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.businessName')}</label>
                  <input required value={editBiz.name || ''} onChange={(e) => setEditBiz({ ...editBiz, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.category')}</label>
                  <input required value={editBiz.category || ''} onChange={(e) => setEditBiz({ ...editBiz, category: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.email')}</label>
                  <input required type="email" value={editBiz.email || ''} onChange={(e) => setEditBiz({ ...editBiz, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.phone')}</label>
                  <input required value={editBiz.phone || ''} onChange={(e) => setEditBiz({ ...editBiz, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.districtLabel')}</label>
                  <input value={editBiz.district || ''} onChange={(e) => setEditBiz({ ...editBiz, district: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.currencyTaxLabel')}</label>
                  <div className="flex gap-2">
                    <input value={editBiz.currency_code || 'RWF'} onChange={(e) => setEditBiz({ ...editBiz, currency_code: e.target.value })} className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono" />
                    <input type="number" step="0.01" value={editBiz.default_tax_rate ?? 18} onChange={(e) => setEditBiz({ ...editBiz, default_tax_rate: e.target.value })} className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.physicalAddrLabel')}</label>
                <input value={editBiz.physical_address || ''} onChange={(e) => setEditBiz({ ...editBiz, physical_address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.opHoursLabel')}</label>
                <input value={editBiz.operating_hours || ''} onChange={(e) => setEditBiz({ ...editBiz, operating_hours: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.replaceLogoOptLabel')}</label>
                <input type="file" accept="image/*" onChange={(e) => setEditLogo(e.target.files?.[0] || null)} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
              </div>
              <label className="flex items-center gap-2 pt-1 text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={Boolean(editBiz.is_public_listed)} onChange={(e) => setEditBiz({ ...editBiz, is_public_listed: e.target.checked ? 1 : 0 })} />
                <span>{t('superAdmin.publicListedLabel')}</span>
              </label>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setEditBiz(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">{t('superAdmin.saveChangesBtn')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Assign / Replace Primary Business Admin */}
      {assignAdminBiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('superAdmin.assignAdminTitle', { name: assignAdminBiz.name })}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('superAdmin.assignAdminDesc')}
            </p>
            <form onSubmit={handleAssignAdmin} className="space-y-3 text-xs">
              <input required placeholder={t('superAdmin.adminFullNamePlaceholder')} value={assignForm.full_name} onChange={(e) => setAssignForm({ ...assignForm, full_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input required type="email" placeholder={t('superAdmin.adminEmailPlaceholder')} value={assignForm.email} onChange={(e) => setAssignForm({ ...assignForm, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input required placeholder={t('superAdmin.adminPhonePlaceholder')} value={assignForm.phone} onChange={(e) => setAssignForm({ ...assignForm, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <label className="flex items-center gap-2 pt-1 text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={assignForm.replace_previous} onChange={(e) => setAssignForm({ ...assignForm, replace_previous: e.target.checked })} />
                <span>{t('superAdmin.deactivatePrevAdminLabel')}</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAssignAdminBiz(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">{t('superAdmin.assignIssueBtn')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Controlled Retention Delete */}
      {deleteBiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-rose-700 dark:text-rose-400">{t('superAdmin.deleteBizTitle', { name: deleteBiz.name })}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('superAdmin.deleteBizDesc', { days: platformSettings.business_retention_days || 365 })}
            </p>
            <form onSubmit={handleDeleteBusiness} className="space-y-3 text-xs">
              <textarea
                required
                rows={2}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={t('superAdmin.deleteReasonPlaceholder')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDeleteBiz(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-rose-700 hover:bg-rose-600 rounded-lg">{t('superAdmin.confirmArchiveBtn')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
