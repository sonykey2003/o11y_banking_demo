//
// Native bridge for Splunk RUM handled-error reporting (feeds rum.app_error.count).
//
// The @splunk/otel-react-native (1.x) JS agent exposes no handled-error API, so
// rum.app_error.count can't be fed from JS. But that agent embeds the native Splunk
// RUM iOS SDK (SplunkAgent) and initializes the shared SplunkRum instance — whose
// customTracking.trackError(_:) produces the native `error` span (component=error,
// error=true) that increments rum.app_error.count. Call only after SplunkRum.install
// has resolved on the JS side.
//
import Foundation
import React
import SplunkAgent

@objc(SplunkErrors)
class SplunkErrors: NSObject {

  @objc(reportError:resolver:rejecter:)
  func reportError(_ message: NSString,
                   resolver resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    _ = SplunkRum.shared.customTracking.trackError(message as String)
    resolve(true)
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
