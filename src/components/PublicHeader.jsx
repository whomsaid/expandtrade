import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import BrandLogo from './BrandLogo.jsx';
import ThemeSelector from './ThemeSelector.jsx';

const HOMEPAGE_SECTION_IDS = ['about', 'features', 'how-it-works', 'benefits', 'developer', 'contact'];

function resolveNavSection(sectionId) {
  if (sectionId === 'how-it-works' || sectionId === 'benefits') return 'features';
  return sectionId;
}

export default function PublicHeader() {
  const { user, memberships } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('home');

  const isHome = location.pathname === '/';

  // Close mobile menu on route/hash navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  // Sync homepage active section from hash and scroll position
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
    if (location.pathname === '/features') return 'features';
    if (location.pathname === '/pricing') return 'pricing';
    if (location.pathname === '/about') return 'about';
    if (location.pathname === '/contact') return 'contact';
    if (location.pathname === '/track-order') return 'track-order';
    if (isHome) return activeSection;
    return '';
  }, [location.pathname, isHome, activeSection]);

  const navItems = [
    { key: 'home', label: 'Home', to: '/', sectionId: 'top' },
    { key: 'about', label: 'About', to: '/#about', sectionId: 'about' },
    { key: 'features', label: 'Features', to: '/#features', sectionId: 'features' },
    { key: 'businesses', label: 'Businesses', to: '/businesses' },
    { key: 'pricing', label: 'Pricing', to: '/pricing' },
    { key: 'developer', label: 'Developer', to: '/#developer', sectionId: 'developer' },
    { key: 'contact', label: 'Contact', to: '/#contact', sectionId: 'contact' },
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
    ? 'Platform Admin'
    : memberships?.length > 0
      ? 'Open Workspace'
      : 'Customer Portal';

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
        <Link
          to="/"
          onClick={(e) => handleNavClick(e, navItems[0])}
          className="text-xl font-bold tracking-tight text-[#0B192C] dark:text-white whitespace-nowrap shrink-0"
        >
          <BrandLogo
            textClassName="text-xl font-bold tracking-tight text-[#0B192C] dark:text-white"
            imgClassName="h-8 w-auto max-w-[140px] object-contain shrink-0"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-6 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = activeKey === item.key;
            return (
              <Link
                key={item.key}
                to={item.to}
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

        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <ThemeSelector compact />
          {user ? (
            <Link
              to={portalLink}
              className="inline-flex items-center px-3.5 sm:px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
            >
              {portalLabel}
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center px-3.5 sm:px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Responsive Mobile & Tablet Navigation Drawer */}
      {menuOpen && (
        <div className="lg:hidden animate-slide-down border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-1">
          <nav aria-label="Mobile navigation" className="flex flex-col space-y-1">
            {navItems.map((item) => {
              const isActive = activeKey === item.key;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  onClick={(e) => handleNavClick(e, item)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                    isActive
                      ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold border-l-2 border-sky-600 dark:border-sky-400'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              to="/track-order"
              onClick={() => setMenuOpen(false)}
              aria-current={activeKey === 'track-order' ? 'page' : undefined}
              className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                activeKey === 'track-order'
                  ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold border-l-2 border-sky-600 dark:border-sky-400'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70'
              }`}
            >
              Track Order
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
