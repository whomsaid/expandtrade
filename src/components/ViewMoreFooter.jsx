import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ViewMoreFooter({
  totalCount = 0,
  visibleCount = 0,
  initialLimit = 5,
  expanded = false,
  onToggle,
  className = '',
}) {
  const { t } = useTranslation();

  if (totalCount <= initialLimit) return null;

  const remaining = Math.max(0, totalCount - visibleCount);

  return (
    <div
      className={`px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2 text-xs ${className}`}
    >
      <span className="text-slate-500 dark:text-slate-400 tabular-nums">
        {t('common.showingOf', { shown: visibleCount, total: totalCount })}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-[#0B192C] dark:text-sky-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
      >
        <span>
          {expanded
            ? t('common.showLess')
            : t('common.viewMoreCount', { count: remaining })}
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        )}
      </button>
    </div>
  );
}
