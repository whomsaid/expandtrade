import { queryOne } from '../config/db.js';
import { getCached, setCached } from './cacheService.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveOrigin(req) {
  const configured = String(process.env.APP_URL || '').trim();
  if (configured && !configured.includes('localhost')) {
    return configured.replace(/\/$/, '');
  }
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || 'localhost:3000').split(',')[0].trim();
  return `${proto}://${host}`.replace(/\/$/, '');
}

const STATIC_ROUTE_META = [
  {
    match: (p) => p === '/',
    title: 'BizTrade Africa — Business POS, Inventory & Commerce',
    description:
      'Manage POS sales, multi-branch inventory, orders, payroll, finance, and public storefronts in one fast BizTrade Africa workspace.',
    indexable: true,
  },
  {
    match: (p) => p === '/businesses',
    title: 'BizTrade Africa — Verified Business Directory',
    description:
      'Browse verified stores, wholesale suppliers, product catalogs, and video showcases across Africa on BizTrade Africa.',
    indexable: true,
  },
  {
    match: (p) => p === '/jobs',
    title: 'BizTrade Africa — Careers & Open Job Vacancies',
    description:
      'Explore verified career openings across growing African businesses and submit your CV and application online on BizTrade Africa.',
    indexable: true,
  },
  {
    match: (p) => p === '/features',
    title: 'BizTrade Africa — 17 Business ERP & POS Modules',
    description:
      'Discover POS checkout, stock transfers, supplier purchases, payroll, finance, CRM, and analytics built for African businesses.',
    indexable: true,
  },
  {
    match: (p) => p === '/pricing',
    title: 'BizTrade Africa — Plans & Transparent Pricing',
    description:
      'Compare monthly and annual BizTrade Africa plans built for solo shops, growing teams, and multi-branch enterprises.',
    indexable: true,
  },
  {
    match: (p) => p === '/about',
    title: 'BizTrade Africa — Platform, Mission & About',
    description:
      'Learn how BizTrade Africa empowers African enterprises with multi-branch operations, customer discovery, and reliable commerce.',
    indexable: true,
  },
  {
    match: (p) => p === '/contact',
    title: 'BizTrade Africa — Contact & Onboarding Support',
    description:
      'Request business onboarding, enterprise support, or partnership guidance from the BizTrade Africa team.',
    indexable: true,
  },
  {
    match: (p) => p === '/track-order',
    title: 'BizTrade Africa — Track Customer Order Status',
    description:
      'Look up real-time order confirmation, fulfillment progress, and delivery timeline updates on BizTrade Africa.',
    indexable: true,
  },
  {
    match: (p) => p === '/terms',
    title: 'BizTrade Africa — Terms of Service',
    description:
      'Review the terms governing businesses, customers, and platform usage on BizTrade Africa.',
    indexable: true,
  },
  {
    match: (p) => p === '/privacy',
    title: 'BizTrade Africa — Privacy Policy',
    description:
      'Learn how BizTrade Africa protects personal data, business records, and customer transaction privacy.',
    indexable: true,
  },
];

