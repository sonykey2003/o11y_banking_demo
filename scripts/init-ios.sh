#!/usr/bin/env bash
# scripts/init-ios.sh — One-time bootstrap of the React Native app's NATIVE iOS
# (and Android) project. The JS/TS sources in app-ios/ are complete and committed; the
# native shells (app-ios/ios, app-ios/android) are generated here because they can't be
# meaningfully hand-authored/committed.
#
# What it does:
#   1. Installs the app's npm dependencies.
#   2. Generates the native iOS/Android projects for the pinned RN version and copies
#      them into app-ios/ (skipped if app-ios/ios already exists).
#   3. Runs CocoaPods to link native modules (incl. the RUM SDKs, if kept in deps).
#   4. If RUM_PROVIDER=appdynamics, runs the AppDynamics build-time instrumentation CLI.
#
# Usage: ./scripts/init-ios.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${ROOT}/app-ios"
APP_NAME="SeaBankDemo"
RN_VERSION="0.76.5"

echo "==> [1/4] Installing app dependencies"
(cd "${APP_DIR}" && npm install)

if [[ -d "${APP_DIR}/ios" ]]; then
  echo "==> [2/4] app-ios/ios already exists — skipping native project generation"
else
  echo "==> [2/4] Generating native iOS/Android projects (RN ${RN_VERSION})"
  TMP="$(mktemp -d)"
  trap 'rm -rf "${TMP}"' EXIT
  npx --yes @react-native-community/cli@latest init "${APP_NAME}" \
    --version "${RN_VERSION}" --directory "${TMP}/${APP_NAME}" --skip-install --pm npm
  cp -R "${TMP}/${APP_NAME}/ios" "${APP_DIR}/ios"
  cp -R "${TMP}/${APP_NAME}/android" "${APP_DIR}/android"
  [[ -f "${TMP}/${APP_NAME}/Gemfile" ]] && cp "${TMP}/${APP_NAME}/Gemfile" "${APP_DIR}/Gemfile" || true
  echo "    Copied ios/ and android/ into app-ios/"
fi

echo "==> [3/4] Installing CocoaPods (links native modules incl. RUM SDKs)"
if command -v pod >/dev/null 2>&1; then
  (cd "${APP_DIR}/ios" && pod install)
else
  echo "    ! CocoaPods 'pod' not found. Install it (sudo gem install cocoapods) then run: cd app-ios/ios && pod install"
fi

if [[ "${RUM_PROVIDER:-}" == "appdynamics" ]]; then
  echo "==> [4/4] Applying AppDynamics build-time instrumentation"
  (cd "${APP_DIR}" && npm run appd:instrument)
else
  echo "==> [4/4] Skipping AppDynamics build-time step (set RUM_PROVIDER=appdynamics to enable)"
fi

cat <<EOF

✓ App bootstrap complete.

Next:
  1. Start the backend and expose the gateway:
       (in the repo root) ./scripts/deploy.sh && ./scripts/port-forward-gateway.sh
  2. Point the app at the gateway: edit app-ios/src/config.ts (apiBaseUrl).
  3. Run the app:
       cd app-ios && npm run ios
  4. (Optional) Enable RUM: set rum.provider + token/appKey in app-ios/src/config.ts.
     See the README.
EOF
