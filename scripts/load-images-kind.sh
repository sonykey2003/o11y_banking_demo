#!/usr/bin/env bash
# scripts/load-images-kind.sh — Load the locally built images into a kind cluster.
# Usage: ./scripts/load-images-kind.sh [kind-cluster-name]
# (Not needed for minikube when using `eval "$(minikube docker-env)"` before building.)
set -euo pipefail

CLUSTER="${1:-kind}"
IMAGE_PREFIX="localhost/sea-bank-demo"
VERSION="0.1.0"
SERVICES=(api-gateway auth-service account-service transfer-service)

for svc in "${SERVICES[@]}"; do
  echo "==> kind load docker-image ${IMAGE_PREFIX}/${svc}:${VERSION} --name ${CLUSTER}"
  kind load docker-image "${IMAGE_PREFIX}/${svc}:${VERSION}" --name "${CLUSTER}"
done

echo "✓ Images loaded into kind cluster '${CLUSTER}'."
