// Optional server-only monitoring. Misconfiguration must not stop commerce.
async function attachForesight(app, env = process.env) {
  if (env.FORESIGHT_ENABLED !== 'true') return null;
  try {
    const { createForesight } = await import('./foresight.mjs');
    const quota = name => env[name] ? Number(env[name]) : undefined;
    const reporter = createForesight({
      endpoint: env.FORESIGHT_ENDPOINT,
      apiKey: env.FORESIGHT_INGESTION_KEY,
      service: env.FORESIGHT_SERVICE || '3dcasemakers-api',
      cpuCores: quota('FORESIGHT_CPU_CORES'),
      memoryLimitMb: quota('FORESIGHT_MEMORY_LIMIT_MB'),
      onError: error => console.warn('[foresight] delivery', error.status, error.retryable),
    });
    app.use(reporter.middleware);
    console.log('[foresight] server monitoring enabled');
    return reporter;
  } catch {
    console.warn('[foresight] monitoring disabled: check server configuration');
    return null;
  }
}
module.exports = { attachForesight };
