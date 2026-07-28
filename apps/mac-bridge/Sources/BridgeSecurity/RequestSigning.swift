import Foundation
import AppCore
import SecurityCore
import BridgeProtocol

/// Per-device request signing.
///
/// # Why HMAC-SHA256 and not Ed25519
///
/// The signature has to be produced identically by three runtimes — the Swift
/// Bridge, the SwiftUI shell and the TypeScript in Nexus Cloud — and verified on
/// Linux CI where CryptoKit does not exist. Nexus OS already ships an audited,
/// vector-tested `HMAC.sha256` in `SecurityCore`, and both ends of this channel
/// are on the same machine behind loopback, so there is no third party who needs
/// to verify a signature without holding the key. A symmetric construction over
/// a per-device key therefore gives the same property an Ed25519 signature would
/// give us here — *this request came from a device the user paired, and has not
/// been altered* — with no new dependency and no new code to get wrong.
///
/// The scheme is deliberately trivial to reimplement:
///
/// ```text
/// material  = "nexus-bridge/1" LF hex(SHA256(body))
/// signature = hex(HMAC_SHA256(deviceKey, material))
/// ```
///
/// The signature covers the **exact bytes of the request body**. Every security
/// relevant field — device, counter, timestamp, origin, action and parameters —
/// lives inside that body, so there is nothing to canonicalise and nothing a
/// caller can move outside the signed region. Signature verification happens
/// **before** the body is parsed.
public enum BridgeSignature {
    public static let domain = BridgeProtocolDocumentation.protocolVersion

    public static func material(body: Data) -> Data {
        Data((domain + "\n").utf8) + Data(SHA256.hash(body).hexString.utf8)
    }

    public static func sign(body: Data, key: Data) -> String {
        HMAC.sha256(key: key, message: material(body: body)).hexString
    }

    /// Constant-time comparison. Returns false for a malformed hex signature
    /// rather than throwing, so callers cannot distinguish "bad encoding" from
    /// "wrong key" by timing or by error text.
    public static func verify(body: Data, signature: String, key: Data) -> Bool {
        let trimmed = signature.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard trimmed.count == 64, let provided = Data(hexString: trimmed) else { return false }
        let expected = HMAC.sha256(key: key, message: material(body: body)).data
        return HMAC.secureCompare(provided, expected)
    }
}

/// Client half of the protocol. Kept in the portable target so the desktop shell,
/// the Cloud client and the tests all sign identically.
public struct BridgeRequestSigner: Sendable {
    public let deviceID: String
    private let key: Data
    private let counters: CounterSource

    public init(deviceID: String, key: Data, counters: CounterSource) {
        self.deviceID = deviceID; self.key = key; self.counters = counters
    }

    /// Builds and signs one request. `origin` must be the loopback origin the
    /// Bridge published at start-up.
    public func sign(payload: BridgeActionPayload, origin: String,
                     requestOrigin: ContentOrigin, now: Date,
                     requestID: String = UUID().uuidString) throws -> SignedBridgeRequest {
        let envelope = BridgeRequestEnvelope(requestID: requestID, deviceID: deviceID,
                                             counter: counters.next(), issuedAt: now,
                                             origin: origin, requestOrigin: requestOrigin,
                                             payload: try payload.validated())
        let body = try BridgeRequestDecoder.encode(envelope)
        return SignedBridgeRequest(body: body, signature: BridgeSignature.sign(body: body, key: key),
                                   deviceID: deviceID, transportOrigin: origin)
    }
}

/// A monotonically increasing counter. Persisted by the client so a restart never
/// reuses a value the Bridge has already accepted.
public final class CounterSource: @unchecked Sendable {
    private let lock = NSLock()
    private var value: UInt64
    public init(startingAt value: UInt64 = 0) { self.value = value }
    public func next() -> UInt64 { lock.lock(); defer { lock.unlock() }; value += 1; return value }
    public var current: UInt64 { lock.lock(); defer { lock.unlock() }; return value }
}

/// Exactly what arrives at the Bridge: raw bytes plus the transport facts the
/// Bridge observed itself. `transportOrigin` is what the *server* saw, never what
/// the request claimed, which is why a lying `origin` field cannot help anyone.
public struct SignedBridgeRequest: Sendable, Equatable {
    public let body: Data
    public let signature: String
    public let deviceID: String
    public let transportOrigin: String

    public init(body: Data, signature: String, deviceID: String, transportOrigin: String) {
        self.body = body; self.signature = signature
        self.deviceID = deviceID; self.transportOrigin = transportOrigin
    }

    /// Convenience for tests and for the desktop shell's own message bridge.
    public func tampered(replacingBodyWith newBody: Data) -> SignedBridgeRequest {
        SignedBridgeRequest(body: newBody, signature: signature,
                            deviceID: deviceID, transportOrigin: transportOrigin)
    }

    public func arriving(from origin: String) -> SignedBridgeRequest {
        SignedBridgeRequest(body: body, signature: signature, deviceID: deviceID, transportOrigin: origin)
    }
}

/// Cryptographic random bytes, used for nonces, pairing codes and the per-device
/// master secret. `SystemRandomNumberGenerator` is the platform CSPRNG on both
/// macOS (`arc4random_buf`) and Linux (`getrandom`).
public enum SecureRandom {
    public static func bytes(_ count: Int) -> Data {
        var generator = SystemRandomNumberGenerator()
        var out = [UInt8](); out.reserveCapacity(count)
        for _ in 0..<count { out.append(UInt8.random(in: 0...255, using: &generator)) }
        return Data(out)
    }

    public static func hex(_ byteCount: Int) -> String { bytes(byteCount).hexString }

    /// A six-digit pairing code drawn without modulo bias.
    public static func pairingCode() -> String {
        var generator = SystemRandomNumberGenerator()
        return String(format: "%06d", Int.random(in: 0...999_999, using: &generator))
    }
}
