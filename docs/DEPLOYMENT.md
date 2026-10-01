# Deployment — SEA Bank Demo backend

## Prerequisites

- Docker, `kubectl`, and a local cluster (minikube or kind).
- Node.js ≥ 20 (only needed to run/build services outside containers).

## minikube (recommended)

```bash
minikube start -p sea-bank-demo --cpus=4 --memory=6144
kubectl config use-context sea-bank-demo

# Build images straight into the cluster's Docker daemon
eval "$(minikube -p sea-bank-demo docker-env)"
cd o11y_banking_demo
./scripts/build-images.sh

./scripts/deploy.sh          # kubectl apply -k k8s/base + waits for rollouts
./scripts/smoke-test.sh      # end-to-end check
./scripts/port-forward-gateway.sh
```

## kind

```bash
kind create cluster --name sea-bank-demo
cd o11y_banking_demo
./scripts/build-images.sh
./scripts/load-images-kind.sh sea-bank-demo   # load images into the kind node
./scripts/deploy.sh
```

## What gets deployed

`kubectl apply -k k8s/base` creates (see the rendered `k8s/all.yaml`):

- namespace `sea-bank-demo`
- ConfigMap `sea-bank-demo-config` (`DEPLOYMENT_ENVIRONMENT=demoBanking-rum`)
- Deployments + ClusterIP Services for `auth-service`, `account-service`,
  `transfer-service`, `api-gateway`
- `api-gateway-nodeport` (NodePort `30080`) for optional node-level access

Images are `localhost/sea-bank-demo/<service>:0.1.0` with `imagePullPolicy: IfNotPresent`
(local images; nothing is pulled from a registry).

## Accessing the gateway

- Port-forward (default): `./scripts/port-forward-gateway.sh` → `http://localhost:8080`
- NodePort: `http://$(minikube -p sea-bank-demo ip):30080`

Set the app's `apiBaseUrl` (in `app-ios/src/config.ts`) accordingly. On a **physical device**,
use your machine's LAN IP, not `localhost`.

## Config surface (env)

| Var | Service | Default | Purpose |
|---|---|---|---|
| `PORT` | all | per service | Listen port |
| `SERVICE_NAME` | all | per service | Logical service name (logs / telemetry) |
| `DEPLOYMENT_ENVIRONMENT` | all | `demoBanking-rum` | Environment tag |
| `AUTH_SECRET` | auth | `sea-bank-demo-secret` | HMAC key for demo tokens |
| `AUTH_URL`/`ACCOUNT_URL`/`TRANSFER_URL` | gateway, transfer | k8s DNS | Downstream service URLs |

## Teardown

```bash
./scripts/teardown.sh              # delete kustomize resources
./scripts/teardown.sh --namespace  # delete the whole namespace
minikube delete -p sea-bank-demo   # nuke the cluster
```

## Run without Kubernetes (local)

```bash
cd services && npm install && npm run build
SERVICE_NAME=auth-service    PORT=8081 node apps/auth-service/dist/index.js &
SERVICE_NAME=account-service PORT=8082 node apps/account-service/dist/index.js &
SERVICE_NAME=transfer-service PORT=8083 ACCOUNT_URL=http://localhost:8082 node apps/transfer-service/dist/index.js &
SERVICE_NAME=api-gateway PORT=8080 AUTH_URL=http://localhost:8081 ACCOUNT_URL=http://localhost:8082 TRANSFER_URL=http://localhost:8083 node apps/api-gateway/dist/index.js &
BASE_URL=http://localhost:8080 ./scripts/smoke-test.sh
```
