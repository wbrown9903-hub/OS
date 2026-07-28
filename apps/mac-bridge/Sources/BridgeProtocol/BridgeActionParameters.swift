import Foundation
import AppCore
import SecurityCore

/// Hard numeric ceilings applied to every request. They exist so a malformed or
/// hostile caller cannot exhaust memory, spam Notification Centre, or paste a
/// megabyte of text over the user's clipboard.
public enum BridgeLimits {
    public static let maximumBodyBytes = 256 * 1024
    public static let maximumIdentifierLength = 256
    public static let maximumPathLength = 4096
    public static let maximumURLLength = 2048
    public static let maximumNotificationTitle = 120
    public static let maximumNotificationBody = 1000
    public static let maximumClipboardCharacters = 20_000
    public static let maximumWindowsPerRequest = 12
    public static let maximumApplicationsPerRequest = 12
    public static let maximumShortcutInput = 4000
    public static let maximumMCPArgumentBytes = 64 * 1024
    /// Windows may not be positioned outside a plausible desktop; the macOS layer
    /// clamps again against the real display, this only rejects absurd values.
    public static let windowCoordinateRange: ClosedRange<Double> = -20_000...20_000
    public static let windowSizeRange: ClosedRange<Double> = 80...20_000
}

/// Every action's parameter type conforms to this. `validated()` returns a
/// normalised copy or throws a `NexusError` with a next step; `summary` is the
/// one-line human sentence used both in the confirmation prompt and in the audit
/// record, so what the user approved and what was logged can never disagree.
public protocol BridgeActionParameters: Codable, Sendable, Equatable {
    static var action: BridgeAction { get }
    func validated() throws -> Self
    var summary: String { get }
}

// MARK: - Shared validation helpers

enum ParameterCheck {
    static func identifier(_ value: String, field: String) throws -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw NexusError.validation("missing.\(field)", "The request did not say which \(field) to use.",
                                        recovery: "Choose one from the list in Nexus OS, then try again.")
        }
        guard trimmed.count <= BridgeLimits.maximumIdentifierLength else {
            throw NexusError.validation("tooLong.\(field)", "That \(field) name is unreasonably long and was rejected.",
                                        recovery: "Pick the application from the list rather than typing an identifier.")
        }
        guard !trimmed.contains("\0"), !trimmed.unicodeScalars.contains(where: { $0.value < 0x20 }) else {
            throw NexusError.security("controlCharacters.\(field)", "That \(field) name contains hidden characters.",
                                      recovery: "Pick the item from the list in Nexus OS instead of pasting a name.")
        }
        return trimmed
    }

    static func text(_ value: String, field: String, max: Int, allowEmpty: Bool = false) throws -> String {
        if !allowEmpty && value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw NexusError.validation("empty.\(field)", "The \(field) was empty.",
                                        recovery: "Add some text and try again.")
        }
        guard value.count <= max else {
            throw NexusError.validation("tooLong.\(field)", "That \(field) is longer than the \(max) character limit.",
                                        recovery: "Shorten it, then try again.")
        }
        guard !value.contains("\0") else {
            throw NexusError.security("nullByte.\(field)", "That \(field) contains an invalid character.",
                                      recovery: "Retype the text rather than pasting it.")
        }
        return value
    }

    static func path(_ value: String) throws -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw NexusError.validation("emptyPath", "No file or folder was specified.",
                                        recovery: "Choose a file or folder first.")
        }
        guard trimmed.count <= BridgeLimits.maximumPathLength else {
            throw NexusError.validation("pathTooLong", "That location is too long to be a real path.",
                                        recovery: "Choose the file using the file picker instead.")
        }
        guard !trimmed.contains("\0") else {
            throw NexusError.security("nullByte", "That file path contains an invalid character.",
                                      recovery: "Choose the file using the file picker instead of typing its path.")
        }
        return trimmed
    }

    static func coordinate(_ value: Double, field: String) throws -> Double {
        guard value.isFinite else {
            throw NexusError.validation("notANumber.\(field)", "The window \(field) was not a number.",
                                        recovery: "Try the arrangement again, or move the window by hand.")
        }
        guard BridgeLimits.windowCoordinateRange.contains(value) else {
            throw NexusError.validation("outOfRange.\(field)", "That window \(field) is off every screen.",
                                        recovery: "Try the arrangement again, or move the window by hand.")
        }
        return value
    }

    static func dimension(_ value: Double, field: String) throws -> Double {
        guard value.isFinite else {
            throw NexusError.validation("notANumber.\(field)", "The window \(field) was not a number.",
                                        recovery: "Try resizing again, or resize the window by hand.")
        }
        guard BridgeLimits.windowSizeRange.contains(value) else {
            throw NexusError.validation(
                "outOfRange.\(field)",
                "A window \(field) of \(Int(value)) points is outside the allowed range "
                    + "(\(Int(BridgeLimits.windowSizeRange.lowerBound))–\(Int(BridgeLimits.windowSizeRange.upperBound))).",
                recovery: "Choose a sensible size, or resize the window by hand.")
        }
        return value
    }

    static func windowIndex(_ value: Int) throws -> Int {
        guard value >= 0, value < 64 else {
            throw NexusError.validation("badWindowIndex", "That window number does not exist.",
                                        recovery: "Choose the window from the list in Nexus OS.")
        }
        return value
    }
}

