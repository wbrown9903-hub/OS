import Foundation
import AppCore

/// The four things a person can choose in the in-app uninstaller.
///
/// Naming them as choices rather than as levels of a slider is deliberate: each
/// one produces a plan that says, item by item, what is removed and what stays.
/// Nothing is deleted until that list has been shown.
public enum UninstallChoice: String, Sendable, Equatable, CaseIterable, Codable, Identifiable {
    /// Remove the application, leave every setting and everything you made.
    case applicationOnly
    /// Remove the application and Nexus Desktop's own settings. Your work stays.
    case applicationAndSettings
    /// Remove everything Nexus put on this Mac, including work stored locally.
    case everything
    /// Write a backup you can keep, and change nothing else.
    case exportBackupFirst

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .applicationOnly: return "Remove the app only"
        case .applicationAndSettings: return "Remove the app and its settings"
        case .everything: return "Remove everything, including my local Nexus data"
        case .exportBackupFirst: return "Export a backup first"
        }
    }

    public var subtitle: String {
        switch self {
        case .applicationOnly:
            return "Nexus Desktop is moved to the Trash. Your settings, your workspaces and anything stored on this Mac are kept, so reinstalling puts you back exactly where you were."
        case .applicationAndSettings:
            return "Nexus Desktop is moved to the Trash and its own preferences are deleted. Anything you made — workspaces, notes, saved data — is kept."
        case .everything:
            return "Nexus Desktop, its settings and the Nexus data stored on this Mac are all removed. This cannot be undone, so export a backup first if you might want any of it."
        case .exportBackupFirst:
            return "Writes a single folder containing your settings and your local Nexus data. Nothing is removed and nothing is changed — you come back to this screen afterwards."
        }
    }

    /// Only the destructive choices need a confirmation step.
    public var isDestructive: Bool { self != .exportBackupFirst }

    /// The one choice that cannot be recovered from without a backup.
    public var requiresBackupWarning: Bool { self == .everything }
}

/// One thing the uninstaller will remove, or deliberately leave behind.
public struct UninstallItem: Sendable, Equatable, Identifiable {
    public var id: String { path }
    /// The exact path, shown verbatim so the user can go and look.
    public let path: String
    /// What it is, in plain language.
    public let label: String
    /// Why it is being kept, when it is being kept.
    public let reasonKept: String?

    public init(path: String, label: String, reasonKept: String? = nil) {
        self.path = path
        self.label = label
        self.reasonKept = reasonKept
    }
}

/// Side effects that are not file deletions but must still happen, in order,
/// before anything is removed.
public enum UninstallStep: String, Sendable, Equatable, CaseIterable {
    /// `SMAppService.mainApp.unregister()` — stop Nexus starting at login.
    case disableLoginItem
    /// Unregister the Bridge helper's launch agent and ask it to quit.
    case stopBridgeHelper
    /// Revoke every paired device, so a stale key cannot be used later.
    case revokePairedDevices
    /// Remove the shell's own hot keys so ⌥⌘N stops being swallowed.
    case releaseGlobalShortcuts
    /// Clear cookies and local storage for the Nexus origin: signing out is part
    /// of uninstalling, not an afterthought.
    case clearWebsiteData
    /// Delete the Bridge signing key and any other Keychain item Nexus created.
    case removeKeychainItems

    public var title: String {
        switch self {
        case .disableLoginItem: return "Stop Nexus opening when you log in"
        case .stopBridgeHelper: return "Stop and remove the Mac Bridge helper"
        case .revokePairedDevices: return "Forget every paired device"
        case .releaseGlobalShortcuts: return "Release the keyboard shortcuts Nexus reserved"
        case .clearWebsiteData: return "Sign out and clear the Nexus session stored on this Mac"
        case .removeKeychainItems: return "Delete Nexus's keys from your Keychain"
        }
    }
}

