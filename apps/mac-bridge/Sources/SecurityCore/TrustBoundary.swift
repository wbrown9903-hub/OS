import Foundation
import AppCore

/// Where a piece of content came from. This is the single most important type in
/// Nexus OS's defence against prompt injection: authority is derived from
/// provenance, never from what the content says about itself.
public enum ContentOrigin: String, Codable, Sendable, CaseIterable, Comparable {
    /// Typed or clicked by the person using the Mac. The only origin that grants authority.
    case user
    /// Written by Nexus OS itself (configuration the user previously approved).
    case system
    /// Produced by a language model. A suggestion — never an instruction.
    case model
    /// Returned by an MCP tool, an API, a webhook, a file or a web page.
    case external

    private var rank: Int {
        switch self { case .user: return 3; case .system: return 2; case .model: return 1; case .external: return 0 }
    }
    public static func < (a: ContentOrigin, b: ContentOrigin) -> Bool { a.rank < b.rank }

    public var grantsAuthority: Bool { self == .user }

    public var explanation: String {
        switch self {
        case .user: return "You provided this."
        case .system: return "Nexus OS generated this from settings you saved."
        case .model: return "An AI model suggested this. It has not been approved yet."
        case .external: return "This came from an outside source and is treated as untrusted data."
        }
    }
}

/// Wraps content so it cannot be mistaken for an instruction. Reading the value
/// requires acknowledging the origin, which makes an accidental trust upgrade
/// visible in code review.
public struct Untrusted<Value>: Sendable where Value: Sendable {
    public let origin: ContentOrigin
    public let sourceDescription: String
    private let value: Value

    public init(_ value: Value, origin: ContentOrigin, source: String) {
        self.value = value; self.origin = origin; self.sourceDescription = source
    }

    /// Data use is always fine — display it, index it, store it.
    public var forDisplay: Value { value }

    /// Authority use requires an explicit, user-backed authorization.
    public func requiringAuthority(_ authorization: UserAuthorization) throws -> Value {
        guard authorization.isValid else {
            throw NexusError.security("unauthorizedAction",
                                      "That action needs your approval before it can run.",
                                      recovery: "Review the requested action and choose Approve, or cancel it.")
        }
        return value
    }

    public func map<T: Sendable>(_ transform: (Value) -> T) -> Untrusted<T> {
        Untrusted<T>(transform(value), origin: origin, source: sourceDescription)
    }
}

/// Proof that a specific action was approved by the person at the keyboard.
/// Created only by the approval UI or by a policy the user configured in advance.
public struct UserAuthorization: Sendable, Equatable {
    public let actionIdentifier: String
    public let grantedAt: Date
    public let scope: String
    public let isValid: Bool
    /// Records how approval was obtained, for the audit log.
    public let method: Method

    public enum Method: String, Codable, Sendable {
        case explicitPrompt, preapprovedPolicy, trustedWorkspace
    }

    public init(actionIdentifier: String, scope: String, method: Method, grantedAt: Date = Date()) {
        self.actionIdentifier = actionIdentifier
        self.scope = scope
        self.method = method
        self.grantedAt = grantedAt
        self.isValid = true
    }

    public static func denied(actionIdentifier: String) -> UserAuthorization {
        UserAuthorization(denied: actionIdentifier)
    }

    private init(denied actionIdentifier: String) {
        self.actionIdentifier = actionIdentifier
        self.scope = ""
        self.method = .explicitPrompt
        self.grantedAt = Date()
        self.isValid = false
    }
}

/// Scans untrusted text for the patterns that try to talk a model into using its
/// tools. Nexus OS does not rely on this for safety — the permission engine does
/// that — but surfacing it lets the UI warn the user about a suspicious document.
public struct InjectionHeuristics: Sendable {
    public struct Signal: Equatable, Sendable {
        public let phrase: String
        public let explanation: String
    }

    private static let markers: [(String, String)] = [
        ("ignore previous instructions", "asks the assistant to disregard your instructions"),
        ("ignore all previous", "asks the assistant to disregard your instructions"),
        ("disregard the above", "asks the assistant to disregard your instructions"),
        ("you are now", "tries to give the assistant a new identity"),
        ("system prompt", "refers to the assistant's private instructions"),
        ("developer mode", "claims a hidden permission level exists"),
        ("without asking the user", "asks the assistant to skip your approval"),
        ("do not tell the user", "asks the assistant to hide something from you"),
        ("do not mention", "asks the assistant to hide something from you"),
        ("run the following command", "tries to trigger a command from inside a document"),
        ("exfiltrate", "refers to sending your data elsewhere"),
        ("send the contents to", "asks for your data to be transmitted"),
        ("api key", "requests credential material"),
        ("delete all", "requests a destructive action"),
    ]

    public init() {}

    public func scan(_ text: String) -> [Signal] {
        let haystack = text.lowercased()
        return Self.markers.compactMap { phrase, explanation in
            haystack.contains(phrase) ? Signal(phrase: phrase, explanation: explanation) : nil
        }
    }

    public func isSuspicious(_ text: String) -> Bool { !scan(text).isEmpty }
}
