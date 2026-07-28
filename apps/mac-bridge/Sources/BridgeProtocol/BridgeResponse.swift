import Foundation
import AppCore
import SecurityCore

/// What the Bridge answers. Every failure carries the same `NexusError` shape the
/// rest of Nexus OS uses, so the UI always has a plain message and a next step —
/// there is no path that yields a bare HTTP status with no explanation.
public struct BridgeResponse: Codable, Sendable, Equatable {
    public enum Status: String, Codable, Sendable {
        /// The action ran.
        case completed
        /// The action is legal but needs the user to approve it first. The desktop
        /// app shows `confirmationPrompt` and, on approval, resends with a
        /// user-origin envelope.
        case confirmationRequired
        /// Refused. `error` says why and what to do about it.
        case refused
        /// Accepted but could not finish because macOS withheld a permission.
        case permissionMissing
    }

    public var version: String
    public var requestID: String
    public var action: BridgeAction
    public var status: Status
    public var summary: String
    public var error: NexusError?
    public var confirmationPrompt: String?
    /// Action-specific result, present only on `.completed`.
    public var result: BridgeResult?

    public init(version: String = BridgeProtocolDocumentation.protocolVersion,
                requestID: String, action: BridgeAction, status: Status, summary: String,
                error: NexusError? = nil, confirmationPrompt: String? = nil, result: BridgeResult? = nil) {
        self.version = version; self.requestID = requestID; self.action = action
        self.status = status; self.summary = summary; self.error = error
        self.confirmationPrompt = confirmationPrompt; self.result = result
    }

    public static func refused(requestID: String, action: BridgeAction, error: NexusError) -> BridgeResponse {
        BridgeResponse(requestID: requestID, action: action, status: .refused,
                       summary: error.message, error: error)
    }

    public static func confirmationRequired(requestID: String, action: BridgeAction,
                                            summary: String, prompt: String) -> BridgeResponse {
        BridgeResponse(requestID: requestID, action: action, status: .confirmationRequired,
                       summary: summary, confirmationPrompt: prompt)
    }
}

/// The union of everything an action can return. Deliberately small: the Bridge
/// reports outcomes, it does not stream data back out of the Mac.
public enum BridgeResult: Sendable, Equatable {
    case none
    case applications([DetectedApplication])
    case status(BridgeStatusReport)
    case text(String)

    private enum Kind: String, Codable { case none, applications, status, text }
    private enum CodingKeys: String, CodingKey { case kind, applications, status, text }
}

extension BridgeResult: Codable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(Kind.self, forKey: .kind) {
        case .none: self = .none
        case .applications: self = .applications(try c.decode([DetectedApplication].self, forKey: .applications))
        case .status: self = .status(try c.decode(BridgeStatusReport.self, forKey: .status))
        case .text: self = .text(try c.decode(String.self, forKey: .text))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .none: try c.encode(Kind.none, forKey: .kind)
        case .applications(let a): try c.encode(Kind.applications, forKey: .kind); try c.encode(a, forKey: .applications)
        case .status(let s): try c.encode(Kind.status, forKey: .kind); try c.encode(s, forKey: .status)
        case .text(let t): try c.encode(Kind.text, forKey: .kind); try c.encode(t, forKey: .text)
        }
    }
}

/// One row of the "which of your applications are installed" answer. Produced by
/// merging the portable catalogue with detection facts supplied by the macOS
/// layer, so the fallback install link is chosen by portable, tested code.
public struct DetectedApplication: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var displayName: String
    public var isInstalled: Bool
    public var bundleIdentifier: String?
    public var bundlePath: String?
    public var version: String?
    /// Present only when the application is not installed.
    public var installURL: String?
    /// Always populated — "Not connected" is never shown without a next step.
    public var nextStep: String

    public init(id: String, displayName: String, isInstalled: Bool, bundleIdentifier: String? = nil,
                bundlePath: String? = nil, version: String? = nil, installURL: String? = nil, nextStep: String) {
        self.id = id; self.displayName = displayName; self.isInstalled = isInstalled
        self.bundleIdentifier = bundleIdentifier; self.bundlePath = bundlePath
        self.version = version; self.installURL = installURL; self.nextStep = nextStep
    }
}

/// The answer to `bridgeStatus`. This is what the menu-bar extra renders, so it
/// must be honest about every permission rather than reporting a single boolean.
public struct BridgeStatusReport: Codable, Sendable, Equatable {
    public enum PermissionState: String, Codable, Sendable {
        case granted, denied, notDetermined, notApplicable

        public var title: String {
            switch self {
            case .granted: return "Granted"
            case .denied: return "Denied"
            case .notDetermined: return "Not asked yet"
            case .notApplicable: return "Not needed"
            }
        }
    }

