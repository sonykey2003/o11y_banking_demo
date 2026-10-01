#!/usr/bin/env bash
# scripts/splunk-dbmon.sh
# ─────────────────────────────────────────────────────────────────────────────
# Enable Splunk Database Monitoring (DBMon) for the SEA Bank MySQL data tier
# (bankdb in namespace sea-bank-demo). DBMon is SEPARATE from APM Database Query
# Performance: it scrapes MySQL directly via the collector's `mysql` receiver.
#
# NOTE: query-sample<->APM-trace correlation is Java/.NET only today; this Node.js
# backend gets the DBMon instance + query stats + explain plans, and APM inferred
# database services (db.system=mysql spans), but not the bidirectional deep-link.
#
# Commands:
#   prep      Create the `otel` MySQL monitoring user + grants, and the collector-side
#             sea-bank-dbmon secret (in OTEL_NAMESPACE). Idempotent.
#   enable    Merge the mysql DBMon receiver onto the splunk-otel-collector release.
#   verify    Confirm the receiver is scraping and shipping to Splunk.
#   all       prep -> enable -> verify.
#
# Config: repo-root .env (SPLUNK_REALM, DEMO_OTEL_NAMESPACE, DEMO_APP_NAMESPACE,
# HELM_RELEASE). The monitoring password defaults to a demo value; override with
# DBMON_DB_PASSWORD in the env file for anything real.
# Usage: ./scripts/splunk-dbmon.sh <command> [--dry-run] [--env-file PATH]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_ENV_FILE="${ROOT}/.env"
VALUES_TEMPLATE="${ROOT}/k8s/dbmon/splunk-otel-collector-dbmon.values.yaml"

DRY_RUN=0
ENV_FILE="${DEMO_ENV_FILE:-${DEFAULT_ENV_FILE}}"

HELM_REPO_NAME="splunk-otel-collector-chart"
HELM_REPO_URL="https://signalfx.github.io/splunk-otel-collector-chart"
HELM_CHART="${HELM_REPO_NAME}/splunk-otel-collector"

