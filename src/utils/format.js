export function formatMoney(value, currency = 'RWF') {
  const num = Number(value || 0);
  if (currency === 'RWF') {
    return `${Math.round(num).toLocaleString('en-US')} RWF`;
  }
  return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  mtn_momo: 'MTN Mobile Money',
  airtel_money: 'Airtel Money',
  bank_transfer: 'Bank Transfer',
  card: 'Card / POS',
  other: 'Other',
};

export const BUSINESS_CATEGORIES = [
  'Electronics & Retail',
  'Supermarket & Grocery',
  'Pharmacy & Healthcare',
  'Wholesale & Distribution',
  'Construction & Hardware',
  'Fashion & Apparel',
  'Hospitality & Services',
];

export const RWANDA_PROVINCES = [
  'Kigali City',
  'Southern Province',
  'Northern Province',
  'Eastern Province',
  'Western Province',
];

export const AFRICAN_COUNTRIES = [
  { country: 'Rwanda', currency: 'RWF', timezone: 'Africa/Kigali', prefix: '+250' },
  { country: 'Kenya', currency: 'KES', timezone: 'Africa/Nairobi', prefix: '+254' },
  { country: 'Uganda', currency: 'UGX', timezone: 'Africa/Kampala', prefix: '+256' },
  { country: 'Tanzania', currency: 'TZS', timezone: 'Africa/Dar_es_Salaam', prefix: '+255' },
  { country: 'Nigeria', currency: 'NGN', timezone: 'Africa/Lagos', prefix: '+234' },
  { country: 'Ghana', currency: 'GHS', timezone: 'Africa/Accra', prefix: '+233' },
  { country: 'South Africa', currency: 'ZAR', timezone: 'Africa/Johannesburg', prefix: '+27' },
];
