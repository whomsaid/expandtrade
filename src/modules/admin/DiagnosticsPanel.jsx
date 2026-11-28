import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Cpu, Database, Gauge, Pause, Play, RefreshCw, RotateCcw, Zap } from 'lucide-react';
import { api, getClientTelemetry, resetClientTelemetry } from '../../services/api.js';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useExpandableList } from '../../utils/listOrder.js';
import ViewMoreFooter from '../../components/ViewMoreFooter.jsx';

function readBrowserNavigationMetrics() {
  if (typeof window === 'undefined' || !window.performance) {
    return {
      supported: false,
      dnsMs: 0,
      tcpMs: 0,
      ttfbMs: 0,
      domInteractiveMs: 0,
      loadCompleteMs: 0,
      transferKb: 0,
      encodedBodyKb: 0,
      navType: 'navigate',
    };
  }
  const nav = window.performance.getEntriesByType?.('navigation')?.[0];
  if (!nav) {
    return {
      supported: false,
      dnsMs: 0,
      tcpMs: 0,
      ttfbMs: 0,
      domInteractiveMs: 0,
      loadCompleteMs: 0,
      transferKb: 0,
      encodedBodyKb: 0,
      navType: 'navigate',
    };
  }
  const round = (v) => Math.max(0, Math.round(Number(v || 0) * 10) / 10);
  return {
    supported: true,
    dnsMs: round(nav.domainLookupEnd - nav.domainLookupStart),
    tcpMs: round(nav.connectEnd - nav.connectStart),
    ttfbMs: round(nav.responseStart - nav.requestStart),
    domInteractiveMs: round(nav.domInteractive - nav.startTime),
    loadCompleteMs: round((nav.loadEventEnd > 0 ? nav.loadEventEnd : nav.domContentLoadedEventEnd) - nav.startTime),
    transferKb: round((nav.transferSize || 0) / 1024),
    encodedBodyKb: round((nav.encodedBodySize || 0) / 1024),
    navType: nav.type || 'navigate',
  };
}

