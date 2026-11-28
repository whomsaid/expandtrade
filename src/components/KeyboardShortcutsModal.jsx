import { useEffect } from 'react';
import { Keyboard, Plus, Search, Home, Command, X, CornerDownLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function KeyboardShortcutsModal({
  open,
  onClose,
  onTriggerNewItem,
  onTriggerSearch,
  onTriggerHome,
  inWorkspace = false,
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const actions = [
    {
      id: 'new',
      keys: ['N'],
      icon: Plus,
      title: t('shortcuts.newItemTitle', { defaultValue: 'Create new item' }),
      description: inWorkspace
        ? t('shortcuts.newItemWorkspaceDesc', { defaultValue: 'Open the create modal on the active page or add a new product.' })
        : t('shortcuts.newItemPublicDesc', { defaultValue: 'Jump straight to creating a workspace record or exploring businesses.' }),
      onRun: () => {
        onClose?.();
        onTriggerNewItem?.();
      },
    },
    {
      id: 'search',
      keys: ['S'],
      altKeys: ['Ctrl', 'K'],
      icon: Search,
      title: t('shortcuts.searchTitle', { defaultValue: 'Global search' }),
      description: t('shortcuts.searchDesc', { defaultValue: 'Focus the BizTrade search bar to jump to pages, products, or orders.' }),
      onRun: () => {
        onClose?.();
        onTriggerSearch?.();
      },
    },
    {
      id: 'home',
      keys: ['H'],
      icon: Home,
      title: inWorkspace
        ? t('shortcuts.dashboardTitle', { defaultValue: 'Go to Dashboard' })
        : t('shortcuts.homeTitle', { defaultValue: 'Go to Home' }),
      description: inWorkspace
        ? t('shortcuts.dashboardDesc', { defaultValue: 'Return immediately to your main business dashboard overview.' })
        : t('shortcuts.homeDesc', { defaultValue: 'Return to the BizTrade Africa landing page.' }),
      onRun: () => {
        onClose?.();
        onTriggerHome?.();
      },
    },
    {
      id: 'help',
      keys: ['/'],
      icon: Keyboard,
      title: t('shortcuts.helpTitle', { defaultValue: 'Keyboard shortcuts' }),
      description: t('shortcuts.helpDesc', { defaultValue: 'Open or toggle this keyboard shortcuts helper modal.' }),
      onRun: null,
    },
    {
      id: 'esc',
      keys: ['Esc'],
      icon: CornerDownLeft,
      title: t('shortcuts.closeTitle', { defaultValue: 'Close active dialog' }),
      description: t('shortcuts.closeDesc', { defaultValue: 'Dismiss modals, search dropdowns, and overlays.' }),
      onRun: () => onClose?.(),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
    >
      <div
        className="animate-scale-in w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#0B192C] dark:bg-sky-600 text-white flex items-center justify-center shrink-0">
              <Command className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="keyboard-shortcuts-title" className="text-sm font-bold text-[#0B192C] dark:text-white truncate">
                {t('shortcuts.modalTitle', { defaultValue: 'Keyboard Shortcuts' })}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {t('shortcuts.modalSubtitle', { defaultValue: 'Press a shortcut key anywhere outside text inputs or click an action below.' })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[65vh] overflow-y-auto">
          {actions.map((item) => {
            const Icon = item.icon;
            const Wrapper = item.onRun ? 'button' : 'div';
            return (
              <Wrapper
                key={item.id}
                {...(item.onRun
                  ? {
                      type: 'button',
                      onClick: item.onRun,
                    }
                  : {})}
                className={`w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left ${
                  item.onRun
                    ? 'hover:bg-sky-50/70 dark:hover:bg-sky-950/30 transition-colors cursor-pointer'
                    : 'bg-slate-50/40 dark:bg-slate-950/30'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[#0B192C] dark:text-sky-400 shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">{item.title}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{item.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.keys.map((k) => (
                    <kbd
                      key={k}
                      className="min-w-[1.75rem] px-2 py-1 text-center text-[11px] font-mono font-bold text-[#0B192C] dark:text-sky-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-2xs"
                    >
                      {k}
                    </kbd>
                  ))}
                  {item.altKeys && (
                    <>
                      <span className="text-[10px] text-slate-400">/</span>
                      <div className="hidden sm:flex items-center gap-0.5">
                        {item.altKeys.map((ak) => (
                          <kbd
                            key={ak}
                            className="px-1.5 py-1 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
                          >
                            {ak}
                          </kbd>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Wrapper>
            );
          })}
        </div>

        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span>
            {t('shortcuts.footerTip', { defaultValue: 'Tip: Press / anytime to open this guide.' })}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
