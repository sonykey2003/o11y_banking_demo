#!/usr/bin/env bash
# scripts/hires-demo.sh
# ─────────────────────────────────────────────────────────────────────────────
# Demo: emit a HIGH-RESOLUTION (1-second) custom metric to Splunk Observability
# Cloud so you can show off native 1s data vs the default 10s rollup.
#
# It sends a gauge `demo.hires_signal` once per second, tagged with the special
# dimension sf_hires=1 (Splunk O11y stores it at 1s instead of downsampling to
# 10s). The value is a slow sine baseline PLUS a sharp 1-second spike every few
# seconds — the spike is exactly what a 10s rollup smooths away, so a 1s chart
# next to a 10s chart makes the value of high-res obvious.
#
# Why a custom metric (not infra CPU): CPU here comes from kubelet_stats, whose
# cAdvisor summary only refreshes every ~10-15s, so 1s polling just re-reads a
# cached value. A synthetic signal lets us control the interval + shape cleanly.
#
# Needs SPLUNK_REALM + SPLUNK_ACCESS_TOKEN (same as splunk-instrumentation.sh).
# Config: repo-root .env. Secrets may be raw or op:// refs.
#
# Usage: ./scripts/hires-demo.sh [--duration SECONDS] [--interval SECONDS]
#                                [--metric NAME] [--dry-run] [--env-file PATH]
# Defaults to 600s (10 min) so you always have a comfortable 5m+ window to chart.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ENV_FILE="$(cd "${SCRIPT_DIR}/.." && pwd)/.env"
ENV_FILE="${DEMO_ENV_FILE:-${DEFAULT_ENV_FILE}}"

DURATION=600          # seconds to run (>= 300 gives a 5m+ chart window)
INTERVAL=1            # seconds between datapoints (1 = true high-res)
METRIC="demo.hires_signal"
DRY_RUN=0