// MARK: - Application lifecycle

public struct LaunchApplicationParameters: BridgeActionParameters {
    public static let action = BridgeAction.launchApplication
    /// A Nexus catalogue identifier ("jagex-launcher") or a bundle identifier.
    /// Never a path to an executable — see `noShellAccessRationale`.
    public var applicationID: String
    /// Bring it to the front once it is running.
    public var activate: Bool
    /// When true and the application is missing, the Bridge answers with the
    /// official install URL instead of failing silently.
    public var offerInstallIfMissing: Bool

    public init(applicationID: String, activate: Bool = true, offerInstallIfMissing: Bool = true) {
        self.applicationID = applicationID; self.activate = activate
        self.offerInstallIfMissing = offerInstallIfMissing
    }

    public func validated() throws -> Self {
        var copy = self
        copy.applicationID = try ParameterCheck.identifier(applicationID, field: "application")
        return copy
    }

    public var summary: String { "Open \(applicationID)\(activate ? " and bring it to the front" : "")." }
}

public struct FocusApplicationParameters: BridgeActionParameters {
    public static let action = BridgeAction.focusApplication
    public var applicationID: String
    /// When false, a focus request for an application that is not running fails
    /// rather than quietly launching it — focusing must never become launching.
    public var launchIfNeeded: Bool

    public init(applicationID: String, launchIfNeeded: Bool = false) {
        self.applicationID = applicationID; self.launchIfNeeded = launchIfNeeded
    }

    public func validated() throws -> Self {
        var copy = self
        copy.applicationID = try ParameterCheck.identifier(applicationID, field: "application")
        return copy
    }

    public var summary: String { "Bring \(applicationID) to the front." }
}

public struct QuitApplicationParameters: BridgeActionParameters {
    public static let action = BridgeAction.quitApplication
    public var applicationID: String
    /// Always a polite quit. There is no force-terminate parameter, so an
    /// application with unsaved work always gets the chance to ask the user.
    public var saveChangesPrompt: Bool

    public init(applicationID: String, saveChangesPrompt: Bool = true) {
        self.applicationID = applicationID; self.saveChangesPrompt = saveChangesPrompt
    }

    public func validated() throws -> Self {
        var copy = self
        copy.applicationID = try ParameterCheck.identifier(applicationID, field: "application")
        return copy
    }

    public var summary: String { "Quit \(applicationID). Unsaved work will still prompt you." }
}

