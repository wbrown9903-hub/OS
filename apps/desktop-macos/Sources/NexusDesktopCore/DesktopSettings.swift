import Foundation
import AppCore
import SecurityCore
import BridgeProtocol
import ActionValidator

/// Everything Nexus Desktop remembers between launches.
///
/// It is one `Codable` document written through `AppCore.JSONDocumentStore`, so
/// it inherits atomic writes and the ten-revision history the rest of Nexus OS
/// uses — and so "app + settings" is a single, listable thing the uninstaller can
/// name precisely.
///
/// There is no secret in here. The Bridge signing key lives in the Keychain and
/// the Nexus session lives in the web view's own storage; this document holds
/// preferences only, which is why exporting it as a backup is safe.
public struct DesktopSettings: Codable, Sendable, Equatable {
    /// Bumped when a field is added, so `migrate` can fill in a default rather
    /// than the whole document failing to decode.
    public var schemaVersion: Int

    /// Where the shell loads Nexus Cloud from.
    public var origin: NexusOrigin
    /// False until the user has completed the "connect to your Nexus" screen.
    public var hasCompletedFirstRun: Bool
    /// False until the permission tour has been seen once, whatever its outcome.
    public var hasCompletedPermissionOnboarding: Bool

    /// The permission mode applied to requests arriving from the web view.
    public var bridgePolicy: PermissionPolicy
    /// The allow-lists a request can draw on but never extend.
    public var approvals: ActionApprovals
    /// Folders the user granted, as security-scoped bookmarks are re-resolved at
    /// launch; the paths are kept here so the Permissions screen can list them.
    public var grantedFolderPaths: [String]

    /// Permissions the user has already declined. Recorded so the onboarding
    /// never asks a second time.
    public var declinedPermissions: [String]
    /// When each permission card was last shown, for the same reason.
    public var permissionPromptDates: [String: Date]

    public var launchAtLogin: Bool
    public var showMenuBarExtra: Bool
    /// Restores the window to where it was, which is what a native app does.
    public var restoreWindowFrame: Bool
    public var lastWindowFrame: String?
    /// 1.0 is 100%. Applied through `WKWebView.pageZoom`, not magnification, so
    /// the layout reflows the way it does in Nexus Cloud on the web.
    public var pageZoom: Double
    /// The global hot key that summons the window, as a portable description.
    public var summonShortcut: HotKeyBinding?
    /// The global hot key that pauses and resumes Nexus.
    public var pauseShortcut: HotKeyBinding?

    /// Set when the user chose "Pause Nexus". Restored at launch so pausing
    /// survives a restart — an escape hatch that forgets itself is not an escape.
    public var isPaused: Bool
    public var pauseReason: String?

    public static let currentSchemaVersion = 1

    public init(schemaVersion: Int = DesktopSettings.currentSchemaVersion,
                origin: NexusOrigin = .localDefault,
                hasCompletedFirstRun: Bool = false,
                hasCompletedPermissionOnboarding: Bool = false,
                bridgePolicy: PermissionPolicy = .safeDefault,
                approvals: ActionApprovals = ActionApprovals(),
                grantedFolderPaths: [String] = [],
                declinedPermissions: [String] = [],
                permissionPromptDates: [String: Date] = [:],
                launchAtLogin: Bool = false,
                showMenuBarExtra: Bool = true,
                restoreWindowFrame: Bool = true,
                lastWindowFrame: String? = nil,
                pageZoom: Double = 1.0,
                summonShortcut: HotKeyBinding? = .defaultSummon,
                pauseShortcut: HotKeyBinding? = .defaultPause,
                isPaused: Bool = false,
                pauseReason: String? = nil) {
        self.schemaVersion = schemaVersion
        self.origin = origin
        self.hasCompletedFirstRun = hasCompletedFirstRun
        self.hasCompletedPermissionOnboarding = hasCompletedPermissionOnboarding
        self.bridgePolicy = bridgePolicy
        self.approvals = approvals
        self.grantedFolderPaths = grantedFolderPaths
        self.declinedPermissions = declinedPermissions
        self.permissionPromptDates = permissionPromptDates
        self.launchAtLogin = launchAtLogin
        self.showMenuBarExtra = showMenuBarExtra
        self.restoreWindowFrame = restoreWindowFrame
        self.lastWindowFrame = lastWindowFrame
        self.pageZoom = pageZoom
        self.summonShortcut = summonShortcut
        self.pauseShortcut = pauseShortcut
        self.isPaused = isPaused
        self.pauseReason = pauseReason
    }

    /// Clamps anything a hand-edited or downgraded file could get wrong, so a bad
    /// value produces a sensible default rather than a broken window.
    public func normalised() -> DesktopSettings {
        var copy = self
        copy.schemaVersion = Self.currentSchemaVersion
        copy.pageZoom = min(max(pageZoom.isFinite ? pageZoom : 1.0, 0.5), 3.0)
        copy.declinedPermissions = declinedPermissions
            .filter { MacPermission(rawValue: $0) != nil }
        copy.grantedFolderPaths = Array(Set(grantedFolderPaths)).sorted()
        return copy
    }

    public func hasDeclined(_ permission: MacPermission) -> Bool {
        declinedPermissions.contains(permission.rawValue)
    }

    public mutating func recordDecline(_ permission: MacPermission, at date: Date) {
        if !declinedPermissions.contains(permission.rawValue) {
            declinedPermissions.append(permission.rawValue)
        }
        permissionPromptDates[permission.rawValue] = date
    }

    public mutating func recordPrompt(_ permission: MacPermission, at date: Date) {
        permissionPromptDates[permission.rawValue] = date
    }
}

/// A global hot key, stored as data rather than as an opaque system identifier so
/// it survives an export, is readable in the settings file and can be described
/// in the menu without asking the window server.
public struct HotKeyBinding: Codable, Sendable, Equatable, Hashable {
    /// Virtual key code (`kVK_ANSI_N` and friends).
    public var keyCode: UInt32
    /// Carbon modifier mask (`cmdKey`, `optionKey`, `shiftKey`, `controlKey`).
    public var modifiers: UInt32
    /// What to print in a menu, e.g. "⌥⌘N".
    public var displayName: String

    public init(keyCode: UInt32, modifiers: UInt32, displayName: String) {
        self.keyCode = keyCode
        self.modifiers = modifiers
        self.displayName = displayName
    }

    // Carbon modifier masks, spelled out so this file needs no Carbon import and
    // therefore still compiles on Linux with the rest of the core.
    public static let commandKey: UInt32 = 0x0100
    public static let shiftKey: UInt32 = 0x0200
    public static let optionKey: UInt32 = 0x0800
    public static let controlKey: UInt32 = 0x1000

    /// `kVK_ANSI_N` = 45, `kVK_ANSI_P` = 35.
    public static let defaultSummon = HotKeyBinding(keyCode: 45, modifiers: optionKey | commandKey,
                                                    displayName: "⌥⌘N")
    public static let defaultPause = HotKeyBinding(keyCode: 35, modifiers: optionKey | shiftKey | commandKey,
                                                   displayName: "⌥⇧⌘P")
}
