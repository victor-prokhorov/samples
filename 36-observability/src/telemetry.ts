// Loaded with `node --import tsx --import ./src/telemetry.ts src/<service>.ts`, before the service's own code,
// so the instrumentations patch node:http, fetch (undici), pg and pino before anything imports them.
// Configured by the standard OTel environment variables: OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT.
import { register } from "node:module";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { AggregationTemporalityPreference, OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { AggregationType, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";

// ESM: pg and pino are imported with `import`, which require-in-the-middle cannot see; this hook can.
register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

const sdk = new NodeSDK({
  // W3C traceparent is the SDK's default propagator; nothing to configure for web -> API.
  spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter(), { scheduledDelayMillis: 200 })],
  // Delta temporality: each export carries what happened since the last one, so the collector can sum
  // from any moment on (the demo starts counting after a warm-up request per route).
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ temporalityPreference: AggregationTemporalityPreference.DELTA }),
      exportIntervalMillis: 1000,
    }),
  ],
  // RED comes from the HTTP instrumentation's standard histogram http.server.request.duration (seconds).
  // Its default buckets have no edge at 0.3 s, so the share of requests within the 300 ms objective could
  // only be guessed: put an edge there.
  views: [
    {
      instrumentName: "http.server.request.duration",
      aggregation: { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM, options: { boundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2] } },
    },
  ],
  instrumentations: [
    new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => req.url === "/health" }),
    new UndiciInstrumentation(),
    // API -> Postgres: append /*traceparent='00-<trace>-<span>-01'*/ to each statement (sqlcommenter),
    // so the database log line of a query carries the same trace id as the span that sent it.
    new PgInstrumentation({ addSqlCommenterCommentToQueries: true, ignoreConnectSpans: true }),
    // Adds trace_id, span_id and trace_flags to every pino line written inside a span.
    new PinoInstrumentation({ disableLogSending: true }),
  ],
});
sdk.start();

// Flush the last batch of spans and the last metric point before the process exits.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
