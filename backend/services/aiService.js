import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { query, queryOne } from '../config/db.js';

export const ALLOWED_CHAT_MODELS = {
  'gemini-4-hydrogen': {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    tier: 'general',
    supportsSearchGrounding: true,
  },
  'gemini-3.1-flash-lite': {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    tier: 'fast',
    supportsSearchGrounding: false,
  },
};

export const CHAT_ROLE_PRESETS = {
  business_advisor: {
    id: 'business_advisor',
    instruction:
      'You are the BizTrade Africa Executive Business Advisor. Help managers and owners interpret live sales, inventory, branches, expenses, and customer receivables. Clearly separate ACTUAL DATABASE METRICS from ESTIMATES or RECOMMENDATIONS. Never invent missing figures, and format amounts in the business currency.',
  },
  market_researcher: {
    id: 'market_researcher',
    instruction:
      'You are the BizTrade Africa Market & Pricing Researcher. Combine live Google Search web findings (when enabled) with the business profile to advise on East African & global market prices, exchange rates, taxes/compliance, supplier trends, and competitive positioning. Cite verifiable context concisely.',
  },
  operations_analyst: {
    id: 'operations_analyst',
    instruction:
      'You are the BizTrade Africa Inventory & Operations Analyst. Focus on SKU stock health, reorder priorities, branch performance balance, supplier purchasing discipline, and operating expense efficiency based strictly on the authorized metrics provided.',
  },
  quick_helper: {
    id: 'quick_helper',
    instruction:
      'You are the BizTrade Africa Quick Operations Assistant. Give concise, immediate answers for product copywriting, customer messages, margin calculations, and day-to-day store tasks.',
  },
};

function getGeminiClient() {
  const apiKey = String(process.env.GEMINI_API_KEY || env.geminiApiKey || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function mapGeminiUpstreamError(err) {
  const raw = String(err?.message || err || '');
  const status = Number(err?.status || err?.code || 0);

  if (raw === 'AI_UPSTREAM_TIMEOUT') {
    return createHttpError(504, 'The Gemini request took too long to respond. Please try a shorter prompt or retry.');
  }
  if (status === 403 || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || (status === 400 && raw.toLowerCase().includes('api key'))) {
    return createHttpError(400, 'Gemini API key is missing or invalid. Please verify GEMINI_API_KEY in Settings > Secrets.');
  }
  if (status === 429 || raw.includes('RESOURCE_EXHAUSTED')) {
    return createHttpError(429, 'Gemini API quota reached. Wait briefly or configure a billing-enabled API key in Settings > Secrets.');
  }
  if (status === 404 || raw.includes('NOT_FOUND')) {
    return createHttpError(404, 'The selected Gemini model is currently unavailable for this API key.');
  }
  return createHttpError(502, raw || 'Unable to complete the Gemini request right now.');
}

function extractGroundingMetadata(response) {
  const metadata = response?.candidates?.[0]?.groundingMetadata;
  const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
  const seen = new Set();
  const sources = [];

  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({
      title: String(chunk?.web?.title || uri),
      uri: String(uri),
    });
  }

  const searchQueries = Array.isArray(metadata?.webSearchQueries)
    ? metadata.webSearchQueries.map((q) => String(q)).filter(Boolean)
    : [];

  return { sources, searchQueries };
}

async function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('AI_UPSTREAM_TIMEOUT')), timeoutMs)),
  ]);
}

