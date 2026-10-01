#!/usr/bin/env bash
# scripts/build-images.sh — Build all SEA Bank demo backend images locally.
# Usage: ./scripts/build-images.sh
#
# Build context is services (the npm workspace root) for every image so
# each service can resolve the shared @sea-bank/common package.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE_PREFIX="localhost/sea-bank-demo"
VERSION="0.1.0"
SERVICES=(api-gateway auth-service account-service transfer-service)

echo "==> Building SEA Bank demo images (prefix: ${IMAGE_PREFIX}, version: ${VERSION})"

for svc in "${SERVICES[@]}"; do
  echo ""
  echo "──► Building ${IMAGE_PREFIX}/${svc}:${VERSION}"
  docker build \
    --file "${ROOT}/services/apps/${svc}/Dockerfile" \
    --tag "${IMAGE_PREFIX}/${svc}:${VERSION}" \
    "${ROOT}/services"
done

echo ""
echo "✓ All images built successfully."
docker images --filter "reference=${IMAGE_PREFIX}/*" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
