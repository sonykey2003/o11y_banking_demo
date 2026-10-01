#!/usr/bin/env bash
# scripts/deploy.sh — Deploy the SEA Bank demo backend to the current kube-context.
# Usage: ./scripts/deploy.sh
#
# Expects images already built into the cluster's docker daemon, e.g. with minikube:
#   minikube start -p sea-bank-demo --cpus=4 --memory=6144
#   kubectl config use-context sea-bank-demo
#   eval "$(minikube -p sea-bank-demo docker-env)"
#   ./scripts/build-images.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
NAMESPACE="sea-bank-demo"

echo "==> Applying manifests (kustomize base) to context: $(kubectl config current-context)"
kubectl apply -k "${ROOT}/k8s/base"

echo "==> Waiting for rollouts..."
for d in auth-service account-service transfer-service api-gateway; do
  kubectl rollout status "deployment/${d}" -n "${NAMESPACE}" --timeout=120s
done

echo ""
echo "✓ SEA Bank demo backend is up in namespace '${NAMESPACE}'."
echo "  Expose the gateway:  ./scripts/port-forward-gateway.sh"
echo "  Smoke test:          ./scripts/smoke-test.sh"