// MARK: - Opening things

public struct OpenURLParameters: BridgeActionParameters {
    public static let action = BridgeAction.openURL
    public var url: String
    /// Optional catalogue identifier of the browser to use; nil means the
    /// user's default browser.
    public var inApplicationID: String?

    public init(url: String, inApplicationID: String? = nil) {
        self.url = url; self.inApplicationID = inApplicationID
    }

    public func validated() throws -> Self {
        var copy = self
        copy.url = try ParameterCheck.text(url, field: "web address", max: BridgeLimits.maximumURLLength)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let app = inApplicationID {
            copy.inApplicationID = try ParameterCheck.identifier(app, field: "application")
        }
        return copy
    }

    public var summary: String {
        if let app = inApplicationID { return "Open \(url) in \(app)." }
        return "Open \(url) in your default browser."
    }
}

public struct OpenFileParameters: BridgeActionParameters {
    public static let action = BridgeAction.openFile
    public var path: String
    public var withApplicationID: String?

    public init(path: String, withApplicationID: String? = nil) {
        self.path = path; self.withApplicationID = withApplicationID
    }

    public func validated() throws -> Self {
        var copy = self
        copy.path = try ParameterCheck.path(path)
        if let app = withApplicationID {
            copy.withApplicationID = try ParameterCheck.identifier(app, field: "application")
        }
        return copy
    }

    public var summary: String {
        let name = (path as NSString).lastPathComponent
        if let app = withApplicationID { return "Open “\(name)” with \(app)." }
        return "Open “\(name)”."
    }
}

public struct OpenFolderParameters: BridgeActionParameters {
    public static let action = BridgeAction.openFolder
    public var path: String
    /// Reveal the folder in Finder rather than opening it as the frontmost window.
    public var revealInFinder: Bool

    public init(path: String, revealInFinder: Bool = false) {
        self.path = path; self.revealInFinder = revealInFinder
    }

    public func validated() throws -> Self {
        var copy = self
        copy.path = try ParameterCheck.path(path)
        return copy
    }

    public var summary: String {
        let name = (path as NSString).lastPathComponent
        return revealInFinder ? "Reveal the folder “\(name)” in Finder." : "Open the folder “\(name)”."
    }
}

// MARK: - Windows

public struct WindowTarget: Codable, Sendable, Equatable {
    public var applicationID: String
    /// 0 is the frontmost window of that application.
    public var windowIndex: Int
    public init(applicationID: String, windowIndex: Int = 0) {
        self.applicationID = applicationID; self.windowIndex = windowIndex
    }
    func validated() throws -> WindowTarget {
        WindowTarget(applicationID: try ParameterCheck.identifier(applicationID, field: "application"),
                     windowIndex: try ParameterCheck.windowIndex(windowIndex))
    }
}

public struct MoveWindowParameters: BridgeActionParameters {
    public static let action = BridgeAction.moveWindow
    public var target: WindowTarget
    public var x: Double
    public var y: Double
    /// Which display, when the Mac has more than one. nil means "the one it is on".
    public var displayIndex: Int?

    public init(target: WindowTarget, x: Double, y: Double, displayIndex: Int? = nil) {
        self.target = target; self.x = x; self.y = y; self.displayIndex = displayIndex
    }

    public func validated() throws -> Self {
        var copy = self
        copy.target = try target.validated()
        copy.x = try ParameterCheck.coordinate(x, field: "position")
        copy.y = try ParameterCheck.coordinate(y, field: "position")
        if let display = displayIndex, !(0..<16).contains(display) {
            throw NexusError.validation("badDisplay", "That display does not exist.",
                                        recovery: "Choose a screen from the list in Nexus OS.")
        }
        return copy
    }

    public var summary: String { "Move \(target.applicationID)'s window to \(Int(x)), \(Int(y))." }
}

