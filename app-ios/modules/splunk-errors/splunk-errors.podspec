require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "splunk-errors"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://example.com/sea-bank-demo"
  s.license      = "Apache-2.0"
  s.authors      = "SEA Bank Demo"
  s.platforms    = { :ios => "15.0" }
  s.source       = { :git => "" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.swift_version = "5.0"
  s.pod_target_xcconfig = { "DEFINES_MODULE" => "YES" }

  # React bridge + the Splunk RUM native SDK (SplunkAgent is vendored by the RN agent pod,
  # which also initializes the SplunkRum singleton we call into).
  s.dependency "React-Core"
  s.dependency "SplunkOtelReactNative"
end
