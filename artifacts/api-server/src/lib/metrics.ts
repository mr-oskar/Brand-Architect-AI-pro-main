/**
 * In-memory ring buffer of per-second metrics for the last 5 minutes.
 * Used to power the live monitoring dashboard.
 */
const WINDOW_SECONDS = 300;

interface Bucket {
  ts: number; // unix seconds
  requests: number;
  errors: number;
  totalLatencyMs: number;
  byStatus: Record<string, number>;
  byRoute: Record<string, number>;
}

const buckets = new Map<number, Bucket>();
const startedAtMs = Date.now();
let totalRequests = 0;
let totalErrors = 0;
let totalLatencyMs = 0;

function nowSec() { return Math.floor(Date.now() / 1000); }

function getBucket(ts: number): Bucket {
  let b = buckets.get(ts);
  if (!b) {
    b = { ts, requests: 0, errors: 0, totalLatencyMs: 0, byStatus: {}, byRoute: {} };
    buckets.set(ts, b);
  }
  return b;
}

function prune() {
  const cutoff = nowSec() - WINDOW_SECONDS;
  for (const k of buckets.keys()) if (k < cutoff) buckets.delete(k);
}

export function recordRequest(opts: { route: string; statusCode: number; durationMs: number }) {
  const ts = nowSec();
  const b = getBucket(ts);
  b.requests++;
  b.totalLatencyMs += opts.durationMs;
  if (opts.statusCode >= 500) b.errors++;
  b.byStatus[String(opts.statusCode)] = (b.byStatus[String(opts.statusCode)] ?? 0) + 1;
  b.byRoute[opts.route] = (b.byRoute[opts.route] ?? 0) + 1;
  totalRequests++;
  totalLatencyMs += opts.durationMs;
  if (opts.statusCode >= 500) totalErrors++;
  if (Math.random() < 0.05) prune();
}

export function getMetricsSnapshot() {
  prune();
  const series = Array.from(buckets.values()).sort((a, b) => a.ts - b.ts);
  const last60 = series.filter((b) => b.ts >= nowSec() - 60);
  const reqLast60 = last60.reduce((s, b) => s + b.requests, 0);
  const errLast60 = last60.reduce((s, b) => s + b.errors, 0);
  const latLast60 = last60.reduce((s, b) => s + b.totalLatencyMs, 0);
  const aggStatus: Record<string, number> = {};
  const aggRoute: Record<string, number> = {};
  for (const b of series) {
    for (const [k, v] of Object.entries(b.byStatus)) aggStatus[k] = (aggStatus[k] ?? 0) + v;
    for (const [k, v] of Object.entries(b.byRoute)) aggRoute[k] = (aggRoute[k] ?? 0) + v;
  }
  const memory = process.memoryUsage();
  return {
    process: {
      uptimeMs: Date.now() - startedAtMs,
      pid: process.pid,
      nodeVersion: process.version,
      memory: {
        rssMb: +(memory.rss / 1024 / 1024).toFixed(1),
        heapUsedMb: +(memory.heapUsed / 1024 / 1024).toFixed(1),
        heapTotalMb: +(memory.heapTotal / 1024 / 1024).toFixed(1),
      },
      cpuUsage: process.cpuUsage(),
    },
    totals: {
      requests: totalRequests,
      errors: totalErrors,
      avgLatencyMs: totalRequests ? Math.round(totalLatencyMs / totalRequests) : 0,
    },
    last60s: {
      requests: reqLast60,
      errors: errLast60,
      avgLatencyMs: reqLast60 ? Math.round(latLast60 / reqLast60) : 0,
      rps: +(reqLast60 / 60).toFixed(2),
      errorRate: reqLast60 ? +((errLast60 / reqLast60) * 100).toFixed(2) : 0,
    },
    series: series.map((b) => ({
      ts: b.ts,
      requests: b.requests,
      errors: b.errors,
      avgLatencyMs: b.requests ? Math.round(b.totalLatencyMs / b.requests) : 0,
    })),
    topStatus: Object.entries(aggStatus).sort((a, b) => b[1] - a[1]).slice(0, 8),
    topRoutes: Object.entries(aggRoute).sort((a, b) => b[1] - a[1]).slice(0, 12),
  };
}