async function callWithRetry(fn, retries = 1) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || '');
      const status = Number(err?.status || 0);
      const retryable = msg === 'AI_UPSTREAM_TIMEOUT' || status === 503 || status === 500;
      if (!retryable || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function loadAuthorizedBusinessContext({ businessId, branchId, allBranchesAccess, businessName, currencyCode }) {
  const branchFilter = !allBranchesAccess && branchId ? ' AND branch_id = ?' : '';
  const branchParams = !allBranchesAccess && branchId ? [businessId, branchId] : [businessId];

  const [todaySales, monthSales, topProducts, lowStock, branchPerf, expenses, receivables] = await Promise.all([
    queryOne(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total, COALESCE(SUM(amount_paid), 0) AS collected
       FROM sales WHERE business_id = ? AND sale_status != 'cancelled' AND date(created_at) = date('now')${branchFilter}`,
      branchParams
    ),
    queryOne(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
       FROM sales WHERE business_id = ? AND sale_status != 'cancelled' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')${branchFilter}`,
      branchParams
    ),
    query(
      `SELECT si.product_name, SUM(si.quantity) AS qty_sold, SUM(si.line_total) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.business_id = ? AND s.sale_status != 'cancelled'${!allBranchesAccess && branchId ? ' AND s.branch_id = ?' : ''}
       GROUP BY si.product_id, si.product_name
       ORDER BY qty_sold DESC LIMIT 5`,
      branchParams
    ),
    query(
      `SELECT p.name, p.sku, b.name AS branch_name, i.quantity, p.min_stock
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       JOIN branches b ON b.id = i.branch_id
       WHERE i.business_id = ? AND p.status = 'active' AND i.quantity <= p.min_stock${!allBranchesAccess && branchId ? ' AND i.branch_id = ?' : ''}
       ORDER BY i.quantity ASC LIMIT 10`,
      branchParams
    ),
    allBranchesAccess
      ? query(
          `SELECT b.name, COUNT(s.id) AS sales_count, COALESCE(SUM(s.total_amount), 0) AS revenue
           FROM branches b
           LEFT JOIN sales s ON s.branch_id = b.id AND s.business_id = ? AND s.sale_status != 'cancelled'
           WHERE b.business_id = ?
           GROUP BY b.id, b.name
           ORDER BY revenue DESC`,
          [businessId, businessId]
        )
      : Promise.resolve([]),
    query(
      `SELECT category_name, COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE business_id = ? AND approval_status = 'approved'${branchFilter}
       GROUP BY category_name
       ORDER BY total DESC LIMIT 5`,
      branchParams
    ),
    queryOne(
      `SELECT COALESCE(SUM(outstanding_balance), 0) AS customer_debt FROM customers WHERE business_id = ?`,
      [businessId]
    ),
  ]);

  return {
    business_name: businessName,
    currency: currencyCode || 'RWF',
    scope: allBranchesAccess ? 'All branches' : `Assigned branch #${branchId}`,
    actual_database_metrics: {
      sales_today: todaySales,
      sales_this_month: monthSales,
      top_selling_products: topProducts,
      low_or_out_of_stock_items: lowStock,
      branch_performance: branchPerf,
      approved_expenses_by_category: expenses,
      total_customer_receivables: receivables?.customer_debt || 0,
    },
  };
}

export async function queryBusinessAssistant({ businessId, branchId, allBranchesAccess, userPrompt, businessName, currencyCode, useSearch = false }) {
  const groundedContext = await loadAuthorizedBusinessContext({
    businessId,
    branchId,
    allBranchesAccess,
    businessName,
    currencyCode,
  });

  const ai = getGeminiClient();
  if (!ai) {
    throw createHttpError(503, 'Gemini API key is not configured. Add GEMINI_API_KEY in Settings > Secrets to enable AI assistance.');
  }

  try {
    const config = {
      systemInstruction:
        'You are the BizTrade Africa Business Assistant. Answer using the provided authorized database JSON. ' +
        'Clearly distinguish ACTUAL DATABASE RESULTS from ESTIMATES or RECOMMENDATIONS. ' +
        'Never invent figures that are not in the JSON; if data is missing or zero, state that explicitly. ' +
        'Format currency clearly in the business currency (default RWF). Keep answers concise, executive, and actionable.',
      ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
    };

    const response = await callWithRetry(() =>
      withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Authorized Business Data JSON:\n${JSON.stringify(groundedContext, null, 2)}\n\nUser Question: ${userPrompt}`,
          config,
        }),
        20000
      )
    );

    const { sources, searchQueries } = extractGroundingMetadata(response);
    return {
      provider: 'gemini-4-hydrogen',
      model: 'gemini-4-hydrogen',
      answer: response.text || 'No response text was returned by the model.',
      groundingSources: sources,
      searchQueries,
      groundedContext,
    };
  } catch (err) {
    throw mapGeminiUpstreamError(err);
  }
}

export async function chatWithBusinessAssistant({
  businessId,
  branchId,
  allBranchesAccess,
  businessName,
  currencyCode,
  message,
  history = [],
  rolePreset = 'business_advisor',
  customSystemInstruction = '',
  model = 'gemini-4-hydrogen',
  useSearch = false,
}) {
  if (!ALLOWED_CHAT_MODELS[model]) {
    throw createHttpError(
      400,
      'Selected model is not enabled. Use gemini-4-hydrogen or gemini-3.1-flash-lite, or configure a paid API key in Settings > Secrets for paid-tier models.'
    );
  }

  const ai = getGeminiClient();
  if (!ai) {
    throw createHttpError(503, 'Gemini API key is not configured. Add GEMINI_API_KEY in Settings > Secrets to use the Gemini chatbot.');
  }

  const groundedContext = await loadAuthorizedBusinessContext({
    businessId,
    branchId,
    allBranchesAccess,
    businessName,
    currencyCode,
  });

  // Search Grounding requires gemini-4-hydrogen
  const resolvedModel = useSearch ? 'gemini-4-hydrogen' : model;
  const preset = CHAT_ROLE_PRESETS[rolePreset] || CHAT_ROLE_PRESETS.business_advisor;
  const extraRole = String(customSystemInstruction || '').trim().slice(0, 600);

  const systemInstruction = [
    preset.instruction,
    extraRole ? `Custom role guidance: ${extraRole}` : '',
    `Authorized Live Business Context (${businessName}, currency ${groundedContext.currency}, scope ${groundedContext.scope}):\n${JSON.stringify(groundedContext.actual_database_metrics)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const sanitizedHistory = (Array.isArray(history) ? history : [])
    .slice(-20)
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'model' || turn.role === 'assistant') && typeof turn.text === 'string' && turn.text.trim())
    .map((turn) => ({
      role: turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.text.trim().slice(0, 8000) }],
    }));

  try {
    const chat = ai.chats.create({
      model: resolvedModel,
      history: sanitizedHistory,
      config: {
        systemInstruction,
        ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });

    const response = await callWithRetry(() =>
      withTimeout(chat.sendMessage({ message: String(message).trim() }), 25000)
    );

    const { sources, searchQueries } = extractGroundingMetadata(response);
    return {
      provider: resolvedModel,
      model: resolvedModel,
      rolePreset: preset.id,
      searchGrounded: Boolean(useSearch),
      answer: response.text || 'No response text was returned by the model.',
      groundingSources: sources,
      searchQueries,
    };
  } catch (err) {
    throw mapGeminiUpstreamError(err);
  }
}

export async function searchGroundedQuery({
  queryText,
  businessName,
  country = 'Rwanda',
  currencyCode = 'RWF',
}) {
  const ai = getGeminiClient();
  if (!ai) {
    throw createHttpError(503, 'Gemini API key is not configured. Add GEMINI_API_KEY in Settings > Secrets to use live Google Search grounding.');
  }

  try {
    const response = await callWithRetry(() =>
      withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: String(queryText).trim(),
          config: {
            systemInstruction:
              `You are a real-time market & business intelligence researcher assisting ${businessName || 'a BizTrade Africa business'} operating in ${country} (currency ${currencyCode}). ` +
              'Use Google Search grounding to retrieve up-to-date, accurate facts, prices, market conditions, exchange rates, or regulations. ' +
              'Be concise, cite dates/numbers when available, and summarize key takeaways clearly.',
            tools: [{ googleSearch: {} }],
          },
        }),
        25000
      )
    );

    const { sources, searchQueries } = extractGroundingMetadata(response);
    return {
      provider: 'gemini-4-hydrogen',
      model: 'gemini-4-hydrogen',
      answer: response.text || 'No grounded results were returned.',
      groundingSources: sources,
      searchQueries,
    };
  } catch (err) {
    throw mapGeminiUpstreamError(err);
  }
}
