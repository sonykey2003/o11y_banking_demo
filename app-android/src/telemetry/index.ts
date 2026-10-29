// Gated RUM facade for the SEA Bank demo.
//
// Supports BOTH Splunk RUM (@splunk/otel-react-native) and AppDynamics
// (@appdynamics/react-native-agent), chosen at runtime from src/config.ts. When
// provider === 'none' (default) every method is a safe no-op, so the app runs with
// no observability wiring at all. This keeps mobile instrumentation "detached":
// opt-in via config + native SDK, never required for the app to work.
//
// The SDKs are required lazily and wrapped in try/catch so API drift or a missing
// native module degrades gracefully instead of crashing the demo.
//
// Digital Experience Analytics (DXA) journey maps are built from three things this
// facade emits: screen views (navigation.track -> `screen.name`), custom events
// (journey milestones, see trackEvent call sites) and an anonymous user ID per span.
import {NativeModules} from 'react-native';
import {config} from '../config';

let started = false;
// Screen the user is on now, and the last one actually reported to RUM. They differ
// while the SDK is still installing: the first screen renders before install() resolves.
let currentScreen = 'Login';
let reportedScreen: string | null = null;
// Global attributes on every span. Kept here so values set before install() still apply.
const globals: Record<string, string> = {'bank.brand': config.defaultBrandId};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const splunk = () => require('@splunk/otel-react-native');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const replay = () => require('@splunk/otel-session-replay-react-native');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appd = () => require('@appdynamics/react-native-agent');

/** The Splunk JS API returns promises; swallow rejections so telemetry never surfaces as an app error. */
const quiet = (p: unknown) => {
  Promise.resolve(p).catch(() => {
    /* ignore */
  });
};

function reportScreen(): void {
  if (!started || currentScreen === reportedScreen) return;
  reportedScreen = currentScreen;
  try {
    if (config.rum.provider === 'splunk') {
      quiet(splunk().SplunkRum?.instance?.navigation?.track?.(currentScreen));
    }
  } catch {
    /* ignore */
  }
}

/** Start session replay recording. A no-op natively for sessions outside the sample rate. */
function startReplay(): void {
  try {
    quiet(replay().SplunkSessionReplay?.instance?.start?.());
  } catch (e) {
    console.warn('[telemetry] session replay unavailable:', (e as Error).message);
  }
}