function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function DiagnosticsPanel({ onNotify, onError }) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [snapshot, setSnapshot] = useState(null);
  const [clientStats, setClientStats] = useState(() => getClientTelemetry());
  const [browserPerf, setBrowserPerf] = useState(() => readBrowserNavigationMetrics());
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(true);
  const [pollMs, setPollMs] = useState(3000);
  const [sortBy, setSortBy] = useState('p95');
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState(null);
  const [resetting, setResetting] = useState(false);

  const fetchLiveSnapshot = useCallback(async () => {
    try {
      const res = await api.get('/admin/diagnostics/live');
      setSnapshot(res.data);
      setClientStats(getClientTelemetry());
      setBrowserPerf(readBrowserNavigationMetrics());
    } catch (err) {
      if (onError) onError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    fetchLiveSnapshot();
  }, [fetchLiveSnapshot]);

  useEffect(() => {
    if (!streaming) return undefined;
    const id = window.setInterval(() => {
      if (!document.hidden) {
        fetchLiveSnapshot();
      }
    }, pollMs);
    return () => window.clearInterval(id);
  }, [streaming, pollMs, fetchLiveSnapshot]);

  const handleRunProbe = async () => {
    if (probing) return;
    setProbing(true);
    const t0 = performance.now();
    try {
      const res = await api.post('/admin/diagnostics/benchmark');
      const clientRoundTripMs = Math.round((performance.now() - t0) * 100) / 100;
      setProbeResult({
        ...res.data,
        clientRoundTripMs,
      });
      await fetchLiveSnapshot();
      if (onNotify) {
        onNotify(t('diagnostics.probeCompleteMsg', { ms: clientRoundTripMs }));
      }
    } catch (err) {
      if (onError) onError(err.message);
    } finally {
      setProbing(false);
    }
  };

  const handleResetMetrics = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await api.post('/admin/diagnostics/reset');
      resetClientTelemetry();
      setProbeResult(null);
      await fetchLiveSnapshot();
      if (onNotify) onNotify(t('diagnostics.resetDoneMsg'));
    } catch (err) {
      if (onError) onError(err.message);
    } finally {
      setResetting(false);
    }
  };

  const sortedEndpoints = useMemo(() => {
    const list = [...(snapshot?.endpoints || [])];
    if (sortBy === 'count') {
      return list.sort((a, b) => b.count - a.count || b.p95Ms - a.p95Ms);
    }
    return list.sort((a, b) => b.p95Ms - a.p95Ms || b.count - a.count);
  }, [snapshot?.endpoints, sortBy]);

  const endpointsBox = useExpandableList(sortedEndpoints, { initialLimit: 6, sortNewest: false });

  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const tickColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    borderColor: isDark ? '#334155' : '#e2e8f0',
    borderRadius: '0.5rem',
    fontSize: '12px',
    color: isDark ? '#f8fafc' : '#0f172a',
  };

  const summary = snapshot?.summary || {};
  const runtime = snapshot?.runtime || {};
  const cache = snapshot?.cache || {};
  const database = snapshot?.database || {};
  const timeline = snapshot?.timeline || [];

  return (
    <div className="space-y-6">
      {/* Header Control Strip */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Gauge className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-slate-100">
              {t('diagnostics.heading')}
            </h2>
            {streaming && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                {t('diagnostics.liveLabel')}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('diagnostics.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs">
          <select
            aria-label={t('diagnostics.refreshRateAria')}
            value={pollMs}
            onChange={(e) => setPollMs(Number(e.target.value))}
            className="px-2.5 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono tabular-nums"
          >
            <option value={2000}>2s</option>
            <option value={3000}>3s</option>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
          </select>

          <button
            type="button"
            onClick={() => setStreaming((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-2 font-semibold border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {streaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {streaming ? t('diagnostics.pauseLiveBtn') : t('diagnostics.resumeLiveBtn')}
          </button>

          <button
            type="button"
            disabled={probing}
            onClick={handleRunProbe}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Zap className="w-3.5 h-3.5" />
            {probing ? t('diagnostics.probingBtn') : t('diagnostics.runProbeBtn')}
          </button>

          <button
            type="button"
            onClick={fetchLiveSnapshot}
            aria-label={t('common.refresh')}
            className="p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={resetting}
            onClick={handleResetMetrics}
            className="inline-flex items-center gap-1.5 px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('diagnostics.resetBtn')}
          </button>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      {loading && !snapshot ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4" aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {t('diagnostics.kpiApiLatency')}
            </div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#0B192C] dark:text-white">
              {summary.p50Ms ?? 0} <span className="text-xs font-normal text-slate-400">/ {summary.p95Ms ?? 0} ms</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {t('diagnostics.avgShort', { val: summary.avgMs ?? 0 })} · {t('diagnostics.p99Short', { val: summary.p99Ms ?? 0 })}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {t('diagnostics.kpiPageLoad')}
            </div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#0B192C] dark:text-white">
              {browserPerf.loadCompleteMs || 0} <span className="text-xs font-normal text-slate-400">ms</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              TTFB {browserPerf.ttfbMs}ms · DOM {browserPerf.domInteractiveMs}ms
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Database className="w-3 h-3" /> {t('diagnostics.kpiDbAndLoop')}
            </div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#0B192C] dark:text-white">
              {database.pingLatencyMs ?? 0} <span className="text-xs font-normal text-slate-400">ms</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {t('diagnostics.loopLagShort', { val: runtime.eventLoopLagMs ?? 0 })} · {database.dialect || 'sqlite'}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Activity className="w-3 h-3" /> {t('diagnostics.kpiThroughput')}
            </div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#0B192C] dark:text-white">
              {summary.rpm ?? 0} <span className="text-xs font-normal text-slate-400">req/min</span>
            </div>
            <div className={`text-[11px] font-mono tabular-nums ${(summary.successRatePct ?? 100) >= 99 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {summary.successRatePct ?? 100}% ok · {summary.totalErrors ?? 0} err
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {t('diagnostics.kpiCacheHit')}
            </div>
            <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {cache.hitRatePct ?? 0}%
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {cache.hits ?? 0} {t('diagnostics.hitsShort')} · {cache.activeEntries ?? 0} {t('diagnostics.keysShort')}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Cpu className="w-3 h-3" /> {t('diagnostics.kpiRuntime')}
            </div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#0B192C] dark:text-white">
              {runtime.heapUsedMb ?? 0} <span className="text-xs font-normal text-slate-400">/ {runtime.rssMb ?? 0} MB</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              CPU {runtime.cpuPercent ?? 0}% · {formatDuration(runtime.uptimeSeconds)}
            </div>
          </div>
        </div>
      )}

      {/* Probe Benchmark Breakdown (when triggered) */}
      {probeResult && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {t('diagnostics.latestProbeTitle')}
            </div>
            <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {t('diagnostics.clientRttShort', { ms: probeResult.clientRoundTripMs })} · {t('diagnostics.serverTotalShort', { ms: probeResult.totalMs })}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(probeResult.probes || []).map((p) => (
              <div key={p.id} className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                <span className="text-slate-700 dark:text-slate-200 truncate">{p.label}</span>
                <span className="font-mono tabular-nums font-bold text-sky-700 dark:text-sky-400 shrink-0">
                  {p.durationMs}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real-Time Time-Series Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('diagnostics.chartLatencyTitle')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('diagnostics.chartLatencySubtitle')}
              </p>
            </div>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} />
                <YAxis tick={{ fontSize: 11, fill: tickColor }} unit="ms" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="p95Ms"
                  name="P95 (ms)"
                  stroke="#0284c7"
                  fill={isDark ? 'rgba(2, 132, 199, 0.20)' : 'rgba(2, 132, 199, 0.14)'}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="avgMs"
                  name="Avg (ms)"
                  stroke="#10b981"
                  fill={isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.12)'}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('diagnostics.chartThroughputTitle')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('diagnostics.chartThroughputSubtitle')}
            </p>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeline} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} />
                <YAxis tick={{ fontSize: 11, fill: tickColor }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="rpm"
                  name="Req/Min"
                  fill="#0284c7"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="heapMb"
                  name="Heap (MB)"
                  fill={isDark ? '#64748b' : '#94a3b8'}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Split: Endpoint Latency Breakdown & Client Load Telemetry */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('diagnostics.endpointTableTitle')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('diagnostics.endpointTableDesc')}
              </p>
            </div>
            <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setSortBy('p95')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  sortBy === 'p95'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t('diagnostics.sortSlowest')}
              </button>
              <button
                type="button"
                onClick={() => setSortBy('count')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  sortBy === 'count'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t('diagnostics.sortTraffic')}
              </button>
            </div>
          </div>

          {endpointsBox.totalCount === 0 ? (
            <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
              {t('diagnostics.noEndpointsRecorded')}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">{t('diagnostics.colEndpoint')}</th>
                      <th className="py-2.5 px-4 font-semibold text-right">{t('diagnostics.colCalls')}</th>
                      <th className="py-2.5 px-4 font-semibold text-right">{t('diagnostics.colErrors')}</th>
                      <th className="py-2.5 px-4 font-semibold text-right">{t('diagnostics.colAvgMs')}</th>
                      <th className="py-2.5 px-4 font-semibold text-right">{t('diagnostics.colP95Ms')}</th>
                      <th className="py-2.5 px-4 font-semibold text-right">{t('diagnostics.colMaxMs')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                    {endpointsBox.visibleItems.map((ep) => (
                      <tr key={`${ep.method}:${ep.path}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          <span className="font-semibold text-sky-700 dark:text-sky-400 mr-2">{ep.method}</span>
                          <span>{ep.path}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300">{ep.count}</td>
                        <td className={`py-2.5 px-4 text-right ${ep.errors > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                          {ep.errors}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300">{ep.avgMs}</td>
                        <td className={`py-2.5 px-4 text-right font-semibold ${ep.p95Ms > 500 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          {ep.p95Ms}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-500 dark:text-slate-400">{ep.maxMs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ViewMoreFooter
                totalCount={endpointsBox.totalCount}
                visibleCount={endpointsBox.visibleCount}
                initialLimit={6}
                expanded={endpointsBox.expanded}
                onToggle={endpointsBox.toggleExpanded}
              />
            </>
          )}
        </div>

        {/* Client Page Load & Browser Scalability Metrics */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('diagnostics.clientPerfTitle')}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mt-0.5">
              {t('diagnostics.clientPerfSubtitle')}
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
            <div className="py-2 flex items-center justify-between gap-2">
              <span className="font-sans text-slate-600 dark:text-slate-400">{t('diagnostics.navDnsTcp')}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{browserPerf.dnsMs}ms / {browserPerf.tcpMs}ms</span>
            </div>
            <div className="py-2 flex items-center justify-between gap-2">
              <span className="font-sans text-slate-600 dark:text-slate-400">{t('diagnostics.navTtfb')}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{browserPerf.ttfbMs} ms</span>
            </div>
            <div className="py-2 flex items-center justify-between gap-2">
              <span className="font-sans text-slate-600 dark:text-slate-400">{t('diagnostics.navDomInteractive')}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{browserPerf.domInteractiveMs} ms</span>
            </div>
            <div className="py-2 flex items-center justify-between gap-2">
              <span className="font-sans text-slate-600 dark:text-slate-400">{t('diagnostics.navFullLoad')}</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{browserPerf.loadCompleteMs} ms</span>
            </div>
            <div className="py-2 flex items-center justify-between gap-2">
              <span className="font-sans text-slate-600 dark:text-slate-400">{t('diagnostics.navTransferSize')}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{browserPerf.transferKb} KB</span>
            </div>
            <div className="py-2 flex items-center justify-between gap-2">
              <span className="font-sans text-slate-600 dark:text-slate-400">{t('diagnostics.clientAvgRtt')}</span>
              <span className="font-semibold text-sky-700 dark:text-sky-400">{clientStats.avgRoundTripMs} ms</span>
            </div>
            <div className="py-2 flex items-center justify-between gap-2">
              <span className="font-sans text-slate-600 dark:text-slate-400">{t('diagnostics.clientCacheHits')}</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {clientStats.cacheHits} ({clientStats.clientCacheHitPct}%) · {clientStats.dedupSaved} dedup
              </span>
            </div>
            <div className="py-2 flex items-center justify-between gap-2">
              <span className="font-sans text-slate-600 dark:text-slate-400">{t('diagnostics.activeSessions')}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {database.activeSessions ?? 0} · limit {snapshot?.platformMode?.rateLimitRpm ?? 1200} rpm
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
