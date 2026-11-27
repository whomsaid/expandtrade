import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const ROUTE_SEO = [
  {
    match: (p) => p === '/',
    title: 'BizTrade Africa — Business POS, Inventory & Commerce',
    description:
      'Manage POS sales, multi-branch inventory, orders, payroll, finance, and public storefronts in one fast BizTrade Africa workspace.',
    indexable: true,
    breadcrumb: [{ name: 'Home', path: '/' }],
  },
  {
    match: (p) => p === '/businesses',
    title: 'BizTrade Africa — Verified Business Directory',
    description:
      'Browse verified stores, wholesale suppliers, product catalogs, and promotional showcases across Africa on BizTrade Africa.',
    indexable: true,
    schemaType: 'CollectionPage',
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Businesses', path: '/businesses' },
    ],
  },
  {
    match: (p) => p.startsWith('/businesses/'),
    title: 'BizTrade Africa — Business Catalog & Storefront',
    description:
      'Explore verified products, branch locations, customer reviews, open jobs, and order online directly through BizTrade Africa.',
    indexable: true,
  },
  {
    match: (p) => p === '/jobs',
    title: 'BizTrade Africa — Careers & Open Job Vacancies',
    description:
      'Explore verified career openings across growing African businesses and submit your CV and diploma online via BizTrade Africa.',
    indexable: true,
    schemaType: 'CollectionPage',
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Jobs', path: '/jobs' },
    ],
  },
  {
    match: (p) => p.startsWith('/jobs/'),
    title: 'BizTrade Africa — Job Vacancy Details',
    description:
      'Review job requirements, branch location, employment type, and apply online with your CV and documents on BizTrade Africa.',
    indexable: true,
  },
  {
    match: (p) => p === '/features',
    title: 'BizTrade Africa — 17 Business ERP & POS Modules',
    description:
      'Discover POS checkout, multi-branch stock transfers, supplier purchases, payroll, finance, CRM, and reports built for African businesses.',
    indexable: true,
    schemaType: 'WebPage',
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Features', path: '/features' },
    ],
  },
  {
    match: (p) => p === '/pricing',
    title: 'BizTrade Africa — Plans & Transparent Pricing',
    description:
      'Compare monthly and annual BizTrade Africa subscription plans designed for solo shops, growing teams, and multi-branch enterprises.',
    indexable: true,
    schemaType: 'WebPage',
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Pricing', path: '/pricing' },
    ],
  },
  {
    match: (p) => p === '/about',
    title: 'BizTrade Africa — Platform, Mission & About',
    description:
      'Learn how BizTrade Africa (BTA) empowers African enterprises with multi-branch operations, customer discovery, and reliable commerce.',
    indexable: true,
    schemaType: 'AboutPage',
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'About', path: '/about' },
    ],
  },
  {
    match: (p) => p === '/contact',
    title: 'BizTrade Africa — Contact & Onboarding Support',
    description:
      'Reach BizTrade Africa for guided business onboarding, enterprise support, or partnership inquiries across East and Central Africa.',
    indexable: true,
    schemaType: 'ContactPage',
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Contact', path: '/contact' },
    ],
  },
  {
    match: (p) => p === '/track-order',
    title: 'BizTrade Africa — Track Customer Order Status',
    description:
      'Look up real-time order confirmation, fulfillment progress, and delivery timeline updates using your BizTrade Africa order number.',
    indexable: true,
    schemaType: 'WebPage',
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Track Order', path: '/track-order' },
    ],
  },
  {
    match: (p) => p === '/terms',
    title: 'BizTrade Africa — Terms of Service',
    description:
      'Review the BizTrade Africa platform Terms of Service covering business accounts, customer orders, and multi-tenant usage.',
    indexable: true,
    schemaType: 'WebPage',
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Terms of Service', path: '/terms' },
    ],
  },
  {
    match: (p) => p === '/privacy',
    title: 'BizTrade Africa — Privacy Policy',
    description:
      'Read how BizTrade Africa protects personal data, business financial records, uploads, and customer transaction privacy.',
    indexable: true,
    schemaType: 'WebPage',
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Privacy Policy', path: '/privacy' },
    ],
  },
  {
    match: (p) => p === '/login',
    title: 'Sign In | BizTrade Africa',
    description: 'Sign in to your BizTrade Africa business workspace or customer account.',
    indexable: false,
  },
  {
    match: (p) => p === '/register',
    title: 'Create Customer Account | BizTrade Africa',
    description: 'Register an email-verified BizTrade Africa account to shop, track orders, and apply for jobs.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/customer'),
    title: 'Customer Portal | BizTrade Africa',
    description: 'Manage your orders, job applications, receipts, reviews, and profile settings on BizTrade Africa.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/dashboard'),
    title: 'Workspace Dashboard | BizTrade Africa',
    description: 'Live revenue, stock health, branch performance, and operational KPIs.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/pos'),
    title: 'Point of Sale | BizTrade Africa',
    description: 'Fast checkout, barcode lookup, receipts, and branch-aware stock updates.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/products'),
    title: 'Products & Catalog | BizTrade Africa',
    description: 'Manage SKUs, pricing, galleries, categories, and bulk CSV/XLSX imports.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/inventory'),
    title: 'Inventory & Stock | BizTrade Africa',
    description: 'Track stock movements, low-stock alerts, and inter-branch transfers.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/sales'),
    title: 'Sales & Invoices | BizTrade Africa',
    description: 'Review sales receipts, payment statuses, and branch sales activity.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/orders'),
    title: 'Customer Orders | BizTrade Africa',
    description: 'Track, confirm, and fulfill incoming customer orders.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/customers'),
    title: 'Customers & Receivables | BizTrade Africa',
    description: 'Manage customer profiles, balances, and purchase history.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/finance'),
    title: 'Finance & Expenses | BizTrade Africa',
    description: 'Monitor approved expenses, cashflow, and operating finances.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/payroll') || p.startsWith('/app/my-payroll'),
    title: 'Payroll & Compensation | BizTrade Africa',
    description: 'Manage payroll schedules, disbursements, and employee payslips.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/tasks'),
    title: 'Tasks & Team Messaging | BizTrade Africa',
    description: 'Collaborate with branch teams, assign tasks, and track completion.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/reports'),
    title: 'Analytics & Reports | BizTrade Africa',
    description: 'Inspect profit, margin, sales, and operational business reports.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/ai'),
    title: 'AI Business Assistant & Search | BizTrade Africa',
    description: 'Multi-turn Gemini business advisor and live Google Search market research.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/settings'),
    title: 'Workspace Settings | BizTrade Africa',
    description: 'Configure business profile, preferences, security, and team access.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/admin'),
    title: 'Super Admin Control | BizTrade Africa',
    description: 'Platform governance, business registration, QA monitoring, and system configuration.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/app/'),
    title: 'Business Workspace | BizTrade Africa',
    description: 'BizTrade Africa authenticated business management workspace.',
    indexable: false,
  },
];

