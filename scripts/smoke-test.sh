#!/usr/bin/env bash
# scripts/smoke-test.sh — End-to-end check of the SEA Bank demo backend.
# Exercises login -> dashboard -> transfer -> (async) settlement through the gateway.
# Usage: ./scripts/smoke-test.sh
#   Set BASE_URL to skip the auto port-forward (e.g. BASE_URL=http://localhost:8080).
set -euo pipefail

NAMESPACE="sea-bank-demo"
LOCAL_PORT="28080"
BASE_URL="${BASE_URL:-}"

c_green=$'\033[32m'; c_red=$'\033[31m'; c_reset=$'\033[0m'; c_bold=$'\033[1m'
pass() { printf '  %s✓ %s%s\n' "${c_green}" "$*" "${c_reset}"; }
fail() { printf '  %s✗ %s%s\n' "${c_red}" "$*" "${c_reset}"; exit 1; }

PF_PID=""
cleanup() { [[ -n "${PF_PID}" ]] && kill "${PF_PID}" 2>/dev/null || true; }
trap cleanup EXIT

if [[ -z "${BASE_URL}" ]]; then
  echo "==> Port-forwarding svc/api-gateway ${LOCAL_PORT} -> 8080"
  kubectl -n "${NAMESPACE}" port-forward svc/api-gateway "${LOCAL_PORT}:8080" >/dev/null 2>&1 &
  PF_PID=$!
  BASE_URL="http://localhost:${LOCAL_PORT}"
fi

echo "==> Waiting for gateway readiness at ${BASE_URL}"
for _ in $(seq 1 30); do
  curl -sf "${BASE_URL}/healthz" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "${BASE_URL}/healthz" >/dev/null 2>&1 || fail "gateway not reachable at ${BASE_URL}"
pass "gateway healthy"

echo "${c_bold}==> Login${c_reset}"
LOGIN=$(curl -s -X POST "${BASE_URL}/api/login" -H 'content-type: application/json' -d '{"username":"demo","password":"demo"}')
TOKEN=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).token||"")}catch{process.exit(1)}})' <<<"${LOGIN}")
[[ -n "${TOKEN}" ]] && pass "login returned a token" || fail "login failed: ${LOGIN}"

echo "${c_bold}==> Dashboard${c_reset}"
CODE=$(curl -s -o /tmp/sea-dash.json -w '%{http_code}' "${BASE_URL}/api/dashboard" -H "authorization: Bearer ${TOKEN}")
[[ "${CODE}" == "200" ]] && pass "dashboard 200" || fail "dashboard http ${CODE}"
node -e 'const d=require("/tmp/sea-dash.json");if(!Array.isArray(d.accounts)||!d.accounts.length)process.exit(1)' \
  && pass "dashboard returned accounts" || fail "dashboard has no accounts"

echo "${c_bold}==> Transfer${c_reset}"
CODE=$(curl -s -o /tmp/sea-trf.json -w '%{http_code}' -X POST "${BASE_URL}/api/transfers" \
  -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' \
  -d '{"fromAccountId":"ACC-1001","toAccountId":"ACC-1002","amount":25}')
[[ "${CODE}" == "202" ]] && pass "transfer accepted (202)" || fail "transfer http ${CODE}"

echo "${c_bold}==> Settlement${c_reset}"
sleep 1
STATUS=$(curl -s "${BASE_URL}/api/transfers" -H "authorization: Bearer ${TOKEN}" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=JSON.parse(d).transfers[0];process.stdout.write(t?t.status:"NONE")})')
[[ "${STATUS}" == "COMPLETED" ]] && pass "transfer settled (COMPLETED)" || fail "transfer status=${STATUS}"

echo ""
echo "${c_green}${c_bold}✓ Smoke test passed.${c_reset}"
