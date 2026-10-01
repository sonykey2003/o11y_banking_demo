// Convenience accessor for the native SplunkErrors module.
// telemetry/index.ts reads NativeModules.SplunkErrors directly; this export exists
// so the local package has a valid JS entry point for autolinking.
import {NativeModules} from 'react-native';

export default NativeModules.SplunkErrors;
