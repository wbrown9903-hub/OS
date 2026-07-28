import Foundation

/// Every failure surfaced to a person carries three things: what went wrong,
/// why it matters, and the next step. UI never renders a bare error string.
public struct NexusError: Error, Equatable, Codable, CustomStringConvertible {
    public enum Domain: String, Codable, Sendable, CaseIterable {
        case configuration, security, permission, network, storage, workflow
        case integration, plugin, validation, migration, notFound, cancelled, unsupported
    }

    public let domain: Domain
    public let code: String
    /// Plain-language description shown to the user. Must never contain secrets.
    public let message: String
    /// The concrete next action the user can take.
    public let recovery: String
    /// Developer-facing context. Redacted before it reaches any log sink.
    public let context: [String: String]

    public init(domain: Domain, code: String, message: String, recovery: String, context: [String: String] = [:]) {
        self.domain = domain
        self.code = code
        self.message = message
        self.recovery = recovery
        self.context = context
    }

    public var description: String { "[\(domain.rawValue).\(code)] \(message) — \(recovery)" }

    public func adding(context extra: [String: String]) -> NexusError {
        NexusError(domain: domain, code: code, message: message, recovery: recovery,
                   context: context.merging(extra) { _, new in new })
    }

    // Frequently used constructors keep call sites short without losing the recovery text.
    public static func validation(_ code: String, _ message: String, recovery: String) -> NexusError {
        NexusError(domain: .validation, code: code, message: message, recovery: recovery)
    }
    public static func security(_ code: String, _ message: String, recovery: String) -> NexusError {
        NexusError(domain: .security, code: code, message: message, recovery: recovery)
    }
    public static func notFound(_ what: String, recovery: String) -> NexusError {
        NexusError(domain: .notFound, code: "missing", message: "\(what) could not be found.", recovery: recovery)
    }
    public static func unsupported(_ what: String, recovery: String) -> NexusError {
        NexusError(domain: .unsupported, code: "unsupported", message: "\(what) is not supported here.", recovery: recovery)
    }
    public static func storage(_ code: String, _ message: String, recovery: String) -> NexusError {
        NexusError(domain: .storage, code: code, message: message, recovery: recovery)
    }
    public static func permission(_ code: String, _ message: String, recovery: String) -> NexusError {
        NexusError(domain: .permission, code: code, message: message, recovery: recovery)
    }
}

extension NexusError: LocalizedError {
    public var errorDescription: String? { message }
    public var recoverySuggestion: String? { recovery }
}
