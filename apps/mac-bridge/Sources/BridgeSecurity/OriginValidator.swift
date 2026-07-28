import Foundation
import AppCore
import SecurityCore
import BridgeProtocol

/// The Bridge is reachable from this Mac and nowhere else.
///
/// It binds `127.0.0.1` on a port chosen at random each launch, so there is no
/// well-known port to scan for and nothing is exposed on the LAN. This validator
/// is the second line: it refuses any request whose *transport* origin is not
/// loopback, before the body is read.
///
/// Only four host spellings are accepted — `127.0.0.1`, `::1`, `[::1]` and
/// `localhost`. Everything else is refused, including other addresses inside
/// `127.0.0.0/8`, because the listener never binds them and a request claiming
/// one is either a misconfiguration or an attempt to slip past a prefix check.
public struct LoopbackOriginValidator: Sendable {
    public static let allowedHosts: Set<String> = ["127.0.0.1", "::1", "[::1]", "localhost"]
    public static let allowedSchemes: Set<String> = ["http", "https"]

    /// When set, the origin's port must match the port the Bridge actually bound.
    public let expectedPort: Int?

    public init(expectedPort: Int? = nil) { self.expectedPort = expectedPort }

    public func validate(_ origin: String) throws {
        let trimmed = origin.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw Self.refusal("A request arrived without saying where it came from.")
        }
        guard trimmed.count <= 256 else {
            throw Self.refusal("A request arrived with an unusable address.")
        }
        // A bare peer address, as reported by the socket layer.
        if Self.allowedHosts.contains(trimmed) {
            guard expectedPort == nil else {
                throw Self.refusal("A request arrived without the port Nexus OS is listening on.")
            }
            return
        }
        guard let components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              let host = components.host?.lowercased(), !host.isEmpty else {
            throw Self.refusal("A request arrived from an address Nexus OS could not read: “\(trimmed)”.")
        }
        guard Self.allowedSchemes.contains(scheme) else {
            throw Self.refusal("A request arrived over \(scheme):, which the Mac Bridge does not accept.")
        }
        // `user`/`password` in an origin is how `http://127.0.0.1@evil.example`
        // is smuggled past a naive prefix check. URLComponents parses the real
        // host, and credentials are refused outright as well.
        guard components.user == nil, components.password == nil else {
            throw Self.refusal("A request arrived from an address containing a hidden username.")
        }
        guard components.path.isEmpty || components.path == "/" else {
            throw Self.refusal("A request arrived from an address that was not a plain origin.")
        }
        guard Self.allowedHosts.contains(host) else {
            throw Self.refusal("A request arrived from \(host), but the Mac Bridge only accepts requests from this Mac.")
        }
        if let expectedPort {
            guard components.port == expectedPort else {
                throw Self.refusal("A request arrived on a port the Mac Bridge is not listening on.")
            }
        }
    }

    public func isLoopback(_ origin: String) -> Bool { (try? validate(origin)) != nil }

    /// Cross-checks the origin the caller *claimed* against the one the socket
    /// layer actually observed. They must be the same, so a well-formed lie in
    /// the body gains nothing.
    public func validate(transportOrigin: String, claimedOrigin: String) throws {
        try validate(transportOrigin)
        try validate(claimedOrigin)
        guard Self.normalise(transportOrigin) == Self.normalise(claimedOrigin) else {
            throw Self.refusal("A request described itself as coming from somewhere other than where it arrived from.")
        }
    }

    static func normalise(_ origin: String) -> String {
        let trimmed = origin.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard let components = URLComponents(string: trimmed), let host = components.host else { return trimmed }
        let canonicalHost = (host == "localhost" || host == "::1") ? "127.0.0.1" : host
        if let port = components.port { return "\(canonicalHost):\(port)" }
        return canonicalHost
    }

    static func refusal(_ message: String) -> NexusError {
        NexusError.security(
            "originNotLoopback", message,
            recovery: "Nexus OS only accepts Bridge requests from this Mac. Nothing was done. "
                + "If you did not expect this, open Settings › Mac Bridge and choose Pause Nexus.")
    }
}
