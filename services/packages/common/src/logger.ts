// Structured JSON logger. Every line is a single JSON object on stdout carrying
// service + deployment.environment + trace_id/span_id (when an SDK/agent is attached),
// so an out-of-band log pipeline can trace-correlate the records.
import { currentTraceIds } from './otel';

const SERVICE = process.env.SERVICE_NAME || 'sea-bank-service';
const ENVIRONMENT = process.env.DEPLOYMENT_ENVIRONMENT || 'demoBanking-rum';

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function emit(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const { trace_id, span_id } = currentTraceIds();
  const rec = {
    '@timestamp': new Date().toISOString(),
    severity: level,
    'service.name': SERVICE,
    'deployment.environment': ENVIRONMENT,
    message,
    ...(trace_id ? { trace_id, span_id } : {}),
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(rec)}\n`);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit('DEBUG', m, f),
  info: (m: string, f?: Record<string, unknown>) => emit('INFO', m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit('WARN', m, f),
  error: (m: string, f?: Record<string, unknown>) => emit('ERROR', m, f),
};
