import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import rw from './locales/rw.json';
import fr from './locales/fr.json';

export const SUPPORTED_LANGUAGES = ['en', 'rw', 'fr'];

export function normalizeLanguage(lang) {
  const code = String(lang || '').trim().toLowerCase();
  if (code === 'rw' || code.startsWith('rw-') || code === 'kin') return 'rw';
  if (code === 'fr' || code.startsWith('fr-')) return 'fr';
  return 'en';
}

function getInitialLanguage() {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('biztrade_lang') || localStorage.getItem('bizflow_lang');
  return normalizeLanguage(saved || 'en');
}

const initialLanguage = getInitialLanguage();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    rw: { translation: rw },
    fr: { translation: fr },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: {
    escapeValue: false,
  },
  returnObjects: true,
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLanguage;
}

i18n.on('languageChanged', (lng) => {
  const normalized = normalizeLanguage(lng);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = normalized;
  }
});

export default i18n;
