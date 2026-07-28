import Foundation

public enum LogLevel: Int, Codable, Comparable, Sendable, CaseIterable {
    case trace = 0, debug, info, notice, warning, error, critical
    public static func < (a: LogLevel, b: LogLevel) -> Bool { a.rawValue < b.rawValue }
    public var label: String {
        switch self {
        case .trace: return "TRACE"; case .debug: return "DEBUG"; case .info: return "INFO"
        case .notice: return "NOTICE"; case .warning: return "WARN"; case .error: return "ERROR"
        case .critical: return "CRIT"
        }
    }
}

public struct LogRecord: Codable, Sendable, Equatable {
    public let timestamp: Date
    public let level: LogLevel
    public let subsystem: String
    public let message: String
    public let metadata: [String: String]
    public let file: String
    public let line: Int

    public var formatted: String {
        let meta = metadata.isEmpty ? "" : " " + metadata.sorted { $0.key < $1.key }
            .map { "\($0.key)=\($0.value)" }.joined(separator: " ")
        return "\(ISO8601DateFormatter().string(from: timestamp)) \(level.label) [\(subsystem)] \(message)\(meta)"
    }
}

/// A sink receives records that already passed level filtering and redaction.
public protocol LogSink: AnyObject, Sendable {
    func write(_ record: LogRecord)
}

/// Installed by SecurityCore at startup. Every message and metadata value passes
/// through this before reaching any sink, so a leaked token never lands on disk.
public typealias LogRedactor = @Sendable (String) -> String

public final class InMemoryLogSink: LogSink, @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [LogRecord] = []
    private let limit: Int
    public init(limit: Int = 2000) { self.limit = limit }
    public func write(_ record: LogRecord) {
        lock.lock(); defer { lock.unlock() }
        storage.append(record)
        if storage.count > limit { storage.removeFirst(storage.count - limit) }
    }
    public var records: [LogRecord] { lock.lock(); defer { lock.unlock() }; return storage }
    public func clear() { lock.lock(); defer { lock.unlock() }; storage.removeAll() }
}

/// Appends to a rotating file. Used for the diagnostics export bundle.
public final class FileLogSink: LogSink, @unchecked Sendable {
    private let url: URL
    private let lock = NSLock()
    private let maxBytes: Int
    public init(url: URL, maxBytes: Int = 5 * 1024 * 1024) {
        self.url = url; self.maxBytes = maxBytes
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true)
    }
    public func write(_ record: LogRecord) {
        lock.lock(); defer { lock.unlock() }
        guard let data = (record.formatted + "\n").data(using: .utf8) else { return }
        rotateIfNeeded()
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        } else {
            try? data.write(to: url, options: .atomic)
        }
    }
    private func rotateIfNeeded() {
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
        let size = (attributes?[.size] as? Int) ?? 0
        guard size > maxBytes else { return }
        let rotated = url.appendingPathExtension("1")
        try? FileManager.default.removeItem(at: rotated)
        try? FileManager.default.moveItem(at: url, to: rotated)
    }
}

public final class Logger: @unchecked Sendable {
    public static let shared = Logger()

    private let lock = NSLock()
    private var sinks: [LogSink] = []
    private var redactor: LogRedactor = { $0 }
    public var minimumLevel: LogLevel = .info

    public init() {}

    public func add(sink: LogSink) { lock.lock(); sinks.append(sink); lock.unlock() }
    public func removeAllSinks() { lock.lock(); sinks.removeAll(); lock.unlock() }
    public func install(redactor: @escaping LogRedactor) { lock.lock(); self.redactor = redactor; lock.unlock() }

    public func log(_ level: LogLevel, _ subsystem: String, _ message: String,
                    metadata: [String: String] = [:], file: String = #fileID, line: Int = #line) {
        guard level >= minimumLevel else { return }
        lock.lock()
        let redact = redactor
        let currentSinks = sinks
        lock.unlock()
        let record = LogRecord(timestamp: Date(), level: level, subsystem: subsystem,
                               message: redact(message),
                               metadata: metadata.mapValues(redact),
                               file: file, line: line)
        currentSinks.forEach { $0.write(record) }
    }

    public func debug(_ s: String, _ m: String, metadata: [String: String] = [:]) { log(.debug, s, m, metadata: metadata) }
    public func info(_ s: String, _ m: String, metadata: [String: String] = [:]) { log(.info, s, m, metadata: metadata) }
    public func warning(_ s: String, _ m: String, metadata: [String: String] = [:]) { log(.warning, s, m, metadata: metadata) }
    public func error(_ s: String, _ m: String, metadata: [String: String] = [:]) { log(.error, s, m, metadata: metadata) }
    public func critical(_ s: String, _ m: String, metadata: [String: String] = [:]) { log(.critical, s, m, metadata: metadata) }
}
