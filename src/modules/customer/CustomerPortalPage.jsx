import { useCallback, useEffect, useState } from 'react';
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
import { useAuth } from '../../context/AuthContext.jsx';
import BrandLogo from '../../components/BrandLogo.jsx';
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
  { id: 'businesses', label: 'Discover Businesses', icon: Store },
  { id: 'orders', label: 'My Orders & Tracking', icon: Package },
  { id: 'applications', label: 'My Job Applications', icon: Briefcase },
  { id: 'receipts', label: 'My Receipts', icon: Receipt },
  { id: 'profile', label: 'Profile & History', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

export default function CustomerPortalPage() {
  const { user, notifications, logout, refreshMe, refreshNotifications, savePreferences } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'businesses');
  const [businesses, setBusinesses] = useState([]);
  const [videos, setVideos] = useState([]);
  const [orders, setOrders] = useState([]);
  const [applications, setApplications] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [history, setHistory] = useState({ reviews: [], inquiries: [], logins: [] });
  const [sessions, setSessions] = useState([]);
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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // Job application inspection & withdrawal states
  const [selectedAppDetail, setSelectedAppDetail] = useState(null);
  const [loadingAppDetail, setLoadingAppDetail] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [previewDoc, setPreviewDoc] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 260);
    return () => clearTimeout(timer);
  }, [search]);

  const loadAccountPortalData = useCallback(async () => {
    try {
      const [oRes, aRes, rRes, pRes, hRes, meRes] = await Promise.all([
        api.get('/customer/orders'),
        api.get('/customer/applications'),
        api.get('/customer/receipts'),
        api.get('/customer/profile'),
        api.get('/customer/history'),
        api.get('/auth/me'),
      ]);
      setOrders(oRes.data.orders || []);
      setApplications(aRes.data.applications || []);
      setReceipts(rRes.data.receipts || []);
      setHistory(hRes.data || { reviews: [], inquiries: [], logins: [] });
      setSessions(meRes.data.sessions || []);
      if (pRes.data.user || pRes.data.profile) {
        setProfileForm({
          full_name: pRes.data.user?.full_name || '',
          phone: pRes.data.user?.phone || '',
          bio: pRes.data.user?.bio || meRes.data.user?.bio || '',
          location: pRes.data.user?.location || meRes.data.user?.location || '',
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
  }, []);

  const loadPublicDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, vRes] = await Promise.all([
        api.get('/public/businesses', { params: { q: debouncedSearch.trim() || undefined } }),
        api.get('/public/videos', { params: { q: debouncedSearch.trim() || undefined } }),
      ]);
      setBusinesses(bRes.data.businesses || []);
      setVideos(vRes.data.videos || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
    setError('');
    setNotice('');
    try {
      const { data } = await api.delete(`/customer/applications/${appId}`);
      setNotice(data.message);
      await loadPortalData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirmWithdraw = async (e) => {
    e.preventDefault();
    if (!withdrawTarget) return;
    setError('');
    setNotice('');
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
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const [custRes] = await Promise.all([
        api.put('/customer/profile', profileForm),
        api.put('/auth/profile', {
          full_name: profileForm.full_name,
          phone: profileForm.phone,
          bio: profileForm.bio,
          location: profileForm.location,
        }),
      ]);
      setNotice(custRes.data.message || 'Customer profile updated.');
      await refreshMe();
    } catch (err) {
      setError(err.message);
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
      setNotice('Portal spacing preference saved.');
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
      await loadAccountPortalData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleMarkNotificationsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      await refreshNotifications();
      setNotice('Notifications marked as read.');
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
              <Link to="/businesses" className="hover:text-slate-900 dark:hover:text-white">Public Directory</Link>
              <Link to="/jobs" className="hover:text-slate-900 dark:hover:text-white">Job Vacancies</Link>
              <Link to="/track-order" className="hover:text-slate-900 dark:hover:text-white">Order Lookup</Link>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
            <ThemeSelector compact />
            <button
              type="button"
              onClick={() => selectTab('profile')}
              className="hidden sm:flex items-center gap-2.5 text-right hover:opacity-85"
            >
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{user?.full_name}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Customer Account</div>
              </div>
              <UserAvatar src={user?.avatar_url} name={user?.full_name} size="sm" />
            </button>
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">Customer Portal</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Browse verified businesses, place orders, track deliveries, manage job applications, and inspect receipts.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">My Orders</div>
              <div className="text-base font-bold tabular-nums">{orders.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">Applications</div>
              <div className="text-base font-bold tabular-nums">{applications.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">Receipts</div>
              <div className="text-base font-bold tabular-nums">{receipts.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">Unread Alerts</div>
              <div className="text-base font-bold tabular-nums">{unreadCount}</div>
            </div>
          </div>
        </div>

        {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
        {notice && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{notice}</div>}

        {/* Tabs */}
        <div role="tablist" aria-label="Customer portal sections" className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
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
                {item.label}
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
                placeholder="Search businesses by name, category, or district..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>

            {loading ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 py-8">Loading listed businesses...</div>
            ) : businesses.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 p-10 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                No publicly listed businesses match your search yet.
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
                      <span className="text-slate-500 dark:text-slate-400 tabular-nums">{b.product_count} published items</span>
                      <Link
                        to={`/businesses/${b.slug}`}
                        className="px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                      >
                        Browse & Order
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && videos.length > 0 && (
              <section className="space-y-3 pt-4">
                <div>
                  <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Promotional Video Advertisements</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Discover featured products and services advertised by listed businesses.
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
                <p className="text-xs text-slate-500 dark:text-slate-400">You have not placed any orders yet.</p>
                <button
                  type="button"
                  onClick={() => selectTab('businesses')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg"
                >
                  Browse Listed Businesses
                </button>
              </div>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{o.business_name} · {o.branch_name || 'Main Branch'}</div>
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
                      <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Items</div>
                      {(o.items || []).map((it) => (
                        <div key={it.id} className="flex justify-between py-0.5 text-slate-600 dark:text-slate-300">
                          <span>{it.product_name} × {it.quantity}</span>
                          <span className="tabular-nums">{formatMoney(Number(it.unit_price) * it.quantity, o.currency_code)}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Tracking History</div>
                      {(o.history || []).map((h, idx) => (
                        <div key={idx} className="flex justify-between py-0.5 text-slate-600 dark:text-slate-300">
                          <span>{h.new_status.replace(/_/g, ' ')} {h.note ? `— ${h.note}` : ''}</span>
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
                <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">My Job Applications</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Track submitted applications, inspect scheduled interviews, preview uploaded CVs/certificates, or resume drafts.
                </p>
              </div>
              <Link
                to="/jobs"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
              >
                Browse Open Vacancies
              </Link>
            </div>

            {applications.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 p-10 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                <Briefcase className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-500 dark:text-slate-400">You have not started or submitted any job applications yet.</p>
                <Link
                  to="/jobs"
                  className="inline-block px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg"
                >
                  Explore Job Vacancies
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
                            ? `Submitted: ${formatDateTime(app.submitted_at)}`
                            : `Draft updated: ${formatDateTime(app.updated_at)}`}
                        </div>
                        {app.next_interview_date && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200 font-semibold">
                            <Calendar className="w-3.5 h-3.5" />
                            Upcoming Interview: {formatDate(app.next_interview_date)} at {app.next_interview_time} ({app.next_interview_mode})
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
                              Resume Draft
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDiscardDraft(app.id)}
                              className="px-3 py-2 font-semibold text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            >
                              Discard Draft
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
                              View Details & Status
                            </button>
                            {canWithdraw && (
                              <button
                                type="button"
                                onClick={() => setWithdrawTarget(app)}
                                className="px-3 py-2 font-semibold text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              >
                                Withdraw
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
                  <th className="py-3 px-4 font-semibold">Receipt #</th>
                  <th className="py-3 px-4 font-semibold">Business</th>
                  <th className="py-3 px-4 font-semibold">Sale Ref</th>
                  <th className="py-3 px-4 font-semibold text-right">Total</th>
                  <th className="py-3 px-4 font-semibold">Payment</th>
                  <th className="py-3 px-4 font-semibold text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {receipts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-slate-500 dark:text-slate-400">
                      No receipts linked to your customer account yet.
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
                  title="Customer Profile Image"
                  description="Upload, replace, or remove your photo (JPG, JPEG, PNG, or WEBP, max 5MB)."
                />
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">Application Theme &amp; Layout</div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Customize light/dark theme and spacing.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleTogglePortalDensity}
                      className="px-2.5 py-1.5 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      Density: {user?.dashboard_preferences?.density === 'compact' ? 'Compact' : 'Comfortable'}
                    </button>
                  </div>
                  <ThemeSelector showLabels />
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Account Email</div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{user?.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEmailChange((prev) => ({ ...prev, open: !prev.open }))}
                      className="px-3 py-1.5 font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      Change Email
                    </button>
                  </div>

                  {emailChange.open && (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                      {emailChange.step === 'request' ? (
                        <form onSubmit={handleRequestEmailChange} className="space-y-2">
                          <input
                            required
                            type="email"
                            placeholder="New email address"
                            value={emailChange.new_email}
                            onChange={(e) => setEmailChange({ ...emailChange, new_email: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                          <input
                            required
                            type="password"
                            placeholder="Current account password"
                            value={emailChange.current_password}
                            onChange={(e) => setEmailChange({ ...emailChange, current_password: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                          <button type="submit" className="px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">
                            Send Email Verification OTP
                          </button>
                        </form>
                      ) : (
                        <form onSubmit={handleVerifyEmailChange} className="space-y-2">
                          {emailChange.devOtpPreview && (
                            <div className="p-2 rounded bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200">
                              OTP Preview: <span className="font-mono font-bold">{emailChange.devOtpPreview}</span>
                            </div>
                          )}
                          <input
                            required
                            placeholder="6-digit OTP code"
                            value={emailChange.otp_code}
                            onChange={(e) => setEmailChange({ ...emailChange, otp_code: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                          />
                          <button type="submit" className="px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">
                            Verify &amp; Save Email
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">Customer Profile &amp; Bio</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Full Name</label>
                    <input required value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Phone Number</label>
                    <input required value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Location</label>
                    <input value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} placeholder="e.g. Kigali, Rwanda" className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Default Delivery Address</label>
                    <input value={profileForm.default_address} onChange={(e) => setProfileForm({ ...profileForm, default_address: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Biography / Notes</label>
                  <textarea rows={2} value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} placeholder="About you..." className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">City / District</label>
                    <input value={profileForm.city} onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Country</label>
                    <input value={profileForm.country} onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Currency</label>
                    <input value={profileForm.preferred_currency} onChange={(e) => setProfileForm({ ...profileForm, preferred_currency: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg font-mono" />
                  </div>
                </div>
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                  Save Profile
                </button>
              </form>
            </div>

            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">Active Devices &amp; Sessions</h2>
                  <button
                    type="button"
                    onClick={handleRevokeOtherSessions}
                    className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg"
                  >
                    Sign Out Other Devices
                  </button>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-44 overflow-y-auto">
                  {sessions.map((s) => (
                    <div key={s.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{s.device_info || 'Browser'}</span>
                        {s.is_current && <span className="ml-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">(Current)</span>}
                      </div>
                      <span className="text-slate-400 tabular-nums shrink-0">{formatDateTime(s.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">Recent Reviews &amp; Inquiries</h2>
                {history.reviews.length === 0 && history.inquiries.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">No reviews or business messages sent yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-2">
                    {history.reviews.map((rev) => (
                      <div key={`rev-${rev.id}`} className="pt-2 first:pt-0">
                        <div className="font-semibold text-slate-900 dark:text-white">Review for {rev.business_name} ({rev.rating}/5)</div>
                        <div className="text-slate-600 dark:text-slate-300">{rev.comment}</div>
                      </div>
                    ))}
                    {history.inquiries.map((inq) => (
                      <div key={`inq-${inq.id}`} className="pt-2">
                        <div className="font-semibold text-slate-900 dark:text-white">Message to {inq.target_business_name || inq.business_name}</div>
                        <div className="text-slate-600 dark:text-slate-300">{inq.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-sm font-bold text-[#0B192C] dark:text-white">
                  <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>Account Sign-In History</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                  {(history.logins || []).map((l, idx) => (
                    <div key={idx} className="py-1.5 flex justify-between text-slate-700 dark:text-slate-300">
                      <span>{l.was_successful ? 'Successful login' : 'Failed login'} · {l.ip_address}</span>
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
              <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">My Notifications</h2>
              <button
                type="button"
                onClick={handleMarkNotificationsRead}
                className="text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline"
              >
                Mark all read
              </button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No notifications yet.</p>
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
                        Open →
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
                    {selectedAppDetail.application.business_name} · Ref: <span className="font-mono">{selectedAppDetail.application.reference_number || 'Draft'}</span>
                  </div>
                </div>
              ) : (
                <div className="font-bold">Loading Application...</div>
              )}
              <button
                type="button"
                onClick={closeApplicationDetail}
                aria-label="Close application details"
                className="p-1.5 text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingAppDetail ? (
              <div className="p-10 text-center text-slate-500">Loading your application timeline & documents...</div>
            ) : selectedAppDetail && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {selectedAppDetail.interviews?.length > 0 && (
                  <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 space-y-2">
                    <div className="font-bold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      Scheduled Interviews
                    </div>
                    {selectedAppDetail.interviews.map((iv) => (
                      <div key={iv.id} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-sky-200/70 dark:border-sky-800 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                            {formatDate(iv.interview_date)} at {iv.interview_time} ({iv.interview_mode})
                          </div>
                          {iv.location_or_link && <div className="text-slate-600 dark:text-slate-300">Location / Link: {iv.location_or_link}</div>}
                          {iv.instructions && <div className="text-slate-500 dark:text-slate-400 mt-0.5">{iv.instructions}</div>}
                        </div>
                        <StatusBadge status={iv.status === 'scheduled' ? 'interview_scheduled' : iv.status} />
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-bold text-slate-900 dark:text-white">Status Timeline</div>
                  {selectedAppDetail.status_history.length === 0 ? (
                    <div className="text-slate-500">Draft saved (not yet submitted).</div>
                  ) : (
                    selectedAppDetail.status_history.map((h) => (
                      <div key={h.id} className="flex justify-between gap-2 py-1 border-b last:border-0 border-slate-200 dark:border-slate-800">
                        <span>
                          <strong>{h.new_status.replace(/_/g, ' ')}</strong>
                          {h.note ? ` — ${h.note}` : ''}
                        </span>
                        <span className="text-slate-400 tabular-nums shrink-0">{formatDateTime(h.changed_at)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-bold text-slate-900 dark:text-white">Uploaded CV & Certificates (Read-Only Snapshot)</div>
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
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPrivateDocument(doc.download_url, doc.original_filename)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                        >
                          <Download className="w-3 h-3" />
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-white">Education ({selectedAppDetail.education.length})</div>
                    {selectedAppDetail.education.map((edu) => (
                      <div key={edu.id} className="text-slate-600 dark:text-slate-300">
                        {edu.education_level} — {edu.institution_name} ({edu.education_status})
                      </div>
                    ))}
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-white">Work Experience</div>
                    {!selectedAppDetail.application.has_work_experience ? (
                      <div className="text-slate-600 dark:text-slate-300">No prior experience indicated</div>
                    ) : (
                      selectedAppDetail.experiences.map((ex) => (
                        <div key={ex.id} className="text-slate-600 dark:text-slate-300">
                          {ex.job_title} at {ex.company_name} ({ex.start_date} – {ex.is_current ? 'Present' : ex.end_date || 'N/A'})
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
            <h3 className="text-base font-bold text-[#0B192C] dark:text-white">Withdraw Job Application?</h3>
            <p className="text-slate-600 dark:text-slate-300">
              You are withdrawing application <strong>{withdrawTarget.reference_number}</strong> for <strong>{withdrawTarget.vacancy_title}</strong>. The business will be notified.
            </p>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Reason (Optional)</label>
              <input
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder="Accepted another offer, personal reasons..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWithdrawTarget(null)}
                className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Keep Application
              </button>
              <button
                type="submit"
                className="px-4 py-2 font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500"
              >
                Confirm Withdrawal
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
