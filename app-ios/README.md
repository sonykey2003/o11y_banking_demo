# SEA Bank Demo — React Native app

A re-brandable iOS banking app (login, check balance, money transfer — all fake) with a
15-brand logo/theme switcher, a Demo Controls panel, and **gated** Splunk / AppDynamics RUM.

> The JS/TS sources here are complete. The **native** iOS/Android projects (`ios/`, `android/`)
> are generated once by `../scripts/init-app.sh` (they're git-ignored, not committed).

## Structure

```
app/
  App.tsx                 Providers + tiny state router
  index.js                Entry; initializes RUM (no-op unless configured)
  src/
    config.ts             ★ Edit me: apiBaseUrl, defaultBrandId, RUM provider + tokens
    api/client.ts         Gateway client + demo fault headers
    telemetry/index.ts    Gated RUM facade (Splunk | AppDynamics | none)
    state/AuthContext.tsx
    theme/ThemeContext.tsx
    navigation/NavContext.tsx
    components/           BrandLogo + UI kit
    screens/              Login, Dashboard, Transfer, BrandPicker, DemoControls
  brands/brands.ts        The 15 SEA bank brands (monogram + palette)
```

## Prerequisites

- Node ≥ 20, Xcode + iOS 15+ simulator, CocoaPods, Watchman (recommended).
- A running backend gateway (see repo root `../scripts/deploy.sh` + `port-forward-gateway.sh`).

## Bootstrap (one-time)

```bash
# from the repo root
./scripts/init-app.sh          # installs deps, generates app/ios + app/android, pod install
```

## Run

```bash
cd app
npm run ios                    # or: npx react-native run-ios
```

Set the backend URL and (optionally) RUM in [src/config.ts](src/config.ts):

```ts
apiBaseUrl: 'http://localhost:8080',   // LAN IP on a physical device
defaultBrandId: 'dbs',
rum: { provider: 'none' /* 'splunk' | 'appdynamics' */, ... }
```

Demo users: `demo/demo`, `alice/password`, `bob/password`.

## Features to show

- **Brand switcher** — Login/Dashboard → *Switch bank brand* re-skins instantly.
- **Login → Dashboard → Transfer** — full fake flow; transfers settle asynchronously.
- **Demo Controls** — inject backend faults, per-request fault headers, and client-side RUM
  events (handled/uncaught errors, unhandled rejection, failed network, JS-thread freeze).

## RUM

Off by default. See [../README.md](../README.md) to enable Splunk or AppDynamics. The
telemetry facade is a safe no-op until a provider + token/appKey is configured.

## Type-check

```bash
npm run tsc
```
