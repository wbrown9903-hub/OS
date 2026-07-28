import Foundation
import AppCore

/// Guards every URL that reaches a browser, a WKWebView, an image downloader or a
/// workflow action. Anything a model, a plugin, a webhook or a news feed produced
/// is treated as hostile until it passes here.
public struct URLValidator: Sendable {
    public struct Policy: Sendable {
        public var allowedSchemes: Set<String>
        /// Empty means "any public host". Non-empty restricts to these hosts and their subdomains.
        public var allowedHosts: Set<String>
        public var allowLocalNetwork: Bool
        public var requireTLS: Bool
        public var maximumLength: Int

        public init(allowedSchemes: Set<String> = ["https"], allowedHosts: Set<String> = [],
                    allowLocalNetwork: Bool = false, requireTLS: Bool = true, maximumLength: Int = 2048) {
            self.allowedSchemes = allowedSchemes
            self.allowedHosts = allowedHosts
            self.allowLocalNetwork = allowLocalNetwork
            self.requireTLS = requireTLS
            self.maximumLength = maximumLength
        }

        /// Links opened in the user's default browser.
        public static let web = Policy(allowedSchemes: ["https", "http"], requireTLS: false)
        /// Strict policy for anything fetched by Nexus itself (news, images, APIs).
        public static let remoteFetch = Policy(allowedSchemes: ["https"], requireTLS: true)
        /// Local MCP servers and self-hosted WordPress instances may be on the LAN.
        public static let localService = Policy(allowedSchemes: ["https", "http"],
                                                allowLocalNetwork: true, requireTLS: false)
    }

    /// Schemes that can execute code, mount volumes or reach internal handlers.
    /// Rejected everywhere, regardless of policy.
    public static let neverAllowedSchemes: Set<String> = [
        "javascript", "data", "vbscript", "file", "about", "blob", "jar",
        "smb", "afp", "ftp", "telnet", "ssh", "x-apple-helpscript", "applescript",
    ]

    public let policy: Policy
    public init(policy: Policy) { self.policy = policy }

    @discardableResult
    public func validate(_ candidate: String) throws -> URL {
        let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw NexusError.validation("emptyURL", "No web address was provided.", recovery: "Enter a full address beginning with https://")
        }
        guard trimmed.count <= policy.maximumLength else {
            throw NexusError.validation("urlTooLong", "That web address is unusually long and was rejected.",
                                        recovery: "Use a shorter link, or open it manually in your browser.")
        }
        guard !trimmed.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7F }) else {
            throw NexusError.security("controlCharacters", "That web address contains hidden characters.",
                                      recovery: "Retype the address by hand rather than pasting it.")
        }
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased() else {
            throw NexusError.validation("malformedURL", "That is not a valid web address.",
                                        recovery: "Check for typos. A full address looks like https://example.com/page")
        }
        guard !Self.neverAllowedSchemes.contains(scheme) else {
            throw NexusError.security("blockedScheme", "Nexus OS will not open \(scheme): links.",
                                      recovery: "Only standard web links can be opened. Report this if you did not expect it.")
        }
        guard policy.allowedSchemes.contains(scheme) else {
            throw NexusError.security("schemeNotAllowed", "Links of type \(scheme): are not permitted here.",
                                      recovery: "Use an https:// address instead.")
        }
        if policy.requireTLS && scheme == "http" {
            throw NexusError.security("insecureTransport", "That address is not encrypted.",
                                      recovery: "Use the https:// version of the address.")
        }
        guard let host = url.host?.lowercased(), !host.isEmpty else {
            throw NexusError.validation("missingHost", "That web address has no site name.",
                                        recovery: "Include the site, for example https://example.com")
        }
        if url.user != nil || url.password != nil {
            throw NexusError.security("credentialsInURL", "That address contains an embedded username or password.",
                                      recovery: "Remove the credentials from the link. Nexus OS never sends them.")
        }
        if !policy.allowLocalNetwork, Self.isLocalOrPrivate(host: host) {
            throw NexusError.security("privateAddress", "That address points at your own machine or local network.",
                                      recovery: "If this is a self-hosted service, add it under Settings › Connections where local addresses are allowed.")
        }
        if Self.containsMixedScripts(host) {
            throw NexusError.security("homographHost", "The site name mixes character sets, which is a common disguise for a fake site.",
                                      recovery: "Type the address manually to be sure you reach the real site.")
        }
        if !policy.allowedHosts.isEmpty, !Self.host(host, matchesAny: policy.allowedHosts) {
            throw NexusError.security("hostNotAllowed", "Nexus OS is not configured to contact \(host).",
                                      recovery: "Add that site to the allowed list for this connection, or use the official address.")
        }
        return url
    }

    public func isValid(_ candidate: String) -> Bool { (try? validate(candidate)) != nil }

    public static func host(_ host: String, matchesAny allowed: Set<String>) -> Bool {
        allowed.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    /// Blocks loopback, link-local, RFC1918 and metadata-service addresses — the
    /// classic server-side request forgery targets — unless explicitly permitted.
    public static func isLocalOrPrivate(host: String) -> Bool {
        if ["localhost", "127.0.0.1", "::1", "0.0.0.0", "[::1]"].contains(host) { return true }
        if host.hasSuffix(".local") || host.hasSuffix(".internal") || host.hasSuffix(".localhost") { return true }
        if host == "169.254.169.254" || host.hasPrefix("169.254.") { return true }
        let parts = host.split(separator: ".").compactMap { UInt8($0) }
        guard parts.count == 4 else { return false }
        switch (parts[0], parts[1]) {
        case (10, _): return true
        case (192, 168): return true
        case (172, 16...31): return true
        case (127, _): return true
        default: return false
        }
    }

    /// Flags a host that mixes Latin with another script — the visual-spoofing case
    /// that makes `аpple.com` (Cyrillic а) indistinguishable from the real thing.
    public static func containsMixedScripts(_ host: String) -> Bool {
        var hasLatin = false, hasNonLatin = false
        for scalar in host.unicodeScalars {
            if scalar.value < 128 {
                if CharacterSet.letters.contains(scalar) { hasLatin = true }
            } else if CharacterSet.letters.contains(scalar) {
                hasNonLatin = true
            }
        }
        return hasLatin && hasNonLatin
    }
}
