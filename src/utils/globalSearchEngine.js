export const BIZTRADE_BRAND_TERMS = [
  'biztrade',
  'biztrade africa',
  'biz trade',
  'bta',
  'bizflow',
  'bizflow africa',
  'biz',
  'trade',
];

export const BIZTRADE_DOMAIN_TERMS = [
  'pos',
  'point of sale',
  'checkout',
  'cashier',
  'receipt',
  'inventory',
  'stock',
  'warehouse',
  'products',
  'catalog',
  'sku',
  'sales',
  'invoices',
  'orders',
  'track order',
  'customers',
  'crm',
  'suppliers',
  'wholesale',
  'purchases',
  'procurement',
  'finance',
  'accounting',
  'expenses',
  'payroll',
  'salary',
  'payslip',
  'employees',
  'recruitment',
  'jobs',
  'vacancies',
  'careers',
  'branches',
  'multi-branch',
  'storefront',
  'directory',
  'marketplace',
  'reports',
  'analytics',
  'erp',
  'ai',
  'assistant',
  'rwanda',
  'kigali',
  'africa',
];

export function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeWords(value) {
  const norm = normalizeSearchText(value);
  if (!norm) return [];
  const rawTokens = norm.split(/[\s/.-]+/).filter(Boolean);
  const compact = norm.replace(/[\s/.-]+/g, '');
  if (compact && !rawTokens.includes(compact)) {
    rawTokens.push(compact);
  }
  return rawTokens;
}

// Bounded Optimal String Alignment (Damerau-Levenshtein) distance for typo tolerance
export function damerauDistance(a, b, maxDist = 2) {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
  if (a === b) return 0;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const dp = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i += 1) dp[i][0] = i;
  for (let j = 0; j <= lenB; j += 1) dp[0][j] = j;

  for (let i = 1; i <= lenA; i += 1) {
    let rowMin = maxDist + 1;
    for (let j = 1; j <= lenB; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + cost);
      }
      dp[i][j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[lenA][lenB];
}

// Ordered subsequence fuzzy match (e.g. "bztrd" -> "biztrade", "invtry" -> "inventory")
function subsequenceScore(queryToken, targetWord) {
  if (!queryToken || !targetWord || queryToken.length > targetWord.length) return 0;
  let qi = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  let consecutive = 0;
  let maxConsecutive = 0;

  for (let ti = 0; ti < targetWord.length && qi < queryToken.length; ti += 1) {
    if (targetWord[ti] === queryToken[qi]) {
      if (firstIdx === -1) firstIdx = ti;
      consecutive = ti === lastIdx + 1 ? consecutive + 1 : 1;
      if (consecutive > maxConsecutive) maxConsecutive = consecutive;
      lastIdx = ti;
      qi += 1;
    }
  }

  if (qi < queryToken.length) return 0;
  const span = lastIdx - firstIdx + 1;
  const density = queryToken.length / Math.max(span, 1);
  const startBonus = firstIdx === 0 ? 12 : 0;
  return Math.round(22 + density * 18 + maxConsecutive * 3 + startBonus);
}

export function fuzzyTokenMatchScore(token, words, fullText) {
  if (!token) return 0;
  let best = 0;

  if (fullText === token) return 150;
  if (fullText.startsWith(token)) best = Math.max(best, 120);
  else if (fullText.includes(token)) best = Math.max(best, 78);

  const allowedEdits = token.length >= 6 ? 2 : token.length >= 3 ? 1 : 0;

  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (w === token) {
      best = Math.max(best, 135);
      break;
    }
    if (w.startsWith(token)) {
      best = Math.max(best, 108);
      continue;
    }
    if (token.length >= 2 && w.includes(token)) {
      best = Math.max(best, 80);
      continue;
    }
    if (allowedEdits > 0 && w.length >= 3) {
      const dist = damerauDistance(token, w, allowedEdits);
      if (dist <= allowedEdits) {
        best = Math.max(best, dist === 1 ? 66 : 48);
        continue;
      }
      // Also check typo against prefix of a longer word (e.g. "biztrd" vs "biztrade")
      if (w.length > token.length + 1) {
        const prefDist = damerauDistance(token, w.slice(0, token.length + 1), 1);
        if (prefDist <= 1) {
          best = Math.max(best, 58);
          continue;
        }
      }
    }
    if (token.length >= 3) {
      const sub = subsequenceScore(token, w);
      if (sub > 0) best = Math.max(best, sub);
    }
  }

  return best;
}

