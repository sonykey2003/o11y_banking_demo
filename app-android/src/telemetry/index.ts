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
import {NativeModules} from 'react-native';
import {config} from '../config';

let started = false;
let currentScreen = 'Login';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const splunk = () => require('@splunk/otel-react-native');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appd = () => require('@appdynamics/react-native-agent');

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
        const {SplunkRum, OkHttp3AutoModuleConfiguration, HttpURLModuleConfiguration} = splunk();
        // Android needs the OkHttp module enabled explicitly: RN's fetch runs on OkHttp
        // and the SDK does NOT turn on HTTP capture by default on Android (iOS uses
        // URLSession by default). Without this, Android RUM shows no HTTP spans / no APM
        // correlation. Unlisted modules keep their native defaults (UI/nav/crash/etc).
        const modules: unknown[] = [];
        try {
          if (OkHttp3AutoModuleConfiguration) modules.push(new OkHttp3AutoModuleConfiguration(true));
          if (HttpURLModuleConfiguration) modules.push(new HttpURLModuleConfiguration(true));
        } catch (e) {
          console.warn('[telemetry] could not build network modules:', (e as Error).message);
        }
        await SplunkRum.install(
          {
            appName: s.applicationName,
            deploymentEnvironment: s.deploymentEnvironment,
            endpoint: {rumAccessToken: s.rumAccessToken, realm: s.realm},
          },
          modules as never,
        );
        started = true;
        console.log(`[telemetry] Splunk RUM initialized (env=${s.deploymentEnvironment}, modules=${modules.length})`);
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

  /** Report a screen/route change. Splunk gets an explicit navigation event. */
  trackScreen(name: string, attrs: Record<string, unknown> = {}): void {
    currentScreen = name;
    if (!started) return;
    try {
      if (config.rum.provider === 'splunk') {
        splunk().SplunkRum?.instance?.navigation?.track?.(name, attrs);
      }
    } catch {
      /* ignore */
    }
  },

  /** Emit a custom event/workflow marker (e.g. login_submit, transfer_submit). */
  trackEvent(name: string, attrs: Record<string, unknown> = {}): void {
    if (!started) return;
    try {
      if (config.rum.provider === 'splunk') {
        splunk().SplunkRum?.instance?.customTracking?.trackCustomEvent?.(name, {screen: currentScreen, ...attrs});
      } else if (config.rum.provider === 'appdynamics') {
        appd().Instrumentation?.leaveBreadcrumb?.(`${name} ${JSON.stringify(attrs)}`);
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
