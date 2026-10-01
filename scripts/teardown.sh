#!/usr/bin/env bash
# scripts/teardown.sh — Remove the SEA Bank demo backend from the cluster.
# Usage: ./scripts/teardown.sh [--namespace]
#   (default) delete the kustomize resources
#   --namespace  delete the whole sea-bank-demo namespace
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
NAMESPACE="sea-bank-demo"

if [[ "${1:-}" == "--namespace" ]]; then
  echo "==> Deleting namespace ${NAMESPACE}"
  kubectl delete namespace "${NAMESPACE}" --ignore-not-found
else
  echo "==> Deleting kustomize resources (namespace kept)"
  kubectl delete -k "${ROOT}/k8s/base" --ignore-not-found
fi

echo "✓ Teardown complete."
