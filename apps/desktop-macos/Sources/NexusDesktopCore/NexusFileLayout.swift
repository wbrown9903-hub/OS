import Foundation

/// Every location Nexus Desktop reads or writes, in one place.
///
/// The uninstaller, the backup exporter, the settings store and the Bridge
/// endpoint reader all take their paths from here, so "what does Nexus leave on
/// this Mac" has a single, auditable answer that the uninstall screen can list
/// verbatim.
public struct NexusFileLayout: Sendable, Equatable {
    /// `~/Library/Application Support/Nexus OS`
    public let applicationSupport: URL
    /// `~/Library/Caches/com.nexusos.desktop`
    public let caches: URL
    /// `~/Library/Logs/Nexus OS`
    public let logs: URL
    /// `~/Library/Preferences/com.nexusos.desktop.plist`
    public let preferences: URL
    /// `~/Library/WebKit/com.nexusos.desktop` — cookies, local storage and the
    /// signed-in session for the Nexus page.
    public let webContent: URL
    /// Where "Export a backup first" writes to by default.
    public let backupsFolder: URL
    /// The application bundle itself, when the shell can see it.
    public let applicationBundle: URL?

    public static let bundleIdentifier = "com.nexusos.desktop"
    public static let helperBundleIdentifier = "com.nexusos.bridge"
    public static let applicationSupportFolderName = "Nexus OS"

    public init(applicationSupport: URL, caches: URL, logs: URL, preferences: URL,
                webContent: URL, backupsFolder: URL, applicationBundle: URL?) {
        self.applicationSupport = applicationSupport
        self.caches = caches
        self.logs = logs
        self.preferences = preferences
        self.webContent = webContent
        self.backupsFolder = backupsFolder
        self.applicationBundle = applicationBundle
    }

    /// Builds the standard layout under a home directory. Passing an explicit
    /// home is what makes the uninstall planner testable without touching the
    /// real one.
    public static func standard(home: URL, applicationBundle: URL? = nil) -> NexusFileLayout {
        let library = home.appendingPathComponent("Library", isDirectory: true)
        return NexusFileLayout(
            applicationSupport: library
                .appendingPathComponent("Application Support", isDirectory: true)
                .appendingPathComponent(applicationSupportFolderName, isDirectory: true),
            caches: library.appendingPathComponent("Caches", isDirectory: true)
                .appendingPathComponent(bundleIdentifier, isDirectory: true),
            logs: library.appendingPathComponent("Logs", isDirectory: true)
                .appendingPathComponent(applicationSupportFolderName, isDirectory: true),
            preferences: library.appendingPathComponent("Preferences", isDirectory: true)
                .appendingPathComponent("\(bundleIdentifier).plist"),
            webContent: library.appendingPathComponent("WebKit", isDirectory: true)
                .appendingPathComponent(bundleIdentifier, isDirectory: true),
            backupsFolder: home.appendingPathComponent("Documents", isDirectory: true)
                .appendingPathComponent("Nexus OS Backups", isDirectory: true),
            applicationBundle: applicationBundle)
    }

    /// The shell's own settings document, inside `JSONDocumentStore`'s root.
    public var settingsStoreRoot: URL { applicationSupport.appendingPathComponent("Desktop", isDirectory: true) }
    public static let settingsDocumentName = "desktop-settings"

    /// Where the Bridge publishes the loopback port it bound at start-up.
    public var bridgeEndpointFile: URL { applicationSupport.appendingPathComponent("bridge-endpoint.json") }

    /// Local data written by Nexus Cloud when it runs on this Mac: the database,
    /// the Brain's index and generated assets. Removed only by "Everything".
    public var localData: [URL] {
        [
            applicationSupport.appendingPathComponent("Data", isDirectory: true),
            applicationSupport.appendingPathComponent("Brain", isDirectory: true),
            applicationSupport.appendingPathComponent("Workspaces", isDirectory: true),
        ]
    }
}
