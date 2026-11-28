import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const MAX_RECENT_SAMPLES = 500;
const MAX_TIMELINE_POINTS = 36;
const BUCKET_INTERVAL_MS = 5000;

let loopMonitor = null;
try {
  loopMonitor = monitorEventLoopDelay({ resolution: 20 });
  loopMonitor.enable();
} catch {
  loopMonitor = null;
}

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = performance.now();

const state = {
  startedAt: Date.now(),
  totalRequests: 0,
  totalErrors: 0,
  slowRequests: 0,
  recentRequests: [], // { ts, method, path, statusCode, durationMs }
  endpoints: new Map(), // key -> { method, path, count, errors, durations: number[], maxMs, lastMs, lastStatus, lastTs }
  timeline: [], // { ts, label, avgMs, p95Ms, rpm, heapMb, rssMb, eventLoopLagMs }
  currentBucket: null,
};

function normalizeMetricPath(rawPath) {
  const clean = String(rawPath || '/').split('?')[0];
  return clean
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/:uuid')
    .slice(0, 96);
}

function percentile(sortedAsc, pct) {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((pct / 100) * sortedAsc.length) - 1));
  return Math.round(sortedAsc[idx] * 100) / 100;
}

function getEventLoopLagMs() {
  if (!loopMonitor) return 0;
  const meanNs = Number(loopMonitor.mean || 0);
  if (!Number.isFinite(meanNs) || meanNs <= 0) return 0;
  return Math.round((meanNs / 1e6) * 100) / 100;
}

function getEventLoopP99Ms() {
  if (!loopMonitor) return 0;
  const p99Ns = Number(loopMonitor.percentile(99) || 0);
  if (!Number.isFinite(p99Ns) || p99Ns <= 0) return 0;
  return Math.round((p99Ns / 1e6) * 100) / 100;
}

