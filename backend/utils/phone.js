export function normalizePhoneE164(rawPhone, defaultCountry = 'RW') {
  const original = String(rawPhone || '').trim();
  if (!original) {
    return { valid: false, e164: '', digits: '', error: 'Phone number is required.' };
  }

  let cleaned = original.replace(/[\s().-]+/g, '');
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  // Handle Rwanda local & national formats (+250 78x / 078x / 079x / 072x / 073x / 78x)
  if (!cleaned.startsWith('+')) {
    if (defaultCountry === 'RW') {
      if (/^07[2389]\d{7}$/.test(cleaned)) {
        cleaned = `+250${cleaned.slice(1)}`;
      } else if (/^7[2389]\d{7}$/.test(cleaned)) {
        cleaned = `+250${cleaned}`;
      } else if (/^2507[2389]\d{7}$/.test(cleaned)) {
        cleaned = `+${cleaned}`;
      } else if (/^[1-9]\d{7,14}$/.test(cleaned)) {
        cleaned = `+${cleaned}`;
      }
    } else if (/^[1-9]\d{7,14}$/.test(cleaned)) {
      cleaned = `+${cleaned}`;
    }
  } else {
    // Handle common mistake +250078... -> +25078...
    if (/^\+25007[2389]\d{7}$/.test(cleaned)) {
      cleaned = `+250${cleaned.slice(5)}`;
    }
  }

  if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return {
      valid: false,
      e164: '',
      digits: '',
      error: 'Enter a valid phone number with country code (e.g., +250788123456 or 0788123456).',
    };
  }

  // Extra check for Rwanda mobile numbers
  if (cleaned.startsWith('+250') && !/^\+2507[2389]\d{7}$/.test(cleaned)) {
    return {
      valid: false,
      e164: '',
      digits: '',
      error: 'Enter a valid Rwanda mobile number (e.g., +250788123456 or 0788123456).',
    };
  }

  return {
    valid: true,
    e164: cleaned,
    digits: cleaned.slice(1),
  };
}

export function toWhatsAppDigits(rawPhone, defaultCountry = 'RW') {
  const norm = normalizePhoneE164(rawPhone, defaultCountry);
  return norm.valid ? norm.digits : null;
}

export function buildWhatsAppDeepLink(rawPhone, text = '') {
  const digits = toWhatsAppDigits(rawPhone);
  if (!digits) return '';
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

export function maskEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  const [local, domain] = clean.split('@');
  if (!local || !domain) return '***';
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export function maskPhone(rawPhone) {
  const norm = normalizePhoneE164(rawPhone);
  const target = norm.valid ? norm.e164 : String(rawPhone || '').trim();
  if (target.length <= 6) return '***';
  const prefix = target.slice(0, target.startsWith('+250') ? 6 : 4);
  const suffix = target.slice(-3);
  return `${prefix}***${suffix}`;
}
