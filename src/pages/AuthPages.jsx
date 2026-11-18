import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Lock, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../components/LanguageSelector.jsx';
import LogoutConfirmModal from '../components/LogoutConfirmModal.jsx';
import ProfilePhotoUploader, { validateAvatarFile } from '../components/ProfilePhotoUploader.jsx';
import PublicHeader from '../components/PublicHeader.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';

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
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await login(email, password);
      navigate(getLandingRoute(data.user, data.memberships, redirectTarget), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="animate-fade-up w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">{t('auth.loginTitle')}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('auth.loginSubtitle')}
              </p>
            </div>
            <LanguageSelector compact className="shrink-0" />
          </div>

          {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

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
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t('auth.password')}</label>
                <Link to="/forgot-password" className="text-xs text-sky-700 dark:text-sky-400 hover:underline">{t('auth.forgotPassword')}</Link>
              </div>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
            >
              {submitting ? t('auth.signingIn') : t('auth.signIn')}
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

export function RegisterPage() {
  const { t } = useTranslation();
  const { completeSession, language } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = sanitizeRedirect(searchParams.get('redirect'));
  const [step, setStep] = useState('form');
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '+250',
    password: '',
    confirm_password: '',
  });
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [pendingSession, setPendingSession] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
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
      const { data } = await api.post('/auth/register', {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        confirm_password: form.confirm_password,
        preferred_language: language,
      });
      setPendingSession(data);
      if (data.devOtpPreview) setDevOtp(data.devOtpPreview);
      setStep('verify');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/auth/resend-verification', { email: form.email });
      if (data.devOtpPreview) setDevOtp(data.devOtpPreview);
      setNotice(data.message);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/verify-email', { email: form.email, otp_code: otp });
      await completeSession(pendingSession.token, { ...pendingSession.user, is_email_verified: 1, preferred_language: language }, []);
      navigate(redirectTarget || '/customer', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="animate-fade-up w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
          {step === 'form' ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">{t('auth.registerTitle')}</h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('auth.registerSubtitle')}
                  </p>
                </div>
                <LanguageSelector compact className="shrink-0" />
              </div>
              {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
              <form onSubmit={handleRegister} className="space-y-3.5">
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
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.password')}</label>
                    <input
                      required
                      minLength={8}
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.confirmPassword')}</label>
                    <input
                      required
                      minLength={8}
                      type="password"
                      value={form.confirm_password}
                      onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
                >
                  {submitting ? t('auth.creatingAccount') : t('auth.createAccount')}
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
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('auth.verifyTitle')}</h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('auth.verifySubtitle')} <span className="font-medium text-slate-700 dark:text-slate-200">{form.email}</span>. {t('auth.verifySubtitleEnd')}
                  </p>
                </div>
                <LanguageSelector compact className="shrink-0" />
              </div>
              {devOtp && (
                <div className="p-3 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-lg text-xs text-sky-900 dark:text-sky-200">
                  {t('auth.otpPreview')} <span className="font-mono font-bold">{devOtp}</span>
                </div>
              )}
              {notice && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{notice}</div>}
              {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
              <form onSubmit={handleVerify} className="space-y-4">
                <input
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder={t('auth.otpPlaceholder')}
                  className="w-full px-3 py-2.5 text-center text-lg font-mono tracking-widest bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <button type="submit" disabled={submitting} className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                  {submitting ? t('auth.verifying') : t('auth.verifyContinue')}
                </button>
              </form>
              <button
                type="button"
                onClick={handleResend}
                className="w-full text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
              >
                {t('auth.resendCode')}
              </button>
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
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="animate-fade-up w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">{t('auth.activateTitle')}</h1>
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
                <input
                  required
                  minLength={8}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.confirmPassword')}</label>
                <input
                  required
                  minLength={8}
                  type="password"
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
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="animate-fade-up w-full max-w-lg bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
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
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="animate-fade-up w-full max-w-lg bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
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
              <input
                required
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t('auth.currentTempPwPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.newPermPw')}</label>
              <input
                required
                minLength={8}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('auth.newPermPwPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('auth.confirmNewPw')}</label>
              <input
                required
                minLength={8}
                type="password"
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
  const [devToken, setDevToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleRequest = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage(data.message);
      if (data.devResetToken) setDevToken(data.devResetToken);
      setStep('reset');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/reset-password', { reset_token: resetToken, new_password: newPassword });
      setMessage(data.message);
      setStep('done');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="animate-fade-up w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">{t('auth.forgotTitle')}</h1>
            <LanguageSelector compact className="shrink-0" />
          </div>
          {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
          {message && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{message}</div>}
          {devToken && (
            <div className="p-3 text-xs bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 rounded-lg font-mono break-all">
              {t('auth.recoveryTokenPreview')} {devToken}
            </div>
          )}

          {step === 'request' && (
            <form onSubmit={handleRequest} className="space-y-4">
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.accountEmail')} className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
              <button type="submit" className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">{t('auth.sendRecoveryToken')}</button>
            </form>
          )}
          {step === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <input required value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder={t('auth.pasteRecoveryToken')} className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg font-mono" />
              <input required minLength={8} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t('auth.newPasswordPlaceholder')} className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
              <button type="submit" className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">{t('auth.resetPassword')}</button>
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