export const telemetry = {
  async init(): Promise<void> {
    if (started) return;
    const provider = config.rum.provider;
    try {
      if (provider === 'splunk') {
        const s = config.rum.splunk;
        if (!s.rumAccessToken) {
          console.warn('[telemetry] Splunk RUM selected but rumAccessToken is empty — staying off.');
          return;
        }
        const {
          SplunkRum,
          OkHttp3AutoModuleConfiguration,
          HttpURLModuleConfiguration,
          NavigationModuleConfiguration,
          SessionReplayModuleConfiguration,
        } = splunk();
        // Android needs the OkHttp module enabled explicitly: RN's fetch runs on OkHttp
        // and the SDK does NOT turn on HTTP capture by default on Android (iOS uses
        // URLSession by default). Without this, Android RUM shows no HTTP spans / no APM
        // correlation. Unlisted modules keep their native defaults (UI/crash/etc).
        //
        // Navigation is the one module the RN agent does not turn on by default. Enable it
        // for our manual navigation.track() calls, but keep native auto-tracking OFF: it
        // would report the RN host Activity instead of our screen names.
        //
        // Session replay: the module only *allows* recording at the given sample rate;
        // recording itself starts with SplunkSessionReplay.start() below.
        const replayRate = s.sessionReplaySampleRate;
        const modules: unknown[] = [];
        try {
          if (OkHttp3AutoModuleConfiguration) modules.push(new OkHttp3AutoModuleConfiguration(true));
          if (HttpURLModuleConfiguration) modules.push(new HttpURLModuleConfiguration(true));
          if (NavigationModuleConfiguration) modules.push(new NavigationModuleConfiguration(true, false));
          if (SessionReplayModuleConfiguration) {
            modules.push(new SessionReplayModuleConfiguration(replayRate > 0, replayRate));
          }
        } catch (e) {
          console.warn('[telemetry] could not build RUM modules:', (e as Error).message);
        }
        await SplunkRum.install(
          {
            appName: s.applicationName,
            deploymentEnvironment: s.deploymentEnvironment,
            endpoint: {rumAccessToken: s.rumAccessToken, realm: s.realm},
            // DXA counts users and builds segments from this anonymous ID. The RN agent
            // defaults to NO_TRACKING, which leaves DXA with no users to analyse.
            user: {trackingMode: 'ANONYMOUS_TRACKING'},
            globalAttributes: {...globals},
          },
          modules as never,
        );
        started = true;
        console.log(
          `[telemetry] Splunk RUM initialized (env=${s.deploymentEnvironment}, modules=${modules.length}, user tracking=anonymous, replay rate=${replayRate})`,
        );
        reportScreen();
        if (replayRate > 0) startReplay();
      } else if (provider === 'appdynamics') {
        const a = config.rum.appdynamics;
        if (!a.appKey) {
          console.warn('[telemetry] AppDynamics RUM selected but appKey is empty — staying off.');
          return;
        }
        const {Instrumentation} = appd();
        Instrumentation.start({appKey: a.appKey});
        // Tag the environment so this demo groups under `demoBanking-rum` in the controller.
        try {
          Instrumentation.setUserData?.('deployment.environment', config.environment);
        } catch {
          /* older agents may not expose setUserData */
        }
        started = true;
        console.log('[telemetry] AppDynamics RUM initialized');
      } else {
        console.log('[telemetry] RUM disabled (provider=none)');
      }
    } catch (e) {
      console.warn('[telemetry] RUM init failed (SDK missing or misconfigured):', (e as Error).message);
    }
  },

  /**
   * Report a screen change. Splunk records a navigation event and stamps `screen.name`
   * on all later telemetry; these are the screen nodes of the DXA journey map. Repeats
   * of the current screen are dropped so the map has no self-loops.
   */
  trackScreen(name: string): void {
    currentScreen = name;
    reportScreen();
  },

  /**
   * Emit a custom event. In DXA these become journey-map nodes once you create an event
   * definition for them. Use `bank.*` attribute names so they never collide with RUM's own.
   */
  trackEvent(name: string, attrs: Record<string, string | number | boolean> = {}): void {
    if (!started) return;
    try {
      if (config.rum.provider === 'splunk') {
        quiet(splunk().SplunkRum?.instance?.customTracking?.trackCustomEvent?.(name, {screen: currentScreen, ...attrs}));
      } else if (config.rum.provider === 'appdynamics') {
        appd().Instrumentation?.leaveBreadcrumb?.(`${name} ${JSON.stringify(attrs)}`);
      }
    } catch {
      /* ignore */
    }
  },

  /**
   * Start a fresh anonymous RUM user. The SDK keeps one anonymous ID per device, so every
   * persona logged in on one simulator would otherwise count as the same DXA user.
   * Switching tracking off deletes the stored ID; switching it back on generates a new one.
   */
  async newAnonymousUser(): Promise<void> {
    if (!started || config.rum.provider !== 'splunk') return;
    try {
      const prefs = splunk().SplunkRum?.instance?.user?.preferences;
      await prefs?.setTrackingMode?.('NO_TRACKING');
      await prefs?.setTrackingMode?.('ANONYMOUS_TRACKING');
    } catch {
      /* ignore */
    }
  },

  /** Set (or with null, remove) a global attribute, e.g. for DXA user segments by brand or customer. */
  setAttribute(key: string, value: string | null): void {
    if (value === null) delete globals[key];
    else globals[key] = value;
    if (!started) return;
    try {
      if (config.rum.provider === 'splunk') {
        const attrs = splunk().SplunkRum?.instance?.globalAttributes;
        quiet(value === null ? attrs?.remove?.(key) : attrs?.setString?.(key, value));
      }
    } catch {
      /* ignore */
    }
  },

  /**
   * Report an application error to RUM.
   *
   * @splunk/otel-react-native 1.1.0 exposes NO handled-error API in JS. To still feed
   * `rum.app_error.count`, we call our own `SplunkErrors` native module, which invokes
   * the native SDK's `CustomTracking.trackException(...)` (the JS agent already
   * initialized that native SDK in-process). If the native module isn't present we
   * fall back to an `app.error` custom event (only `rum.custom_event.count`). HTTP
   * failures (e.g. a 500) are separate: `rum.resource_request.count` + `error.type`,
   * APM-correlated. AppDynamics exposes its own reportError.
   */
  reportError(err: unknown): void {
    const e = err instanceof Error ? err : new Error(String(err));
    if (!started) {
      console.warn('[telemetry] error (RUM off):', e.message);
      return;
    }
    try {
      if (config.rum.provider === 'splunk') {
        // Prefer the native bridge: it calls the native Splunk RUM SDK's
        // customTracking.trackException(...), which produces a native `error` span and
        // increments rum.app_error.count. The JS agent (1.x) exposes no handled-error
        // API, so without this we can only emit a custom event.
        const nativeErrors = (NativeModules as {SplunkErrors?: {reportError?: (m: string) => Promise<boolean>}}).SplunkErrors;
        if (nativeErrors?.reportError) {
          nativeErrors.reportError(e.message).catch(() => {
            /* fall through to custom event below is not possible post-hoc; ignore */
          });
        } else {
          splunk().SplunkRum?.instance?.customTracking?.trackCustomEvent?.('app.error', {
            'error.message': e.message,
            'error.type': e.name,
            screen: currentScreen,
          });
        }
      } else if (config.rum.provider === 'appdynamics') {
        appd().Instrumentation?.reportError?.(e, 2);
      }
    } catch {
      /* ignore */
    }
  },
};
