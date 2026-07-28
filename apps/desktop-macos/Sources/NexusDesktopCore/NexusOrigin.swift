import Foundation
import AppCore
import SecurityCore

/// The one place Nexus Desktop is allowed to render.
///
/// Everything in the shell — the initial load, the navigation policy, the script
/// message handler's frame check and the "is this an external link" test — asks
/// this type. Because it is a value, not a string comparison scattered through
/// the code, there is exactly one definition of "the Nexus origin" and it can be
/// unit-tested without a web view.
///
/// A user may point the shell at a self-hosted or a hosted Nexus Cloud, so the
/// origin is configurable. It is not, however, unconstrained:
///
/// - `http` is accepted **only** for loopback (`127.0.0.1`, `::1`, `localhost`),
///   which is how the bundled local mode runs. Any other host must be `https`.
/// - Credentials in the address are refused outright; the shell never injects
///   and never carries a username or password.
/// - A path, query or fragment is stripped: an origin is a scheme, a host and a
///   port, and nothing else.
public struct NexusOrigin: Sendable, Equatable, Hashable, Codable {
    public let scheme: String
    public let host: String
    public let port: Int

    /// The address the bundled local mode serves on. `START_NEXUS.command` starts
    /// Nexus Cloud here, so a first run with no configuration finds it.
    public static let localDefault = NexusOrigin(scheme: "http", host: "127.0.0.1", port: 4311)

    public init(scheme: String, host: String, port: Int) {
        self.scheme = scheme.lowercased()
        self.host = host.lowercased()
        self.port = port
    }

    /// Hosts for which unencrypted `http` is acceptable, because the traffic never
    /// leaves the machine.
    public static let loopbackHosts: Set<String> = ["127.0.0.1", "::1", "[::1]", "localhost"]

    public static func isLoopback(host: String) -> Bool {
        loopbackHosts.contains(host.lowercased())
    }

    public static func defaultPort(for scheme: String) -> Int {
        scheme.lowercased() == "https" ? 443 : 80
    }

    /// `http://127.0.0.1:4311` — the canonical spelling, with the default port
    /// omitted so that `https://nexus.example.com` and
    /// `https://nexus.example.com:443` are the same origin.
    public var urlString: String {
        port == Self.defaultPort(for: scheme) ? "\(scheme)://\(bracketedHost)"
                                              : "\(scheme)://\(bracketedHost):\(port)"
    }

    /// IPv6 literals need brackets inside a URL.
    private var bracketedHost: String {
        (host.contains(":") && !host.hasPrefix("[")) ? "[\(host)]" : host
    }

    public var url: URL {
        // `urlString` is assembled from validated components, so this cannot be
        // nil in practice; the fallback keeps the type non-optional for callers.
        URL(string: urlString) ?? URL(string: "http://127.0.0.1:4311")!
    }

    /// What the user sees in Settings and on the connection screens.
    public var displayName: String {
        Self.isLoopback(host: host) ? "this Mac (\(urlString))" : host
    }

    public var isLoopback: Bool { Self.isLoopback(host: host) }

    // MARK: - Parsing what a person typed

