import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Clock,
  LogOut,
  Package,
  Receipt,
  Search,
  Store,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import BrandLogo from '../../components/BrandLogo.jsx';
import LogoutConfirmModal from '../../components/LogoutConfirmModal.jsx';
import ProfilePhotoUploader from '../../components/ProfilePhotoUploader.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ThemeSelector from '../../components/ThemeSelector.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import VideoAdPlayer from '../../components/VideoAdPlayer.jsx';
import { api } from '../../services/api.js';
import { formatDateTime, formatMoney } from '../../utils/format.js';

const TABS = [
  { id: 'businesses', label: 'Discover Businesses', icon: Store },
  { id: 'orders', label: 'My Orders & Tracking', icon: Package },
  { id: 'receipts', label: 'My Receipts', icon: Receipt },
  { id: 'profile', label: 'Profile & History', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

export default function CustomerPortalPage() {
  const { user, notifications, logout, refreshMe, refreshNotifications } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('businesses');
  const [businesses, setBusinesses] = useState([]);
  const [videos, setVideos] = useState([]);
  const [orders, setOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [history, setHistory] = useState({ reviews: [], inquiries: [], logins: [] });
  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    default_address: '',
    city: '',
    country: 'Rwanda',
    preferred_currency: 'RWF',
    notes: '',
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const loadPortalData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bRes, vRes, oRes, rRes, pRes, hRes] = await Promise.all([
        api.get('/public/businesses', { params: { q: search.trim() || undefined } }),
        api.get('/public/videos', { params: { q: search.trim() || undefined } }),
        api.get('/customer/orders'),
        api.get('/customer/receipts'),
        api.get('/customer/profile'),
        api.get('/customer/history'),
      ]);
      setBusinesses(bRes.data.businesses || []);
      setVideos(vRes.data.videos || []);
      setOrders(oRes.data.orders || []);
      setReceipts(rRes.data.receipts || []);
      setHistory(hRes.data || { reviews: [], inquiries: [], logins: [] });
      if (pRes.data.user || pRes.data.profile) {
        setProfileForm({
          full_name: pRes.data.user?.full_name || '',
          phone: pRes.data.user?.phone || '',
          default_address: pRes.data.profile?.default_address || '',
          city: pRes.data.profile?.city || '',
          country: pRes.data.profile?.country || 'Rwanda',
          preferred_currency: pRes.data.profile?.preferred_currency || 'RWF',
          notes: pRes.data.profile?.notes || '',
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const { data } = await api.put('/customer/profile', profileForm);
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
              <Link to="/track-order" className="hover:text-slate-900 dark:hover:text-white">Order Lookup</Link>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
            <ThemeSelector compact />
            <button
              type="button"
              onClick={() => setTab('profile')}
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
              Browse verified businesses, place orders, track deliveries, inspect your receipts, and manage your account.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">My Orders</div>
              <div className="text-base font-bold tabular-nums">{orders.length}</div>
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
                onClick={() => setTab(item.id)}
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
                  onClick={() => setTab('businesses')}
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
                  description="Update your account photo (JPG, JPEG, PNG, or WEBP, max 5MB)."
                />
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">Application Theme</div>
                  <ThemeSelector showLabels />
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">Customer Profile</h2>
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
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Default Delivery Address</label>
                  <input value={profileForm.default_address} onChange={(e) => setProfileForm({ ...profileForm, default_address: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
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
                <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">Recent Reviews & Inquiries</h2>
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
                  <div key={n.id} className={`py-3 ${n.is_read ? '' : 'bg-sky-50/40 dark:bg-sky-950/30 px-2 rounded'}`}>
                    <div className="font-semibold text-slate-900 dark:text-white">{n.title}</div>
                    <div className="text-slate-600 dark:text-slate-300 mt-0.5">{n.message}</div>
                    <div className="text-[11px] text-slate-400 mt-1 tabular-nums">{formatDateTime(n.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </main>

      <LogoutConfirmModal
        open={logoutConfirmOpen}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
}
