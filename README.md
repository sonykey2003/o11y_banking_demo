# SEA Bank Demo — Splunk Observability (APM + RUM)

A synthetic retail-banking demo: four Node.js/TypeScript microservices and MySQL on
Kubernetes, with React Native iOS and Android apps. Built to show **Splunk APM**,
**Database Monitoring**, **Log Observer Connect**, and **Mobile RUM** end to end,
including on-demand latency and error injection.

All data is synthetic. No real customer data, credentials, or bank logos are used.

---

## 1. Prerequisites

Everything runs on your laptop. Install these before starting.

### Required — backend

| Tool | Version | Install (macOS) |
|---|---|---|
| Docker Desktop | latest | `brew install --cask docker` |
| minikube | ≥ 1.33 | `brew install minikube` |
| kubectl | ≥ 1.29 | `brew install kubectl` |
| Helm | ≥ 3.14 | `brew install helm` |
| Node.js | ≥ 20 | `brew install node@20` |
| jq | latest | `brew install jq` |

Start Docker Desktop and confirm it is running before step 3.

### Required — Splunk Observability Cloud

| Value | Where to get it |
|---|---|
| Realm | O11y → your profile. Example: `us0`, `us1`, `eu0`, `ap0` |
| Access token | O11y → **Settings → Access Tokens**. Needs ingest scope |

### Optional — mobile apps

| Platform | Requirements |
|---|---|
| iOS | macOS, Xcode 15+ with Command Line Tools, CocoaPods (`sudo gem install cocoapods`), Watchman (`brew install watchman`) |
| Android | Android Studio, Android SDK, JDK 17, an emulator (AVD). Export `ANDROID_HOME` before building |

> **Xcode 26 / macOS 26 and newer:** Apple replaced `Simulator.app` with `DeviceHub.app`, so
> `open -a Simulator` no longer works. Use `./scripts/ios-simulator.sh`, which opens whichever
> is present. `init-ios.sh` handles the matching UIScene requirement automatically.

Mobile RUM also needs a **RUM access token** (O11y → Settings → Access Tokens →
RUM authorization). This is a *different* token from the ingest one above.

### Optional — trace-correlated logs

Log Observer Connect requires a **Splunk Cloud stack** plus an admin login and a
HEC token. Skip section 7 if you do not have one; APM, DBMon, and RUM work without it.

### Naming — important on a shared O11y instance

Every name this demo reports is configurable. If several people point this at the **same**
Splunk Observability instance, change them or your data merges with theirs.

Pick a unique prefix (your initials, ticket number, whatever) and apply it consistently.

**Backend** — in `.env` at the repo root:

| Variable | Default | Appears in O11y as |
|---|---|---|
| `DEMO_ENVIRONMENT` | `demoBanking-rum` | `deployment.environment` — the main APM/RUM filter |
| `DEMO_CLUSTER_NAME` | `sea-bank-demo` | `k8s.cluster.name` in Infrastructure |
| `DEMO_SPLUNK_INDEX` | `sea_bank_demo` | Splunk index holding the logs |
| `DEMO_APP_NAMESPACE` | `sea-bank-demo` | Kubernetes namespace (local only) |
| `DEMO_OTEL_NAMESPACE` | `splunk-otel` | Collector namespace (local only) |

**Mobile** — in `app-ios/.env` and `app-android/.env`:

| Variable | Default |
|---|---|
| `IOS_RUM_APP_NAME` / `ANDROID_RUM_APP_NAME` | `demoBanking-rum-ios` / `-android` |
| `IOS_RUM_ENVIRONMENT` / `ANDROID_RUM_ENVIRONMENT` | `demoBanking-rum` |
| `IOS_SPLUNK_REALM` / `ANDROID_SPLUNK_REALM` | `us1` |

For example, to namespace everything as `acme`:

```bash
# .env
export DEMO_ENVIRONMENT="acme-banking"
export DEMO_CLUSTER_NAME="acme-banking"
export DEMO_SPLUNK_INDEX="acme_banking"

# app-ios/.env
IOS_RUM_APP_NAME=acme-banking-ios
IOS_RUM_ENVIRONMENT=acme-banking

# app-android/.env
ANDROID_RUM_APP_NAME=acme-banking-android
ANDROID_RUM_ENVIRONMENT=acme-banking
```

