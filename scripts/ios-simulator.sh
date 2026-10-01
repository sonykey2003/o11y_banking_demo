#!/usr/bin/env bash
# scripts/ios-simulator.sh — Open the iOS simulator GUI and boot a device.
#
# Xcode 26/27 replaced Simulator.app with DeviceHub.app, so `open -a Simulator`
# fails there; older Xcode has no DeviceHub. This picks whichever exists.
#
# Usage: ./scripts/ios-simulator.sh [device-name]
#          device-name   defaults to IOS_SIM_DEVICE, else the first available iPhone
#        IOS_SIM_APP=/path/to/Some.app  force a specific GUI app
set -euo pipefail

DEVICE="${1:-${IOS_SIM_DEVICE:-}}"

command -v xcrun >/dev/null 2>&1 || { echo "Error: xcrun not found — install Xcode." >&2; exit 1; }

DEVELOPER_DIR="$(xcode-select -p 2>/dev/null || echo /Applications/Xcode.app/Contents/Developer)"
XCODE_APP="${DEVELOPER_DIR%/Contents/Developer}"

if [[ -n "${IOS_SIM_APP:-}" ]]; then
  SIM_APP="${IOS_SIM_APP}"
else
  SIM_APP=""
  for candidate in \
    "${XCODE_APP}/Contents/Applications/DeviceHub.app" \
    "${DEVELOPER_DIR}/Applications/Simulator.app" \
    "${XCODE_APP}/Contents/Applications/Simulator.app" \
    "/Applications/Simulator.app"
  do
    [[ -d "${candidate}" ]] && { SIM_APP="${candidate}"; break; }
  done
fi

# Boot first: the GUI attaches to whatever is already booted.
if [[ -z "${DEVICE}" ]]; then
  # Reuse an already-booted device so we don't start a second one.
  DEVICE="$(xcrun simctl list devices booted | grep -oE '^ +iPhone [^(]*' | head -1 | xargs || true)"
fi
if [[ -z "${DEVICE}" ]]; then
  DEVICE="$(xcrun simctl list devices available | grep -oE '^ +iPhone [^(]*' | head -1 | xargs || true)"
fi
[[ -n "${DEVICE}" ]] || { echo "Error: no available iPhone simulator found. Add one in Xcode > Settings > Components." >&2; exit 1; }

if xcrun simctl list devices booted | grep -q "${DEVICE}"; then
  echo "==> ${DEVICE} already booted"
else
  echo "==> Booting ${DEVICE}"
  xcrun simctl boot "${DEVICE}" 2>/dev/null || true
fi

if [[ -n "${SIM_APP}" ]]; then
  echo "==> Opening $(basename "${SIM_APP}")"
  open -a "${SIM_APP}"
else
  echo "!   No simulator GUI found (looked for DeviceHub.app and Simulator.app)."
  echo "    The device is booted and 'npm run ios' will still work headlessly."
  echo "    Override with IOS_SIM_APP=/path/to/App.app if yours lives elsewhere."
fi

echo
echo "Next: cd app-ios && npm run ios"
