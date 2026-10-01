import {
  createBaseApp,
  startServer,
  port,
  env,
  withSpan,
  meter,
  faultMiddleware,
  callJson,
  context,
  log,
} from '@sea-bank/common';
import { createTransfer, listTransfers, getTransfer, updateTransferStatus, enqueue, dequeue, queueDepth } from './store';

const ACCOUNT_URL = env('ACCOUNT_URL', 'http://localhost:8082');

const app = createBaseApp();

const transferCounter = meter.createCounter('transfer_created_total', { description: 'Transfers by status' });
const amountHistogram = meter.createHistogram('transfer_amount', { description: 'Transfer amounts' });
const durationHistogram = meter.createHistogram('transfer_duration_seconds', {
  description: 'Wall-clock time from create to settle',
  unit: 's',
});
meter
  .createObservableGauge('transfer_queue_depth', { description: 'Pending settlement queue depth' })
  .addCallback((o) => o.observe(queueDepth()));

interface Balance {
  accountId: string;
  balance: number;
  currency: string;
}

app.use(faultMiddleware());

app.post('/transfers', async (req, res, next) => {
  const { customerId, fromAccountId, toAccountId, amount, currency } = (req.body ?? {}) as Record<string, unknown>;
  try {
    const transfer = await withSpan(
      'transfer.create',
      {
        customer_id: String(customerId ?? ''),
        from_account: String(fromAccountId ?? ''),
        to_account: String(toAccountId ?? ''),
        amount: Number(amount),
      },
      async (span) => {
        if (!customerId || !fromAccountId || !toAccountId || amount === undefined) {
          throw Object.assign(new Error('missing_fields'), { status: 400 });
        }
        const amt = Number(amount);
        if (!(amt > 0)) throw Object.assign(new Error('invalid_amount'), { status: 400 });

        const src = await withSpan('transfer.validate_source', { account_id: String(fromAccountId) }, () =>
          callJson<Balance>(`${ACCOUNT_URL}/accounts/${fromAccountId}/balance`),
        );
        const dst = await withSpan('transfer.validate_dest', { account_id: String(toAccountId) }, () =>
          callJson<Balance>(`${ACCOUNT_URL}/accounts/${toAccountId}/balance`),
        );

        if (src.balance < amt) throw Object.assign(new Error('insufficient_funds'), { status: 409 });

        const tr = await createTransfer({
          customerId: String(customerId),
          fromAccountId: String(fromAccountId),
          toAccountId: String(toAccountId),
          amount: amt,
          currency: String(currency ?? dst.currency ?? 'SGD'),
        });
        span.setAttribute('transfer_id', tr.id);
        amountHistogram.record(amt, { currency: tr.currency });
        transferCounter.add(1, { status: 'PENDING' });
        enqueue(tr.id);
        log.info('transfer created', { transfer_id: tr.id, amount: amt });
        return tr;
      },
    );
    res.status(202).json(transfer);
  } catch (err) {
    next(err);
  }
});

app.get('/transfers', async (req, res, next) => {
  const customerId = String(req.query.customerId ?? '');
  if (!customerId) {
    res.status(400).json({ error: 'customerId_required' });
    return;
  }
  try {
    res.json({ transfers: await listTransfers(customerId) });
  } catch (err) {
    next(err);
  }
});

app.get('/transfers/:id', async (req, res, next) => {
  try {
    const tr = await getTransfer(req.params.id);
    if (!tr) {
      res.status(404).json({ error: 'transfer_not_found' });
      return;
    }
    res.json(tr);
  } catch (err) {
    next(err);
  }
});

// --- async settlement worker: replay captured trace context so the settle span
//     continues the same distributed trace as transfer.create ---
async function settle(transferId: string): Promise<void> {
  await withSpan('transfer.settle', { transfer_id: transferId }, async (span) => {
    const tr = await getTransfer(transferId);
    if (!tr) return;
    try {
      await withSpan('transfer.debit', { account_id: tr.fromAccountId, amount: tr.amount }, () =>
        callJson(`${ACCOUNT_URL}/accounts/${tr.fromAccountId}/debit`, {
          method: 'POST',
          body: { amount: tr.amount, description: `Transfer to ${tr.toAccountId}` },
        }),
      );
      await withSpan('transfer.credit', { account_id: tr.toAccountId, amount: tr.amount }, () =>
        callJson(`${ACCOUNT_URL}/accounts/${tr.toAccountId}/credit`, {
          method: 'POST',
          body: { amount: tr.amount, description: `Transfer from ${tr.fromAccountId}` },
        }),
      );
      const completedAt = new Date().toISOString();
      await updateTransferStatus(tr.id, 'COMPLETED');
      span.setAttribute('transfer.status', 'COMPLETED');
      durationHistogram.record((Date.parse(completedAt) - Date.parse(tr.createdAt)) / 1000, {
        currency: tr.currency,
      });
      transferCounter.add(1, { status: 'COMPLETED' });
      log.info('transfer settled', { transfer_id: tr.id });
    } catch (err) {
      const e = err as Error;
      await updateTransferStatus(tr.id, 'FAILED', e.message);
      span.setAttribute('transfer.status', 'FAILED');
      span.recordException(e);
      transferCounter.add(1, { status: 'FAILED' });
      log.error('transfer failed', { transfer_id: tr.id, error: e.message });
    }
  });
}

setInterval(() => {
  const item = dequeue();
  if (item) void context.with(item.ctx, () => settle(item.transferId));
}, 200);

startServer(app, port(8083));
