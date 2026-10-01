// Transfer records persisted in MySQL (bankdb.transfers) + a simple in-memory async
// settlement queue. The W3C trace context captured at enqueue time is replayed during
// settlement so the async settle span joins the same distributed trace as transfer.create.
import { context, query } from '@sea-bank/common';
import type { Context } from '@opentelemetry/api';

export type TransferStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface Transfer {
  id: string;
  customerId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  status: TransferStatus;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

interface TransferRow {
  id: string;
  customer_id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  currency: string;
  status: TransferStatus;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

const toTransfer = (r: TransferRow): Transfer => ({
  id: r.id,
  customerId: r.customer_id,
  fromAccountId: r.from_account_id,
  toAccountId: r.to_account_id,
  amount: Number(r.amount),
  currency: r.currency,
  status: r.status,
  createdAt: new Date(r.created_at).toISOString(),
  completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : undefined,
  error: r.error ?? undefined,
});

const newTransferId = (): string => `TRF-${Date.now()}${Math.floor(Math.random() * 1000)}`;

export async function createTransfer(
  input: Omit<Transfer, 'id' | 'status' | 'createdAt'>,
): Promise<Transfer> {
  const id = newTransferId();
  await query(
    `INSERT INTO transfers (id, customer_id, from_account_id, to_account_id, amount, currency, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NOW())`,
    [id, input.customerId, input.fromAccountId, input.toAccountId, input.amount, input.currency],
  );
  const rows = await query<TransferRow>('SELECT * FROM transfers WHERE id = ? LIMIT 1', [id]);
  return toTransfer(rows[0]);
}

export async function listTransfers(customerId: string): Promise<Transfer[]> {
  const rows = await query<TransferRow>(
    'SELECT * FROM transfers WHERE customer_id = ? ORDER BY created_at DESC',
    [customerId],
  );
  return rows.map(toTransfer);
}

export async function getTransfer(id: string): Promise<Transfer | undefined> {
  const rows = await query<TransferRow>('SELECT * FROM transfers WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? toTransfer(rows[0]) : undefined;
}

/** Update a transfer's terminal status (COMPLETED/FAILED) + completion time / error. */
export async function updateTransferStatus(
  id: string,
  status: TransferStatus,
  error?: string,
): Promise<void> {
  await query('UPDATE transfers SET status = ?, completed_at = NOW(), error = ? WHERE id = ?', [
    status,
    error ?? null,
    id,
  ]);
}

// --- settlement queue ---
export interface QueueItem {
  transferId: string;
  ctx: Context;
}

const queue: QueueItem[] = [];

export function enqueue(transferId: string): void {
  queue.push({ transferId, ctx: context.active() });
}

export function dequeue(): QueueItem | undefined {
  return queue.shift();
}

export function queueDepth(): number {
  return queue.length;
}
