// Shared MySQL connection pool for the SEA Bank demo data tier.
//
// Real SQL (via mysql2) — auto-instrumented by the Splunk Node.js OTel agent, so
// queries show as db.system=mysql spans in APM (Database Query Performance / inferred
// service) and the same MySQL instance is scraped by the Splunk DBMon `mysql` receiver.
import mysql from 'mysql2/promise';
import { env } from './config';

export const pool = mysql.createPool({
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'bankapp'),
  password: env('DB_PASSWORD', 'bankapp-pw'),
  database: env('DB_NAME', 'bankdb'),
  waitForConnections: true,
  connectionLimit: 10,
  // Return DECIMAL/BIGINT as JS numbers for this demo (values are small).
  decimalNumbers: true,
});

/** Convenience query helper returning rows as an array of T. */
export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

/** Run fn inside a transaction on a dedicated connection (BEGIN/COMMIT/ROLLBACK). */
export async function withTx<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore rollback error */
    }
    throw err;
  } finally {
    conn.release();
  }
}
