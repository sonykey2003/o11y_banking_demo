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

# Identity values live in .env so several people can share one O11y instance.
# Anything already exported wins over the file, so `DEMO_ENVIRONMENT=x ./deploy.sh` works.
ENV_FILE="${DEMO_ENV_FILE:-${ROOT}/.env}"
_pre_environment="${DEMO_ENVIRONMENT:-}"
_pre_namespace="${DEMO_APP_NAMESPACE:-}"
# shellcheck disable=SC1090
[[ -f "${ENV_FILE}" ]] && { set -a; source "${ENV_FILE}"; set +a; }

NAMESPACE="${_pre_namespace:-${DEMO_APP_NAMESPACE:-sea-bank-demo}}"
ENVIRONMENT="${_pre_environment:-${DEMO_ENVIRONMENT:-demoBanking-rum}}"

echo "==> Applying manifests (kustomize base) to context: $(kubectl config current-context)"
kubectl apply -k "${ROOT}/k8s/base"

# The ConfigMap ships a default; override it so app logs carry the same
# deployment.environment the collector stamps on spans.
echo "==> Setting DEPLOYMENT_ENVIRONMENT=${ENVIRONMENT}"
kubectl patch configmap sea-bank-demo-config -n "${NAMESPACE}" --type merge \
  -p "{\"data\":{\"DEPLOYMENT_ENVIRONMENT\":\"${ENVIRONMENT}\"}}" >/dev/null
kubectl rollout restart deployment -n "${NAMESPACE}" \
  auth-service account-service transfer-service api-gateway >/dev/null

echo "==> Waiting for rollouts..."
for d in auth-service account-service transfer-service api-gateway; do
  kubectl rollout status "deployment/${d}" -n "${NAMESPACE}" --timeout=120s
done

echo ""
echo "✓ SEA Bank demo backend is up in namespace '${NAMESPACE}' (environment=${ENVIRONMENT})."
echo "  Expose the gateway:  ./scripts/port-forward-gateway.sh"
echo "  Smoke test:          ./scripts/smoke-test.sh"
