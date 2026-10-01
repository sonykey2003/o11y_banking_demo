/**
 * SEA Bank demo entrypoint.
 * RUM is initialized as early as possible (before the app renders) and is a no-op
 * unless a provider is configured in src/config.ts. This keeps instrumentation
 * "detached" — the app runs fine with RUM off.
 */
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {telemetry} from './src/telemetry';

telemetry.init();

AppRegistry.registerComponent(appName, () => App);
