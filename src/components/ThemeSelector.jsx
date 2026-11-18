import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext.jsx';

const OPTIONS = [
  { value: 'light', labelKey: 'theme.light', icon: Sun },
  { value: 'dark', labelKey: 'theme.dark', icon: Moon },
  { value: 'system', labelKey: 'theme.system', icon: Monitor },
];

export default function ThemeSelector({ compact = false, showLabels = false, className = '' }) {
  const { t } = useTranslation();
  const { themePreference, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label={t('theme.ariaLabel')}
      className={`inline-flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 ${className}`}
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = themePreference === opt.value;
        const label = t(opt.labelKey);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            title={`${label} ${t('theme.titleSuffix')}`}
            aria-pressed={active}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 whitespace-nowrap ${
              compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
            } ${
              active
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {(showLabels || !compact) && <span className={showLabels ? 'inline' : 'hidden sm:inline'}>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
