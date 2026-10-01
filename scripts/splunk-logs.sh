#!/usr/bin/env bash
# O11y Log Observer Connect for the SEA Bank demo (single Splunk Cloud stack).
#
# The collector (installed by splunk-instrumentation.sh) already exports the Node agent's
# OTLP app logs (trace_id/span_id). This provisions the LOC read side on the stack — index,
# role, service account — and points the collector's HEC log-export leg (existing
# SPLUNK_CLOUD_HEC token) at it, so the logs land in ${DEMO_SPLUNK_INDEX} and show in APM > Related Logs.
#
# Config: repo-root .env (see .env.example).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
source "${DEMO_ENV_FILE:-${ROOT}/.env}"

# Staging vs prod HEC host domain. Stack names are bare (no .stg).
case "${DEMO_SPLUNK_ACS_URL}" in *staging*) fed_dom="stg.splunkcloud.com" ;; *) fed_dom="splunkcloud.com" ;; esac

HEC_URL="${DEMO_SPLUNK_HEC_URL:-https://http-inputs-${DEMO_SPLUNK_STACK}.${fed_dom}/services/collector}"
HEC_TOKEN="${SPLUNK_CLOUD_HEC}"
TLS_ARGS=()

# Step 1: Acquire an ACS API token for the stack (session env only, not persisted).
# curl -u prompts for the admin password; it is never stored in the env files.
echo "== ACS API token (${DEMO_SPLUNK_STACK}) =="
export ACS_TOKEN="$(curl -sS -u "$SPLUNK_USERNAME" -X POST "${DEMO_SPLUNK_ACS_URL%/}/${DEMO_SPLUNK_STACK}/adminconfig/v2/tokens" \
  -H 'Content-Type: application/json' \
  -d "{\"user\":\"${SPLUNK_USERNAME}\",\"audience\":\"${SPLUNK_TOKEN_AUDIENCE}\",\"expiresOn\":\"${SPLUNK_TOKEN_EXPIRES_ON}\"}" | jq -r '.token')"

# Step 2: Create the data index. The collector's HEC exporter writes app logs here and
# Log Observer Connect reads it for the APM "Related Logs" tab.
echo "== index ${DEMO_SPLUNK_INDEX} =="
curl -sS -H "Authorization: Bearer ${ACS_TOKEN}" -X POST "${DEMO_SPLUNK_ACS_URL%/}/${DEMO_SPLUNK_STACK}/adminconfig/v2/indexes" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${DEMO_SPLUNK_INDEX}\",\"datatype\":\"event\",\"searchableDays\":${DEMO_SPLUNK_INDEX_SEARCHABLE_DAYS},\"maxDataSizeMB\":${DEMO_SPLUNK_INDEX_MAX_SIZE_MB}}"


# Step 3: Create the LOC role + service account O11y authenticates as. Plain Log Observer
# Connect needs 'search' + 'edit_tokens_own' and the index allow list (NOT indexes_list_all,
# and NOT fsh_manage — that is transparent federated search). ACS ignores importRoles, so
# grant capabilities explicitly.
echo "== LOC role ${SPLUNK_LOC_ROLE} =="
curl -sS -H "Authorization: Bearer ${ACS_TOKEN}" -X POST "${DEMO_SPLUNK_ACS_URL%/}/${DEMO_SPLUNK_STACK}/adminconfig/v2/roles" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${SPLUNK_LOC_ROLE}\",\"capabilities\":[\"search\",\"edit_tokens_own\"],\"srchIndexesAllowed\":[\"${DEMO_SPLUNK_INDEX}\"],\"srchIndexesDefault\":[\"${DEMO_SPLUNK_INDEX}\"],\"srchJobsQuota\":20}"

echo "== LOC service account ${SPLUNK_LOC_SERVICE_ACCOUNT} =="
curl -sS -H "Authorization: Bearer ${ACS_TOKEN}" -X POST "${DEMO_SPLUNK_ACS_URL%/}/${DEMO_SPLUNK_STACK}/adminconfig/v2/users" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${SPLUNK_LOC_SERVICE_ACCOUNT}\",\"password\":\"${SPLUNK_LOC_SERVICE_PASSWORD}\",\"roles\":[\"${SPLUNK_LOC_ROLE}\"],\"forceChangePass\":false}"


# Step 4: Point the collector's Splunk Platform HEC log-export leg at the index, using the
# EXISTING HEC token (SPLUNK_CLOUD_HEC from .env — no token is created here).
# The chart reads splunk_platform_hec_token from the release secret; --reuse-values keeps every
# O11y setting from splunk-instrumentation.sh and only ADDS this leg. Delete the Operator-owned
# Instrumentation CR first (SSA field-manager conflict) so Helm recreates it cleanly.
echo "== collector -> HEC (${HEC_URL}) =="
kubectl create secret generic "${HELM_RELEASE}" -n "${DEMO_OTEL_NAMESPACE}" \
  --from-literal=splunk_observability_access_token="${SPLUNK_ACCESS_TOKEN}" \
  --from-literal=splunk_platform_hec_token="${HEC_TOKEN}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl delete instrumentation -n "${DEMO_OTEL_NAMESPACE}" --all --ignore-not-found
