// Downstream HTTP helper. The injected HTTP client instrumentation owns W3C trace
// propagation so the propagated parent is the outbound client span.

export interface CallOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Forwarded fault headers, if the caller wants to propagate demo faults downstream. */
  faultHeaders?: Record<string, string>;
  /** When false (default) the downstream service is told to SKIP fault injection, so the
   *  entry service is the single fault authority (no compounding across fan-out). Set
   *  true only to intentionally let the downstream roll its own faults. */
  injectFaults?: boolean;
}

export async function callJson<T>(url: string, opts: CallOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(opts.injectFaults ? {} : { 'x-fault-skip': '1' }),
    ...(opts.headers ?? {}),
    ...(opts.faultHeaders ?? {}),
  };

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`downstream ${res.status} ${url}: ${text}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/** Extract fault headers from an inbound request-like header bag to forward downstream. */
export function extractFaultHeaders(get: (name: string) => string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const latency = get('x-fault-latency-ms');
  const errorRate = get('x-fault-error-rate');
  if (latency) out['x-fault-latency-ms'] = latency;
  if (errorRate) out['x-fault-error-rate'] = errorRate;
  return out;
}
