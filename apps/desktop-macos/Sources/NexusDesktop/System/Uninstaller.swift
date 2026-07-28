#if os(macOS)
import Foundation
import AppKit
import WebKit
import NexusDesktopCore
import AppCore
import SecurityCore

/// Carries out an ``UninstallPlan``.
///
/// The plan is computed first and shown to the user in full — every path, in
/// plain language, plus what will still be on the Mac afterwards. Only then does
/// anything happen, and each item is reported individually. A partial uninstall
/// that claimed success would leave someone with a wrong picture of their own
/// machine, so this never reports more than it did.
///
/// Deletion means the Trash, not `unlink`. `NSWorkspace.recycle` puts items where
/// the user can get them back, which matters most for the one choice that is
/// otherwise irreversible.
@MainActor
struct Uninstaller {
    let environment: AppEnvironment

    func plan(for choice: UninstallChoice) -> UninstallPlan {
        UninstallPlan.make(choice: choice, layout: environment.layout)
    }

    func run(_ plan: UninstallPlan) async -> UninstallReport {
        var entries: [UninstallReport.Entry] = []
        var backupLocation: URL?

        if plan.exportsBackup {
            switch await exportBackup() {
            case .success(let url):
                backupLocation = url
                entries.append(.init(label: "Backup written to \(url.path)", succeeded: true))
            case .failure(let error):
                entries.append(.init(label: "Export a backup", succeeded: false, problem: error))
            }
            return UninstallReport(choice: plan.choice, entries: entries,
                                   backupLocation: backupLocation,
                                   remaining: UninstallPlan.alwaysRemains(origin: environment.origin))
        }

        // Steps first: stop things running before removing what they use.
        for step in plan.steps {
            let problem = await perform(step)
            entries.append(.init(label: step.title, succeeded: problem == nil, problem: problem))
        }

        for item in plan.removes {
            let problem = moveToTrash(path: item.path)
            entries.append(.init(label: item.label, succeeded: problem == nil, problem: problem))
        }

        return UninstallReport(
            choice: plan.choice,
            entries: entries,
            backupLocation: nil,
            remaining: plan.remainingSummary + UninstallPlan.alwaysRemains(origin: environment.origin))
    }

    // MARK: - Steps

    private func perform(_ step: UninstallStep) async -> NexusError? {
        switch step {
        case .disableLoginItem:
            let error = environment.launchAtLogin.setEnabled(false)
            environment.settings.launchAtLogin = false
            return error

        case .stopBridgeHelper:
            // The Bridge is a separate process that watches its endpoint file.
            // Removing the file is the documented way to ask it to stand down;
            // the shell has no authority to kill another process and does not try.
            let endpoint = environment.layout.bridgeEndpointFile
            guard FileManager.default.fileExists(atPath: endpoint.path) else { return nil }
            do {
                try FileManager.default.removeItem(at: endpoint)
                return nil
            } catch {
                return NexusError.storage(
                    "bridgeHelperNotStopped",
                    "Nexus could not tell the Mac Bridge to stop.",
                    recovery: "Open Activity Monitor, search for “nexus-bridge” and quit it, then run the uninstaller again.")
            }

        case .revokePairedDevices:
            do {
                try KeychainDeviceKeyStore().removeAllKeys()
                return nil
            } catch let error as NexusError {
                return error
            } catch {
                return NexusError.storage("pairingNotRevoked",
                                          "Nexus could not forget the paired devices.",
                                          recovery: "Open Keychain Access, search for “nexusos” and delete the entries by hand.")
            }

        case .releaseGlobalShortcuts:
            environment.hotKeys.unregisterAll()
            return nil

        case .clearWebsiteData:
            let store = WKWebsiteDataStore.default()
            await store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
            return nil

        case .removeKeychainItems:
            do {
                try KeychainDeviceKeyStore().removeAllKeys()
                return nil
            } catch let error as NexusError {
                return error
            } catch {
                return NexusError.storage("keychainNotCleared",
                                          "Nexus could not remove its keys from your Keychain.",
                                          recovery: "Open Keychain Access, search for “nexusos” and delete the entries by hand.")
            }
        }
    }

