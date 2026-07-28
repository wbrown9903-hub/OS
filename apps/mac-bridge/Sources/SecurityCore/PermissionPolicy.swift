import Foundation
import AppCore

/// What a tool or action does to the world. Drives confirmation requirements.
public enum ActionImpact: String, Codable, Sendable, CaseIterable, Comparable {
    case read          // observes only
    case write         // creates or modifies data
    case destructive   // deletes, overwrites or sends money/messages irreversibly
    case system        // changes machine or account state

    private var rank: Int {
        switch self { case .read: return 0; case .write: return 1; case .destructive: return 3; case .system: return 2 }
    }
    public static func < (a: ActionImpact, b: ActionImpact) -> Bool { a.rank < b.rank }

    public var label: String {
        switch self {
        case .read: return "Reads information"
        case .write: return "Creates or changes information"
        case .destructive: return "Permanently removes or sends something"
        case .system: return "Changes your Mac or an account"
        }
    }
}

/// The five modes the user picks per MCP server, per connector and per workflow.
public enum PermissionMode: String, Codable, Sendable, CaseIterable {
    case disabled
    case readOnly
    case askEveryTime
    case allowSelected
    case trustedWorkspace

    public var title: String {
        switch self {
        case .disabled: return "Disabled"
        case .readOnly: return "Read Only"
        case .askEveryTime: return "Ask Every Time"
        case .allowSelected: return "Allow Selected Actions"
        case .trustedWorkspace: return "Trusted Workspace"
        }
    }

    public var explanation: String {
        switch self {
        case .disabled: return "Nothing from this connection can run."
        case .readOnly: return "It may look at information, but may not change anything."
        case .askEveryTime: return "You are asked before every single action."
        case .allowSelected: return "Only the actions you ticked can run without asking."
        case .trustedWorkspace: return "Routine actions run without asking. Anything permanent still asks."
        }
    }
}

public struct ToolDescriptor: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let toolDescription: String
    public let impact: ActionImpact
    /// Human-readable summary of what data the tool can reach.
    public let dataAccess: [String]

    public init(id: String, name: String, toolDescription: String, impact: ActionImpact, dataAccess: [String] = []) {
        self.id = id; self.name = name; self.toolDescription = toolDescription
        self.impact = impact; self.dataAccess = dataAccess
    }
}

public struct PermissionPolicy: Codable, Sendable, Equatable {
    public var mode: PermissionMode
    /// Tool identifiers explicitly ticked by the user under `allowSelected`.
    public var allowedToolIDs: Set<String>
    /// Tool identifiers the user has explicitly forbidden. Always wins.
    public var deniedToolIDs: Set<String>
    /// Even in Trusted Workspace, destructive work asks unless the user turns this off deliberately.
    public var confirmDestructiveActions: Bool

    public init(mode: PermissionMode = .askEveryTime, allowedToolIDs: Set<String> = [],
                deniedToolIDs: Set<String> = [], confirmDestructiveActions: Bool = true) {
        self.mode = mode; self.allowedToolIDs = allowedToolIDs
        self.deniedToolIDs = deniedToolIDs; self.confirmDestructiveActions = confirmDestructiveActions
    }

    public static let safeDefault = PermissionPolicy(mode: .askEveryTime)
}

public enum PermissionDecision: Equatable, Sendable {
    case allow(reason: String)
    case confirm(prompt: String, impact: ActionImpact)
    case deny(NexusError)

    public var requiresUserInteraction: Bool { if case .confirm = self { return true }; return false }
    public var isAllowedOutright: Bool { if case .allow = self { return true }; return false }
    public var isDenied: Bool { if case .deny = self { return true }; return false }
}

/// The authority in Nexus OS. A model may *request* anything; only this decides.
public struct PermissionEngine: Sendable {
    public init() {}

