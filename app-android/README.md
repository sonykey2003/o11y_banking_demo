# SEA Bank Demo — React Native app (Android)

Android build of the re-brandable banking app (login, balance, transfer) with the
15-brand switcher, Demo Controls, and gated Splunk / AppDynamics RUM. Shares the same
cross-platform source as the iOS app, tuned for Android.

> The JS/TS sources here are complete. The **native** `android/` project is generated
> once by [`../scripts/init-android.sh`](../scripts/init-android.sh) (git-ignored).

## Structure

```
app/
  App.tsx / index.js       Providers + entry (initializes RUM; no-op unless configured)
  src/
    config.ts              apiBaseUrl (10.0.2.2 on Android), RUM provider + @env token
    api/client.ts          Gateway client + demo fault headers
    telemetry/index.ts     Gated RUM facade (Splunk | AppDynamics | none)
    state/ theme/ navigation/ components/ screens/
  brands/brands.ts         The 15 SEA bank brands
  .env                     gitignored — paste ANDROID_SPLUNK_RUM_ACCESS_TOKEN here
```

## Prerequisites
- Android Studio + Android SDK + JDK 17, an emulator (AVD) or device.
- Node ≥ 20, Watchman (recommended).
- Backend running (see [../README.md](../README.md)).

## Bootstrap (one-time)

```bash
# from the repo root
./scripts/init-android.sh          # deps + generate app/android + Android tweaks
```

## Run

```bash
cd app
npm run android                    # or: npx react-native run-android
```

The app targets `http://10.0.2.2:8080` on Android (the emulator's alias for the host
running the gateway port-forward). On a physical device, set your LAN IP in
[src/config.ts](src/config.ts).

Demo users: `demo/demo`, `alice/password`, `bob/password`.

> **RN 0.77 note:** this app runs on React Native 0.77.3 (the iOS app is on 0.76.5) so the
> Splunk RUM Android SDK's Kotlin 2.1 code compiles. RN 0.77 also moved JS `console` logs
> into **React Native DevTools** — press **`j`** in the Metro terminal to view them.

## RUM
Off by default. Put a **RUM** access token in the gitignored `.env`
(`ANDROID_SPLUNK_RUM_ACCESS_TOKEN=…`), set `rum.provider` in `src/config.ts` if needed, then
rebuild (restart Metro with `npm start -- --reset-cache` after editing `.env`). See
[../docs/RUM.md](../docs/RUM.md).

## Type-check
```bash
npm run tsc
```