async function resolveRouteSeo(req, origin) {
  const pathname = req.path || '/';
  const canonical = `${origin}${pathname}`;

  const bizMatch = pathname.match(/^\/businesses\/([^/]+)$/);
  if (bizMatch) {
    const slug = decodeURIComponent(bizMatch[1]);
    const cacheKey = `seo:meta:biz:${slug}:${origin}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const b = await queryOne(
        `SELECT name, category, description, logo_url, country, district, physical_address, phone, email
         FROM businesses
         WHERE slug = ? AND status = 'active' AND is_public_listed = 1 AND deleted_at IS NULL`,
        [slug]
      );
      if (b) {
        const image = b.logo_url
          ? (b.logo_url.startsWith('http') ? b.logo_url : `${origin}${b.logo_url}`)
          : `${origin}/og-share.jpg`;
        const meta = {
          title: `${b.name} — ${b.category} | BizTrade Africa`.slice(0, 60),
          description: (
            b.description ||
            `Shop products, explore branches, and contact ${b.name} in ${b.district || ''}, ${b.country || 'Africa'} on BizTrade Africa.`
          ).slice(0, 160),
          canonical,
          image,
          indexable: true,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: b.name,
            description: b.description || `${b.name} on BizTrade Africa`,
            url: canonical,
            image,
            telephone: b.phone || undefined,
            email: b.email || undefined,
            address: {
              '@type': 'PostalAddress',
              streetAddress: b.physical_address || undefined,
              addressLocality: b.district || undefined,
              addressCountry: b.country || 'RW',
            },
          },
        };
        setCached(cacheKey, meta, 60_000);
        return meta;
      }
    } catch {
      // fallback below
    }
  }

  const jobMatch = pathname.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const param = decodeURIComponent(jobMatch[1]);
    const numericId = Number(param);
    const cacheKey = `seo:meta:job:${param}:${origin}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const j = await queryOne(
        `SELECT v.id, v.title, v.summary, v.description, v.location, v.employment_type, v.work_mode,
                v.published_at, v.created_at, v.application_deadline,
                b.name AS business_name, b.slug AS business_slug, b.logo_url AS business_logo, b.country AS business_country
         FROM job_vacancies v
         JOIN businesses b ON b.id = v.business_id
         WHERE ${!Number.isNaN(numericId) && numericId > 0 ? 'v.id = ?' : 'v.slug = ?'}
           AND v.status = 'published' AND b.status = 'active' AND b.is_public_listed = 1 AND b.deleted_at IS NULL`,
        [!Number.isNaN(numericId) && numericId > 0 ? numericId : param]
      );
      if (j) {
        const empMap = {
          full_time: 'FULL_TIME',
          part_time: 'PART_TIME',
          contract: 'CONTRACTOR',
          internship: 'INTERN',
          temporary: 'TEMPORARY',
        };
        const image = j.business_logo
          ? (j.business_logo.startsWith('http') ? j.business_logo : `${origin}${j.business_logo}`)
          : `${origin}/og-share.jpg`;
        const meta = {
          title: `${j.title} — ${j.business_name} | BizTrade Africa`.slice(0, 60),
          description: (
            j.summary ||
            `Apply for ${j.title} at ${j.business_name} in ${j.location || 'Africa'}. Submit your CV and application on BizTrade Africa.`
          ).slice(0, 160),
          canonical,
          image,
          indexable: true,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'JobPosting',
            title: j.title,
            description: j.summary || j.description || j.title,
            datePosted: String(j.published_at || j.created_at || new Date().toISOString()).slice(0, 10),
            validThrough: j.application_deadline ? String(j.application_deadline).slice(0, 10) : undefined,
            employmentType: empMap[j.employment_type] || 'FULL_TIME',
            hiringOrganization: {
              '@type': 'Organization',
              name: j.business_name,
              sameAs: `${origin}/businesses/${j.business_slug}`,
            },
            jobLocation: {
              '@type': 'Place',
              address: {
                '@type': 'PostalAddress',
                addressLocality: j.location || undefined,
                addressCountry: j.business_country || 'RW',
              },
            },
          },
        };
        setCached(cacheKey, meta, 60_000);
        return meta;
      }
    } catch {
      // fallback below
    }
  }

  const staticMatch = STATIC_ROUTE_META.find((r) => r.match(pathname));
  if (staticMatch) {
    return {
      ...staticMatch,
      canonical,
      image: `${origin}/og-share.jpg`,
      jsonLd: null,
    };
  }

  const isPrivate = pathname.startsWith('/app') || pathname.startsWith('/customer') || pathname.startsWith('/login') || pathname.startsWith('/register');
  return {
    title: isPrivate ? 'Workspace | BizTrade Africa' : 'BizTrade Africa — Business POS, Inventory & Commerce',
    description:
      'Manage POS sales, multi-branch inventory, orders, payroll, finance, and public storefronts in one fast BizTrade Africa workspace.',
    canonical,
    image: `${origin}/og-share.jpg`,
    indexable: !isPrivate,
    jsonLd: null,
  };
}

export async function injectServerSideSeo(req, rawHtml) {
  try {
    const origin = resolveOrigin(req);
    const meta = await resolveRouteSeo(req, origin);
    const safeTitle = escapeHtml(meta.title);
    const safeDesc = escapeHtml(meta.description);
    const safeCanon = escapeHtml(meta.canonical);
    const safeImg = escapeHtml(meta.image);
    const robots = meta.indexable ? 'index, follow' : 'noindex, nofollow';

    let html = rawHtml
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
      .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${safeDesc}" />`)
      .replace(/<meta\s+name="robots"[^>]*>/i, `<meta name="robots" content="${robots}" />`)
      .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${safeTitle}" />`)
      .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${safeDesc}" />`)
      .replace(/<meta\s+property="og:image"[^>]*>/i, `<meta property="og:image" content="${safeImg}" />`)
      .replace(/<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${safeTitle}" />`)
      .replace(/<meta\s+name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${safeDesc}" />`)
      .replace(/<meta\s+name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${safeImg}" />`);

    const canonicalTag = `<link rel="canonical" href="${safeCanon}" />\n    <meta property="og:url" content="${safeCanon}" />`;
    html = html.replace('</head>', `    ${canonicalTag}\n  </head>`);

    if (meta.jsonLd) {
      const jsonStr = JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c');
      html = html.replace(
        /<script\s+id="bta-seo-jsonld"\s+type="application\/ld\+json">[\s\S]*?<\/script>/i,
        `<script id="bta-seo-jsonld" type="application/ld+json">${jsonStr}</script>`
      );
    }

    return html;
  } catch {
    return rawHtml;
  }
}
