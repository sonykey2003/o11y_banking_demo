# Mobile RUM — Splunk & AppDynamics (gated / opt-in)

The app supports **both** Splunk RUM and AppDynamics mobile RUM, chosen at runtime in
[app-ios/src/config.ts](../app-ios/src/config.ts). RUM is **off by default** (`provider: 'none'`) —
the app runs with zero observability wiring. This keeps mobile instrumentation "detached":
opt-in via config + native SDK, never required for the app to work.

The gated facade lives in `app-ios/src/telemetry/index.ts`. It lazily `require`s the chosen SDK
and wraps every call in try/catch, so a missing native module or API drift degrades to a
warning instead of a crash.

Environment tag: **`demoBanking-rum`** (Splunk `deploymentEnvironment`; AppDynamics user-data
`deployment.environment`).

---

## Splunk RUM (`@splunk/otel-react-native`)

1. In `app-ios/src/config.ts`:
   ```ts
   rum: {
     provider: 'splunk',
     splunk: {
       realm: 'us1',                        // your realm
       rumAccessToken: 'YOUR_RUM_TOKEN',    // do NOT commit real tokens
       applicationName: 'demoBanking-rum-ios',
       deploymentEnvironment: 'demoBanking-rum',
     },
     // ...
   }
   ```
2. Install pods and run:
   ```bash
   cd app-ios/ios && pod install && cd ..
   npm run ios
   ```
3. The SDK auto-captures app lifecycle, network requests (fetch/XHR), interactions, crashes,
   and slow rendering. The app also emits explicit events via the facade:
   - `telemetry.trackScreen(name)` on every navigation (`SplunkRum.instance.navigation.track`)
   - `telemetry.trackEvent('login_submit' | 'transfer_submit', …)`
   - `telemetry.reportError(err)` for handled errors

Requirements: React Native ≥ 0.75, React ≥ 18.2, iOS ≥ 15.

## AppDynamics RUM (`@appdynamics/react-native-agent`)

1. In `app-ios/src/config.ts` set `rum.provider: 'appdynamics'` and `appdynamics.appKey` to your
   EUM app key.
2. Apply the build-time instrumentation (modifies the native build config), then pods + run:
   ```bash
   cd app-ios && npm run appd:instrument   # node node_modules/@appdynamics/react-native-agent/bin/cli.js install
   cd ios && pod install && cd ..
   npm run ios
   ```
   `scripts/init-ios.sh` runs the instrument step automatically when `RUM_PROVIDER=appdynamics`.
3. The agent captures network requests, crashes, and screen/app metrics. The facade maps
   `trackEvent` → breadcrumb and `reportError` → `Instrumentation.reportError`.

---

## Demonstrating RUM

Use the in-app **Demo Controls** screen:

| Action | RUM signal |
|---|---|
| Report handled error | Custom/handled error event |
| Throw uncaught error | JS error / crash report |
| Unhandled promise rejection | Unhandled rejection |
| Failed network call | Errored network span (404) |
| Freeze JS thread (2s) | Jank / slow render / ANR-like |
| Per-request fault headers | Slow/failed backend calls visible in RUM network spans |

## RUM ↔ APM correlation

With the backend instrumented (see [OBSERVABILITY.md](OBSERVABILITY.md)) and RUM configured,
the RUM SDK propagates `traceparent` on the gateway calls, so a tapped **Transfer** in a RUM
session links to the `transfer.create` → `transfer.settle` backend trace. Keep the gateway on
the same origin the RUM SDK is allowed to correlate with.

## Turning RUM fully off / removing native weight

Set `provider: 'none'` to disable at runtime. To remove the native modules entirely, delete
`@splunk/otel-react-native` and/or `@appdynamics/react-native-agent` from
`app-ios/package.json`, remove the matching `require` in `app-ios/src/telemetry/index.ts`, and
`pod install` again.

> Never commit real RUM access tokens or EUM app keys. Keep them in local edits only.
