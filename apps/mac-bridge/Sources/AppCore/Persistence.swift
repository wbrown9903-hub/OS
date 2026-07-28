import Foundation

/// Abstracts "now" so retention, quiet hours, replay windows and backup naming
/// are all deterministically testable.
public protocol DateProvider: Sendable {
    var now: Date { get }
}

public struct SystemDateProvider: DateProvider {
    public init() {}
    public var now: Date { Date() }
}

public final class FixedDateProvider: DateProvider, @unchecked Sendable {
    private let lock = NSLock()
    private var current: Date
    public init(_ date: Date) { current = date }
    public var now: Date { lock.lock(); defer { lock.unlock() }; return current }
    public func advance(by interval: TimeInterval) { lock.lock(); current += interval; lock.unlock() }
    public func set(_ date: Date) { lock.lock(); current = date; lock.unlock() }
}

public enum NexusJSON {
    public static var encoder: JSONEncoder {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        e.dateEncodingStrategy = .iso8601
        return e
    }
    public static var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }
    public static func encode<T: Encodable>(_ value: T) throws -> Data {
        do { return try encoder.encode(value) }
        catch { throw NexusError(domain: .storage, code: "encode", message: "Nexus could not save this item.",
                                 recovery: "Try again. If it keeps failing, export a backup and restart Nexus OS.",
                                 context: ["type": String(describing: T.self)]) }
    }
    public static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do { return try decoder.decode(type, from: data) }
        catch {
            throw NexusError(domain: .storage, code: "decode",
                             message: "A saved file could not be read because its contents are not valid.",
                             recovery: "Restore the most recent backup, or reset this item from Settings › Recovery.",
                             context: ["type": String(describing: T.self), "reason": "\(error)"])
        }
    }
}

/// Atomic, backup-taking JSON document store. Every write leaves the previous
/// revision on disk so a failed migration or corrupt write is always recoverable.
public final class JSONDocumentStore: @unchecked Sendable {
    public let root: URL
    private let fm = FileManager.default
    private let lock = NSLock()
    private let maxRevisions: Int

    public init(root: URL, maxRevisions: Int = 10) throws {
        self.root = root
        self.maxRevisions = maxRevisions
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        try fm.createDirectory(at: root.appendingPathComponent(".revisions"), withIntermediateDirectories: true)
    }

    private func url(for name: String) -> URL { root.appendingPathComponent("\(name).json") }

    public func exists(_ name: String) -> Bool { fm.fileExists(atPath: url(for: name).path) }

    public func read<T: Decodable>(_ type: T.Type, name: String) throws -> T {
        let u = url(for: name)
        guard let data = fm.contents(atPath: u.path) else {
            throw NexusError.notFound("The file \(name).json", recovery: "It will be recreated with defaults the next time you save.")
        }
        return try NexusJSON.decode(type, from: data)
    }

    public func readIfPresent<T: Decodable>(_ type: T.Type, name: String) -> T? {
        guard exists(name) else { return nil }
        return try? read(type, name: name)
    }

    @discardableResult
    public func write<T: Encodable>(_ value: T, name: String) throws -> URL {
        lock.lock(); defer { lock.unlock() }
        let data = try NexusJSON.encode(value)
        let target = url(for: name)
        if fm.fileExists(atPath: target.path) { try snapshotRevision(of: target, name: name) }
        do {
            // `.atomic` writes to a temporary file and renames it into place, so an
            // interrupted write can never leave a half-written document behind.
            // The previous revision was already snapshotted above.
            try data.write(to: target, options: .atomic)
        } catch {
            throw NexusError.storage("write", "Nexus could not save \(name).",
                                     recovery: "Check that the disk is not full and that Nexus OS has access to its support folder.")
        }
        return target
    }

    private func snapshotRevision(of target: URL, name: String) throws {
        let dir = root.appendingPathComponent(".revisions")
        let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
        try? fm.copyItem(at: target, to: dir.appendingPathComponent("\(name)-\(stamp).json"))
        let mine = ((try? fm.contentsOfDirectory(atPath: dir.path)) ?? [])
            .filter { $0.hasPrefix("\(name)-") }.sorted()
        if mine.count > maxRevisions {
            for old in mine.prefix(mine.count - maxRevisions) {
                try? fm.removeItem(at: dir.appendingPathComponent(old))
            }
        }
    }

    public func revisions(of name: String) -> [URL] {
        let dir = root.appendingPathComponent(".revisions")
        return (((try? fm.contentsOfDirectory(atPath: dir.path)) ?? [])
            .filter { $0.hasPrefix("\(name)-") }.sorted().reversed())
            .map { dir.appendingPathComponent($0) }
    }

    public func restore(name: String, from revision: URL) throws {
        guard let data = fm.contents(atPath: revision.path) else {
            throw NexusError.notFound("That saved version", recovery: "Pick a different version from the list.")
        }
        lock.lock(); defer { lock.unlock() }
        let target = url(for: name)
        if fm.fileExists(atPath: target.path) { try snapshotRevision(of: target, name: name) }
        try data.write(to: target, options: .atomic)
    }

    public func delete(_ name: String) throws {
        lock.lock(); defer { lock.unlock() }
        let target = url(for: name)
        if fm.fileExists(atPath: target.path) {
            try snapshotRevision(of: target, name: name)
            try fm.removeItem(at: target)
        }
    }
}
