import Foundation
import AppCore

/// Verifies inbound webhooks (Shopify, WordPress, custom) before a single byte of
/// their payload influences a widget, a sound or a workflow.
///
/// Three independent checks: signature, freshness, and single-use. A forged,
/// replayed or stale delivery fails all downstream processing.
public struct WebhookVerifier: Sendable {
    public enum Encoding: String, Codable, Sendable { case base64, hex }

    public struct Configuration: Sendable {
        public let secret: Data
        public let encoding: Encoding
        /// How far a delivery's timestamp may drift from now before it is refused.
        public let toleranceSeconds: TimeInterval

        public init(secret: Data, encoding: Encoding = .base64, toleranceSeconds: TimeInterval = 300) {
            self.secret = secret; self.encoding = encoding; self.toleranceSeconds = toleranceSeconds
        }
        public init(secretString: String, encoding: Encoding = .base64, toleranceSeconds: TimeInterval = 300) {
            self.init(secret: Data(secretString.utf8), encoding: encoding, toleranceSeconds: toleranceSeconds)
        }
    }

    public let configuration: Configuration
    private let replayCache: ReplayCache
    private let dates: DateProvider

    public init(configuration: Configuration, replayCache: ReplayCache, dates: DateProvider = SystemDateProvider()) {
        self.configuration = configuration
        self.replayCache = replayCache
        self.dates = dates
    }

    public func expectedSignature(for body: Data) -> String {
        let digest = HMAC.sha256(key: configuration.secret, message: body)
        switch configuration.encoding {
        case .base64: return digest.data.base64EncodedString()
        case .hex: return digest.hexString
        }
    }

    /// - Parameters:
    ///   - deliveryID: the provider's unique delivery identifier, used for single-use enforcement.
    ///   - timestamp: the provider's send time, when it supplies one.
    public func verify(body: Data, signature: String, deliveryID: String, timestamp: Date? = nil) throws {
        let provided: Data?
        switch configuration.encoding {
        case .base64: provided = Data(base64Encoded: signature.trimmingCharacters(in: .whitespaces))
        case .hex: provided = Data(hexString: signature.trimmingCharacters(in: .whitespaces).lowercased())
        }
        guard let providedBytes = provided, !providedBytes.isEmpty else {
            throw NexusError.security("badSignatureEncoding",
                                      "A delivery from this service had an unreadable signature and was ignored.",
                                      recovery: "Re-copy the signing secret in the connection settings, then send a test event.")
        }
        let expected = HMAC.sha256(key: configuration.secret, message: body).data
        guard HMAC.secureCompare(providedBytes, expected) else {
            throw NexusError.security("signatureMismatch",
                                      "A delivery claiming to come from this service was not signed correctly and was rejected.",
                                      recovery: "Check that the signing secret in Nexus OS matches the one in the service's settings.")
        }
        if let timestamp {
            let drift = abs(dates.now.timeIntervalSince(timestamp))
            guard drift <= configuration.toleranceSeconds else {
                throw NexusError.security("staleDelivery",
                                          "A delivery arrived too long after it was sent and was rejected.",
                                          recovery: "Check that your Mac's clock is set automatically, then retry the event.")
            }
        }
        guard replayCache.claim(deliveryID, at: dates.now) else {
            throw NexusError.security("replayedDelivery",
                                      "That event was already received and was not processed twice.",
                                      recovery: "No action needed — this protects you from duplicate orders or duplicate sounds.")
        }
    }
}

/// Remembers recently seen identifiers so a captured delivery cannot be resent.
/// Also backs event de-duplication for sale sounds and notifications.
public final class ReplayCache: @unchecked Sendable {
    private struct Entry { let id: String; let seenAt: Date }
    private let lock = NSLock()
    private var entries: [String: Date] = [:]
    private var order: [String] = []
    private let window: TimeInterval
    private let capacity: Int

    public init(window: TimeInterval = 24 * 3600, capacity: Int = 10_000) {
        self.window = window; self.capacity = capacity
    }

    /// Returns true when the identifier is new. Returns false if it has been seen
    /// inside the window, which is the signal to skip all side effects.
    @discardableResult
    public func claim(_ id: String, at now: Date) -> Bool {
        lock.lock(); defer { lock.unlock() }
        prune(now: now)
        if entries[id] != nil { return false }
        entries[id] = now
        order.append(id)
        if order.count > capacity {
            let excess = order.count - capacity
            for old in order.prefix(excess) { entries.removeValue(forKey: old) }
            order.removeFirst(excess)
        }
        return true
    }

    public func hasSeen(_ id: String, at now: Date) -> Bool {
        lock.lock(); defer { lock.unlock() }
        prune(now: now)
        return entries[id] != nil
    }

    public var count: Int { lock.lock(); defer { lock.unlock() }; return entries.count }

    public func reset() { lock.lock(); entries.removeAll(); order.removeAll(); lock.unlock() }

    private func prune(now: Date) {
        guard !order.isEmpty else { return }
        var removed = 0
        for id in order {
            guard let seen = entries[id], now.timeIntervalSince(seen) > window else { break }
            entries.removeValue(forKey: id); removed += 1
        }
        if removed > 0 { order.removeFirst(removed) }
    }
}
