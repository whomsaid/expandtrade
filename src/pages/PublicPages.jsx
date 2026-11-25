import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Code2,
  CreditCard,
  Database,
  ExternalLink,
  GitBranch,
  Layers,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Search,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Truck,
  UserCheck,
  Users,
  Video,
  Wallet,
  Wrench,
} from 'lucide-react';
import PublicHeader from '../components/PublicHeader.jsx';
import PublicFooter from '../components/PublicFooter.jsx';
import { RevealBlock } from '../hooks/useRevealOnScroll.js';
import StatusBadge from '../components/StatusBadge.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import VideoAdPlayer from '../components/VideoAdPlayer.jsx';
import WhatsAppContactButton from '../components/WhatsAppContactButton.jsx';
import { setDynamicSeo } from '../components/RouteSeoManager.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';
import { api } from '../services/api.js';
import { formatDate, formatDateTime, formatMoney } from '../utils/format.js';
import { prefetchRoute } from '../utils/routePrefetch.js';
import heroKigaliImg from '../assets/images/hero_kigali_commerce_1794724575172.jpg';
import featurePosImg from '../assets/images/feature_pos_inventory_1794724576072.jpg';
import featureRetailPosImg from '../assets/images/feature_retail_pos_1795098957916.jpg';
import featureFinanceImg from '../assets/images/feature_finance_analytics_1795098958245.jpg';
import featureSupplyImg from '../assets/images/feature_supply_orders_1795098958168.jpg';
import featureTeamImg from '../assets/images/feature_team_branches_1795098958784.jpg';
import featureAiMarketingImg from '../assets/images/feature_ai_marketing_1795098959310.jpg';
import projectBiztradeImg from '../assets/images/project_biztrade_africa_1794832786709.jpg';
import projectKigaliStoreImg from '../assets/images/project_kigali_store_1794832787098.jpg';
import projectElectroVaultImg from '../assets/images/project_electrovault_1794832787681.jpg';
import developerXavineImg from '../assets/images/developer_xavine_portrait_1794832786905.jpg';

const FEATURE_ICONS = [
  Building2,     // Business Management
  ShoppingCart,  // POS
  Boxes,         // Inventory
  Package,       // Products
  Wallet,        // Finance
  Users,         // Employees
  GitBranch,     // Branches
  UserCheck,     // Customers
  Truck,         // Suppliers
  ShoppingBag,   // Orders
  CreditCard,    // Purchases
  BarChart3,     // Reports
  MessageSquare, // Communication
  ClipboardList, // Tasks
  Video,         // Advertising
  Bot,           // AI Assistant
  Bell,          // Notifications
];

const FEATURE_IMAGES = [
  heroKigaliImg,        // Business Management
  featureRetailPosImg,  // POS
  featurePosImg,        // Inventory
  projectKigaliStoreImg,// Products
  featureFinanceImg,    // Finance
  featureTeamImg,       // Employees
  projectBiztradeImg,   // Branches
  heroKigaliImg,        // Customers
  featureSupplyImg,     // Suppliers
  projectElectroVaultImg,// Orders
  featureSupplyImg,     // Purchases
  featureFinanceImg,    // Reports
  featureTeamImg,       // Communication
  featurePosImg,        // Tasks
  featureAiMarketingImg,// Advertising
  featureAiMarketingImg,// AI Assistant
  featureRetailPosImg,  // Notifications
];

function FeatureCardMedia({ src, alt, icon: Icon }) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-center text-sky-700 dark:text-sky-400">
        {Icon ? <Icon className="w-7 h-7" /> : null}
      </div>
    );
  }

  return (
    <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
    </div>
  );
}

const TECH_STACK_STATIC = [
  {
    key: 'frontend',
    icon: Layers,
    items: ['JavaScript (ES2023+)', 'React.js', 'Vite', 'Tailwind CSS', 'HTML5 & CSS3'],
  },
  {
    key: 'backend',
    icon: Code2,
    items: ['Node.js', 'Express.js', 'REST API Architecture', 'JWT & Role-Based Auth'],
  },
  {
    key: 'database',
    icon: Database,
    items: ['MySQL', 'SQLite', 'Relational Schema Design', 'Transaction Integrity'],
  },
  {
    key: 'tools',
    icon: Wrench,
    items: ['Git', 'GitHub', 'VS Code', 'Postman', 'npm & Vite Tooling'],
  },
];

