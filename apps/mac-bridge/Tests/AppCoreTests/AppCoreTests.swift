import XCTest
@testable import AppCore

final class NexusErrorTests: XCTestCase {
    func testEveryErrorCarriesUserMessageAndRecovery() {
        let error = NexusError.validation("code", "Something is wrong.", recovery: "Do this next.")
        XCTAssertEqual(error.errorDescription, "Something is wrong.")
        XCTAssertEqual(error.recoverySuggestion, "Do this next.")
        XCTAssertTrue(error.description.contains("validation.code"))
    }

    func testContextMergesWithoutLosingOriginal() {
        let base = NexusError(domain: .storage, code: "write", message: "m", recovery: "r", context: ["a": "1"])
        let merged = base.adding(context: ["b": "2", "a": "override"])
        XCTAssertEqual(merged.context, ["a": "override", "b": "2"])
    }

    func testErrorIsCodableForDiagnosticsExport() throws {
        let error = NexusError.permission("p", "m", recovery: "r")
        let data = try NexusJSON.encode(error)
        XCTAssertEqual(try NexusJSON.decode(NexusError.self, from: data), error)
    }
}

final class LoggingTests: XCTestCase {
    func testLevelFilteringSuppressesQuietRecords() {
        let sink = InMemoryLogSink()
        let logger = Logger()
        logger.add(sink: sink)
        logger.minimumLevel = .warning
        logger.debug("s", "hidden")
        logger.info("s", "hidden")
        logger.warning("s", "shown")
        logger.error("s", "shown too")
        XCTAssertEqual(sink.records.count, 2)
    }

    func testRingBufferHonoursLimit() {
        let sink = InMemoryLogSink(limit: 10)
        let logger = Logger()
        logger.minimumLevel = .trace
        logger.add(sink: sink)
        for i in 0..<50 { logger.info("s", "message \(i)") }
        XCTAssertEqual(sink.records.count, 10)
        XCTAssertEqual(sink.records.last?.message, "message 49")
    }

    func testFormattedRecordSortsMetadataDeterministically() {
        let record = LogRecord(timestamp: Date(timeIntervalSince1970: 0), level: .info, subsystem: "shell",
                               message: "ready", metadata: ["z": "1", "a": "2"], file: "f", line: 1)
        XCTAssertTrue(record.formatted.hasSuffix("a=2 z=1"))
        XCTAssertTrue(record.formatted.contains("[shell]"))
    }

    func testFileSinkWritesAndAppends() throws {
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("nexus-log-\(UUID().uuidString)/app.log")
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let sink = FileLogSink(url: url)
        let logger = Logger()
        logger.minimumLevel = .trace
        logger.add(sink: sink)
        logger.info("s", "first")
        logger.info("s", "second")
        let contents = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(contents.contains("first"))
        XCTAssertTrue(contents.contains("second"))
    }
}

final class JSONDocumentStoreTests: XCTestCase {
    private struct Doc: Codable, Equatable { var title: String; var count: Int }

    private func makeStore() throws -> JSONDocumentStore {
        let root = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("nexus-store-\(UUID().uuidString)")
        return try JSONDocumentStore(root: root)
    }

    func testWriteReadRoundTrip() throws {
        let store = try makeStore()
        defer { try? FileManager.default.removeItem(at: store.root) }
        try store.write(Doc(title: "a", count: 1), name: "doc")
        XCTAssertEqual(try store.read(Doc.self, name: "doc"), Doc(title: "a", count: 1))
    }

    func testEveryOverwriteLeavesARecoverableRevision() throws {
        let store = try makeStore()
        defer { try? FileManager.default.removeItem(at: store.root) }
        try store.write(Doc(title: "original", count: 1), name: "doc")
        try store.write(Doc(title: "changed", count: 2), name: "doc")
        let revisions = store.revisions(of: "doc")
        XCTAssertEqual(revisions.count, 1)
        try store.restore(name: "doc", from: revisions[0])
        XCTAssertEqual(try store.read(Doc.self, name: "doc").title, "original")
    }

    func testMissingDocumentGivesRecoverableError() throws {
        let store = try makeStore()
        defer { try? FileManager.default.removeItem(at: store.root) }
        XCTAssertNil(store.readIfPresent(Doc.self, name: "absent"))
        do { _ = try store.read(Doc.self, name: "absent"); XCTFail("expected throw") }
        catch let error as NexusError { XCTAssertEqual(error.domain, .notFound) }
    }

