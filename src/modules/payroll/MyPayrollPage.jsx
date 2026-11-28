import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banknote, Bell, Calendar, Lock, Phone, RefreshCw } from 'lucide-react';
import { api } from '../../services/api.js';
import PasswordInput from '../../components/PasswordInput.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ViewMoreFooter from '../../components/ViewMoreFooter.jsx';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format.js';
import { useExpandableList } from '../../utils/listOrder.js';

export default function MyPayrollPage() {
  const { t } = useTranslation();
  const [data, setData] = useState({ configs: [], transactions: [], notifications: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingCfg, setEditingCfg] = useState(null);
  const [momoForm, setMomoForm] = useState({
    momo_provider: 'mtn_momo',
    momo_phone: '+250',
    current_password: '',
  });
  const [saving, setSaving] = useState(false);

  const loadMyPayroll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/payroll/my');
      setData(res.data || { configs: [], transactions: [], notifications: [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const configsBox = useExpandableList(data.configs, { initialLimit: 4, sortNewest: true });
  const transactionsBox = useExpandableList(data.transactions, { initialLimit: 6, sortNewest: true });
  const notificationsBox = useExpandableList(data.notifications, { initialLimit: 5, sortNewest: true });

  useEffect(() => {
    loadMyPayroll();
  }, [loadMyPayroll]);

  const startEditMomo = (cfg) => {
    setError('');
    setNotice('');
    setEditingCfg(cfg);
    setMomoForm({
      momo_provider: cfg.momo_provider || 'mtn_momo',
      momo_phone: cfg.momo_phone || '+250',
      current_password: '',
    });
  };

  const handleUpdateMomo = async (e) => {
    e.preventDefault();
    if (!editingCfg) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await api.put('/payroll/my/momo', {
        payroll_config_id: editingCfg.id,
        ...momoForm,
      });
      setNotice(res.data.message);
      setEditingCfg(null);
      await loadMyPayroll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('myPayroll.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('myPayroll.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={loadMyPayroll}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t('common.refresh')}
        </button>
      </div>

      {error && (
        <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 text-xs font-medium text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          {notice}
        </div>
      )}

      {/* Salary Schedules */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {loading ? (
            <div className="h-32 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          ) : configsBox.totalCount === 0 ? (
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
              {t('myPayroll.emptyConfigs')}
            </div>
          ) : (
            configsBox.visibleItems.map((cfg) => {
              const freqLabel = {
                monthly: t('myPayroll.freqMonthly'),
                weekly: t('myPayroll.freqWeekly'),
                custom: t('myPayroll.freqCustom'),
              }[cfg.payment_frequency] || cfg.payment_frequency;
              return (
              <div key={cfg.id} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-sm text-[#0B192C] dark:text-white">{cfg.business_name}</div>
                    <div className="text-slate-500 dark:text-slate-400">{cfg.job_title || cfg.role_name}</div>
                  </div>
                  <StatusBadge status={cfg.payroll_status} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Banknote className="w-3.5 h-3.5" /> {t('myPayroll.configuredSalary')}
                    </div>
                    <div className="font-bold text-base text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatMoney(cfg.salary_amount, cfg.currency_code || cfg.business_currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {t('myPayroll.upcomingPayDate')}
                    </div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                      {formatDate(cfg.next_payment_date)}
                    </div>
                    <div className="text-[11px] text-slate-500">{freqLabel}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> {t('myPayroll.payoutMomo')}
                    </div>
                    <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{cfg.momo_phone}</div>
                    <div className="text-[11px] text-slate-500">
                      {cfg.momo_provider === 'airtel_money' ? t('myPayroll.providerAirtelFull') : t('myPayroll.providerMtnFull')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {t('myPayroll.lastPaid', { date: cfg.last_paid_date ? formatDate(cfg.last_paid_date) : t('myPayroll.noPayoutYet') })}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEditMomo(cfg)}
                    className="px-3 py-1.5 font-semibold text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/40"
                  >
                    {t('myPayroll.updateMomoBtn')}
                  </button>
                </div>
              </div>
              );
            })
          )}
        </div>
        {(configsBox.hasMore || configsBox.expanded) && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <ViewMoreFooter
              shownCount={configsBox.visibleItems.length}
              totalCount={configsBox.totalCount}
              hasMore={configsBox.hasMore}
              expanded={configsBox.expanded}
              onToggle={configsBox.toggle}
            />
          </div>
        )}
      </div>

      {/* Update Mobile Money Form */}
      {editingCfg && (
        <form
          onSubmit={handleUpdateMomo}
          className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-sky-200 dark:border-sky-800 space-y-4 text-xs max-w-xl"
        >
          <div className="flex items-center gap-2 font-bold text-sm text-[#0B192C] dark:text-white">
            <Lock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            {t('myPayroll.verifyAndUpdateTitle', { business: editingCfg.business_name })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('myPayroll.momoProviderLabel')}</label>
              <select
                value={momoForm.momo_provider}
                onChange={(e) => setMomoForm({ ...momoForm, momo_provider: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="mtn_momo">{t('myPayroll.providerMtnFull')}</option>
                <option value="airtel_money">{t('myPayroll.providerAirtelFull')}</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('myPayroll.newMomoNumber')}</label>
              <input
                required
                value={momoForm.momo_phone}
                onChange={(e) => setMomoForm({ ...momoForm, momo_phone: e.target.value })}
                placeholder="+250788123456"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
              {t('myPayroll.passwordLabel')}
            </label>
            <PasswordInput
              required
              autoComplete="current-password"
              value={momoForm.current_password}
              onChange={(e) => setMomoForm({ ...momoForm, current_password: e.target.value })}
              placeholder={t('myPayroll.passwordPlaceholder')}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
            >
              {saving ? t('myPayroll.verifyingSaving') : t('myPayroll.saveMomoNumber')}
            </button>
            <button
              type="button"
              onClick={() => setEditingCfg(null)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {/* Payment History & Salary Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-bold text-sm text-[#0B192C] dark:text-white">
            {t('myPayroll.historyTitle')}
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-3 px-4 font-semibold">{t('myPayroll.colReference')}</th>
                <th className="py-3 px-4 font-semibold">{t('myPayroll.colBusiness')}</th>
                <th className="py-3 px-4 font-semibold">{t('myPayroll.colPeriod')}</th>
                <th className="py-3 px-4 font-semibold">{t('myPayroll.colMomoPhone')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('myPayroll.colAmount')}</th>
                <th className="py-3 px-4 font-semibold">{t('myPayroll.colStatus')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('myPayroll.colDate')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactionsBox.totalCount === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 px-4 text-center text-slate-500">
                    {t('myPayroll.emptyTransactions')}
                  </td>
                </tr>
              ) : (
                transactionsBox.visibleItems.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white">{tx.payment_reference}</td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{tx.business_name}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">{tx.payment_period}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">{tx.momo_phone}</td>
                    <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(tx.salary_amount, tx.currency_code)}
                    </td>
                    <td className="py-3 px-4"><StatusBadge status={tx.status} /></td>
                    <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatDateTime(tx.paid_at || tx.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
          <ViewMoreFooter
            shownCount={transactionsBox.visibleItems.length}
            totalCount={transactionsBox.totalCount}
            hasMore={transactionsBox.hasMore}
            expanded={transactionsBox.expanded}
            onToggle={transactionsBox.toggle}
          />
        </div>

        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden self-start">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-bold text-sm text-[#0B192C] dark:text-white flex items-center gap-2">
            <Bell className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            {t('myPayroll.notificationsTitle')}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-96 overflow-y-auto">
            {notificationsBox.totalCount === 0 ? (
              <div className="p-6 text-center text-slate-500">{t('myPayroll.emptyNotifications')}</div>
            ) : (
              notificationsBox.visibleItems.map((n) => (
                <div key={n.id} className="p-4 space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-white">{n.title}</div>
                  <div className="text-slate-600 dark:text-slate-300">{n.message}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums">{formatDateTime(n.created_at)}</div>
                </div>
              ))
            )}
          </div>
          <ViewMoreFooter
            shownCount={notificationsBox.visibleItems.length}
            totalCount={notificationsBox.totalCount}
            hasMore={notificationsBox.hasMore}
            expanded={notificationsBox.expanded}
            onToggle={notificationsBox.toggle}
          />
        </div>
      </div>
    </div>
  );
}
