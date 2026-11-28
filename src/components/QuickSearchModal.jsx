import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Banknote,
  Bell,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  ClipboardList,
  Compass,
  CreditCard,
  FileSpreadsheet,
  GitBranch,
  LayoutDashboard,
  Package,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Video,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { formatMoney } from '../utils/format.js';
import { prefetchRoute } from '../utils/routePrefetch.js';
import {
  buildPlatformCatalog,
  detectBizTradeQueryIntent,
  rankLiveResults,
  rankSearchCatalog,
  splitHighlightSegments,
} from '../utils/globalSearchEngine.js';

const ICON_MAP = {
  compass: Compass,
  store: Store,
  briefcase: Briefcase,
  boxes: Boxes,
  'credit-card': CreditCard,
  'shopping-bag': ShoppingBag,
  building: Building2,
  bell: Bell,
  dashboard: LayoutDashboard,
  'shopping-cart': ShoppingCart,
  package: Package,
  receipt: Receipt,
  users: Users,
  truck: Truck,
  wallet: Wallet,
  banknote: Banknote,
  'git-branch': GitBranch,
  video: Video,
  clipboard: ClipboardList,
  'file-spreadsheet': FileSpreadsheet,
  bot: Bot,
  settings: Settings,
  'shield-check': ShieldCheck,
};

function HighlightedText({ text, query }) {
  const segments = useMemo(() => splitHighlightSegments(text, query), [text, query]);
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark
            key={`${i}-${seg.text}`}
            className="bg-sky-100 dark:bg-sky-900/70 text-[#0B192C] dark:text-sky-200 rounded-xs px-0.5 font-semibold"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={`${i}-${seg.text}`}>{seg.text}</span>
        )
      )}
    </>
  );
}

