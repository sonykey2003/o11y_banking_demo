import {
  createBaseApp,
  startServer,
  port,
  withSpan,
  meter,
  faultMiddleware,
  sleep,
  log,
} from '@sea-bank/common';
import { findUser } from './users';
import { sign, verify } from './tokens';

const app = createBaseApp();

const loginCounter = meter.createCounter('auth_login_total', {
  description: 'Login attempts by result',
});
const loginLatency = meter.createHistogram('auth_login_latency', {
  description: 'Login handler latency',
  unit: 's',
});

// Feature routes are subject to injected faults.
app.use(faultMiddleware());

app.post('/login', async (req, res, next) => {
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  try {
    const t0 = Date.now();
    const result = await withSpan(
      'auth.login',
      { 'enduser.id': username ?? 'unknown' },
      async (span) => {
        // Optional demo latency (x-svc-latency-ms) applied INSIDE the measured window so
        // auth_login_latency reflects it.
        const extraMs = Number(req.header('x-svc-latency-ms') ?? 0);
        if (extraMs > 0) {
          span.setAttribute('demo.injected_latency_ms', extraMs);
          await sleep(extraMs);
        }
        // Simulate a credential-store lookup so the trace shows a data-tier span.
        await withSpan('db.query', { 'db.operation': 'SELECT', 'db.table': 'users' }, () => sleep(15));
        const user = findUser(String(username ?? ''), String(password ?? ''));
        if (!user) {
          span.setAttribute('auth.result', 'denied');
          loginCounter.add(1, { result: 'denied' });
          return null;
        }
        span.setAttribute('auth.result', 'granted');
        span.setAttribute('customer_id', user.customerId);
        loginCounter.add(1, { result: 'granted' });
        return { token: sign({ customerId: user.customerId, name: user.name }), customerId: user.customerId, name: user.name };
      },
    );
    loginLatency.record((Date.now() - t0) / 1000, { result: result ? 'granted' : 'denied' });

    if (!result) {
      log.warn('login denied', { username });
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    log.info('login granted', { customer_id: result.customerId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/session', (req, res) => {
  const auth = req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verify(token);
  if (!payload) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }
  res.json({ customerId: payload.customerId, name: payload.name });
});

startServer(app, port(8081));
