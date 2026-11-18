import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';

const LANGUAGE_OPTIONS = [
  { code: 'en', shortLabel: 'EN', fullKey: 'language.en' },
  { code: 'rw', shortLabel: 'RW', fullKey: 'language.rw' },
  { code: 'fr', shortLabel: 'FR', fullKey: 'language.fr' },
];

export default function LanguageSelector({ compact = false, showFullNames = false, className = '' }) {
  const { t } = useTranslation();
  const { language, changeLanguage } = useAuth();

  if (showFullNames) {
    return (
      <div
        role="group"
        aria-label={t('language.selectAria')}
        className={`inline-flex flex-wrap items-center gap-1 p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 ${className}`}
      >
        {LANGUAGE_OPTIONS.map((opt) => {
          const active = language === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => changeLanguage(opt.code)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-150 whitespace-nowrap ${
                active
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
              <span>{t(opt.fullKey)}</span>
              <span className="text-[10px] opacity-70 font-mono">({opt.shortLabel})</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 px-2 ${
        compact ? 'py-1' : 'py-1.5'
      } ${className}`}
    >
      <Globe className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />
      <select
        aria-label={t('language.selectAria')}
        value={language}
        onChange={(e) => changeLanguage(e.target.value)}
        className="text-xs font-semibold bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer pr-1"
      >
        {LANGUAGE_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
            {compact ? opt.shortLabel : `${opt.shortLabel} · ${t(opt.fullKey)}`}
          </option>
        ))}
      </select>
    </div>
  );
}