export default function QuickSearchModal({ open, onClose }) {
  const { t } = useTranslation();
  const { user, memberships, hasPermission } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const itemRefs = useRef([]);

  const [queryText, setQueryText] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveResults, setLiveResults] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentRoutes, setRecentRoutes] = useState([]);

  const inWorkspace =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/app') && Boolean(user);

  const accessiblePages = useMemo(
    () => buildPlatformCatalog({ t, user, memberships, hasPermission, inWorkspace }),
    [user, memberships, hasPermission, inWorkspace, t]
  );

  const filteredPages = useMemo(() => {
    const q = queryText.trim();
    if (!q) {
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const recentMatches = recentRoutes
        .filter((r) => r && r !== currentPath)
        .map((path) => accessiblePages.find((p) => p.to === path))
        .filter(Boolean)
        .slice(0, 3)
        .map((p) => ({ ...p, id: `recent:${p.to}`, group: t('search.recentGroup') }));
      const recentPaths = new Set(recentMatches.map((r) => r.to));
      const basePages = accessiblePages.filter((p) => !recentPaths.has(p.to)).slice(0, 8 - recentMatches.length);
      return [...recentMatches, ...basePages];
    }
    return rankSearchCatalog(accessiblePages, q, 6, inWorkspace);
  }, [accessiblePages, queryText, recentRoutes, inWorkspace, t]);

  useEffect(() => {
    if (!open) {
      setQueryText('');
      setLiveResults(null);
      setActiveIndex(0);
      return;
    }
    try {
      const raw = window.localStorage.getItem('bta_recent_routes');
      const parsed = raw ? JSON.parse(raw) : [];
      setRecentRoutes(Array.isArray(parsed) ? parsed : []);
    } catch {
      setRecentRoutes([]);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const q = queryText.trim();
    if (q.length < 2) {
      setLiveResults(null);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        if (inWorkspace) {
          const { data } = await api.get('/app/search', { params: { q, limit: 5 }, signal: controller.signal });
          setLiveResults({ mode: 'app', data });
        } else {
          const { data } = await api.get('/public/search', { params: { q, limit: 5 }, signal: controller.signal });
          setLiveResults({ mode: 'public', data });
        }
      } catch (err) {
        if (!err?.isCanceled) {
          setLiveResults(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, queryText, inWorkspace]);

  const flatItems = useMemo(() => {
    const q = queryText.trim();
    const { isBrand } = detectBizTradeQueryIntent(q);
    const liveMapped = [];

    if (liveResults?.mode === 'public' && liveResults.data) {
      const d = liveResults.data;
      (d.businesses || []).forEach((b) => {
        liveMapped.push({
          id: `biz:${b.id}`,
          label: b.name,
          sub: `${b.category} · ${b.district || ''}`,
          to: `/businesses/${b.slug}`,
          group: t('nav.businesses'),
          iconKey: 'store',
        });
      });
      (d.products || []).forEach((p) => {
        liveMapped.push({
          id: `prod:${p.id}`,
          label: p.name,
          sub: `${p.business_name} · ${formatMoney(p.selling_price, p.currency_code)}`,
          to: `/businesses/${p.business_slug}?q=${encodeURIComponent(p.name)}`,
          group: t('nav.products'),
          iconKey: 'package',
        });
      });
      (d.jobs || []).forEach((j) => {
        liveMapped.push({
          id: `job:${j.id}`,
          label: j.title,
          sub: `${j.business_name} · ${j.location}`,
          to: `/jobs/${j.id}`,
          group: t('nav.jobs'),
          iconKey: 'briefcase',
        });
      });
    } else if (liveResults?.mode === 'app' && liveResults.data?.results) {
      const r = liveResults.data.results;
      const currency = liveResults.data.currency_code || 'RWF';
      (r.products || []).forEach((p) => {
        liveMapped.push({
          id: `ws-prod:${p.id}`,
          label: p.name,
          sub: `${p.sku} · ${formatMoney(p.selling_price, currency)}`,
          to: `/app/products?q=${encodeURIComponent(p.sku || p.name)}`,
          group: t('nav.products'),
          iconKey: 'package',
        });
      });
      (r.customers || []).forEach((c) => {
        liveMapped.push({
          id: `ws-cust:${c.id}`,
          label: c.full_name,
          sub: `${c.phone}${c.email ? ` · ${c.email}` : ''}`,
          to: `/app/customers?q=${encodeURIComponent(c.phone || c.full_name)}`,
          group: t('nav.customers'),
          iconKey: 'users',
        });
      });
      (r.sales || []).forEach((s) => {
        liveMapped.push({
          id: `ws-sale:${s.id}`,
          label: s.reference_number,
          sub: `${s.customer_name || t('common.total')} · ${formatMoney(s.total_amount, currency)}`,
          to: `/app/sales?q=${encodeURIComponent(s.reference_number)}`,
          group: t('nav.sales'),
          iconKey: 'receipt',
        });
      });
      (r.orders || []).forEach((o) => {
        liveMapped.push({
          id: `ws-ord:${o.id}`,
          label: o.order_number,
          sub: `${o.customer_name} · ${formatMoney(o.total_amount, currency)}`,
          to: `/app/orders?q=${encodeURIComponent(o.order_number)}`,
          group: t('nav.orders'),
          iconKey: 'shopping-bag',
        });
      });
      (r.suppliers || []).forEach((s) => {
        liveMapped.push({
          id: `ws-sup:${s.id}`,
          label: s.name,
          sub: s.phone,
          to: `/app/suppliers?q=${encodeURIComponent(s.name)}`,
          group: t('nav.suppliers'),
          iconKey: 'truck',
        });
      });
      (r.tasks || []).forEach((task) => {
        liveMapped.push({
          id: `ws-task:${task.id}`,
          label: task.title,
          sub: `${task.priority} · ${task.status}`,
          to: '/app/tasks',
          group: t('nav.tasks'),
          iconKey: 'clipboard',
        });
      });
    }

    const rankedLive = rankLiveResults(liveMapped, q);
    if (isBrand || !q || filteredPages.length > 0) {
      return [...filteredPages, ...rankedLive].slice(0, 14);
    }
    return rankedLive.slice(0, 14);
  }, [filteredPages, liveResults, queryText, t]);

  useEffect(() => {
    setActiveIndex(0);
  }, [flatItems.length, queryText]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const selectItem = (item) => {
    if (!item) return;
    prefetchRoute(item.to);
    onClose();
    navigate(item.to);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (flatItems.length ? (prev + 1) % flatItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (flatItems.length ? (prev - 1 + flatItems.length) % flatItems.length : 0));
    } else if (e.key === 'Enter' && flatItems[activeIndex]) {
      e.preventDefault();
      selectItem(flatItems[activeIndex]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-14 sm:pt-20 px-4 bg-slate-900/50 dark:bg-black/75 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('search.modalTitle')}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder={inWorkspace ? t('search.workspacePlaceholder') : t('search.publicPlaceholder')}
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          {loading && (
            <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{t('common.loadingData')}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {flatItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <p>{t('search.noMatches')}</p>
              {!inWorkspace && queryText.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/businesses?q=${encodeURIComponent(queryText.trim())}`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg"
                >
                  <span>{t('search.searchDirectoryFor', { query: queryText.trim() })}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            flatItems.map((item, idx) => {
              const Icon = ICON_MAP[item.iconKey] || Compass;
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  type="button"
                  onMouseEnter={() => {
                    setActiveIndex(idx);
                    prefetchRoute(item.to);
                  }}
                  onClick={() => selectItem(item)}
                  className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                    isSelected
                      ? 'bg-sky-50 dark:bg-sky-950/50 text-[#0B192C] dark:text-white'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-sky-700 dark:text-sky-400 shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">
                        <HighlightedText text={item.label} query={queryText} />
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        <HighlightedText text={item.sub} query={queryText} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">{item.group}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3 flex-wrap">
            <span>↑↓ {t('search.navigateHint')}</span>
            <span>·</span>
            <span>↵ {t('search.openHint')}</span>
            <span>·</span>
            <span>Esc {t('common.close')}</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline font-mono">{t('search.shortcutHint')}</span>
          </div>
          {!inWorkspace && queryText.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/businesses?q=${encodeURIComponent(queryText.trim())}`);
              }}
              className="font-semibold text-sky-700 dark:text-sky-400 hover:underline"
            >
              {t('search.viewAllResults')} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
