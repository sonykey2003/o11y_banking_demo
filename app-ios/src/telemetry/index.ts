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
        const {SplunkRum} = splunk();
        await SplunkRum.install({
          appName: s.applicationName,
          deploymentEnvironment: s.deploymentEnvironment,
          endpoint: {rumAccessToken: s.rumAccessToken, realm: s.realm},
        });
        started = true;
        console.log(`[telemetry] Splunk RUM initialized (env=${s.deploymentEnvironment})`);
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
   * the native SDK's `SplunkRum.shared.customTracking.trackError(...)` (the JS agent
   * already initialized that native SDK in-process). If the native module isn't present
   * we fall back to an `app.error` custom event (only `rum.custom_event.count`). HTTP
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
        // Prefer the native bridge: native SplunkRum.customTracking.trackError(...)
        // produces a native `error` span and increments rum.app_error.count.
        const nativeErrors = (NativeModules as {SplunkErrors?: {reportError?: (m: string) => Promise<boolean>}}).SplunkErrors;
        if (nativeErrors?.reportError) {
          nativeErrors.reportError(e.message).catch(() => {
            /* ignore */
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
