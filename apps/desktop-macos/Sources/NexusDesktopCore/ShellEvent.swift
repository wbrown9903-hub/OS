import Foundation
import AppCore
import BridgeProtocol

/// Something the shell tells the page about itself.
///
/// The page is not allowed to ask the shell for arbitrary state, and the shell
/// does not push arbitrary state at the page. This closed set is the whole
/// channel, and it exists so the interface can label things honestly — "Paused",
/// "Bridge not connected", "Notifications are off" — instead of showing a control
/// that silently does nothing.
public enum ShellEvent: Sendable, Equatable {
    /// The user paused or resumed Nexus from the menu bar, a hot key or Settings.
    case pauseChanged(isPaused: Bool, reason: String?)
    /// A macOS permission changed while the app was running.
    case permissionChanged(permission: MacPermission, state: BridgeStatusReport.PermissionState)
    /// The Mac Bridge appeared or went away.
    case bridgeAvailabilityChanged(isAvailable: Bool, reason: String?)
    /// The connection to Nexus Cloud came back after an outage.
    case connectionRestored
    /// A global hot key fired while the window had focus.
    case shortcutPressed(name: String)

    public var name: String {
        switch self {
        case .pauseChanged: return "pauseChanged"
        case .permissionChanged: return "permissionChanged"
        case .bridgeAvailabilityChanged: return "bridgeAvailabilityChanged"
        case .connectionRestored: return "connectionRestored"
        case .shortcutPressed: return "shortcutPressed"
        }
    }

    /// The event's payload as a JSON-encodable dictionary. Kept small and flat:
    /// the page gets facts, never instructions.
    public var payload: [String: Any] {
        switch self {
        case .pauseChanged(let isPaused, let reason):
            var object: [String: Any] = ["isPaused": isPaused]
            if let reason { object["reason"] = reason }
            return object
        case .permissionChanged(let permission, let state):
            return ["permission": permission.rawValue,
                    "state": state.rawValue,
                    "title": permission.title,
                    "ifDenied": permission.degradedBehaviour]
        case .bridgeAvailabilityChanged(let isAvailable, let reason):
            var object: [String: Any] = ["isAvailable": isAvailable]
            if let reason { object["reason"] = reason }
            return object
        case .connectionRestored:
            return [:]
        case .shortcutPressed(let name):
            return ["shortcut": name]
        }
    }

    /// Serialises the payload for embedding in the dispatch script. Falls back to
    /// an empty object rather than injecting anything unserialisable.
    public func jsonPayload() -> String {
        let object = payload
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]),
              let text = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return text
    }

    /// The complete script to evaluate in the page.
    public var javaScript: String {
        WebBridgeContract.dispatchEventJavaScript(name: name, jsonPayload: jsonPayload())
    }
}
