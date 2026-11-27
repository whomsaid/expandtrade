import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { prefetchRoute } from '../utils/routePrefetch.js';

export function useSmartBack(fallbackTo = '/') {
  const navigate = useNavigate();
  return () => {
    const idx = typeof window !== 'undefined' ? window.history.state?.idx : 0;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
    } else {
      navigate(fallbackTo);
    }
  };
}

export default function PageBreadcrumb({
  items = [],
  fallbackTo = '/',
  backLabel,
  rightLink,
  showBack = true,
  className = '',
}) {
  const { t } = useTranslation();
  const handleBack = useSmartBack(fallbackTo);

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{backLabel || t('search.goBack')}</span>
          </button>
        )}

        <ol className="flex items-center gap-1.5 min-w-0">
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return (
              <li key={`${item.label}-${idx}`} className="flex items-center gap-1.5 min-w-0">
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
                {isLast || !item.to ? (
                  <span
                    aria-current={isLast ? 'page' : undefined}
                    className={`truncate ${isLast ? 'font-semibold text-slate-900 dark:text-white' : ''}`}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.to}
                    onMouseEnter={() => prefetchRoute(item.to)}
                    onFocus={() => prefetchRoute(item.to)}
                    className="hover:text-slate-900 dark:hover:text-white truncate whitespace-nowrap"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {rightLink && (
        <Link
          to={rightLink.to}
          onMouseEnter={() => prefetchRoute(rightLink.to)}
          onFocus={() => prefetchRoute(rightLink.to)}
          className="text-sky-700 dark:text-sky-400 font-semibold hover:underline whitespace-nowrap shrink-0"
        >
          {rightLink.label} →
        </Link>
      )}
    </nav>
  );
}
