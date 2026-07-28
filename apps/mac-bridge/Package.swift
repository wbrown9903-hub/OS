// swift-tools-version: 5.10
import PackageDescription

// NexusKernel: the portable, platform-agnostic half of Nexus OS.
//
// Every target here builds and is unit-tested on Linux as well as macOS, which
// keeps the security, configuration, workflow and integration logic verifiable
// independently of the AppKit/SwiftUI layer that lives in NexusPlatform.
// Targets are added to this manifest only once they contain real, compiling code.
let package = Package(
    name: "NexusKernel",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "NexusKernel", targets: ["AppCore", "SecurityCore"]),
    ],
    targets: [
        .target(name: "AppCore"),
        .target(name: "SecurityCore", dependencies: ["AppCore"]),

        .testTarget(name: "AppCoreTests", dependencies: ["AppCore"]),
        .testTarget(name: "SecurityCoreTests", dependencies: ["SecurityCore"]),
    ]
)
