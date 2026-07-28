import Foundation
import AppCore
import SecurityCore
import BridgeProtocol

/// One fact the macOS layer discovered about an installed bundle. This is the
/// only thing the platform layer contributes; everything else about detection —
/// which entry it belongs to, what to show when it is missing, where to send the
/// user to get it — is decided by the portable code below.
public struct InstalledApplicationProbe: Codable, Sendable, Equatable {
    public var bundleIdentifier: String
    public var bundlePath: String
    public var version: String?
    public var displayName: String?

    public init(bundleIdentifier: String, bundlePath: String, version: String? = nil, displayName: String? = nil) {
        self.bundleIdentifier = bundleIdentifier; self.bundlePath = bundlePath
        self.version = version; self.displayName = displayName
    }
}

/// Merges catalogue entries with probes from the macOS layer.
public struct ApplicationDetector: Sendable {
    public let catalogue: ApplicationCatalogue
    public init(catalogue: ApplicationCatalogue) { self.catalogue = catalogue }

    /// - Parameters:
    ///   - probes: what the macOS layer found, in any order. Extra probes that
    ///     match no catalogue entry are ignored rather than reported, so the
    ///     Bridge never enumerates the user's whole application folder back to
    ///     the web layer.
    ///   - requested: catalogue identifiers to report on; empty means every entry.
    public func report(probes: [InstalledApplicationProbe], requested: [String] = []) throws -> [DetectedApplication] {
        let wanted: [ApplicationDescriptor]
        if requested.isEmpty {
            wanted = catalogue.entries
        } else {
            wanted = try requested.map { try catalogue.require($0) }
        }

        // Index probes by every identifier form so an app registered under an
        // alternate bundle id is still recognised.
        var byKey: [String: InstalledApplicationProbe] = [:]
        for probe in probes {
            let key = ApplicationDescriptor.normalise(probe.bundleIdentifier)
            if !key.isEmpty, byKey[key] == nil { byKey[key] = probe }
        }

        return wanted.map { entry in
            let candidates = ([entry.bundleIdentifier].compactMap { $0 } + entry.alternateBundleIdentifiers)
                .map(ApplicationDescriptor.normalise)
            let probe = candidates.lazy.compactMap { byKey[$0] }.first
            return Self.detected(entry: entry, probe: probe)
        }
    }

    /// The "not installed → official install URL" fallback, in one place.
    static func detected(entry: ApplicationDescriptor, probe: InstalledApplicationProbe?) -> DetectedApplication {
        guard let probe else {
            return DetectedApplication(
                id: entry.id, displayName: entry.displayName, isInstalled: false,
                bundleIdentifier: entry.bundleIdentifier, bundlePath: nil, version: nil,
                installURL: entry.installURL, nextStep: entry.notInstalledNextStep)
        }
        return DetectedApplication(
            id: entry.id, displayName: entry.displayName, isInstalled: true,
            bundleIdentifier: probe.bundleIdentifier, bundlePath: probe.bundlePath,
            version: probe.version, installURL: nil,
            nextStep: entry.alwaysConfirm
                ? "\(entry.displayName) is installed. Nexus OS always asks before opening it."
                : "\(entry.displayName) is ready to use.")
    }

    /// Used when a launch is requested for something that turns out to be
    /// missing: the answer is an install link, never a dead end.
    public func missingApplicationError(_ entry: ApplicationDescriptor) -> NexusError {
        NexusError(domain: .notFound, code: "applicationNotInstalled",
                   message: "\(entry.displayName) is not installed on this Mac.",
                   recovery: "Choose Install to open \(entry.installURL), then try again once it has finished.",
                   context: ["installURL": entry.installURL, "applicationID": entry.id])
    }
}