export function detectBizTradeQueryIntent(rawQuery) {
  const tokens = tokenizeWords(rawQuery);
  if (!tokens.length) return { isBrand: false, isDomain: false, matchedTerms: [] };

  let isBrand = false;
  let isDomain = false;
  const matchedTerms = [];

  for (const tok of tokens) {
    for (const term of BIZTRADE_BRAND_TERMS) {
      const words = tokenizeWords(term);
      if (fuzzyTokenMatchScore(tok, words, term) >= 52) {
        isBrand = true;
        matchedTerms.push(term);
        break;
      }
    }
    for (const term of BIZTRADE_DOMAIN_TERMS) {
      const words = tokenizeWords(term);
      if (fuzzyTokenMatchScore(tok, words, term) >= 64) {
        isDomain = true;
        matchedTerms.push(term);
        break;
      }
    }
  }

  return { isBrand, isDomain, matchedTerms };
}

export function buildPlatformCatalog({ t, user, memberships, hasPermission, inWorkspace }) {
  const publicPages = [
    {
      id: 'page:home',
      label: `BizTrade Africa — ${t('nav.home')}`,
      sub: '/',
      to: '/',
      group: t('search.pagesGroup'),
      iconKey: 'compass',
      brandPriority: 100,
      keywords:
        'biztrade biztrade africa bta bizflow home platform erp business commerce pos inventory marketplace storefront dashboard rwanda',
    },
    {
      id: 'page:businesses',
      label: t('nav.businesses'),
      sub: '/businesses',
      to: '/businesses',
      group: t('search.pagesGroup'),
      iconKey: 'store',
      brandPriority: 88,
      keywords:
        'biztrade directory shops stores vendors wholesale marketplace storefronts catalog products kigali rwanda suppliers',
    },
    {
      id: 'page:features',
      label: t('nav.features'),
      sub: '/features',
      to: '/features',
      group: t('search.pagesGroup'),
      iconKey: 'boxes',
      brandPriority: 84,
      keywords:
        'biztrade modules 17 features pos inventory sales finance payroll orders procurement crm reports ai assistant erp',
    },
    {
      id: 'page:jobs',
      label: t('nav.jobs'),
      sub: '/jobs',
      to: '/jobs',
      group: t('search.pagesGroup'),
      iconKey: 'briefcase',
      brandPriority: 74,
      keywords: 'biztrade careers hiring vacancies jobs work employment cv resume apply',
    },
    {
      id: 'page:pricing',
      label: t('nav.pricing'),
      sub: '/pricing',
      to: '/pricing',
      group: t('search.pagesGroup'),
      iconKey: 'credit-card',
      brandPriority: 72,
      keywords: 'biztrade plans subscription price cost rwf monthly annual enterprise starter growth',
    },
    {
      id: 'page:track',
      label: t('nav.trackOrder'),
      sub: '/track-order',
      to: '/track-order',
      group: t('search.pagesGroup'),
      iconKey: 'shopping-bag',
      brandPriority: 64,
      keywords: 'biztrade track order status delivery shipment receipt tracking number',
    },
    {
      id: 'page:about',
      label: t('nav.about'),
      sub: '/about',
      to: '/about',
      group: t('search.pagesGroup'),
      iconKey: 'building',
      brandPriority: 68,
      keywords: 'biztrade africa bta mission company platform overview about',
    },
    {
      id: 'page:contact',
      label: t('nav.contact'),
      sub: '/contact',
      to: '/contact',
      group: t('search.pagesGroup'),
      iconKey: 'bell',
      brandPriority: 60,
      keywords: 'biztrade support onboarding help email whatsapp phone demo contact',
    },
  ];

  if (!user) return publicPages;

  const workspacePages = [
    {
      to: '/app/dashboard',
      label: t('nav.dashboard'),
      perm: 'dashboard.view',
      iconKey: 'dashboard',
      brandPriority: 96,
      keywords: 'biztrade workspace dashboard overview kpi revenue analytics summary home',
    },
    {
      to: '/app/pos',
      label: t('nav.pos'),
      perm: 'pos.sell',
      iconKey: 'shopping-cart',
      brandPriority: 90,
      keywords: 'biztrade pos point of sale checkout cashier receipt barcode sell cart',
    },
    {
      to: '/app/products',
      label: t('nav.products'),
      perm: 'products.view',
      iconKey: 'package',
      brandPriority: 82,
      keywords: 'biztrade products catalog sku items pricing import csv excel',
    },
    {
      to: '/app/inventory',
      label: t('nav.inventory'),
      perm: 'inventory.view',
      iconKey: 'boxes',
      brandPriority: 82,
      keywords: 'biztrade inventory stock warehouse quantity transfers low stock valuation',
    },
    {
      to: '/app/sales',
      label: t('nav.sales'),
      perm: 'sales.view',
      iconKey: 'receipt',
      brandPriority: 78,
      keywords: 'biztrade sales invoices receipts revenue transactions payments',
    },
    {
      to: '/app/orders',
      label: t('nav.orders'),
      perm: 'orders.view',
      iconKey: 'shopping-bag',
      brandPriority: 78,
      keywords: 'biztrade orders online fulfillment delivery dispatch',
    },
    {
      to: '/app/customers',
      label: t('nav.customers'),
      perm: 'customers.view',
      iconKey: 'users',
      brandPriority: 74,
      keywords: 'biztrade customers clients buyers crm receivables debt loyalty',
    },
    {
      to: '/app/suppliers',
      label: t('nav.suppliers'),
      perm: 'suppliers.view',
      iconKey: 'truck',
      brandPriority: 72,
      keywords: 'biztrade suppliers vendors wholesale sourcing procurement',
    },
    {
      to: '/app/purchases',
      label: t('nav.purchases'),
      perm: 'purchases.view',
      iconKey: 'credit-card',
      brandPriority: 70,
      keywords: 'biztrade purchases restock purchase orders bills payables',
    },
    {
      to: '/app/finance',
      label: t('nav.finance'),
      perm: 'finance.view',
      iconKey: 'wallet',
      brandPriority: 76,
      keywords: 'biztrade finance accounting expenses cashflow profit balance',
    },
    {
      to: '/app/payroll',
      label: t('nav.payroll'),
      perm: 'payroll.view',
      iconKey: 'banknote',
      brandPriority: 74,
      keywords: 'biztrade payroll salary wages staff pay disbursement',
    },
    {
      to: '/app/my-payroll',
      label: t('nav.myPayroll'),
      perm: null,
      requiresMember: true,
      iconKey: 'banknote',
      brandPriority: 64,
      keywords: 'biztrade payslip my payroll salary compensation',
    },
    {
      to: '/app/employees',
      label: t('nav.employees'),
      perm: 'employees.view',
      iconKey: 'users',
      brandPriority: 70,
      keywords: 'biztrade employees hr staff team roles permissions',
    },
    {
      to: '/app/recruitment',
      label: t('nav.recruitment'),
      perm: 'recruitment.view',
      iconKey: 'briefcase',
      brandPriority: 68,
      keywords: 'biztrade recruitment hiring jobs candidates applicants',
    },
    {
      to: '/app/branches',
      label: t('nav.branches'),
      perm: 'branches.view',
      iconKey: 'git-branch',
      brandPriority: 70,
      keywords: 'biztrade branches locations shops warehouses multi branch',
    },
    {
      to: '/app/ads',
      label: t('nav.ads'),
      perm: 'ads.view',
      iconKey: 'video',
      brandPriority: 64,
      keywords: 'biztrade ads videos promotions marketing showcase',
    },
    {
      to: '/app/tasks',
      label: t('nav.tasks'),
      perm: 'tasks.view',
      iconKey: 'clipboard',
      brandPriority: 68,
      keywords: 'biztrade tasks todo team chat messaging collaboration',
    },
    {
      to: '/app/reports',
      label: t('nav.reports'),
      perm: 'reports.view',
      iconKey: 'file-spreadsheet',
      brandPriority: 74,
      keywords: 'biztrade reports analytics export financial statements',
    },
    {
      to: '/app/ai',
      label: t('nav.ai'),
      perm: 'ai.use',
      iconKey: 'bot',
      brandPriority: 74,
      keywords: 'biztrade ai assistant gemini chatbot advisor market research search',
    },
    {
      to: '/app/notifications',
      label: t('nav.notifications'),
      perm: null,
      iconKey: 'bell',
      brandPriority: 58,
      keywords: 'biztrade notifications alerts updates inbox',
    },
    {
      to: '/app/settings',
      label: t('nav.settings'),
      perm: null,
      iconKey: 'settings',
      brandPriority: 60,
      keywords: 'biztrade settings profile account security password theme language',
    },
  ]
    .filter((item) => {
      if (!(memberships?.length > 0 || user?.is_platform_admin)) return false;
      if (item.requiresMember && (!memberships || memberships.length === 0)) return false;
      return !item.perm || hasPermission(item.perm);
    })
    .map((item) => ({
      id: `app:${item.to}`,
      label: item.label,
      sub: item.to,
      to: item.to,
      group: t('search.workspaceGroup'),
      iconKey: item.iconKey,
      brandPriority: item.brandPriority,
      keywords: item.keywords,
    }));

  if (user?.is_platform_admin) {
    workspacePages.unshift({
      id: 'app:/app/admin',
      label: t('nav.admin'),
      sub: '/app/admin',
      to: '/app/admin',
      group: t('search.workspaceGroup'),
      iconKey: 'shield-check',
      brandPriority: 92,
      keywords: 'biztrade super admin governance qa monitoring platform config',
    });
  }

  const portalPage = {
    id: 'page:customer',
    label: t('nav.customerPortal'),
    sub: '/customer',
    to: '/customer',
    group: t('search.pagesGroup'),
    iconKey: 'users',
    brandPriority: 76,
    keywords: 'biztrade customer portal my orders applications wishlist reviews profile',
  };

  return inWorkspace ? [...workspacePages, portalPage, ...publicPages] : [portalPage, ...workspacePages, ...publicPages];
}

