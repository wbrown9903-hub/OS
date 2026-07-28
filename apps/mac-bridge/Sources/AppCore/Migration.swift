import Foundation

/// Any persisted document declares its schema version so the migration runner can
/// take it forward safely, with a backup taken before the first step runs.
public protocol SchemaVersioned {
    static var currentSchemaVersion: Int { get }
}

public struct MigrationStep: Sendable {
    public let from: Int
    public let to: Int
    public let summary: String
    /// Operates on the raw JSON object so old shapes need not still exist as Swift types.
    public let apply: @Sendable ([String: Any]) throws -> [String: Any]

    public init(from: Int, to: Int, summary: String,
                apply: @escaping @Sendable ([String: Any]) throws -> [String: Any]) {
        self.from = from; self.to = to; self.summary = summary; self.apply = apply
    }
}

public struct MigrationReport: Equatable, Sendable {
    public let startingVersion: Int
    public let finalVersion: Int
    public let appliedSummaries: [String]
    public let backupURL: URL?
    public var didMigrate: Bool { startingVersion != finalVersion }
}

public struct MigrationRunner {
    public let steps: [MigrationStep]
    public init(steps: [MigrationStep]) {
        self.steps = steps.sorted { $0.from < $1.from }
    }

    /// - Parameter backup: invoked exactly once, before any step, when a migration is actually required.
    public func migrate(rawObject: [String: Any], to targetVersion: Int,
                        backup: (() throws -> URL?)? = nil) throws -> (object: [String: Any], report: MigrationReport) {
        var object = rawObject
        let start = (object["schemaVersion"] as? Int) ?? 1
        var version = start
        var applied: [String] = []
        var backupURL: URL?

        guard version <= targetVersion else {
            throw NexusError(domain: .migration, code: "newerSchema",
                             message: "This file was created by a newer version of Nexus OS (format \(version)).",
                             recovery: "Update Nexus OS, or restore a backup made by this version.")
        }
        while version < targetVersion {
            guard let step = steps.first(where: { $0.from == version }) else {
                throw NexusError(domain: .migration, code: "noPath",
                                 message: "Nexus OS does not know how to update this file from format \(version).",
                                 recovery: "Restore a backup, or reset this item from Settings › Recovery.")
            }
            if backupURL == nil, let backup { backupURL = try backup() }
            object = try step.apply(object)
            object["schemaVersion"] = step.to
            applied.append(step.summary)
            version = step.to
        }
        return (object, MigrationReport(startingVersion: start, finalVersion: version,
                                        appliedSummaries: applied, backupURL: backupURL))
    }

    /// Decodes `T` from data, migrating the JSON in place first when it is behind.
    public func decode<T: Decodable & SchemaVersioned>(_ type: T.Type, from data: Data,
                                                       backup: (() throws -> URL?)? = nil) throws -> (value: T, report: MigrationReport) {
        guard let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NexusError.storage("badJSON", "This configuration file is not readable.",
                                     recovery: "Restore a backup, or reset it from Settings › Recovery.")
        }
        let (migrated, report) = try migrate(rawObject: raw, to: T.currentSchemaVersion, backup: backup)
        let normalized = try JSONSerialization.data(withJSONObject: migrated)
        return (try NexusJSON.decode(T.self, from: normalized), report)
    }
}
