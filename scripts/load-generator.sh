#!/usr/bin/env bash
# Synthetic traffic generator for the SEA Bank demo.
# Usage: ./scripts/load-generator.sh [options]

SCENARIO="mixed"
RPS="2"
DURATION="300"
KUBE_CONTEXT=""
NAMESPACE=""
LOCAL_PORT=""
BASE_URL="${BASE_URL:-}"
FAULT_LATENCY_MS="1500"
FAULT_ERROR_RATE="0.5"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Generate synthetic application traffic for Splunk APM and logs.

Options:
  --scenario <name>   mixed | login | balance | transfer | latency | fail (default: ${SCENARIO})
  --rps <n>           Target requests per second (default: ${RPS})
  --duration <s>      Run for N seconds, 0=forever (default: ${DURATION})
  --context <name>    Kubernetes context (default: sea-bank-demo)
  --namespace <name>  Kubernetes namespace (default: sea-bank-demo)
  --port <n>          Local port-forward port (default: 28081)
  --base-url <url>    Skip port-forwarding and use this URL
  --help              Show this help

Examples:
  ./scripts/load-generator.sh --scenario mixed --duration 120
  ./scripts/load-generator.sh --scenario transfer --rps 3 --duration 120
EOF
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario)  SCENARIO="${2:-}"; shift 2 ;;
    --rps)       RPS="${2:-}"; shift 2 ;;
    --duration)  DURATION="${2:-}"; shift 2 ;;
    --context)   KUBE_CONTEXT="${2:-}"; shift 2 ;;
    --namespace) NAMESPACE="${2:-}"; shift 2 ;;
    --port)      LOCAL_PORT="${2:-}"; shift 2 ;;
    --base-url)  BASE_URL="${2:-}"; shift 2 ;;
    --help|-h)   usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

KUBE_CONTEXT="${KUBE_CONTEXT:-sea-bank-demo}"
NAMESPACE="${NAMESPACE:-sea-bank-demo}"
LOCAL_PORT="${LOCAL_PORT:-28081}"
SERVICE="api-gateway"
REMOTE_PORT="8080"
case "${SCENARIO}" in
  mixed|login|balance|transfer|latency|fail) ;;
  *) fail "Scenario '${SCENARIO}' is not valid. Use mixed, login, balance, transfer, latency, or fail." ;;
esac

[[ "${RPS}" =~ ^[0-9]+([.][0-9]+)?$ ]] || fail "--rps must be a positive number."
awk "BEGIN {exit !(${RPS} > 0)}" || fail "--rps must be greater than zero."
[[ "${DURATION}" =~ ^[0-9]+$ ]] || fail "--duration must be a non-negative integer."
[[ "${LOCAL_PORT}" =~ ^[0-9]+$ ]] || fail "--port must be an integer."

command -v curl >/dev/null 2>&1 || fail "curl is required."
command -v kubectl >/dev/null 2>&1 || fail "kubectl is required."
command -v node >/dev/null 2>&1 || fail "node is required for SEA Bank login responses."

