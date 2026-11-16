import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDateTime } from '../../utils/format.js';

export default function NotificationsPage() {
  const { notifications, refreshNotifications } = useAuth();
  const [prefs, setPrefs] = useState({
    in_app_enabled: 1,
    email_enabled: 1,
    sms_enabled: 0,
    low_stock_alerts: 1,
    order_alerts: 1,
    expense_alerts: 1,
    payroll_alerts: 1,
  });
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/notifications').then((res) => {
      if (res.data.preferences) setPrefs(res.data.preferences);
    }).catch(() => {});
  }, []);

  const handleMarkAll = async () => {
    setError('');
    try {
      await api.patch('/notifications/read-all');
      await refreshNotifications();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSavePrefs = async (e) => {
    e.preventDefault();
    setError('');
    setSaved('');
    try {
      await api.put('/notifications/preferences', prefs);
      setSaved('Preferences updated.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h1 className="text-lg font-bold text-[#0B192C] dark:text-slate-100">Notifications</h1>
          <button type="button" onClick={handleMarkAll} className="text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline">
            Mark all as read
          </button>
        </div>

        {error && <div className="p-2.5 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded">{error}</div>}

        {notifications.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">No notifications recorded yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((n) => (
              <div key={n.id} className={`py-3 px-3 rounded-lg ${n.is_read ? '' : 'bg-sky-50/60 dark:bg-sky-950/30'}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{n.title}</span>
                  <span className="text-slate-400 dark:text-slate-500 tabular-nums">{formatDateTime(n.created_at)}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{n.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSavePrefs} className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 self-start">
        <h2 className="text-sm font-bold text-[#0B192C] dark:text-slate-100">Alert Preferences</h2>
        {saved && <div className="p-2 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded">{saved}</div>}
        <div className="space-y-2.5 text-xs">
          {[
            ['in_app_enabled', 'In-App Real-Time Alerts'],
            ['email_enabled', 'Email Notifications'],
            ['sms_enabled', 'SMS Alerts (when configured)'],
            ['low_stock_alerts', 'Low & Out-of-Stock Alerts'],
            ['order_alerts', 'New & Updated Customer Orders'],
            ['expense_alerts', 'Expense Approval Requests'],
            ['payroll_alerts', 'Employee Payroll Due & Salary Alerts'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between py-1">
              <span className="text-slate-700 dark:text-slate-300">{label}</span>
              <input
                type="checkbox"
                checked={Boolean(prefs[key])}
                onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked ? 1 : 0 })}
              />
            </label>
          ))}
        </div>
        <button type="submit" className="w-full py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors">
          Save Preferences
        </button>
      </form>
    </div>
  );
}