    /// Turns free text into an origin, or explains what is wrong and what to do.
    ///
    /// Accepts `nexus.example.com`, `https://nexus.example.com/`,
    /// `127.0.0.1:4311` and `http://localhost:4311/dashboard` — the path is
    /// discarded. Refuses anything that would weaken the shell's guarantees.
    public static func parse(_ raw: String) throws -> NexusOrigin {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw NexusError.validation(
                "emptyAddress",
                "No Nexus address was entered.",
                recovery: "Type the address of your Nexus, for example http://127.0.0.1:4311 for the copy running on this Mac.")
        }
        guard trimmed.count <= 2048 else {
            throw NexusError.validation(
                "addressTooLong",
                "That address is far longer than a real web address.",
                recovery: "Paste just the address, for example https://nexus.example.com")
        }
        guard !trimmed.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7F }) else {
            throw NexusError.security(
                "addressControlCharacters",
                "That address contains hidden characters, so it was not used.",
                recovery: "Type the address by hand instead of pasting it.")
        }

        // A bare host or host:port is the most common thing a person types.
        let withScheme = trimmed.contains("://") ? trimmed : "https://" + trimmed
        guard var components = URLComponents(string: withScheme) else {
            throw NexusError.validation(
                "malformedAddress",
                "“\(trimmed)” is not a web address Nexus OS can use.",
                recovery: "A full address looks like https://nexus.example.com or http://127.0.0.1:4311")
        }
        components.path = ""
        components.query = nil
        components.fragment = nil

        guard let rawScheme = components.scheme?.lowercased(), !rawScheme.isEmpty else {
            throw NexusError.validation(
                "missingScheme",
                "That address does not say whether to use https.",
                recovery: "Start the address with https:// — or http:// if your Nexus runs on this Mac.")
        }
        guard rawScheme == "http" || rawScheme == "https" else {
            throw NexusError.security(
                "schemeNotAllowed",
                "Nexus Desktop can only open http and https addresses, not \(rawScheme):.",
                recovery: "Use the https:// address of your Nexus.")
        }
        guard components.user == nil, components.password == nil else {
            throw NexusError.security(
                "credentialsInAddress",
                "That address has a username or password built into it.",
                recovery: "Remove everything before the “@” and sign in on the Nexus page instead. Nexus Desktop never stores a password in an address.")
        }
        guard var rawHost = components.host?.lowercased(), !rawHost.isEmpty else {
            throw NexusError.validation(
                "missingHost",
                "That address does not include a site name.",
                recovery: "Include the site, for example https://nexus.example.com")
        }
        // URLComponents keeps IPv6 brackets in `host` on some platforms and drops
        // them on others; normalise so both spell the same origin.
        if rawHost.hasPrefix("["), rawHost.hasSuffix("]") {
            rawHost = String(rawHost.dropFirst().dropLast())
        }
        guard !URLValidator.containsMixedScripts(rawHost) else {
            throw NexusError.security(
                "homographHost",
                "That site name mixes alphabets, which is how fake addresses are usually disguised.",
                recovery: "Type the address by hand so you are certain you are reaching the real site.")
        }

        let loopback = isLoopback(host: rawHost)
        if rawScheme == "http" && !loopback {
            throw NexusError.security(
                "insecureOrigin",
                "\(rawHost) was given as an unencrypted http address, and Nexus Desktop will not send your work over an unencrypted connection.",
                recovery: "Use https://\(rawHost) instead. Only a Nexus running on this Mac (127.0.0.1 or localhost) may use http.")
        }
        // A non-loopback host must actually look like a hostname. This rejects a
        // private LAN address masquerading as the cloud.
        if !loopback && URLValidator.isLocalOrPrivate(host: rawHost) {
            throw NexusError.security(
                "privateAddress",
                "\(rawHost) is an address on your local network rather than your Nexus.",
                recovery: "Use the address your Nexus is published on, or http://127.0.0.1:4311 for the copy running on this Mac.")
        }

        let resolvedPort = components.port ?? defaultPort(for: rawScheme)
        guard (1...65535).contains(resolvedPort) else {
            throw NexusError.validation(
                "badPort",
                "\(resolvedPort) is not a usable port number.",
                recovery: "Leave the port out to use the standard one, or use the port your Nexus prints when it starts (4311 by default).")
        }
        return NexusOrigin(scheme: rawScheme, host: rawHost, port: resolvedPort)
    }

    // MARK: - Matching

    /// True when `url` belongs to this origin. Scheme, host and effective port
    /// must all agree; there is no prefix or suffix matching, so
    /// `https://nexus.example.com.attacker.test` is a different origin.
    public func matches(_ url: URL) -> Bool {
        guard let urlScheme = url.scheme?.lowercased(), urlScheme == scheme else { return false }
        guard var urlHost = url.host?.lowercased(), !urlHost.isEmpty else { return false }
        if urlHost.hasPrefix("["), urlHost.hasSuffix("]") { urlHost = String(urlHost.dropFirst().dropLast()) }
        guard urlHost == host else { return false }
        return (url.port ?? Self.defaultPort(for: urlScheme)) == port
    }

    /// The same test against the `scheme`/`host`/`port` triple WebKit reports for
    /// a frame, used to check that a script message really came from the Nexus
    /// page and not from an embedded third-party frame.
    public func matches(scheme frameScheme: String, host frameHost: String, port framePort: Int) -> Bool {
        var normalisedHost = frameHost.lowercased()
        if normalisedHost.hasPrefix("["), normalisedHost.hasSuffix("]") {
            normalisedHost = String(normalisedHost.dropFirst().dropLast())
        }
        // WebKit reports port 0 when the URL used the scheme's default port.
        let effectivePort = framePort == 0 ? Self.defaultPort(for: frameScheme) : framePort
        return frameScheme.lowercased() == scheme && normalisedHost == host && effectivePort == port
    }
}
