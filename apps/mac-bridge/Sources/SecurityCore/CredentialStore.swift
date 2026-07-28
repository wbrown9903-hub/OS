import Foundation
import AppCore

/// A pointer to a secret. Configuration files, exports, workflow definitions and
/// plugin manifests store only this — never the secret itself.
public struct SecretReference: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    /// Shown in the UI, e.g. "Anthropic API key (personal)".
    public let label: String
    public let service: String
    public let account: String
    public let createdAt: Date
    /// Last four characters, kept for recognition only. Never enough to use.
    public let hint: String

    public init(id: String = UUID().uuidString, label: String, service: String, account: String,
                createdAt: Date = Date(), hint: String = "") {
        self.id = id; self.label = label; self.service = service
        self.account = account; self.createdAt = createdAt; self.hint = hint
    }

    public static func hint(for secret: String) -> String {
        guard secret.count > 4 else { return "••••" }
        return "••••" + String(secret.suffix(4))
    }
}

/// Implemented by the macOS Keychain on the real product and by an in-memory
/// double in tests. No implementation ever writes a secret to a plain file.
public protocol CredentialStore: AnyObject, Sendable {
    func store(secret: String, for reference: SecretReference) throws
    func retrieve(for reference: SecretReference) throws -> String
    func delete(for reference: SecretReference) throws
    func contains(_ reference: SecretReference) -> Bool
}

public enum CredentialStoreError {
    public static func missing(_ label: String) -> NexusError {
        NexusError(domain: .security, code: "secretMissing",
                   message: "The saved credential for “\(label)” could not be found in your Keychain.",
                   recovery: "Open Settings › Connections, select this connection and enter the credential again.")
    }
    public static func denied(_ label: String) -> NexusError {
        NexusError(domain: .permission, code: "keychainDenied",
                   message: "macOS did not allow Nexus OS to read the credential for “\(label)”.",
                   recovery: "Choose Allow when macOS asks for Keychain access, or re-enter the credential in Settings › Connections.")
    }
}

/// Test and preview double. Deliberately not usable as a production store: it
/// keeps values in memory only and is discarded when the process exits.
public final class InMemoryCredentialStore: CredentialStore, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: String] = [:]
    public init() {}

    private func key(_ r: SecretReference) -> String { "\(r.service)\u{0}\(r.account)" }

    public func store(secret: String, for reference: SecretReference) throws {
        guard !secret.isEmpty else {
            throw NexusError.validation("emptySecret", "No credential was entered.",
                                        recovery: "Paste the key from the service's dashboard, then choose Test Connection.")
        }
        lock.lock(); values[key(reference)] = secret; lock.unlock()
    }
    public func retrieve(for reference: SecretReference) throws -> String {
        lock.lock(); defer { lock.unlock() }
        guard let value = values[key(reference)] else { throw CredentialStoreError.missing(reference.label) }
        return value
    }
    public func delete(for reference: SecretReference) throws {
        lock.lock(); values.removeValue(forKey: key(reference)); lock.unlock()
    }
    public func contains(_ reference: SecretReference) -> Bool {
        lock.lock(); defer { lock.unlock() }; return values[key(reference)] != nil
    }
}

/// Connection state shown in every integration card, so "not working" is never
/// ambiguous. Distinguishing these is a product requirement, not a nicety.
public enum ConnectionState: String, Codable, Sendable, CaseIterable {
    case notConfigured, configurationRequired, connecting, connected, permissionRequired
    case authenticationFailed, unreachable, rateLimited, disabled, error

    public var title: String {
        switch self {
        case .notConfigured: return "Not set up"
        case .configurationRequired: return "Configuration required"
        case .connecting: return "Connecting…"
        case .connected: return "Connected"
        case .permissionRequired: return "Permission required"
        case .authenticationFailed: return "Sign-in failed"
        case .unreachable: return "Cannot reach service"
        case .rateLimited: return "Slowed by the service"
        case .disabled: return "Turned off"
        case .error: return "Needs attention"
        }
    }

    public var nextStep: String {
        switch self {
        case .notConfigured: return "Choose Set Up to connect this service."
        case .configurationRequired: return "Add the required credential to finish connecting."
        case .connecting: return "Nexus OS is contacting the service."
        case .connected: return "Everything is working."
        case .permissionRequired: return "Grant the requested macOS permission, then choose Retry."
        case .authenticationFailed: return "Re-enter the credential — it may have expired or been revoked."
        case .unreachable: return "Check your internet connection, then choose Retry."
        case .rateLimited: return "The service is limiting requests. Nexus OS will retry automatically."
        case .disabled: return "Turn this connection back on to use it."
        case .error: return "Open the connection's details to see what happened."
        }
    }

    /// Status must never be conveyed by colour alone.
    public var symbolName: String {
        switch self {
        case .connected: return "checkmark.circle.fill"
        case .connecting: return "arrow.triangle.2.circlepath"
        case .notConfigured, .configurationRequired: return "gearshape.circle"
        case .permissionRequired: return "lock.circle"
        case .authenticationFailed: return "person.crop.circle.badge.exclamationmark"
        case .unreachable: return "wifi.slash"
        case .rateLimited: return "hourglass.circle"
        case .disabled: return "pause.circle"
        case .error: return "exclamationmark.triangle.fill"
        }
    }

    public var isUsable: Bool { self == .connected }
}
