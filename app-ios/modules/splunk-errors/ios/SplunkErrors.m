#import <React/RCTBridgeModule.h>

// Exposes the Swift SplunkErrors class to the React Native bridge.
@interface RCT_EXTERN_MODULE(SplunkErrors, NSObject)

RCT_EXTERN_METHOD(reportError:(NSString *)message
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
