import { MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buildWhatsAppDeepLink } from '../utils/phone.js';

export function WhatsAppContactButton({
  phone,
  available = false,
  prefillText = '',
  label,
  className = '',
  showUnavailableLabel = false,
}) {
  const { t } = useTranslation();
  const deepLink = available ? buildWhatsAppDeepLink(phone, prefillText) : '';

  if (!deepLink) {
    if (!showUnavailableLabel) return null;
    return (
      <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
        {t('whatsapp.notAvailable', { defaultValue: 'Not on WhatsApp' })}
      </span>
    );
  }

  return (
    <a
      href={deepLink}
      target="_blank"
      rel="noopener noreferrer"
      title={t('whatsapp.openChatTitle', { defaultValue: 'Open WhatsApp conversation using registered phone number' })}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap shrink-0 ${className}`}
    >
      <MessageCircle className="w-3.5 h-3.5 shrink-0" />
      <span>{label || t('whatsapp.contactButton', { defaultValue: 'WhatsApp' })}</span>
    </a>
  );
}

export default WhatsAppContactButton;
