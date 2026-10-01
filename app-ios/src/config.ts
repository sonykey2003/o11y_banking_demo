// SEA Bank demo runtime configuration.
//
// Edit these values for your demo. RUM is OFF by default (provider: 'none') so the
// app runs with zero observability wiring. To light up RUM, set `provider` to
// 'splunk' or 'appdynamics' and fill in the token/appKey below.
//
// SECURITY: secrets come from app/.env (gitignored), read at build time via
// react-native-dotenv — they are NOT committed in this file.
import {IOS_SPLUNK_RUM_ACCESS_TOKEN, IOS_APPDYNAMICS_APP_KEY} from '@env';

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
  environment: 'demoBanking-rum',
  rum: {
    provider: 'splunk', // 'splunk' | 'appdynamics' | 'none'
    splunk: {
      realm: 'us1',
      rumAccessToken: IOS_SPLUNK_RUM_ACCESS_TOKEN || '', // from app/.env (gitignored)
      applicationName: 'demoBanking-rum-ios',
      deploymentEnvironment: 'demoBanking-rum',
    },
    appdynamics: {
      appKey: IOS_APPDYNAMICS_APP_KEY || '', // from app/.env (gitignored)
    },
  },
};
