// Demo bearer tokens: HMAC-signed JSON payloads. NOT production auth — just enough
// to carry a customerId between the app and the backend for the demo flows.
import crypto from 'node:crypto';

const SECRET = process.env.AUTH_SECRET || 'sea-bank-demo-secret';

export interface TokenPayload {
  customerId: string;
  name: string;
  exp: number;
}

export function sign(payload: Omit<TokenPayload, 'exp'>, ttlSec = 3600): string {
  const full: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verify(token: string): TokenPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
