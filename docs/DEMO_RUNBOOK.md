# Demo Runbook — SEA Bank

A tight 10-minute flow for a live RUM + APM demo.

## Before the room

```bash
# Backend up
minikube start -p sea-bank-demo --cpus=4 --memory=6144
kubectl config use-context sea-bank-demo
eval "$(minikube -p sea-bank-demo docker-env)"
././scripts/build-images.sh && ./scripts/deploy.sh && ./scripts/smoke-test.sh

# App up (one-time native bootstrap already done via ./scripts/init-ios.sh)
./scripts/port-forward-gateway.sh &     # http://localhost:8080
cd app-ios && npm run ios
```

- Confirm RUM is configured for the platform you're demoing (`app-ios/src/config.ts`).
- Pre-pick the brand for the audience on the Login screen → **Switch bank brand**.

## 1. Re-brand live (30s)

Login → **Switch bank brand** → tap through DBS / Maybank / SCB / BCA / … The whole app
re-skins instantly (logo monogram + palette). Great opener: "same app, any of your brands."

## 2. Happy path (2 min)

- Log in as `demo/demo`.
- Show **Dashboard**: accounts + balances (pull-to-refresh).
- **Transfer money** ACC-1001 → ACC-1002, submit. Note it returns `PENDING` and settles async.
- In APM: open the trace — `gateway.dashboard` fan-out, and the transfer trace with the async
  `transfer.settle` continuing the same trace. In RUM: show the session, screens, network spans.

## 3. Inject latency (2 min)

```bash
./scripts/fault-inject.sh latency 2000
./scripts/load-generator.sh --scenario mixed --rps 3 --duration 90 &
```
- APM: p95 latency climbs; `synthetic.delay_ms` on spans.
- RUM: slower network spans / screen load; correlate a slow session to the backend trace.
- Clear: `./scripts/fault-inject.sh clear`.

## 4. Inject errors (2 min)

```bash
./scripts/fault-inject.sh error 0.5
```
- Retry a transfer / refresh dashboard a few times → intermittent failures.
- APM: error rate + errored spans (`synthetic.forced_error`).
- RUM: errored network requests surface in the session.
- Clear: `./scripts/fault-inject.sh clear`.

## 5. Client-side RUM (2 min)

App → **Demo Controls**:
- **Throw uncaught error** → crash/error report in RUM.
- **Unhandled promise rejection** → unhandled rejection.
- **Freeze JS thread (2s)** → jank / slow render.
- **Per-request fault headers** toggles → slow/failed backend calls initiated from the app.

## 6. Wrap (30s)

- One React Native app, 15 brands, full RUM + APM story, faults on demand.
- Everything is synthetic; instrumentation is detached and grouped under `demoBanking-rum`.

## Reset between runs

```bash
./scripts/fault-inject.sh clear
# balances/transfers are in-memory; restart pods to reset seed data:
kubectl -n sea-bank-demo rollout restart deploy/account-service deploy/transfer-service
```
