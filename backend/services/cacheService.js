const memoryCache = new Map();
let cacheHits = 0;
let cacheMisses = 0;

export function getCached(key) {
  const entry = memoryCache.get(key);
  if (!entry) {
    cacheMisses += 1;
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    memoryCache.delete(key);
    cacheMisses += 1;
    return null;
  }
  cacheHits += 1;
  return entry.value;
}

export function setCached(key, value, ttlMs = 30_000) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidateCache(key) {
  memoryCache.delete(key);
}

export function invalidatePrefix(prefix) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

export function getCacheStats() {
  const now = Date.now();
  let activeEntries = 0;
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt < now) {
      memoryCache.delete(key);
    } else {
      activeEntries += 1;
    }
  }
  const totalLookups = cacheHits + cacheMisses;
  const hitRatePct = totalLookups > 0 ? Math.round((cacheHits / totalLookups) * 1000) / 10 : 0;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    totalLookups,
    hitRatePct,
    activeEntries,
  };
}

export function resetCacheStats() {
  cacheHits = 0;
  cacheMisses = 0;
}
