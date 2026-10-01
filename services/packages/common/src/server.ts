// Base Express app shared by every service: JSON body parsing, health/ready probes,
// the fault admin/demo routes, and a JSON error handler. Feature routers are added
// by each service on top of this.
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { faultRouter } from './faults';
import { log } from './logger';

const SERVICE = process.env.SERVICE_NAME || 'sea-bank-service';

export function createBaseApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: SERVICE }));
  app.get('/readyz', (_req, res) => res.json({ status: 'ready', service: SERVICE }));

  // Fault admin + /demo/* endpoints (kept outside the per-feature fault middleware).
  app.use(faultRouter());

  return app;
}

/** Register a JSON error handler + start listening. Call after all routes are mounted. */
export function startServer(app: Express, listenPort: number): void {
  app.use((err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status && err.status >= 400 ? err.status : 500;
    log.error('request failed', { path: req.path, status, error: err.message });
    res.status(status).json({ error: err.message || 'internal_error' });
  });

  app.listen(listenPort, () => log.info(`${SERVICE} listening`, { port: listenPort }));
}