/// Exactly what a chosen uninstall will do — computed before anything happens, so
/// the confirmation screen shows the truth rather than a summary someone wrote.
///
/// The planner is a pure function of the file layout and the choice, which is why
/// it can be unit-tested against a temporary home directory without deleting
/// anything real.
public struct UninstallPlan: Sendable, Equatable {
    public let choice: UninstallChoice
    /// Runs before any deletion, in this order.
    public let steps: [UninstallStep]
    /// Deleted, in this order.
    public let removes: [UninstallItem]
    /// Deliberately left behind, each with the reason.
    public let leaves: [UninstallItem]
    /// True when a backup folder is written first.
    public let exportsBackup: Bool
    /// The sentence shown above the Confirm button.
    public let confirmationSentence: String

    public init(choice: UninstallChoice, steps: [UninstallStep], removes: [UninstallItem],
                leaves: [UninstallItem], exportsBackup: Bool, confirmationSentence: String) {
        self.choice = choice
        self.steps = steps
        self.removes = removes
        self.leaves = leaves
        self.exportsBackup = exportsBackup
        self.confirmationSentence = confirmationSentence
    }

    public static func make(choice: UninstallChoice, layout: NexusFileLayout) -> UninstallPlan {
        let appItem = layout.applicationBundle.map {
            UninstallItem(path: $0.path, label: "The Nexus Desktop application (moved to the Trash, not erased)")
        }

        let settingsItems = [
            UninstallItem(path: layout.applicationSupport.appendingPathComponent("Desktop", isDirectory: true).path,
                          label: "Nexus Desktop's own settings, including the Nexus address and your permission choices"),
            UninstallItem(path: layout.preferences.path,
                          label: "The window size, zoom level and menu-bar preference"),
            UninstallItem(path: layout.caches.path,
                          label: "Temporary files Nexus cached to start faster"),
            UninstallItem(path: layout.logs.path,
                          label: "Nexus Desktop's diagnostic log"),
            UninstallItem(path: layout.webContent.path,
                          label: "The signed-in Nexus session stored on this Mac"),
            UninstallItem(path: layout.bridgeEndpointFile.path,
                          label: "The file telling Nexus where to find the Mac Bridge"),
        ]

        let localDataItems = layout.localData.map {
            UninstallItem(path: $0.path,
                          label: "Nexus data stored on this Mac — workspaces, your Brain and saved work")
        }

        let keptBackups = UninstallItem(
            path: layout.backupsFolder.path,
            label: "Backups you exported",
            reasonKept: "Backups are yours. Nexus never deletes them, even when you remove everything else.")

        switch choice {
        case .applicationOnly:
            return UninstallPlan(
                choice: choice,
                steps: [.disableLoginItem, .stopBridgeHelper, .releaseGlobalShortcuts],
                removes: [appItem].compactMap { $0 },
                leaves: settingsItems.map {
                    UninstallItem(path: $0.path, label: $0.label,
                                  reasonKept: "Kept so that reinstalling Nexus puts everything back exactly as it is now.")
                } + localDataItems.map {
                    UninstallItem(path: $0.path, label: $0.label, reasonKept: "Your work is never removed by this choice.")
                } + [keptBackups],
                exportsBackup: false,
                confirmationSentence: "Nexus Desktop will be moved to the Trash. Your settings and everything you made stay on this Mac.")

        case .applicationAndSettings:
            return UninstallPlan(
                choice: choice,
                steps: [.disableLoginItem, .stopBridgeHelper, .revokePairedDevices,
                        .releaseGlobalShortcuts, .clearWebsiteData, .removeKeychainItems],
                removes: [appItem].compactMap { $0 } + settingsItems,
                leaves: localDataItems.map {
                    UninstallItem(path: $0.path, label: $0.label,
                                  reasonKept: "This is your work, so this choice never touches it.")
                } + [keptBackups],
                exportsBackup: false,
                confirmationSentence: "Nexus Desktop and its settings will be removed, and you will be signed out on this Mac. Everything you made stays.")

        case .everything:
            return UninstallPlan(
                choice: choice,
                steps: [.disableLoginItem, .stopBridgeHelper, .revokePairedDevices,
                        .releaseGlobalShortcuts, .clearWebsiteData, .removeKeychainItems],
                removes: [appItem].compactMap { $0 } + settingsItems + localDataItems,
                leaves: [keptBackups],
                exportsBackup: false,
                confirmationSentence: "Everything Nexus put on this Mac will be removed, including work stored only on this Mac. This cannot be undone.")

        case .exportBackupFirst:
            return UninstallPlan(
                choice: choice,
                steps: [],
                removes: [],
                leaves: ([appItem].compactMap { $0 } + settingsItems + localDataItems + [keptBackups]).map {
                    UninstallItem(path: $0.path, label: $0.label,
                                  reasonKept: $0.reasonKept ?? "Nothing is removed by exporting a backup.")
                },
                exportsBackup: true,
                confirmationSentence: "A backup folder will be written. Nothing is removed and nothing is changed.")
        }
    }

