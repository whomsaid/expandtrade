import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function ThemeSelector({ compact = false, showLabels = false, className = '' }) {
  const { themePreference, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme appearance"
      className={`inline-flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 ${className}`}
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = themePreference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            title={`${opt.label} theme`}
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
            {(showLabels || !compact) && <span className={showLabels ? 'inline' : 'hidden sm:inline'}>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
