#!/usr/bin/env bash
# scripts/port-forward-gateway.sh — Expose the api-gateway on localhost:8080.
# Usage: ./scripts/port-forward-gateway.sh [local_port]
set -euo pipefail

NAMESPACE="sea-bank-demo"
LOCAL_PORT="${1:-8080}"

echo "==> Forwarding svc/api-gateway ${LOCAL_PORT} -> 8080 (namespace ${NAMESPACE})"
echo "    Gateway base URL: http://localhost:${LOCAL_PORT}"
echo "    Point the app at this URL (app-ios/src/config.ts: apiBaseUrl=http://localhost:${LOCAL_PORT})."
echo "    Ctrl-C to stop."
exec kubectl -n "${NAMESPACE}" port-forward "svc/api-gateway" "${LOCAL_PORT}:8080"
