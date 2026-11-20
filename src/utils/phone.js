export function normalizePhoneClient(raw, defaultCountryCode = '+250') {
  const input = String(raw || '').trim();
  if (!input) {
    return { valid: false, e164: '', error: 'Phone number is required.' };
  }

  let cleaned = input.replace(/[\s().-]+/g, '');
  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (!/^[1-9]\d{6,14}$/.test(digits)) {
      return { valid: false, e164: '', error: 'Enter a valid international phone number (e.g. +250788123456).' };
    }
    return { valid: true, e164: `+${digits}`, error: null };
  }

  if (/^07[2389]\d{7}$/.test(cleaned)) {
    return { valid: true, e164: `${defaultCountryCode}${cleaned.slice(1)}`, error: null };
  }

  if (/^2507[2389]\d{7}$/.test(cleaned)) {
    return { valid: true, e164: `+${cleaned}`, error: null };
  }

  if (/^7[2389]\d{7}$/.test(cleaned) && defaultCountryCode === '+250') {
    return { valid: true, e164: `+250${cleaned}`, error: null };
  }

  if (/^[1-9]\d{7,14}$/.test(cleaned)) {
    return { valid: true, e164: `+${cleaned}`, error: null };
  }

  return {
    valid: false,
    e164: '',
    error: 'Enter a valid phone number in international format (e.g. +250788123456 or 0788123456).',
  };
}

export function buildWhatsAppDeepLink(phone, prefillText = '') {
  const check = normalizePhoneClient(phone);
  if (!check.valid) return '';
  const digits = check.e164.replace(/\D/g, '');
  if (!digits) return '';
  const base = `https://wa.me/${digits}`;
  if (!prefillText || !String(prefillText).trim()) return base;
  return `${base}?text=${encodeURIComponent(String(prefillText).trim())}`;
}