function upsertMeta(attrName, attrValue, content) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function setJsonLd(graphOrObject) {
  if (typeof document === 'undefined' || !graphOrObject) return;
  let script = document.getElementById('bta-seo-jsonld');
  if (!script) {
    script = document.createElement('script');
    script.id = 'bta-seo-jsonld';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(graphOrObject);
}

function resolveAbsoluteUrl(urlOrPath) {
  if (typeof window === 'undefined') return urlOrPath || '';
  const origin = window.location.origin;
  if (!urlOrPath) return `${origin}/og-share.jpg`;
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) return urlOrPath;
  return `${origin}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
}

export function buildBreadcrumbJsonLd(items = []) {
  if (typeof window === 'undefined' || !items.length) return null;
  const origin = window.location.origin;
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `${origin}${item.path}`,
    })),
  };
}

function buildDefaultJsonLd(matched, origin, canonicalUrl) {
  const baseGraph = [
    {
      '@type': 'Organization',
      name: 'BizTrade Africa',
      alternateName: ['BizTrade', 'BTA', 'BizFlow Africa'],
      url: origin,
      logo: `${origin}/favicon.svg`,
      description:
        'All-in-one business management platform for African retail, wholesale, and multi-branch enterprises.',
    },
    {
      '@type': 'WebSite',
      name: 'BizTrade Africa',
      alternateName: ['BizTrade', 'BTA'],
      url: origin,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${origin}/businesses?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ];

  if (matched.match('/') || matched.match('/features') || matched.match('/pricing')) {
    baseGraph.push({
      '@type': 'SoftwareApplication',
      name: 'BizTrade Africa',
      alternateName: 'BizTrade',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: canonicalUrl,
      image: `${origin}/og-share.jpg`,
      keywords:
        'BizTrade, POS, Point of Sale, Inventory Management, Multi-Branch ERP, Payroll, Accounting, Storefront, Wholesale Marketplace, Job Vacancies',
      description: matched.description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'RWF',
      },
    });
    baseGraph.push({
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is BizTrade Africa?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'BizTrade Africa (BizTrade) is an all-in-one business ERP, POS, inventory, payroll, finance, and public marketplace platform built for African enterprises.',
          },
        },
        {
          '@type': 'Question',
          name: 'What modules are included in BizTrade Africa?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'BizTrade includes Point of Sale, multi-branch inventory and stock transfers, products, orders, supplier purchases, finance, payroll, HR recruitment, CRM, reports, and an AI business advisor.',
          },
        },
      ],
    });
  } else if (matched.schemaType) {
    baseGraph.push({
      '@type': matched.schemaType,
      name: matched.title,
      description: matched.description,
      url: canonicalUrl,
      isPartOf: { '@type': 'WebSite', url: origin },
    });
  }

  const breadcrumb = buildBreadcrumbJsonLd(matched.breadcrumb);
  if (breadcrumb) baseGraph.push(breadcrumb);

  return {
    '@context': 'https://schema.org',
    '@graph': baseGraph,
  };
}

export function setDynamicSeo({ title, description, image, imageAlt, type = 'website', structuredData, canonicalPath }) {
  if (typeof document === 'undefined') return;
  const origin = window.location.origin;
  const resolvedCanonical = canonicalPath ? `${origin}${canonicalPath}` : `${origin}${window.location.pathname}`;
  const resolvedImage = resolveAbsoluteUrl(image || '/og-share.jpg');

  if (title) {
    document.title = title;
    upsertMeta('property', 'og:title', title);
    upsertMeta('name', 'twitter:title', title);
  }
  if (description) {
    upsertMeta('name', 'description', description);
    upsertMeta('property', 'og:description', description);
    upsertMeta('name', 'twitter:description', description);
  }
  upsertMeta('property', 'og:type', type);
  upsertMeta('property', 'og:url', resolvedCanonical);
  upsertMeta('property', 'og:image', resolvedImage);
  upsertMeta('property', 'og:image:alt', imageAlt || title || 'BizTrade Africa');
  upsertMeta('name', 'twitter:image', resolvedImage);
  upsertCanonical(resolvedCanonical);

  if (structuredData) {
    setJsonLd(structuredData);
  }
}

const EXCLUDED_RECENT_PREFIXES = ['/login', '/register', '/activate-account', '/forgot-password', '/change-temporary-password', '/complete-profile', '/app/onboarding'];

function recordRecentRoute(pathname) {
  if (typeof window === 'undefined' || !pathname) return;
  if (EXCLUDED_RECENT_PREFIXES.some((p) => pathname.startsWith(p))) return;
  try {
    const raw = window.localStorage.getItem('bta_recent_routes');
    const prev = raw ? JSON.parse(raw) : [];
    const next = [pathname, ...(Array.isArray(prev) ? prev.filter((item) => item !== pathname) : [])].slice(0, 6);
    window.localStorage.setItem('bta_recent_routes', JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

const OG_LOCALES = {
  en: 'en_US',
  fr: 'fr_FR',
  rw: 'rw_RW',
};

export default function RouteSeoManager() {
  const location = useLocation();
  const { i18n } = useTranslation();
  const [navProgress, setNavProgress] = useState(0);

  useEffect(() => {
    const lang = (i18n.language || 'en').split('-')[0].toLowerCase();
    document.documentElement.lang = ['en', 'fr', 'rw'].includes(lang) ? lang : 'en';
    upsertMeta('property', 'og:locale', OG_LOCALES[lang] || 'en_US');
  }, [i18n.language]);

  useEffect(() => {
    const matched = ROUTE_SEO.find((r) => r.match(location.pathname)) || ROUTE_SEO[0];
    const origin = window.location.origin;
    const canonicalUrl = `${origin}${location.pathname}`;

    setDynamicSeo({
      title: matched.title,
      description: matched.description,
      image: '/og-share.jpg',
      imageAlt: 'BizTrade Africa commerce and multi-branch business management platform',
      structuredData: matched.indexable ? buildDefaultJsonLd(matched, origin, canonicalUrl) : null,
    });
    upsertMeta('name', 'robots', matched.indexable ? 'index, follow' : 'noindex, nofollow');
    recordRecentRoute(location.pathname);

    let scrollTimer;
    if (location.hash) {
      const targetId = location.hash.slice(1);
      let attempts = 0;
      const tryScrollToHash = () => {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (attempts < 15) {
          attempts += 1;
          scrollTimer = setTimeout(tryScrollToHash, 80);
        }
      };
      tryScrollToHash();
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    setNavProgress(70);
    const t1 = setTimeout(() => setNavProgress(100), 110);
    const t2 = setTimeout(() => setNavProgress(0), 260);
    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [location.pathname, location.hash]);

  if (navProgress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-50 h-0.5 pointer-events-none bg-transparent"
    >
      <div
        className="h-full bg-sky-600 dark:bg-sky-400 transition-[width,opacity] duration-150 ease-out"
        style={{ width: `${navProgress}%`, opacity: navProgress === 100 ? 0 : 1 }}
      />
    </div>
  );
}