public struct ResizeWindowParameters: BridgeActionParameters {
    public static let action = BridgeAction.resizeWindow
    public var target: WindowTarget
    public var width: Double
    public var height: Double

    public init(target: WindowTarget, width: Double, height: Double) {
        self.target = target; self.width = width; self.height = height
    }

    public func validated() throws -> Self {
        var copy = self
        copy.target = try target.validated()
        copy.width = try ParameterCheck.dimension(width, field: "width")
        copy.height = try ParameterCheck.dimension(height, field: "height")
        return copy
    }

    public var summary: String { "Resize \(target.applicationID)'s window to \(Int(width))×\(Int(height))." }
}

public enum TileLayout: String, Codable, Sendable, CaseIterable {
    case halvesLeftRight
    case halvesTopBottom
    case thirds
    case quarters
    case mainAndSidebar
    case centreStage

    public var title: String {
        switch self {
        case .halvesLeftRight: return "Two side by side"
        case .halvesTopBottom: return "Two stacked"
        case .thirds: return "Three columns"
        case .quarters: return "Four quarters"
        case .mainAndSidebar: return "One large, the rest beside it"
        case .centreStage: return "One centred, the rest behind"
        }
    }

    /// How many windows the layout can place. Requests with more are rejected
    /// rather than silently dropping windows.
    public var capacity: Int {
        switch self {
        case .halvesLeftRight, .halvesTopBottom: return 2
        case .thirds: return 3
        case .quarters: return 4
        case .mainAndSidebar: return BridgeLimits.maximumWindowsPerRequest
        case .centreStage: return BridgeLimits.maximumWindowsPerRequest
        }
    }
}

public struct TileWindowsParameters: BridgeActionParameters {
    public static let action = BridgeAction.tileWindows
    public var layout: TileLayout
    /// In order. The first entry takes the primary slot.
    public var targets: [WindowTarget]
    public var displayIndex: Int?

    public init(layout: TileLayout, targets: [WindowTarget], displayIndex: Int? = nil) {
        self.layout = layout; self.targets = targets; self.displayIndex = displayIndex
    }

    public func validated() throws -> Self {
        var copy = self
        guard !targets.isEmpty else {
            throw NexusError.validation("noWindows", "No windows were named to arrange.",
                                        recovery: "Choose at least one application, then arrange again.")
        }
        guard targets.count <= min(layout.capacity, BridgeLimits.maximumWindowsPerRequest) else {
            throw NexusError.validation(
                "tooManyWindows",
                "The “\(layout.title)” arrangement holds \(layout.capacity) windows, but \(targets.count) were given.",
                recovery: "Remove some applications, or choose an arrangement that holds more.")
        }
        copy.targets = try targets.map { try $0.validated() }
        return copy
    }

    public var summary: String {
        "Arrange \(targets.count) window\(targets.count == 1 ? "" : "s") as “\(layout.title)”: "
            + targets.map(\.applicationID).joined(separator: ", ") + "."
    }
}

public struct WindowPlacement: Codable, Sendable, Equatable {
    public var target: WindowTarget
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double
    public var displayIndex: Int?

    public init(target: WindowTarget, x: Double, y: Double, width: Double, height: Double, displayIndex: Int? = nil) {
        self.target = target; self.x = x; self.y = y
        self.width = width; self.height = height; self.displayIndex = displayIndex
    }

    func validated() throws -> WindowPlacement {
        WindowPlacement(target: try target.validated(),
                        x: try ParameterCheck.coordinate(x, field: "position"),
                        y: try ParameterCheck.coordinate(y, field: "position"),
                        width: try ParameterCheck.dimension(width, field: "width"),
                        height: try ParameterCheck.dimension(height, field: "height"),
                        displayIndex: displayIndex)
    }
}

public struct RestoreWorkspaceParameters: BridgeActionParameters {
    public static let action = BridgeAction.restoreWorkspace
    public var workspaceID: String
    public var workspaceName: String
    /// Applications to make sure are running, in order.
    public var applicationIDs: [String]
    public var placements: [WindowPlacement]

