# Backend Observability (APM) — detached / console-managed

This repo deploys **only application workloads**. It ships no OpenTelemetry SDK, no agents,
no exporters, and no ingest tokens. The services emit custom spans/metrics through the
**OpenTelemetry API**, which stays a no-op until you attach a real SDK/agent out of band.
Everything is tagged with `deployment.environment = demoBanking-rum`.

You pick the platform: **Splunk Observability Cloud** or **AppDynamics**.

---

## Option A — Splunk Observability Cloud (OpenTelemetry)

Use the **OpenTelemetry Operator** auto-instrumentation for Node.js, or the Splunk OTel
Collector chart's operator, to inject `splunk-otel-js` via `NODE_OPTIONS` — no image changes.

1. Install the Splunk OTel Collector + Operator (from the Splunk O11y console / Helm).
2. Create an `Instrumentation` CR for Node.js and annotate the `sea-bank-demo` namespace or
   the deployments, e.g.:

   ```yaml
   metadata:
     annotations:
       instrumentation.opentelemetry.io/inject-nodejs: "true"
   ```

3. Ensure resource attributes carry the environment tag:

   ```yaml
   spec:
     nodejs:
       env:
         - name: OTEL_RESOURCE_ATTRIBUTES
           value: "deployment.environment=demoBanking-rum"
         - name: OTEL_LOGS_EXPORTER      # trace-correlated logs (optional)
           value: otlp
   ```

4. Restart the deployments. `service.name` is derived from the workload; custom spans
   (`transfer.create`, `account.balance_fetch`, …) and metrics appear automatically.

### Service-map links and MySQL

- `callJson()` must let the injected `undici` instrumentation write `traceparent`. Injecting
  the active context before `fetch()` makes the downstream server span bypass the HTTP client
  span, so the trace continues but APM cannot draw a service-map edge.
- The injected `mysql2` instrumentation emits client spans with `db.system=mysql` and
  `db.name=bankdb`, but its legacy attributes do not provide a deterministic inferred-service
  identity. `scripts/splunk-instrumentation.sh` enriches those spans with
  `peer.service=mysql:bankdb` and the MySQL service address/port in the collector trace pipeline.
  This produces the inferred `mysql:bankdb` APM node; it represents the database dependency,
  while the Kubernetes pod remains available through APM infrastructure correlation.

## APM ⇄ Infrastructure correlation

Two different joins, do not conflate them:

- **Service-level** (APM service → its pods/nodes): keyed on `k8s.cluster.name` +
  `k8s.pod.name`/`k8s.namespace.name`. Provided by the `k8s_attributes` processor plus the CR
  `spec.resource.resourceAttributes` (`deployment.environment`, `k8s.cluster.name`). Handled by
  `scripts/splunk-instrumentation.sh` and re-stamped by `scripts/splunk-logs.sh`.
- **Per-instance** (APM → *Service Instances* → an instance → *Infrastructure metrics* panel):
  keyed **only** on `service.instance.id`, and the value it expects is the pod's **k8s runtime
  `container.id`** (the "Active Container ID" the panel displays). If they don't match, the panel
  reads *"Infrastructure data is not available for this instance."*

**The `container.id` trap (minikube/docker).** The Node agent (`splunk-otel-js`) stamps a
**cgroup-derived** `container.id` on the span that does **not** equal the k8s runtime
`container.id` reported by Infrastructure Monitoring. So even setting
`service.instance.id = container.id` fails while the app-set value is present. `k8s_attributes`
enriches `container.id` with `insert` semantics (it won't overwrite an existing key), so the
app-set value must be removed first.

**Fix (entirely collector-side, language-agnostic — no app/CR change).** In the traces pipeline
(`scripts/splunk-instrumentation.sh`):

1. `transform/clear_container_id` → `delete_key(resource.attributes, "container.id")` **before**
   `k8s_attributes`.
2. `k8s_attributes` then **inserts** the real runtime `container.id` from the k8s API.
3. `transform/set_instance_id` → `set(service.instance.id, container.id)` **after**
   `k8s_attributes`.

Pipeline order: `["memory_limiter","transform/clear_container_id","k8s_attributes","transform/set_instance_id","batch",…]`.
`signalfx` is kept in the traces `exporters` for correlation only (it writes
`sf_service`/`sf_environment` onto the infra dimensions; it does not export spans — `otlp_http`
does). This survives `--reuse-values`, so the log leg (`splunk-logs.sh`) preserves it.

Verify all three match (per pod):

```bash
POD=$(kubectl get pod -n sea-bank-demo -l app=transfer-service -o jsonpath='{.items[0].metadata.name}')
kubectl get pod "$POD" -n sea-bank-demo -o jsonpath='{.status.containerStatuses[0].containerID}'   # runtime container.id
# then confirm the span's container.id == service.instance.id via the collector debug exporter
```

## Option B — AppDynamics (Node.js agent)

Inject the AppDynamics Node.js agent out of band (init container / `NODE_OPTIONS=-r appdynamics`
or the AppDynamics Operator). Set the controller/app/tier and environment to `demoBanking-rum`.
The OpenTelemetry-API custom spans surface as exit/entry calls and business transactions per
the agent's OTel bridge; the HTTP fan-out (gateway → services → account-service) shows the
distributed flow.

---

## What to show

- **Service map / flow map**: app → api-gateway → {auth, account, transfer} → account-service.
- **A transfer trace**: `transfer.create` → validate ×2 → async `transfer.settle` → debit/credit.
- **Latency spike**: `./scripts/fault-inject.sh latency 2000` then watch p95 climb.
- **Error rate**: `./scripts/fault-inject.sh error 0.5` then watch the error % and failed spans.
- **Metrics**: `transfer_created_total`, `account_balance_requests_total{cache}`, `transfer_queue_depth`.

## Trace-correlated logs

Logs are single-line JSON with `trace_id`/`span_id` already present (when an SDK is attached).
To make them queryable + trace-linked you must **export logs through the agent's pipeline**
(e.g. Splunk OTel `OTEL_LOGS_EXPORTER=otlp`). Collecting container stdout alone does not carry
trace context. See the Java demo's `scripts/splunk-logs.sh` for the Log Observer Connect path.

## RUM ↔ APM correlation

The mobile RUM SDK instruments the app's network calls and, when configured, propagates
`traceparent` on the gateway requests — linking a RUM session/interaction to the backend trace.
See [RUM.md](RUM.md).
