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
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format.js';

const PROVIDER_LABELS = {
  mtn_momo: 'MTN Mobile Money Rwanda',
  airtel_money: 'Airtel Money Rwanda',
};

export default function PayrollPage() {
  const { activeBusinessId, workspace, socket, hasPermission, refreshNotifications } = useAuth();
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
      setNotice(data.message || 'Employee payroll configuration saved.');
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
      setNotice(`Due monitor ran: ${data.alertsCreated || 0} new notification(s) generated for due salaries.`);
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
      setNotice(data.message || 'Status refreshed from Mobile Money provider.');
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
    const headers = ['Reference', 'Employee', 'Provider', 'MoMo Phone', 'Period', 'Amount', 'Currency', 'Status', 'Authorized By', 'Created At', 'Paid At'];
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
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">Automated Employee Payroll</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure employee salaries, monitor payment dates automatically, and authorize real MTN MoMo &amp; Airtel Money disbursements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRunDueMonitor}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Check Due Salaries
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setGatewayModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Settings2 className="w-3.5 h-3.5" />
              MoMo Gateway Settings
            </button>
          )}

          {canPay && (
            <button
              type="button"
              onClick={() => setTopupModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Fund Payroll Balance
            </button>
          )}

          {canPay && selectedConfigs.length > 0 && (
            <button
              type="button"
              onClick={() => openBulkAuth(selectedConfigs)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
            >
              <Send className="w-3.5 h-3.5" />
              Pay Selected ({selectedConfigs.length})
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
            <span>Available Payroll Balance</span>
            <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatMoney(account.available_balance, account.currency_code || currency)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            Reserved pending payouts: {formatMoney(account.reserved_balance, account.currency_code || currency)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Due Salary Payments</span>
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {stats.due_payments_count || 0} Due ({formatMoney(stats.due_payments_amount, currency)})
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {stats.configured_employees || 0} of {stats.total_employees || 0} staff configured
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Monthly Payroll Estimate</span>
            <Banknote className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatMoney(stats.total_monthly_payroll, currency)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {stats.active_payroll_employees || 0} active payroll schedules
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Disbursement Health</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums pt-0.5">
            {stats.successful_payments || 0} Paid · {stats.pending_transactions || 0} Pending · {stats.failed_payments || 0} Failed
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            MTN: {account.mtn_configured ? 'API Ready' : 'Credentials Needed'} · Airtel:{' '}
            {account.airtel_configured ? 'API Ready' : 'Credentials Needed'}
          </div>
        </div>
      </div>

      {/* Due Salary Alerts Banner */}
      {dueActiveConfigs.length > 0 && (
        <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                Salaries Due for Authorization ({dueActiveConfigs.length})
              </h2>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {dueAlerts.length} automated alert(s) logged. Review details and authorize Mobile Money disbursement when ready.
              </p>
            </div>
            {canPay && (
              <button
                type="button"
                onClick={() => openBulkAuth(dueActiveConfigs)}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
              >
                Authorize &amp; Pay All Due ({formatMoney(stats.due_payments_amount, currency)})
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
                    {cfg.momo_phone} · Due {formatDate(cfg.next_payment_date)}
                  </div>
                </div>
                {canPay && (
                  <button
                    type="button"
                    onClick={() => openIndividualAuth(cfg)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-500 shrink-0"
                  >
                    Pay Employee
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div role="tablist" aria-label="Payroll sections" className="inline-flex flex-wrap p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
        {[
          ['roster', 'Employee Salaries & Schedules'],
          ['transactions', 'Payroll Transactions & Reports'],
          ['batches', 'Batch Runs & Balance Ledger'],
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
                      aria-label="Select all active payroll employees"
                      checked={activeConfigs.length > 0 && selectedConfigIds.length === activeConfigs.length}
                      onChange={toggleSelectAllActive}
                    />
                  </th>
                )}
                <th className="py-3 px-4 font-semibold">Employee</th>
                <th className="py-3 px-4 font-semibold">Role / Branch</th>
                <th className="py-3 px-4 font-semibold">Mobile Money Account</th>
                <th className="py-3 px-4 font-semibold">Frequency &amp; Next Pay Date</th>
                <th className="py-3 px-4 font-semibold text-right">Salary Amount</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !overview ? (
                <tr>
                  <td colSpan={canPay ? 8 : 7} className="py-8 px-4 text-center text-slate-500">
                    Loading employee payroll schedules...
                  </td>
                </tr>
              ) : (overview?.employees || []).length === 0 ? (
                <tr>
                  <td colSpan={canPay ? 8 : 7} className="py-8 px-4 text-center text-slate-500">
                    No active employees found in this business.
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
                              aria-label={`Select ${emp.full_name}`}
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
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{emp.branch_name || 'All Branches'}</div>
                      </td>
                      <td className="py-3 px-4">
                        {cfg ? (
                          <div>
                            <div className="font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                              {cfg.momo_phone}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {PROVIDER_LABELS[cfg.momo_provider] || cfg.momo_provider}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Not configured</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {cfg ? (
                          <div>
                            <div className="capitalize font-medium text-slate-800 dark:text-slate-200">
                              {cfg.payment_frequency}
                              {cfg.payment_frequency === 'custom' && cfg.custom_interval_days
                                ? ` (Every ${cfg.custom_interval_days}d)`
                                : ''}
                            </div>
                            <div className={`text-[11px] tabular-nums ${cfg.is_due ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                              Next: {formatDate(cfg.next_payment_date)} {cfg.is_due ? '· Due' : ''}
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
                              {cfg ? 'Edit Salary' : 'Set Salary'}
                            </button>
                          )}
                          {cfg && canManage && (
                            <button
                              type="button"
                              onClick={() => handleToggleConfigStatus(cfg)}
                              title={cfg.payroll_status === 'active' ? 'Suspend payroll' : 'Reactivate payroll'}
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
                              Pay Employee
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
                placeholder="Search employee, reference, MoMo phone..."
                className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg w-64"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="processing">Processing</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!filteredTransactions.length}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export Payroll CSV
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-3 px-4 font-semibold">Reference</th>
                  <th className="py-3 px-4 font-semibold">Employee</th>
                  <th className="py-3 px-4 font-semibold">Mobile Money</th>
                  <th className="py-3 px-4 font-semibold">Period</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount</th>
                  <th className="py-3 px-4 font-semibold">Status &amp; Provider State</th>
                  <th className="py-3 px-4 font-semibold">Authorized By</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 px-4 text-center text-slate-500">
                      No payroll transactions match the selected filter.
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
                            Verify Status
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
                            Safe Retry
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
              Bulk Payroll Batch Runs
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {(overview?.batches || []).length === 0 ? (
                <div className="p-6 text-center text-slate-500">No bulk payroll batches authorized yet.</div>
              ) : (
                overview.batches.map((b) => (
                  <div key={b.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono font-semibold text-slate-900 dark:text-white">{b.batch_reference}</div>
                      <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                        {b.total_employees} staff · {b.success_count} paid / {b.pending_count} pending / {b.failed_count} failed
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                        By {b.authorized_by_name || 'Admin'} · {formatDateTime(b.created_at)}
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
              Payroll Account Funding &amp; Refund Ledger
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {(overview?.ledger || []).length === 0 ? (
                <div className="p-6 text-center text-slate-500">No payroll balance ledger entries recorded yet.</div>
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
                        Bal: {formatMoney(l.balance_after, account.currency_code || currency)}
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
                <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Configure Employee Payroll</h2>
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
                  Salary Amount ({currency})
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
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Payment Frequency</label>
                <select
                  value={configModal.payment_frequency}
                  onChange={(e) => setConfigModal({ ...configModal, payment_frequency: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="custom">Custom Interval (Days)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {configModal.payment_frequency === 'custom' && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Custom Interval (Days)</label>
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
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Next Payment Date</label>
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
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Mobile Money Provider</label>
                <select
                  value={configModal.momo_provider}
                  onChange={(e) => setConfigModal({ ...configModal, momo_provider: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="mtn_momo">MTN Mobile Money Rwanda</option>
                  <option value="airtel_money">Airtel Money Rwanda</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Registered MoMo Number</label>
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
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Payroll Notes (Optional)</label>
              <input
                value={configModal.notes}
                onChange={(e) => setConfigModal({ ...configModal, notes: e.target.value })}
                placeholder="e.g. Base monthly salary + transport allowance"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setConfigModal(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                Save Payroll Configuration
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
                      ? `Authorize Bulk Payroll (${authModal.configs.length} Employees)`
                      : 'Authorize Salary Payment'}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Review recipient Mobile Money details before submitting disbursement to the payment gateway.
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
                  <div className="text-slate-500 dark:text-slate-400">Available Payroll Balance</div>
                  <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {formatMoney(account.available_balance, currency)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-slate-500 dark:text-slate-400">Total Authorization Amount</div>
                  <div className="text-sm font-bold tabular-nums text-[#0B192C] dark:text-sky-400 mt-0.5">
                    {formatMoney(authTotalAmount, currency)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-slate-500 dark:text-slate-400">Balance Check</div>
                  <div className={`text-sm font-bold mt-0.5 ${sufficientBalance ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                    {sufficientBalance ? 'Sufficient Balance' : 'Insufficient Balance'}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                {authModal.configs.map((cfg) => (
                  <div key={cfg.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{cfg.employee_name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {PROVIDER_LABELS[cfg.momo_provider] || cfg.momo_provider} ·{' '}
                        <span className="font-mono">{cfg.momo_phone}</span> · Period{' '}
                        <span className="font-mono">{cfg.due_period}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(cfg.salary_amount, cfg.currency_code)}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">Ref generated upon authorization</div>
                    </div>
                  </div>
                ))}
              </div>

              {!sufficientBalance && (
                <div className="p-3 text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg font-medium">
                  Available payroll balance is lower than {formatMoney(authTotalAmount, currency)}. Fund the payroll balance before authorizing payment.
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
                  I verify these employee names, registered Mobile Money phone numbers, and salary amounts are accurate, and authorize server-side disbursement via Mobile Money API (no MoMo PIN required or stored).
                </span>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/50">
              <button type="button" onClick={() => setAuthModal(null)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!authChecked || !sufficientBalance || authSubmitting}
                className="px-5 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50"
              >
                {authSubmitting ? 'Submitting to Mobile Money...' : 'Confirm & Pay'}
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
              <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Fund Business Payroll Balance</h2>
              <button type="button" onClick={() => setTopupModal(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Amount ({currency})</label>
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
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Funding Reference (Optional)</label>
              <input
                value={topupForm.reference}
                onChange={(e) => setTopupForm({ ...topupForm, reference: e.target.value })}
                placeholder="e.g. BANK-TRF-2025-05"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Note</label>
              <input
                value={topupForm.note}
                onChange={(e) => setTopupForm({ ...topupForm, note: e.target.value })}
                placeholder="Monthly payroll allocation"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTopupModal(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg">
                Record Funding
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
                <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Mobile Money API Gateway Configuration</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Credentials are stored server-side and never displayed back or paired with MoMo PINs.
                </p>
              </div>
              <button type="button" onClick={() => setGatewayModal(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Default Provider</label>
                <select
                  value={gatewayForm.default_provider}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, default_provider: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="mtn_momo">MTN Mobile Money Rwanda</option>
                  <option value="airtel_money">Airtel Money Rwanda</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Business MoMo Number</label>
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
                <span className="font-bold text-slate-900 dark:text-white">MTN MoMo Disbursements API</span>
                <span className="text-[11px] text-slate-500">
                  {account.mtn_configured ? 'Configured' : 'Requires subscription key, API user & API key'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={gatewayForm.mtn_environment}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, mtn_environment: e.target.value })}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="sandbox">MTN Sandbox</option>
                  <option value="mtcrwanda">MTN Rwanda Production</option>
                  <option value="production">Production</option>
                </select>
                <input
                  value={gatewayForm.mtn_api_user}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, mtn_api_user: e.target.value })}
                  placeholder={account.has_business_mtn_keys ? 'Update MTN API User UUID (optional)' : 'MTN API User UUID'}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
                <input
                  type="password"
                  value={gatewayForm.mtn_subscription_key}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, mtn_subscription_key: e.target.value })}
                  placeholder={account.has_business_mtn_keys ? 'Update Ocp-Apim-Subscription-Key' : 'MTN Disbursement Subscription Key'}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
                <input
                  type="password"
                  value={gatewayForm.mtn_api_key}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, mtn_api_key: e.target.value })}
                  placeholder={account.has_business_mtn_keys ? 'Update MTN API Key' : 'MTN API Key'}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">Airtel Money Disbursements API</span>
                <span className="text-[11px] text-slate-500">
                  {account.airtel_configured ? 'Configured' : 'Requires client ID & secret'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <select
                  value={gatewayForm.airtel_environment}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, airtel_environment: e.target.value })}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="staging">Airtel Staging</option>
                  <option value="production">Airtel Production</option>
                </select>
                <input
                  value={gatewayForm.airtel_client_id}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, airtel_client_id: e.target.value })}
                  placeholder={account.has_business_airtel_keys ? 'Update Client ID' : 'Airtel Client ID'}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
                <input
                  type="password"
                  value={gatewayForm.airtel_client_secret}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, airtel_client_secret: e.target.value })}
                  placeholder={account.has_business_airtel_keys ? 'Update Client Secret' : 'Airtel Client Secret'}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setGatewayModal(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">
                Save Gateway Settings
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
