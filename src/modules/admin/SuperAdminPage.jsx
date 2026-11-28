import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Building2,
  CheckCircle2,
  CreditCard,
  Database,
  Download,
  Gauge,
  Image as ImageIcon,
  KeyRound,
  LifeBuoy,
  Play,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  Wrench,
} from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePlatformConfig } from '../../context/PlatformConfigContext.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
import ProfilePhotoUploader from '../../components/ProfilePhotoUploader.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import ViewMoreFooter from '../../components/ViewMoreFooter.jsx';
import { AFRICAN_COUNTRIES, BUSINESS_CATEGORIES, formatDate, formatDateTime, formatMoney } from '../../utils/format.js';
import { useExpandableList } from '../../utils/listOrder.js';

const DiagnosticsPanel = lazy(() => import('./DiagnosticsPanel.jsx'));

const TABS = [
  { id: 'activities', labelKey: 'superAdmin.tabActivities', icon: Activity },
  { id: 'businesses', labelKey: 'superAdmin.tabBusinesses', icon: Building2 },
  { id: 'users', labelKey: 'superAdmin.tabUsers', icon: Users },
  { id: 'plans', labelKey: 'superAdmin.tabPlans', icon: CreditCard },
  { id: 'support', labelKey: 'superAdmin.tabSupport', icon: LifeBuoy },
  { id: 'diagnostics', labelKey: 'superAdmin.tabDiagnostics', icon: Gauge },
  { id: 'monitoring', labelKey: 'superAdmin.tabMonitoring', icon: CheckCircle2 },
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
  const [regLogoPreview, setRegLogoPreview] = useState('');
  const [submittingReg, setSubmittingReg] = useState(false);
  const [modalError, setModalError] = useState('');
  const [savingModal, setSavingModal] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [bizLogoProgress, setBizLogoProgress] = useState(0);

  // Edit Business Modal
  const [editBiz, setEditBiz] = useState(null);
  const [editLogo, setEditLogo] = useState(null);
  const [editLogoPreview, setEditLogoPreview] = useState('');

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
  const [platformLogoPreview, setPlatformLogoPreview] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [platformLogoProgress, setPlatformLogoProgress] = useState(0);
  const [devVerificationResult, setDevVerificationResult] = useState(null);

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
  const [monitoring, setMonitoring] = useState(null);
  const [loadingMonitoring, setLoadingMonitoring] = useState(false);

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

  const loadMonitoring = useCallback(async () => {
    setLoadingMonitoring(true);
    try {
      const res = await api.get('/admin/monitoring/overview');
      setMonitoring(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMonitoring(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (tab === 'monitoring') {
      loadMonitoring();
    }
  }, [tab, loadMonitoring]);

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

  useEffect(() => {
    return () => {
      if (regLogoPreview && regLogoPreview.startsWith('blob:')) URL.revokeObjectURL(regLogoPreview);
    };
  }, [regLogoPreview]);

  useEffect(() => {
    return () => {
      if (editLogoPreview && editLogoPreview.startsWith('blob:')) URL.revokeObjectURL(editLogoPreview);
    };
  }, [editLogoPreview]);

  useEffect(() => {
    return () => {
      if (platformLogoPreview && platformLogoPreview.startsWith('blob:')) URL.revokeObjectURL(platformLogoPreview);
    };
  }, [platformLogoPreview]);

  const handleSelectBizLogo = (file, target) => {
    setModalError('');
    if (!file) {
      if (target === 'reg') {
        setRegLogo(null);
        setRegLogoPreview('');
      } else {
        setEditLogo(null);
        setEditLogoPreview(editBiz?.logo_url || '');
      }
      return;
    }
    if (file.size === 0) {
      setModalError(t('validation.emptyFile'));
      return;
    }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isGenericMime = !file.type || file.type === 'application/octet-stream';
    if (!allowed.includes(file.type) && !(isGenericMime && ['jpg', 'jpeg', 'png', 'webp'].includes(ext))) {
      setModalError(t('validation.unsupportedImageFormat'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setModalError(t('validation.imageTooLarge'));
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    if (target === 'reg') {
      setRegLogo(file);
      setRegLogoPreview((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return previewUrl;
      });
    } else {
      setEditLogo(file);
      setEditLogoPreview((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return previewUrl;
      });
    }
  };

  const handleRegisterBusiness = async (e) => {
    e.preventDefault();
    if (submittingReg) return;
    setModalError('');
    setSubmittingReg(true);
    setBizLogoProgress(0);
    try {
      const fd = new FormData();
      Object.entries(regForm).forEach(([k, v]) => {
        if (v !== null && v !== undefined) fd.append(k, String(v));
      });
      if (regLogo) fd.append('logo', regLogo);

      const res = await api.post('/admin/businesses', fd, {
        onUploadProgress: (evt) => {
          if (evt.total && regLogo) {
            setBizLogoProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        },
      });
      setShowRegisterModal(false);
      setRegStep(1);
      setRegForm(INITIAL_BIZ_FORM);
      setRegLogo(null);
      setRegLogoPreview('');
      showFlash(res.data.message);
      if (res.data.activation_url) {
        setActivationResult({
          title: `Business Registered: ${res.data.business?.name} (${res.data.business?.business_code})`,
          url: `${window.location.origin}${res.data.activation_url}`,
        });
      }
      await loadOverview();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSubmittingReg(false);
      setBizLogoProgress(0);
    }
  };

  const handleEditBusiness = async (e) => {
    e.preventDefault();
    if (!editBiz || savingModal) return;
    setModalError('');
    setSavingModal(true);
    setBizLogoProgress(0);
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
        onUploadProgress: (evt) => {
          if (evt.total && editLogo) {
            setBizLogoProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        },
      });
      setEditBiz(null);
      setEditLogo(null);
      setEditLogoPreview('');
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSavingModal(false);
      setBizLogoProgress(0);
    }
  };

  const handleBusinessStatus = async (bizId, nextStatus) => {
    if (busyAction) return;
    setError('');
    setBusyAction(`biz-status-${bizId}`);
    try {
      const res = await api.patch(`/admin/businesses/${bizId}/status`, { status: nextStatus });
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleAssignAdmin = async (e) => {
    e.preventDefault();
    if (!assignAdminBiz || savingModal) return;
    setModalError('');
    setSavingModal(true);
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
      setModalError(err.message);
    } finally {
      setSavingModal(false);
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
    if (!deleteBiz || savingModal) return;
    setModalError('');
    setSavingModal(true);
    try {
      const res = await api.delete(`/admin/businesses/${deleteBiz.id}`, {
        data: { reason: deleteReason || 'Controlled retention policy deactivation' },
      });
      setDeleteBiz(null);
      setDeleteReason('');
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSavingModal(false);
    }
  };

  const handleSaveSubscription = async (e) => {
    e.preventDefault();
    if (!subDraft || busyAction) return;
    setError('');
    setBusyAction('save-sub');
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
    } finally {
      setBusyAction('');
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
    if (!planDraft || busyAction) return;
    setError('');
    setBusyAction('save-plan');
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
    } finally {
      setBusyAction('');
    }
  };

  const handleUpdateTicket = async (id, status) => {
    if (busyAction) return;
    setBusyAction(`ticket-${id}`);
    try {
      const res = await api.patch(`/admin/tickets/${id}`, {
        status,
        admin_notes: ticketNotes[id] || undefined,
      });
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleDeleteInquiry = async (inqId) => {
    if (busyAction) return;
    setBusyAction(`inq-${inqId}`);
    try {
      setError('');
      const res = await api.delete(`/admin/inquiries/${inqId}`);
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const parsedFeatureFlags = (() => {
    const defaults = {
      pos_enabled: true,
      marketplace_orders_enabled: true,
      jobs_portal_enabled: true,
      ai_assistant_enabled: true,
      video_ads_enabled: true,
      customer_registration_enabled: true,
      beta_analytics_enabled: false,
    };
    try {
      const raw = platformSettings.feature_flags_json;
      if (!raw) return defaults;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { ...defaults, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    } catch {
      return defaults;
    }
  })();

  const handleToggleFeatureFlag = (flagKey) => {
    const next = { ...parsedFeatureFlags, [flagKey]: !parsedFeatureFlags[flagKey] };
    setPlatformSettings((prev) => ({ ...prev, feature_flags_json: JSON.stringify(next) }));
  };

  const handleToggleDevelopmentMode = async (enabled) => {
    if (busyAction) return;
    setError('');
    setBusyAction('dev-mode');
    try {
      const res = await api.post('/admin/system-mode/development', {
        enabled,
        banner_message: platformSettings.development_banner_message,
        feature_flags: parsedFeatureFlags,
      });
      if (res.data?.settings) setPlatformSettings(res.data.settings);
      setDevVerificationResult(null);
      await refreshPlatformConfig();
      showFlash(res.data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleConfirmDevelopmentRelease = async () => {
    if (busyAction) return;
    setError('');
    setBusyAction('confirm-release');
    try {
      const res = await api.post('/admin/system-mode/confirm-release', {
        feature_flags: parsedFeatureFlags,
      });
      if (res.data?.settings) setPlatformSettings(res.data.settings);
      setDevVerificationResult(res.data);
      await refreshPlatformConfig();
      showFlash(res.data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleFlushServerCache = async () => {
    if (busyAction) return;
    setError('');
    setBusyAction('flush-cache');
    try {
      const res = await api.post('/admin/system-cache/flush');
      showFlash(res.data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleSavePlatformSettings = async (e) => {
    e.preventDefault();
    if (busyAction) return;
    setError('');
    setBusyAction('save-settings');
    try {
      const res = await api.put('/admin/settings', platformSettings);
      setPlatformSettings(res.data.settings || platformSettings);
      await refreshPlatformConfig();
      showFlash(res.data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleSelectPlatformLogo = (file) => {
    setError('');
    if (!file) {
      setPlatformLogoFile(null);
      setPlatformLogoPreview('');
      return;
    }
    if (file.size === 0) {
      setError(t('validation.emptyFile'));
      return;
    }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isGenericMime = !file.type || file.type === 'application/octet-stream';
    if (!allowed.includes(file.type) && !(isGenericMime && ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext))) {
      setError(t('validation.unsupportedLogoFormat'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t('validation.fileTooLarge'));
      return;
    }
    setPlatformLogoFile(file);
    setPlatformLogoPreview((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleUploadPlatformLogo = async (e) => {
    e.preventDefault();
    if (uploadingLogo) return;
    if (!platformLogoFile) {
      setError(t('superAdmin.selectLogoErr'));
      return;
    }
    setError('');
    setUploadingLogo(true);
    setPlatformLogoProgress(0);
    try {
      const fd = new FormData();
      fd.append('logo', platformLogoFile);
      const res = await api.post('/admin/platform-logo', fd, {
        timeout: 0,
        onUploadProgress: (evt) => {
          if (evt.total) {
            setPlatformLogoProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        },
      });
      setPlatformSettings((prev) => ({ ...prev, platform_logo_url: res.data.platform_logo_url || '' }));
      setPlatformLogoFile(null);
      setPlatformLogoPreview('');
      await refreshPlatformConfig();
      showFlash(res.data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingLogo(false);
      setPlatformLogoProgress(0);
    }
  };

  const handleRemovePlatformLogo = async () => {
    if (uploadingLogo) return;
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
    if (busyAction) return;
    setBusyAction('update-creds');
    try {
      setError('');
      const res = await api.patch('/admin/credentials', myCreds);
      setMyCreds((prev) => ({ ...prev, current_password: '', new_password: '' }));
      showFlash(res.data.message);
      await refreshMe();
      await loadOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    if (busyAction) return;
    setBusyAction('create-admin');
    try {
      setError('');
      const res = await api.post('/admin/admins', newAdmin);
      setNewAdmin({ full_name: '', email: '', phone: '+250', password: '', admin_level: 'super_admin' });
      showFlash(res.data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleRunVerification = async () => {
    if (busyAction) return;
    setBusyAction('run-verification');
    setError('');
    try {
      const res = await api.post('/admin/monitoring/run');
      const r = res.data.result;
      showFlash(t('superAdmin.qaRunCompleted', { passed: r.passed_count, total: r.total_count, avg: r.avg_response_ms }));
      await loadMonitoring();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleResolveMonitoringEvent = async (eventId) => {
    if (busyAction) return;
    setBusyAction(`resolve-${eventId}`);
    setError('');
    try {
      const res = await api.patch(`/admin/monitoring/events/${eventId}/resolve`);
      showFlash(res.data.message);
      await loadMonitoring();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleDownloadBackup = async () => {
    if (busyAction) return;
    setBusyAction('download-backup');
    setError('');
    try {
      const res = await api.get('/admin/backup', { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `bta-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      showFlash(t('superAdmin.backupDownloadedMsg'));
      if (tab === 'monitoring') {
        await loadMonitoring();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
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

  const activitiesBox = useExpandableList(filteredActivities, { initialLimit: 8, sortNewest: true });
  const loginAttemptsBox = useExpandableList(data.loginAttempts || [], { initialLimit: 6, sortNewest: true });
  const businessesBox = useExpandableList(filteredBusinesses, { initialLimit: 6, sortNewest: true });
  const usersBox = useExpandableList(filteredUsers, { initialLimit: 8, sortNewest: true });
  const plansBox = useExpandableList(data.plans || [], { initialLimit: 4, sortNewest: true });
  const ticketsBox = useExpandableList(data.tickets || [], { initialLimit: 5, sortNewest: true });
  const inquiriesBox = useExpandableList(data.inquiries || [], { initialLimit: 5, sortNewest: true });
  const requirementsBox = useExpandableList(monitoring?.requirements || [], { initialLimit: 6, sortNewest: true });
  const runsBox = useExpandableList(monitoring?.recentRuns || [], { initialLimit: 5, sortNewest: true });
  const eventsBox = useExpandableList(monitoring?.recentEvents || [], { initialLimit: 5, sortNewest: true });
  const adminsBox = useExpandableList(data.admins || [], { initialLimit: 5, sortNewest: true });

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
              setModalError('');
              setRegLogo(null);
              setRegLogoPreview('');
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
          <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('superAdmin.activityStreamTitle')}
            </div>
            <div className="overflow-x-auto">
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
                  {activitiesBox.totalCount === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 px-4 text-center text-slate-500 dark:text-slate-400">{t('superAdmin.noActivities')}</td>
                    </tr>
                  ) : (
                    activitiesBox.visibleItems.map((log) => (
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
            <ViewMoreFooter
              totalCount={activitiesBox.totalCount}
              visibleCount={activitiesBox.visibleCount}
              initialLimit={8}
              expanded={activitiesBox.expanded}
              onToggle={activitiesBox.toggleExpanded}
            />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between">
            <div>
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('superAdmin.recentAuthTitle')}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto text-xs">
                {loginAttemptsBox.visibleItems.map((la) => (
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
            <ViewMoreFooter
              totalCount={loginAttemptsBox.totalCount}
              visibleCount={loginAttemptsBox.visibleCount}
              initialLimit={6}
              expanded={loginAttemptsBox.expanded}
              onToggle={loginAttemptsBox.toggleExpanded}
            />
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

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
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
                  {businessesBox.totalCount === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 px-4 text-center text-slate-500 dark:text-slate-400">
                        {t('superAdmin.emptyBusinesses')}
                      </td>
                    </tr>
                  ) : (
                    businessesBox.visibleItems.map((b) => (
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
                              <button type="button" onClick={() => { setModalError(''); setEditLogo(null); setEditLogoPreview(b.logo_url || ''); setEditBiz({ ...b }); }} className="font-medium text-slate-700 dark:text-slate-300 hover:underline">
                                {t('common.edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setModalError('');
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
                                    className="font-medium text-amber-800 dark:text-amber-300 hover:underline"
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
                                onClick={() => { setModalError(''); setDeleteReason(''); setDeleteBiz(b); }}
                                className="font-medium text-amber-800 dark:text-amber-300 hover:underline"
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
            <ViewMoreFooter
              totalCount={businessesBox.totalCount}
              visibleCount={businessesBox.visibleCount}
              initialLimit={6}
              expanded={businessesBox.expanded}
              onToggle={businessesBox.toggleExpanded}
            />
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

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
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
                  {usersBox.visibleItems.map((u) => (
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
                            className={`font-medium hover:underline ${u.is_active ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`}
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
            <ViewMoreFooter
              totalCount={usersBox.totalCount}
              visibleCount={usersBox.visibleCount}
              initialLimit={8}
              expanded={usersBox.expanded}
              onToggle={usersBox.toggleExpanded}
            />
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
            {plansBox.visibleItems.map((p) => (
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
          <ViewMoreFooter
            totalCount={plansBox.totalCount}
            visibleCount={plansBox.visibleCount}
            initialLimit={4}
            expanded={plansBox.expanded}
            onToggle={plansBox.toggleExpanded}
            className="rounded-xl border border-slate-200 dark:border-slate-800"
          />
        </div>
      )}

      {/* TAB 5: Support Tickets & Public Contact Inquiries */}
      {tab === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 overflow-hidden">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.supportTicketsTitle', { count: ticketsBox.totalCount })}</h2>
            {ticketsBox.totalCount === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('superAdmin.noTickets')}</div>
            ) : (
              <>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-3 text-xs">
                  {ticketsBox.visibleItems.map((ticket) => (
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
                <ViewMoreFooter
                  totalCount={ticketsBox.totalCount}
                  visibleCount={ticketsBox.visibleCount}
                  initialLimit={5}
                  expanded={ticketsBox.expanded}
                  onToggle={ticketsBox.toggleExpanded}
                  className="-mx-5 -mb-5"
                />
              </>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 overflow-hidden">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.inquiriesTitle', { count: inquiriesBox.totalCount })}</h2>
            {inquiriesBox.totalCount === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('superAdmin.noInquiries')}</div>
            ) : (
              <>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {inquiriesBox.visibleItems.map((inq) => (
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
                            className="text-amber-800 dark:text-amber-300 hover:underline font-medium"
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
                <ViewMoreFooter
                  totalCount={inquiriesBox.totalCount}
                  visibleCount={inquiriesBox.visibleCount}
                  initialLimit={5}
                  expanded={inquiriesBox.expanded}
                  onToggle={inquiriesBox.toggleExpanded}
                  className="-mx-5 -mb-5"
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: Monitoring, Verification Register & Backup */}
      {tab === 'monitoring' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-[#0B192C] dark:text-slate-100">{t('superAdmin.monitoringHeading')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('superAdmin.monitoringDesc')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={handleRunVerification}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                {busyAction === 'run-verification' ? t('superAdmin.runningVerificationBtn') : t('superAdmin.runVerificationBtn')}
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                {busyAction === 'download-backup' ? t('superAdmin.exportingBackupBtn') : t('superAdmin.downloadBackupBtn')}
              </button>
            </div>
          </div>

          {loadingMonitoring && !monitoring ? (
            <div className="text-xs text-slate-500 dark:text-slate-400 py-6">{t('superAdmin.loadingMonitoring')}</div>
          ) : monitoring ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1"><Database className="w-3 h-3" /> {t('superAdmin.healthDbEngine')}</div>
                  <div className="text-sm font-bold uppercase text-slate-900 dark:text-slate-100 mt-1">{monitoring.systemHealth?.dialect || 'sqlite'}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('superAdmin.healthSmtpStatus')}</div>
                  <div className={`text-sm font-bold mt-1 ${monitoring.systemHealth?.smtpConfigured ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                    {monitoring.systemHealth?.smtpConfigured ? t('superAdmin.smtpConfigured') : t('superAdmin.smtpMissing')}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('superAdmin.healthMemory')}</div>
                  <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{monitoring.systemHealth?.memoryRssMb || 0} MB</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('superAdmin.healthUptime')}</div>
                  <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{monitoring.systemHealth?.uptimeSeconds || 0}s</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('superAdmin.healthSecurityAlerts')}</div>
                  <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{monitoring.stats?.security_alerts || 0}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('superAdmin.healthFailedLogins')}</div>
                  <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{monitoring.stats?.failed_logins_total || 0}</div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('superAdmin.requirementsRegisterTitle')}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">{t('superAdmin.colReqId')}</th>
                        <th className="py-2.5 px-4 font-semibold">{t('superAdmin.colReqCategory')}</th>
                        <th className="py-2.5 px-4 font-semibold">{t('superAdmin.colReqTitle')}</th>
                        <th className="py-2.5 px-4 font-semibold">{t('superAdmin.colReqStatus')}</th>
                        <th className="py-2.5 px-4 font-semibold">{t('superAdmin.colReqVerifiedAt')}</th>
                        <th className="py-2.5 px-4 font-semibold">{t('superAdmin.colReqEvidence')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {requirementsBox.visibleItems.map((req) => (
                        <tr key={req.requirement_id}>
                          <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">{req.requirement_id}</td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">{req.module}</td>
                          <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">{req.title}</td>
                          <td className="py-2.5 px-4"><StatusBadge status={req.status} /></td>
                          <td className="py-2.5 px-4 tabular-nums text-slate-500 dark:text-slate-400">
                            {req.last_verified_at ? formatDateTime(req.last_verified_at) : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 max-w-md">{req.evidence || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ViewMoreFooter
                  totalCount={requirementsBox.totalCount}
                  visibleCount={requirementsBox.visibleCount}
                  initialLimit={6}
                  expanded={requirementsBox.expanded}
                  onToggle={requirementsBox.toggleExpanded}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 overflow-hidden">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.recentRunsTitle')}</h3>
                  {runsBox.totalCount === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('superAdmin.noRunsYet')}</p>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-80 overflow-y-auto">
                        {runsBox.visibleItems.map((run) => (
                          <div key={run.id} className="py-2.5 flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                                {run.passed_count}/{run.total_count} {t('superAdmin.checksPassedLabel')} · {run.avg_response_ms}ms
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                {run.trigger_type} · {formatDateTime(run.created_at)}
                              </div>
                            </div>
                            <StatusBadge status={run.overall_status} />
                          </div>
                        ))}
                      </div>
                      <ViewMoreFooter
                        totalCount={runsBox.totalCount}
                        visibleCount={runsBox.visibleCount}
                        initialLimit={5}
                        expanded={runsBox.expanded}
                        onToggle={runsBox.toggleExpanded}
                        className="-mx-5 -mb-5"
                      />
                    </>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 overflow-hidden">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.monitoringEventsTitle')}</h3>
                  {eventsBox.totalCount === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('superAdmin.noMonitoringEvents')}</p>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-80 overflow-y-auto">
                        {eventsBox.visibleItems.map((ev) => (
                          <div key={ev.id} className="py-2.5 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                [{ev.severity.toUpperCase()}] {ev.module}
                              </div>
                              <div className="text-slate-600 dark:text-slate-300 mt-0.5">{ev.message}</div>
                              <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">{formatDateTime(ev.created_at)}</div>
                            </div>
                            {ev.resolved ? (
                              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold shrink-0">{t('superAdmin.resolvedLabel')}</span>
                            ) : (
                              <button
                                type="button"
                                disabled={Boolean(busyAction)}
                                onClick={() => handleResolveMonitoringEvent(ev.id)}
                                className="px-2.5 py-1 text-[11px] font-semibold border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                              >
                                {t('superAdmin.resolveBtn')}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <ViewMoreFooter
                        totalCount={eventsBox.totalCount}
                        visibleCount={eventsBox.visibleCount}
                        initialLimit={5}
                        expanded={eventsBox.expanded}
                        onToggle={eventsBox.toggleExpanded}
                        className="-mx-5 -mb-5"
                      />
                    </>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* TAB 6B: Real-Time Scalability & Latency Diagnostics */}
      {tab === 'diagnostics' && (
        <Suspense
          fallback={
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse" aria-busy="true">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-28 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
              ))}
            </div>
          }
        >
          <DiagnosticsPanel onNotify={showFlash} onError={setError} />
        </Suspense>
      )}

      {/* TAB 7: Full System Settings & Development Mode */}
      {tab === 'settings' && (
        <div className="space-y-6 max-w-4xl">
          {/* Super Admin Development & Release Staging Mode */}
          <div
            className={`p-6 rounded-xl border text-xs space-y-4 transition-colors ${
              platformSettings.development_mode === '1'
                ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wrench className={`w-4 h-4 ${platformSettings.development_mode === '1' ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400'}`} />
                  <h2 className="text-sm font-bold text-[#0B192C] dark:text-slate-100">
                    {t('superAdmin.devModeTitle')}
                  </h2>
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  {t('superAdmin.devModeDesc')}
                </p>
                {platformSettings.development_last_confirmed_at && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">
                    {t('superAdmin.devLastConfirmed', {
                      date: formatDateTime(platformSettings.development_last_confirmed_at),
                      user: platformSettings.development_last_confirmed_by || 'Super Admin',
                    })}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {platformSettings.development_mode === '1' ? (
                  <>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={handleConfirmDevelopmentRelease}
                      className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {busyAction === 'confirm-release' ? t('common.saving') : t('superAdmin.confirmTurnOffDevBtn')}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => handleToggleDevelopmentMode(false)}
                      className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {t('superAdmin.turnOffDevBtn')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() => handleToggleDevelopmentMode(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    {busyAction === 'dev-mode' ? t('common.saving') : t('superAdmin.turnOnDevBtn')}
                  </button>
                )}
              </div>
            </div>

            {platformSettings.development_mode === '1' && (
              <div className="pt-4 border-t border-amber-200 dark:border-amber-800/70 space-y-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('superAdmin.devBannerMsgLabel')}
                  </label>
                  <input
                    value={platformSettings.development_banner_message || ''}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, development_banner_message: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mb-2">
                    {t('superAdmin.stagedFlagsTitle')}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {[
                      ['pos_enabled', t('nav.pos')],
                      ['marketplace_orders_enabled', t('nav.orders')],
                      ['jobs_portal_enabled', t('nav.jobs')],
                      ['ai_assistant_enabled', t('nav.ai')],
                      ['video_ads_enabled', t('nav.ads')],
                      ['customer_registration_enabled', t('footer.customerRegistration')],
                      ['beta_analytics_enabled', t('superAdmin.betaAnalyticsFlag')],
                    ].map(([flagKey, flagLabel]) => (
                      <label
                        key={flagKey}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(parsedFeatureFlags[flagKey])}
                          onChange={() => handleToggleFeatureFlag(flagKey)}
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200">{flagLabel}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {devVerificationResult?.checks && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {t('superAdmin.releaseChecksTitle')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {devVerificationResult.checks.map((chk) => (
                    <div key={chk.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-700 dark:text-slate-200">{chk.label}</span>
                      <StatusBadge status={chk.passed ? 'passed' : 'failed'} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

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
                  className="inline-flex items-center gap-1.5 px-3 py-2 font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('superAdmin.removeLogoBtn')}
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 pt-2">
              <div className="h-20 min-w-[160px] px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                {(platformLogoPreview || platformSettings.platform_logo_url) ? (
                  <img
                    src={platformLogoPreview || platformSettings.platform_logo_url}
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
                  onChange={(e) => handleSelectPlatformLogo(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                />
                {uploadingLogo && platformLogoProgress > 0 && (
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-600 transition-all duration-150" style={{ width: `${platformLogoProgress}%` }} />
                  </div>
                )}
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

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.systemReliabilityTitle')}</div>
                  <p className="text-slate-500 dark:text-slate-400">{t('superAdmin.systemReliabilityDesc')}</p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={handleFlushServerCache}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('superAdmin.flushCacheBtn')}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.sessionTimeoutLabel')}</label>
                  <input
                    type="number"
                    min={15}
                    max={10080}
                    value={platformSettings.session_timeout_minutes || '480'}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, session_timeout_minutes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.maxUploadMbLabel')}</label>
                  <input
                    type="number"
                    min={2}
                    max={250}
                    value={platformSettings.max_upload_size_mb || '25'}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, max_upload_size_mb: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.apiRateLimitLabel')}</label>
                  <input
                    type="number"
                    min={60}
                    max={20000}
                    value={platformSettings.api_rate_limit_rpm || '1200'}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, api_rate_limit_rpm: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.auditRetentionLabel')}</label>
                  <input
                    type="number"
                    min={30}
                    max={3650}
                    value={platformSettings.audit_log_retention_days || '365'}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, audit_log_retention_days: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                  />
                </div>
              </div>
              <div className="space-y-2 text-slate-700 dark:text-slate-300">
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
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={platformSettings.allow_customer_registration !== '0'}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, allow_customer_registration: e.target.checked ? '1' : '0' })}
                  />
                  <span>{t('superAdmin.allowCustomerRegLabel')}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={platformSettings.allow_business_onboarding !== '0'}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, allow_business_onboarding: e.target.checked ? '1' : '0' })}
                  />
                  <span>{t('superAdmin.allowBizOnboardingLabel')}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={platformSettings.auto_backup_enabled !== '0'}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, auto_backup_enabled: e.target.checked ? '1' : '0' })}
                  />
                  <span>{t('superAdmin.autoBackupLabel')}</span>
                </label>
                <label className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-semibold">
                  <input
                    type="checkbox"
                    checked={platformSettings.maintenance_mode === '1'}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, maintenance_mode: e.target.checked ? '1' : '0' })}
                  />
                  <span>{t('superAdmin.maintenanceModeLabel')}</span>
                </label>
                {platformSettings.maintenance_mode === '1' && (
                  <div className="pt-1">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('superAdmin.maintenanceMsgLabel')}
                    </label>
                    <input
                      value={platformSettings.maintenance_message || ''}
                      onChange={(e) => setPlatformSettings({ ...platformSettings, maintenance_message: e.target.value })}
                      className="w-full px-3 py-2 border border-rose-300 dark:border-rose-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>
            </div>
            <button type="submit" disabled={Boolean(busyAction)} className="px-5 py-2.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors disabled:opacity-50">
              {busyAction === 'save-settings' ? t('common.saving') : t('superAdmin.savePlatformSettingsBtn')}
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
                    <PasswordInput value={myCreds.current_password} onChange={(e) => setMyCreds({ ...myCreds, current_password: e.target.value })} autoComplete="current-password" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.newPwLabel')}</label>
                    <PasswordInput minLength={8} value={myCreds.new_password} onChange={(e) => setMyCreds({ ...myCreds, new_password: e.target.value })} autoComplete="new-password" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
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
                  <PasswordInput required minLength={8} value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} autoComplete="new-password" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
              </div>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                {t('superAdmin.createAdminBtn')}
              </button>
            </form>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 overflow-hidden">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('superAdmin.activeAdminsTitle')}</h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {adminsBox.visibleItems.map((a) => (
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
              <ViewMoreFooter
                totalCount={adminsBox.totalCount}
                visibleCount={adminsBox.visibleCount}
                initialLimit={5}
                expanded={adminsBox.expanded}
                onToggle={adminsBox.toggleExpanded}
                className="-mx-5 -mb-5"
              />
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

            {modalError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-800 dark:text-rose-200">
                {modalError}
              </div>
            )}

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
                    <div className="space-y-1.5">
                      <label className="block font-semibold text-slate-700 dark:text-slate-300">{t('superAdmin.bizLogoOptLabel')}</label>
                      <div className="flex items-center gap-2">
                        {regLogoPreview && (
                          <img src={regLogoPreview} alt="Logo" className="w-9 h-9 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                        )}
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleSelectBizLogo(e.target.files?.[0] || null, 'reg')} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
                      </div>
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
            {modalError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-800 dark:text-rose-200">
                {modalError}
              </div>
            )}
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
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">{t('superAdmin.replaceLogoOptLabel')}</label>
                <div className="flex items-center gap-2.5">
                  {editLogoPreview && (
                    <img src={editLogoPreview} alt={editBiz.name} referrerPolicy="no-referrer" className="w-10 h-10 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                  )}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleSelectBizLogo(e.target.files?.[0] || null, 'edit')} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
                </div>
                {savingModal && editLogo && bizLogoProgress > 0 && (
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-600 transition-all duration-150" style={{ width: `${bizLogoProgress}%` }} />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 pt-1 text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={Boolean(editBiz.is_public_listed)} onChange={(e) => setEditBiz({ ...editBiz, is_public_listed: e.target.checked ? 1 : 0 })} />
                <span>{t('superAdmin.publicListedLabel')}</span>
              </label>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" disabled={savingModal} onClick={() => setEditBiz(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={savingModal} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60">{savingModal ? t('common.saving') : t('superAdmin.saveChangesBtn')}</button>
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
            {modalError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-800 dark:text-rose-200">
                {modalError}
              </div>
            )}
            <form onSubmit={handleAssignAdmin} className="space-y-3 text-xs">
              <input required placeholder={t('superAdmin.adminFullNamePlaceholder')} value={assignForm.full_name} onChange={(e) => setAssignForm({ ...assignForm, full_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input required type="email" placeholder={t('superAdmin.adminEmailPlaceholder')} value={assignForm.email} onChange={(e) => setAssignForm({ ...assignForm, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <input required placeholder={t('superAdmin.adminPhonePlaceholder')} value={assignForm.phone} onChange={(e) => setAssignForm({ ...assignForm, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <label className="flex items-center gap-2 pt-1 text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={assignForm.replace_previous} onChange={(e) => setAssignForm({ ...assignForm, replace_previous: e.target.checked })} />
                <span>{t('superAdmin.deactivatePrevAdminLabel')}</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={savingModal} onClick={() => setAssignAdminBiz(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={savingModal} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60">{savingModal ? t('common.saving') : t('superAdmin.assignIssueBtn')}</button>
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
            {modalError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-800 dark:text-rose-200">
                {modalError}
              </div>
            )}
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
                <button type="button" disabled={savingModal} onClick={() => setDeleteBiz(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={savingModal} className="px-4 py-2 font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg disabled:opacity-60">{savingModal ? t('common.saving') : t('superAdmin.confirmArchiveBtn')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