function getCpuPercent() {
  const now = performance.now();
  const elapsedMs = Math.max(1, now - lastCpuTime);
  const diff = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = now;
  const totalCpuMs = (diff.user + diff.system) / 1000;
  const cores = Math.max(1, os.cpus()?.length || 1);
  const pct = (totalCpuMs / (elapsedMs * cores)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

function formatClockLabel(ts) {
  const d = new Date(ts);
  return d.toISOString().slice(11, 19);
}

function flushBucketIfNeeded(now) {
  if (!state.currentBucket) {
    state.currentBucket = {
      startTs: now,
      durations: [],
      errors: 0,
    };
    return;
  }

  if (now - state.currentBucket.startTs >= BUCKET_INTERVAL_MS) {
    const durations = [...state.currentBucket.durations].sort((a, b) => a - b);
    const avgMs = durations.length
      ? Math.round((durations.reduce((sum, v) => sum + v, 0) / durations.length) * 100) / 100
      : 0;
    const p95Ms = percentile(durations, 95);
    const rpm = Math.round((durations.length / (BUCKET_INTERVAL_MS / 1000)) * 60);
    const mem = process.memoryUsage();
    const point = {
      ts: state.currentBucket.startTs,
      label: formatClockLabel(state.currentBucket.startTs),
      avgMs,
      p95Ms,
      rpm,
      errors: state.currentBucket.errors,
      heapMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
      rssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
      eventLoopLagMs: getEventLoopLagMs(),
    };
    state.timeline.push(point);
    if (state.timeline.length > MAX_TIMELINE_POINTS) {
      state.timeline.splice(0, state.timeline.length - MAX_TIMELINE_POINTS);
    }
    state.currentBucket = {
      startTs: now,
      durations: [],
      errors: 0,
    };
  }
}

export function recordApiMetric({ method, path, statusCode, durationMs }) {
  const cleanPath = normalizeMetricPath(path);
  // Skip self-polling and diagnostics control endpoints so monitoring/reset checks do not skew app latency metrics
  if (cleanPath.startsWith('/admin/diagnostics')) return;

  const now = Date.now();
  const safeDuration = Math.max(0, Math.round(Number(durationMs || 0) * 100) / 100);
  const upperMethod = String(method || 'GET').toUpperCase();
  const isError = Number(statusCode || 200) >= 400;

  state.totalRequests += 1;
  if (isError) state.totalErrors += 1;
  if (safeDuration > 500) state.slowRequests += 1;

  state.recentRequests.push({
    ts: now,
    method: upperMethod,
    path: cleanPath,
    statusCode: Number(statusCode || 200),
    durationMs: safeDuration,
  });
  if (state.recentRequests.length > MAX_RECENT_SAMPLES) {
    state.recentRequests.splice(0, state.recentRequests.length - MAX_RECENT_SAMPLES);
  }

  flushBucketIfNeeded(now);
  state.currentBucket.durations.push(safeDuration);
  if (isError) state.currentBucket.errors += 1;

  const endpointKey = `${upperMethod} ${cleanPath}`;
  let ep = state.endpoints.get(endpointKey);
  if (!ep) {
    if (state.endpoints.size > 150) {
      const oldestKey = state.endpoints.keys().next().value;
      if (oldestKey) state.endpoints.delete(oldestKey);
    }
    ep = {
      method: upperMethod,
      path: cleanPath,
      count: 0,
      errors: 0,
      durations: [],
      totalMs: 0,
      maxMs: 0,
      lastMs: 0,
      lastStatus: 200,
      lastTs: now,
    };
    state.endpoints.set(endpointKey, ep);
  }
  ep.count += 1;
  if (isError) ep.errors += 1;
  ep.totalMs += safeDuration;
  ep.maxMs = Math.max(ep.maxMs, safeDuration);
  ep.lastMs = safeDuration;
  ep.lastStatus = Number(statusCode || 200);
  ep.lastTs = now;
  ep.durations.push(safeDuration);
  if (ep.durations.length > 100) {
    ep.durations.shift();
  }
}

export function getLiveDiagnosticsSnapshot() {
  const now = Date.now();
  flushBucketIfNeeded(now);

  // Sample a point when diagnostics is polled even if no new traffic arrived in the interval
  const mem = process.memoryUsage();
  const heapUsedMb = Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10;
  const heapTotalMb = Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10;
  const rssMb = Math.round((mem.rss / (1024 * 1024)) * 10) / 10;

  const oneMinuteAgo = now - 60_000;
  const lastMinute = state.recentRequests.filter((r) => r.ts >= oneMinuteAgo);
  const recentSorted = state.recentRequests.map((r) => r.durationMs).sort((a, b) => a - b);

  const avgMs = recentSorted.length
    ? Math.round((recentSorted.reduce((s, v) => s + v, 0) / recentSorted.length) * 100) / 100
    : 0;
  const p50Ms = percentile(recentSorted, 50);
  const p95Ms = percentile(recentSorted, 95);
  const p99Ms = percentile(recentSorted, 99);
  const maxMs = recentSorted.length ? recentSorted[recentSorted.length - 1] : 0;

  const successRatePct =
    state.totalRequests > 0
      ? Math.round(((state.totalRequests - state.totalErrors) / state.totalRequests) * 1000) / 10
      : 100;

  const endpointBreakdown = [...state.endpoints.values()]
    .map((ep) => {
      const sorted = [...ep.durations].sort((a, b) => a - b);
      return {
        method: ep.method,
        path: ep.path,
        count: ep.count,
        errors: ep.errors,
        avgMs: Math.round((ep.totalMs / Math.max(1, ep.count)) * 100) / 100,
        p95Ms: percentile(sorted, 95),
        maxMs: Math.round(ep.maxMs * 100) / 100,
        lastMs: Math.round(ep.lastMs * 100) / 100,
        lastStatus: ep.lastStatus,
      };
    })
    .sort((a, b) => b.p95Ms - a.p95Ms || b.count - a.count)
    .slice(0, 20);

  const liveBucketDurations = state.currentBucket?.durations
    ? [...state.currentBucket.durations].sort((a, b) => a - b)
    : [];
  const livePoint = {
    ts: now,
    label: formatClockLabel(now),
    avgMs: liveBucketDurations.length
      ? Math.round((liveBucketDurations.reduce((s, v) => s + v, 0) / liveBucketDurations.length) * 100) / 100
      : avgMs,
    p95Ms: liveBucketDurations.length ? percentile(liveBucketDurations, 95) : p95Ms,
    rpm: lastMinute.length,
    errors: state.currentBucket?.errors || 0,
    heapMb: heapUsedMb,
    rssMb,
    eventLoopLagMs: getEventLoopLagMs(),
  };

  const timeline = [...state.timeline, livePoint].slice(-MAX_TIMELINE_POINTS);

  return {
    windowStartedAt: new Date(state.startedAt).toISOString(),
    timestamp: new Date(now).toISOString(),
    summary: {
      totalRequests: state.totalRequests,
      totalErrors: state.totalErrors,
      slowRequests: state.slowRequests,
      rpm: lastMinute.length,
      successRatePct,
      avgMs,
      p50Ms,
      p95Ms,
      p99Ms,
      maxMs,
    },
    runtime: {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      cpuPercent: getCpuPercent(),
      cpuCores: os.cpus()?.length || 1,
      loadAvg1m: Math.round((os.loadavg()?.[0] || 0) * 100) / 100,
      heapUsedMb,
      heapTotalMb,
      rssMb,
      osTotalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
      osFreeMemMb: Math.round(os.freemem() / (1024 * 1024)),
      eventLoopLagMs: getEventLoopLagMs(),
      eventLoopP99Ms: getEventLoopP99Ms(),
    },
    timeline,
    endpoints: endpointBreakdown,
    recentRequests: [...state.recentRequests].reverse().slice(0, 15),
  };
}

export function resetMetricsWindow() {
  state.startedAt = Date.now();
  state.totalRequests = 0;
  state.totalErrors = 0;
  state.slowRequests = 0;
  state.recentRequests = [];
  state.endpoints.clear();
  state.timeline = [];
  state.currentBucket = null;
  if (loopMonitor?.reset) {
    try {
      loopMonitor.reset();
    } catch {
      // ignore
    }
  }
}
