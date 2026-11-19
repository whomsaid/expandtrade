import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bell,
  Briefcase,
  Calendar,
  Clock,
  Download,
  Eye,
  LogOut,
  Package,
  Receipt,
  Search,
  Store,
  User,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.jsx';
import BrandLogo from '../../components/BrandLogo.jsx';
import LanguageSelector from '../../components/LanguageSelector.jsx';
import LogoutConfirmModal from '../../components/LogoutConfirmModal.jsx';
import PrivateDocumentPreviewModal, { downloadPrivateDocument } from '../../components/PrivateDocumentPreviewModal.jsx';
import ProfilePhotoUploader from '../../components/ProfilePhotoUploader.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ThemeSelector from '../../components/ThemeSelector.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import VideoAdPlayer from '../../components/VideoAdPlayer.jsx';
import { api } from '../../services/api.js';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format.js';

const TABS = [
  { id: 'businesses', labelKey: 'customerPortal.tabBusinesses', icon: Store },
  { id: 'orders', labelKey: 'customerPortal.tabOrders', icon: Package },
  { id: 'applications', labelKey: 'customerPortal.tabApplications', icon: Briefcase },
  { id: 'receipts', labelKey: 'customerPortal.tabReceipts', icon: Receipt },
  { id: 'profile', labelKey: 'customerPortal.tabProfile', icon: User },
  { id: 'notifications', labelKey: 'customerPortal.tabNotifications', icon: Bell },
];

