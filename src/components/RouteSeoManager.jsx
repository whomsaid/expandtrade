import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const ROUTE_SEO = [
  {
    match: (p) => p === '/',
    title: 'BizTrade Africa — Expand Your Business. Manage Everything.',
    description:
      'All-in-one business management platform for African commerce: POS, inventory, sales, orders, finance, payroll, and business directory.',
    indexable: true,
  },
  {
    match: (p) => p === '/businesses',
    title: 'Business Directory — Browse Verified Businesses | BizTrade Africa',
    description:
      'Search verified businesses, retail stores, wholesale suppliers, product catalogs, and promo showcases across Africa on BizTrade Africa.',
    indexable: true,
  },
  {
    match: (p) => p.startsWith('/businesses/'),
    title: 'Business Catalog & Storefront | BizTrade Africa',
    description: 'Explore products, branches, customer reviews, open jobs, and place orders directly on BizTrade Africa.',
    indexable: true,
  },
  {
    match: (p) => p === '/jobs',
    title: 'Careers & Open Job Vacancies | BizTrade Africa',
    description: 'Discover active job opportunities across growing African businesses and apply online through BizTrade Africa.',
    indexable: true,
  },
  {
    match: (p) => p.startsWith('/jobs/'),
    title: 'Job Vacancy Details | BizTrade Africa',
    description: 'Review job requirements, location, employment type, and submit your application on BizTrade Africa.',
    indexable: true,
  },
  {
    match: (p) => p === '/features',
    title: 'Platform Features — 17 Integrated Business Modules | BizTrade Africa',
    description: 'Explore Point of Sale, multi-branch inventory, CRM, purchases, payroll, finance, tasks, and analytics in BizTrade Africa.',
    indexable: true,
  },
  {
    match: (p) => p === '/pricing',
    title: 'Subscription Plans & Pricing | BizTrade Africa',
    description: 'Transparent monthly and annual business plans designed for startups, retail shops, and multi-branch enterprises.',
    indexable: true,
  },
  {
    match: (p) => p === '/about',
    title: 'About BizTrade Africa — Engineering & Vision',
    description: 'Learn about BizTrade Africa (BTA), built by softworld to empower African enterprises with reliable commerce tooling.',
    indexable: true,
  },
  {
    match: (p) => p === '/contact',
    title: 'Contact & Business Onboarding | BizTrade Africa',
    description: 'Reach BizTrade Africa for business onboarding, enterprise support, or partnership inquiries.',
    indexable: true,
  },
  {
    match: (p) => p === '/track-order',
    title: 'Track Customer Order Status | BizTrade Africa',
    description: 'Check live fulfillment updates and delivery timeline for your BizTrade Africa order number.',
    indexable: true,
  },
  {
    match: (p) => p === '/terms',
    title: 'Terms of Service | BizTrade Africa',
    description: 'Review the BizTrade Africa platform Terms of Service.',
    indexable: true,
  },
  {
    match: (p) => p === '/privacy',
    title: 'Privacy Policy | BizTrade Africa',
    description: 'Read how BizTrade Africa protects user, business, and transaction data.',
    indexable: true,
  },
  {
    match: (p) => p === '/login',
    title: 'Sign In | BizTrade Africa',
    description: 'Sign in to your BizTrade Africa workspace or customer account.',
    indexable: false,
  },
  {
    match: (p) => p === '/register',
    title: 'Create Account | BizTrade Africa',
    description: 'Register a verified BizTrade Africa account to shop, track orders, and apply for jobs.',
    indexable: false,
  },
  {
    match: (p) => p.startsWith('/customer'),
    title: 'Customer Portal | BizTrade Africa',
    description: 'Manage your orders, job applications, reviews, and profile settings on BizTrade Africa.',
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

export function setDynamicSeo({ title, description }) {
  if (typeof document === 'undefined') return;
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
}

export default function RouteSeoManager() {
  const location = useLocation();
  const [navProgress, setNavProgress] = useState(0);

  useEffect(() => {
    const matched = ROUTE_SEO.find((r) => r.match(location.pathname)) || ROUTE_SEO[0];
    const canonicalUrl = `${window.location.origin}${location.pathname}`;
    setDynamicSeo({ title: matched.title, description: matched.description });
    upsertCanonical(canonicalUrl);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('name', 'robots', matched.indexable ? 'index, follow' : 'noindex, nofollow');

    if (!location.hash) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    setNavProgress(70);
    const t1 = setTimeout(() => setNavProgress(100), 110);
    const t2 = setTimeout(() => setNavProgress(0), 260);
    return () => {
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