    public init(workspaceID: String, workspaceName: String, applicationIDs: [String], placements: [WindowPlacement]) {
        self.workspaceID = workspaceID; self.workspaceName = workspaceName
        self.applicationIDs = applicationIDs; self.placements = placements
    }

    public func validated() throws -> Self {
        var copy = self
        copy.workspaceID = try ParameterCheck.identifier(workspaceID, field: "workspace")
        copy.workspaceName = try ParameterCheck.text(workspaceName, field: "workspace name", max: 120)
        guard applicationIDs.count <= BridgeLimits.maximumApplicationsPerRequest else {
            throw NexusError.validation("tooManyApplications",
                                        "A workspace can restore up to \(BridgeLimits.maximumApplicationsPerRequest) applications.",
                                        recovery: "Remove some applications from this workspace and save it again.")
        }
        guard placements.count <= BridgeLimits.maximumWindowsPerRequest else {
            throw NexusError.validation("tooManyWindows",
                                        "A workspace can restore up to \(BridgeLimits.maximumWindowsPerRequest) windows.",
                                        recovery: "Remove some windows from this workspace and save it again.")
        }
        copy.applicationIDs = try applicationIDs.map { try ParameterCheck.identifier($0, field: "application") }
        copy.placements = try placements.map { try $0.validated() }
        return copy
    }

    public var summary: String {
        "Restore the workspace “\(workspaceName)”: open \(applicationIDs.count) application"
            + "\(applicationIDs.count == 1 ? "" : "s") and place \(placements.count) window"
            + "\(placements.count == 1 ? "" : "s")."
    }
}

// MARK: - Notifications, clipboard, shortcuts, MCP

public struct ShowNotificationParameters: BridgeActionParameters {
    public static let action = BridgeAction.showNotification
    public var title: String
    public var body: String
    public var subtitle: String?
    /// A sound *name* from the Bridge's fixed set, never a file path.
    public var sound: NotificationSound
    /// Identifier used to collapse duplicates so a sale sound never plays twice.
    public var deduplicationKey: String?

    public enum NotificationSound: String, Codable, Sendable, CaseIterable {
        case none, defaultSound, sale, alert
    }

    public init(title: String, body: String, subtitle: String? = nil,
                sound: NotificationSound = .none, deduplicationKey: String? = nil) {
        self.title = title; self.body = body; self.subtitle = subtitle
        self.sound = sound; self.deduplicationKey = deduplicationKey
    }

    public func validated() throws -> Self {
        var copy = self
        copy.title = try ParameterCheck.text(title, field: "notification title", max: BridgeLimits.maximumNotificationTitle)
        copy.body = try ParameterCheck.text(body, field: "notification message", max: BridgeLimits.maximumNotificationBody)
        if let subtitle {
            copy.subtitle = try ParameterCheck.text(subtitle, field: "notification subtitle",
                                                    max: BridgeLimits.maximumNotificationTitle)
        }
        if let key = deduplicationKey {
            copy.deduplicationKey = try ParameterCheck.identifier(key, field: "notification key")
        }
        return copy
    }

    public var summary: String { "Show the notification “\(title)”." }
}

public struct CopyApprovedTextParameters: BridgeActionParameters {
    public static let action = BridgeAction.copyApprovedText
    public var text: String
    /// Shown in the confirmation prompt so the user knows what is being copied
    /// without the full text being pasted into a dialog.
    public var label: String

    public init(text: String, label: String) { self.text = text; self.label = label }

    public func validated() throws -> Self {
        var copy = self
        copy.text = try ParameterCheck.text(text, field: "text", max: BridgeLimits.maximumClipboardCharacters)
        copy.label = try ParameterCheck.text(label, field: "label", max: 120)
        return copy
    }

    public var summary: String { "Copy “\(label)” to the clipboard (\(text.count) characters)." }
}