    public struct PermissionStatus: Codable, Sendable, Equatable {
        public var permission: MacPermission
        public var state: PermissionState
        /// What the person should do next, always present when not granted.
        public var nextStep: String
        public init(permission: MacPermission, state: PermissionState, nextStep: String) {
            self.permission = permission; self.state = state; self.nextStep = nextStep
        }
    }

    public var version: String
    public var bridgeVersion: String
    public var isPaused: Bool
    public var pauseReason: String?
    public var pairedDeviceCount: Int
    public var permissions: [PermissionStatus]
    public var loopbackPort: Int
    public var uptimeSeconds: Int

    public init(version: String = BridgeProtocolDocumentation.protocolVersion,
                bridgeVersion: String, isPaused: Bool, pauseReason: String? = nil,
                pairedDeviceCount: Int, permissions: [PermissionStatus],
                loopbackPort: Int, uptimeSeconds: Int) {
        self.version = version; self.bridgeVersion = bridgeVersion
        self.isPaused = isPaused; self.pauseReason = pauseReason
        self.pairedDeviceCount = pairedDeviceCount; self.permissions = permissions
        self.loopbackPort = loopbackPort; self.uptimeSeconds = uptimeSeconds
    }
}

/// The macOS permissions the Bridge can ask for. Kept portable so the onboarding
/// copy, the System Settings deep links and the status report all come from one
/// list that Linux tests can check.
public enum MacPermission: String, Codable, Sendable, CaseIterable {
    case accessibility
    case notifications
    case automation
    case fullDisk
    case filesFolders
    case loginItem

    public var title: String {
        switch self {
        case .accessibility: return "Accessibility"
        case .notifications: return "Notifications"
        case .automation: return "Automation"
        case .fullDisk: return "Full Disk Access"
        case .filesFolders: return "Files and Folders"
        case .loginItem: return "Open at Login"
        }
    }

    /// Why Nexus OS wants it, in the user's terms. Reused verbatim as the
    /// Info.plist usage description and on the onboarding card, so the two can
    /// never say different things.
    public var reason: String {
        switch self {
        case .accessibility:
            return "Nexus OS needs Accessibility to move and resize windows when you arrange a workspace. Without it, everything else still works — windows just stay where they are."
        case .notifications:
            return "Nexus OS uses notifications to tell you when a workflow finishes or a sale comes in. You can turn individual alerts off later."
        case .automation:
            return "Nexus OS asks other applications to open documents and quit politely. It never sends them commands you did not approve."
        case .fullDisk:
            return "Nexus OS does not need Full Disk Access and does not ask for it. It only reads the folders you choose."
        case .filesFolders:
            return "Nexus OS opens files from the folders you pick. It cannot see anything outside them."
        case .loginItem:
            return "Starts Nexus OS quietly when you log in, so your workspace is ready. You can switch this off at any time."
        }
    }

    /// The exact System Settings pane. Used by the onboarding flow to take the
    /// user straight there instead of describing where to click.
    public var settingsURLString: String? {
        switch self {
        case .accessibility:
            return "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        case .notifications:
            return "x-apple.systempreferences:com.apple.Notifications-Settings.extension"
        case .automation:
            return "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
        case .fullDisk:
            return "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
        case .filesFolders:
            return "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders"
        case .loginItem:
            return "x-apple.systempreferences:com.apple.LoginItems-Settings.extension"
        }
    }

    /// True when refusing it degrades a feature rather than breaking the product.
    /// The onboarding flow never blocks on these and never asks twice.
    public var isOptional: Bool {
        switch self {
        case .accessibility, .notifications, .automation, .loginItem: return true
        case .fullDisk, .filesFolders: return true
        }
    }

    /// What still works when the user says no. Shown instead of nagging.
    public var degradedBehaviour: String {
        switch self {
        case .accessibility: return "Workspaces still open your applications; their windows are left where they are."
        case .notifications: return "Results appear in the Nexus OS window instead of Notification Centre."
        case .automation: return "You will be asked to open and quit applications yourself."
        case .fullDisk: return "Nothing changes — Nexus OS never uses this permission."
        case .filesFolders: return "File actions are unavailable until you choose a folder to share."
        case .loginItem: return "You start Nexus OS yourself when you want it."
        }
    }

    /// The actions that stop working without this permission.
    public var gatedActions: [BridgeAction] {
        switch self {
        case .accessibility: return [.moveWindow, .resizeWindow, .tileWindows, .restoreWorkspace]
        case .notifications: return [.showNotification]
        case .automation: return [.quitApplication]
        case .filesFolders: return [.openFile, .openFolder]
        case .fullDisk, .loginItem: return []
        }
    }
}
