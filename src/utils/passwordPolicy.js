import i18n from '../i18n.js';

export function validatePasswordStrength(password) {
  const val = String(password || '');
  if (val.length < 8) {
    return i18n.t('validation.passwordMin');
  }
  if (val.toLowerCase() === 'admin@123') {
    return i18n.t('validation.passwordTempForbidden');
  }
  if (!/[A-Z]/.test(val)) {
    return i18n.t('validation.passwordUpper');
  }
  if (!/[a-z]/.test(val)) {
    return i18n.t('validation.passwordLower');
  }
  if (!/[0-9]/.test(val)) {
    return i18n.t('validation.passwordNumber');
  }
  if (!/[^A-Za-z0-9]/.test(val)) {
    return i18n.t('validation.passwordSymbol');
  }
  return null;
}
