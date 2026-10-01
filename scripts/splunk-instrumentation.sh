#!/usr/bin/env bash
# scripts/splunk-instrumentation.sh
# ─────────────────────────────────────────────────────────────────────────────
# One-shot, idempotent Splunk Observability Cloud instrumentation for the
# SEA Bank demo (traces + metrics for the Node.js services).
#
#   connect    Install the Splunk Distribution of the OTel Collector + Operator
#              (Helm) into a SEPARATE namespace (OTEL_NAMESPACE, default splunk-otel).
#   instrument Point the Node.js services (namespace APP_NAMESPACE=sea-bank-demo)
#              at the collector via zero-code auto-instrumentation (OTel Operator).
#   verify     Confirm collector pods are up and the Node agent is injected.
#   all        connect -> instrument -> verify.
#   status     Show current integration state.
#   uninstall  Remove instrumentation + the collector release.
#
# The collector lives in its own namespace; the OTel Operator is cluster-scoped, so
# it injects into sea-bank-demo pods via a cross-namespace "<otel-ns>/<name>" ref.
# Everything is tagged deployment.environment=demoBanking-rum.
#
# Needs SPLUNK_REALM + SPLUNK_ACCESS_TOKEN. Config comes from the repo-root .env
# (see .env.example). Secrets may be raw or 1Password refs (op://...), resolved
# via `op read`.
# Usage: ./scripts/splunk-instrumentation.sh <command> [--dry-run] [--env-file PATH]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_ENV_FILE="${ROOT}/.env"

DRY_RUN=0
ENV_FILE="${DEMO_ENV_FILE:-${DEFAULT_ENV_FILE}}"

# Node.js services that get auto-instrumented.
NODE_SERVICES=(api-gateway auth-service account-service transfer-service)
INJECT_ANNOTATION="instrumentation.opentelemetry.io/inject-nodejs"
HELM_REPO_NAME="splunk-otel-collector-chart"
HELM_REPO_URL="https://signalfx.github.io/splunk-otel-collector-chart"
HELM_CHART="${HELM_REPO_NAME}/splunk-otel-collector"

