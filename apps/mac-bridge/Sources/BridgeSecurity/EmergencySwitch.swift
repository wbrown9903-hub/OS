import Foundation
import AppCore
import SecurityCore
import BridgeProtocol

/// "Pause Nexus" — the visible escape back to plain macOS.
///
/// One switch turns off every action the Bridge can perform. It is checked first,
/// before origin, signature, freshness and permissions, so a paused Bridge does
/// no work at all on an inbound request. It is deliberately a *process-wide*
/// switch rather than a per-device or per-action setting: in an emergency the
/// user should not have to reason about scope.
///
/// `bridgeStatus` is the single carve-out, and only because it performs nothing —
/// it lets the menu-bar extra keep showing *"Nexus is paused: <reason>"* rather
/// than going blank at the moment the user most needs to see what is going on.
/// Set ``allowsStatusWhileDisabled`` to `false` for a total blackout; both
/// behaviours are covered by tests.
public final class EmergencySwitch: @unchecked Sendable {
    public struct State: Sendable, Equatable, Codable {
        public var isEngaged: Bool
        public var reason: String?
        public var engagedAt: Date?
        public init(isEngaged: Bool = false, reason: String? = nil, engagedAt: Date? = nil) {
            self.isEngaged = isEngaged; self.reason = reason; self.engagedAt = engagedAt
        }
    }

    private let lock = NSLock()
    private var state: State
    private var allowStatus: Bool
    private let onChange: (@Sendable (State) -> Void)?

    public init(allowsStatusWhileDisabled: Bool = true, initial: State = State(),
                onChange: (@Sendable (State) -> Void)? = nil) {
        self.allowStatus = allowsStatusWhileDisabled
        self.state = initial
        self.onChange = onChange
    }

    public var allowsStatusWhileDisabled: Bool {
        get { lock.lock(); defer { lock.unlock() }; return allowStatus }
        set { lock.lock(); allowStatus = newValue; lock.unlock() }
    }

    public var current: State { lock.lock(); defer { lock.unlock() }; return state }
    public var isEngaged: Bool { current.isEngaged }

    /// Stops everything. Safe to call repeatedly; the first reason is kept so a
    /// later automatic trip cannot overwrite what the user typed.
    public func engage(reason: String, at now: Date = Date()) {
        lock.lock()
        if !state.isEngaged {
            state = State(isEngaged: true, reason: reason, engagedAt: now)
        }
        let snapshot = state
        lock.unlock()
        onChange?(snapshot)
    }

    /// Only ever called from a real user action in the app or the menu-bar extra.
    public func release() {
        lock.lock(); state = State(); let snapshot = state; lock.unlock()
        onChange?(snapshot)
    }

    /// Runs before the request body is parsed, so a total blackout costs nothing.
    /// When the status carve-out is enabled this cannot decide yet — the action is
    /// still unknown — and ``check(_:)`` makes the final call after parsing.
    public func preflight() throws {
        lock.lock()
        let snapshot = state
        let statusExempt = allowStatus
        lock.unlock()
        guard snapshot.isEngaged, !statusExempt else { return }
        throw Self.pausedError(reason: snapshot.reason)
    }

    /// Throws when the action must not run. Called first in `BridgeGuard.admit`.
    public func check(_ action: BridgeAction) throws {
        lock.lock()
        let snapshot = state
        let statusExempt = allowStatus
        lock.unlock()
        guard snapshot.isEngaged else { return }
        if statusExempt && action == .bridgeStatus { return }
        throw Self.pausedError(reason: snapshot.reason)
    }

    public static func pausedError(reason: String?) -> NexusError {
        let because = (reason?.isEmpty == false) ? " (\(reason!))" : ""
        return NexusError.permission(
            "bridgePaused",
            "Nexus is paused, so nothing was done on your Mac\(because).",
            recovery: "Choose Resume Nexus in the menu bar, or open Settings › Mac Bridge, when you want it working again.")
    }
}
