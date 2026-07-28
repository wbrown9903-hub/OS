import Foundation
import AppCore
import BridgeProtocol

/// Rate-limits what the web view can ask for.
///
/// Validation and permissions already decide *whether* an action may run. This
/// decides *how often it may be asked*, which is a different problem: a page in a
/// loop cannot escalate its authority, but it can fill Notification Centre, empty
/// the clipboard repeatedly, or bury the user under confirmation sheets until
/// they click Allow to make it stop. Confirmation fatigue is a real attack, so
/// the shell puts a ceiling on it.
///
/// The limits are per action, so a burst of window arrangements cannot starve a
/// status query, and a token bucket rather than a fixed window, so ordinary
/// interactive use never trips it.
public final class RequestThrottle: @unchecked Sendable {
    public struct Limit: Sendable, Equatable {
        /// Requests allowed in a burst.
        public let capacity: Double
        /// Tokens restored per second.
        public let refillPerSecond: Double

        public init(capacity: Double, refillPerSecond: Double) {
            self.capacity = capacity
            self.refillPerSecond = refillPerSecond
        }
    }

    /// Chosen so that a person clicking buttons never notices, and a script does.
    public static func limit(for action: BridgeAction) -> Limit {
        switch action {
        case .bridgeStatus, .detectApplications:
            return Limit(capacity: 30, refillPerSecond: 2)
        case .showNotification:
            // Notification Centre is the easiest surface to abuse, and a genuine
            // workflow posts a handful of notifications a minute at most.
            return Limit(capacity: 6, refillPerSecond: 0.2)
        case .copyApprovedText:
            return Limit(capacity: 5, refillPerSecond: 0.5)
        case .openURL, .openFile, .openFolder, .launchApplication, .focusApplication, .quitApplication:
            return Limit(capacity: 8, refillPerSecond: 0.5)
        case .moveWindow, .resizeWindow, .tileWindows, .restoreWorkspace:
            return Limit(capacity: 20, refillPerSecond: 4)
        case .runApprovedShortcut, .invokeApprovedMCPServer:
            return Limit(capacity: 6, refillPerSecond: 0.5)
        }
    }

    private struct Bucket {
        var tokens: Double
        var lastRefill: Date
    }

    private let lock = NSLock()
    private var buckets: [BridgeAction: Bucket] = [:]

    public init() {}

    /// Consumes one token, or throws an error the user can act on.
    public func admit(_ action: BridgeAction, now: Date = Date()) throws {
        let limit = Self.limit(for: action)
        lock.lock()
        var bucket = buckets[action] ?? Bucket(tokens: limit.capacity, lastRefill: now)
        let elapsed = max(0, now.timeIntervalSince(bucket.lastRefill))
        bucket.tokens = min(limit.capacity, bucket.tokens + elapsed * limit.refillPerSecond)
        bucket.lastRefill = now
        guard bucket.tokens >= 1 else {
            buckets[action] = bucket
            lock.unlock()
            throw Self.tooFast(action)
        }
        bucket.tokens -= 1
        buckets[action] = bucket
        lock.unlock()
    }

    /// Wipes the history, used when the user reloads the page deliberately.
    public func reset() {
        lock.lock(); buckets.removeAll(); lock.unlock()
    }

    public static func tooFast(_ action: BridgeAction) -> NexusError {
        NexusError.security(
            "requestRateLimited",
            "The Nexus page asked to “\(action.title.lowercased())” far more often than a person could, so Nexus Desktop stopped accepting it for a moment.",
            recovery: "Nothing was done. If you were not expecting this, reload Nexus — and if it keeps happening, choose Pause Nexus in the menu bar and report it.")
    }
}
