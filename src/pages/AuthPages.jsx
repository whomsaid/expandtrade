import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, CheckCircle2, Lock, LogIn, LogOut, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../components/LanguageSelector.jsx';
import LogoutConfirmModal from '../components/LogoutConfirmModal.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import ProfilePhotoUploader, { validateAvatarFile } from '../components/ProfilePhotoUploader.jsx';
import PublicHeader from '../components/PublicHeader.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';
import { normalizePhoneClient } from '../utils/phone.js';

function sanitizeRedirect(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '';
  return trimmed;
}

function getLandingRoute(user, memberships, redirectPath = '') {
  const safeRedirect = sanitizeRedirect(redirectPath);
  if (user?.must_change_password) {
    return safeRedirect
      ? `/change-temporary-password?redirect=${encodeURIComponent(safeRedirect)}`
      : '/change-temporary-password';
  }
  if (safeRedirect && !user.is_platform_admin) return safeRedirect;
  if (user.is_platform_admin) return '/app/admin';
  if (memberships?.length > 0) return '/app/dashboard';
  return '/customer';
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = sanitizeRedirect(searchParams.get('redirect'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pendingVerif, setPendingVerif] = useState(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setPendingVerif(null);
    setUnverifiedEmail('');
    setSubmitting(true);
    try {
      const data = await login(email, password);
      navigate(getLandingRoute(data.user, data.memberships, redirectTarget), { replace: true });
    } catch (err) {
      setError(err.message);
      if (err.code === 'ACCOUNT_VERIFICATION_REQUIRED' && err.data?.pending_token) {
        setPendingVerif(err.data);
      } else if (err.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(email.trim().toLowerCase());
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinuePendingVerification = () => {
    if (!pendingVerif) return;
    navigate(redirectTarget ? `/register?redirect=${encodeURIComponent(redirectTarget)}` : '/register', {
      state: {
        pendingVerification: pendingVerif,
        email: email.trim().toLowerCase(),
      },
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="animate-fade-up w-full max-w-md bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-[#0B192C] dark:text-white">{t('auth.loginTitle')}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('auth.loginSubtitle')}
              </p>
            </div>
            <LanguageSelector compact className="shrink-0" />
          </div>

          {error && (
            <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg space-y-2">
              <div>{error}</div>
              {pendingVerif && (
                <button
                  type="button"
                  onClick={handleContinuePendingVerification}
                  className="inline-flex items-center font-semibold text-sky-700 dark:text-sky-300 underline"
                >
                  {t('auth.completeVerificationNow')}
                </button>
              )}
              {unverifiedEmail && !pendingVerif && (
                <Link
                  to={`/register?verify_email=${encodeURIComponent(unverifiedEmail)}${
                    redirectTarget ? `&redirect=${encodeURIComponent(redirectTarget)}` : ''
                  }`}
                  className="inline-flex items-center font-semibold text-sky-700 dark:text-sky-300 underline"
                >
                  {t('auth.verifyEmailNow')}
                </Link>
              )}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.emailAddress')}</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                placeholder={t('auth.emailPlaceholder')}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t('auth.password')}</label>
                <Link to="/forgot-password" className="text-xs text-sky-700 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0">{t('auth.forgotPassword')}</Link>
              </div>
              <PasswordInput
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="btn-auth-login-live w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-colors"
            >
              <LogIn className="w-4 h-4 auth-btn-icon shrink-0" aria-hidden="true" />
              <span>{submitting ? t('auth.signingIn') : t('auth.signIn')}</span>
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-center text-xs text-slate-600 dark:text-slate-400">
            <p>
              {t('auth.newCustomer')}{' '}
              <Link
                to={redirectTarget ? `/register?redirect=${encodeURIComponent(redirectTarget)}` : '/register'}
                className="font-semibold text-sky-700 dark:text-sky-400 hover:underline"
              >
                {t('auth.createCustomerAccount')}
              </Link>
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('auth.workspaceProvisionNote')}{' '}
              <Link to="/contact" className="text-sky-700 dark:text-sky-400 hover:underline">{t('auth.requestOnboarding')}</Link>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function formatCountdownClock(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function RegisterPage() {
  const { t } = useTranslation();
  const { completeSession, language } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTarget = sanitizeRedirect(searchParams.get('redirect'));
  const pendingFromState = location.state?.pendingVerification || null;

  const [step, setStep] = useState(pendingFromState ? 'verify' : 'details');
  const [form, setForm] = useState({
    full_name: '',
    email: location.state?.email || '',
    phone: '+250',
    password: '',
    confirm_password: '',
    whatsapp_available: false,
  });

  const [pendingSession, setPendingSession] = useState(() =>
    pendingFromState
      ? {
          pending_token: pendingFromState.pending_token,
          masked_email: pendingFromState.masked_email,
          channels: pendingFromState.channels || {},
        }
      : null
  );
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  useEffect(() => {
    if (!expiresAt && resendCooldown <= 0) return undefined;
    const updateTimers = () => {
      if (expiresAt > 0) {
        setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
      }
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    };
    const timer = setInterval(updateTimers, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, resendCooldown > 0]);

  const applyOtpMetadata = (data, defaultExpires = 300, defaultCooldown = 60) => {
    const ttl = Number(data?.expiresInSeconds || defaultExpires);
    const cd = Number(data?.resendCooldownSeconds || defaultCooldown);
    setExpiresAt(Date.now() + ttl * 1000);
    setSecondsLeft(ttl);
    setResendCooldown(cd);
  };

  const handleCreatePendingAccount = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (form.full_name.trim().length < 2) {
      setError(t('auth.fullNameRequired'));
      return;
    }
    const phoneCheck = normalizePhoneClient(form.phone);
    if (!phoneCheck.valid) {
      setError(phoneCheck.error);
      return;
    }
    const pwErr = validatePasswordStrength(form.password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (form.password !== form.confirm_password) {
      setError(t('validation.passwordsMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const normalizedEmail = form.email.trim().toLowerCase();
      const { data } = await api.post('/auth/register', {
        full_name: form.full_name.trim(),
        email: normalizedEmail,
        phone: phoneCheck.e164,
        password: form.password,
        confirm_password: form.confirm_password,
        preferred_language: language,
        whatsapp_available: form.whatsapp_available,
      });

      const channels = data.channels || {};
      setPendingSession({
        pending_token: data.pending_token,
        masked_email: data.masked_email,
        channels,
      });
      setOtpSent(false);
      setOtp('');
      setExpiresAt(0);
      setSecondsLeft(0);
      setResendCooldown(0);
      setNotice(data.message || t('auth.pendingAccountCreated'));
      setStep('verify');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const sendEmailOtp = async () => {
    if (!pendingSession?.pending_token || sendingOtp) return;
    setError('');
    setNotice('');
    setSendingOtp(true);
    try {
      const { data } = await api.post('/auth/registration/send-otp', {
        pending_token: pendingSession.pending_token,
        channel: 'email',
      });
      setOtpSent(true);
      setOtp('');
      applyOtpMetadata(data, 300, 60);
      setNotice(data.message);
    } catch (err) {
      if (err.data?.retryAfterSeconds) {
        setResendCooldown(Number(err.data.retryAfterSeconds));
      }
      setError(err.message);
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!pendingSession?.pending_token) return;
    setError('');
    setNotice('');
    if (!otpSent) {
      setError(t('auth.sendCodeFirstHint'));
      return;
    }
    if (!/^\d{6}$/.test(otp.trim())) {
      setError(t('auth.otpPlaceholder'));
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/registration/verify-otp', {
        pending_token: pendingSession.pending_token,
        channel: 'email',
        otp_code: otp.trim(),
      });
      await completeSession(data.token, data.user, data.memberships || []);
      navigate(redirectTarget || '/customer', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const emailChannelAvailable = Boolean(pendingSession?.channels?.email?.available);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="animate-fade-up w-full max-w-lg bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
          {/* Registration Progress Indicator */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800 text-[11px]">
            <div className="flex items-center gap-2 font-semibold">
              <span className={step === 'details' ? 'text-[#0B192C] dark:text-sky-400' : 'text-emerald-700 dark:text-emerald-400'}>
                {step === 'verify' ? '1. ✓ ' : '1. '}
                {t('auth.stepDetails')}
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className={step === 'verify' ? 'text-[#0B192C] dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'}>
                2. {t('auth.stepVerify')}
              </span>
            </div>
            <LanguageSelector compact className="shrink-0" />
          </div>

          {step === 'details' && (
            <>
              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl font-bold text-[#0B192C] dark:text-white">{t('auth.registerTitle')}</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('auth.registerDetailsSubtitle')}
                </p>
              </div>

              {notice && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{notice}</div>}
              {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

              <form onSubmit={handleCreatePendingAccount} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.fullName')}</label>
                  <input
                    required
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    placeholder={t('auth.fullNamePlaceholder')}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.emailAddress')}</label>
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      placeholder={t('auth.emailPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.phoneWithHint')}</label>
                    <input
                      required
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                      placeholder="+250788123456"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.password')}</label>
                    <PasswordInput
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.confirmPassword')}</label>
                    <PasswordInput
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={form.confirm_password}
                      onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('auth.passwordPolicyHint')} · {t('auth.avatarOptionalNote', { defaultValue: 'Profile photo is optional and can be added later in Settings.' })}
                </p>
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.whatsapp_available}
                    onChange={(e) => setForm({ ...form, whatsapp_available: e.target.checked })}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {t('auth.whatsappAvailableLabel', { defaultValue: 'My registered phone number is available on WhatsApp (so businesses can contact me via WhatsApp).' })}
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
                >
                  {submitting ? t('auth.savingDetails') : t('auth.continueVerification')}
                </button>
              </form>

              <p className="text-xs text-slate-600 dark:text-slate-400 text-center">
                {t('auth.alreadyRegistered')}{' '}
                <Link
                  to={redirectTarget ? `/login?redirect=${encodeURIComponent(redirectTarget)}` : '/login'}
                  className="font-semibold text-sky-700 dark:text-sky-400 hover:underline"
                >
                  {t('auth.signIn')}
                </Link>
              </p>
            </>
          )}

          {step === 'verify' && pendingSession && (
            <>
              <div className="space-y-1">
                <h1 className="text-lg sm:text-xl font-bold text-[#0B192C] dark:text-white">
                  {t('auth.emailOtpVerifyTitle', { defaultValue: 'Verify Your Email Address' })}
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('auth.emailOtpVerifySubtitle', { defaultValue: 'Request a 6-digit verification code sent exclusively to your registered email address.' })}
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Mail className="w-5 h-5 text-[#0B192C] dark:text-sky-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">{t('auth.channelEmailTitle')}</div>
                    <div className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate tabular-nums">
                      {pendingSession.masked_email || form.email}
                    </div>
                  </div>
                </div>
                {otpSent && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
              </div>

              {!emailChannelAvailable && (
                <div className="p-3 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-lg">
                  {t('auth.smtpUnavailableWarning', { defaultValue: 'Email delivery service is not configured yet. Please ask the administrator to configure SMTP credentials.' })}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={sendingOtp || !emailChannelAvailable || (otpSent && resendCooldown > 0)}
                  onClick={sendEmailOtp}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-55"
                >
                  {sendingOtp
                    ? t('auth.sendingOtp')
                    : otpSent
                      ? resendCooldown > 0
                        ? t('auth.resendInSeconds', { seconds: resendCooldown })
                        : t('auth.resendCode')
                      : t('auth.sendEmailOtpCode', { defaultValue: 'Send Verification Code' })}
                </button>
                {otpSent && expiresAt > 0 && (
                  <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                    {secondsLeft > 0 ? (
                      <>
                        {t('auth.otpExpiresIn')}{' '}
                        <span className="font-mono font-bold text-[#0B192C] dark:text-sky-300">
                          {formatCountdownClock(secondsLeft)}
                        </span>
                      </>
                    ) : (
                      <span className="text-rose-700 dark:text-rose-400 font-medium">{t('auth.otpExpiredNotice')}</span>
                    )}
                  </div>
                )}
              </div>

              {notice && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{notice}</div>}
              {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

              {otpSent && (
                <form onSubmit={handleVerifyOtp} className="space-y-3.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                      {t('auth.enterSixDigitCode')}
                    </label>
                    <input
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder={t('auth.otpPlaceholder')}
                      className="w-full px-3 py-2.5 text-center text-lg font-mono tracking-widest tabular-nums bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || (expiresAt > 0 && secondsLeft === 0)}
                    className="w-full py-2.5 text-sm font-semibold text-white bg-emerald-700 dark:bg-emerald-600 rounded-lg hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {submitting ? t('auth.verifying') : t('auth.verifyActivateAccount')}
                  </button>
                </form>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <Link
                  to={redirectTarget ? `/login?redirect=${encodeURIComponent(redirectTarget)}` : '/login'}
                  className="text-sky-700 dark:text-sky-400 hover:underline font-medium"
                >
                  {t('auth.backToSignIn')}
                </Link>
                {!pendingFromState && (
                  <button
                    type="button"
                    onClick={() => {
                      setStep('details');
                      setError('');
                      setNotice('');
                    }}
                    className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:underline"
                  >
                    {t('auth.startNewRegistration')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export function ActivateAccountPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token') || '';
  const { completeSession } = useAuth();
  const navigate = useNavigate();

  const [token, setToken] = useState(tokenParam);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenParam));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('');
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    if (!tokenParam) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get('/auth/activation-preview', { params: { token: tokenParam } })
      .then((res) => {
        setPreview(res.data);
        setError('');
      })
      .catch((err) => {
        setPreview(null);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [tokenParam]);

  const handleLoadToken = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/auth/activation-preview', { params: { token: token.trim() } });
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    setError('');
    if (!file) {
      setAvatarFile(null);
      return;
    }
    const validationErr = validateAvatarFile(file);
    if (validationErr) {
      setError(validationErr);
      setAvatarFile(null);
      e.target.value = '';
      return;
    }
    setAvatarFile(file);
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    setError('');
    if (avatarFile) {
      const avatarErr = validateAvatarFile(avatarFile);
      if (avatarErr) {
        setError(avatarErr);
        return;
      }
    }
    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== confirmPassword) {
      setError(t('validation.passwordsMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('token', token.trim());
      fd.append('password', password);
      fd.append('confirm_password', confirmPassword);
      if (avatarFile) {
        fd.append('avatar', avatarFile);
      }

      const { data } = await api.post('/auth/activate-account', fd);
      await completeSession(data.token, data.user, data.memberships || []);
      navigate('/app/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="animate-fade-up w-full max-w-md bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-[#0B192C] dark:text-white">{t('auth.activateTitle')}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('auth.activateSubtitle')}
              </p>
            </div>
            <LanguageSelector compact className="shrink-0" />
          </div>

          {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

          {loading ? (
            <div className="text-xs text-slate-500 dark:text-slate-400 py-4">{t('auth.validatingInvite')}</div>
          ) : !preview ? (
            <form onSubmit={handleLoadToken} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.activationToken')}</label>
                <input
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t('auth.activationTokenPlaceholder')}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>
              <button type="submit" className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">
                {t('auth.verifyInvitation')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1 text-xs">
                <div className="font-semibold text-slate-900 dark:text-white">{preview.business_name}</div>
                <div className="text-slate-600 dark:text-slate-300">{t('auth.assignedRole')}: <span className="font-semibold text-slate-900 dark:text-white">{preview.role_name}</span></div>
                <div className="text-slate-600 dark:text-slate-300">{t('auth.accountLabel')}: {preview.full_name} ({preview.email})</div>
                {preview.business_code && (
                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{t('auth.businessId')}: {preview.business_code}</div>
                )}
              </div>

              <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg">
                <UserAvatar src={avatarPreview} name={preview.full_name} size="lg" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {t('auth.profileImage')} <span className="text-slate-400 font-normal">({t('common.optional')})</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('auth.imageFormatHint')}</div>
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{avatarFile ? t('auth.changeImage') : t('auth.addPhotoOptional')}</span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.setPasswordMin')}</label>
                <PasswordInput
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.confirmPassword')}</label>
                <PasswordInput
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
              >
                {submitting ? t('auth.activatingAccount') : t('auth.activateOpenWorkspace')}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

export function CompleteProfilePage() {
  const { t } = useTranslation();
  const { user, memberships, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = sanitizeRedirect(searchParams.get('redirect'));
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const handleUploaded = (data) => {
    const updatedUser = data?.user || { ...user, avatar_url: data?.avatar_url };
    if (redirectTarget && !updatedUser?.is_platform_admin) {
      navigate(redirectTarget, { replace: true });
    } else if (updatedUser?.is_platform_admin) {
      navigate('/app/admin', { replace: true });
    } else if (memberships?.length > 0) {
      navigate('/app/dashboard', { replace: true });
    } else {
      navigate('/customer', { replace: true });
    }
  };

  const handleConfirmLogout = async () => {
    await logout();
    setLogoutConfirmOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="animate-fade-up w-full max-w-lg bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('auth.completeProfileTitle')}</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {t('auth.completeProfileSubtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t('nav.signOut')}
            </button>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-xs space-y-0.5">
            <div className="font-semibold text-slate-900 dark:text-white">{user?.full_name}</div>
            <div className="text-slate-600 dark:text-slate-300">{user?.email}</div>
          </div>

          <ProfilePhotoUploader
            title={t('auth.uploadMandatoryPhotoTitle')}
            description={t('auth.uploadMandatoryPhotoDesc')}
            requiredMode
            onUploaded={handleUploaded}
          />
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

export function ForceChangePasswordPage() {
  const { t } = useTranslation();
  const { user, refreshMe, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = sanitizeRedirect(searchParams.get('redirect'));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const strengthErr = validatePasswordStrength(newPassword);
    if (strengthErr) {
      setError(strengthErr);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('validation.newPasswordsMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      await refreshMe();
      const updatedUser = data?.user;
      if (redirectTarget && !updatedUser?.is_platform_admin) {
        navigate(redirectTarget, { replace: true });
      } else if (updatedUser?.is_platform_admin) {
        navigate('/app/admin', { replace: true });
      } else if ((data?.memberships || []).length > 0) {
        navigate('/app/dashboard', { replace: true });
      } else {
        navigate('/customer', { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmLogout = async () => {
    await logout();
    setLogoutConfirmOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="animate-fade-up w-full max-w-lg bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <Lock className="w-3.5 h-3.5" />
                <span>{t('auth.actionRequiredBadge')}</span>
              </div>
              <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('auth.forcePwTitle')}</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {t('auth.forcePwSubtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t('nav.signOut')}
            </button>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-xs space-y-0.5">
            <div className="font-semibold text-slate-900 dark:text-white">{user?.full_name}</div>
            <div className="text-slate-600 dark:text-slate-300">{user?.email}</div>
          </div>

          {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.currentTempPw')}</label>
              <PasswordInput
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t('auth.currentTempPwPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.newPermPw')}</label>
              <PasswordInput
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('auth.newPermPwPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.confirmNewPw')}</label>
              <PasswordInput
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('auth.confirmNewPwPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('auth.passwordPolicyHint')}
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
            >
              {submitting ? t('auth.updatingPassword') : t('auth.savePermPwContinue')}
            </button>
          </form>
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

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState('request');
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRequest = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setMessage(data.message);
      setStep('reset');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/reset-password', { reset_token: resetToken.trim(), new_password: newPassword });
      setMessage(data.message);
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="animate-fade-up w-full max-w-md bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-[#0B192C] dark:text-white">{t('auth.forgotTitle')}</h1>
            <LanguageSelector compact className="shrink-0" />
          </div>
          {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
          {message && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{message}</div>}

          {step === 'request' && (
            <form onSubmit={handleRequest} className="space-y-4">
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.accountEmail')} className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
              <button type="submit" disabled={submitting} className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg disabled:opacity-60">{t('auth.sendRecoveryToken')}</button>
            </form>
          )}
          {step === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <input required value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder={t('auth.pasteRecoveryToken')} className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg font-mono" />
              <PasswordInput required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t('auth.newPasswordPlaceholder')} className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
              <button type="submit" disabled={submitting} className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg disabled:opacity-60">{t('auth.resetPassword')}</button>
            </form>
          )}
          {step === 'done' && (
            <Link to="/login" className="block text-center py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">{t('auth.returnSignIn')}</Link>
          )}
        </div>
      </main>
    </div>
  );
}
