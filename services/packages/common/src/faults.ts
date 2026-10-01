// Fault injection for the APM/RUM demo.
//
// Two ways to inject faults, so the RN "Demo Controls" panel and the load-generator
// can both drive them:
//   1. Per-request headers   x-fault-latency-ms / x-fault-error-rate   (win over globals)
//   2. Global config via     POST /admin/fault { latencyMs, errorRate }
// Plus stand-alone demo endpoints /demo/slow, /demo/fail, /demo/cpu.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { trace } from '@opentelemetry/api';
import { log } from './logger';

export interface FaultConfig {
  /** Fixed latency (ms) added to every request. */
  latencyMs: number;
  /** Fraction [0..1] of requests failed with HTTP 500, applied DETERMINISTICALLY
   *  (evenly spaced, not random): 0.5 fails every other request, 0.25 every 4th, etc. */
  errorRate: number;
  /** Derived: true when any fault is active. */
  enabled: boolean;
}

const config: FaultConfig = { latencyMs: 0, errorRate: 0, enabled: false };

export function getFaultConfig(): FaultConfig {
  return { ...config };
}

export function setFaultConfig(patch: Partial<Pick<FaultConfig, 'latencyMs' | 'errorRate'>>): FaultConfig {
  if (patch.latencyMs !== undefined && Number.isFinite(patch.latencyMs)) {
    config.latencyMs = Math.max(0, patch.latencyMs);
  }
  if (patch.errorRate !== undefined && Number.isFinite(patch.errorRate)) {
    config.errorRate = Math.min(1, Math.max(0, patch.errorRate));
  }
  config.enabled = config.latencyMs > 0 || config.errorRate > 0;
  return getFaultConfig();
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Deterministic, evenly-spaced fault selection so an errorRate of 0.5 yields a strict
// alternation (1 ok, 1 fail, 1 ok, ...) instead of Math.random()'s probabilistic
// outcome — which, once the gateway fans out to several services each rolling their
// own dice, pushed the observed failure rate close to 100%. 0.25 -> every 4th request
// fails, 1.0 -> every request. The counter is per service process.
let faultRequestCounter = 0;
function shouldFailDeterministic(rate: number): boolean {
  if (rate >= 1) return true;
  const n = faultRequestCounter++;
  return Math.floor(n * rate) < Math.floor((n + 1) * rate);
}

function headerNumber(req: Request, name: string): number | undefined {
  const raw = req.header(name);
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Applies global + per-request faults. Header values override globals per-request. */
export function faultMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // The entry service (api-gateway) is the single fault authority: it sends
    // `x-fault-skip` on every downstream call (see callJson), so fanned-out services
    // don't each roll their own fault. This keeps a user action deterministic — with
    // the evenly-spaced counter, 0.5 = a clean 1-ok/1-fail alternation as the app sees
    // it, instead of failures compounding across the gateway + auth + account + transfer.
    if (req.header('x-fault-skip')) {
      next();
      return;
    }

    const latency = headerNumber(req, 'x-fault-latency-ms') ?? config.latencyMs;
    const errorRate = headerNumber(req, 'x-fault-error-rate') ?? config.errorRate;

    if (latency > 0) {
      trace.getActiveSpan()?.setAttribute('synthetic.delay_ms', latency);
      await sleep(latency);
    }
    if (errorRate > 0 && shouldFailDeterministic(errorRate)) {
      trace.getActiveSpan()?.setAttribute('synthetic.forced_error', true);
      log.error('synthetic fault injected', { path: req.path, error_rate: errorRate });
      res.status(500).json({ error: 'synthetic_fault', message: 'Injected fault for demo purposes' });
      return;
    }
    next();
  };
}

/** Admin + stand-alone demo fault endpoints. Mount once per service. */
export function faultRouter(): Router {
  const r = Router();

  r.get('/admin/fault', (_req, res) => res.json(getFaultConfig()));
  r.post('/admin/fault', (req, res) => {
    const { latencyMs, errorRate } = (req.body ?? {}) as Record<string, unknown>;
    const updated = setFaultConfig({
      latencyMs: latencyMs !== undefined ? Number(latencyMs) : undefined,
      errorRate: errorRate !== undefined ? Number(errorRate) : undefined,
    });
    log.warn('fault config updated', { ...updated });
    res.json(updated);
  });
  r.delete('/admin/fault', (_req, res) => res.json(setFaultConfig({ latencyMs: 0, errorRate: 0 })));

  r.get('/demo/slow', async (req, res) => {
    const ms = Number(req.query.delay_ms ?? 3000);
    trace.getActiveSpan()?.setAttribute('synthetic.delay_ms', ms);
    await sleep(ms);
    res.json({ ok: true, delayed_ms: ms });
  });
  r.get('/demo/fail', (_req, res) => {
    trace.getActiveSpan()?.setAttribute('synthetic.forced_error', true);
    res.status(500).json({ error: 'demo_fail', message: 'Deliberate demo failure' });
  });
  r.get('/demo/cpu', (req, res) => {
    const ms = Number(req.query.ms ?? 500);
    const end = Date.now() + ms;
    let x = 0;
    while (Date.now() < end) x += Math.sqrt(Math.random());
    res.json({ ok: true, burned_ms: ms, checksum: x });
  });

  return r;
}
