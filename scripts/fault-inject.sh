#!/usr/bin/env bash
# scripts/fault-inject.sh — Drive the built-in fault injection for the APM/RUM demo.
# Talks to the gateway's /api/admin/fault, which fans the setting out to every service.
#
# Commands:
#   latency <ms> [service]   Add fixed latency to every request (service: all|gateway|auth|account|transfer)
#   error   <rate> [service] Fail a fraction [0..1] of requests with HTTP 500
#   status                   Show current fault config across the mesh
#   clear                    Remove all injected faults
#
# Usage: ./scripts/fault-inject.sh <command> [args]
#   Set BASE_URL to skip the auto port-forward (e.g. BASE_URL=http://localhost:8080).
set -euo pipefail

NAMESPACE="sea-bank-demo"
LOCAL_PORT="28082"
BASE_URL="${BASE_URL:-}"

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
}

CMD="${1:-status}"; shift || true

PF_PID=""
cleanup() { [[ -n "${PF_PID}" ]] && kill "${PF_PID}" 2>/dev/null || true; }
trap cleanup EXIT

if [[ -z "${BASE_URL}" ]]; then
  kubectl -n "${NAMESPACE}" port-forward svc/api-gateway "${LOCAL_PORT}:8080" >/dev/null 2>&1 &
  PF_PID=$!
  BASE_URL="http://localhost:${LOCAL_PORT}"
  for _ in $(seq 1 30); do curl -sf "${BASE_URL}/healthz" >/dev/null 2>&1 && break; sleep 0.5; done
fi

pretty() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch{process.stdout.write(d)}})'; }

case "${CMD}" in
  latency)
    MS="${1:?latency needs <ms>}"; SVC="${2:-all}"
    curl -s -X POST "${BASE_URL}/api/admin/fault" -H 'content-type: application/json' \
      -d "{\"service\":\"${SVC}\",\"latencyMs\":${MS}}" | pretty ;;
  error)
    RATE="${1:?error needs <rate 0..1>}"; SVC="${2:-all}"
    curl -s -X POST "${BASE_URL}/api/admin/fault" -H 'content-type: application/json' \
      -d "{\"service\":\"${SVC}\",\"errorRate\":${RATE}}" | pretty ;;
  status)
    curl -s "${BASE_URL}/api/admin/fault" | pretty ;;
  clear)
    curl -s -X DELETE "${BASE_URL}/api/admin/fault" | pretty ;;
  help|-h|--help)
    usage ;;
  *)
    echo "Unknown command: ${CMD}"; usage; exit 1 ;;
esac
