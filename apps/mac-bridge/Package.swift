// swift-tools-version: 5.10
import PackageDescription

// NexusKernel: the portable, platform-agnostic half of Nexus OS.
//
// Every target listed unconditionally here builds and is unit-tested on Linux as
// well as macOS, which keeps the security, configuration, workflow and
// integration logic verifiable independently of the AppKit/SwiftUI layer.
// Targets are added to this manifest only once they contain real, compiling code.
//
// `BridgeService` is the exception: it is the macOS-only half of the Bridge
// (NSWorkspace, the Accessibility API, UserNotifications, Keychain, SMAppService,
// local MCP processes). It is appended to the manifest **only when the manifest
// itself is compiled on macOS**, so `swift build` and `swift test` on Linux never
// see it and can never be broken by it. Its sources are additionally wrapped in
// `#if os(macOS)` so that even a manifest edit cannot break the Linux build.
let package = Package(
    name: "NexusKernel",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "NexusKernel", targets: ["AppCore", "SecurityCore"]),
        .library(name: "NexusBridgeKit",
                 targets: ["BridgeProtocol", "BridgeSecurity", "ApplicationCatalogue", "ActionValidator"]),
    ],
    targets: [
        .target(name: "AppCore"),
        .target(name: "SecurityCore", dependencies: ["AppCore"]),

        // The wire contract: the closed action set, its parameter types and the
        // response shapes. No I/O, no platform APIs.
        .target(name: "BridgeProtocol", dependencies: ["AppCore", "SecurityCore"]),

        // Transport security: pairing, per-device request signing, replay
        // defence, freshness, loopback origin enforcement, emergency switch.
        .target(name: "BridgeSecurity", dependencies: ["AppCore", "SecurityCore", "BridgeProtocol"]),

        // Portable model of the applications Nexus OS can talk about, plus the
        // matching rules and the "not installed -> official install URL" answer.
        .target(name: "ApplicationCatalogue", dependencies: ["AppCore", "SecurityCore", "BridgeProtocol"]),

        // The single decision point: schema, PathGuard, URLValidator,
        // PermissionEngine and the audit record for every outcome.
        .target(name: "ActionValidator",
                dependencies: ["AppCore", "SecurityCore", "BridgeProtocol", "BridgeSecurity", "ApplicationCatalogue"]),

        .testTarget(name: "AppCoreTests", dependencies: ["AppCore"]),
        .testTarget(name: "SecurityCoreTests", dependencies: ["SecurityCore"]),
        .testTarget(name: "BridgeProtocolTests", dependencies: ["BridgeProtocol"]),
        .testTarget(name: "BridgeSecurityTests", dependencies: ["BridgeSecurity"]),
        .testTarget(name: "ApplicationCatalogueTests", dependencies: ["ApplicationCatalogue"]),
        .testTarget(name: "ActionValidatorTests", dependencies: ["ActionValidator"]),
    ]
)

#if os(macOS)
package.targets.append(
    .target(name: "BridgeService",
            dependencies: ["AppCore", "SecurityCore", "BridgeProtocol", "BridgeSecurity",
                           "ApplicationCatalogue", "ActionValidator"])
)
package.products.append(.library(name: "NexusBridgeService", targets: ["BridgeService"]))
#endif