export function HomePage() {
  const { t } = useTranslation();
  const { config } = usePlatformConfig();
  const location = useLocation();
  const [contactForm, setContactForm] = useState({
    full_name: '',
    email: '',
    phone: '+250',
    business_name: '',
    message: '',
  });
  const [contactStatus, setContactStatus] = useState({ type: '', text: '' });
  const [submittingContact, setSubmittingContact] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  const platformFeatures = t('public.features', { returnObjects: true }) || [];
  const displayedFeatures = showAllFeatures ? platformFeatures : platformFeatures.slice(0, 8);
  const workflowSteps = t('public.workflowSteps', { returnObjects: true }) || [];
  const platformBenefits = t('public.benefits', { returnObjects: true }) || [];
  const supportedBusinesses = t('public.sectors', { returnObjects: true }) || [];

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace('#', '');
    const el = document.getElementById(id);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [location.hash]);

  const handleHomeContactSubmit = async (e) => {
    e.preventDefault();
    setSubmittingContact(true);
    setContactStatus({ type: '', text: '' });
    try {
      const { data } = await api.post('/public/contact', contactForm);
      setContactStatus({ type: 'success', text: data.message });
      setContactForm({ full_name: '', email: '', phone: '+250', business_name: '', message: '' });
    } catch (err) {
      setContactStatus({ type: 'error', text: err.message });
    } finally {
      setSubmittingContact(false);
    }
  };

  const socialLinks = [
    { label: 'LinkedIn', url: config.social_linkedin_url },
    { label: 'X / Twitter', url: config.social_x_url },
    { label: 'Instagram', url: config.social_instagram_url },
    { label: 'Facebook', url: config.social_facebook_url },
  ].filter((item) => Boolean(item.url && item.url.trim()));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />

      {/* 1. Hero Section */}
      <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6 animate-fade-up min-w-0">
            <p className="text-xs font-semibold tracking-wide text-sky-700 dark:text-sky-400">
              {t('public.heroEyebrow')}
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#0B192C] dark:text-white leading-[1.1] [text-wrap:balance]">
              {t('public.heroTitle')}
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              {t('public.heroDesc')}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#features"
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
              >
                {t('nav.features')}
                <ArrowRight className="w-4 h-4" />
              </a>
              <Link
                to="/register"
                onMouseEnter={() => prefetchRoute('/register')}
                onFocus={() => prefetchRoute('/register')}
                className="inline-flex items-center px-5 py-3 text-sm font-semibold text-[#0B192C] dark:text-white bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                {t('public.getStarted')}
              </Link>
              <Link
                to="/businesses"
                onMouseEnter={() => prefetchRoute('/businesses')}
                onFocus={() => prefetchRoute('/businesses')}
                className="inline-flex items-center px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                {t('nav.businesses')}
              </Link>
            </div>
            <div className="pt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>{t('public.bullet1')}</span>
              <span aria-hidden="true">·</span>
              <span>{t('public.bullet2')}</span>
              <span aria-hidden="true">·</span>
              <span>{t('public.bullet3')}</span>
            </div>
          </div>

          <div className="lg:col-span-6 flex flex-col gap-4 animate-fade-up">
            <div className="flex-1 min-h-[300px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 relative">
              <img
                src={heroKigaliImg}
                alt={t('public.heroImgAlt')}
                fetchPriority="high"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-transform duration-200 hover:-translate-y-0.5">
                <div className="text-xs font-semibold text-[#0B192C] dark:text-white">{t('public.card1Title')}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('public.card1Desc')}</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-transform duration-200 hover:-translate-y-0.5">
                <div className="text-xs font-semibold text-[#0B192C] dark:text-white">{t('public.card2Title')}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('public.card2Desc')}</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-transform duration-200 hover:-translate-y-0.5">
                <div className="text-xs font-semibold text-[#0B192C] dark:text-white">{t('public.card3Title')}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('public.card3Desc')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. About BizTrade Africa Section */}
      <RevealBlock as="section" id="about" className="scroll-mt-20 max-w-7xl mx-auto px-6 py-20 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-5 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-[280px]">
            <img
              src={featurePosImg}
              alt={t('public.aboutImgAlt')}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">{t('public.aboutEyebrow')}</p>
              <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0B192C] dark:text-white [text-wrap:balance]">
                {t('public.aboutTitle')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {t('public.aboutDesc')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                <h3 className="text-sm font-semibold text-[#0B192C] dark:text-white">{t('public.problemsTitle')}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('public.problemsDesc')}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                <h3 className="text-sm font-semibold text-[#0B192C] dark:text-white">{t('public.productivityTitle')}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('public.productivityDesc')}
                </p>
              </div>
            </div>

            <div className="pt-1">
              <Link
                to="/about"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline"
              >
                <span>{t('public.readFullAbout')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </RevealBlock>

      {/* 3. Comprehensive Features Section (All 17 Modules + Inline View More) */}
      <RevealBlock as="section" id="features" className="scroll-mt-20 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">{t('public.featuresEyebrow')}</p>
              <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0B192C] dark:text-white [text-wrap:balance]">
                {t('public.featuresTitle')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('public.featuresDesc')}
              </p>
            </div>
            <Link
              to="/features"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0 self-start md:self-end"
            >
              <span>{t('public.viewAllFeatures')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {displayedFeatures.map((feat, idx) => {
              const Icon = FEATURE_ICONS[idx % FEATURE_ICONS.length];
              const imageSrc = FEATURE_IMAGES[idx % FEATURE_IMAGES.length];
              return (
                <article
                  key={feat.title || idx}
                  className="group bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col hover:border-sky-500/50 dark:hover:border-sky-500/50 transition-[transform,border-color] duration-200 hover:-translate-y-0.5"
                >
                  <FeatureCardMedia src={imageSrc} alt={feat.title} icon={Icon} />
                  <div className="p-4 sm:p-5 space-y-2.5 flex-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-sky-700 dark:text-sky-400 shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-semibold text-[#0B192C] dark:text-white leading-snug">{feat.title}</h3>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{feat.desc}</p>
                  </div>
                </article>
              );
            })}
          </div>

          {platformFeatures.length > 8 && (
            <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {t('public.showingModulesCount', { shown: displayedFeatures.length, total: platformFeatures.length })}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAllFeatures((prev) => !prev)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>{showAllFeatures ? t('public.viewLess') : t('public.viewMore')}</span>
                </button>
                <Link
                  to="/features"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>{t('public.viewAllFeatures')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </RevealBlock>

      {/* 4. How BizTrade Africa Works */}
      <RevealBlock as="section" id="how-it-works" className="scroll-mt-20 max-w-7xl mx-auto px-6 py-20 w-full space-y-12">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">{t('public.howEyebrow')}</p>
          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0B192C] dark:text-white [text-wrap:balance]">
            {t('public.howTitle')}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {t('public.howDesc')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workflowSteps.map((item) => (
            <div
              key={item.step}
              className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-sky-500/40"
            >
              <div className="text-xs font-mono font-bold text-sky-700 dark:text-sky-400">{item.step}.</div>
              <h3 className="text-base font-semibold text-[#0B192C] dark:text-white">{item.title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </RevealBlock>

      {/* 5. Platform Benefits & Supported Businesses */}
      <RevealBlock as="section" id="benefits" className="scroll-mt-20 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 py-20">
        <div className="max-w-7xl mx-auto px-6 space-y-16">
          <div className="space-y-8">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">{t('public.benefitsEyebrow')}</p>
              <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0B192C] dark:text-white [text-wrap:balance]">
                {t('public.benefitsTitle')}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {platformBenefits.map((b, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 dark:bg-slate-950 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-sm font-semibold text-[#0B192C] dark:text-white">{b.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-8 border-t border-slate-200 dark:border-slate-800 space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('public.sectorsTitle')}</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t('public.sectorsDesc')}
                </p>
              </div>
              <Link
                to="/businesses"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0"
              >
                {t('public.exploreBusinesses')}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {supportedBusinesses.map((sector, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 dark:bg-slate-950 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2"
                >
                  <Store className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span className="truncate">{sector}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </RevealBlock>

      {/* 6. Contact Section */}
      <RevealBlock as="section" id="contact" className="scroll-mt-20 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 py-20">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">{t('public.contactEyebrow')}</p>
              <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0B192C] dark:text-white [text-wrap:balance]">
                {t('public.contactTitle')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('public.contactDesc')}
              </p>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
                <a
                  href={`mailto:${config.support_email || 'allofme140@gmail.com'}`}
                  className="font-medium text-slate-900 dark:text-white hover:underline"
                >
                  {config.support_email || 'allofme140@gmail.com'}
                </a>
              </div>
              {config.support_phone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span className="font-medium text-slate-900 dark:text-white tabular-nums">{config.support_phone}</span>
                </div>
              )}
              {config.platform_location && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span>{config.platform_location}</span>
                </div>
              )}
            </div>

            {socialLinks.length > 0 && (
              <div className="pt-2 flex flex-wrap gap-3 text-xs">
                {socialLinks.map((s) => (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span>{s.label}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={handleHomeContactSubmit}
            className="lg:col-span-7 bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <h3 className="text-base font-bold text-[#0B192C] dark:text-white">{t('public.sendInquiryTitle')}</h3>
            {contactStatus.text && (
              <div
                className={`p-3 rounded-lg text-xs font-medium border ${
                  contactStatus.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900'
                    : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-900'
                }`}
              >
                {contactStatus.text}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('auth.fullName')}</label>
                <input
                  required
                  value={contactForm.full_name}
                  onChange={(e) => setContactForm({ ...contactForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.email')}</label>
                <input
                  required
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.phone')}</label>
                <input
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('public.businessName')}</label>
                <input
                  value={contactForm.business_name}
                  onChange={(e) => setContactForm({ ...contactForm, business_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('public.message')}</label>
              <textarea
                required
                rows={4}
                value={contactForm.message}
                onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                placeholder={t('public.messagePlaceholder')}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={submittingContact}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60 transition-colors"
            >
              {submittingContact ? t('public.sending') : t('public.sendMessage')}
            </button>
          </form>
        </div>
      </RevealBlock>

      <PublicFooter />
    </div>
  );
}

export function PublicBusinessesPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [businesses, setBusinesses] = useState([]);
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('q') || '');
  const [category, setCategory] = useState(() => searchParams.get('category') || '');
  const [district, setDistrict] = useState(() => searchParams.get('district') || '');
  const [sort, setSort] = useState(() => searchParams.get('sort') || 'newest');
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page') || 1)));
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Keep local state in sync when URL query changes (e.g. from QuickSearchModal or browser Back/Forward)
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    const urlCat = searchParams.get('category') || '';
    const urlDist = searchParams.get('district') || '';
    const urlSort = searchParams.get('sort') || 'newest';
    const urlPage = Math.max(1, Number(searchParams.get('page') || 1));
    setSearch(urlQ);
    setDebouncedSearch(urlQ);
    setCategory(urlCat);
    setDistrict(urlDist);
    setSort(urlSort);
    setPage(urlPage);
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedSearch !== search) {
        setDebouncedSearch(search);
        setPage(1);
      }
    }, 240);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  const syncUrlParams = useCallback(
    (next) => {
      const params = new URLSearchParams();
      if (next.q?.trim()) params.set('q', next.q.trim());
      if (next.category) params.set('category', next.category);
      if (next.district) params.set('district', next.district);
      if (next.sort && next.sort !== 'newest') params.set('sort', next.sort);
      if (next.page && next.page > 1) params.set('page', String(next.page));
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  useEffect(() => {
    syncUrlParams({ q: debouncedSearch, category, district, sort, page });
  }, [debouncedSearch, category, district, sort, page, syncUrlParams]);

  const loadDirectory = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        q: debouncedSearch.trim() || undefined,
        category: category || undefined,
        district: district || undefined,
        sort: sort || 'newest',
        page,
        limit: 24,
      };
      const [bRes, vRes] = await Promise.all([
        api.get('/public/businesses', { params, signal }),
        api.get('/public/videos', { params: { q: params.q, category: params.category }, signal }),
      ]);
      setBusinesses(bRes.data.businesses || []);
      setVideos(vRes.data.videos || []);
      setTotalPages(Math.max(1, Number(bRes.data.totalPages || 1)));
      if (bRes.data.categories?.length) setCategories(bRes.data.categories);
      if (bRes.data.districts?.length) setDistricts(bRes.data.districts);
    } catch (err) {
      if (!err.isCanceled) {
        setError(err.message);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [debouncedSearch, category, district, sort, page]);

  useEffect(() => {
    const controller = new AbortController();
    loadDirectory(controller.signal);
    return () => controller.abort();
  }, [loadDirectory]);

  const handleClearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setCategory('');
    setDistrict('');
    setSort('newest');
    setPage(1);
    setSearchParams({}, { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-10 w-full space-y-8 animate-fade-up">
        <nav aria-label="Breadcrumb" className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Link to="/" onMouseEnter={() => prefetchRoute('/')} className="hover:text-slate-900 dark:hover:text-white">
              {t('nav.home')}
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="font-semibold text-slate-900 dark:text-white">{t('nav.businesses')}</span>
          </div>
          <Link to="/jobs" onMouseEnter={() => prefetchRoute('/jobs')} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">
            {t('search.quickJobs')} →
          </Link>
        </nav>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">{t('public.directoryTitle')}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('public.directorySubtitle')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('public.searchBusinessesPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
            </div>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            >
              <option value="">{t('public.allCategories')}</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {districts.length > 0 && (
              <select
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              >
                <option value="">{t('public.allLocations')}</option>
                {districts.map((dist) => (
                  <option key={dist} value={dist}>{dist}</option>
                ))}
              </select>
            )}
            <select
              aria-label={t('search.sortNewest')}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            >
              <option value="newest">{t('search.sortNewest')}</option>
              <option value="name">{t('search.sortName')}</option>
              <option value="products">{t('search.sortProducts')}</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadDirectory()}
              className="px-3 py-1 rounded bg-rose-700 text-white font-semibold hover:bg-rose-600 shrink-0"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-52 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : businesses.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-12 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <Store className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t('public.noBusinessesMatch')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {t('public.noBusinessesMatchDesc')}
            </p>
            {(search || category || district || sort !== 'newest') && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t('common.clearFilters')}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {businesses.map((b) => (
                <div
                  key={b.id}
                  onMouseEnter={() => prefetchRoute(`/businesses/${b.slug}`)}
                  className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-5 hover:border-sky-500/40 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      {b.logo_url ? (
                        <img src={b.logo_url} alt={b.name} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-sm font-bold text-[#0B192C] dark:text-sky-300 shrink-0">
                          {b.name?.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{b.name}</h2>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{b.category}</div>
                      </div>
                    </div>
                    {b.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">{b.description}</p>
                    )}
                    <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                        <span className="truncate">{b.district}, {b.province}, {b.country}</span>
                      </div>
                      {b.operating_hours && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                          <span className="truncate">{b.operating_hours}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                      {b.product_count} {t('public.productsCount')} · {b.review_count > 0 ? `${b.avg_rating}★ (${b.review_count})` : t('public.noReviewsYet')}
                    </div>
                    <Link
                      to={`/businesses/${b.slug}`}
                      onFocus={() => prefetchRoute(`/businesses/${b.slug}`)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap"
                    >
                      {t('public.viewCatalog')}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2 text-xs">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 disabled:opacity-50"
                >
                  {t('common.previous')}
                </button>
                <span className="text-slate-600 dark:text-slate-400 tabular-nums">
                  {t('common.pageOf', { page, total: totalPages })}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 disabled:opacity-50"
                >
                  {t('common.next')}
                </button>
              </div>
            )}
          </>
        )}

        {!loading && videos.length > 0 && (
          <section className="space-y-4 pt-4">
            <div>
              <h2 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('public.featuredVideosTitle')}</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {t('public.featuredVideosDesc')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((vid) => (
                <VideoAdPlayer key={vid.id} video={vid} showBusiness />
              ))}
            </div>
          </section>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

export function PublicBusinessDetailPage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [catalogQuery, setCatalogQuery] = useState(() => searchParams.get('q') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cart, setCart] = useState({});
  const [branchId, setBranchId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '', product_id: '' });
  const [contactMsg, setContactMsg] = useState('');

  useEffect(() => {
    setCatalogQuery(searchParams.get('q') || '');
  }, [searchParams]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/public/businesses/${slug}`);
      setData(res.data);
      if (res.data?.business?.name) {
        const b = res.data.business;
        setDynamicSeo({
          title: `${b.name} — ${b.category} (${b.district}) | BizTrade Africa`,
          description: b.description || `${b.name} storefront, product catalog, and branches in ${b.district}, ${b.country} on BizTrade Africa.`,
        });
      }
      if (res.data.branches?.length) {
        setBranchId((prev) => prev || String(res.data.branches[0].id));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const filteredProducts = useMemo(() => {
    const items = data?.products || [];
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category_name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [data?.products, catalogQuery]);

  const adjustQty = (productId, delta) => {
    setCart((prev) => {
      const next = Math.max(0, (prev[productId] || 0) + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const cartItems = (data?.products || []).filter((p) => cart[p.id] > 0);
  const cartTotal = cartItems.reduce((sum, p) => sum + Number(p.selling_price) * cart[p.id], 0);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    if (!cartItems.length) return;
    setError('');
    setNotice('');
    setSubmittingOrder(true);
    try {
      const res = await api.post('/customer/orders', {
        business_id: data.business.id,
        branch_id: branchId ? Number(branchId) : null,
        delivery_address: deliveryAddress,
        notes: orderNotes,
        items: cartItems.map((p) => ({ product_id: p.id, quantity: cart[p.id] })),
      });
      setCart({});
      setDeliveryAddress('');
      setOrderNotes('');
      setNotice(res.data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    setError('');
    setNotice('');
    try {
      const res = await api.post(`/customer/businesses/${data.business.id}/reviews`, {
        rating: Number(reviewForm.rating),
        comment: reviewForm.comment,
        product_id: reviewForm.product_id ? Number(reviewForm.product_id) : null,
      });
      setReviewForm({ rating: 5, comment: '', product_id: '' });
      setNotice(res.data.message);
      await loadDetail();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleContactBusiness = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    setError('');
    setNotice('');
    try {
      const res = await api.post(`/customer/businesses/${data.business.id}/contact`, { message: contactMsg });
      setContactMsg('');
      setNotice(res.data.message);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-10 w-full space-y-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link to="/" onMouseEnter={() => prefetchRoute('/')} className="hover:text-slate-900 dark:hover:text-white">
              {t('nav.home')}
            </Link>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            <Link to="/businesses" onMouseEnter={() => prefetchRoute('/businesses')} className="hover:text-slate-900 dark:hover:text-white">
              {t('nav.businesses')}
            </Link>
            {data?.business?.name && (
              <>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold text-slate-900 dark:text-white truncate">{data.business.name}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/businesses')}
            className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t('public.backToDirectory')}</span>
          </button>
        </nav>

        {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg">{error}</div>}
        {notice && (
          <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg flex items-center justify-between gap-4">
            <span>{notice}</span>
            {user && !user.is_platform_admin && (
              <Link to="/customer" className="font-semibold underline whitespace-nowrap">{t('public.viewInCustomerPortal')} →</Link>
            )}
          </div>
        )}

        {loading ? (
          <div className="h-64 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
        ) : !data?.business ? (
          <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400">
            {t('public.businessNotFound')}
          </div>
        ) : (
          <>
            {/* Business Profile Header */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                {data.business.logo_url ? (
                  <img src={data.business.logo_url} alt={data.business.name} referrerPolicy="no-referrer" className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-lg font-bold text-[#0B192C] dark:text-sky-300 shrink-0">
                    {data.business.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">{data.business.name}</h1>
                    {data.business.business_code && (
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{data.business.business_code}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">{data.business.category} · {data.business.physical_address}, {data.business.district}</div>
                  {data.business.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl pt-1">{data.business.description}</p>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 shrink-0">
                <div>{t('common.phone')}: <span className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">{data.business.phone}</span></div>
                <div>{t('common.email')}: <span className="font-medium text-slate-900 dark:text-slate-100">{data.business.email}</span></div>
                {data.business.operating_hours && (
                  <div>{t('public.hours')}: <span className="font-medium text-slate-900 dark:text-slate-100">{data.business.operating_hours}</span></div>
                )}
                {Boolean(data.business.phone_on_whatsapp) && (
                  <div className="pt-1">
                    <WhatsAppContactButton
                      phone={data.business.phone}
                      available={Boolean(data.business.phone_on_whatsapp)}
                      label={t('whatsapp.chatOnWhatsApp')}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Published Business Promotional Videos */}
            {data.videos?.length > 0 && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('public.promoVideos')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('public.promoVideosBy')} {data.business.name}.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {data.videos.map((vid) => (
                    <VideoAdPlayer key={vid.id} video={vid} />
                  ))}
                </div>
              </section>
            )}

            {/* Open Job Vacancies at This Business */}
            {data.vacancies?.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('public.openPositions')}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('public.openPositionsDesc')} {data.business.name}.
                    </p>
                  </div>
                  <Link to="/jobs" className="text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline">
                    {t('public.viewAllJobs')} →
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.vacancies.map((vac) => (
                    <div key={vac.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3 text-xs">
                      <div className="space-y-1">
                        <div className="font-bold text-sm text-slate-900 dark:text-white">{vac.title}</div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {vac.department || t('public.general')} · {vac.location}
                        </div>
                        {vac.application_deadline && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            {t('public.deadline')}: {formatDate(vac.application_deadline)}
                          </div>
                        )}
                      </div>
                      <Link
                        to={`/jobs/${vac.id}`}
                        className="inline-flex items-center justify-center gap-1 px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                      >
                        {t('public.viewVacancyApply')}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Catalog + Customer Order Builder */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('public.publishedProducts')}</h2>
                  {data.products.length > 0 && (
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        value={catalogQuery}
                        onChange={(e) => setCatalogQuery(e.target.value)}
                        placeholder={t('search.filterCatalogPlaceholder')}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  )}
                </div>
                {filteredProducts.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-3">
                    <span>{catalogQuery ? t('search.noMatches') : t('public.noCatalogItems')}</span>
                    {catalogQuery && (
                      <button
                        type="button"
                        onClick={() => setCatalogQuery('')}
                        className="px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-400 border border-slate-200 dark:border-slate-700 rounded-lg"
                      >
                        {t('common.clearFilters')}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredProducts.map((p) => (
                      <div key={p.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{p.name}</div>
                            <span className={`text-[11px] font-medium ${p.in_stock ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                              {p.in_stock ? t('public.available') : t('public.outOfStock')}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{p.category_name || t('public.general')} · {p.unit}</div>
                          {p.description && <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{p.description}</p>}
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <div className="text-sm font-bold text-[#0B192C] dark:text-sky-300 tabular-nums">
                            {formatMoney(p.selling_price, data.business.currency_code)}
                          </div>
                          <div className="flex items-center gap-2">
                            {cart[p.id] > 0 ? (
                              <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg text-xs">
                                <button type="button" onClick={() => adjustQty(p.id, -1)} className="px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800">-</button>
                                <span className="px-2 font-semibold tabular-nums">{cart[p.id]}</span>
                                <button type="button" onClick={() => adjustQty(p.id, 1)} className="px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800">+</button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={!p.in_stock}
                                onClick={() => adjustQty(p.id, 1)}
                                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"
                              >
                                {t('public.addToOrder')}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:col-span-4 space-y-6">
                <form onSubmit={handlePlaceOrder} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('public.orderBasket')}</h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{cartItems.length} {t('public.itemCount')}</span>
                  </div>

                  {cartItems.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('public.selectCatalogHint')}</p>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {cartItems.map((item) => (
                          <div key={item.id} className="py-2 flex items-center justify-between gap-2">
                            <div className="truncate">{item.name} × {cart[item.id]}</div>
                            <div className="font-semibold tabular-nums shrink-0">
                              {formatMoney(Number(item.selling_price) * cart[item.id], data.business.currency_code)}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-sm font-bold text-[#0B192C] dark:text-white">
                        <span>{t('public.estimatedTotal')}</span>
                        <span className="tabular-nums">{formatMoney(cartTotal, data.business.currency_code)}</span>
                      </div>

                      {data.branches.length > 0 && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('public.fulfillmentBranch')}</label>
                          <select
                            value={branchId}
                            onChange={(e) => setBranchId(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          >
                            {data.branches.map((br) => (
                              <option key={br.id} value={br.id}>{br.name} ({br.district || br.province})</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('public.deliveryAddress')}</label>
                        <input
                          required
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder={t('public.deliveryAddressPlaceholder')}
                          className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('public.orderNotes')}</label>
                        <input
                          value={orderNotes}
                          onChange={(e) => setOrderNotes(e.target.value)}
                          placeholder={t('public.orderNotesPlaceholder')}
                          className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      {user ? (
                        <button
                          type="submit"
                          disabled={submittingOrder}
                          className="w-full py-2.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
                        >
                          {submittingOrder ? t('public.submittingOrder') : t('public.placeOrder')}
                        </button>
                      ) : (
                        <Link
                          to="/login"
                          className="block text-center w-full py-2.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                        >
                          {t('public.signInPlaceOrder')}
                        </Link>
                      )}
                    </>
                  )}
                </form>

                {/* Contact Business */}
                <form onSubmit={handleContactBusiness} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#0B192C] dark:text-white">
                    <MessageSquare className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                    <span>{t('public.messageBusiness')}</span>
                  </div>
                  <textarea
                    required
                    rows={3}
                    value={contactMsg}
                    onChange={(e) => setContactMsg(e.target.value)}
                    placeholder={t('public.messageBusinessPlaceholder')}
                    className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  {user ? (
                    <button type="submit" className="w-full py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                      {t('public.sendMessage')}
                    </button>
                  ) : (
                    <Link to="/login" className="block text-center py-2 text-xs font-semibold text-sky-700 dark:text-sky-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                      {t('public.signInMessageBusiness')}
                    </Link>
                  )}
                </form>
              </div>
            </div>

            {/* Reviews Section */}
            <section className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('public.customerReviews')} ({data.reviews.length})</h2>
              </div>

              {data.allow_customer_reviews && (
                <form onSubmit={handleSubmitReview} className="grid grid-cols-1 md:grid-cols-12 gap-3 pb-4 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <select
                    value={reviewForm.rating}
                    onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })}
                    className="md:col-span-2 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="5">5 {t('public.stars')}</option>
                    <option value="4">4 {t('public.stars')}</option>
                    <option value="3">3 {t('public.stars')}</option>
                    <option value="2">2 {t('public.stars')}</option>
                    <option value="1">1 {t('public.star')}</option>
                  </select>
                  <select
                    value={reviewForm.product_id}
                    onChange={(e) => setReviewForm({ ...reviewForm, product_id: e.target.value })}
                    className="md:col-span-3 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">{t('public.generalBusinessReview')}</option>
                    {data.products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    required
                    value={reviewForm.comment}
                    onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                    placeholder={t('public.shareReviewPlaceholder')}
                    className="md:col-span-5 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  {user ? (
                    <button type="submit" className="md:col-span-2 px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                      {t('public.submitReview')}
                    </button>
                  ) : (
                    <Link to="/login" className="md:col-span-2 text-center px-4 py-2 font-semibold text-sky-700 dark:text-sky-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                      {t('nav.signIn')}
                    </Link>
                  )}
                </form>
              )}

              {data.reviews.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('public.noReviewsSubmitted')}</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {data.reviews.map((rev) => (
                    <div key={rev.id} className="py-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                          <UserAvatar src={rev.customer_avatar} name={rev.customer_name} size="xs" />
                          <span>{rev.customer_name} {rev.product_name ? `· ${rev.product_name}` : ''}</span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold tabular-nums">
                          <Star className="w-3.5 h-3.5 fill-amber-500" />
                          <span>{rev.rating}/5</span>
                          <span className="text-slate-400 dark:text-slate-500 font-normal ml-2">{formatDate(rev.created_at)}</span>
                        </div>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{rev.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

export function FeaturesPage() {
  const { t } = useTranslation();
  const modules = t('public.featuresPageModules', { returnObjects: true }) || [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 w-full space-y-10 sm:space-y-12 animate-fade-up">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-3 max-w-2xl">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">{t('public.featuresEyebrow')}</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0B192C] dark:text-white [text-wrap:balance]">{t('public.featuresPageTitle')}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('public.featuresPageSubtitle')}
            </p>
          </div>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0 self-start md:self-end"
          >
            <span>{t('public.getStarted')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((mod, idx) => {
            const Icon = FEATURE_ICONS[idx % FEATURE_ICONS.length];
            const imageSrc = FEATURE_IMAGES[idx % FEATURE_IMAGES.length];
            return (
              <article
                key={mod.title || idx}
                className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col hover:border-sky-500/50 dark:hover:border-sky-500/50 transition-[transform,border-color] duration-200 hover:-translate-y-0.5"
              >
                <FeatureCardMedia src={imageSrc} alt={mod.title} icon={Icon} />
                <div className="p-5 sm:p-6 space-y-2.5 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-sky-700 dark:text-sky-400 font-semibold tabular-nums">
                      {String(idx + 1).padStart(2, '0')}.
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-sky-700 dark:text-sky-400 shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">{mod.title}</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{mod.desc}</p>
                </div>
              </article>
            );
          })}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function PricingPage() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState('monthly');

  useEffect(() => {
    api.get('/subscriptions/plans').then((res) => setPlans(res.data.plans || [])).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-16 space-y-10 w-full animate-fade-up">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">{t('public.pricingTitle')}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('public.pricingSubtitle')}
            </p>
          </div>
          <div className="inline-flex p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setBilling('monthly')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                billing === 'monthly'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t('public.monthlyBilling')}
            </button>
            <button
              type="button"
              onClick={() => setBilling('annual')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                billing === 'annual'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t('public.annualBilling')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const price = billing === 'annual' ? plan.annual_price_rwf : plan.monthly_price_rwf;
            return (
              <div
                key={plan.id}
                className={`bg-white dark:bg-slate-900 p-6 rounded-xl border flex flex-col justify-between space-y-6 ${
                  plan.code === 'business'
                    ? 'border-sky-600 dark:border-sky-500 ring-1 ring-sky-600 dark:ring-sky-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{plan.target_audience}</p>
                  </div>
                  <div className="text-2xl font-bold text-[#0B192C] dark:text-white tabular-nums">
                    {formatMoney(price, 'RWF')}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400"> / {billing === 'annual' ? t('public.yearUnit') : t('public.monthUnit')}</span>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {t('public.upToEmployees', { count: plan.max_employees })}</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {t('public.upToBranches', { count: plan.max_branches })}</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {t('public.activeSkus', { count: plan.max_products.toLocaleString() })}</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {t('public.aiQueriesMonth', { count: plan.max_ai_requests_monthly })}</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {plan.advanced_reports_enabled ? t('public.fullPnlReports') : t('public.standardDailyReports')}</li>
                  </ul>
                </div>
                <Link
                  to="/contact"
                  className="block text-center py-2.5 px-4 text-xs font-semibold rounded-lg bg-[#0B192C] dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors"
                >
                  {t('public.requestOnboardingBtn')}
                </Link>
              </div>
            );
          })}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

function ProjectPreviewMedia({ project }) {
  const [failed, setFailed] = useState(false);

  if (failed || !project.image) {
    return (
      <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center border-b border-slate-200 dark:border-slate-800">
        <span className="text-2xl font-bold tracking-tight text-[#0B192C] dark:text-white">
          {project.fallbackCode}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">{project.name}</span>
      </div>
    );
  }

  return (
    <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800">
      <img
        src={project.image}
        alt={`${project.name}`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
    </div>
  );
}

export function AboutPage() {
  const { t } = useTranslation();
  const { config } = usePlatformConfig();
  const [portraitFailed, setPortraitFailed] = useState(false);

  const developerName = config.developer_name?.trim() || 'Xavine Hakim';
  const developerRole = config.developer_role?.trim() || 'Full Stack Developer';
  const portfolioUrl = config.developer_portfolio_url?.trim() || 'https://xavineanoited.vercel.app/';
  const developerBio = config.developer_bio?.trim() || t('public.defaultDevBio');

  const developerProjects = [
    {
      id: 'biztrade-africa',
      name: 'BizTradeAfrica',
      image: projectBiztradeImg,
      fallbackCode: 'BT',
      description: t('public.projectDescBiztrade'),
      technologies: ['React.js', 'Vite', 'Tailwind CSS', 'Node.js', 'Express.js', 'MySQL'],
      status: t('public.inDevelopment'),
      publicRoute: '/',
      publicLabel: t('public.openPlatform'),
    },
    {
      id: 'kigali-store',
      name: 'Kigali-Store',
      image: projectKigaliStoreImg,
      fallbackCode: 'KS',
      description: t('public.projectDescKigali'),
      technologies: ['React.js', 'JavaScript', 'Tailwind CSS', 'Node.js', 'Express.js', 'MySQL'],
      status: t('public.inDevelopment'),
      publicRoute: null,
      publicLabel: null,
    },
    {
      id: 'electrovault',
      name: 'ElectroVault',
      image: projectElectroVaultImg,
      fallbackCode: 'EV',
      description: t('public.projectDescElectro'),
      technologies: ['React.js', 'Vite', 'Tailwind CSS', 'Node.js', 'Express.js', 'MySQL'],
      status: t('public.inDevelopment'),
      publicRoute: null,
      publicLabel: null,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />

      <main className="flex-1">
        {/* About BizTrade Africa Overview */}
        <section className="max-w-6xl mx-auto px-6 py-16 space-y-8 animate-fade-up">
          <div className="max-w-3xl space-y-4">
            <p className="text-xs font-semibold tracking-wide text-sky-700 dark:text-sky-400">
              {t('public.aboutEyebrow')}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0B192C] dark:text-white">
              {t('public.aboutPageTitle')}
            </h1>
            <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed">
              {t('public.aboutPageDesc')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('public.rwandaEngineeringTitle')}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('public.rwandaEngineeringDesc')}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('public.continentalGrowthTitle')}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('public.continentalGrowthDesc')}
              </p>
            </div>
          </div>
        </section>

        {/* Dedicated Developer Section */}
        <section
          aria-labelledby="about-developer-heading"
          className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-16 lg:py-20"
        >
          <div className="max-w-6xl mx-auto px-6 space-y-14">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold tracking-wide text-sky-700 dark:text-sky-400">
                {t('public.devSectionEyebrow')}
              </p>
              <h2
                id="about-developer-heading"
                className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C] dark:text-white"
              >
                {t('public.devSectionTitle')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('public.devSectionDesc')}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-950 p-6 sm:p-7 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-6">
                <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-start sm:items-center lg:items-start xl:items-center gap-5">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-200 dark:bg-slate-800 shrink-0">
                    {portraitFailed ? (
                      <div className="w-full h-full flex items-center justify-center text-lg font-bold text-[#0B192C] dark:text-white">
                        XH
                      </div>
                    ) : (
                      <img
                        src={developerXavineImg}
                        alt={`${developerName} — ${developerRole}`}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() => setPortraitFailed(true)}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <div className="text-xs font-semibold tracking-wide text-sky-700 dark:text-sky-400">
                      {t('public.developedBySoftworld')}
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-[#0B192C] dark:text-white">
                      {developerName}
                    </h3>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      {developerRole}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                      BizTradeAfrica · Kigali-Store · ElectroVault
                    </div>
                  </div>
                </div>

                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {developerBio}
                </p>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="text-xs font-semibold text-[#0B192C] dark:text-white">
                    {t('public.projectVision')}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t('public.projectVisionDesc')}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <a
                      href={portfolioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors"
                    >
                      <span>{t('public.visitDevPortfolio')}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    {config.developer_email && (
                      <a
                        href={`mailto:${config.developer_email}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>{t('common.email')}</span>
                      </a>
                    )}
                    {config.developer_github_url && (
                      <a
                        href={config.developer_github_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors"
                      >
                        <span>GitHub</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {config.developer_linkedin_url && (
                      <a
                        href={config.developer_linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors"
                      >
                        <span>LinkedIn</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-5">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-[#0B192C] dark:text-white">
                    {t('public.techSkillsTitle')}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {t('public.techSkillsDesc')}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {TECH_STACK_STATIC.map((group) => {
                    const Icon = group.icon;
                    return (
                      <div
                        key={group.key}
                        className="bg-slate-50 dark:bg-slate-950 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-sky-500/40"
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#0B192C] dark:text-white">
                          <Icon className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
                          <span>{t(`public.techStackCategories.${group.key}`)}</span>
                        </div>
                        <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                          {group.items.map((tech) => (
                            <li key={tech} className="flex items-center gap-2">
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{tech}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-200 dark:border-slate-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold tracking-wide text-sky-700 dark:text-sky-400">
                    {t('public.activeSystemsEyebrow')}
                  </p>
                  <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0B192C] dark:text-white">
                    {t('public.featuredProjectsTitle')}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('common.developedBy')} <span className="font-semibold text-slate-700 dark:text-slate-200">softworld</span> · {t('public.builtBy')} {developerName} ({developerRole})
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {developerProjects.map((project) => (
                  <article
                    key={project.id}
                    className="group bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-sky-500/40"
                  >
                    <div>
                      <ProjectPreviewMedia project={project} />
                      <div className="p-6 space-y-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <h4 className="text-lg font-bold tracking-tight text-[#0B192C] dark:text-white">
                            {project.name}
                          </h4>
                          <span className="text-[11px] font-semibold tracking-wider text-amber-700 dark:text-amber-400 whitespace-nowrap shrink-0">
                            {project.status}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                          {project.description}
                        </p>
                      </div>
                    </div>

                    <div className="px-6 pb-6 pt-3 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
                      <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{t('public.technologiesLabel')} </span>
                        {project.technologies.join(' · ')}
                      </div>

                      {project.publicRoute && (
                        <div>
                          <Link
                            to={project.publicRoute}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline"
                          >
                            <span>{project.publicLabel}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

export function ContactPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '+250', business_name: '', message: '' });
  const [status, setStatus] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ type: '', text: '' });
    try {
      const { data } = await api.post('/public/contact', form);
      setStatus({ type: 'success', text: data.message });
      setForm({ full_name: '', email: '', phone: '+250', business_name: '', message: '' });
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full space-y-8 animate-fade-up">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">{t('public.contactPageTitle')}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('public.contactPageSubtitle')}{' '}
            <a href="mailto:allofme140@gmail.com" className="font-semibold text-sky-700 dark:text-sky-400 hover:underline">
              allofme140@gmail.com
            </a>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          {status.text && (
            <div className={`p-3 rounded-lg text-xs font-medium border ${status.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900' : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-900'}`}>
              {status.text}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('auth.fullName')}</label>
              <input
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.email')}</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.phone')}</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('public.businessName')}</label>
              <input
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('public.message')}</label>
            <textarea
              required
              rows={4}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
          >
            {submitting ? t('public.sending') : t('public.sendInquiry')}
          </button>
        </form>
      </main>
      <PublicFooter />
    </div>
  );
}

export function TrackOrderPage() {
  const { t } = useTranslation();
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleTrack = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    try {
      const { data } = await api.get('/public/orders/track', {
        params: { order_number: orderNumber, phone },
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 w-full space-y-6 animate-fade-up">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">{t('public.trackOrderTitle')}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('public.trackOrderSubtitle')}
          </p>
        </div>

        <form onSubmit={handleTrack} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('public.orderNumber')}</label>
              <input
                required
                placeholder="ORD-123456"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('public.customerPhone')}</label>
              <input
                required
                placeholder="+250788..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
          >
            <Search className="w-4 h-4" />
            {t('public.trackOrderBtn')}
          </button>
        </form>

        {error && <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm rounded-lg">{error}</div>}

        {result && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{result.order.business_name} · {result.order.branch_name}</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-white">{result.order.order_number}</div>
              </div>
              <StatusBadge status={result.order.order_status} />
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {t('common.total')}: <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{formatMoney(result.order.total_amount, result.order.currency_code)}</span>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t('public.statusTimeline')}</div>
              {(result.history || []).map((h, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {t(`status.${h.new_status}`, { defaultValue: h.new_status.replace(/_/g, ' ') })} {h.note ? `— ${h.note}` : ''}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 tabular-nums">{formatDateTime(h.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

export function LegalPage({ type = 'terms', title }) {
  const { t } = useTranslation();
  const heading = title || (type === 'privacy' ? t('public.privacyTitle') : t('public.termsTitle'));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 space-y-6">
        <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">{heading}</h1>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>{t('public.legalP1')}</p>
          <p>{t('public.legalP2')}</p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
