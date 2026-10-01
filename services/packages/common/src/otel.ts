// OpenTelemetry helpers — API ONLY (no SDK).
// Telemetry is intentionally "detached": these calls are safe no-ops until a real
// OpenTelemetry SDK / Splunk (splunk-otel-js) or AppDynamics agent is injected out
// of band (e.g. via NODE_OPTIONS from a Kubernetes console / operator). This mirrors
// the Java demo's "no agents baked in" philosophy.
import {
  trace,
  context,
  metrics,
  SpanStatusCode,
  type Span,
  type Attributes,
} from '@opentelemetry/api';

const SERVICE = process.env.SERVICE_NAME || 'sea-bank-service';

export const tracer = trace.getTracer(SERVICE);
export const meter = metrics.getMeter(SERVICE);

/**
 * Run `fn` inside a new active span, applying the standard error contract
 * (setStatus(ERROR) + recordException) before ending the span.
 */
export async function withSpan<T>(
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      span.setAttributes(attrs);
      return await fn(span);
    } catch (err) {
      const e = err as Error;
      span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
      span.recordException(e);
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Trace/span ids of the currently active span (undefined when no SDK is attached). */
export function currentTraceIds(): { trace_id?: string; span_id?: string } {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const sc = span.spanContext();
  return { trace_id: sc.traceId, span_id: sc.spanId };
}

export { context, trace };
