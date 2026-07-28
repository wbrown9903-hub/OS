import Foundation
import AppCore
import SecurityCore
import BridgeProtocol

/// Replay defence, in two independent layers.
///
/// 1. **Monotonic counter per device.** Every request carries a counter that must
///    be strictly greater than the highest one already accepted from that device.
///    A captured request therefore cannot be resent even once, and cannot be
///    reordered ahead of a later one.
/// 2. **Single-use request identifier.** Each `requestID` is claimed in a
///    `ReplayCache` for a bounded window. This catches the case where two clients
///    share a device identity and race on the same counter.
///
/// The ledger is only advanced on a request that passed *every* other check, so a
/// forged or stale request can never burn a counter value and lock out the real
/// client.
public final class NonceLedger: @unchecked Sendable {
    private let lock = NSLock()
    private var highestCounter: [String: UInt64] = [:]
    private let replayCache: ReplayCache
    /// How far ahead of the last accepted value a counter may jump. Generous
    /// enough to survive a client restart that lost a few values, tight enough
    /// that a counter cannot be pushed to `UInt64.max` to lock the device out.
    public let maximumForwardJump: UInt64

    public init(replayCache: ReplayCache = ReplayCache(window: 3600, capacity: 20_000),
                maximumForwardJump: UInt64 = 10_000) {
        self.replayCache = replayCache
        self.maximumForwardJump = maximumForwardJump
    }

    /// Checks without committing. Throws with a user-readable reason.
    public func check(deviceID: String, counter: UInt64, requestID: String, at now: Date) throws {
        lock.lock()
        let last = highestCounter[deviceID] ?? 0
        lock.unlock()

        guard counter > last else {
            throw NexusError.security(
                "replayedRequest",
                "A request that had already been used arrived again and was ignored.",
                recovery: "No action needed — this is how Nexus OS stops a captured request being repeated.")
        }
        guard counter - last <= maximumForwardJump else {
            throw NexusError.security(
                "counterJump",
                "A request arrived far out of sequence and was ignored.",
                recovery: "Quit and reopen Nexus OS. If it keeps happening, unpair and pair this device again.")
        }
        guard !replayCache.hasSeen(requestID, at: now) else {
            throw NexusError.security(
                "duplicateRequest",
                "That request was already received and was not carried out twice.",
                recovery: "No action needed — this protects you from an action running twice.")
        }
    }

    /// Called once, after every other check has passed.
    public func commit(deviceID: String, counter: UInt64, requestID: String, at now: Date) {
        lock.lock()
        highestCounter[deviceID] = max(highestCounter[deviceID] ?? 0, counter)
        lock.unlock()
        replayCache.claim(requestID, at: now)
    }

    public func highestAccepted(for deviceID: String) -> UInt64 {
        lock.lock(); defer { lock.unlock() }; return highestCounter[deviceID] ?? 0
    }

    /// Restores the counter after a Bridge restart so a restart is not a replay window.
    public func restore(deviceID: String, counter: UInt64) {
        lock.lock(); highestCounter[deviceID] = max(highestCounter[deviceID] ?? 0, counter); lock.unlock()
    }

    public func forget(deviceID: String) {
        lock.lock(); highestCounter.removeValue(forKey: deviceID); lock.unlock()
    }
}

/// Rejects a request whose clock is too far from the Bridge's own.
///
/// Both directions matter: an old request may have been captured, and a request
/// far in the future would otherwise stay valid long after the user revoked the
/// device. The window is small because both ends are on the same machine.
public struct FreshnessPolicy: Sendable {
    public let maximumAge: TimeInterval
    public let maximumSkewAhead: TimeInterval

    public init(maximumAge: TimeInterval = 30, maximumSkewAhead: TimeInterval = 5) {
        self.maximumAge = maximumAge; self.maximumSkewAhead = maximumSkewAhead
    }

    public func check(issuedAt: Date, now: Date) throws {
        let age = now.timeIntervalSince(issuedAt)
        if age > maximumAge {
            throw NexusError.security(
                "staleRequest",
                "A request arrived \(Int(age)) seconds after it was created, which is too old to be acted on.",
                recovery: "Try the action again. If this keeps happening, check that your Mac's clock is set automatically.")
        }
        if age < -maximumSkewAhead {
            throw NexusError.security(
                "futureRequest",
                "A request claimed to have been created in the future and was ignored.",
                recovery: "Check that your Mac's date and time are set automatically, then try again.")
        }
    }
}