public struct RunApprovedShortcutParameters: BridgeActionParameters {
    public static let action = BridgeAction.runApprovedShortcut
    /// The name of a macOS Shortcut. It must already be on the user's approved
    /// list; a name that is not on the list is refused by `ActionValidator`.
    public var shortcutName: String
    public var textInput: String?

    public init(shortcutName: String, textInput: String? = nil) {
        self.shortcutName = shortcutName; self.textInput = textInput
    }

    public func validated() throws -> Self {
        var copy = self
        copy.shortcutName = try ParameterCheck.identifier(shortcutName, field: "shortcut")
        if let input = textInput {
            copy.textInput = try ParameterCheck.text(input, field: "shortcut input",
                                                     max: BridgeLimits.maximumShortcutInput, allowEmpty: true)
        }
        return copy
    }

    public var summary: String { "Run the approved shortcut “\(shortcutName)”." }
}

public struct InvokeApprovedMCPServerParameters: BridgeActionParameters {
    public static let action = BridgeAction.invokeApprovedMCPServer
    public var serverID: String
    public var toolName: String
    /// A JSON object, serialised. Kept as a string so the Bridge never has to
    /// decode arbitrary nested types before the permission check runs.
    public var argumentsJSON: String

    public init(serverID: String, toolName: String, argumentsJSON: String = "{}") {
        self.serverID = serverID; self.toolName = toolName; self.argumentsJSON = argumentsJSON
    }

    public func validated() throws -> Self {
        var copy = self
        copy.serverID = try ParameterCheck.identifier(serverID, field: "MCP server")
        copy.toolName = try ParameterCheck.identifier(toolName, field: "tool")
        guard argumentsJSON.utf8.count <= BridgeLimits.maximumMCPArgumentBytes else {
            throw NexusError.validation("mcpArgumentsTooLarge", "The information sent to that tool was too large.",
                                        recovery: "Send less data to the tool, or split the request in two.")
        }
        guard let data = argumentsJSON.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              object is [String: Any] else {
            throw NexusError.validation("mcpArgumentsNotObject", "The information sent to that tool was not readable.",
                                        recovery: "Try the action again. If it keeps failing, reconnect the MCP server in Settings › MCP.")
        }
        return copy
    }

    public var summary: String { "Use the tool “\(toolName)” on the MCP server “\(serverID)”." }
}

// MARK: - Introspection

public struct DetectApplicationsParameters: BridgeActionParameters {
    public static let action = BridgeAction.detectApplications
    /// Empty means "everything in the catalogue".
    public var applicationIDs: [String]
    /// Ask the macOS layer to re-scan rather than answer from its cache.
    public var refresh: Bool

    public init(applicationIDs: [String] = [], refresh: Bool = false) {
        self.applicationIDs = applicationIDs; self.refresh = refresh
    }

    public func validated() throws -> Self {
        var copy = self
        guard applicationIDs.count <= 128 else {
            throw NexusError.validation("tooManyApplications", "Too many applications were asked about at once.",
                                        recovery: "Ask about fewer applications, or leave the list empty to check them all.")
        }
        copy.applicationIDs = try applicationIDs.map { try ParameterCheck.identifier($0, field: "application") }
        return copy
    }

    public var summary: String {
        applicationIDs.isEmpty
            ? "Check which applications from your list are installed."
            : "Check whether \(applicationIDs.joined(separator: ", ")) \(applicationIDs.count == 1 ? "is" : "are") installed."
    }
}

public struct BridgeStatusParameters: BridgeActionParameters {
    public static let action = BridgeAction.bridgeStatus
    /// Include the granted/denied state of each macOS permission.
    public var includePermissions: Bool

    public init(includePermissions: Bool = true) { self.includePermissions = includePermissions }
    public func validated() throws -> Self { self }
    public var summary: String { "Read the Bridge's status." }
}
