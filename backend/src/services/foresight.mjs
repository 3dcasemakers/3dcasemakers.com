import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';

export class ForesightDeliveryError extends Error {
  constructor(message, { status = null, retryable = false, retryAfterMs = null } = {}) {
    super(message); this.name = 'ForesightDeliveryError';
    this.status = status; this.retryable = retryable; this.retryAfterMs = retryAfterMs;
  }
}

/** Server-only Express-compatible middleware. Process-local buffer, not a durable queue. */
export function createForesight({ endpoint, apiKey, service, cpuCores, memoryLimitMb,
  intervalMs = 10000, timeoutMs = 8000, maxPending = 180,
  onError = () => {}, onPrediction = () => {}, onReport = () => {} }) {
  if (!endpoint || !apiKey || !service) throw new Error('endpoint, apiKey and service are required');
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Use HTTPS for remote telemetry; HTTP is allowed only for localhost development; endpoint cannot contain credentials, query or fragment');
  if (typeof apiKey !== 'string' || !/^[\x21-\x7e]+$/.test(apiKey)) throw new Error('apiKey must be a non-empty header-safe string');
  if ((cpuCores !== undefined && (!Number.isFinite(cpuCores) || cpuCores <= 0)) || (memoryLimitMb !== undefined && (!Number.isFinite(memoryLimitMb) || memoryLimitMb <= 0))) throw new Error('cpuCores and memoryLimitMb must be positive finite numbers');
  if (typeof service !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(service)) throw new Error('service must be a 1-80 character lowercase identifier');
  if (!Number.isInteger(intervalMs) || intervalMs < 10000 || intervalMs > 60000 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 || !Number.isInteger(maxPending) || maxPending < 1 || maxPending > 500) throw new Error('intervalMs must be 10000-60000, timeoutMs 1-60000 and maxPending 1-500');
  let pending = [], requestLogs = [], droppedRequestLogs = 0, closed = false, inFlight = null, droppedPoints = 0, failures = 0, retryAt = 0, blocked = false;
  let lastReport = null, lastError = null, lastHttpStatus = null;
  let observations = [], count = 0, totalMs = 0, errors4xx = 0, errors5xx = 0, last = performance.now(), cpu = process.cpuUsage();
  const callback = (fn, value) => { try { fn(value); } catch { /* User callbacks cannot break delivery or application requests. */ } };
  const middleware = (req, res, next) => {
    if (closed) { next(); return; }
    const started = performance.now();
    let recorded = false;
    const record = (aborted = false) => {
      if (recorded) return;
      recorded = true;
      if (closed) return;
      const ms = performance.now() - started; count++; totalMs += ms;
      // Store route templates only: never URLs, query strings, headers or request bodies.
      const template = typeof req.route?.path === 'string' ? req.route.path : '[unmatched]';
      const route = /^[\w\s/:.*(){}[\]-]{1,200}$/.test(template) ? template : '[custom-route]';
      const status = aborted ? 499 : res.statusCode;
      requestLogs.push({id:randomUUID(),ts:new Date().toISOString(),method:['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(req.method)?req.method:'OTHER',route,status,duration_ms:Math.min(86400000,ms)});
      if(requestLogs.length>500) { requestLogs.shift(); droppedRequestLogs++; }
      if (status >= 500) errors5xx++; else if (status >= 400) errors4xx++;
      if (observations.length < 5000) observations.push(ms);
      else { const index = Math.floor(Math.random() * count); if (index < 5000) observations[index] = ms; }
    };
    res.once('finish', () => record());
    res.once('close', () => record(true));
    next();
  };
  function sample() {
    const now = performance.now(), seconds = Math.max((now - last) / 1000, .001), usage = process.cpuUsage(cpu);
    cpu = process.cpuUsage(); last = now;
    const latencies = observations.sort((a, b) => a - b), n = count, sum = totalMs, e4 = errors4xx, e5 = errors5xx;
    observations = []; count = 0; totalMs = 0; errors4xx = 0; errors5xx = 0;
    const point = { ts: new Date().toISOString(), is_up: true, request_rate: n / seconds,
      ...(cpuCores !== undefined ? { cpu_usage: Math.min(100, (usage.user + usage.system) / 1e6 / seconds / cpuCores * 100) } : {}),
      error_rate: n ? e5 / n * 100 : 0, http_4xx_rate: n ? e4 / n * 100 : 0, http_5xx_rate: n ? e5 / n * 100 : 0,
      ...(n ? { response_time: sum / n, p95_latency: latencies[Math.ceil(latencies.length * .95) - 1], p99_latency: latencies[Math.ceil(latencies.length * .99) - 1] } : {}),
      ...(memoryLimitMb !== undefined ? { memory_usage: Math.min(100, process.memoryUsage().rss / 1024 / 1024 / memoryLimitMb * 100) } : {}) };
    pending.push(point);
    if (pending.length > maxPending) { pending.shift(); droppedPoints++; }
  }
  async function deliver(force = false) {
    if (!pending.length || blocked || (!force && Date.now() < retryAt)) return null;
    const batch = [...pending], logs = [...requestLogs];
    try {
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/ingest/telemetry`, { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ service, points: batch, requests: logs }), signal: AbortSignal.timeout(timeoutMs) });
      lastHttpStatus = response.status;
      if (!response.ok) {
        const value = response.headers?.get('retry-after');
        const seconds = value && /^\d+$/.test(value) ? Number(value) : null;
        const dateDelay = value && seconds === null ? Date.parse(value) - Date.now() : null;
        const delay = seconds !== null ? seconds * 1000 : dateDelay;
        throw new ForesightDeliveryError(`Foresight ingestion HTTP ${response.status}`, { status: response.status,
          retryable: [408, 425, 429].includes(response.status) || response.status >= 500,
          retryAfterMs: Number.isFinite(delay) ? Math.max(0, Math.min(300000, delay)) : null });
      }
      let report;
      try { report = await response.json(); } catch { throw new ForesightDeliveryError('Foresight returned invalid JSON', { status: response.status, retryable: true }); }
      if (!report || typeof report !== 'object' || !Number.isInteger(report.accepted) || report.accepted < 0 || report.accepted > batch.length || typeof report.prediction_status !== 'string' || !Object.hasOwn(report, 'prediction')) throw new ForesightDeliveryError('Foresight returned an invalid ingestion report', { status: response.status, retryable: true });
      const prediction = report.prediction;
      if (report.prediction_status === 'experimental' ? !prediction || prediction.service !== service || !Number.isFinite(prediction.failure_probability) || prediction.failure_probability < 0 || prediction.failure_probability > 1 || typeof prediction.model_version !== 'string' || !prediction.model_version || prediction.prediction_window_minutes !== 10 : prediction !== null) throw new ForesightDeliveryError('Foresight returned an invalid forecast in its ingestion report', { status: response.status, retryable: true });
      pending.splice(0, batch.length); failures = 0; retryAt = 0; lastError = null; lastReport = report;
      const delivered = new Set(logs.map(log=>log.id)); requestLogs=requestLogs.filter(log=>!delivered.has(log.id));
      callback(onReport, report); if (report.prediction) callback(onPrediction, report);
      return report;
    } catch (error) {
      const failure = error instanceof ForesightDeliveryError ? error : new ForesightDeliveryError('Foresight transport failed or timed out', { retryable: true });
      failures++; lastError = failure;
      blocked = !failure.retryable;
      retryAt = failure.retryable ? Date.now() + Math.max(failure.retryAfterMs ?? 0, Math.min(60000, intervalMs * 2 ** Math.min(failures - 1, 6))) : 0;
      callback(onError, failure); return null;
    }
  }
  function flush({ force = false } = {}) {
    if (closed) return Promise.resolve(null);
    if (inFlight) return inFlight;
    sample(); inFlight = deliver(force).finally(() => { inFlight = null; }); return inFlight;
  }
  const timer = setInterval(() => { void flush(); }, intervalMs); timer.unref();
  return { middleware, flush, pendingCount: () => pending.length,
    status: () => ({ closed, sending: !!inFlight, blocked, pendingPoints: pending.length, droppedPoints, consecutiveFailures: failures,
      pendingRequestLogs:requestLogs.length,droppedRequestLogs,lastHttpStatus, nextRetryAt: retryAt ? new Date(retryAt).toISOString() : null,
      lastError: lastError ? { message: lastError.message, status: lastError.status, retryable: lastError.retryable } : null,
      predictionStatus: lastReport?.prediction_status ?? null }),
    async close({ flush: finalFlush = false } = {}) {
      if (closed) { if (inFlight) await inFlight; return lastReport; }
      clearInterval(timer);
      // Stop collecting before waiting for at most one in-flight send and one final send.
      closed = true; if (inFlight) await inFlight;
      if (finalFlush) { sample(); return deliver(true); } return lastReport;
    } };
}

