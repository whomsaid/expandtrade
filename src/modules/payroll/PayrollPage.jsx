import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Download,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format.js';

export default function PayrollPage() {
  const { t } = useTranslation();
  const { activeBusinessId, workspace, socket, hasPermission, refreshNotifications } = useAuth();
  const providerLabels = {
    mtn_momo: t('payroll.mtnFull'),
    airtel_money: t('payroll.airtelFull'),
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightConfigId = Number(searchParams.get('payConfigId') || 0);

  const canManage = hasPermission('payroll.manage');
  const canPay = hasPermission('payroll.pay');
  const currency = workspace?.business?.currency_code || 'RWF';

  const [tab, setTab] = useState('roster');
  const [statusFilter, setStatusFilter] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [selectedConfigIds, setSelectedConfigIds] = useState([]);
  const [configModal, setConfigModal] = useState(null);
  const [authModal, setAuthModal] = useState(null); // { mode: 'individual'|'bulk', configs: [] }
  const [authChecked, setAuthChecked] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [topupModal, setTopupModal] = useState(false);
  const [topupForm, setTopupForm] = useState({ amount: '', reference: '', note: '' });
  const [gatewayModal, setGatewayModal] = useState(false);
  const [gatewayForm, setGatewayForm] = useState({
    default_provider: 'mtn_momo',
    business_momo_number: '+250',
    mtn_environment: 'sandbox',
    mtn_subscription_key: '',
    mtn_api_user: '',
    mtn_api_key: '',
    airtel_environment: 'staging',
    airtel_client_id: '',
    airtel_client_secret: '',
  });
  const [busyTxId, setBusyTxId] = useState(null);

  const loadPayroll = useCallback(async () => {
    if (!activeBusinessId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/payroll/overview', {
        params: statusFilter ? { status: statusFilter } : {},
      });
      setOverview(data);
      if (data.account) {
        setGatewayForm((prev) => ({
          ...prev,
          default_provider: data.account.default_provider || 'mtn_momo',
          business_momo_number: data.account.business_momo_number || '+250',
          mtn_environment: data.account.mtn_environment || 'sandbox',
          airtel_environment: data.account.airtel_environment || 'staging',
        }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeBusinessId, statusFilter]);

  useEffect(() => {
    loadPayroll();
  }, [loadPayroll]);

  useEffect(() => {
    if (!socket) return;
    const onPayrollUpdate = () => loadPayroll();
    socket.on('payroll:updated', onPayrollUpdate);
    return () => socket.off('payroll:updated', onPayrollUpdate);
  }, [socket, loadPayroll]);

  // Auto-open authorization modal if arriving directly from a notification deep link ?payConfigId=...
  useEffect(() => {
    if (!highlightConfigId || !overview?.configs?.length || !canPay) return;
    const match = overview.configs.find((c) => c.id === highlightConfigId && c.payroll_status === 'active');
    if (match) {
      setAuthChecked(false);
      setAuthModal({ mode: 'individual', configs: [match] });
      const next = new URLSearchParams(searchParams);
      next.delete('payConfigId');
      setSearchParams(next, { replace: true });
    }
  }, [highlightConfigId, overview, canPay, searchParams, setSearchParams]);

  const configByMemberId = useMemo(() => {
    const map = new Map();
    for (const c of overview?.configs || []) {
      map.set(c.business_member_id, c);
    }
    return map;
  }, [overview]);

  const dueActiveConfigs = useMemo(
    () => (overview?.configs || []).filter((c) => c.payroll_status === 'active' && c.is_due),
    [overview]
  );

  const activeConfigs = useMemo(
    () => (overview?.configs || []).filter((c) => c.payroll_status === 'active'),
    [overview]
  );

  const filteredTransactions = useMemo(() => {
    const list = overview?.transactions || [];
    const q = txSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (tx) =>
        tx.employee_name?.toLowerCase().includes(q) ||
        tx.payment_reference?.toLowerCase().includes(q) ||
        tx.momo_phone?.toLowerCase().includes(q) ||
        tx.payment_period?.toLowerCase().includes(q)
    );
  }, [overview, txSearch]);

  const openConfigureEmployee = (emp, existingConfig = null) => {
    setError('');
    setNotice('');
    setConfigModal({
      business_member_id: emp.business_member_id,
      employee_name: emp.full_name,
      role_name: emp.role_name,
      salary_amount: existingConfig ? String(existingConfig.salary_amount) : '',
      payment_frequency: existingConfig?.payment_frequency || 'monthly',
      custom_interval_days: existingConfig?.custom_interval_days ? String(existingConfig.custom_interval_days) : '14',
      next_payment_date: existingConfig?.next_payment_date || new Date().toISOString().slice(0, 10),
      momo_provider: existingConfig?.momo_provider || overview?.account?.default_provider || 'mtn_momo',
      momo_phone: existingConfig?.momo_phone || emp.phone || '+250',
      notes: existingConfig?.notes || '',
    });
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!configModal) return;
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/payroll/configs', {
        business_member_id: configModal.business_member_id,
        salary_amount: Number(configModal.salary_amount),
        payment_frequency: configModal.payment_frequency,
        custom_interval_days:
          configModal.payment_frequency === 'custom' ? Number(configModal.custom_interval_days || 14) : null,
        next_payment_date: configModal.next_payment_date,
        momo_provider: configModal.momo_provider,
        momo_phone: configModal.momo_phone,
        notes: configModal.notes,
      });
      setNotice(data.message || t('payroll.configSavedMsg'));
      setConfigModal(null);
      await loadPayroll();
      await refreshNotifications();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleConfigStatus = async (cfg) => {
    setError('');
    setNotice('');
    const nextStatus = cfg.payroll_status === 'active' ? 'suspended' : 'active';
    try {
      const { data } = await api.patch(`/payroll/configs/${cfg.id}/status`, { payroll_status: nextStatus });
      setNotice(data.message);
      await loadPayroll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRunDueMonitor = async () => {
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/payroll/monitor/run');
      setNotice(t('payroll.dueMonitorMsg', { count: data.alertsCreated || 0 }));
      await loadPayroll();
      await refreshNotifications();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTopup = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/payroll/account/topup', {
        amount: Number(topupForm.amount),
        reference: topupForm.reference || undefined,
        note: topupForm.note || undefined,
      });
      setNotice(data.message);
      setTopupModal(false);
      setTopupForm({ amount: '', reference: '', note: '' });
      await loadPayroll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveGateway = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const payload = {
        default_provider: gatewayForm.default_provider,
        business_momo_number: gatewayForm.business_momo_number,
        mtn_environment: gatewayForm.mtn_environment,
        airtel_environment: gatewayForm.airtel_environment,
      };
      if (gatewayForm.mtn_subscription_key.trim()) payload.mtn_subscription_key = gatewayForm.mtn_subscription_key.trim();
      if (gatewayForm.mtn_api_user.trim()) payload.mtn_api_user = gatewayForm.mtn_api_user.trim();
      if (gatewayForm.mtn_api_key.trim()) payload.mtn_api_key = gatewayForm.mtn_api_key.trim();
      if (gatewayForm.airtel_client_id.trim()) payload.airtel_client_id = gatewayForm.airtel_client_id.trim();
      if (gatewayForm.airtel_client_secret.trim()) payload.airtel_client_secret = gatewayForm.airtel_client_secret.trim();

      const { data } = await api.put('/payroll/account/config', payload);
      setNotice(data.message);
      setGatewayModal(false);
      setGatewayForm((prev) => ({
        ...prev,
        mtn_subscription_key: '',
        mtn_api_user: '',
        mtn_api_key: '',
        airtel_client_id: '',
        airtel_client_secret: '',
      }));
      await loadPayroll();
    } catch (err) {
      setError(err.message);
    }
  };

  const openIndividualAuth = (cfg) => {
    setError('');
    setNotice('');
    setAuthChecked(false);
    setAuthModal({ mode: 'individual', configs: [cfg] });
  };

  const openBulkAuth = (configsToPay) => {
    if (!configsToPay.length) return;
    setError('');
    setNotice('');
    setAuthChecked(false);
    setAuthModal({ mode: 'bulk', configs: configsToPay });
  };

  const handleConfirmPay = async (e) => {
    e.preventDefault();
    if (!authModal || !authChecked) return;
    setAuthSubmitting(true);
    setError('');
    setNotice('');
    try {
      if (authModal.mode === 'individual') {
        const cfg = authModal.configs[0];
        const { data } = await api.post('/payroll/pay/individual', {
          payroll_config_id: cfg.id,
          payment_period: cfg.due_period,
          confirm_authorization: 'true',
          idempotency_key: `ui-${cfg.id}-${cfg.due_period}-${Date.now()}`,
        });
        setNotice(data.message);
      } else {
        const { data } = await api.post('/payroll/pay/bulk', {
          payroll_config_ids: authModal.configs.map((c) => c.id),
          confirm_authorization: 'true',
        });
        setNotice(data.message);
        setSelectedConfigIds([]);
      }
      setAuthModal(null);
      await loadPayroll();
      await refreshNotifications();
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleVerifyStatus = async (txId) => {
    setBusyTxId(txId);
    setError('');
    setNotice('');
    try {
      const { data } = await api.get(`/payroll/transactions/${txId}/verify-status`);
      setNotice(data.message || t('payroll.statusRefreshedMsg'));
      await loadPayroll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyTxId(null);
    }
  };

  const handleRetryTx = async (txId) => {
    setBusyTxId(txId);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/payroll/transactions/${txId}/retry`);
      setNotice(data.message);
      await loadPayroll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyTxId(null);
    }
  };

  const handleExportCsv = () => {
    const rows = filteredTransactions;
    if (!rows.length) return;
    const headers = [
      t('payroll.csvHeaders.reference'),
      t('payroll.csvHeaders.employee'),
      t('payroll.csvHeaders.provider'),
      t('payroll.csvHeaders.momoPhone'),
      t('payroll.csvHeaders.period'),
      t('payroll.csvHeaders.amount'),
      t('payroll.csvHeaders.currency'),
      t('payroll.csvHeaders.status'),
      t('payroll.csvHeaders.authorizedBy'),
      t('payroll.csvHeaders.createdAt'),
      t('payroll.csvHeaders.paidAt'),
    ];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.payment_reference,
          r.employee_name,
          r.momo_provider,
          r.momo_phone,
          r.payment_period,
          r.salary_amount,
          r.currency_code,
          r.status,
          r.authorized_by_name || '',
          r.created_at,
          r.paid_at || '',
        ]
          .map(escape)
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `biztrade-payroll-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelectConfig = (id) => {
    setSelectedConfigIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllActive = () => {
    if (selectedConfigIds.length === activeConfigs.length) {
      setSelectedConfigIds([]);
    } else {
      setSelectedConfigIds(activeConfigs.map((c) => c.id));
    }
  };

  const stats = overview?.stats || {};
  const account = overview?.account || {};
  const dueAlerts = overview?.dueAlerts || [];
  const selectedConfigs = activeConfigs.filter((c) => selectedConfigIds.includes(c.id));
  const authTotalAmount = (authModal?.configs || []).reduce((sum, c) => sum + Number(c.salary_amount || 0), 0);
  const sufficientBalance = Number(account.available_balance || 0) >= authTotalAmount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('payroll.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('payroll.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRunDueMonitor}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('payroll.checkDueSalaries')}
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setGatewayModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {t('payroll.gatewaySettingsBtn')}
            </button>
          )}

          {canPay && (
            <button
              type="button"
              onClick={() => setTopupModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('payroll.fundBalanceBtn')}
            </button>
          )}

          {canPay && selectedConfigs.length > 0 && (
            <button
              type="button"
              onClick={() => openBulkAuth(selectedConfigs)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
            >
              <Send className="w-3.5 h-3.5" />
              {t('payroll.paySelectedBtn', { count: selectedConfigs.length })}
            </button>
          )}
        </div>
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

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t('payroll.kpiAvailableBalance')}</span>
            <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatMoney(account.available_balance, account.currency_code || currency)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {t('payroll.kpiReservedBalance', { amount: formatMoney(account.reserved_balance, account.currency_code || currency) })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t('payroll.kpiDuePayments')}</span>
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {t('payroll.kpiDueSummary', { count: stats.due_payments_count || 0, amount: formatMoney(stats.due_payments_amount, currency) })}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {t('payroll.kpiConfiguredCount', { configured: stats.configured_employees || 0, total: stats.total_employees || 0 })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t('payroll.kpiMonthlyEstimate')}</span>
            <Banknote className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatMoney(stats.total_monthly_payroll, currency)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {t('payroll.kpiActiveSchedules', { count: stats.active_payroll_employees || 0 })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t('payroll.kpiDisbursementHealth')}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums pt-0.5">
            {t('payroll.kpiHealthCounts', {
              paid: stats.successful_payments || 0,
              pending: stats.pending_transactions || 0,
              failed: stats.failed_payments || 0,
            })}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            MTN: {account.mtn_configured ? t('payroll.apiReady') : t('payroll.credentialsNeeded')} · Airtel:{' '}
            {account.airtel_configured ? t('payroll.apiReady') : t('payroll.credentialsNeeded')}
          </div>
        </div>
      </div>

      {/* Due Salary Alerts Banner */}
      {dueActiveConfigs.length > 0 && (
        <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                {t('payroll.dueBannerTitle', { count: dueActiveConfigs.length })}
              </h2>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {t('payroll.dueBannerSubtitle', { count: dueAlerts.length })}
              </p>
            </div>
            {canPay && (
              <button
                type="button"
                onClick={() => openBulkAuth(dueActiveConfigs)}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
              >
                {t('payroll.authorizeAllDue', { amount: formatMoney(stats.due_payments_amount, currency) })}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dueActiveConfigs.map((cfg) => (
              <div
                key={cfg.id}
                className="bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-amber-200 dark:border-amber-900 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">{cfg.employee_name}</div>
                  <div className="font-bold text-[#0B192C] dark:text-sky-400 tabular-nums">
                    {formatMoney(cfg.salary_amount, cfg.currency_code)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {cfg.momo_phone} · {t('payroll.dueTag', { date: formatDate(cfg.next_payment_date) })}
                  </div>
                </div>
                {canPay && (
                  <button
                    type="button"
                    onClick={() => openIndividualAuth(cfg)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-500 shrink-0"
                  >
                    {t('payroll.payEmployeeBtn')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div role="tablist" aria-label={t('payroll.tabsAria')} className="inline-flex flex-wrap p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
        {[
          ['roster', t('payroll.tabRoster')],
          ['transactions', t('payroll.tabTransactions')],
          ['batches', t('payroll.tabBatches')],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === k
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab 1: Roster & Payroll Configuration */}
      {tab === 'roster' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                {canPay && (
                  <th className="py-3 px-3 w-8">
                    <input
                      type="checkbox"
                      aria-label={t('payroll.selectAllAria')}
                      checked={activeConfigs.length > 0 && selectedConfigIds.length === activeConfigs.length}
                      onChange={toggleSelectAllActive}
                    />
                  </th>
                )}
                <th className="py-3 px-4 font-semibold">{t('payroll.colEmployee')}</th>
                <th className="py-3 px-4 font-semibold">{t('payroll.colRoleBranch')}</th>
                <th className="py-3 px-4 font-semibold">{t('payroll.colMomoAccount')}</th>
                <th className="py-3 px-4 font-semibold">{t('payroll.colFrequencyNext')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('payroll.colSalaryAmount')}</th>
                <th className="py-3 px-4 font-semibold">{t('payroll.colStatus')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('payroll.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !overview ? (
                <tr>
                  <td colSpan={canPay ? 8 : 7} className="py-8 px-4 text-center text-slate-500">
                    {t('payroll.loadingRoster')}
                  </td>
                </tr>
              ) : (overview?.employees || []).length === 0 ? (
                <tr>
                  <td colSpan={canPay ? 8 : 7} className="py-8 px-4 text-center text-slate-500">
                    {t('payroll.emptyRoster')}
                  </td>
                </tr>
              ) : (
                (overview?.employees || []).map((emp) => {
                  const cfg = configByMemberId.get(emp.business_member_id);
                  return (
                    <tr key={emp.business_member_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      {canPay && (
                        <td className="py-3 px-3">
                          {cfg && cfg.payroll_status === 'active' ? (
                            <input
                              type="checkbox"
                              aria-label={t('payroll.selectEmployeeAria', { name: emp.full_name })}
                              checked={selectedConfigIds.includes(cfg.id)}
                              onChange={() => toggleSelectConfig(cfg.id)}
                            />
                          ) : null}
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar src={emp.avatar_url} name={emp.full_name} size="sm" />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">{emp.full_name}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{emp.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800 dark:text-slate-200 font-medium">{emp.job_title || emp.role_name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{emp.branch_name || t('payroll.allBranches')}</div>
                      </td>
                      <td className="py-3 px-4">
                        {cfg ? (
                          <div>
                            <div className="font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                              {cfg.momo_phone}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {providerLabels[cfg.momo_provider] || cfg.momo_provider}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">{t('payroll.notConfigured')}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {cfg ? (
                          <div>
                            <div className="capitalize font-medium text-slate-800 dark:text-slate-200">
                              {cfg.payment_frequency === 'weekly'
                                ? t('payroll.freqWeekly')
                                : cfg.payment_frequency === 'custom'
                                  ? t('payroll.freqCustom')
                                  : t('payroll.freqMonthly')}
                              {cfg.payment_frequency === 'custom' && cfg.custom_interval_days
                                ? ` ${t('payroll.everyDays', { days: cfg.custom_interval_days })}`
                                : ''}
                            </div>
                            <div className={`text-[11px] tabular-nums ${cfg.is_due ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                              {t('payroll.nextPrefix', { date: formatDate(cfg.next_payment_date) })} {cfg.is_due ? t('payroll.dueSuffix') : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white tabular-nums">
                        {cfg ? formatMoney(cfg.salary_amount, cfg.currency_code) : '—'}
                      </td>
                      <td className="py-3 px-4">
                        {cfg ? <StatusBadge status={cfg.payroll_status} /> : <StatusBadge status="inactive" />}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => openConfigureEmployee(emp, cfg)}
                              className="px-2.5 py-1.5 text-[11px] font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {cfg ? t('payroll.editSalary') : t('payroll.setSalary')}
                            </button>
                          )}
                          {cfg && canManage && (
                            <button
                              type="button"
                              onClick={() => handleToggleConfigStatus(cfg)}
                              title={cfg.payroll_status === 'active' ? t('payroll.suspendTitle') : t('payroll.reactivateTitle')}
                              className="p-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {cfg.payroll_status === 'active' ? (
                                <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                              ) : (
                                <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                              )}
                            </button>
                          )}
                          {cfg && cfg.payroll_status === 'active' && canPay && (
                            <button
                              type="button"
                              onClick={() => openIndividualAuth(cfg)}
                              className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                            >
                              {t('payroll.payEmployeeBtn')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Transactions & Reports */}
      {tab === 'transactions' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                placeholder={t('payroll.searchTxPlaceholder')}
                className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg w-64"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="">{t('payroll.allStatuses')}</option>
                <option value="paid">{t('status.paid')}</option>
                <option value="processing">{t('status.processing')}</option>
                <option value="pending">{t('status.pending')}</option>
                <option value="failed">{t('status.failed')}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!filteredTransactions.length}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {t('payroll.exportCsv')}
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-3 px-4 font-semibold">{t('payroll.colReference')}</th>
                  <th className="py-3 px-4 font-semibold">{t('payroll.colEmployee')}</th>
                  <th className="py-3 px-4 font-semibold">{t('payroll.colMobileMoney')}</th>
                  <th className="py-3 px-4 font-semibold">{t('payroll.colPeriod')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('payroll.colAmount')}</th>
                  <th className="py-3 px-4 font-semibold">{t('payroll.colStatusProvider')}</th>
                  <th className="py-3 px-4 font-semibold">{t('payroll.colAuthorizedBy')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('payroll.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 px-4 text-center text-slate-500">
                      {t('payroll.emptyTransactions')}
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-900 dark:text-white">{tx.payment_reference}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatDateTime(tx.created_at)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <UserAvatar src={tx.employee_avatar} name={tx.employee_name} size="xs" />
                          <span className="font-medium text-slate-900 dark:text-slate-100">{tx.employee_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono tabular-nums text-slate-900 dark:text-slate-100">{tx.momo_phone}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {tx.momo_provider === 'airtel_money' ? 'Airtel Money' : 'MTN MoMo'}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">{tx.payment_period}</td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(tx.salary_amount, tx.currency_code)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={tx.status} />
                        {tx.failure_reason && (
                          <div className="text-[11px] text-rose-700 dark:text-rose-400 mt-1 max-w-xs">
                            {tx.failure_reason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {tx.authorized_by_name || 'Admin'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        {(tx.status === 'pending' || tx.status === 'processing') && (
                          <button
                            type="button"
                            disabled={busyTxId === tx.id}
                            onClick={() => handleVerifyStatus(tx.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                          >
                            <RefreshCw className="w-3 h-3" />
                            {t('payroll.verifyStatus')}
                          </button>
                        )}
                        {tx.status === 'failed' && canPay && (
                          <button
                            type="button"
                            disabled={busyTxId === tx.id}
                            onClick={() => handleRetryTx(tx.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {t('payroll.safeRetry')}
                          </button>
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

      {/* Tab 3: Batch Runs & Ledger */}
      {tab === 'batches' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-bold text-sm text-[#0B192C] dark:text-white">
              {t('payroll.bulkRunsTitle')}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {(overview?.batches || []).length === 0 ? (
                <div className="p-6 text-center text-slate-500">{t('payroll.emptyBatches')}</div>
              ) : (
                overview.batches.map((b) => (
                  <div key={b.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono font-semibold text-slate-900 dark:text-white">{b.batch_reference}</div>
                      <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                        {t('payroll.batchSummary', {
                          total: b.total_employees,
                          success: b.success_count,
                          pending: b.pending_count,
                          failed: b.failed_count,
                        })}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                        {t('payroll.byAuthor', { name: b.authorized_by_name || 'Admin', date: formatDateTime(b.created_at) })}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <StatusBadge status={b.status} />
                      <div className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(b.total_amount, b.currency_code)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-bold text-sm text-[#0B192C] dark:text-white">
              {t('payroll.ledgerTitle')}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {(overview?.ledger || []).length === 0 ? (
                <div className="p-6 text-center text-slate-500">{t('payroll.emptyLedger')}</div>
              ) : (
                overview.ledger.map((l) => (
                  <div key={l.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white capitalize">
                        {l.entry_type.replace(/_/g, ' ')} · <span className="font-mono text-[11px]">{l.reference}</span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 truncate">{l.note}</div>
                      <div className="text-[11px] text-slate-400 tabular-nums">{formatDateTime(l.created_at)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-bold tabular-nums ${Number(l.amount) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                        {Number(l.amount) >= 0 ? '+' : ''}
                        {formatMoney(l.amount, account.currency_code || currency)}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {t('payroll.balPrefix', { amount: formatMoney(l.balance_after, account.currency_code || currency) })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Employee Salary Configuration Modal */}
      {configModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 p-4">
          <form
            onSubmit={handleSaveConfig}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('payroll.configModalTitle')}</h2>
                <p className="text-slate-500 dark:text-slate-400">
                  {configModal.employee_name} · {configModal.role_name}
                </p>
              </div>
              <button type="button" onClick={() => setConfigModal(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  {t('payroll.salaryAmountLabel', { currency })}
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  step="any"
                  value={configModal.salary_amount}
                  onChange={(e) => setConfigModal({ ...configModal, salary_amount: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('payroll.frequencyLabel')}</label>
                <select
                  value={configModal.payment_frequency}
                  onChange={(e) => setConfigModal({ ...configModal, payment_frequency: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="monthly">{t('payroll.freqMonthly')}</option>
                  <option value="weekly">{t('payroll.freqWeekly')}</option>
                  <option value="custom">{t('payroll.freqCustom')}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {configModal.payment_frequency === 'custom' && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('payroll.customDaysLabel')}</label>
                  <input
                    required
                    type="number"
                    min="1"
                    max="365"
                    value={configModal.custom_interval_days}
                    onChange={(e) => setConfigModal({ ...configModal, custom_interval_days: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
                  />
                </div>
              )}
              <div className={configModal.payment_frequency === 'custom' ? '' : 'sm:col-span-2'}>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('payroll.nextPayDateLabel')}</label>
                <input
                  required
                  type="date"
                  value={configModal.next_payment_date}
                  onChange={(e) => setConfigModal({ ...configModal, next_payment_date: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('payroll.momoProviderLabel')}</label>
                <select
                  value={configModal.momo_provider}
                  onChange={(e) => setConfigModal({ ...configModal, momo_provider: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="mtn_momo">{t('payroll.mtnFull')}</option>
                  <option value="airtel_money">{t('payroll.airtelFull')}</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('payroll.registeredMomoLabel')}</label>
                <input
                  required
                  value={configModal.momo_phone}
                  onChange={(e) => setConfigModal({ ...configModal, momo_phone: e.target.value })}
                  placeholder="+250788123456"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('payroll.payrollNotesLabel')}</label>
              <input
                value={configModal.notes}
                onChange={(e) => setConfigModal({ ...configModal, notes: e.target.value })}
                placeholder={t('payroll.payrollNotesPlaceholder')}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setConfigModal(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg">
                {t('common.cancel')}
              </button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                {t('payroll.saveConfigBtn')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payment Authorization Modal (Individual & Bulk) */}
      {authModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 p-4">
          <form
            onSubmit={handleConfirmPay}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs shadow-2xl"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                <div>
                  <h2 className="text-base font-bold text-[#0B192C] dark:text-white">
                    {authModal.mode === 'bulk'
                      ? t('payroll.authBulkTitle', { count: authModal.configs.length })
                      : t('payroll.authSingleTitle')}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('payroll.authSubtitle')}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setAuthModal(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-slate-500 dark:text-slate-400">{t('payroll.kpiAvailableBalance')}</div>
                  <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {formatMoney(account.available_balance, currency)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-slate-500 dark:text-slate-400">{t('payroll.totalAuthAmount')}</div>
                  <div className="text-sm font-bold tabular-nums text-[#0B192C] dark:text-sky-400 mt-0.5">
                    {formatMoney(authTotalAmount, currency)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-slate-500 dark:text-slate-400">{t('payroll.balanceCheck')}</div>
                  <div className={`text-sm font-bold mt-0.5 ${sufficientBalance ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                    {sufficientBalance ? t('payroll.sufficientBalance') : t('payroll.insufficientBalance')}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                {authModal.configs.map((cfg) => (
                  <div key={cfg.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{cfg.employee_name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {providerLabels[cfg.momo_provider] || cfg.momo_provider} ·{' '}
                        <span className="font-mono">{cfg.momo_phone}</span> · {t('payroll.periodPrefix')}{' '}
                        <span className="font-mono">{cfg.due_period}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(cfg.salary_amount, cfg.currency_code)}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">{t('payroll.refGeneratedNote')}</div>
                    </div>
                  </div>
                ))}
              </div>

              {!sufficientBalance && (
                <div className="p-3 text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg font-medium">
                  {t('payroll.insufficientWarn', { amount: formatMoney(authTotalAmount, currency) })}
                </div>
              )}

              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={authChecked}
                  onChange={(e) => setAuthChecked(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-slate-700 dark:text-slate-200">
                  {t('payroll.authVerifyCheckbox')}
                </span>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/50">
              <button type="button" onClick={() => setAuthModal(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg">
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={!authChecked || !sufficientBalance || authSubmitting}
                className="px-5 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50"
              >
                {authSubmitting ? t('payroll.submittingMomo') : t('payroll.confirmAndPay')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fund Payroll Balance Modal */}
      {topupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 p-4">
          <form
            onSubmit={handleTopup}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('payroll.topupModalTitle')}</h2>
              <button type="button" onClick={() => setTopupModal(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('payroll.amountLabel', { currency })}</label>
              <input
                required
                type="number"
                min="1"
                step="any"
                value={topupForm.amount}
                onChange={(e) => setTopupForm({ ...topupForm, amount: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('payroll.fundingRefLabel')}</label>
              <input
                value={topupForm.reference}
                onChange={(e) => setTopupForm({ ...topupForm, reference: e.target.value })}
                placeholder={t('payroll.fundingRefPlaceholder')}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('payroll.noteLabel')}</label>
              <input
                value={topupForm.note}
                onChange={(e) => setTopupForm({ ...topupForm, note: e.target.value })}
                placeholder={t('payroll.notePlaceholder')}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTopupModal(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg">
                {t('common.cancel')}
              </button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg">
                {t('payroll.recordFunding')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mobile Money Gateway Config Modal */}
      {gatewayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 p-4">
          <form
            onSubmit={handleSaveGateway}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('payroll.gatewayModalTitle')}</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('payroll.gatewayModalSubtitle')}
                </p>
              </div>
              <button type="button" onClick={() => setGatewayModal(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('payroll.defaultProviderLabel')}</label>
                <select
                  value={gatewayForm.default_provider}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, default_provider: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="mtn_momo">{t('payroll.mtnFull')}</option>
                  <option value="airtel_money">{t('payroll.airtelFull')}</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('payroll.businessMomoLabel')}</label>
                <input
                  value={gatewayForm.business_momo_number}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, business_momo_number: e.target.value })}
                  placeholder="+250788000000"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">{t('payroll.mtnApiSection')}</span>
                <span className="text-[11px] text-slate-500">
                  {account.mtn_configured ? t('payroll.mtnConfigured') : t('payroll.mtnNeedsCreds')}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={gatewayForm.mtn_environment}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, mtn_environment: e.target.value })}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="sandbox">{t('payroll.mtnSandbox')}</option>
                  <option value="mtcrwanda">{t('payroll.mtnRwandaProd')}</option>
                  <option value="production">{t('payroll.production')}</option>
                </select>
                <input
                  value={gatewayForm.mtn_api_user}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, mtn_api_user: e.target.value })}
                  placeholder={account.has_business_mtn_keys ? t('payroll.updateMtnUserPlaceholder') : t('payroll.mtnUserPlaceholder')}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
                <input
                  type="password"
                  value={gatewayForm.mtn_subscription_key}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, mtn_subscription_key: e.target.value })}
                  placeholder={account.has_business_mtn_keys ? t('payroll.updateMtnSubKeyPlaceholder') : t('payroll.mtnSubKeyPlaceholder')}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
                <input
                  type="password"
                  value={gatewayForm.mtn_api_key}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, mtn_api_key: e.target.value })}
                  placeholder={account.has_business_mtn_keys ? t('payroll.updateMtnKeyPlaceholder') : t('payroll.mtnKeyPlaceholder')}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">{t('payroll.airtelApiSection')}</span>
                <span className="text-[11px] text-slate-500">
                  {account.airtel_configured ? t('payroll.mtnConfigured') : t('payroll.airtelNeedsCreds')}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <select
                  value={gatewayForm.airtel_environment}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, airtel_environment: e.target.value })}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="staging">{t('payroll.airtelStaging')}</option>
                  <option value="production">{t('payroll.airtelProd')}</option>
                </select>
                <input
                  value={gatewayForm.airtel_client_id}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, airtel_client_id: e.target.value })}
                  placeholder={account.has_business_airtel_keys ? t('payroll.updateAirtelIdPlaceholder') : t('payroll.airtelIdPlaceholder')}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
                <input
                  type="password"
                  value={gatewayForm.airtel_client_secret}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, airtel_client_secret: e.target.value })}
                  placeholder={account.has_business_airtel_keys ? t('payroll.updateAirtelSecretPlaceholder') : t('payroll.airtelSecretPlaceholder')}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setGatewayModal(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg">
                {t('common.cancel')}
              </button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">
                {t('payroll.saveGatewaySettings')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
