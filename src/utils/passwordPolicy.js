export function validatePasswordStrength(password) {
  const val = String(password || '');
  if (val.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (val.toLowerCase() === 'admin@123') {
    return 'The temporary password (admin@123) cannot be used as a permanent password';
  }
  if (!/[A-Z]/.test(val)) {
    return 'Password must include at least one uppercase letter';
  }
  if (!/[a-z]/.test(val)) {
    return 'Password must include at least one lowercase letter';
  }
  if (!/[0-9]/.test(val)) {
    return 'Password must include at least one number';
  }
  if (!/[^A-Za-z0-9]/.test(val)) {
    return 'Password must include at least one special character (e.g. @, #, $, !)';
  }
  return null;
}
