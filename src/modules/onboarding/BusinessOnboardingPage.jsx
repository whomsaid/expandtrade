import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Coins, GitBranch, Store } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { AFRICAN_COUNTRIES, BUSINESS_CATEGORIES, PAYMENT_METHOD_LABELS, RWANDA_PROVINCES, getPaymentMethodLabel } from '../../utils/format.js';

const STEP_KEYS = ['identity', 'branch', 'finance', 'readiness'];

export default function BusinessOnboardingPage() {
  const { t } = useTranslation();
  const { activeBusinessId, workspace, refreshMe, loadWorkspace } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState({
    identity: false,
    branch: false,
    finance: false,
    readiness: false,
  });
  const [setupDone, setSetupDone] = useState(false);
  const [counts, setCounts] = useState({ branch_count: 1, product_count: 0, category_count: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const [identityForm, setIdentityForm] = useState({
    name: '',
    category: BUSINESS_CATEGORIES[0],
    description: '',
    phone: '+250',
    phone_on_whatsapp: false,
    country: 'Rwanda',
    province: 'Kigali City',
    district: 'Gasabo',
    physical_address: '',
    operating_hours: 'Mon-Sat 08:00 - 20:00',
  });

  const [branchForm, setBranchForm] = useState({
    branch_name: '',
    branch_address: '',
    branch_phone: '+250',
    branch_district: 'Gasabo',
    branch_province: 'Kigali City',
  });

  const [financeForm, setFinanceForm] = useState({
    currency_code: 'RWF',
    timezone: 'Africa/Kigali',
    tax_enabled: true,
    default_tax_rate: '18',
    tax_identification_number: '',
    receipt_header: '',
    receipt_footer: '',
    language: 'en',
    enabled_payment_methods: ['cash', 'mtn_momo', 'airtel_money', 'bank_transfer'],
  });

  const [initialCategory, setInitialCategory] = useState('General Merchandise');

  const loadOnboardingState = useCallback(async () => {
    if (!activeBusinessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/businesses/current/onboarding');
      const biz = data.business || {};
      const br = data.mainBranch || {};
      const st = data.settings || {};
      let parsedPay = ['cash', 'mtn_momo', 'airtel_money', 'bank_transfer'];
      if (st.enabled_payment_methods) {
        try {
          parsedPay = Array.isArray(st.enabled_payment_methods)
            ? st.enabled_payment_methods
            : JSON.parse(st.enabled_payment_methods);
        } catch {
          parsedPay = ['cash', 'mtn_momo', 'airtel_money', 'bank_transfer'];
        }
      }

      setSetupDone(Boolean(data.setup_completed));
      setCounts(data.counts || { branch_count: 1, product_count: 0, category_count: 0 });
      const steps = data.steps || { identity: false, branch: false, finance: false, readiness: false };
      setCompletedSteps(steps);

      setIdentityForm({
        name: biz.name || '',
        category: biz.category || BUSINESS_CATEGORIES[0],
        description: biz.description || '',
        phone: biz.phone || '+250',
        phone_on_whatsapp: Boolean(biz.phone_on_whatsapp),
        country: biz.country || 'Rwanda',
        province: biz.province || 'Kigali City',
        district: biz.district || 'Gasabo',
        physical_address: biz.physical_address || '',
        operating_hours: biz.operating_hours || 'Mon-Sat 08:00 - 20:00',
      });

      setBranchForm({
        branch_name: br.name || 'Main Headquarters',
        branch_address: br.address || biz.physical_address || '',
        branch_phone: br.phone || biz.phone || '+250',
        branch_district: br.district || biz.district || 'Gasabo',
        branch_province: br.province || biz.province || 'Kigali City',
      });

      setFinanceForm({
        currency_code: biz.currency_code || 'RWF',
        timezone: biz.timezone || 'Africa/Kigali',
        tax_enabled: biz.tax_enabled !== undefined ? Boolean(biz.tax_enabled) : true,
        default_tax_rate: String(biz.default_tax_rate ?? 18),
        tax_identification_number: biz.tax_identification_number || '',
        receipt_header: st.receipt_header || biz.name || '',
        receipt_footer: st.receipt_footer || 'Thank you for trading with us.',
        language: st.language || 'en',
        enabled_payment_methods: parsedPay,
      });

      if (!data.setup_completed) {
        const firstIncomplete = STEP_KEYS.findIndex((k) => !steps[k]);
        setCurrentStep(firstIncomplete >= 0 ? firstIncomplete : 3);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    loadOnboardingState();
  }, [loadOnboardingState]);

  const handleCountryChange = (countryName) => {
    const preset = AFRICAN_COUNTRIES.find((c) => c.country === countryName);
    setIdentityForm((prev) => ({
      ...prev,
      country: countryName,
      phone: preset && (!prev.phone || prev.phone.length <= 5) ? preset.prefix : prev.phone,
    }));
    if (preset) {
      setFinanceForm((prev) => ({
        ...prev,
        currency_code: preset.currency,
        timezone: preset.timezone,
      }));
    }
  };

  const togglePayMethod = (method) => {
    setFinanceForm((prev) => {
      const exists = prev.enabled_payment_methods.includes(method);
      const next = exists
        ? prev.enabled_payment_methods.filter((m) => m !== method)
        : [...prev.enabled_payment_methods, method];
      return { ...prev, enabled_payment_methods: next.length > 0 ? next : [method] };
    });
  };

  const handleSaveStep = async (e, finalize = false) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setNotice('');
    setSaving(true);
    const stepKey = STEP_KEYS[currentStep];
    try {
      let payloadData = {};
      if (stepKey === 'identity') {
        payloadData = identityForm;
      } else if (stepKey === 'branch') {
        payloadData = branchForm;
      } else if (stepKey === 'finance') {
        payloadData = {
          ...financeForm,
          default_tax_rate: Number(financeForm.default_tax_rate || 0),
        };
      } else if (stepKey === 'readiness') {
        payloadData = { initial_category: initialCategory.trim() };
      }

      const { data } = await api.patch('/businesses/current/onboarding', {
        step: stepKey,
        data: payloadData,
        complete: finalize,
      });

      setCompletedSteps((prev) => ({ ...prev, ...data.steps }));
      if (data.setup_completed) {
        setSetupDone(true);
        setNotice(data.message || t('onboarding.completedMsg'));
        await refreshMe();
        await loadWorkspace(activeBusinessId);
        navigate('/app/dashboard', { replace: true });
        return;
      }

      setNotice(data.message || t('onboarding.stepSavedMsg'));
      if (currentStep < STEP_KEYS.length - 1) {
        setCurrentStep((prev) => prev + 1);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8 text-xs text-slate-500 dark:text-slate-400">
        {t('common.loadingData')}
      </div>
    );
  }

  if (!activeBusinessId) {
    return (
      <div className="max-w-2xl mx-auto py-8 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
        <h1 className="text-lg font-bold text-[#0B192C] dark:text-white">{t('onboarding.title')}</h1>
        <p className="text-slate-600 dark:text-slate-300">{t('onboarding.noAssignedBusiness')}</p>
      </div>
    );
  }

  const completedCount = STEP_KEYS.filter((k) => completedSteps[k]).length;
  const progressPct = Math.round((completedCount / STEP_KEYS.length) * 100);

  const stepMeta = [
    { key: 'identity', title: t('onboarding.step1Title'), icon: Store },
    { key: 'branch', title: t('onboarding.step2Title'), icon: GitBranch },
    { key: 'finance', title: t('onboarding.step3Title'), icon: Coins },
    { key: 'readiness', title: t('onboarding.step4Title'), icon: ClipboardCheck },
  ];

  return (
    <div className="max-w-3xl mx-auto py-2 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">
            {t('onboarding.title')} {workspace?.business?.name ? `— ${workspace.business.name}` : ''}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {t('onboarding.subtitle')}
          </p>
        </div>
        {setupDone && (
          <button
            type="button"
            onClick={() => navigate('/app/dashboard')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('onboarding.backToDashboard')}
          </button>
        )}
      </div>

      {/* Progress Tracker */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {t('onboarding.progressLabel', { done: completedCount, total: STEP_KEYS.length })}
          </span>
          <span className="font-mono font-semibold text-sky-700 dark:text-sky-400 tabular-nums">{progressPct}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-sky-600 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {stepMeta.map((s, idx) => {
            const Icon = s.icon;
            const active = currentStep === idx;
            const done = Boolean(completedSteps[s.key]);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setCurrentStep(idx)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-colors ${
                  active
                    ? 'bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-600'
                    : done
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {done && !active ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="font-medium truncate">{idx + 1}. {s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 text-xs font-medium text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          {notice}
        </div>
      )}

      {/* Step Forms */}
      <form
        onSubmit={(e) => handleSaveStep(e, currentStep === STEP_KEYS.length - 1)}
        className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5 text-xs"
      >
        {currentStep === 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('onboarding.step1Heading')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.businessName')}</label>
                <input
                  required
                  value={identityForm.name}
                  onChange={(e) => setIdentityForm({ ...identityForm, name: e.target.value })}
                  placeholder={t('onboarding.businessNamePlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.businessCategory')}</label>
                <select
                  value={identityForm.category}
                  onChange={(e) => setIdentityForm({ ...identityForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {BUSINESS_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.description')}</label>
              <textarea
                rows={2}
                value={identityForm.description}
                onChange={(e) => setIdentityForm({ ...identityForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.phoneNumber')}</label>
                <input
                  required
                  value={identityForm.phone}
                  onChange={(e) => setIdentityForm({ ...identityForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
                <label className="flex items-center gap-2 mt-2 text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={Boolean(identityForm.phone_on_whatsapp)}
                    onChange={(e) => setIdentityForm({ ...identityForm, phone_on_whatsapp: e.target.checked })}
                  />
                  <span>{t('whatsapp.businessPhoneOnWhatsapp')}</span>
                </label>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('superAdmin.opHoursLabel')}</label>
                <input
                  value={identityForm.operating_hours}
                  onChange={(e) => setIdentityForm({ ...identityForm, operating_hours: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.country')}</label>
                <select
                  value={identityForm.country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {AFRICAN_COUNTRIES.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.provinceRegion')}</label>
                {identityForm.country === 'Rwanda' ? (
                  <select
                    value={identityForm.province}
                    onChange={(e) => setIdentityForm({ ...identityForm, province: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {RWANDA_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <input
                    value={identityForm.province}
                    onChange={(e) => setIdentityForm({ ...identityForm, province: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                )}
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.districtCity')}</label>
                <input
                  required
                  value={identityForm.district}
                  onChange={(e) => setIdentityForm({ ...identityForm, district: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.physicalAddress')}</label>
              <input
                required
                value={identityForm.physical_address}
                onChange={(e) => setIdentityForm({ ...identityForm, physical_address: e.target.value })}
                placeholder={t('onboarding.addressPlaceholder')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('onboarding.step2Heading')}</h2>
            <p className="text-slate-500 dark:text-slate-400">{t('onboarding.step2Desc')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.mainBranchName')}</label>
                <input
                  required
                  value={branchForm.branch_name}
                  onChange={(e) => setBranchForm({ ...branchForm, branch_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.branchPhone')}</label>
                <input
                  value={branchForm.branch_phone}
                  onChange={(e) => setBranchForm({ ...branchForm, branch_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.branchAddress')}</label>
                <input
                  required
                  value={branchForm.branch_address}
                  onChange={(e) => setBranchForm({ ...branchForm, branch_address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.districtCity')}</label>
                <input
                  value={branchForm.branch_district}
                  onChange={(e) => setBranchForm({ ...branchForm, branch_district: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('onboarding.step3Heading')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.currency')}</label>
                <input
                  required
                  value={financeForm.currency_code}
                  onChange={(e) => setFinanceForm({ ...financeForm, currency_code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.taxRate')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={financeForm.default_tax_rate}
                  onChange={(e) => setFinanceForm({ ...financeForm, default_tax_rate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('onboarding.tinOptional')}</label>
                <input
                  value={financeForm.tax_identification_number}
                  onChange={(e) => setFinanceForm({ ...financeForm, tax_identification_number: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('settings.receiptHeader')}</label>
                <input
                  value={financeForm.receipt_header}
                  onChange={(e) => setFinanceForm({ ...financeForm, receipt_header: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('settings.receiptFooter')}</label>
                <input
                  value={financeForm.receipt_footer}
                  onChange={(e) => setFinanceForm({ ...financeForm, receipt_footer: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('settings.enabledPayMethods')}</label>
              <div className="flex flex-wrap gap-2.5">
                {Object.keys(PAYMENT_METHOD_LABELS).map((k) => (
                  <label key={k} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={financeForm.enabled_payment_methods.includes(k)}
                      onChange={() => togglePayMethod(k)}
                    />
                    <span>{getPaymentMethodLabel(k)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('onboarding.step4Heading')}</h2>
            <p className="text-slate-600 dark:text-slate-300">{t('onboarding.step4Desc')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">{t('onboarding.summaryIdentity')}</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{identityForm.name}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">{t('onboarding.summaryBranch')}</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{branchForm.branch_name}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">{t('onboarding.summaryCurrency')}</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                  {financeForm.currency_code} · VAT {financeForm.default_tax_rate}%
                </div>
              </div>
            </div>

            {counts.category_count === 0 && (
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('onboarding.initialCategoryLabel')}
                </label>
                <input
                  value={initialCategory}
                  onChange={(e) => setInitialCategory(e.target.value)}
                  placeholder={t('onboarding.initialCategoryPlaceholder')}
                  className="w-full sm:max-w-sm px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={currentStep === 0 || saving}
            onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('common.back')}
          </button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            <span>
              {saving
                ? t('onboarding.savingStep')
                : currentStep === STEP_KEYS.length - 1
                  ? t('onboarding.finishWorkspaceBtn')
                  : t('onboarding.saveContinueBtn')}
            </span>
            {currentStep < STEP_KEYS.length - 1 && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </form>
    </div>
  );
}
