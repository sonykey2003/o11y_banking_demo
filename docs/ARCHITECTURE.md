# Architecture — SEA Bank Demo

Synthetic mobile-banking demo: a React Native iOS app over a small Node.js/TypeScript
microservice mesh. Purpose-built to demonstrate **mobile RUM + backend APM** with on-demand
faults. All data is synthetic and in-memory.

## System diagram

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                          iOS device / simulator                            │
 │  ┌──────────────────────────────────────────────────────────────────┐    │
 │  │  React Native app (Splunk RUM or AppDynamics RUM — gated/optional) │    │
 │  │  Login → Dashboard(balance) → Transfer   + Brand switch + Demo ctl │    │
 │  └───────────────────────────────┬──────────────────────────────────┘    │
 └──────────────────────────────────┼───────────────────────────────────────┘
                                     │ HTTPS/JSON (Bearer token)
                                     ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                      Kubernetes namespace: sea-bank-demo                    │
 │                                                                            │
 │   ┌───────────────────────┐   POST /api/login                             │
 │   │   api-gateway :8080    │   GET  /api/dashboard  (fan-out aggregation)  │
 │   │   BFF / aggregation    │   POST /api/transfers                         │
 │   └───┬───────────┬────────┴───────────┬───────────────────────────────┐  │
 │       │           │                    │                               │  │
 │       ▼           ▼                    ▼                               │  │
 │ ┌───────────┐ ┌────────────────┐ ┌──────────────────┐                 │  │
 │ │auth :8081 │ │account :8082    │ │transfer :8083    │                 │  │
 │ │login/     │ │balance (cache), │ │validate→create→  │──debit/credit──▶│  │
 │ │session    │ │txns, debit/     │ │async settle      │  (account-svc)  │  │
 │ │           │ │credit           │ │(same trace)      │◀────────────────┘  │
 │ └───────────┘ └────────────────┘ └──────────────────┘                    │
 │                                                                            │
 │  ╔══════════════════════════════════════════════════════════════════════╗ │
 │  ║ Detached telemetry: install Node/K8s instrumentation from a console.  ║ │
 │  ║ This repo deploys only app workloads. Env tag = demoBanking-rum.            ║ │
 │  ╚══════════════════════════════════════════════════════════════════════╝ │
 └──────────────────────────────────────────────────────────────────────────┘
```

## Services

| Service | Port | Endpoints | Notes |
|---|---|---|---|
| **api-gateway** | 8080 | `/api/login`, `/api/dashboard`, `/api/accounts/:id/transactions`, `/api/transfers` (GET/POST), `/api/admin/fault` (GET/POST/DELETE) | Only backend the app calls. Validates the token against auth-service, aggregates the dashboard, and fans fault config out to every service. |
| **auth-service** | 8081 | `POST /login`, `GET /session` | Seeded demo users; HMAC demo tokens (`AUTH_SECRET`). |
| **account-service** | 8082 | `GET /accounts`, `/accounts/:id/balance`, `/accounts/:id/transactions`, `POST /accounts/:id/{debit,credit}` | Balance lookups show a **cache hit/miss** span; debit/credit invalidate the cache. |
| **transfer-service** | 8083 | `POST /transfers`, `GET /transfers`, `GET /transfers/:id` | `transfer.create` validates both accounts, then enqueues an **async settle** that replays the captured trace context and calls account-service debit/credit. |

Every service also exposes `/healthz`, `/readyz`, and the fault routes `/admin/fault`,
`/demo/slow`, `/demo/fail`, `/demo/cpu` (see [INSTRUMENTATION.md](INSTRUMENTATION.md)).

## Distributed trace shape (happy path transfer)

```
POST /api/transfers  (gateway)
└─ transfer.create            (transfer-service)
   ├─ transfer.validate_source → GET account-service /accounts/:id/balance → db.query
   ├─ transfer.validate_dest   → GET account-service /accounts/:id/balance → cache hit
   └─ (enqueue)
   … later, same trace …
   transfer.settle             (transfer-service, async)
   ├─ transfer.debit  → POST account-service /accounts/:id/debit  → db.query(UPDATE)
   └─ transfer.credit → POST account-service /accounts/:id/credit → db.query(UPDATE)
```

## Data model (in-memory, synthetic)

- **Users**: `demo/demo` (CUST-0001), `alice/password` (CUST-0002), `bob/password` (CUST-0003).
- **Accounts**: `ACC-1001/1002` (CUST-0001), `ACC-2001` (CUST-0002), `ACC-3001/3002` (CUST-0003), SGD balances.
- **Transfers**: created `PENDING`, settled to `COMPLETED`/`FAILED` by the background worker.

There is no external database. A `db.query`/cache span with a small synthetic delay simulates
the data tier so APM traces show a realistic multi-tier shape without any infra to manage.

## Telemetry contract

- Custom spans/metrics use the **OpenTelemetry API only** — safe no-ops until an SDK/agent is
  injected out of band. See [INSTRUMENTATION.md](INSTRUMENTATION.md).
- Logs are single-line JSON on stdout carrying `service.name`, `deployment.environment`, and
  `trace_id`/`span_id` (when an SDK is attached). `service.name` (not `service`) so O11y Log
  Observer Connect can filter logs by service and correlate them with APM traces.
- Resource attributes (`service.name`, `deployment.environment=demoBanking-rum`, …) come from the
  console-managed instrumentation layer, not the app manifests.
