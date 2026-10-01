# Instrumentation Catalog — SEA Bank Demo

Source of truth for the custom telemetry and fault surfaces emitted by the backend.
All custom telemetry uses the **OpenTelemetry API only** (`@opentelemetry/api`) via the
`withSpan()` / `meter` helpers in `services/packages/common`. It is a safe no-op until a real
SDK/agent is injected out of band (see [OBSERVABILITY.md](OBSERVABILITY.md)).

## Custom spans

| Span | Service | Parent | Key attributes |
|---|---|---|---|
| `auth.login` | auth-service | `POST /login` | `enduser.id`, `auth.result`, `customer_id` |
| `db.query` | all | varies | `db.operation`, `db.table` (simulated data tier) |
| `account.list` | account-service | `GET /accounts` | `customer_id` |
| `account.balance_fetch` | account-service | `GET /accounts/:id/balance` | `account_id`, `cache.hit` |
| `account.transactions` | account-service | `GET /accounts/:id/transactions` | `account_id` |
| `account.debit` / `account.credit` | account-service | `POST /accounts/:id/{debit,credit}` | `account_id`, `amount` |
| `transfer.create` | transfer-service | `POST /transfers` | `customer_id`, `from_account`, `to_account`, `amount`, `transfer_id` |
| `transfer.validate_source` / `transfer.validate_dest` | transfer-service | `transfer.create` | `account_id` |
| `transfer.settle` | transfer-service | (async, continues `transfer.create` trace) | `transfer_id`, `transfer.status` |
| `transfer.debit` / `transfer.credit` | transfer-service | `transfer.settle` | `account_id`, `amount` |
| `gateway.dashboard` | api-gateway | `GET /api/dashboard` | `customer_id` |

**Error contract:** `withSpan()` sets `StatusCode.ERROR` and calls `recordException` before
ending the span on any thrown error.

**Async propagation:** `transfer.settle` runs inside `context.with(capturedContext, …)` where
`capturedContext` was taken at enqueue time, so the async settlement joins the same trace as
`transfer.create`.

## Custom metrics

| Metric | Type | Service | Dimensions |
|---|---|---|---|
| `auth_login_total` | Counter | auth-service | `result` (granted/denied) |
| `account_balance_requests_total` | Counter | account-service | `cache` (hit/miss) |
| `transfer_created_total` | Counter | transfer-service | `status` (PENDING/COMPLETED/FAILED) |
| `transfer_amount` | Histogram | transfer-service | `currency` |
| `transfer_duration_seconds` | Histogram | transfer-service | `currency` |
| `transfer_queue_depth` | ObservableGauge | transfer-service | — |

## Fault / synthetic attributes

| Attribute | Set where | Meaning |
|---|---|---|
| `synthetic.delay_ms` | fault middleware / `/demo/slow` | Injected latency (ms) applied to the request |
| `synthetic.forced_error` | fault middleware / `/demo/fail` | Request was failed on purpose |

## Fault injection surfaces

Implemented in `services/packages/common/src/faults.ts`, mounted by every service.

| Surface | How | Effect |
|---|---|---|
| Per-request headers | `x-fault-latency-ms: <ms>`, `x-fault-error-rate: <0..1>` | Overrides globals for that request only. The app's Demo Controls and `load-generator.sh latency/fail` use these. |
| Global config | `POST /admin/fault {latencyMs,errorRate}` (per service) or `POST /api/admin/fault {service,latencyMs,errorRate}` (gateway fan-out; `service` = `all`/`gateway`/`auth`/`account`/`transfer`) | Applies to all requests until cleared |
| Clear | `DELETE /admin/fault` or `DELETE /api/admin/fault` | Removes all injected faults |
| Stand-alone | `GET /demo/slow?delay_ms=`, `GET /demo/fail`, `GET /demo/cpu?ms=` | One-shot latency / 500 / CPU burn |

The gateway registers `/api/admin/fault` **before** its own fault middleware, so a 100% error
injection can never lock you out of clearing it.

## Log shape

```json
{
  "@timestamp": "2026-07-20T02:20:17.385Z",
  "severity": "INFO",
  "service.name": "transfer-service",
  "deployment.environment": "demoBanking-rum",
  "message": "transfer settled",
  "trace_id": "…",
  "span_id": "…",
  "transfer_id": "TRF-5001"
}
```

Trace-correlated logs require the agent to export logs through its own pipeline (e.g. Splunk
OTel `OTEL_LOGS_EXPORTER=otlp`); stdout collection alone does not carry trace context.
