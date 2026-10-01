#!/usr/bin/env bash
# scripts/metric-loadgen.sh
# ─────────────────────────────────────────────────────────────────────────────
# Drive the two high-res (1s) app metrics with steady traffic:
#   • auth_login_total                → POST /api/login            (auth-service)
#   • account_balance_requests_total  → GET  /api/accounts/:id/balance (account-service)
# Each endpoint is hit at >= --rps requests/sec (default 5), so BOTH metrics get
# at least 5 increments per second.
#
# Hits the gateway over HTTP, so the gateway port-forward must be up:
#   ./scripts/port-forward-gateway.sh   → http://localhost:8080
#
# Usage: ./scripts/metric-loadgen.sh [--rps N] [--duration SECONDS]
#                                    [--account ACC-XXXX] [--base-url URL]
# Defaults: rps=5, duration=300, account=ACC-1001, base-url=http://localhost:8080

BASE_URL="${BASE_URL:-http://localhost:8080}"
RPS=5
DURATION=300
ACCOUNT="ACC-1001"
USERNAME="demo"
PASSWORD="demo"
LATENCY_MS=0

c_reset=$'\033[0m'; c_blue=$'\033[34m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_bold=$'\033[1m'
step() { printf '\n%s==> %s%s\n' "${c_bold}${c_blue}" "$*" "${c_reset}"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    %s✓ %s%s\n' "${c_green}" "$*" "${c_reset}"; }
warn() { printf '    %s! %s%s\n' "${c_yellow}" "$*" "${c_reset}" >&2; }
die()  { printf '%sError:%s %s\n' "${c_red}" "${c_reset}" "$*" >&2; exit 1; }

usage() {
  cat <<EOF
${c_bold}SEA Bank demo — login + balance metric load generator${c_reset}

Usage: $(basename "$0") [options]

Options:
  --rps N              Requests/sec PER endpoint (default: ${RPS}; both metrics get >= N/sec).
  --duration SECONDS   How long to run (default: ${DURATION}).
  --account ACC-XXXX   Account id for balance checks (default: ${ACCOUNT}).
  --base-url URL       Gateway base URL (default: ${BASE_URL}).
  --latency-ms N       Inject N ms of server-side latency into every login/balance call
                       (default: ${LATENCY_MS}; elongates auth_login_latency/account_balance_latency).
  -h, --help           Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rps)      RPS="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    --account)  ACCOUNT="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    --latency-ms) LATENCY_MS="$2"; shift 2 ;;
    -h|--help)  usage; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

[[ "${RPS}" =~ ^[1-9][0-9]*$ ]] || die "--rps must be a positive integer."
[[ "${DURATION}" =~ ^[1-9][0-9]*$ ]] || die "--duration must be a positive integer."
[[ "${LATENCY_MS}" =~ ^[0-9]+$ ]] || die "--latency-ms must be a non-negative integer."
command -v curl >/dev/null 2>&1 || die "curl is required."

# Preflight: gateway reachable?
curl -fsS --max-time 5 "${BASE_URL}/healthz" >/dev/null 2>&1 \
  || die "Gateway not reachable at ${BASE_URL}. Start it: ./scripts/port-forward-gateway.sh"

login_url="${BASE_URL}/api/login"
balance_url="${BASE_URL}/api/accounts/${ACCOUNT}/balance"
login_body="{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}"

# Fetch a bearer token for the balance calls (also increments auth_login_total).
login() {
  curl -s --max-time 5 -X POST "${login_url}" -H 'content-type: application/json' -d "${login_body}" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'
}

token="$(login)"
[[ -n "${token}" ]] || die "Login failed (check demo/demo creds and the gateway)."

# When --latency-ms is set, send x-svc-latency-ms so the auth/account handlers add that
# delay INSIDE their measured window (moves the *_latency histograms, not just the gateway).
lat_header=()
(( LATENCY_MS > 0 )) && lat_header=(-H "x-svc-latency-ms: ${LATENCY_MS}")
req_max_time=$(( 10 + LATENCY_MS / 1000 ))

step "Driving login + balance at ${RPS}/sec each for ${DURATION}s → ${BASE_URL}"
info "account=${ACCOUNT}  injected-latency=${LATENCY_MS}ms  (Ctrl-C to stop)"

sent=0
start="$(date +%s)"
trap 'echo; step "Stopped early"; info "sent ~${sent} login + ~${sent} balance requests"; wait 2>/dev/null; exit 0' INT

sec=0
while :; do
  now="$(date +%s)"; (( now - start >= DURATION )) && break

  # Fire RPS logins + RPS balance checks for THIS second, all backgrounded so
  # request latency never throttles the rate (guarantees >= RPS/sec per endpoint).
  for (( j = 0; j < RPS; j++ )); do
    curl -s -o /dev/null --max-time "${req_max_time}" -X POST "${login_url}" -H 'content-type: application/json' "${lat_header[@]}" -d "${login_body}" &
    curl -s -o /dev/null --max-time "${req_max_time}" "${balance_url}" -H "authorization: Bearer ${token}" "${lat_header[@]}" &
  done
  sent=$(( sent + RPS )); sec=$(( sec + 1 ))

  # Keep the balance token fresh (~every 30s).
  if (( sec % 30 == 0 )); then
    t="$(login)"; [[ -n "${t}" ]] && token="${t}"
  fi

  # Heartbeat every 5s.
  if (( sec % 5 == 0 )); then
    ok "t=$(( now - start ))s  login=${sent}  balance=${sent}  (${RPS}/sec each)"
  fi

  # Sleep to the next whole-second grid point so the rate stays exactly RPS/sec.
  now="$(date +%s)"; delta=$(( start + sec - now )); (( delta > 0 )) && sleep "${delta}"
done

wait 2>/dev/null
step "Done"
info "Sent ~${sent} login + ~${sent} balance requests over ${DURATION}s (~${RPS}/sec each)."
info "Chart auth_login_total{sf_hires:1} and account_balance_requests_total{sf_hires:1}, Min resolution 1s."
