// Account + transaction data tier backed by MySQL (bankdb), plus a tiny in-memory
// balance cache (simulates a Redis-style cache tier). All SQL runs via the shared
// mysql2 pool so queries appear in APM (db.system=mysql) and the MySQL instance is
// scraped by the Splunk DBMon `mysql` receiver.
import { query, withTx } from '@sea-bank/common';

export interface Account {
  id: string;
  customerId: string;
  type: 'SAVINGS' | 'CURRENT';
  name: string;
  currency: string;
  balance: number;
}

export interface Txn {
  id: string;
  accountId: string;
  ts: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  description: string;
}

interface AccountRow {
  id: string;
  customer_id: string;
  type: 'SAVINGS' | 'CURRENT';
  name: string;
  currency: string;
  balance: number;
}
interface TxnRow {
  id: string;
  account_id: string;
  ts: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  description: string;
}

const toAccount = (r: AccountRow): Account => ({
  id: r.id,
  customerId: r.customer_id,
  type: r.type,
  name: r.name,
  currency: r.currency,
  balance: Number(r.balance),
});

const newTxnId = (): string => `TXN-${Date.now()}${Math.floor(Math.random() * 1000)}`;

export async function listAccounts(customerId: string): Promise<Account[]> {
  const rows = await query<AccountRow>(
    'SELECT id, customer_id, type, name, currency, balance FROM accounts WHERE customer_id = ? ORDER BY id',
    [customerId],
  );
  return rows.map(toAccount);
}

export async function getAccount(id: string): Promise<Account | undefined> {
  const rows = await query<AccountRow>(
    'SELECT id, customer_id, type, name, currency, balance FROM accounts WHERE id = ? LIMIT 1',
    [id],
  );
  return rows[0] ? toAccount(rows[0]) : undefined;
}

export async function getTransactions(id: string, limit = 20): Promise<Txn[]> {
  const rows = await query<TxnRow>(
    'SELECT id, account_id, ts, amount, type, description FROM transactions WHERE account_id = ? ORDER BY ts DESC LIMIT ?',
    [id, Number(limit)],
  );
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    ts: new Date(r.ts).toISOString(),
    amount: Number(r.amount),
    type: r.type,
    description: r.description,
  }));
}

/** Apply a signed delta and record a transaction atomically. Throws on unknown account / insufficient funds. */
export async function adjustBalance(
  id: string,
  delta: number,
  type: 'DEBIT' | 'CREDIT',
  description: string,
): Promise<number> {
  return withTx(async (conn) => {
    const [rows] = await conn.query('SELECT balance FROM accounts WHERE id = ? FOR UPDATE', [id]);
    const row = (rows as { balance: number }[])[0];
    if (!row) throw Object.assign(new Error('account_not_found'), { status: 404 });
    const current = Number(row.balance);
    if (type === 'DEBIT' && current + delta < 0) {
      throw Object.assign(new Error('insufficient_funds'), { status: 409 });
    }
    const next = Math.round((current + delta) * 100) / 100;
    await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [next, id]);
    await conn.query(
      'INSERT INTO transactions (id, account_id, ts, amount, type, description) VALUES (?, ?, NOW(), ?, ?, ?)',
      [newTxnId(), id, Math.abs(delta), type, description],
    );
    return next;
  });
}

// --- Tiny balance cache (simulates a Redis-style cache tier) ---
const cache = new Map<string, { balance: number; at: number }>();
const TTL_MS = 10_000;

export function cacheGetBalance(id: string): number | undefined {
  const c = cache.get(id);
  if (c && Date.now() - c.at < TTL_MS) return c.balance;
  return undefined;
}
export function cacheSetBalance(id: string, balance: number): void {
  cache.set(id, { balance, at: Date.now() });
}
export function cacheInvalidate(id: string): void {
  cache.delete(id);
}