    func testCorruptFileProducesActionableError() throws {
        let store = try makeStore()
        defer { try? FileManager.default.removeItem(at: store.root) }
        try Data("{ not json".utf8).write(to: store.root.appendingPathComponent("broken.json"))
        do { _ = try store.read(Doc.self, name: "broken"); XCTFail("expected throw") }
        catch let error as NexusError {
            XCTAssertEqual(error.domain, .storage)
            XCTAssertTrue(error.recovery.contains("backup"))
        }
    }

    func testDeleteKeepsARevisionForUndo() throws {
        let store = try makeStore()
        defer { try? FileManager.default.removeItem(at: store.root) }
        try store.write(Doc(title: "a", count: 1), name: "doc")
        try store.delete("doc")
        XCTAssertFalse(store.exists("doc"))
        XCTAssertEqual(store.revisions(of: "doc").count, 1)
    }

    func testRevisionsAreCappedToAvoidUnboundedGrowth() throws {
        let root = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("nexus-store-\(UUID().uuidString)")
        let store = try JSONDocumentStore(root: root, maxRevisions: 3)
        defer { try? FileManager.default.removeItem(at: root) }
        for i in 0..<8 { try store.write(Doc(title: "v\(i)", count: i), name: "doc") }
        XCTAssertLessThanOrEqual(store.revisions(of: "doc").count, 3)
    }
}

final class MigrationTests: XCTestCase {
    private struct Config: Codable, SchemaVersioned, Equatable {
        static let currentSchemaVersion = 3
        var schemaVersion: Int
        var themeIdentifier: String
        var soundsEnabled: Bool
    }

    private var steps: [MigrationStep] {
        [
            MigrationStep(from: 1, to: 2, summary: "Renamed theme to themeIdentifier") { object in
                var o = object
                o["themeIdentifier"] = o.removeValue(forKey: "theme") ?? "nexusObsidian"
                return o
            },
            MigrationStep(from: 2, to: 3, summary: "Added soundsEnabled, defaulting to on") { object in
                var o = object
                if o["soundsEnabled"] == nil { o["soundsEnabled"] = true }
                return o
            },
        ]
    }

    func testMigratesThroughEveryStep() throws {
        let data = Data(#"{"schemaVersion":1,"theme":"arcaneGold"}"#.utf8)
        let (value, report) = try MigrationRunner(steps: steps).decode(Config.self, from: data)
        XCTAssertEqual(value.themeIdentifier, "arcaneGold")
        XCTAssertTrue(value.soundsEnabled)
        XCTAssertEqual(value.schemaVersion, 3)
        XCTAssertEqual(report.appliedSummaries.count, 2)
        XCTAssertTrue(report.didMigrate)
    }

    func testBackupTakenExactlyOnceBeforeAnyStep() throws {
        var backupCalls = 0
        let data = Data(#"{"schemaVersion":1,"theme":"clean"}"#.utf8)
        _ = try MigrationRunner(steps: steps).decode(Config.self, from: data, backup: {
            backupCalls += 1
            return URL(fileURLWithPath: "/tmp/backup.json")
        })
        XCTAssertEqual(backupCalls, 1)
    }

    func testNoBackupWhenAlreadyCurrent() throws {
        var backupCalls = 0
        let data = Data(#"{"schemaVersion":3,"themeIdentifier":"clean","soundsEnabled":false}"#.utf8)
        let (value, report) = try MigrationRunner(steps: steps).decode(Config.self, from: data, backup: {
            backupCalls += 1; return nil
        })
        XCTAssertEqual(backupCalls, 0)
        XCTAssertFalse(report.didMigrate)
        XCTAssertFalse(value.soundsEnabled)
    }

    func testRefusesFileFromNewerVersion() {
        let data = Data(#"{"schemaVersion":99}"#.utf8)
        XCTAssertThrowsError(try MigrationRunner(steps: steps).decode(Config.self, from: data)) { error in
            XCTAssertEqual((error as? NexusError)?.code, "newerSchema")
        }
    }

    func testMissingMigrationPathIsReportedNotGuessed() {
        let runner = MigrationRunner(steps: [steps[1]])   // 2→3 only
        let data = Data(#"{"schemaVersion":1,"theme":"x"}"#.utf8)
        XCTAssertThrowsError(try runner.decode(Config.self, from: data)) { error in
            XCTAssertEqual((error as? NexusError)?.code, "noPath")
        }
    }
}

final class DateProviderTests: XCTestCase {
    func testFixedProviderIsDeterministic() {
        let clock = FixedDateProvider(Date(timeIntervalSince1970: 1000))
        XCTAssertEqual(clock.now.timeIntervalSince1970, 1000)
        clock.advance(by: 60)
        XCTAssertEqual(clock.now.timeIntervalSince1970, 1060)
    }
}
