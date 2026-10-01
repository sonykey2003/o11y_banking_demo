import { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  createBaseApp,
  startServer,
  port,
  env,
  withSpan,
  faultMiddleware,
  callJson,
  getFaultConfig,
  setFaultConfig,
  log,
} from '@sea-bank/common';

const AUTH_URL = env('AUTH_URL', 'http://localhost:8081');
const ACCOUNT_URL = env('ACCOUNT_URL', 'http://localhost:8082');
const TRANSFER_URL = env('TRANSFER_URL', 'http://localhost:8083');

const DOWNSTREAM: Record<string, string> = { auth: AUTH_URL, account: ACCOUNT_URL, transfer: TRANSFER_URL };

// Forward the demo per-request handler-latency header (x-svc-latency-ms) to a downstream
// service so ITS latency histogram — not just the gateway — reflects the injected delay.
const svcLatency = (req: Request): Record<string, string> => {
  const v = req.header('x-svc-latency-ms');
  return v ? { 'x-svc-latency-ms': v } : {};
};

interface Session {
  customerId: string;
  name: string;
}

const app = createBaseApp();
app.use(cors());

// Friendly landing page: this is a JSON API for the SEA Bank iOS app, not a website.
// Hitting `/` in a browser now lists what's available instead of "Cannot GET /".
app.get('/', (_req, res) => {
  res.json({
    service: 'sea-bank-demo api-gateway',
    note: 'JSON API for the SEA Bank React Native iOS app — there is no web UI. Run the app in the iOS Simulator.',
    health: ['/healthz', '/readyz'],
    api: [
      'POST /api/login',
      'GET  /api/dashboard        (Bearer token)',
      'GET  /api/accounts/:id/balance      (Bearer token)',
      'GET  /api/accounts/:id/transactions (Bearer token)',
      'GET  /api/transfers        (Bearer token)',
      'POST /api/transfers        (Bearer token)',
      'GET|POST|DELETE /api/admin/fault',
    ],
    demoUsers: ['demo/demo', 'alice/password', 'bob/password'],
  });
});

// --- Admin fault routes are registered BEFORE the gateway fault middleware so a
//     100% error injection can never lock you out of clearing it. ---
app.post('/api/admin/fault', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const target = String((req.query.service ?? body.service ?? 'all') as string);
  const results: Record<string, unknown> = {};
  const entries = target === 'all' ? Object.entries(DOWNSTREAM) : Object.entries(DOWNSTREAM).filter(([k]) => k === target);
  await Promise.all(
    entries.map(async ([name, url]) => {
      try {
        results[name] = await callJson(`${url}/admin/fault`, { method: 'POST', body });
      } catch (e) {
        results[name] = { error: (e as Error).message };
      }
    }),
  );
  if (target === 'all' || target === 'gateway') {
    results.gateway = setFaultConfig({
      latencyMs: body.latencyMs !== undefined ? Number(body.latencyMs) : undefined,
      errorRate: body.errorRate !== undefined ? Number(body.errorRate) : undefined,
    });
  }
  log.warn('fault config broadcast', { target });
  res.json(results);
});

app.get('/api/admin/fault', async (_req, res) => {
  const results: Record<string, unknown> = { gateway: getFaultConfig() };
  await Promise.all(
    Object.entries(DOWNSTREAM).map(async ([name, url]) => {
      try {
        results[name] = await callJson(`${url}/admin/fault`);
      } catch (e) {
        results[name] = { error: (e as Error).message };
      }
    }),
  );
  res.json(results);
});

app.delete('/api/admin/fault', async (_req, res) => {
  const results: Record<string, unknown> = { gateway: setFaultConfig({ latencyMs: 0, errorRate: 0 }) };
  await Promise.all(
    Object.entries(DOWNSTREAM).map(async ([name, url]) => {
      try {
        results[name] = await callJson(`${url}/admin/fault`, { method: 'DELETE' });
      } catch (e) {
        results[name] = { error: (e as Error).message };
      }
    }),
  );
  res.json(results);
});

// Gateway-level injected faults apply to the app-facing /api routes below.
app.use('/api', faultMiddleware());

app.post('/api/login', async (req, res, next) => {
  try {
    const out = await callJson(`${AUTH_URL}/login`, { method: 'POST', body: req.body, headers: svcLatency(req) });
    res.json(out);
  } catch (e) {
    if ((e as { status?: number }).status === 401) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    next(e);
  }
});

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.header('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }
  try {
    const session = await callJson<Session>(`${AUTH_URL}/session`, { headers: { authorization: auth } });
    (req as Request & { session?: Session }).session = session;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

const sessionOf = (req: Request): Session => (req as Request & { session: Session }).session;

app.get('/api/dashboard', requireAuth, async (req, res, next) => {
  const { customerId, name } = sessionOf(req);
  try {
    const out = await withSpan('gateway.dashboard', { customer_id: customerId }, async () => {
      const [accountsRes, transfersRes] = await Promise.all([
        callJson<{ accounts: unknown[] }>(`${ACCOUNT_URL}/accounts?customerId=${encodeURIComponent(customerId)}`),
        callJson<{ transfers: unknown[] }>(`${TRANSFER_URL}/transfers?customerId=${encodeURIComponent(customerId)}`),
      ]);
      return { name, customerId, accounts: accountsRes.accounts, transfers: transfersRes.transfers };
    });
    res.json(out);
  } catch (e) {
    next(e);
  }
});

app.get('/api/accounts', requireAuth, async (req, res, next) => {
  try {
    res.json(await callJson(`${ACCOUNT_URL}/accounts?customerId=${encodeURIComponent(sessionOf(req).customerId)}`));
  } catch (e) {
    next(e);
  }
});

app.get('/api/accounts/:id/transactions', requireAuth, async (req, res, next) => {
  try {
    res.json(await callJson(`${ACCOUNT_URL}/accounts/${encodeURIComponent(req.params.id)}/transactions`));
  } catch (e) {
    next(e);
  }
});

app.get('/api/accounts/:id/balance', requireAuth, async (req, res, next) => {
  try {
    res.json(await callJson(`${ACCOUNT_URL}/accounts/${encodeURIComponent(req.params.id)}/balance`, { headers: svcLatency(req) }));
  } catch (e) {
    next(e);
  }
});

app.get('/api/transfers', requireAuth, async (req, res, next) => {
  try {
    res.json(await callJson(`${TRANSFER_URL}/transfers?customerId=${encodeURIComponent(sessionOf(req).customerId)}`));
  } catch (e) {
    next(e);
  }
});

app.post('/api/transfers', requireAuth, async (req, res, next) => {
  try {
    const out = await callJson(`${TRANSFER_URL}/transfers`, {
      method: 'POST',
      body: { ...(req.body ?? {}), customerId: sessionOf(req).customerId },
    });
    res.status(202).json(out);
  } catch (e) {
    next(e);
  }
});

startServer(app, port(8080));
