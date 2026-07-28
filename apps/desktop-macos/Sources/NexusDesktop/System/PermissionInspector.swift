#if os(macOS)
import Foundation
import AppKit
import ApplicationServices
import AppCore
import BridgeProtocol

/// Reads the real state of each macOS permission.
///
/// Detection, not memory. The onboarding flow sends the user to System Settings
/// and then asks this again, so what the app believes always comes from macOS
/// rather than from what the user said they did.
///
/// Two of these are deliberately not "asked for" at all:
///
/// - **Automation** cannot be queried without triggering a prompt for a specific
///   target application, and a prompt the user did not initiate is exactly the
///   behaviour that trains people to click Allow. It is reported as
///   `notDetermined` until an action actually needs it, at which point macOS
///   asks in context — which is the right moment.
/// - **Full Disk Access** is never requested. Nexus OS does not use it, and the
///   status is reported as `notApplicable` so an auditor can see that answer
///   rather than an absence.
@MainActor
final class PermissionInspector {

    /// Every permission's current state, as observed right now.
    func currentStates(launchAtLogin: LaunchAtLoginController) async -> [MacPermission: BridgeStatusReport.PermissionState] {
        var states: [MacPermission: BridgeStatusReport.PermissionState] = [:]
        states[.accessibility] = accessibilityState()
        states[.notifications] = await AppEnvironment.shared.notifications.currentState()
        states[.automation] = .notDetermined
        states[.fullDisk] = .notApplicable
        states[.filesFolders] = filesAndFoldersState()
        states[.loginItem] = launchAtLogin.currentState()
        return states
    }

    /// `AXIsProcessTrusted` answers without prompting. The prompting variant is
    /// only ever called from a button the user pressed.
    func accessibilityState() -> BridgeStatusReport.PermissionState {
        AXIsProcessTrusted() ? .granted : .notDetermined
    }

    /// Shows macOS's own Accessibility prompt. Called only from the onboarding
    /// card's button, never automatically.
    func promptForAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
    }

    /// Nexus OS does not use a blanket Files and Folders permission; it uses the
    /// folders the user picked, held as security-scoped bookmarks. So "granted"
    /// here means "at least one folder has been shared", which is the thing that
    /// actually determines whether file actions work.
    func filesAndFoldersState() -> BridgeStatusReport.PermissionState {
        AppEnvironment.shared.settings.grantedFolderPaths.isEmpty ? .notDetermined : .granted
    }

    /// Opens the exact pane for a permission. `MacPermission` owns the URLs, so
    /// the onboarding cards, the Permissions screen and the error messages all
    /// send the user to the same place.
    @discardableResult
    func openSystemSettings(for permission: MacPermission) -> Bool {
        guard let string = permission.settingsURLString, let url = URL(string: string) else { return false }
        return NSWorkspace.shared.open(url)
    }

    /// Lets the user share a folder with Nexus. This is the honest version of
    /// "Files and Folders": a picker they control, not a permission dialog that
    /// asks for everything.
    func chooseFolderToShare() -> URL? {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = false
        panel.prompt = "Share with Nexus"
        panel.message = "Choose a folder Nexus may open files from. Nexus cannot see anything outside the folders you choose here."
        guard panel.runModal() == .OK else { return nil }
        return panel.url
    }
}
#endif
