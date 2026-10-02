// SEA Bank demo runtime configuration.
//
// Edit these values for your demo. RUM is OFF by default (provider: 'none') so the
// app runs with zero observability wiring. To light up RUM, set `provider` to
// 'splunk' or 'appdynamics' and fill in the token/appKey below.
//
// SECURITY: secrets come from app/.env (gitignored), read at build time via
// react-native-dotenv — they are NOT committed in this file.
import {
  IOS_SPLUNK_RUM_ACCESS_TOKEN,
  IOS_APPDYNAMICS_APP_KEY,
  IOS_SPLUNK_REALM,
  IOS_RUM_APP_NAME,
  IOS_RUM_ENVIRONMENT,
} from '@env';

// Identity shown in O11y. Override in app-ios/.env to avoid clashing on a shared instance.
const REALM = IOS_SPLUNK_REALM || 'us1';
const RUM_APP = IOS_RUM_APP_NAME || 'demoBanking-rum-ios';
const RUM_ENV = IOS_RUM_ENVIRONMENT || 'demoBanking-rum';

export type RumProvider = 'none' | 'splunk' | 'appdynamics';

export interface AppConfig {
  /** Base URL of the api-gateway. iOS simulator can reach the host via localhost. */
  apiBaseUrl: string;
  /** Brand shown on first launch (see brands/brands.ts for ids). */
  defaultBrandId: string;
  /** Environment tag echoed into telemetry attributes. */
  environment: string;
  rum: {
    provider: RumProvider;
    splunk: {
      realm: string;
      rumAccessToken: string;
      applicationName: string;
      deploymentEnvironment: string;
    };
    appdynamics: {
      appKey: string;
    };
  };
}

export const config: AppConfig = {
  // On a physical device replace 'localhost' with your machine's LAN IP.
  apiBaseUrl: 'http://localhost:8080',
  defaultBrandId: 'dbs',
  environment: RUM_ENV,
  rum: {
    provider: 'splunk', // 'splunk' | 'appdynamics' | 'none'
    splunk: {
      realm: REALM,
      rumAccessToken: IOS_SPLUNK_RUM_ACCESS_TOKEN || '', // from app-ios/.env (gitignored)
      applicationName: RUM_APP,
      deploymentEnvironment: RUM_ENV,
    },
    appdynamics: {
      appKey: IOS_APPDYNAMICS_APP_KEY || '', // from app/.env (gitignored)
    },
  },
};
