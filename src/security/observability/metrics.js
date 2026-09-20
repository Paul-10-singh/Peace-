/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 9 : PROMETHEUS METRICS.
 *
 * Zero-dependency Prometheus text exposition over a localhost HTTP server
 * (127.0.0.1:9090), Grafana-ready. Exporters tracked:
 *   actions_total            — every engine.dispatch
 *   threats_blocked_total    — enforcement actions
 *   punishment_latency_ms    — histogram of playbook step latencies
 *   ai_inference_ms          — histogram of classifier/LLM inference
 *   raid_score               — gauge (latest score per guild)
 */
const http = require('http');
const { randomUUID } = require('crypto');

const counters = new Map();
const gauges = new Map();
const histograms = new Map();

let alertsUrl = process.env.SECURITY_ALERT_WEBHOOK || null;
let lastPing = 0;

function counter(name, help) {
  counters.set(name, { name, help, values: new Map() });
  return (amount = 1, labels = {}) => {
    const k = labelKey(labels);
    const cur = counters.get(name).values;
    cur.set(k, { labels, value: (cur.get(k)?.value || 0) + amount });
  };
}

function gauge(name, help) {
  gauges.set(name, { name, help, values: new Map() });
  return (value, labels = {}) => {
    if (typeof value !== 'number') return;
    const cur = gauges.get(name).values;
    cur.set(labelKey(labels), { labels, value });
  };
}

function histogram(name, help, buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
  histograms.set(name, { name, help, buckets, values: new Map() });
  return (value, labels = {}) => {
    const cur = histograms.get(name).values;
    const k = labelKey(labels);
    const acc = cur.get(k) || { labels, sum: 0, count: 0, b: {} };
    acc.sum += value; acc.count += 1;
    for (const b of buckets) acc.b[b] = (acc.b[b] || 0) + (value <= b ? 1 : 0);
    cur.set(k, acc);
  };
}

function labelKey(labels) {
  return JSON.stringify(Object.entries(labels).sort());
}

function fmtLabels(labels) {
  const entries = Object.entries(labels).sort();
  if (!entries.length) return '';
  return `{${entries.map(([k, v]) => `${k}="${esc(v)}"`).join(',')}}`;
}

function esc(v) { return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

function render() {
  const lines = [];
  const pushMetric = (meta) => {
    lines.push(`# HELP ${meta.name} ${meta.help}`);
    lines.push(`# TYPE ${meta.name} ${meta.type}`);
    for (const { labels, value } of meta.values.values()) {
      lines.push(`${meta.name}${fmtLabels(labels)} ${value}`);
    }
  };
  for (const c of counters.values()) pushMetric({ ...c, type: 'counter' });
  for (const g of gauges.values()) pushMetric({ ...g, type: 'gauge' });
  for (const h of histograms.values()) {
    lines.push(`# HELP ${h.name} ${h.help}`);
    lines.push(`# TYPE ${h.name} histogram`);
    for (const { labels, sum, count, b } of h.values.values()) {
      let cumulative = 0;
      for (const bucket of h.buckets) {
        cumulative += b[bucket] || 0;
        lines.push(`${h.name}_bucket${fmtLabels({ ...labels, le: bucket })} ${cumulative}`);
      }
      lines.push(`${h.name}_bucket${fmtLabels({ ...labels, le: '+Inf' })} ${count}`);
      lines.push(`${h.name}_sum${fmtLabels(labels)} ${sum}`);
      lines.push(`${h.name}_count${fmtLabels(labels)} ${count}`);
    }
  }
  return lines.join('\n');
}

// ── prebuilt registry — one exporter per signal ────────────────────────────
const registry = {
  actions: counter('peacex_actions_total', 'Security actions dispatched through the engine'),
  threats: counter('peacex_threats_blocked_total', 'Threats blocked by enforcement'),
  punishments: counter('peacex_punishments_total', 'Punishment applications'),
  aiBusy: counter('peacex_ai_inferences_total', 'AI/LLM inferences performed'),
  capGrants: counter('peacex_capability_grants_total', 'Capability grants issued'),
  ledgerEntries: counter('peacex_ledger_entries_total', 'Audit ledger entries appended'),
  aiLatency: histogram('peacex_ai_inference_ms', 'AI inference latency (ms)'),
  punishLatency: histogram('peacex_punishment_latency_ms', 'Playbook/step latency (ms)'),
  raidScore: gauge('peacex_raid_score', 'Current raid score per guild'),
  grantSweeps: counter('peacex_grant_revocations_total', 'Auto-revoked grants'),
  gatewayPing: gauge('peacex_gateway_ping_ms', 'Discord gateway round-trip latency (ms)'),
};

/** Alert rule: punishment latency > 5s OR raid score > configured threshold. */
async function checkAlerts({ punishmentLatencyMs = 0, raidScore = 0 }) {
  const loud = [];
  if (punishmentLatencyMs > 5000) loud.push(`punishment latency ${punishmentLatencyMs}ms > 5s`);
  const threshold = Number(process.env.SECURITY_RAID_ALERT_THRESHOLD || '0.7');
  if (raidScore > threshold) loud.push(`raid score ${raidScore.toFixed(2)} > ${threshold}`);
  if (!loud.length || !alertsUrl) return;
  const now = Date.now();
  if (now - lastPing < 60_000) return; // debounce 1/min
  lastPing = now;
  const body = {
    content: `🚨 **Peace✘ Security Alert** (${now})\n${loud.map((l) => `• ${l}`).join('\n')}`,
    avatar_url: undefined,
  };
  try {
    await fetch(alertsUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch { /* alert webhook best-effort */ }
}

/**
 * Start the localhost observability server.
 * Returns the http.Server (bound to 127.0.0.1 — never exposed publicly).
 */
function startServer({ port = Number(process.env.SECURITY_METRICS_PORT || '9090'), health } = {}) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      res.end(render());
      return;
    }
    if (req.url === '/healthz') {
      const h = typeof health === 'function' ? await health() : { ok: true };
      res.writeHead(h.ok ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ...h, ts: Date.now() }));
      return;
    }
    res.writeHead(404);
    res.end('');
  });
  server.listen(port, '127.0.0.1');
  server.on('error', (err) => console.error(`[PeaceX] [Metrics] listener error (${err.code}):`, err.message));
  return server;
}

const metricsApi = { registry, render, startServer, checkAlerts, counter, gauge, histogram };

module.exports = metricsApi;