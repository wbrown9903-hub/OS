// swift-tools-version: 5.10
import PackageDescription

// Nexus Desktop — the SwiftUI + WKWebView shell that hosts Nexus Cloud.
//
// The package is deliberately split in two:
//
//   NexusDesktopCore  Pure Foundation logic with no AppKit, SwiftUI or WebKit.
//                     Navigation policy, the JS bridge contract, the connection
//                     diagnosis table, the uninstall planner and the permission
//                     onboarding state machine all live here, so the decisions
//                     that matter for security are unit-tested on Linux as well
//                     as macOS.
//
//   NexusDesktop      The executable. Everything that touches AppKit, SwiftUI,
//                     WebKit, UserNotifications, ServiceManagement or Carbon.
//                     Its sources are wrapped in `#if os(macOS)`, and the entry
//                     point falls back to a message on other platforms, so this
//                     package still resolves and builds in the Linux container
//                     even though none of the real UI is compiled there.
//
// Nothing in this package re-implements the action set, the validation rules or
// the permission engine. It depends on the Nexus Mac Bridge package and uses
// BridgeProtocol, SecurityCore and ActionValidator directly.
let package = Package(
    name: "NexusDesktop",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "NexusDesktop", targets: ["NexusDesktop"]),
        .library(name: "NexusDesktopCore", targets: ["NexusDesktopCore"]),
    ],
    dependencies: [
        .package(path: "../mac-bridge"),
    ],
    targets: [
        .target(
            name: "NexusDesktopCore",
            dependencies: [
                .product(name: "NexusKernel", package: "mac-bridge"),
                .product(name: "NexusBridgeKit", package: "mac-bridge"),
            ]),

        .executableTarget(
            name: "NexusDesktop",
            dependencies: [
                "NexusDesktopCore",
                .product(name: "NexusKernel", package: "mac-bridge"),
                .product(name: "NexusBridgeKit", package: "mac-bridge"),
            ]),

        .testTarget(name: "NexusDesktopCoreTests", dependencies: ["NexusDesktopCore"]),
    ]
)