    public func evaluate(tool: ToolDescriptor, policy: PermissionPolicy,
                         requestOrigin: ContentOrigin = .model) -> PermissionDecision {
        if policy.deniedToolIDs.contains(tool.id) {
            return .deny(NexusError.permission(
                "toolDenied", "“\(tool.name)” is turned off for this connection.",
                recovery: "Turn it back on in Settings › MCP › this connection › Tools, if you want it available."))
        }
        switch policy.mode {
        case .disabled:
            return .deny(NexusError.permission(
                "connectionDisabled", "This connection is disabled, so “\(tool.name)” cannot run.",
                recovery: "Enable the connection in Settings › MCP to use it again."))

        case .readOnly:
            guard tool.impact == .read else {
                return .deny(NexusError.permission(
                    "readOnlyMode", "“\(tool.name)” would change something, and this connection is set to Read Only.",
                    recovery: "Switch the connection to “Ask Every Time” if you want to allow changes."))
            }
            return .allow(reason: "Read Only permits information to be read.")

        case .askEveryTime:
            return .confirm(prompt: confirmationPrompt(for: tool, requestOrigin: requestOrigin), impact: tool.impact)

        case .allowSelected:
            guard policy.allowedToolIDs.contains(tool.id) else {
                return .confirm(prompt: confirmationPrompt(for: tool, requestOrigin: requestOrigin), impact: tool.impact)
            }
            if tool.impact == .destructive && policy.confirmDestructiveActions {
                return .confirm(prompt: confirmationPrompt(for: tool, requestOrigin: requestOrigin), impact: tool.impact)
            }
            return .allow(reason: "You allowed “\(tool.name)” for this connection.")

        case .trustedWorkspace:
            // Trusted still means bounded: irreversible work is confirmed, and a
            // model-originated request never silently reaches a system-level tool.
            if tool.impact == .destructive && policy.confirmDestructiveActions {
                return .confirm(prompt: confirmationPrompt(for: tool, requestOrigin: requestOrigin), impact: tool.impact)
            }
            if tool.impact == .system && !requestOrigin.grantsAuthority {
                return .confirm(prompt: confirmationPrompt(for: tool, requestOrigin: requestOrigin), impact: tool.impact)
            }
            return .allow(reason: "This is a trusted workspace and the action is reversible.")
        }
    }

    private func confirmationPrompt(for tool: ToolDescriptor, requestOrigin: ContentOrigin) -> String {
        var lines = ["Allow “\(tool.name)” to run?", tool.toolDescription, tool.impact.label]
        if !tool.dataAccess.isEmpty {
            lines.append("It can reach: " + tool.dataAccess.joined(separator: ", ") + ".")
        }
        if !requestOrigin.grantsAuthority {
            lines.append("Requested by: \(requestOrigin.explanation)")
        }
        return lines.joined(separator: "\n")
    }
}

/// Append-only record of what was requested, what was decided and what happened.
public struct AuditRecord: Codable, Sendable, Equatable, Identifiable {
    public enum Outcome: String, Codable, Sendable { case allowed, denied, confirmed, cancelled, failed, completed }

    public let id: UUID
    public let timestamp: Date
    public let subject: String       // e.g. "mcp.filesystem.read_file"
    public let summary: String
    public let impact: ActionImpact
    public let requestOrigin: ContentOrigin
    public let outcome: Outcome
    public let detail: String

    public init(id: UUID = UUID(), timestamp: Date, subject: String, summary: String,
                impact: ActionImpact, requestOrigin: ContentOrigin, outcome: Outcome, detail: String = "") {
        self.id = id; self.timestamp = timestamp; self.subject = subject; self.summary = summary
        self.impact = impact; self.requestOrigin = requestOrigin; self.outcome = outcome; self.detail = detail
    }
}

public final class AuditLog: @unchecked Sendable {
    private let lock = NSLock()
    private var records: [AuditRecord] = []
    private let redactor = SecretRedactor()
    private let limit: Int
    private let sink: ((AuditRecord) -> Void)?

    public init(limit: Int = 5000, sink: ((AuditRecord) -> Void)? = nil) {
        self.limit = limit; self.sink = sink
    }

    public func record(_ record: AuditRecord) {
        let safe = AuditRecord(id: record.id, timestamp: record.timestamp, subject: record.subject,
                               summary: redactor.redact(record.summary), impact: record.impact,
                               requestOrigin: record.requestOrigin, outcome: record.outcome,
                               detail: redactor.redact(record.detail))
        lock.lock()
        records.append(safe)
        if records.count > limit { records.removeFirst(records.count - limit) }
        lock.unlock()
        sink?(safe)
    }

    public var all: [AuditRecord] { lock.lock(); defer { lock.unlock() }; return records }

    public func entries(matching subject: String) -> [AuditRecord] {
        all.filter { $0.subject.hasPrefix(subject) }
    }

    public func clear() { lock.lock(); records.removeAll(); lock.unlock() }
}
