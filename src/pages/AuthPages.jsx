import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, LogOut, Upload } from 'lucide-react';
import PublicHeader from '../components/PublicHeader.jsx';
import LogoutConfirmModal from '../components/LogoutConfirmModal.jsx';
import ProfilePhotoUploader, { validateAvatarFile } from '../components/ProfilePhotoUploader.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';

function getLandingRoute(user, memberships) {
  if (user?.must_change_password) return '/change-temporary-password';
  if (!user?.avatar_url) return '/complete-profile';
  if (user.is_platform_admin) return '/app/admin';
  if (memberships?.length > 0) return '/app/dashboard';
  return '/customer';
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
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
      navigate(getLandingRoute(data.user, data.memberships));
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
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">Sign in to BizFlow Africa</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sign in with your Platform Admin, Business Admin, Employee, or Customer credentials.
            </p>
          </div>

          {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Email Address</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Password</label>
                <Link to="/forgot-password" className="text-xs text-sky-700 dark:text-sky-400 hover:underline">Forgot password?</Link>
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
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-center text-xs text-slate-600 dark:text-slate-400">
            <p>
              New customer?{' '}
              <Link to="/register" className="font-semibold text-sky-700 dark:text-sky-400 hover:underline">
                Create a Customer Account
              </Link>
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Business workspaces are provisioned exclusively by BizFlow Africa Platform Super Admin.{' '}
              <Link to="/contact" className="text-sky-700 dark:text-sky-400 hover:underline">Request onboarding</Link>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export function RegisterPage() {
  const { completeSession } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('form');
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '+250',
    password: '',
    confirm_password: '',
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [pendingSession, setPendingSession] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const avatarErr = validateAvatarFile(avatarFile);
    if (avatarErr) {
      setError(avatarErr);
      return;
    }
    const pwErr = validatePasswordStrength(form.password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('full_name', form.full_name);
      fd.append('email', form.email);
      fd.append('phone', form.phone);
      fd.append('password', form.password);
      fd.append('confirm_password', form.confirm_password);
      fd.append('avatar', avatarFile);

      const { data } = await api.post('/auth/register', fd);
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
      await completeSession(pendingSession.token, { ...pendingSession.user, is_email_verified: 1 }, []);
      navigate('/customer');
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
              <div className="space-y-1">
                <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">Create Customer Account</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Register to browse listed businesses, place orders, track deliveries, and view your receipts.
                </p>
              </div>
              {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <UserAvatar src={avatarPreview} name={form.full_name || 'Customer'} size="lg" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Profile Image <span className="text-rose-600 dark:text-rose-400">*</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Required · JPG, JPEG, PNG, or WEBP (max 5MB)</div>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{avatarFile ? 'Change Image' : 'Upload Photo'}</span>
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
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Full Name</label>
                  <input
                    required
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    placeholder="e.g. Aline Mukamana"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Email Address</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Phone Number (e.g. +250)</label>
                  <input
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Password</label>
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
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Confirm Password</label>
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
                  {submitting ? 'Creating Account...' : 'Register & Verify Email'}
                </button>
              </form>
              <p className="text-xs text-slate-600 dark:text-slate-400 text-center">
                Already registered? <Link to="/login" className="font-semibold text-sky-700 dark:text-sky-400 hover:underline">Sign In</Link>
              </p>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">Verify Your Email</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Enter the 6-digit OTP code sent to {form.email}.</p>
              </div>
              {devOtp && (
                <div className="p-3 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-lg text-xs text-sky-900 dark:text-sky-200">
                  Verification code preview (SMTP offline): <span className="font-mono font-bold">{devOtp}</span>
                </div>
              )}
              {notice && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{notice}</div>}
              {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
              <form onSubmit={handleVerify} className="space-y-4">
                <input
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit OTP code"
                  className="w-full px-3 py-2.5 text-center text-lg font-mono tracking-widest bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <button type="submit" disabled={submitting} className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                  {submitting ? 'Verifying...' : 'Verify & Open Customer Portal'}
                </button>
              </form>
              <button
                type="button"
                onClick={handleResend}
                className="w-full text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
              >
                Resend verification code
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export function ActivateAccountPage() {
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
    const avatarErr = validateAvatarFile(avatarFile);
    if (avatarErr) {
      setError(avatarErr);
      return;
    }
    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('token', token.trim());
      fd.append('password', password);
      fd.append('confirm_password', confirmPassword);
      fd.append('avatar', avatarFile);

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
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">Activate Business Account</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Upload your profile image, verify your invitation, and set a secure password to open your workspace.
            </p>
          </div>

          {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

          {loading ? (
            <div className="text-xs text-slate-500 dark:text-slate-400 py-4">Validating activation invitation...</div>
          ) : !preview ? (
            <form onSubmit={handleLoadToken} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Activation / Invitation Token</label>
                <input
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your secure invitation token"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>
              <button type="submit" className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">
                Verify Invitation
              </button>
            </form>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1 text-xs">
                <div className="font-semibold text-slate-900 dark:text-white">{preview.business_name}</div>
                <div className="text-slate-600 dark:text-slate-300">Assigned Role: <span className="font-semibold text-slate-900 dark:text-white">{preview.role_name}</span></div>
                <div className="text-slate-600 dark:text-slate-300">Account: {preview.full_name} ({preview.email})</div>
                {preview.business_code && (
                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">Business ID: {preview.business_code}</div>
                )}
              </div>

              <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg">
                <UserAvatar src={avatarPreview} name={preview.full_name} size="lg" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Profile Image <span className="text-rose-600 dark:text-rose-400">*</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Required · JPG, JPEG, PNG, or WEBP (max 5MB)</div>
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{avatarFile ? 'Change Image' : 'Upload Profile Image'}</span>
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Set Password (min 8 characters)</label>
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Confirm Password</label>
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
                {submitting ? 'Activating Account...' : 'Upload Photo, Set Password & Activate'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

export function CompleteProfilePage() {
  const { user, memberships, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const handleUploaded = (data) => {
    const updatedUser = data?.user || { ...user, avatar_url: data?.avatar_url };
    if (updatedUser?.is_platform_admin) {
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
              <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">Complete Your Account Profile</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Every BizFlow Africa account requires a profile image before accessing the platform.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-xs space-y-0.5">
            <div className="font-semibold text-slate-900 dark:text-white">{user?.full_name}</div>
            <div className="text-slate-600 dark:text-slate-300">{user?.email}</div>
          </div>

          <ProfilePhotoUploader
            title="Upload Mandatory Profile Image"
            description="Select a JPG, JPEG, PNG, or WEBP image (max 5MB) to activate full access to your dashboard."
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
  const { user, refreshMe, logout } = useAuth();
  const navigate = useNavigate();
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
      setError('New password and confirmation do not match');
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
      if (!updatedUser?.avatar_url) {
        navigate('/complete-profile', { replace: true });
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
                <span>Action Required Before Dashboard Access</span>
              </div>
              <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">Change Your Temporary Password</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Your Business Admin account was provisioned with a temporary initial password. Set a strong permanent password now before opening your workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-xs space-y-0.5">
            <div className="font-semibold text-slate-900 dark:text-white">{user?.full_name}</div>
            <div className="text-slate-600 dark:text-slate-300">{user?.email}</div>
          </div>

          {error && <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Current Temporary Password</label>
              <input
                required
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your temporary password"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">New Permanent Password</label>
              <input
                required
                minLength={8}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars, upper, lower, number, symbol"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Confirm New Password</label>
              <input
                required
                minLength={8}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new permanent password"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Password policy: at least 8 characters, including uppercase, lowercase, number, and special character.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
            >
              {submitting ? 'Updating Password...' : 'Save Permanent Password & Continue'}
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
          <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">Password Recovery</h1>
          {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
          {message && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{message}</div>}
          {devToken && (
            <div className="p-3 text-xs bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 rounded-lg font-mono break-all">
              Recovery token preview (SMTP offline): {devToken}
            </div>
          )}

          {step === 'request' && (
            <form onSubmit={handleRequest} className="space-y-4">
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Account email" className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
              <button type="submit" className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">Send Recovery Token</button>
            </form>
          )}
          {step === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <input required value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Paste recovery token" className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg font-mono" />
              <input required minLength={8} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min 8 chars)" className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg" />
              <button type="submit" className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">Reset Password</button>
            </form>
          )}
          {step === 'done' && (
            <Link to="/login" className="block text-center py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg">Return to Sign In</Link>
          )}
        </div>
      </main>
    </div>
  );
}