PF_PID=""
PF_LOG=""
REQUEST_COUNT=0
cleanup() {
  if [[ -n "${PF_PID}" ]]; then
    kill "${PF_PID}" 2>/dev/null || true
    wait "${PF_PID}" 2>/dev/null || true
  fi
  [[ -z "${PF_LOG}" ]] || rm -f "${PF_LOG}"
  printf '\nStopped load generator (%d requests sent).\n' "${REQUEST_COUNT}"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if [[ -z "${BASE_URL}" ]]; then
  kubectl --context "${KUBE_CONTEXT}" get service "${SERVICE}" -n "${NAMESPACE}" >/dev/null 2>&1 \
    || fail "Service ${NAMESPACE}/${SERVICE} is unavailable in context '${KUBE_CONTEXT}'."
  PF_LOG="$(mktemp -t "sea-bank-loadgen.XXXXXX")"
  kubectl --context "${KUBE_CONTEXT}" port-forward -n "${NAMESPACE}" \
    "svc/${SERVICE}" "${LOCAL_PORT}:${REMOTE_PORT}" >"${PF_LOG}" 2>&1 &
  PF_PID=$!
  BASE_URL="http://localhost:${LOCAL_PORT}"
fi

for _ in $(seq 1 30); do
  curl -sf --connect-timeout 1 "${BASE_URL}/healthz" >/dev/null 2>&1 && break
  sleep 0.2
done
if ! curl -sf --connect-timeout 2 "${BASE_URL}/healthz" >/dev/null 2>&1; then
  [[ -z "${PF_LOG}" ]] || cat "${PF_LOG}" >&2
  fail "api-gateway is not reachable at ${BASE_URL} (context=${KUBE_CONTEXT}, namespace=${NAMESPACE})."
fi

request() {
  local label="$1"
  shift
  local result
  result="$(curl -s -o /dev/null -w '%{http_code} %{time_total}s' --connect-timeout 2 --max-time 20 "$@")" || result="000 0s"
  printf '[%d] %-12s %s\n' "${REQUEST_COUNT}" "${label}" "${result}"
  REQUEST_COUNT=$((REQUEST_COUNT + 1))
  if [[ "${result}" == 000* ]]; then
    [[ -z "${PF_PID}" ]] || kill -0 "${PF_PID}" 2>/dev/null \
      || fail "Port-forward exited unexpectedly. $(tr '\n' ' ' <"${PF_LOG}")"
    fail "Request to ${BASE_URL} failed; stopping instead of emitting false load."
  fi
}

sea_bank_login_token() {
  curl -s --connect-timeout 2 --max-time 10 -X POST "${BASE_URL}/api/login" \
    -H 'content-type: application/json' -d '{"username":"demo","password":"demo"}' \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).token||"")}catch{}})'
}

SLEEP_INTERVAL="$(awk "BEGIN {printf \"%.3f\", 1/${RPS}}")"
END_TS=$(( DURATION > 0 ? $(date +%s) + DURATION : 0 ))

TOKEN="$(sea_bank_login_token)"
[[ -n "${TOKEN}" ]] || fail "Initial SEA Bank login failed."
FROM=(ACC-1001 ACC-1002)
TO=(ACC-1002 ACC-1001)

printf '==> scenario=%s rps=%s duration=%ss\n' "${SCENARIO}" "${RPS}" "${DURATION}"
printf '    target=%s context=%s namespace=%s\n' "${BASE_URL}" "${KUBE_CONTEXT}" "${NAMESPACE}"

iteration=0
while :; do
  account_index=$((iteration % 2))
  from_account="${FROM[${account_index}]}"
  to_account="${TO[${account_index}]}"
  auth_header="authorization: Bearer ${TOKEN}"

  case "${SCENARIO}" in
    login)
      request "login" -X POST "${BASE_URL}/api/login" -H 'content-type: application/json' \
        -d '{"username":"demo","password":"demo"}'
      ;;
    balance)
      request "dashboard" "${BASE_URL}/api/dashboard" -H "${auth_header}"
      ;;
    transfer)
      request "transfer" -X POST "${BASE_URL}/api/transfers" -H "${auth_header}" \
        -H 'content-type: application/json' \
        -d "{\"fromAccountId\":\"${from_account}\",\"toAccountId\":\"${to_account}\",\"amount\":10}"
      ;;
    latency)
      request "latency" "${BASE_URL}/api/dashboard" -H "${auth_header}" \
        -H "x-fault-latency-ms: ${FAULT_LATENCY_MS}"
      ;;
    fail)
      request "fault mix" "${BASE_URL}/api/dashboard" -H "${auth_header}" \
        -H "x-fault-error-rate: ${FAULT_ERROR_RATE}"
      ;;
    mixed)
      case $((iteration % 3)) in
        0)
          request "login" -X POST "${BASE_URL}/api/login" -H 'content-type: application/json' \
            -d '{"username":"demo","password":"demo"}'
          ;;
        1)
          request "dashboard" "${BASE_URL}/api/dashboard" -H "${auth_header}"
          ;;
        2)
          request "transfer" -X POST "${BASE_URL}/api/transfers" -H "${auth_header}" \
            -H 'content-type: application/json' \
            -d "{\"fromAccountId\":\"${from_account}\",\"toAccountId\":\"${to_account}\",\"amount\":10}"
          ;;
      esac
      ;;
  esac

  iteration=$((iteration + 1))
  [[ "${END_TS}" -ne 0 && "$(date +%s)" -ge "${END_TS}" ]] && break
  sleep "${SLEEP_INTERVAL}"
done