Keep `DEMO_ENVIRONMENT` and the two `*_RUM_ENVIRONMENT` values **identical** — that is what
ties mobile RUM sessions to the backend traces they triggered.

Service names (`api-gateway`, `auth-service`, …) are deliberately left alone; APM scopes
them by environment, so they do not collide.

> Set these **before** step 3. Changing `DEMO_ENVIRONMENT` later means re-running
> `./scripts/deploy.sh` and `./scripts/splunk-instrumentation.sh all`, and rebuilding the
> mobile apps.

---

## 2. Configure

```bash
git clone https://github.com/sonykey2003/o11y_banking_demo.git
cd o11y_banking_demo
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
export SPLUNK_REALM="us1"          # your realm
export SPLUNK_ACCESS_TOKEN="..."   # your ingest token
```

If you are sharing an O11y instance, also set the identity values now — see
[Naming](#naming--important-on-a-shared-o11y-instance) above.

`.env` is gitignored. Leave the rest at their defaults for a first run.

---

## 3. Start the cluster and build images

```bash
minikube start -p sea-bank-demo --cpus=4 --memory=6144
kubectl config use-context sea-bank-demo

# Build into minikube's Docker daemon, not your host's
eval "$(minikube -p sea-bank-demo docker-env)"
./scripts/build-images.sh
```

This produces `localhost/sea-bank-demo/{api-gateway,auth-service,account-service,transfer-service}:0.1.0`.

---

## 4. Create the database secret and deploy

```bash
kubectl create namespace sea-bank-demo

kubectl -n sea-bank-demo create secret generic sea-bank-mysql \
  --from-literal=root-password="$(openssl rand -base64 24)" \
  --from-literal=username='bankapp' \
  --from-literal=password="$(openssl rand -base64 24)"

./scripts/deploy.sh
```

---

## 5. Verify

```bash
./scripts/smoke-test.sh
```

This runs login → dashboard → transfer → async settlement through the gateway.
All checks must pass before you continue.

To use the app yourself:

```bash
./scripts/port-forward-gateway.sh    # http://localhost:8080
```

| Service | Port | Responsibility |
|---|---|---|
| api-gateway | 8080 | The only backend the apps talk to; aggregates the dashboard |
| auth-service | 8081 | Login and session tokens |
| account-service | 8082 | Accounts, balances, transactions |
| transfer-service | 8083 | Validate → create → async settle |
| mysql | 3306 | `bankdb` — accounts, transactions, transfers |

Demo users: `demo/demo`, `alice/password`, `bob/password`.

---

## 6. Turn on Splunk APM

```bash
./scripts/splunk-instrumentation.sh all
```

`all` runs three phases. You can run them individually (`connect`, `instrument`, `verify`),
and add `--dry-run` to print every command without executing it.

**`connect`** — installs the Splunk OTel Collector via Helm into the `splunk-otel`
namespace (chart pinned to `0.157.0`), along with the OpenTelemetry Operator and
cert-manager. It stores your token in a Kubernetes secret rather than in Helm values,
and configures the collector to:

| Setting | Why |
|---|---|
| `clusterName`, `environment` | Tag every signal with `k8s.cluster.name` and `deployment.environment` |
| `transform/clear_container_id` + `transform/set_instance_id` | The Node agent reports a cgroup-derived `container.id` that does not match the Kubernetes runtime value. These drop it before `k8s_attributes` and rebuild `service.instance.id` after, so APM ↔ Infrastructure correlation works |
| `transform/enrich_mysql_peer` | The mysql2 driver emits no `peer.service`, so MySQL never appears in the service map. This adds it |
| exporters `otlp_http` + `signalfx` | `otlp_http` ships spans; `signalfx` only writes correlation dimensions |

**`instrument`** — annotates the four Deployments with
`instrumentation.opentelemetry.io/inject-nodejs`, then restarts them. The Operator injects
the Node.js agent with `OTEL_LOGS_EXPORTER=otlp`, `OTEL_METRICS_EXPORTER=otlp`, and
`SPLUNK_METRICS_ENABLED=true` (the last one gates custom metrics — the exporter setting
alone is not enough).

**`verify`** — confirms the collector pods are up, the `Instrumentation` CR exists, and the
agent is actually injected. It also re-patches `spec.resource.resourceAttributes`, which the
chart's installation job silently drops.

Confirm in O11y → **APM**, filtered to environment `demoBanking-rum`. Traces take
1–2 minutes to appear. Generate some traffic first:

```bash
./scripts/load-generator.sh --scenario mixed --duration 120
```

> Changing the environment tag later does **not** re-inject running pods, because the
> annotation is unchanged. Run `kubectl rollout restart deploy -n sea-bank-demo --all`.

---

## 7. Optional — trace-correlated logs

The Node.js agent already emits logs carrying `trace_id`, `span_id`, `service.name`,
and `deployment.environment`. This step points the collector's HEC export at a Splunk
index. Pick a destination with `SPLUNK_LOG_BACKEND` in `.env`.

Background: [About Log Observer Connect](https://docs.splunk.com/observability/en/logs/intro-logconnect.html).

### Option A — Splunk Cloud (`SPLUNK_LOG_BACKEND=cloud`)

Gives you the APM **Related Logs** tab. Fill in `DEMO_SPLUNK_STACK`, `SPLUNK_CLOUD_HEC`,
`SPLUNK_USERNAME`, `SPLUNK_LOC_SERVICE_ACCOUNT`, `SPLUNK_LOC_SERVICE_PASSWORD`, then:

```bash
./scripts/splunk-logs.sh
```

**What the script does on your Splunk Cloud stack**, via the Admin Config Service (ACS):

1. Mints a short-lived ACS token. You are prompted once for the admin password; it is
   never written to disk.
2. Creates the index `sea_bank_demo` (`searchableDays` and `maxDataSizeMB` from `.env`).
3. Creates the role `o11y_loc_role` with capabilities `search` and `edit_tokens_own`,
   restricted to that index via `srchIndexesAllowed`.
4. Creates the service account that O11y authenticates as, holding that role.
5. Points the collector's `splunkPlatform` HEC exporter at the stack and adds a
   `transform/set_log_service` processor — container stdout carries `k8s.container.name`
   but never `service.name`, so without it you cannot filter logs by service.

**What you must do manually** — the script cannot create the connection itself:

1. In O11y, go to **Data Management → Available integrations → Log Observer Connect**
   (or **Settings → Log Observer Connect**).
2. Choose **Splunk Cloud Platform** and click **New Connection**.
3. Supply your stack name, then the service account username and password the script
   created (`SPLUNK_LOC_SERVICE_ACCOUNT` / `SPLUNK_LOC_SERVICE_PASSWORD` from `.env`).
4. Add `sea_bank_demo` to the allowed indexes and save.

Full reference: [Set up Log Observer Connect for Splunk Cloud Platform](https://docs.splunk.com/observability/en/logs/set-up-logconnect.html).

Network note: O11y connects **outbound to your Splunk API**, so the stack's management
endpoint must be reachable from Splunk's cloud. A Splunk behind a firewall that blocks
inbound traffic cannot be federated this way.

Verify end to end:

```bash
# in Splunk
index=sea_bank_demo trace_id=* service.name="auth-service"
```

Then open O11y → APM → any service → **Related Logs**.

### Option B — your own Splunk (`SPLUNK_LOG_BACKEND=custom`)

For a Splunk Enterprise you already run. Supply the HEC endpoint and token:

```bash
export DEMO_SPLUNK_HEC_URL="https://your-splunk:8088/services/collector"
export DEMO_SPLUNK_HEC_TOKEN="<HEC token>"
export DEMO_SPLUNK_HEC_INSECURE="true"   # if the cert is self-signed
```

```bash
./scripts/splunk-logs.sh
```

Here the script only configures the collector's HEC export — it skips all ACS
provisioning, so create the index and HEC token yourself first.

Verify with `index=sea_bank_demo trace_id=*` in your Splunk. Logs are searchable there,
but the O11y Related Logs tab additionally needs a Log Observer Connect connection that
can reach your Splunk — not set up by this demo.

> For a Splunk running in Docker on the same laptop, use
> `https://host.minikube.internal:8088/services/collector` — that is how a pod reaches your host.

> **Run this after step 6.** `splunk-instrumentation.sh` sets Helm values without
> `--reuse-values`, so running it later would drop the log-export leg added here.

---

## 8. Optional — Database Monitoring

```bash
./scripts/splunk-dbmon.sh all
```

Creates a read-only `otel` user on MySQL and adds the DBMon receiver to the collector.
Results land in O11y → **APM → Database Query Performance**.

---

## 9. Run the iOS app

```bash
./scripts/init-ios.sh          # one-time: installs deps, generates app-ios/ios
./scripts/ios-simulator.sh     # boots a simulator and opens the GUI
cd app-ios && npm run ios
```

`ios-simulator.sh` picks `DeviceHub.app` (Xcode 26+) or `Simulator.app` (older), reusing an
already-booted device. Pass a device name or set `IOS_SIM_DEVICE` to choose, or `IOS_SIM_APP`
to point at a GUI app elsewhere.

> On Xcode 26+, `init-ios.sh` also adopts the UIScene life cycle (a `SceneDelegate` plus the
> matching `Info.plist` entry) and raises the pod deployment target. Without those the app
> builds but will not launch. Older Xcode is left untouched.

The simulator reaches the gateway on `http://localhost:8080`, so keep
`port-forward-gateway.sh` running. On a physical device, set `apiBaseUrl` in
`app-ios/src/config.ts` to your Mac's LAN IP.

To enable RUM:

```bash
cp app-ios/.env.example app-ios/.env
# set IOS_SPLUNK_RUM_ACCESS_TOKEN=<your RUM token>
```

The token is read at build time by `react-native-dotenv` and consumed in
[app-ios/src/config.ts](app-ios/src/config.ts). Identity falls back to the defaults when
the corresponding `.env` entry is blank:

```ts
const REALM   = IOS_SPLUNK_REALM      || 'us1';
const RUM_APP = IOS_RUM_APP_NAME      || 'demoBanking-rum-ios';
const RUM_ENV = IOS_RUM_ENVIRONMENT   || 'demoBanking-rum';

rum: {
  provider: 'splunk',                 // 'splunk' | 'appdynamics' | 'none'
  splunk: {
    realm: REALM,
    rumAccessToken: IOS_SPLUNK_RUM_ACCESS_TOKEN || '',
    applicationName: RUM_APP,
    deploymentEnvironment: RUM_ENV,
  },
},
```

The SDK is started once, in [app-ios/src/telemetry/index.ts](app-ios/src/telemetry/index.ts):

```ts
import {
  SplunkRum,
  NavigationModuleConfiguration,
  SessionReplayModuleConfiguration,
} from '@splunk/otel-react-native';
import {SplunkSessionReplay} from '@splunk/otel-session-replay-react-native';

await SplunkRum.install(
  {
    appName: s.applicationName,
    deploymentEnvironment: s.deploymentEnvironment,
    endpoint: {rumAccessToken: s.rumAccessToken, realm: s.realm},
    user: {trackingMode: 'ANONYMOUS_TRACKING'},   // DXA needs a user ID; the RN default is NO_TRACKING
    globalAttributes: {'bank.brand': 'dbs'},
  },
  [
    new NavigationModuleConfiguration(true, false), // manual screen tracking, native auto-tracking off
    new SessionReplayModuleConfiguration(true, 1),   // allow replay for every session
  ],
);
await SplunkSessionReplay.instance.start();         // enabling the module alone does not record
```

On iOS no HTTP module is needed — capture via `URLSession` is on by default. The navigation
module is the one module the RN agent leaves off, and the app's named screens depend on it
(see [Digital Experience Analytics](#digital-experience-analytics-journey-maps)).
SDK reference: [Instrument React Native applications for Splunk RUM](https://docs.splunk.com/observability/en/rum/rum-mobile/rn-rum.html).

After editing `.env`, restart Metro with `npm start -- --reset-cache`. Data appears in
O11y → **RUM**, app `demoBanking-rum-ios`.

---

## 10. Run the Android app

Export the SDK location first — Gradle needs it, and it is not set by default:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Start an emulator, then build:

```bash
emulator -avd "$(emulator -list-avds | head -1)" &
./scripts/init-android.sh      # one-time: installs deps, generates app-android/android
cd app-android && npm run android
```

The emulator reaches your Mac at `http://10.0.2.2:8080`, already configured. Metro is pinned
to port **8082** so it never collides with the iOS app on 8081 — both can run at once.

To enable RUM:

```bash
cp app-android/.env.example app-android/.env
# set ANDROID_SPLUNK_RUM_ACCESS_TOKEN=<your RUM token>
```

Config is the same shape as iOS, with its own app name
([app-android/src/config.ts](app-android/src/config.ts)):

```ts
const REALM   = ANDROID_SPLUNK_REALM    || 'us1';
const RUM_APP = ANDROID_RUM_APP_NAME    || 'demoBanking-rum-android';
const RUM_ENV = ANDROID_RUM_ENVIRONMENT || 'demoBanking-rum';

splunk: {
  realm: REALM,
  rumAccessToken: ANDROID_SPLUNK_RUM_ACCESS_TOKEN || '',
  applicationName: RUM_APP,
  deploymentEnvironment: RUM_ENV,
},
```

Android needs one extra step that iOS does not
([app-android/src/telemetry/index.ts](app-android/src/telemetry/index.ts)):

```ts
import {
  SplunkRum,
  OkHttp3AutoModuleConfiguration,
  HttpURLModuleConfiguration,
  NavigationModuleConfiguration,
} from '@splunk/otel-react-native';

// RN's fetch runs on OkHttp, and the Android SDK does NOT enable HTTP capture by
// default. Without these modules there are no HTTP spans and no APM correlation.
const modules = [
  new OkHttp3AutoModuleConfiguration(true),
  new HttpURLModuleConfiguration(true),
  new NavigationModuleConfiguration(true, false), // same as iOS: named screens for DXA
  new SessionReplayModuleConfiguration(true, 1),   // same as iOS, then SplunkSessionReplay.instance.start()
];

await SplunkRum.install(
  {
    appName: s.applicationName,
    deploymentEnvironment: s.deploymentEnvironment,
    endpoint: {rumAccessToken: s.rumAccessToken, realm: s.realm},
    user: {trackingMode: 'ANONYMOUS_TRACKING'},
    globalAttributes: {'bank.brand': 'dbs'},
  },
  modules,
);
```

OkHttp instrumentation is **build-time byte-buddy weaving**, so `init-android.sh` also
wires the Splunk Gradle plugins. Passing the modules alone is not sufficient.

Data appears in O11y → **RUM**, app `demoBanking-rum-android`.

> JavaScript `console` output goes to React Native DevTools, not the Metro terminal.
> Press `j` in Metro to open it.

---

## 11. Drive the demo

Generate traffic:

```bash
./scripts/load-generator.sh --scenario mixed --duration 300
./scripts/load-generator.sh --scenario transfer --rps 3 --duration 120
```

Inject faults, then watch APM error rates and latency react:

```bash
./scripts/fault-inject.sh latency 1500 all     # add 1.5s to every request
./scripts/fault-inject.sh error 0.3 account    # fail 30% of account-service requests
./scripts/fault-inject.sh status               # show current fault config
./scripts/fault-inject.sh clear                # back to normal
```

### Digital Experience Analytics (journey maps)

DXA is a paid add-on to Splunk RUM. It builds journey maps, funnels and user segments from the
same RUM data the apps already send, so nothing extra is deployed. The apps emit three things
for it:

- **Screens.** Every navigation calls `navigation.track()` with a readable name, which also
  stamps `screen.name` on everything that follows. The names are defined in `SCREEN_NAMES` in
  `src/navigation/NavContext.tsx`; renaming one splits its history in DXA.
  - Tabs: `Home` (the landing screen), `Accounts`, `Wealth`, `Rewards`, `Services`.
  - Opened from a tab: `Transfer`, `Scan & Pay`, `Statements`, `Transaction Limits`, `FX`,
    `Apply`, `Inbox`.
  - Also: `Login`, `Brand Picker`, `Demo Controls`.

  `Dashboard` was renamed: its balance cards are now the `Accounts` tab, and `Home` is the new
  landing screen. Sessions recorded before the change still show `Dashboard`.
- **An anonymous user ID** on every span (`user.trackingMode: ANONYMOUS_TRACKING`). The RN
  agent defaults to `NO_TRACKING`, and DXA has no users to count without it.
- **Milestone custom events**, plus global attributes `bank.brand` and `bank.customer.id`
  (synthetic) for segments:

| Event | Where | Attributes |
|---|---|---|
| `login_submit` | Login | `result` = `success` / `failure` |
| `balance_check` | Home or Accounts, after a balance loads | `bank.account.type`, `bank.entry` = `home` / `accounts` |
| `promo_tap` | Home, a promo card | `bank.promo.id` |
| `qr_scan` | Scan & Pay, simulated scan | `bank.qr.merchant`, `bank.transfer.amount` |
| `transfer_invalid` | Transfer, failed form validation | `bank.transfer.invalid_reason` = `same_account` / `amount` |
| `transfer_submit` | Transfer | `bank.transfer.amount` (also legacy `amount`), `bank.entry` |
| `transfer_complete` | Transfer, gateway accepted it | `bank.transfer.id`, `bank.transfer.status`, `bank.transfer.amount`, `bank.entry` |
| `transfer_failed` | Transfer, gateway rejected it | `bank.transfer.amount`, `bank.http.status`, `bank.entry` |
| `statement_download` | Statements | `bank.statement.month` |
| `limit_update` | Transaction Limits | `bank.limit.daily`, `bank.limit.previous` |
| `fx_exchange` | FX | `bank.fx.pair`, `bank.fx.amount` |
| `application_submit` | Apply | `bank.product`, `bank.entry` = `promo` / `wealth` / `services` / `direct` |
| `reward_redeem` / `reward_redeem_blocked` | Rewards | `bank.reward.id`, `bank.reward.points` |
| `holding_view` | Wealth | `bank.holding.id` |
| `inbox_open` | Inbox | `bank.message.id` |
| `logout` | Home or Services | none |

`bank.entry` on the transfer events records how the user got there: `quick_pay`, `shortcut`,
`scan`, `accounts` or `services`. Use it to compare which entry point converts best. Only
Transfer calls the backend; the other screens are simulated in the app and produce RUM data
only.

To build the journey map:

1. **Digital Experience → Digital experience analytics.** Confirm `demoBanking-rum-ios` or
   `-android` is under *Available applications*, then create a project containing it.
2. **Event Definitions → New event definition**, one per milestone you want as a node. Use the
   *Custom* template with the event name, and add a tag filter where it matters. For example,
   *Login success* is `login_submit` with `result = success`, and *Login failed* is the same with
   `result = failure`.
3. **Analyses → New analysis → Journey map.** Set *Starts from* to the `Login` screen. For steps,
   pick the screens **and** your event definitions, set the length to 5–7, and turn on *Show
   drop-offs*.
4. Select a path, then **Create funnel** to turn it into a conversion funnel such as
   Login → Home → Transfer → `transfer_complete`, or Home → `promo_tap` → Apply →
   `application_submit`.

To make the map worth looking at, drive several different paths: Scan & Pay through to a
payment, a promo through to an application, an abandoned transfer (*Back*), an invalid amount,
and a few tab visits. Inject `./scripts/fault-inject.sh error 0.5 transfer` so
`transfer_failed` gets traffic. Log in as different demo users so the `bank.customer.id`
segments have data. DXA counts users by the anonymous ID, so one simulator mostly shows up as
one user. Use the iOS simulator and the Android emulator together to get two.

`bank.transfer.id` and `bank.transfer.amount` are also the correlation key and KPI for
**Business Insights → Business Journeys**, which is enabled per org through the Splunk account
team.

### Session replay

Both apps record session replays with `@splunk/otel-session-replay-react-native`, pinned to the
same version as the RUM agent. The iOS recorder ships inside the agent pod. Replay needs an
**Enterprise** subscription; without one the app still runs and simply no replays appear.

- **Sample rate** is `IOS_SESSION_REPLAY_SAMPLE_RATE` / `ANDROID_SESSION_REPLAY_SAMPLE_RATE` in
  the app's `.env`. Blank means `1` (every session, the right setting for a demo). The SDK's
  own default is `0.2`. Set `0` to turn replay off.
- **It is a native dependency.** After pulling this change, re-run `./scripts/init-ios.sh`
  (for `pod install`) or rebuild the Android app. Hot reload is not enough.
- **Where to watch:** RUM → **Session search**, open a session and press play. From a DXA journey
  map, select a path; the *Path Detail Analysis* panel lists up to 500 matching sessions and
  opens each one in the replay player.
- **Masking.** All demo data is synthetic, so nothing is masked. For a customer conversation,
  `SplunkSessionReplay.instance.setRecordingMask()` hides screen rectangles (`MaskType.COVERING`)
  and can reveal parts of them again (`MaskType.ERASING`). See
  [Record React Native sessions](https://help.splunk.com/en/splunk-observability-cloud/digital-experience-monitoring/real-user-monitoring/replay-user-sessions/record-react-native-sessions).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Pods stuck `ImagePullBackOff` | You built images on the host daemon. Re-run `eval "$(minikube -p sea-bank-demo docker-env)"` then `./scripts/build-images.sh` |
| No traces in APM | Check `kubectl get pods -n splunk-otel`, then confirm `SPLUNK_REALM` and `SPLUNK_ACCESS_TOKEN` in `.env` |
| `helm upgrade` schema error | Keep the chart pinned at `0.157.0`; 0.158+ removed the `certmanager` key |
| Spans still show the old environment | Changing the tag does not re-inject running pods. `kubectl rollout restart deploy -n sea-bank-demo --all` |
| Logs not filterable by `service.name` | Container stdout only carries `k8s.container.name`. Re-run `./scripts/splunk-logs.sh`, which adds the `transform/set_log_service` processor |
| Android build: `SDK location not found` | `export ANDROID_HOME="$HOME/Library/Android/sdk"` and re-run `./scripts/init-android.sh`, which writes `local.properties` |
| Android app installs then dies immediately | Metro port clash. The Android app must use 8082; check `adb reverse --list` shows `tcp:8082 tcp:8082` |

### RUM shows nothing

Work through these in order.

1. **Confirm the token is set and non-empty.** `.env` lives beside the app, not at the repo root:
   ```bash
   grep RUM_ACCESS_TOKEN app-ios/.env app-android/.env
   ```
2. **Confirm the SDK actually started.** The app logs one line on launch. `console.log` goes to
   React Native DevTools, *not* the Metro terminal — press `j` in Metro to open it. Look for:
   ```
   [telemetry] Splunk RUM initialized (env=demoBanking-rum)
   ```
   If you instead see `rumAccessToken is empty — staying off`, the `.env` was not picked up.
3. **Rebuild, don't just reload.** `react-native-dotenv` inlines the token at *build* time, so a
   hot reload keeps the old value. Restart Metro with a clean cache and rebuild:
   ```bash
   cd app-ios && npm start -- --reset-cache     # then, in another terminal:
   npm run ios                                   # or: npm run android (from app-android)
   ```
4. **Check the realm matches your O11y account.** `realm` in `src/config.ts` defaults to `us1`.
   A wrong realm fails silently — the data goes to an endpoint you cannot see.
5. **Use the app.** RUM reports on app start and interaction. Log in and make a transfer, then
   wait 1–2 minutes for ingest.
6. **Check the right place in O11y.** RUM → set **App** to `demoBanking-rum-ios` or
   `demoBanking-rum-android`, **Source: Mobile**, and widen the time range. Session Search lags
   the metrics, so sessions can be empty while data is already arriving.

---

## Repository layout

```
services/      npm workspace: packages/common + apps/{api-gateway,auth,account,transfer}
k8s/           kustomize base + demo overlay; mysql data tier; dbmon collector overlay
scripts/       build / deploy / smoke-test / load / fault-inject + splunk-*.sh
app-ios/       React Native iOS app
app-android/   React Native Android app
```