c_reset=$'\033[0m'; c_blue=$'\033[34m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_bold=$'\033[1m'
step() { printf '\n%s==> %s%s\n' "${c_bold}${c_blue}" "$*" "${c_reset}"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    %s✓ %s%s\n' "${c_green}" "$*" "${c_reset}"; }
warn() { printf '    %s! %s%s\n' "${c_yellow}" "$*" "${c_reset}" >&2; }
die()  { printf '%sError:%s %s\n' "${c_red}" "${c_reset}" "$*" >&2; exit 1; }
run() { if [[ "${DRY_RUN}" -eq 1 ]]; then printf '    %s[dry-run]%s %s\n' "${c_yellow}" "${c_reset}" "$*"; else "$@"; fi; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

usage() { sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

load_env() {
  if [[ -f "${ENV_FILE}" ]]; then
    step "Loading config from ${ENV_FILE}"; set -a; source "${ENV_FILE}"; set +a; ok "config loaded"
  else
    info "No env file at ${ENV_FILE} (using current environment)."
  fi
  APP_NAMESPACE="${DEMO_APP_NAMESPACE:-sea-bank-demo}"
  OTEL_NAMESPACE="${DEMO_OTEL_NAMESPACE:-splunk-otel}"
  HELM_RELEASE="${HELM_RELEASE:-splunk-otel-collector}"
  DBMON_DB_USER="${DBMON_DB_USER:-otel}"
  DBMON_DB_PASSWORD="${DEMO_DBMON_DB_PASSWORD:-otel-dbmon-pw}"
  [[ -n "${SPLUNK_REALM:-}" ]] || die "SPLUNK_REALM is required (e.g. us1)."
}

# ── prep: monitoring user + grants + collector-side secret ────────────────────
cmd_prep() {
  require_cmd kubectl
  step "Creating MySQL DBMon monitoring user '${DBMON_DB_USER}' (${APP_NAMESPACE})"
  local sql
  sql="CREATE USER IF NOT EXISTS '${DBMON_DB_USER}'@'%' IDENTIFIED BY '${DBMON_DB_PASSWORD}';
GRANT REPLICATION CLIENT ON *.* TO '${DBMON_DB_USER}'@'%';
GRANT PROCESS ON *.* TO '${DBMON_DB_USER}'@'%';
GRANT SELECT ON performance_schema.* TO '${DBMON_DB_USER}'@'%';
GRANT SELECT ON bankdb.* TO '${DBMON_DB_USER}'@'%';
ALTER USER '${DBMON_DB_USER}'@'%' IDENTIFIED BY '${DBMON_DB_PASSWORD}';
FLUSH PRIVILEGES;"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '    %s[dry-run]%s kubectl exec deploy/mysql -n %s -- mysql (create %s + grants)\n' \
      "${c_yellow}" "${c_reset}" "${APP_NAMESPACE}" "${DBMON_DB_USER}"
  else
    kubectl exec deploy/mysql -n "${APP_NAMESPACE}" -- \
      sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e '"$(printf '%q' "${sql}")" \
      && ok "monitoring user + grants applied" || die "failed to create monitoring user"
  fi

  step "Ensuring collector-side secret 'sea-bank-dbmon' in ${OTEL_NAMESPACE}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '    %s[dry-run]%s kubectl create secret generic sea-bank-dbmon -n %s (username/password)\n' \
      "${c_yellow}" "${c_reset}" "${OTEL_NAMESPACE}"
  else
    kubectl create namespace "${OTEL_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
    kubectl create secret generic sea-bank-dbmon -n "${OTEL_NAMESPACE}" \
      --from-literal=username="${DBMON_DB_USER}" \
      --from-literal=password="${DBMON_DB_PASSWORD}" \
      --dry-run=client -o yaml | kubectl apply -f - >/dev/null
    ok "secret sea-bank-dbmon ensured"
  fi
}

# ── enable: merge DBMon receiver onto the collector release ───────────────────
cmd_enable() {
  require_cmd kubectl; require_cmd helm
  [[ -f "${VALUES_TEMPLATE}" ]] || die "Values template not found: ${VALUES_TEMPLATE}"
  helm status "${HELM_RELEASE}" -n "${OTEL_NAMESPACE}" >/dev/null 2>&1 \
    || die "Helm release '${HELM_RELEASE}' not found in ${OTEL_NAMESPACE}. Run splunk-instrumentation.sh connect first."

  step "Rendering DBMon values (realm=${SPLUNK_REALM})"
  local rendered; rendered="$(mktemp -t seabank-dbmon.XXXXXX.yaml)"
  sed "s/__SPLUNK_REALM__/${SPLUNK_REALM}/g" "${VALUES_TEMPLATE}" > "${rendered}"
  ok "rendered -> ${rendered}"

  local chart_ver
  chart_ver="$(helm get metadata "${HELM_RELEASE}" -n "${OTEL_NAMESPACE}" -o json 2>/dev/null \
    | sed -n 's/.*"chart":"splunk-otel-collector-\([0-9.]*\)".*/\1/p')"
  local ver_arg=(); [[ -n "${chart_ver}" ]] && ver_arg=(--version "${chart_ver}")
  info "chart version: ${chart_ver:-<latest>}"

  if ! helm repo list 2>/dev/null | grep -q "^${HELM_REPO_NAME}[[:space:]]"; then
    run helm repo add "${HELM_REPO_NAME}" "${HELM_REPO_URL}"
  fi
  run helm repo update "${HELM_REPO_NAME}" >/dev/null

  step "Merging DBMon overlay onto '${HELM_RELEASE}' (--reuse-values)"
  run helm upgrade "${HELM_RELEASE}" "${HELM_CHART}" ${ver_arg[@]+"${ver_arg[@]}"} \
    --namespace "${OTEL_NAMESPACE}" --reuse-values --values "${rendered}" --wait --timeout 8m
  ok "DBMon mysql receiver merged."
  [[ "${DRY_RUN}" -eq 0 ]] && rm -f "${rendered}"
}

# ── verify ────────────────────────────────────────────────────────────────
cmd_verify() {
  require_cmd kubectl
  local agent; agent="$(kubectl get pods -n "${OTEL_NAMESPACE}" -o name | grep -m1 'agent' || true)"
  [[ -n "${agent}" ]] || die "No collector agent pod found in ${OTEL_NAMESPACE}."
  agent="${agent#pod/}"; info "agent pod: ${agent}"
  step "mysql receiver -> Splunk export counters (telemetry :8889)"
  local lp=18899
  kubectl port-forward -n "${OTEL_NAMESPACE}" "pod/${agent}" "${lp}:8889" >/tmp/pf-seabank-dbmon.log 2>&1 &
  local pf=$!; sleep 4
  curl -s "http://localhost:${lp}/metrics" \
    | grep -iE 'receiver="mysql"|exporter="otlp_http/dbmon"' | grep -iE 'accepted|sent|refused|failed' | grep -viE '^#' \
    || warn "No mysql/dbmon counters yet — allow a minute after enable, then re-check."
  kill "${pf}" 2>/dev/null || true
}

main() {
  local cmd="${1:-help}"; shift || true
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --dry-run) DRY_RUN=1 ;;
      --env-file) shift; ENV_FILE="${1:?--env-file needs a path}" ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1" ;;
    esac; shift
  done
  case "${cmd}" in help|-h|--help) usage; exit 0 ;; esac
  load_env
  case "${cmd}" in
    prep) cmd_prep ;;
    enable) cmd_enable ;;
    verify) cmd_verify ;;
    all) cmd_prep; cmd_enable; cmd_verify
         step "Done"; info "MySQL 'bankdb' will appear under APM > Database Monitoring in a few minutes." ;;
    *) usage; die "Unknown command: ${cmd}" ;;
  esac
}

main "$@"