    /// The list the screen shows under "What will still be on your Mac
    /// afterwards" — deduplicated and sorted so it reads like an inventory.
    public var remainingSummary: [UninstallItem] {
        let removedPaths = Set(removes.map(\.path))
        return leaves.filter { !removedPaths.contains($0.path) }
            .sorted { $0.path < $1.path }
    }

    /// Things this plan cannot remove and must therefore mention, because
    /// pretending an uninstall was complete when it was not is worse than saying
    /// so.
    public static func alwaysRemains(origin: NexusOrigin) -> [UninstallItem] {
        var items = [
            UninstallItem(
                path: "System Settings › Privacy & Security",
                label: "The Accessibility, Notifications and Automation entries for Nexus OS",
                reasonKept: "macOS keeps these until you remove Nexus OS from each list yourself. An app is not permitted to edit them."),
            UninstallItem(
                path: "System Settings › General › Login Items",
                label: "The Nexus OS entry, if macOS has not cleared it yet",
                reasonKept: "Removing the login item takes effect immediately, but macOS sometimes leaves the row visible until you log out."),
        ]
        if !origin.isLoopback {
            items.append(UninstallItem(
                path: origin.urlString,
                label: "Your account and data in Nexus Cloud",
                reasonKept: "This uninstaller only touches this Mac. To delete your hosted account, sign in at \(origin.urlString) and use Settings › Account › Delete account."))
        }
        return items
    }
}

/// The result of running a plan. Reported item by item, because a partial
/// uninstall that claimed success would leave someone with a wrong picture of
/// their own machine.
public struct UninstallReport: Sendable, Equatable {
    public struct Entry: Sendable, Equatable {
        public let label: String
        public let succeeded: Bool
        /// Present when it failed, always with a next step.
        public let problem: NexusError?

        public init(label: String, succeeded: Bool, problem: NexusError? = nil) {
            self.label = label
            self.succeeded = succeeded
            self.problem = problem
        }
    }

    public let choice: UninstallChoice
    public let entries: [Entry]
    public let backupLocation: URL?
    public let remaining: [UninstallItem]

    public init(choice: UninstallChoice, entries: [Entry], backupLocation: URL?, remaining: [UninstallItem]) {
        self.choice = choice
        self.entries = entries
        self.backupLocation = backupLocation
        self.remaining = remaining
    }

    public var allSucceeded: Bool { entries.allSatisfy(\.succeeded) }
    public var failures: [Entry] { entries.filter { !$0.succeeded } }

    public var headline: String {
        if allSucceeded {
            return choice == .exportBackupFirst ? "Your backup is ready." : "Nexus has been removed from this Mac."
        }
        return "Nexus was mostly removed, but \(failures.count) item\(failures.count == 1 ? "" : "s") could not be deleted."
    }

    public var nextStep: String {
        if allSucceeded {
            return choice == .exportBackupFirst
                ? "Choose Reveal in Finder to see it, or pick one of the removal options when you are ready."
                : "You can close this window. The items listed below are the only traces left, and each one says how to remove it."
        }
        return "Open the listed locations in Finder and drag the remaining items to the Trash. Nothing is running, so they are safe to delete."
    }
}
