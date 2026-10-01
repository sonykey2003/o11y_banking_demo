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

# The AppDynamics pods declare deployment targets of 11.0/13.0; Xcode 16+ rejects
# anything below 15.0, so raise every pod target before `pod install` links them.
XCODE_MAJOR="$(xcodebuild -version 2>/dev/null | head -1 | sed -E 's/Xcode ([0-9]+).*/\1/')"
PODFILE="${APP_DIR}/ios/Podfile"
MIN_IOS="15.1"
if [[ -f "${PODFILE}" ]] && ! grep -q 'IPHONEOS_DEPLOYMENT_TARGET' "${PODFILE}"; then
  python3 - "${PODFILE}" "${MIN_IOS}" <<'PY'
import sys, re
path, min_ios = sys.argv[1], sys.argv[2]
src = open(path).read()
patch = f'''
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        cur = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if cur.nil? || cur.to_f < {min_ios}
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '{min_ios}'
        end
      end
    end
  end
end'''
# Append inside the existing post_install block, before its closing `end end`.
src = re.sub(r'\n  end\nend\s*$', patch + '\n', src)
open(path, 'w').write(src)
PY
  echo "    Raised pod IPHONEOS_DEPLOYMENT_TARGET to ${MIN_IOS} (AppDynamics pods ship 11.0/13.0)"
fi

# Apps built against the iOS 26+ SDK must declare UIScene adoption or UIKit refuses to
# launch them. Skipped on older Xcode, which neither needs nor expects the key.
PLIST="${APP_DIR}/ios/${APP_NAME}/Info.plist"
if [[ -f "${PLIST}" && -n "${XCODE_MAJOR}" && "${XCODE_MAJOR}" -ge 26 ]] \
   && ! /usr/libexec/PlistBuddy -c "Print :UIApplicationSceneManifest" "${PLIST}" >/dev/null 2>&1; then
  /usr/libexec/PlistBuddy \
    -c "Add :UIApplicationSceneManifest dict" \
    -c "Add :UIApplicationSceneManifest:UIApplicationSupportsMultipleScenes bool false" \
    "${PLIST}" >/dev/null
  echo "    Added UIApplicationSceneManifest to Info.plist (required by the iOS 26+ SDK)"
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
