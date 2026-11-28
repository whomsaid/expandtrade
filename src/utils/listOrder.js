import { useMemo, useState } from 'react';

const TIMESTAMP_KEYS = [
  'submitted_at',
  'published_at',
  'created_at',
  'updated_at',
  'recorded_at',
  'applied_at',
  'sale_date',
  'order_date',
  'expense_date',
  'payment_date',
  'last_login_at',
  'last_seen_at',
  'activated_at',
  'expires_at',
  'ts',
  'day',
  'date',
];

function parseDateValue(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val > 1e12 ? val : val > 1e9 ? val * 1000 : null;
  }
  const str = String(val).trim();
  if (!str) return null;
  const parsed = Date.parse(str);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getItemRecencyScore(item) {
  if (!item || typeof item !== 'object') return 0;
  for (const key of TIMESTAMP_KEYS) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
      const ts = parseDateValue(item[key]);
      if (ts !== null) return ts;
    }
  }
  const idNum = Number(item.id);
  if (Number.isFinite(idNum) && idNum > 0) return idNum;
  return 0;
}

/**
 * Sorts records strictly from newest to oldest without mutating the source array.
 * Ties on timestamps fall back to descending numeric `id`.
 */
export function sortNewestFirst(items) {
  if (!Array.isArray(items) || items.length <= 1) {
    return Array.isArray(items) ? items : [];
  }
  return items
    .map((item, index) => ({ item, index, score: getItemRecencyScore(item) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aId = Number(a.item?.id || 0);
      const bId = Number(b.item?.id || 0);
      if (Number.isFinite(aId) && Number.isFinite(bId) && bId !== aId) {
        return bId - aId;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

/**
 * Reusable hook for information boxes/tables across the system:
 * 1) Arranges records from newest to oldest (unless sortNewest is disabled for custom columns).
 * 2) Caps initial display at `initialLimit` and reveals all records when user clicks "View more".
 */
export function useExpandableList(items, { initialLimit = 5, sortNewest = true } = {}) {
  const [expanded, setExpanded] = useState(false);

  const orderedItems = useMemo(() => {
    const safeList = Array.isArray(items) ? items : [];
    return sortNewest ? sortNewestFirst(safeList) : safeList;
  }, [items, sortNewest]);

  const totalCount = orderedItems.length;
  const effectiveLimit = Math.max(1, Number(initialLimit) || 5);
  const hasMore = totalCount > effectiveLimit;

  const visibleItems = useMemo(() => {
    if (expanded || !hasMore) return orderedItems;
    return orderedItems.slice(0, effectiveLimit);
  }, [orderedItems, expanded, hasMore, effectiveLimit]);

  const remainingCount = Math.max(0, totalCount - visibleItems.length);

  return {
    orderedItems,
    visibleItems,
    totalCount,
    visibleCount: visibleItems.length,
    remainingCount,
    expanded,
    hasMore,
    setExpanded,
    toggleExpanded: () => setExpanded((prev) => !prev),
  };
}
