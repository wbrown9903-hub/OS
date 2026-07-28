import Foundation
import AppCore
import SecurityCore
import BridgeProtocol
import BridgeSecurity
import ApplicationCatalogue

/// The allow-lists the user filled in beforehand. Nothing here can be widened by
/// a request; a request can only ask for something already on a list.
public struct ActionApprovals: Codable, Sendable, Equatable {
    /// macOS Shortcuts the user ticked. Matched case-insensitively on the exact
    /// name — never by prefix, so "Backup" cannot satisfy "Backup and Wipe".
    public var approvedShortcutNames: Set<String>
    /// MCP servers the user connected and approved.
    public var approvedMCPServerIDs: Set<String>
    /// Hosts `openURL` may reach. Empty means "any public https or http host".
    public var allowedURLHosts: Set<String>
    public var maximumClipboardCharacters: Int

    public init(approvedShortcutNames: Set<String> = [],
                approvedMCPServerIDs: Set<String> = [],
                allowedURLHosts: Set<String> = [],
                maximumClipboardCharacters: Int = BridgeLimits.maximumClipboardCharacters) {
        self.approvedShortcutNames = approvedShortcutNames
        self.approvedMCPServerIDs = approvedMCPServerIDs
        self.allowedURLHosts = allowedURLHosts
        self.maximumClipboardCharacters = maximumClipboardCharacters
    }

    func approvesShortcut(_ name: String) -> Bool {
        let wanted = name.lowercased().trimmingCharacters(in: .whitespaces)
        return approvedShortcutNames.contains { $0.lowercased().trimmingCharacters(in: .whitespaces) == wanted }
    }
}

/// Everything the validator needs to make a decision, gathered in one value so a
/// decision is a pure function of (request, context) and therefore reproducible
/// in a test.
public struct ValidationContext: Sendable {
    /// The folders the user granted. `openFile`/`openFolder` resolve through this.
    public var pathGuard: PathGuard
    public var catalogue: ApplicationCatalogue
    public var approvals: ActionApprovals
    public var policy: PermissionPolicy
    /// macOS permission states as last observed. A `denied` permission turns the
    /// actions it gates into a clear "grant this, here is where" refusal instead
    /// of a silent no-op or a crash.
    public var permissionStates: [MacPermission: BridgeStatusReport.PermissionState]

    public init(pathGuard: PathGuard,
                catalogue: ApplicationCatalogue = .standard,
                approvals: ActionApprovals = ActionApprovals(),
                policy: PermissionPolicy = .safeDefault,
                permissionStates: [MacPermission: BridgeStatusReport.PermissionState] = [:]) {
        self.pathGuard = pathGuard
        self.catalogue = catalogue
        self.approvals = approvals
        self.policy = policy
        self.permissionStates = permissionStates
    }

    func state(of permission: MacPermission) -> BridgeStatusReport.PermissionState {
        permissionStates[permission] ?? .notDetermined
    }

    /// Refuses only when macOS has actually said no. `notDetermined` is allowed
    /// through so the first use triggers the system prompt rather than a refusal
    /// the user cannot act on.
    func checkPermission(for action: BridgeAction) throws {
        for permission in MacPermission.allCases where permission.gatedActions.contains(action) {
            guard state(of: permission) == .denied else { continue }
            throw NexusError.permission(
                "macPermissionDenied.\(permission.rawValue)",
                "\(permission.title) is turned off for Nexus OS, so “\(action.title)” cannot run. "
                    + permission.degradedBehaviour,
                recovery: "Open System Settings › Privacy & Security › \(permission.title), switch Nexus OS on, "
                    + "then try again. Nexus OS will not ask you about this again unless you do.")
        }
    }
}

/// What the caller asked for, after every string has been turned into a checked,
/// concrete value. The macOS layer consumes this and never re-parses the raw
/// request — so there is exactly one place where a path or a URL is interpreted.
public struct ResolvedAction: Sendable, Equatable {
    public var requestID: String
    public var action: BridgeAction
    public var payload: BridgeActionPayload
    /// Impact after per-parameter escalation (never lower than the baseline).
    public var impact: ActionImpact
    /// The sentence shown to the user and written to the audit log.
    public var summary: String
    public var requestOrigin: ContentOrigin

    /// Populated for `openURL`, already validated.
    public var resolvedURL: URL?
    /// Populated for `openFile`/`openFolder`, already confined to a granted root.
    public var resolvedPath: URL?
    /// Catalogue entries the request named, in the order it named them.
    public var applications: [ApplicationDescriptor]
    /// Notification text after secret redaction.
    public var redactedNotification: (title: String, body: String, subtitle: String?)?
    /// Clipboard text after length checks.
    public var clipboardText: String?

    public static func == (a: ResolvedAction, b: ResolvedAction) -> Bool {
        a.requestID == b.requestID && a.action == b.action && a.payload == b.payload
            && a.impact == b.impact && a.summary == b.summary && a.requestOrigin == b.requestOrigin
            && a.resolvedURL == b.resolvedURL && a.resolvedPath == b.resolvedPath
            && a.applications == b.applications && a.clipboardText == b.clipboardText
            && a.redactedNotification?.title == b.redactedNotification?.title
            && a.redactedNotification?.body == b.redactedNotification?.body
            && a.redactedNotification?.subtitle == b.redactedNotification?.subtitle
    }

    init(requestID: String, action: BridgeAction, payload: BridgeActionPayload, impact: ActionImpact,
         summary: String, requestOrigin: ContentOrigin, resolvedURL: URL? = nil, resolvedPath: URL? = nil,
         applications: [ApplicationDescriptor] = [],
         redactedNotification: (title: String, body: String, subtitle: String?)? = nil,
         clipboardText: String? = nil) {
        self.requestID = requestID; self.action = action; self.payload = payload
        self.impact = impact; self.summary = summary; self.requestOrigin = requestOrigin
        self.resolvedURL = resolvedURL; self.resolvedPath = resolvedPath
        self.applications = applications; self.redactedNotification = redactedNotification
        self.clipboardText = clipboardText
    }
}

/// The three possible answers. There is no fourth: nothing runs without landing
/// in `allow`, and nothing lands in `allow` without an audit record.
public enum ValidationOutcome: Sendable, Equatable {
    case allow(ResolvedAction)
    case confirm(ResolvedAction, prompt: String)
    case deny(NexusError)

    public var isAllowed: Bool { if case .allow = self { return true }; return false }
    public var requiresConfirmation: Bool { if case .confirm = self { return true }; return false }
    public var isDenied: Bool { if case .deny = self { return true }; return false }

    public var resolved: ResolvedAction? {
        switch self {
        case .allow(let r): return r
        case .confirm(let r, _): return r
        case .deny: return nil
        }
    }

    public var error: NexusError? { if case .deny(let e) = self { return e }; return nil }
}