    // MARK: - Removal

    private func moveToTrash(path: String) -> NexusError? {
        let url = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: path) else { return nil }
        do {
            var resulting: NSURL?
            try FileManager.default.trashItem(at: url, resultingItemURL: &resulting)
            return nil
        } catch {
            return NexusError.storage(
                "couldNotRemove",
                "Nexus could not move \(url.lastPathComponent) to the Trash.",
                recovery: "Open \(url.deletingLastPathComponent().path) in Finder and drag “\(url.lastPathComponent)” to the Trash yourself. Nothing is using it now.")
        }
    }

    // MARK: - Backup

    /// Writes a folder containing the settings document and any local Nexus data,
    /// plus a plain-text README explaining what is inside and how to restore it.
    /// It contains no secret: keys stay in the Keychain and the signed-in session
    /// stays in the web view's own storage.
    private func exportBackup() async -> Result<URL, NexusError> {
        let fileManager = FileManager.default
        let stamp = ISO8601DateFormatter().string(from: Date())
            .replacingOccurrences(of: ":", with: "-")
        let destination = environment.layout.backupsFolder
            .appendingPathComponent("Nexus Backup \(stamp)", isDirectory: true)

        do {
            try fileManager.createDirectory(at: destination, withIntermediateDirectories: true)
        } catch {
            return .failure(NexusError.storage(
                "backupFolderFailed",
                "Nexus could not create a backup folder in \(environment.layout.backupsFolder.path).",
                recovery: "Check you have space and permission to write to your Documents folder, then try again."))
        }

        var copied: [String] = []
        let sources = [environment.layout.settingsStoreRoot] + environment.layout.localData
        for source in sources where fileManager.fileExists(atPath: source.path) {
            let target = destination.appendingPathComponent(source.lastPathComponent, isDirectory: true)
            do {
                try fileManager.copyItem(at: source, to: target)
                copied.append(source.lastPathComponent)
            } catch {
                return .failure(NexusError.storage(
                    "backupCopyFailed",
                    "Nexus could not copy \(source.lastPathComponent) into the backup.",
                    recovery: "Close anything using that folder and try again, or copy \(source.path) yourself."))
            }
        }

        let readme = """
        Nexus OS backup
        Taken: \(stamp)
        Nexus address: \(environment.origin.urlString)

        What is in here
        \(copied.isEmpty ? "  (nothing — there was no Nexus data on this Mac to copy)" : copied.map { "  • \($0)" }.joined(separator: "\n"))

        What is deliberately NOT in here
          • Your Mac Bridge key. It stays in your Keychain, because a key in a
            backup is a key in whatever the backup is copied to.
          • Your signed-in Nexus session. Sign in again after restoring.
          • Any password or token.

        How to restore
          1. Install Nexus OS again.
          2. Quit it.
          3. Copy the folders above back into
             ~/Library/Application Support/Nexus OS/
          4. Open Nexus OS. Your settings and workspaces will be as they were.
        """
        do {
            try Data(readme.utf8).write(to: destination.appendingPathComponent("README.txt"), options: .atomic)
        } catch {
            // The data is what matters; a missing README is not a failed backup.
            Logger.shared.warning("desktop.uninstall", "The backup README could not be written.")
        }
        return .success(destination)
    }

    /// After a successful removal the app is still running from a bundle that is
    /// now in the Trash. Quitting is the last step, and the user is told that is
    /// what will happen before it does.
    func finishAndQuit() {
        environment.saveSettingsNow()
        environment.hotKeys.unregisterAll()
        NSApp.terminate(nil)
    }

    func reveal(_ url: URL) {
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }
}
#endif