c_reset=$'\033[0m'; c_blue=$'\033[34m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_bold=$'\033[1m'
step() { printf '\n%s==> %s%s\n' "${c_bold}${c_blue}" "$*" "${c_reset}"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    %s✓ %s%s\n' "${c_green}" "$*" "${c_reset}"; }
warn() { printf '    %s! %s%s\n' "${c_yellow}" "$*" "${c_reset}" >&2; }
die()  { printf '%sError:%s %s\n' "${c_red}" "${c_reset}" "$*" >&2; exit 1; }

mask() { local v="$1"; if [[ -z "${v}" ]]; then printf '<unset>'; elif [[ "${#v}" -le 8 ]]; then printf '****'; else printf '****%s' "${v: -4}"; fi; }

resolve_secret() {
  local v="${1:-}"
  if [[ "${v}" == op://* ]]; then
    command -v op >/dev/null 2>&1 || die "Value is a 1Password ref but 'op' CLI is not installed: ${v}"
    op read "${v}"
  else
    printf '%s' "${v}"
  fi
}

usage() {
  cat <<EOF
${c_bold}SEA Bank demo — high-resolution (1s) custom metric emitter${c_reset}

Usage: $(basename "$0") [options]

Options:
  --duration SECONDS   How long to emit (default: ${DURATION}; use >= 300 for a 5m window).
  --interval SECONDS   Seconds between datapoints (default: ${INTERVAL}; 1 = high-res).
  --metric NAME        Metric name to send (default: ${METRIC}).
  --dry-run            Print what would be sent without calling the ingest API.
  --env-file PATH      Source app config from PATH (default: ${DEFAULT_ENV_FILE}).
  -h, --help           Show this help.

Then in O11y: chart '${METRIC}', set Chart Options -> Minimum resolution -> 1s over
the last 15m. Duplicate it at 10s to see the 1s spikes get rolled away.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --duration) DURATION="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --metric)   METRIC="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    -h|--help)  usage; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

command -v curl >/dev/null 2>&1 || die "Required command not found: curl"
command -v awk  >/dev/null 2>&1 || die "Required command not found: awk"

# ── Load config (repo-root .env) ─────────────────────────────────────────────
if [[ -f "${ENV_FILE}" ]]; then
  step "Loading config from ${ENV_FILE}"
  set -a; source "${ENV_FILE}"; set +a
else
  info "No env file at ${ENV_FILE} (using current environment)."
fi

REALM="${SPLUNK_REALM:-}"
TOKEN="$(resolve_secret "${SPLUNK_ACCESS_TOKEN:-}")"
INGEST_URL="${SPLUNK_INGEST_URL:-https://ingest.${REALM}.signalfx.com/v2/datapoint}"
ENVIRONMENT="${DEMO_ENVIRONMENT:-demoBanking-rum}"

if [[ "${DRY_RUN}" -eq 0 ]]; then
  [[ -n "${REALM}" ]] || die "SPLUNK_REALM is not set (expected in .env)."
  [[ -n "${TOKEN}" ]] || die "SPLUNK_ACCESS_TOKEN is not set (expected in .env)."
fi

step "High-resolution custom metric demo"
info "metric:      ${METRIC}   (dimension sf_hires=1)"
info "ingest:      ${INGEST_URL}"
info "token:       $(mask "${TOKEN}")"
info "cadence:     1 datapoint every ${INTERVAL}s for ${DURATION}s (~$((DURATION / 60))m of data)"
info "environment: ${ENVIRONMENT}"

# Fire one datapoint. Two things pin the NATIVE resolution to exactly 1s:
#   1. An explicit timestamp on a whole-second grid — Splunk stores the point at that
#      second no matter when the POST lands, so network jitter can't smear the spacing
#      (jittered arrival is what made O11y store the MTS at 2s).
#   2. curl runs in the BACKGROUND so its round-trip never stretches the send cadence.
send_point() {
  local value="$1" ts_ms="$2" body
  body="{\"gauge\":[{\"metric\":\"${METRIC}\",\"value\":${value},\"timestamp\":${ts_ms},\"dimensions\":{\"sf_hires\":\"1\",\"service\":\"sea-bank-demo\",\"deployment_environment\":\"${ENVIRONMENT}\",\"metric_source\":\"hires-demo\"}}]}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '    %s[dry-run]%s %s\n' "${c_yellow}" "${c_reset}" "${body}" >&2
    return 0
  fi
  {
    code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${INGEST_URL}" \
      -H "Content-Type: application/json" -H "X-SF-Token: ${TOKEN}" \
      --max-time 5 -d "${body}" 2>/dev/null || printf '000')"
    [[ "${code}" == "200" ]] || printf '    %s! ingest HTTP %s%s\n' "${c_yellow}" "${code}" "${c_reset}" >&2
  } &
}

sent=0
start="$(date +%s)"
trap 'echo; step "Stopped early"; info "sent≈${sent} datapoints"; wait 2>/dev/null; exit 0' INT

step "Emitting… (Ctrl-C to stop)"
i=0
while (( i * INTERVAL < DURATION )); do
  elapsed=$((i * INTERVAL))
  ts_ms=$(( (start + elapsed) * 1000 ))       # whole-second grid timestamp (ms)
  value="$(awk -v t="${elapsed}" 'BEGIN{ pi=3.14159265; base=50 + 25*sin(2*pi*t/60); spike=((t % 7)==0)?45:0; printf "%.2f", base + spike }')"
  send_point "${value}" "${ts_ms}"
  sent=$((sent + 1)); i=$((i + 1))

  # Progress heartbeat every 30s so you can see it working.
  if (( elapsed > 0 && elapsed % 30 == 0 )); then
    ok "t=${elapsed}s  sent≈${sent}  last=${value}"
  fi

  # Sleep only until the next grid tick, so curl time never adds to the interval.
  now="$(date +%s)"
  delta=$(( start + i * INTERVAL - now ))
  (( delta > 0 )) && sleep "${delta}"
done

wait 2>/dev/null   # let in-flight background sends finish
step "Done"
info "sent≈${sent} datapoints over ${DURATION}s (explicit 1s-grid timestamps + sf_hires=1)"
info "Chart it: metric '${METRIC}', Chart Options -> Minimum resolution -> 1s (NOT Auto), last 15m."
info "If it still reads 2s: Auto rollup chose 2s — force Minimum resolution = 1s in Chart Options."
