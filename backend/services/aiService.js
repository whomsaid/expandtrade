import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { query, queryOne } from '../config/db.js';

export async function queryBusinessAssistant({ businessId, branchId, allBranchesAccess, userPrompt, businessName, currencyCode }) {
  const branchFilter = !allBranchesAccess && branchId ? ' AND branch_id = ?' : '';
  const branchParams = !allBranchesAccess && branchId ? [businessId, branchId] : [businessId];

  const todaySales = await queryOne(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total, COALESCE(SUM(amount_paid), 0) AS collected
     FROM sales WHERE business_id = ? AND sale_status != 'cancelled' AND date(created_at) = date('now')${branchFilter}`,
    branchParams
  );
  const monthSales = await queryOne(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
     FROM sales WHERE business_id = ? AND sale_status != 'cancelled' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')${branchFilter}`,
    branchParams
  );
  const topProducts = await query(
    `SELECT si.product_name, SUM(si.quantity) AS qty_sold, SUM(si.line_total) AS revenue
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.business_id = ? AND s.sale_status != 'cancelled'${!allBranchesAccess && branchId ? ' AND s.branch_id = ?' : ''}
     GROUP BY si.product_id, si.product_name
     ORDER BY qty_sold DESC LIMIT 5`,
    branchParams
  );
  const lowStock = await query(
    `SELECT p.name, p.sku, b.name AS branch_name, i.quantity, p.min_stock
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     JOIN branches b ON b.id = i.branch_id
     WHERE i.business_id = ? AND p.status = 'active' AND i.quantity <= p.min_stock${!allBranchesAccess && branchId ? ' AND i.branch_id = ?' : ''}
     ORDER BY i.quantity ASC LIMIT 10`,
    branchParams
  );
  const branchPerf = allBranchesAccess
    ? await query(
        `SELECT b.name, COUNT(s.id) AS sales_count, COALESCE(SUM(s.total_amount), 0) AS revenue
         FROM branches b
         LEFT JOIN sales s ON s.branch_id = b.id AND s.business_id = ? AND s.sale_status != 'cancelled'
         WHERE b.business_id = ?
         GROUP BY b.id, b.name
         ORDER BY revenue DESC`,
        [businessId, businessId]
      )
    : [];
  const expenses = await query(
    `SELECT category_name, COALESCE(SUM(amount), 0) AS total
     FROM expenses
     WHERE business_id = ? AND approval_status = 'approved'${branchFilter}
     GROUP BY category_name
     ORDER BY total DESC LIMIT 5`,
    branchParams
  );
  const receivables = await queryOne(
    `SELECT COALESCE(SUM(outstanding_balance), 0) AS customer_debt FROM customers WHERE business_id = ?`,
    [businessId]
  );

  const groundedContext = {
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

  if (!env.geminiApiKey) {
    // Graceful deterministic fallback if GEMINI_API_KEY is not configured in environment
    return {
      provider: 'local_analytics_fallback',
      answer: [
        `Actual recorded summary for ${businessName} (${groundedContext.scope}):`,
        `• Sales today: ${todaySales?.count || 0} transactions totaling ${Number(todaySales?.total || 0).toLocaleString()} ${currencyCode}.`,
        `• Sales this month: ${monthSales?.count || 0} transactions totaling ${Number(monthSales?.total || 0).toLocaleString()} ${currencyCode}.`,
        `• Customer receivables owed: ${Number(receivables?.customer_debt || 0).toLocaleString()} ${currencyCode}.`,
        lowStock.length
          ? `• Restock priority: ${lowStock.map((i) => `${i.name} (${i.branch_name}: ${i.quantity} left, min ${i.min_stock})`).join('; ')}.`
          : '• Inventory status: All active products are above minimum stock thresholds.',
        `Note: Add GEMINI_API_KEY in Settings > Secrets for full conversational Gemini AI analysis.`,
      ].join('\n'),
      groundedContext,
    };
  }

  const ai = new GoogleGenAI({
    apiKey: env.geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Authorized Business Data JSON:\n${JSON.stringify(groundedContext, null, 2)}\n\nUser Question: ${userPrompt}`,
    config: {
      systemInstruction:
        'You are the BizFlow Africa Business Assistant. Answer strictly using the provided authorized database JSON. ' +
        'Clearly distinguish ACTUAL DATABASE RESULTS from ESTIMATES or RECOMMENDATIONS. ' +
        'Never invent figures that are not in the JSON; if data is missing or zero, state that explicitly. ' +
        'Format currency clearly in the business currency (default RWF). Keep answers concise, executive, and actionable.',
    },
  });

  return {
    provider: 'gemini-4-hydrogen',
    answer: response.text || 'No response generated.',
    groundedContext,
  };
}