helm repo add splunk-otel-collector-chart https://signalfx.github.io/splunk-otel-collector-chart >/dev/null 2>&1 || true
helm repo update splunk-otel-collector-chart >/dev/null
helm upgrade --install "${HELM_RELEASE}" splunk-otel-collector-chart/splunk-otel-collector \
  -n "${DEMO_OTEL_NAMESPACE}" --reuse-values \
  --version "${DEMO_HELM_CHART_VERSION:-0.157.0}" \
  --set secret.create=false --set secret.name="${HELM_RELEASE}" \
  --set splunkPlatform.endpoint="${HEC_URL}" \
  --set splunkPlatform.index="${DEMO_SPLUNK_INDEX}" \
  --set splunkPlatform.logsEnabled=true \
  --set splunkPlatform.metricsEnabled=false \
  --set splunkPlatform.tracesEnabled=false \
  ${TLS_ARGS[@]+"${TLS_ARGS[@]}"} \
  `# Make app logs filterable by service.name in Splunk/LOC. The file_log receiver` \
  `# (container STDOUT — the bulk of what lands here) carries k8s.container.name but` \
  `# NEVER service.name; only the Node agent's OTLP logs do. For app pods the container` \
  `# name IS the service name (account-service, api-gateway, ...), so fill service.name` \
  `# from k8s.container.name when absent (guard preserves real OTLP service.name). Runs` \
  `# right after k8s_attributes. The logs.processors override REPLACES the list, so it` \
  `# reproduces the chart-default order (rendered via helm template) with the transform` \
  `# inserted. Only enabled here because splunkPlatform.logsEnabled=true creates the` \
  `# logs pipeline (instrumentation.sh has no logs pipeline — do NOT add it there).` \
  --set-json 'agent.config.processors.transform/set_log_service={"error_mode":"ignore","log_statements":["set(resource.attributes[\"service.name\"], resource.attributes[\"k8s.container.name\"]) where resource.attributes[\"service.name\"] == nil and resource.attributes[\"k8s.container.name\"] != nil"]}' \
  --set-json 'agent.config.service.pipelines.logs.processors=["memory_limiter","k8s_attributes","transform/set_log_service","filter/logs","batch","resourcedetection","resource","resource/logs","resource/add_environment"]' \
  --wait --timeout 8m

# Deleting the Instrumentation CR above makes the chart's installationJob recreate it WITHOUT
# spec.resource.resourceAttributes (a known chart quirk), which would drop deployment.environment +
# k8s.cluster.name from spans and break service-level APM <-> Infrastructure correlation. Re-stamp
# them. (The per-instance "Infrastructure metrics" fix is collector-side in agent.config and is
# preserved by --reuse-values, so it needs no re-assert here.)
_env="${DEMO_ENVIRONMENT:-demoBanking-rum}"; _cluster="${DEMO_CLUSTER_NAME:-sea-bank-demo}"
for _ in $(seq 1 30); do kubectl get instrumentation "${HELM_RELEASE}" -n "${DEMO_OTEL_NAMESPACE}" >/dev/null 2>&1 && break; sleep 2; done
if kubectl get instrumentation "${HELM_RELEASE}" -n "${DEMO_OTEL_NAMESPACE}" >/dev/null 2>&1; then
  kubectl patch instrumentation "${HELM_RELEASE}" -n "${DEMO_OTEL_NAMESPACE}" --type merge \
    -p "{\"spec\":{\"resource\":{\"resourceAttributes\":{\"deployment.environment\":\"${_env}\",\"k8s.cluster.name\":\"${_cluster}\"}}}}"
  echo "== re-stamped CR resourceAttributes (deployment.environment=${_env}, k8s.cluster.name=${_cluster}) =="
fi


# Finish the LOC read side in the O11y console (one-time):
#   O11y > Data Management > Log Observer Connect > Add connection
#     stack ${DEMO_SPLUNK_STACK}, service account ${SPLUNK_LOC_SERVICE_ACCOUNT}
#     (role ${SPLUNK_LOC_ROLE}, index ${DEMO_SPLUNK_INDEX})
# Verify on the stack in Splunk Web:
#   index=${DEMO_SPLUNK_INDEX} trace_id=*
# Then O11y APM > a sea-bank service > Related Logs — correlated by trace_id.
echo "== done — finish Log Observer Connect in the O11y console (see comment above) =="