export function rankSearchCatalog(items, rawQuery, limit = 8, inWorkspace = false) {
  const normQ = normalizeSearchText(rawQuery);
  if (!normQ) return [];

  const tokens = normQ.split(/\s+/).filter(Boolean);
  const { isBrand, isDomain } = detectBizTradeQueryIntent(normQ);

  const scored = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const labelNorm = normalizeSearchText(item.label);
    const subNorm = normalizeSearchText(item.sub);
    const kwNorm = normalizeSearchText(item.keywords);

    const labelWords = tokenizeWords(labelNorm);
    const subWords = tokenizeWords(subNorm);
    const kwWords = tokenizeWords(kwNorm);

    let totalScore = 0;
    let matchedTokens = 0;

    for (const tok of tokens) {
      const sLabel = fuzzyTokenMatchScore(tok, labelWords, labelNorm);
      const sSub = fuzzyTokenMatchScore(tok, subWords, subNorm) * 0.75;
      const sKw = fuzzyTokenMatchScore(tok, kwWords, kwNorm) * 0.85;
      const tokBest = Math.max(sLabel, sSub, sKw);
      if (tokBest >= 24) {
        matchedTokens += 1;
        totalScore += tokBest;
      }
    }

    if (matchedTokens === 0) continue;

    // Require high coverage on multi-word queries, while staying forgiving for fuzzy single/multi tokens
    const coverage = matchedTokens / tokens.length;
    if (tokens.length > 1 && coverage < 0.5) continue;

    let finalScore = totalScore * (0.6 + 0.4 * coverage);

    // Keyword prioritization for BizTrade-related terms
    const priorityWeight = item.brandPriority || 50;
    if (isBrand) {
      finalScore += priorityWeight * 1.15;
    } else if (isDomain) {
      finalScore += priorityWeight * 0.45;
      if (inWorkspace && String(item.id || '').startsWith('app:')) {
        finalScore += 22;
      }
    } else {
      finalScore += priorityWeight * 0.1;
      if (inWorkspace && String(item.id || '').startsWith('app:')) {
        finalScore += 12;
      }
    }

    scored.push({
      item: { ...item, _score: Math.round(finalScore) },
      score: finalScore,
      order: i,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, limit).map((entry) => entry.item);
}

export function rankLiveResults(items, rawQuery) {
  const normQ = normalizeSearchText(rawQuery);
  if (!normQ || !items?.length) return items || [];

  const tokens = normQ.split(/\s+/).filter(Boolean);
  const { isBrand } = detectBizTradeQueryIntent(normQ);

  return items
    .map((item, idx) => {
      const labelNorm = normalizeSearchText(item.label);
      const subNorm = normalizeSearchText(item.sub);
      const labelWords = tokenizeWords(labelNorm);
      const subWords = tokenizeWords(subNorm);

      let score = 0;
      for (const tok of tokens) {
        score += Math.max(
          fuzzyTokenMatchScore(tok, labelWords, labelNorm),
          fuzzyTokenMatchScore(tok, subWords, subNorm) * 0.7
        );
      }
      if (isBrand && labelNorm.includes('biztrade')) {
        score += 120;
      }
      return { item: { ...item, _score: Math.round(score) }, score, idx };
    })
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((entry) => entry.item);
}

export function splitHighlightSegments(text, rawQuery) {
  const str = String(text || '');
  const tokens = Array.from(
    new Set(
      normalizeSearchText(rawQuery)
        .split(/\s+/)
        .filter((t) => t.length >= 2)
    )
  ).sort((a, b) => b.length - a.length);

  if (!tokens.length || !str) return [{ text: str, match: false }];

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'ig');
  const parts = str.split(regex);
  return parts
    .filter((p) => p.length > 0)
    .map((p) => ({
      text: p,
      match: tokens.some((t) => p.toLowerCase() === t),
    }));
}