c_reset=$'\033[0m'; c_blue=$'\033[34m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_bold=$'\033[1m'
step() { printf '\n%s==> %s%s\n' "${c_bold}${c_blue}" "$*" "${c_reset}"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    %s✓ %s%s\n' "${c_green}" "$*" "${c_reset}"; }
warn() { printf '    %s! %s%s\n' "${c_yellow}" "$*" "${c_reset}" >&2; }
die()  { printf '%sError:%s %s\n' "${c_red}" "${c_reset}" "$*" >&2; exit 1; }

run() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '    %s[dry-run]%s %s\n' "${c_yellow}" "${c_reset}" "$*"
    return 0
  fi
  "$@"
}

mask() {
  local v="$1"
  if [[ -z "${v}" ]]; then printf '<unset>'; elif [[ "${#v}" -le 8 ]]; then printf '****'; else printf '****%s' "${v: -4}"; fi
}

resolve_secret() {
  local v="${1:-}"
  if [[ "${v}" == op://* ]]; then
    command -v op >/dev/null 2>&1 || die "Value is a 1Password ref but 'op' CLI is not installed: ${v}"
    op read "${v}"
  else
    printf '%s' "${v}"
  fi
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

usage() {
  cat <<EOF
${c_bold}SEA Bank demo — Splunk Observability Cloud instrumentation (backend APM)${c_reset}

Usage: $(basename "$0") <command> [options]

Commands:
  connect      Install/upgrade the Splunk OTel Collector + Operator (Helm) in OTEL_NAMESPACE.
  instrument   Enable zero-code Node.js auto-instrumentation on the sea-bank-demo services.
  verify       Confirm collector pods are up and the Node agent is injected.
  all          connect -> instrument -> verify.
  status       Show current integration state.
  uninstall    Remove instrumentation + the collector release.
  help         Show this help.

Options:
  --dry-run            Print mutating commands without executing them.
  --env-file PATH      Source config from PATH (default: ${DEFAULT_ENV_FILE}).

Config: repo-root .env (copy .env.example and fill it in).
EOF
}

load_env() {
  if [[ -f "${ENV_FILE}" ]]; then
    step "Loading config from ${ENV_FILE}"
    # shellcheck disable=SC1090
    set -a; source "${ENV_FILE}"; set +a
    ok "config loaded"
  else
    info "No env file at ${ENV_FILE} (using current environment)."
  fi

  # Map DEMO_* overrides -> the generic names used below. Collector
  # deliberately in its OWN namespace, env tag = demoBanking-rum.
  CLUSTER_NAME="${DEMO_CLUSTER_NAME:-sea-bank-demo}"
  ENVIRONMENT="${DEMO_ENVIRONMENT:-demoBanking-rum}"
  APP_NAMESPACE="${DEMO_APP_NAMESPACE:-sea-bank-demo}"
  OTEL_NAMESPACE="${DEMO_OTEL_NAMESPACE:-splunk-otel}"
  HELM_RELEASE="${HELM_RELEASE:-splunk-otel-collector}"
  PROFILING_ENABLED="${DEMO_PROFILING_ENABLED:-false}"
  DISCOVERY_ENABLED="${DEMO_DISCOVERY_ENABLED:-true}"
  # Optional high-res (1s) app metrics: comma-separated metric name(s) to store at 1s in O11y
  # (e.g. auth_login_total,account_balance_requests_total). Empty = feature off. Interval in ms.
  HIRES_METRIC="${DEMO_HIRES_METRIC:-}"
  HIRES_EXPORT_INTERVAL_MS="${DEMO_HIRES_EXPORT_INTERVAL_MS:-1000}"
  # Pin the chart version. The deployed release is 0.157.0; newer charts (0.158+/0.159) dropped
  # the top-level `certmanager` key, so an unpinned `helm upgrade` jumps to latest and fails the
  # schema. Empty = latest.
  CHART_VERSION="${DEMO_HELM_CHART_VERSION:-0.157.0}"
  # OTel Operator webhook needs cert-manager. On a fresh cluster let the chart install it.
  CERTMANAGER_ENABLED="${CERTMANAGER_ENABLED:-true}"

  SPLUNK_ACCESS_TOKEN="$(resolve_secret "${SPLUNK_ACCESS_TOKEN:-}")"
}

ensure_helm_repo() {
  if ! helm repo list 2>/dev/null | grep -q "^${HELM_REPO_NAME}[[:space:]]"; then
    run helm repo add "${HELM_REPO_NAME}" "${HELM_REPO_URL}"
  fi
  run helm repo update "${HELM_REPO_NAME}" >/dev/null
}

# Create the chart secret so the token never appears in `helm get values`.
ensure_secret() {
  local args=(create secret generic "${HELM_RELEASE}" -n "${OTEL_NAMESPACE}"
    --from-literal=splunk_observability_access_token="${SPLUNK_ACCESS_TOKEN}")
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '    %s[dry-run]%s kubectl create namespace %s (idempotent)\n' "${c_yellow}" "${c_reset}" "${OTEL_NAMESPACE}"
    printf '    %s[dry-run]%s kubectl %s --dry-run=client -o yaml | kubectl apply -f -\n' \
      "${c_yellow}" "${c_reset}" "${args[*]//${SPLUNK_ACCESS_TOKEN}/$(mask "${SPLUNK_ACCESS_TOKEN}")}"
    return 0
  fi
  kubectl create namespace "${OTEL_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  kubectl "${args[@]}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  ok "Secret '${HELM_RELEASE}' ensured in namespace ${OTEL_NAMESPACE}."
}

cmd_connect() {
  require_cmd kubectl; require_cmd helm
  [[ -n "${SPLUNK_REALM:-}" ]] || die "SPLUNK_REALM is required (e.g. us1)."
  [[ -n "${SPLUNK_ACCESS_TOKEN}" ]] || die "SPLUNK_ACCESS_TOKEN (O11y) is required."

  step "Installing Splunk Distribution of the OpenTelemetry Collector"
  info "realm=${SPLUNK_REALM} cluster=${CLUSTER_NAME} env=${ENVIRONMENT}"
  info "collector ns=${OTEL_NAMESPACE}  app ns=${APP_NAMESPACE}"
  info "O11y access token: $(mask "${SPLUNK_ACCESS_TOKEN}")"

  ensure_helm_repo
  ensure_secret

  # Node agent env applied to the Operator Instrumentation CR.
  # OTEL_LOGS_EXPORTER=otlp makes the Node agent emit app logs through its OTLP log
  # pipeline so records carry service.name/deployment.environment/trace_id/span_id.
  # OTEL_METRICS_EXPORTER=otlp turns ON application metric export — WITHOUT it splunk-otel-js
  # registers NO MeterProvider, so the services' custom metrics (auth_login_total, etc.) are
  # silent no-ops and never reach O11y (verified: agent otlp receiver accepted 0 metric points).
  # SPLUNK_METRICS_ENABLED=true is the ACTUAL gate in splunk-otel-js v4.10.0 (metrics default OFF);
  # OTEL_METRICS_EXPORTER alone is insufficient — both are required for custom metrics to flow.
  local node_env_json
  node_env_json='[{"name":"OTEL_LOGS_EXPORTER","value":"otlp"},{"name":"OTEL_METRICS_EXPORTER","value":"otlp"},{"name":"SPLUNK_METRICS_ENABLED","value":"true"}]'
  # High-res app metric: drop the SDK metric export interval to 1s (default 60s) so the tagged
  # metric actually arrives every second. Applies to all Node services' export cadence; only
  # the sf_hires-tagged metric (below) is STORED at 1s. Timeout == interval keeps the JS
  # PeriodicExportingMetricReader happy (timeout must not exceed interval).
  if [[ -n "${HIRES_METRIC}" ]]; then
    node_env_json='[{"name":"OTEL_LOGS_EXPORTER","value":"otlp"},{"name":"OTEL_METRICS_EXPORTER","value":"otlp"},{"name":"SPLUNK_METRICS_ENABLED","value":"true"},{"name":"OTEL_METRIC_EXPORT_INTERVAL","value":"'"${HIRES_EXPORT_INTERVAL_MS}"'"},{"name":"OTEL_METRIC_EXPORT_TIMEOUT","value":"'"${HIRES_EXPORT_INTERVAL_MS}"'"}]'
  fi

  # Stamp deployment.environment on the agent's resource up front (not just via the
  # collector pipeline), so every signal is tagged demoBanking-rum.
  #
  # k8s.cluster.name is ALSO stamped here for service-LEVEL APM <-> Infrastructure
  # correlation + Related Content pod navigation. The OTel Operator injects
  # k8s.pod.name/node.name/namespace onto spans, but NOT k8s.cluster.name (it can't know
  # the cluster's logical name). The collector tags infra metrics with clusterName
  # (=${CLUSTER_NAME}); stamping the same value on the agent resource keeps both sides
  # aligned. (The per-INSTANCE "Infrastructure metrics" panel is a separate join keyed on
  # service.instance.id == container.id — handled by the transform processors below.)
  local node_resource_json
  node_resource_json='{"deployment.environment":"'"${ENVIRONMENT}"'","k8s.cluster.name":"'"${CLUSTER_NAME}"'"}'

  # mysql2 currently emits the legacy db.system/db.name attributes but no peer.service
  # or server.address. Add the missing dependency identity so APM materializes the
  # inferred mysql:bankdb node and links account/transfer spans to it.
  local mysql_peer_json
  mysql_peer_json='{"error_mode":"ignore","trace_statements":["set(span.attributes[\"peer.service\"], \"mysql:bankdb\") where span.attributes[\"db.system\"] == \"mysql\" and span.attributes[\"db.name\"] == \"bankdb\"","set(span.attributes[\"server.address\"], \"mysql.'"${APP_NAMESPACE}"'.svc.cluster.local\") where span.attributes[\"db.system\"] == \"mysql\" and span.attributes[\"db.name\"] == \"bankdb\"","set(span.attributes[\"server.port\"], 3306) where span.attributes[\"db.system\"] == \"mysql\" and span.attributes[\"db.name\"] == \"bankdb\""]}'

  local set_args=(
    --namespace "${OTEL_NAMESPACE}" --create-namespace
    --set "clusterName=${CLUSTER_NAME}"
    --set "environment=${ENVIRONMENT}"
    --set "splunkObservability.realm=${SPLUNK_REALM}"
    --set "secret.create=false"
    --set "secret.name=${HELM_RELEASE}"
    --set "splunkObservability.metricsEnabled=true"
    --set "splunkObservability.tracesEnabled=true"
    # kubelet_stats scrapes the node kubelet (:10250) for pod/node CPU/mem/network
    # infra metrics — the data behind the APM instance "Infrastructure metrics" panel.
    # minikube's kubelet serving cert has no IP SANs, so strict TLS verification fails
    # ("cannot validate certificate ... doesn't contain any IP SANs") and the receiver
    # collects nothing. Skipping verification is the standard local-cluster workaround.
    # NOTE: the chart's override key is "kubelet_stats" (underscore); passing the old
    # "kubeletstats" name is rejected by the chart's rename guard.
    --set "agent.config.receivers.kubelet_stats.insecure_skip_verify=true"
    --set "splunkObservability.profilingEnabled=${PROFILING_ENABLED}"
    --set "gateway.enabled=false"
    --set "agent.discovery.enabled=${DISCOVERY_ENABLED}"
    --set "operatorcrds.install=true"
    --set "operator.enabled=true"
    --set "certmanager.enabled=${CERTMANAGER_ENABLED}"
    --set "instrumentation.installationJob.enabled=true"
    # --- APM ⇄ Infrastructure per-instance panel (Service Instances › Infrastructure metrics) ---
    # That panel joins ONLY on service.instance.id, and the value it expects is the pod's k8s
    # RUNTIME container.id (the "Active Container ID" it displays). The default operator
    # service.instance.id (<namespace>.<pod>.<container>) matches no infra dimension → the panel
    # shows "Infrastructure data is not available for this instance." VERIFIED: the Node agent
    # (splunk-otel-js) stamps a *cgroup-derived* container.id on the span that does NOT equal the
    # k8s runtime container.id on minikube/docker — so keying on the raw span container.id fails.
    # Fix entirely in the collector (language-agnostic, no app/CR change needed):
    #   1. transform/clear_container_id DELETES the app-set container.id BEFORE k8s_attributes.
    #   2. k8s_attributes then INSERTS the real runtime container.id from the k8s API — the same
    #      source Infrastructure Monitoring reports (its enrichment uses `insert`, so it only fills
    #      when the key is absent, which is why step 1 is required).
    #   3. transform/set_instance_id rewrites service.instance.id = container.id (now the runtime one).
    # Order matters: both transforms MUST bracket k8s_attributes. Overriding traces.processors is a
    # REPLACE (not merge), so it reproduces the chart-default order with the two transforms inserted.
    --set-json 'agent.config.processors.transform/clear_container_id={"error_mode":"ignore","trace_statements":["delete_key(resource.attributes, \"container.id\")"]}'
    --set-json 'agent.config.processors.transform/set_instance_id={"error_mode":"ignore","trace_statements":["set(resource.attributes[\"service.instance.id\"], resource.attributes[\"container.id\"]) where resource.attributes[\"container.id\"] != nil"]}'
    --set-json "agent.config.processors.transform/enrich_mysql_peer=${mysql_peer_json}"
    --set-json 'agent.config.service.pipelines.traces.processors=["memory_limiter","transform/clear_container_id","k8s_attributes","transform/set_instance_id","transform/enrich_mysql_peer","batch","resourcedetection","resource","resource/add_environment"]'
    # signalfx in the TRACES pipeline = correlation-only (it does NOT export span data here); it
    # activates the correlation client that writes sf_service/sf_environment onto the infra
    # dimensions so the instance panel resolves. Keep otlp_http — that is the real span export path.
    --set-json 'agent.config.service.pipelines.traces.exporters=["otlp_http","signalfx"]'
    --set-json "instrumentation.spec.nodejs.env=${node_env_json}"
    --set-json "instrumentation.spec.resource.resourceAttributes=${node_resource_json}"
  )

  # High-res app metric: tag ONLY the named metric with sf_hires=1 so O11y stores it at 1s
  # (all other metrics stay 10s). The metrics-pipeline override REPLACES the list, so it
  # reproduces the verified chart 0.157.0 default [memory_limiter,batch,resourcedetection,
  # resource] with metricstransform/hires inserted (a receiver-less/empty pipeline crashes
  # the agent). Requires an app-pod restart after connect so the 1s export interval injects.
  if [[ -n "${HIRES_METRIC}" ]]; then
    info "High-res app metrics: ${HIRES_METRIC} -> 1s (export ${HIRES_EXPORT_INTERVAL_MS}ms + sf_hires=1)"
    # DEMO_HIRES_METRIC may be a comma-separated list; build a regex alternation so ONE
    # metricstransform tags every listed metric (e.g. auth_login_total,account_balance_requests_total).
    local hires_regex
    hires_regex="^($(printf '%s' "${HIRES_METRIC}" | tr -d ' ' | tr ',' '|'))$"
    set_args+=(
      --set-json "agent.config.processors.metricstransform/hires={\"transforms\":[{\"include\":\"${hires_regex}\",\"match_type\":\"regexp\",\"action\":\"update\",\"operations\":[{\"action\":\"add_label\",\"new_label\":\"sf_hires\",\"new_value\":\"1\"}]}]}"
      --set-json 'agent.config.service.pipelines.metrics.processors=["memory_limiter","metricstransform/hires","batch","resourcedetection","resource"]'
    )
  fi

  # Pin the chart version so `helm upgrade` doesn't jump to a newer chart with a changed schema.
  [[ -n "${CHART_VERSION}" ]] && set_args+=(--version "${CHART_VERSION}")

  # On re-runs the Operator and Helm fight over the Instrumentation CR's spec
  # (server-side-apply conflict). Delete it first so Helm recreates it cleanly.
  if [[ "${DRY_RUN}" -eq 0 ]] && helm status "${HELM_RELEASE}" -n "${OTEL_NAMESPACE}" >/dev/null 2>&1; then
    run kubectl delete instrumentation "${HELM_RELEASE}" -n "${OTEL_NAMESPACE}" --ignore-not-found
  fi

  run helm upgrade --install "${HELM_RELEASE}" "${HELM_CHART}" "${set_args[@]}" --wait --timeout 8m
  ok "Collector release '${HELM_RELEASE}' deployed in ${OTEL_NAMESPACE}."

  # The chart's installationJob-created Instrumentation CR honors spec.nodejs.env but
  # SILENTLY DROPS spec.resource.resourceAttributes (the --set-json above). Stamp the
  # resource attributes directly on the CR so spans carry k8s.cluster.name (required
  # for APM <-> Infrastructure correlation) and deployment.environment. Idempotent.
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    local i=0
    until kubectl get instrumentation "${HELM_RELEASE}" -n "${OTEL_NAMESPACE}" >/dev/null 2>&1 || [[ ${i} -ge 30 ]]; do sleep 2; i=$((i+1)); done
    if kubectl get instrumentation "${HELM_RELEASE}" -n "${OTEL_NAMESPACE}" >/dev/null 2>&1; then
      run kubectl patch instrumentation "${HELM_RELEASE}" -n "${OTEL_NAMESPACE}" --type merge \
        -p "{\"spec\":{\"resource\":{\"resourceAttributes\":${node_resource_json}}}}"
      ok "Instrumentation resource attributes stamped (k8s.cluster.name, deployment.environment)."
    else
      warn "Instrumentation CR not present yet; resource attributes not stamped. Re-run 'connect'."
    fi
  fi
}

instrumentation_ref() {
  # "<otel-ns>/<instrumentation-name>" so injection works across namespaces.
  local name
  name="$(kubectl get otelinst -n "${OTEL_NAMESPACE}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  [[ -n "${name}" ]] || name="${HELM_RELEASE}"
  printf '%s/%s' "${OTEL_NAMESPACE}" "${name}"
}

cmd_instrument() {
  require_cmd kubectl
  local ref; ref="$(instrumentation_ref)"
  step "Enabling Node.js auto-instrumentation (inject ${ref})"

  if ! kubectl get otelinst -n "${OTEL_NAMESPACE}" >/dev/null 2>&1; then
    warn "No Instrumentation CR found in ${OTEL_NAMESPACE}. Run 'connect' first."
  fi

  local svc
  for svc in "${NODE_SERVICES[@]}"; do
    if ! kubectl get deployment "${svc}" -n "${APP_NAMESPACE}" >/dev/null 2>&1; then
      warn "Deployment ${svc} not found in ${APP_NAMESPACE}; skipping."
      continue
    fi
    run kubectl patch deployment "${svc}" -n "${APP_NAMESPACE}" --type merge \
      -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"${INJECT_ANNOTATION}\":\"${ref}\"}}}}}"
    ok "Annotated ${svc}."
  done

  step "Rolling out instrumented services"
  for svc in "${NODE_SERVICES[@]}"; do
    kubectl get deployment "${svc}" -n "${APP_NAMESPACE}" >/dev/null 2>&1 || continue
    run kubectl rollout status "deployment/${svc}" -n "${APP_NAMESPACE}" --timeout=180s
  done
  ok "Node services pointed at the collector via the operator."
}

cmd_verify() {
  require_cmd kubectl
  step "Collector pods in ${OTEL_NAMESPACE}"
  kubectl get pods -n "${OTEL_NAMESPACE}" -l app.kubernetes.io/instance="${HELM_RELEASE}" 2>/dev/null || \
    kubectl get pods -n "${OTEL_NAMESPACE}"

  step "Instrumentation CR"
  kubectl get otelinst -n "${OTEL_NAMESPACE}" 2>/dev/null || warn "No Instrumentation CR found."

  step "Node agent injection check (api-gateway)"
  if kubectl get deployment api-gateway -n "${APP_NAMESPACE}" >/dev/null 2>&1; then
    kubectl exec "deployment/api-gateway" -n "${APP_NAMESPACE}" -- env 2>/dev/null \
      | grep -E 'NODE_OPTIONS|OTEL_EXPORTER_OTLP_ENDPOINT|OTEL_SERVICE_NAME|OTEL_RESOURCE_ATTRIBUTES' \
      || warn "No agent env found yet — pods may still be restarting."
  else
    warn "api-gateway not found in ${APP_NAMESPACE}."
  fi
}

cmd_status() {
  require_cmd kubectl
  step "Integration status"
  info "Realm:        ${SPLUNK_REALM:-<unset>}"
  info "Cluster/env:  ${CLUSTER_NAME} / ${ENVIRONMENT}"
  info "Collector ns: ${OTEL_NAMESPACE}   App ns: ${APP_NAMESPACE}"

  helm status "${HELM_RELEASE}" -n "${OTEL_NAMESPACE}" >/dev/null 2>&1 \
    && ok "Helm release '${HELM_RELEASE}' present." || warn "Helm release '${HELM_RELEASE}' not installed."

  local svc
  for svc in "${NODE_SERVICES[@]}"; do
    local val
    val="$(kubectl get deployment "${svc}" -n "${APP_NAMESPACE}" \
      -o jsonpath="{.spec.template.metadata.annotations.${INJECT_ANNOTATION//./\\.}}" 2>/dev/null || true)"
    [[ -n "${val}" ]] && ok "${svc}: inject-nodejs=${val}" || warn "${svc}: not instrumented"
  done
}

cmd_uninstall() {
  require_cmd kubectl; require_cmd helm
  step "Removing Node.js auto-instrumentation annotations"
  local svc
  for svc in "${NODE_SERVICES[@]}"; do
    kubectl get deployment "${svc}" -n "${APP_NAMESPACE}" >/dev/null 2>&1 || continue
    run kubectl patch deployment "${svc}" -n "${APP_NAMESPACE}" --type merge \
      -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"${INJECT_ANNOTATION}\":null}}}}}"
    ok "Cleared annotation on ${svc}."
  done

  step "Deleting Instrumentation CR + Helm release"
  run kubectl delete otelinst -n "${OTEL_NAMESPACE}" --all --ignore-not-found=true
  run helm uninstall "${HELM_RELEASE}" -n "${OTEL_NAMESPACE}" || true
  run kubectl delete secret "${HELM_RELEASE}" -n "${OTEL_NAMESPACE}" --ignore-not-found=true
  ok "Detached. Re-run 'all' to re-integrate."
}

main() {
  local cmd="${1:-help}"; shift || true
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --dry-run) DRY_RUN=1 ;;
      --env-file) shift; ENV_FILE="${1:?--env-file needs a path}" ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1" ;;
    esac
    shift
  done

  case "${cmd}" in help|-h|--help) usage; exit 0 ;; esac

  load_env

  case "${cmd}" in
    connect)    cmd_connect ;;
    instrument) cmd_instrument ;;
    verify)     cmd_verify ;;
    status)     cmd_status ;;
    uninstall)  cmd_uninstall ;;
    all)        cmd_connect; cmd_instrument; cmd_verify
                step "Done — Splunk O11y APM"
                info "Generate traffic (./scripts/load-generator.sh --scenario mixed) and open"
                info "APM in Splunk O11y, filtered to environment '${ENVIRONMENT}'." ;;
    *) usage; die "Unknown command: ${cmd}" ;;
  esac
}

main "$@"