export default function CustomerPortalPage() {
  const { t } = useTranslation();
  const { user, sessions, notifications, logout, refreshMe, refreshNotifications, savePreferences } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'businesses');
  const [businesses, setBusinesses] = useState([]);
  const [videos, setVideos] = useState([]);
  const [orders, setOrders] = useState([]);
  const [applications, setApplications] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [history, setHistory] = useState({ reviews: [], inquiries: [], logins: [] });
  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
    location: user?.location || '',
    default_address: '',
    city: '',
    country: 'Rwanda',
    preferred_currency: 'RWF',
    notes: '',
  });
  const [emailChange, setEmailChange] = useState({
    open: false,
    step: 'request',
    new_email: '',
    current_password: '',
    otp_code: '',
    devOtpPreview: '',
  });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dirError, setDirError] = useState('');
  const [savingAction, setSavingAction] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // Job application inspection & withdrawal states
  const [selectedAppDetail, setSelectedAppDetail] = useState(null);
  const [loadingAppDetail, setLoadingAppDetail] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [previewDoc, setPreviewDoc] = useState(null);
  const dirAbortRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 260);
    return () => clearTimeout(timer);
  }, [search]);

  const loadAccountPortalData = useCallback(async () => {
    try {
      const [oRes, aRes, rRes, pRes, hRes] = await Promise.all([
        api.get('/customer/orders'),
        api.get('/customer/applications'),
        api.get('/customer/receipts'),
        api.get('/customer/profile'),
        api.get('/customer/history'),
      ]);
      setOrders(oRes.data.orders || []);
      setApplications(aRes.data.applications || []);
      setReceipts(rRes.data.receipts || []);
      setHistory(hRes.data || { reviews: [], inquiries: [], logins: [] });
      if (pRes.data.user || pRes.data.profile) {
        setProfileForm({
          full_name: pRes.data.user?.full_name || '',
          phone: pRes.data.user?.phone || '',
          bio: pRes.data.user?.bio || user?.bio || '',
          location: pRes.data.user?.location || user?.location || '',
          default_address: pRes.data.profile?.default_address || '',
          city: pRes.data.profile?.city || '',
          country: pRes.data.profile?.country || 'Rwanda',
          preferred_currency: pRes.data.profile?.preferred_currency || 'RWF',
          notes: pRes.data.profile?.notes || '',
        });
      }
    } catch (err) {
      setError(err.message);
    }
  }, [user?.bio, user?.location]);

  const loadPublicDirectory = useCallback(async () => {
    if (dirAbortRef.current) {
      dirAbortRef.current.abort();
    }
    const controller = new AbortController();
    dirAbortRef.current = controller;
    setLoading(true);
    setDirError('');
    try {
      const [bRes, vRes] = await Promise.all([
        api.get('/public/businesses', {
          params: { q: debouncedSearch.trim() || undefined },
          signal: controller.signal,
        }),
        api.get('/public/videos', {
          params: { q: debouncedSearch.trim() || undefined },
          signal: controller.signal,
        }),
      ]);
      setBusinesses(bRes.data.businesses || []);
      setVideos(vRes.data.videos || []);
    } catch (err) {
      if (err.isCanceled) return;
      setDirError(err.message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [debouncedSearch]);

  const loadPortalData = useCallback(async () => {
    await Promise.all([loadAccountPortalData(), loadPublicDirectory()]);
  }, [loadAccountPortalData, loadPublicDirectory]);

  useEffect(() => {
    loadAccountPortalData();
  }, [loadAccountPortalData]);

  useEffect(() => {
    loadPublicDirectory();
    return () => {
      if (dirAbortRef.current) {
        dirAbortRef.current.abort();
      }
    };
  }, [loadPublicDirectory]);

  const openApplicationDetail = useCallback(async (appId) => {
    setLoadingAppDetail(true);
    setError('');
    try {
      const { data } = await api.get(`/customer/applications/${appId}`);
      setSelectedAppDetail(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAppDetail(false);
    }
  }, []);

  useEffect(() => {
    const qTab = searchParams.get('tab');
    const qAppId = searchParams.get('applicationId');
    if (qTab && TABS.some((t) => t.id === qTab)) {
      setTab(qTab);
    }
    if (qAppId) {
      setTab('applications');
      openApplicationDetail(Number(qAppId));
    }
  }, [searchParams, openApplicationDetail]);

  const selectTab = (nextTab) => {
    setTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    next.delete('applicationId');
    setSearchParams(next, { replace: true });
  };

  const closeApplicationDetail = () => {
    setSelectedAppDetail(null);
    if (searchParams.has('applicationId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('applicationId');
      setSearchParams(next, { replace: true });
    }
  };

  const handleDiscardDraft = async (appId) => {
    if (savingAction) return;
    setError('');
    setNotice('');
    setSavingAction(`discard-${appId}`);
    try {
      const { data } = await api.delete(`/customer/applications/${appId}`);
      setNotice(data.message);
      await loadPortalData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleConfirmWithdraw = async (e) => {
    e.preventDefault();
    if (!withdrawTarget || savingAction) return;
    setError('');
    setNotice('');
    setSavingAction('withdraw');
    try {
      const { data } = await api.post(`/customer/applications/${withdrawTarget.id}/withdraw`, {
        reason: withdrawReason,
      });
      setNotice(data.message);
      setWithdrawTarget(null);
      setWithdrawReason('');
      if (selectedAppDetail?.application?.id === withdrawTarget.id) {
        await openApplicationDetail(withdrawTarget.id);
      }
      await loadPortalData();
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
    setNotice('');
    setSavingAction('profile');
    try {
      const custRes = await api.put('/customer/profile', profileForm);
      await api.put('/auth/profile', {
        full_name: profileForm.full_name,
        phone: profileForm.phone,
        bio: profileForm.bio,
        location: profileForm.location,
      });
      setNotice(custRes.data.message || t('customerPortal.profileUpdatedMsg'));
      await refreshMe();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleRequestEmailChange = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
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
      setNotice(data.message);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleVerifyEmailChange = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/auth/verify-email-change', {
        new_email: emailChange.new_email,
        otp_code: emailChange.otp_code,
      });
      await refreshMe();
      setEmailChange({ open: false, step: 'request', new_email: '', current_password: '', otp_code: '', devOtpPreview: '' });
      setNotice(data.message);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTogglePortalDensity = async () => {
    try {
      const currentDensity = user?.dashboard_preferences?.density || 'comfortable';
      await savePreferences({
        dashboard_preferences: {
          ...(user?.dashboard_preferences || {}),
          density: currentDensity === 'compact' ? 'comfortable' : 'compact',
        },
      });
      setNotice(t('customerPortal.spacingSavedMsg'));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/auth/sessions/revoke-others');
      setNotice(data.message);
      await refreshMe();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleMarkNotificationsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      await refreshNotifications();
      setNotice(t('customerPortal.notificationsReadMsg'));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirmLogout = async () => {
    await logout();
    setLogoutConfirmOpen(false);
    navigate('/login');
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-bold tracking-tight text-[#0B192C] dark:text-white whitespace-nowrap">
              <BrandLogo textClassName="text-lg font-bold tracking-tight text-[#0B192C] dark:text-white" imgClassName="h-7 w-auto max-w-[120px] object-contain shrink-0" />
            </Link>
            <nav className="hidden md:flex items-center gap-5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <Link to="/businesses" className="hover:text-slate-900 dark:hover:text-white">{t('customerPortal.publicDirectory')}</Link>
              <Link to="/jobs" className="hover:text-slate-900 dark:hover:text-white">{t('customerPortal.jobVacancies')}</Link>
              <Link to="/track-order" className="hover:text-slate-900 dark:hover:text-white">{t('customerPortal.orderLookup')}</Link>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <LanguageSelector compact />
            <ThemeSelector compact />
            <button
              type="button"
              onClick={() => selectTab('profile')}
              className="hidden sm:flex items-center gap-2.5 text-right hover:opacity-85"
            >
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{user?.full_name}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('customerPortal.customerAccount')}</div>
              </div>
              <UserAvatar src={user?.avatar_url} name={user?.full_name} size="sm" />
            </button>
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t('customerPortal.signOut')}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('customerPortal.title')}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('customerPortal.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">{t('customerPortal.kpiOrders')}</div>
              <div className="text-base font-bold tabular-nums">{orders.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">{t('customerPortal.kpiApplications')}</div>
              <div className="text-base font-bold tabular-nums">{applications.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">{t('customerPortal.kpiReceipts')}</div>
              <div className="text-base font-bold tabular-nums">{receipts.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">{t('customerPortal.kpiUnreadAlerts')}</div>
              <div className="text-base font-bold tabular-nums">{unreadCount}</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg flex items-center justify-between gap-2">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => { setError(''); loadAccountPortalData(); }}
              className="px-2.5 py-1 font-semibold bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 rounded hover:bg-rose-100 dark:hover:bg-rose-900/40 shrink-0"
            >
              {t('common.retry')}
            </button>
          </div>
        )}
        {notice && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{notice}</div>}

        {/* Tabs */}
        <div role="tablist" aria-label={t('customerPortal.tabsAria')} className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#0B192C] dark:bg-sky-600 text-white border-[#0B192C] dark:border-sky-600 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>

        <div key={tab} className="animate-fade-up">

        {tab === 'businesses' && (
          <div className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('customerPortal.searchBusinessesPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>

            {dirError ? (
              <div className="p-4 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center justify-between gap-3">
                <span>{dirError}</span>
                <button
                  type="button"
                  onClick={loadPublicDirectory}
                  className="px-3 py-1.5 font-semibold bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 shrink-0"
                >
                  {t('common.retry')}
                </button>
              </div>
            ) : loading ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 py-8">{t('customerPortal.loadingBusinesses')}</div>
            ) : businesses.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 p-10 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                {t('customerPortal.noBusinessesMatch')}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {businesses.map((b) => (
                  <div key={b.id} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="font-bold text-sm text-slate-900 dark:text-white">{b.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{b.category} · {b.district}, {b.country}</div>
                      {b.description && <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{b.description}</p>}
                    </div>
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 tabular-nums">{t('customerPortal.publishedItemsCount', { count: b.product_count })}</span>
                      <Link
                        to={`/businesses/${b.slug}`}
                        className="px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                      >
                        {t('customerPortal.browseAndOrder')}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && videos.length > 0 && (
              <section className="space-y-3 pt-4">
                <div>
                  <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('customerPortal.promoVideosTitle')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('customerPortal.promoVideosDesc')}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videos.map((vid) => (
                    <VideoAdPlayer key={vid.id} video={vid} showBusiness compact />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'orders' && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 p-10 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('customerPortal.noOrders')}</p>
                <button
                  type="button"
                  onClick={() => selectTab('businesses')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg"
                >
                  {t('customerPortal.browseBusinessesBtn')}
                </button>
              </div>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{o.business_name} · {o.branch_name || t('customerPortal.mainBranch')}</div>
                      <div className="text-base font-bold font-mono text-slate-900 dark:text-white">{o.order_number}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{formatDateTime(o.created_at)}</div>
                    </div>
                    <div className="text-right space-y-1">
                      <StatusBadge status={o.order_status} />
                      <div className="text-sm font-bold text-[#0B192C] dark:text-sky-400 tabular-nums">
                        {formatMoney(o.total_amount, o.currency_code)}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('customerPortal.itemsLabel')}</div>
                      {(o.items || []).map((it) => (
                        <div key={it.id} className="flex justify-between py-0.5 text-slate-600 dark:text-slate-300">
                          <span>{it.product_name} × {it.quantity}</span>
                          <span className="tabular-nums">{formatMoney(Number(it.unit_price) * it.quantity, o.currency_code)}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('customerPortal.trackingHistory')}</div>
                      {(o.history || []).map((h, idx) => (
                        <div key={idx} className="flex justify-between py-0.5 text-slate-600 dark:text-slate-300">
                          <span>{t(`status.${h.new_status}`, { defaultValue: h.new_status.replace(/_/g, ' ') })} {h.note ? `— ${h.note}` : ''}</span>
                          <span className="text-slate-400 tabular-nums">{formatDateTime(h.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'applications' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('customerPortal.myAppsTitle')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('customerPortal.myAppsSubtitle')}
                </p>
              </div>
              <Link
                to="/jobs"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
              >
                {t('customerPortal.browseVacancies')}
              </Link>
            </div>

            {applications.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 p-10 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                <Briefcase className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('customerPortal.noApps')}</p>
                <Link
                  to="/jobs"
                  className="inline-block px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg"
                >
                  {t('customerPortal.exploreVacancies')}
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => {
                  const canWithdraw = ['submitted', 'under_review', 'shortlisted', 'interview_scheduled', 'interview_completed'].includes(app.status);
                  return (
                    <div key={app.id} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">{app.vacancy_title}</span>
                          <StatusBadge status={app.status} />
                          {app.reference_number && (
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{app.reference_number}</span>
                          )}
                        </div>
                        <div className="text-slate-600 dark:text-slate-300">
                          {app.business_name} · {app.vacancy_location}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {app.submitted_at
                            ? t('customerPortal.submittedAt', { date: formatDateTime(app.submitted_at) })
                            : t('customerPortal.draftUpdatedAt', { date: formatDateTime(app.updated_at) })}
                        </div>
                        {app.next_interview_date && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200 font-semibold">
                            <Calendar className="w-3.5 h-3.5" />
                            {t('customerPortal.upcomingInterview', {
                              date: formatDate(app.next_interview_date),
                              time: app.next_interview_time,
                              mode: app.next_interview_mode,
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {app.status === 'draft' ? (
                          <>
                            <Link
                              to={`/jobs/${app.vacancy_id}/apply`}
                              className="px-3.5 py-2 font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-500"
                            >
                              {t('customerPortal.resumeDraft')}
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDiscardDraft(app.id)}
                              className="px-3 py-2 font-semibold text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            >
                              {t('customerPortal.discardDraft')}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openApplicationDetail(app.id)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              {t('customerPortal.viewDetailsStatus')}
                            </button>
                            {canWithdraw && (
                              <button
                                type="button"
                                onClick={() => setWithdrawTarget(app)}
                                className="px-3 py-2 font-semibold text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              >
                                {t('customerPortal.withdraw')}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'receipts' && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-3 px-4 font-semibold">{t('customerPortal.colReceiptNum')}</th>
                  <th className="py-3 px-4 font-semibold">{t('customerPortal.colBusiness')}</th>
                  <th className="py-3 px-4 font-semibold">{t('customerPortal.colSaleRef')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('customerPortal.colTotal')}</th>
                  <th className="py-3 px-4 font-semibold">{t('customerPortal.colPayment')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('customerPortal.colDate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {receipts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-slate-500 dark:text-slate-400">
                      {t('customerPortal.noReceipts')}
                    </td>
                  </tr>
                ) : (
                  receipts.map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white">{r.receipt_number}</td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200">{r.business_name}</td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">{r.reference_number}</td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums">{formatMoney(r.total_amount, r.currency_code)}</td>
                      <td className="py-3 px-4"><StatusBadge status={r.payment_status} /></td>
                      <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400 tabular-nums">{formatDateTime(r.sale_date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
                <ProfilePhotoUploader
                  title={t('customerPortal.photoTitle')}
                  description={t('customerPortal.photoDesc')}
                />
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{t('customerPortal.themeLayoutTitle')}</div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('customerPortal.themeLayoutDesc')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleTogglePortalDensity}
                      className="px-2.5 py-1.5 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      {t('customerPortal.densityBtn', {
                        mode: user?.dashboard_preferences?.density === 'compact'
                          ? t('customerPortal.densityCompact')
                          : t('customerPortal.densityComfortable'),
                      })}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <ThemeSelector showLabels />
                    <LanguageSelector showFullNames />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">{t('customerPortal.accountEmail')}</div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{user?.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEmailChange((prev) => ({ ...prev, open: !prev.open }))}
                      className="px-3 py-1.5 font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      {t('customerPortal.changeEmail')}
                    </button>
                  </div>

                  {emailChange.open && (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                      {emailChange.step === 'request' ? (
                        <form onSubmit={handleRequestEmailChange} className="space-y-2">
                          <input
                            required
                            type="email"
                            placeholder={t('customerPortal.newEmailPlaceholder')}
                            value={emailChange.new_email}
                            onChange={(e) => setEmailChange({ ...emailChange, new_email: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                          <input
                            required
                            type="password"
                            placeholder={t('customerPortal.currentPasswordPlaceholder')}
                            value={emailChange.current_password}
                            onChange={(e) => setEmailChange({ ...emailChange, current_password: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                          <button type="submit" className="px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">
                            {t('customerPortal.sendOtp')}
                          </button>
                        </form>
                      ) : (
                        <form onSubmit={handleVerifyEmailChange} className="space-y-2">
                          {emailChange.devOtpPreview && (
                            <div className="p-2 rounded bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200">
                              {t('customerPortal.otpPreview')} <span className="font-mono font-bold">{emailChange.devOtpPreview}</span>
                            </div>
                          )}
                          <input
                            required
                            placeholder={t('customerPortal.otpPlaceholder')}
                            value={emailChange.otp_code}
                            onChange={(e) => setEmailChange({ ...emailChange, otp_code: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                          />
                          <button type="submit" className="px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">
                            {t('customerPortal.verifySaveEmail')}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('customerPortal.profileFormTitle')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('customerPortal.fullName')}</label>
                    <input required value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('customerPortal.phoneNumber')}</label>
                    <input required value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('customerPortal.location')}</label>
                    <input value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} placeholder={t('customerPortal.locationPlaceholder')} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('customerPortal.defaultAddress')}</label>
                    <input value={profileForm.default_address} onChange={(e) => setProfileForm({ ...profileForm, default_address: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('customerPortal.bioNotes')}</label>
                  <textarea rows={2} value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} placeholder={t('customerPortal.bioPlaceholder')} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('customerPortal.cityDistrict')}</label>
                    <input value={profileForm.city} onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('customerPortal.country')}</label>
                    <input value={profileForm.country} onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('customerPortal.currency')}</label>
                    <input value={profileForm.preferred_currency} onChange={(e) => setProfileForm({ ...profileForm, preferred_currency: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg font-mono" />
                  </div>
                </div>
                <button type="submit" disabled={Boolean(savingAction)} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60">
                  {savingAction === 'profile' ? t('common.saving') : t('customerPortal.saveProfile')}
                </button>
              </form>
            </div>

            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('customerPortal.activeDevicesTitle')}</h2>
                  <button
                    type="button"
                    onClick={handleRevokeOtherSessions}
                    className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg"
                  >
                    {t('customerPortal.signOutOtherDevices')}
                  </button>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-44 overflow-y-auto">
                  {sessions.map((s) => (
                    <div key={s.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{s.device_info || t('customerPortal.browserFallback')}</span>
                        {s.is_current && <span className="ml-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">{t('customerPortal.currentTag')}</span>}
                      </div>
                      <span className="text-slate-400 tabular-nums shrink-0">{formatDateTime(s.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('customerPortal.recentReviewsInquiries')}</h2>
                {history.reviews.length === 0 && history.inquiries.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">{t('customerPortal.noReviewsInquiries')}</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-2">
                    {history.reviews.map((rev) => (
                      <div key={`rev-${rev.id}`} className="pt-2 first:pt-0">
                        <div className="font-semibold text-slate-900 dark:text-white">{t('customerPortal.reviewFor', { name: rev.business_name, rating: rev.rating })}</div>
                        <div className="text-slate-600 dark:text-slate-300">{rev.comment}</div>
                      </div>
                    ))}
                    {history.inquiries.map((inq) => (
                      <div key={`inq-${inq.id}`} className="pt-2">
                        <div className="font-semibold text-slate-900 dark:text-white">{t('customerPortal.messageTo', { name: inq.target_business_name || inq.business_name })}</div>
                        <div className="text-slate-600 dark:text-slate-300">{inq.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-sm font-bold text-[#0B192C] dark:text-white">
                  <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>{t('customerPortal.loginHistoryTitle')}</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                  {(history.logins || []).map((l, idx) => (
                    <div key={idx} className="py-1.5 flex justify-between text-slate-700 dark:text-slate-300">
                      <span>{l.was_successful ? t('customerPortal.loginSuccess') : t('customerPortal.loginFailed')} · {l.ip_address}</span>
                      <span className="text-slate-400 tabular-nums">{formatDateTime(l.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('customerPortal.myNotifications')}</h2>
              <button
                type="button"
                onClick={handleMarkNotificationsRead}
                className="text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline"
              >
                {t('customerPortal.markAllRead')}
              </button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('customerPortal.noNotifications')}</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {notifications.map((n) => (
                  <div key={n.id} className={`py-3 flex flex-wrap items-start justify-between gap-2 ${n.is_read ? '' : 'bg-sky-50/40 dark:bg-sky-950/30 px-2 rounded'}`}>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{n.title}</div>
                      <div className="text-slate-600 dark:text-slate-300 mt-0.5">{n.message}</div>
                      <div className="text-[11px] text-slate-400 mt-1 tabular-nums">{formatDateTime(n.created_at)}</div>
                    </div>
                    {n.related_url && (
                      <Link
                        to={n.related_url}
                        className="text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline shrink-0"
                      >
                        {t('customerPortal.openLink')}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </main>

      {/* Customer Application Inspection Modal */}
      {(loadingAppDetail || selectedAppDetail) && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-up text-xs">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              {selectedAppDetail ? (
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white truncate">
                      {selectedAppDetail.application.vacancy_title}
                    </h2>
                    <StatusBadge status={selectedAppDetail.application.status} />
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {selectedAppDetail.application.business_name} · Ref: <span className="font-mono">{selectedAppDetail.application.reference_number || t('customerPortal.draftTag')}</span>
                  </div>
                </div>
              ) : (
                <div className="font-bold">{t('customerPortal.loadingApp')}</div>
              )}
              <button
                type="button"
                onClick={closeApplicationDetail}
                aria-label={t('customerPortal.closeAppAria')}
                className="p-1.5 text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingAppDetail ? (
              <div className="p-10 text-center text-slate-500">{t('customerPortal.loadingAppDetail')}</div>
            ) : selectedAppDetail && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {selectedAppDetail.interviews?.length > 0 && (
                  <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 space-y-2">
                    <div className="font-bold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {t('customerPortal.scheduledInterviews')}
                    </div>
                    {selectedAppDetail.interviews.map((iv) => (
                      <div key={iv.id} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-sky-200/70 dark:border-sky-800 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                            {t('customerPortal.interviewAt', {
                              date: formatDate(iv.interview_date),
                              time: iv.interview_time,
                              mode: iv.interview_mode,
                            })}
                          </div>
                          {iv.location_or_link && <div className="text-slate-600 dark:text-slate-300">{t('customerPortal.locationOrLink', { value: iv.location_or_link })}</div>}
                          {iv.instructions && <div className="text-slate-500 dark:text-slate-400 mt-0.5">{iv.instructions}</div>}
                        </div>
                        <StatusBadge status={iv.status === 'scheduled' ? 'interview_scheduled' : iv.status} />
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-bold text-slate-900 dark:text-white">{t('customerPortal.statusTimeline')}</div>
                  {selectedAppDetail.status_history.length === 0 ? (
                    <div className="text-slate-500">{t('customerPortal.draftSavedNotSubmitted')}</div>
                  ) : (
                    selectedAppDetail.status_history.map((h) => (
                      <div key={h.id} className="flex justify-between gap-2 py-1 border-b last:border-0 border-slate-200 dark:border-slate-800">
                        <span>
                          <strong>{t(`status.${h.new_status}`, { defaultValue: h.new_status.replace(/_/g, ' ') })}</strong>
                          {h.note ? ` — ${h.note}` : ''}
                        </span>
                        <span className="text-slate-400 tabular-nums shrink-0">{formatDateTime(h.changed_at)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-bold text-slate-900 dark:text-white">{t('customerPortal.uploadedDocsTitle')}</div>
                  {selectedAppDetail.documents.map((doc) => (
                    <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b last:border-0 border-slate-200 dark:border-slate-800">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-white">{doc.document_name}</span>
                        <span className="text-slate-500 dark:text-slate-400 ml-2">({doc.document_type})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                        >
                          <Eye className="w-3 h-3" />
                          {t('customerPortal.preview')}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPrivateDocument(doc.download_url, doc.original_filename)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                        >
                          <Download className="w-3 h-3" />
                          {t('customerPortal.download')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-white">{t('customerPortal.educationTitle', { count: selectedAppDetail.education.length })}</div>
                    {selectedAppDetail.education.map((edu) => (
                      <div key={edu.id} className="text-slate-600 dark:text-slate-300">
                        {edu.education_level} — {edu.institution_name} ({edu.education_status})
                      </div>
                    ))}
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-white">{t('customerPortal.workExperienceTitle')}</div>
                    {!selectedAppDetail.application.has_work_experience ? (
                      <div className="text-slate-600 dark:text-slate-300">{t('customerPortal.noPriorExp')}</div>
                    ) : (
                      selectedAppDetail.experiences.map((ex) => (
                        <div key={ex.id} className="text-slate-600 dark:text-slate-300">
                          {t('customerPortal.atCompany', { title: ex.job_title, company: ex.company_name })} ({ex.start_date} – {ex.is_current ? t('customerPortal.present') : ex.end_date || 'N/A'})
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Withdraw Application Modal */}
      {withdrawTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 p-4">
          <form onSubmit={handleConfirmWithdraw} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full space-y-4 text-xs">
            <h3 className="text-base font-bold text-[#0B192C] dark:text-white">{t('customerPortal.withdrawModalTitle')}</h3>
            <p className="text-slate-600 dark:text-slate-300">
              {t('customerPortal.withdrawConfirmPrefix')} <strong>{withdrawTarget.reference_number}</strong> {t('customerPortal.withdrawConfirmMid')} <strong>{withdrawTarget.vacancy_title}</strong>. {t('customerPortal.withdrawConfirmSuffix')}
            </p>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('customerPortal.withdrawReasonLabel')}</label>
              <input
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder={t('customerPortal.withdrawReasonPlaceholder')}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWithdrawTarget(null)}
                className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {t('customerPortal.keepApplication')}
              </button>
              <button
                type="submit"
                disabled={Boolean(savingAction)}
                className="px-4 py-2 font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 disabled:opacity-60"
              >
                {savingAction === 'withdraw' ? t('common.saving') : t('customerPortal.confirmWithdrawal')}
              </button>
            </div>
          </form>
        </div>
      )}

      <PrivateDocumentPreviewModal document={previewDoc} onClose={() => setPreviewDoc(null)} />

      <LogoutConfirmModal
        open={logoutConfirmOpen}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
}
