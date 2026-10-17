# APIForesight integration — prepared, not live

Modified backend only. No database/payment business logic changed. Monitoring is off by default.

In Hostinger backend environment configure:
FORESIGHT_ENABLED=true
FORESIGHT_ENDPOINT=https://apiforesight-api.onrender.com
FORESIGHT_INGESTION_KEY=<owner-scoped ingestion key from APIForesight>
FORESIGHT_SERVICE=3dcasemakers-api

Optional FORESIGHT_CPU_CORES and FORESIGHT_MEMORY_LIMIT_MB must reflect actual process quotas; leave absent if unknown. Recommended Node 22+. Never commit secrets or use frontend VITE variables for this key.

Create your e-commerce custom connection in APIForesight first. Deploy this backend revision on Hostinger and restart. Normal real website requests produce completed-request metrics every ten seconds; do not create orders/payments for testing. Verify freshness and measured routes in Merchant traffic. Delivery failures cannot stop checkout; the queue is bounded and process-local, so prolonged outages/restarts may lose data. Disable with FORESIGHT_ENABLED=false and restart to roll back monitoring.

No live telemetry has been sent yet. Free Render sleeps; forecasts may be unavailable with incomplete history. Current synthetic model is experimental, not 90% validated.
