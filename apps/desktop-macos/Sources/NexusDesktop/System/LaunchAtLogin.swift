#if os(macOS)
import Foundation
import ServiceManagement
import AppCore
import BridgeProtocol

/// Open at Login, through `SMAppService`.
///
/// `SMAppService.mainApp` is the modern replacement for the deprecated
/// `SMLoginItemSetEnabled` and for writing a `LaunchAgents` plist by hand. It
/// requires no helper bundle, it shows up in System Settings › General › Login
/// Items under the app's own name, and — importantly for the uninstaller —
/// `unregister()` genuinely removes it.
///
/// It only works from a properly bundled, signed application. Running the bare
/// executable produced by `swift build` will report `.notFound`, which is
/// reported honestly rather than being reported as "off".
@MainActor
final class LaunchAtLoginController {

    func currentState() -> BridgeStatusReport.PermissionState {
        switch SMAppService.mainApp.status {
        case .enabled: return .granted
        case .requiresApproval: return .denied
        case .notRegistered: return .notDetermined
        case .notFound: return .notApplicable
        @unknown default: return .notDetermined
        }
    }

    /// Returns the error to show, or nil on success.
    @discardableResult
    func setEnabled(_ enabled: Bool) -> NexusError? {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
            return nil
        } catch {
            return Self.failure(enabling: enabled, underlying: error)
        }
    }

    /// True when macOS has the login item but the user has switched it off in
    /// System Settings. Nexus must not fight that: it reports it and stops.
    var requiresApproval: Bool { SMAppService.mainApp.status == .requiresApproval }

    static func failure(enabling: Bool, underlying: Error) -> NexusError {
        if enabling {
            return NexusError.permission(
                "loginItemRefused",
                "macOS did not let Nexus add itself to your login items.",
                recovery: "Open System Settings › General › Login Items, find Nexus OS under “Open at Login” and switch it on there. Nexus works exactly the same either way — you just start it yourself.")
        }
        return NexusError.permission(
            "loginItemNotRemoved",
            "Nexus could not remove itself from your login items.",
            recovery: "Open System Settings › General › Login Items, select Nexus OS and press the minus button.")
    }
}
#endif
