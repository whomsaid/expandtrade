import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import BrandLogo from './BrandLogo.jsx';
import LanguageSelector from './LanguageSelector.jsx';
import ThemeSelector from './ThemeSelector.jsx';
import { prefetchRoute } from '../utils/routePrefetch.js';

const HOMEPAGE_SECTION_IDS = ['about', 'features', 'how-it-works', 'benefits', 'contact'];

function resolveNavSection(sectionId) {
  if (sectionId === 'how-it-works' || sectionId === 'benefits') return 'features';
  return sectionId;
}

export default function PublicHeader() {
  const { t } = useTranslation();
  const { user, memberships } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('home');

  const isHome = location.pathname === '/';

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!isHome) return undefined;

    const hashId = location.hash ? location.hash.replace('#', '') : '';
    if (hashId && HOMEPAGE_SECTION_IDS.includes(hashId)) {
      setActiveSection(resolveNavSection(hashId));
    } else if (window.scrollY < 160) {
      setActiveSection('home');
    }

    const handleScroll = () => {
      if (window.scrollY < 160) {
        setActiveSection('home');
      }
    };

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              if (window.scrollY < 160) {
                setActiveSection('home');
                return;
              }
              const visible = entries
                .filter((e) => e.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
              if (visible.length > 0) {
                setActiveSection(resolveNavSection(visible[0].target.id));
              }
            },
            {
              rootMargin: '-22% 0px -55% 0px',
              threshold: [0.05, 0.2, 0.45],
            }
          )
        : null;

    if (observer) {
      HOMEPAGE_SECTION_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      });
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (observer) observer.disconnect();
    };
  }, [isHome, location.hash]);

  const activeKey = useMemo(() => {
    if (location.pathname.startsWith('/businesses')) return 'businesses';
    if (location.pathname.startsWith('/jobs')) return 'jobs';
    if (location.pathname === '/features') return 'features';
    if (location.pathname === '/pricing') return 'pricing';
    if (location.pathname === '/about') return 'about';
    if (location.pathname === '/contact') return 'contact';
    if (location.pathname === '/track-order') return 'track-order';
    if (isHome) return activeSection;
    return '';
  }, [location.pathname, isHome, activeSection]);

  const navItems = [
    { key: 'home', label: t('nav.home'), to: '/', sectionId: 'top' },
    { key: 'about', label: t('nav.about'), to: '/about' },
    { key: 'features', label: t('nav.features'), to: '/#features', sectionId: 'features' },
    { key: 'businesses', label: t('nav.businesses'), to: '/businesses' },
    { key: 'jobs', label: t('nav.jobs'), to: '/jobs' },
    { key: 'pricing', label: t('nav.pricing'), to: '/pricing' },
    { key: 'contact', label: t('nav.contact'), to: '/#contact', sectionId: 'contact' },
  ];

  const handleNavClick = (e, item) => {
    setMenuOpen(false);
    if (!item.sectionId) return;

    if (item.sectionId === 'top') {
      if (isHome) {
        e.preventDefault();
        window.history.replaceState(null, '', '/');
        setActiveSection('home');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    if (isHome) {
      e.preventDefault();
      const target = document.getElementById(item.sectionId);
      setActiveSection(resolveNavSection(item.sectionId));
      window.history.replaceState(null, '', `/#${item.sectionId}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      e.preventDefault();
      navigate(item.to);
    }
  };

  const portalLink = user?.is_platform_admin
    ? '/app/admin'
    : memberships?.length > 0
      ? '/app/dashboard'
      : '/customer';

  const portalLabel = user?.is_platform_admin
    ? t('nav.platformAdmin')
    : memberships?.length > 0
      ? t('nav.openWorkspace')
      : t('nav.customerPortal');

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:bg-[#0B192C] focus:text-white focus:rounded-lg"
      >
        {t('nav.skipToContent')}
      </a>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-3">
        <Link
          to="/"
          onClick={(e) => handleNavClick(e, navItems[0])}
          className="text-base sm:text-xl font-bold tracking-tight text-[#0B192C] dark:text-white whitespace-nowrap min-w-0 shrink"
        >
          <BrandLogo
            textClassName="text-base sm:text-xl font-bold tracking-tight text-[#0B192C] dark:text-white truncate max-w-[140px] sm:max-w-none"
            imgClassName="h-7 sm:h-8 w-auto max-w-[110px] sm:max-w-[140px] object-contain shrink-0"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav aria-label={t('nav.primaryNav')} className="hidden lg:flex items-center gap-5 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = activeKey === item.key;
            return (
              <Link
                key={item.key}
                to={item.to}
                onMouseEnter={() => prefetchRoute(item.to)}
                onFocus={() => prefetchRoute(item.to)}
                onClick={(e) => handleNavClick(e, item)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-1 transition-colors duration-150 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-[#0B192C] dark:text-sky-400 font-semibold after:content-[""] after:absolute after:left-0 after:right-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-sky-600 dark:after:bg-sky-400'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#0B192C] dark:hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('biztrade:open-search'))}
            aria-label={t('search.modalTitle')}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t('common.search')}</span>
          </button>
          <div className="hidden sm:flex items-center gap-2">
            <LanguageSelector compact />
            <ThemeSelector compact />
          </div>
          {user ? (
            <Link
              to={portalLink}
              onMouseEnter={() => prefetchRoute(portalLink)}
              onFocus={() => prefetchRoute(portalLink)}
              className="inline-flex items-center px-2.5 sm:px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0 max-w-[125px] sm:max-w-none truncate"
            >
              {portalLabel}
            </Link>
          ) : (
            <Link
              to="/login"
              onMouseEnter={() => prefetchRoute('/login')}
              onFocus={() => prefetchRoute('/login')}
              className="inline-flex items-center px-3 sm:px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
            >
              {t('nav.signIn')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={menuOpen ? t('nav.closeNav') : t('nav.openNav')}
            aria-expanded={menuOpen}
            className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Responsive Mobile & Tablet Navigation Drawer */}
      {menuOpen && (
        <div className="lg:hidden animate-slide-down border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-2">
          <nav aria-label={t('nav.mobileNav')} className="flex flex-col space-y-1">
            {navItems.map((item) => {
              const isActive = activeKey === item.key;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  onMouseEnter={() => prefetchRoute(item.to)}
                  onTouchStart={() => prefetchRoute(item.to)}
                  onClick={(e) => handleNavClick(e, item)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                    isActive
                      ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              to="/track-order"
              onMouseEnter={() => prefetchRoute('/track-order')}
              onTouchStart={() => prefetchRoute('/track-order')}
              onClick={() => setMenuOpen(false)}
              aria-current={activeKey === 'track-order' ? 'page' : undefined}
              className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                activeKey === 'track-order'
                  ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70'
              }`}
            >
              {t('nav.trackOrder')}
            </Link>
            {user && (memberships?.length > 0 || user?.is_platform_admin) && (
              <Link
                to="/customer"
                onMouseEnter={() => prefetchRoute('/customer')}
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2 text-sm rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
              >
                {t('nav.customerPortal')}
              </Link>
            )}
          </nav>
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('language.label')}</span>
              <LanguageSelector compact />
            </div>
            <ThemeSelector compact />
          </div>
        </div>
      )}
    </header>
  );
}
