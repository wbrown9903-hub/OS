import XCTest
import AppCore
import SecurityCore
@testable import BridgeProtocol

// MARK: - The action set is closed, and stays closed

final class ClosedActionSetTests: XCTestCase {
    /// If this test fails, someone added or renamed an action. That is a change to
    /// the Bridge's security surface and must be reviewed deliberately.
    func testActionSetIsExactlyTheDocumentedSixteen() {
        let expected: Set<String> = [
            "launchApplication", "openURL", "openFile", "openFolder", "focusApplication",
            "quitApplication", "moveWindow", "resizeWindow", "tileWindows", "restoreWorkspace",
            "showNotification", "copyApprovedText", "runApprovedShortcut",
            "invokeApprovedMCPServer", "detectApplications", "bridgeStatus",
        ]
        XCTAssertEqual(Set(BridgeAction.allCases.map(\.rawValue)), expected)
        XCTAssertEqual(BridgeAction.allCases.count, 16)
    }

    /// There is deliberately no shell, exec, AppleScript or "run command" action.
    func testNoExecutionActionExists() {
        let forbidden = ["shell", "exec", "command", "applescript", "osascript",
                         "terminal", "spawn", "eval", "bash", "zsh", "system", "sudo",
                         "install", "delete", "write", "upload"]
        for action in BridgeAction.allCases {
            let name = action.rawValue.lowercased()
            for word in forbidden {
                XCTAssertFalse(name.contains(word), "\(action.rawValue) looks like an execution primitive")
            }
        }
        // "script" appears only inside "runApprovedShortcut"? No — it does not
        // appear at all. Assert that explicitly so a future `runScript` is caught.
        XCTAssertTrue(BridgeAction.allCases.allSatisfy { !$0.rawValue.lowercased().contains("script") })
        // `runApprovedShortcut` is the only action beginning with "run", and it
        // takes a *name from an allow-list*, not anything executable.
        let runners = BridgeAction.allCases.filter { $0.rawValue.lowercased().hasPrefix("run") }
        XCTAssertEqual(runners, [.runApprovedShortcut])
    }

    func testNoParameterAcceptsACommandLine() throws {
        // Encode one instance of every payload and assert no key on the wire is
        // named like an execution parameter.
        let forbiddenKeys = ["command", "args", "argv", "arguments", "script", "shell",
                             "executable", "environment", "env", "cwd", "workingdirectory", "interpreter"]
        for payload in SamplePayloads.all {
            let data = try NexusJSON.encode(payload)
            let json = try XCTUnwrap(String(data: data, encoding: .utf8)).lowercased()
            for key in forbiddenKeys {
                XCTAssertFalse(json.contains("\"\(key)\""),
                               "\(payload.action.rawValue) exposes a “\(key)” parameter")
            }
        }
    }

    func testDocumentationExplainsTheAbsenceOfShellAccess() {
        let text = BridgeProtocolDocumentation.noShellAccessRationale.lowercased()
        XCTAssertTrue(text.contains("no shell"))
        XCTAssertTrue(text.contains("never accepts"))
        XCTAssertFalse(BridgeProtocolDocumentation.originRule.isEmpty)
        XCTAssertFalse(BridgeProtocolDocumentation.signingRule.isEmpty)
    }

    func testEveryActionCarriesImpactSummaryAndExplanation() {
        for action in BridgeAction.allCases {
            XCTAssertFalse(action.title.isEmpty, "\(action) has no title")
            XCTAssertFalse(action.explanation.isEmpty, "\(action) has no explanation")
            XCTAssertFalse(action.dataAccess.isEmpty, "\(action) does not say what it can reach")
            XCTAssertEqual(action.toolIdentifier, "bridge.\(action.rawValue)")
            XCTAssertFalse(action.baselineImpact.label.isEmpty)
        }
    }

    func testReadOnlyActionsAreTheOnlyOnesMarkedRead() {
        let readOnly = BridgeAction.allCases.filter { $0.baselineImpact == .read }
        XCTAssertEqual(Set(readOnly), [.detectApplications, .bridgeStatus])
    }

    func testQuittingIsTreatedAsIrreversible() {
        XCTAssertEqual(BridgeAction.quitApplication.baselineImpact, .destructive)
    }

    func testUnknownActionNameProducesAReadableError() {
        XCTAssertThrowsError(try BridgeAction.decode(name: "runShellCommand")) { error in
            let nexus = error as? NexusError
            XCTAssertEqual(nexus?.code, "unknownAction")
            XCTAssertEqual(nexus?.domain, .security)
            XCTAssertTrue(nexus?.message.contains("runShellCommand") == true)
            XCTAssertFalse(nexus?.recovery.isEmpty ?? true)
        }
    }
}

// MARK: - Wire format

final class BridgeEnvelopeCodingTests: XCTestCase {
    func testEveryPayloadRoundTrips() throws {
        for payload in SamplePayloads.all {
            let data = try NexusJSON.encode(payload)
            let decoded = try NexusJSON.decoder.decode(BridgeActionPayload.self, from: data)
            XCTAssertEqual(decoded, payload, "\(payload.action.rawValue) did not round-trip")
            XCTAssertEqual(decoded.action, payload.action)
            XCTAssertFalse(decoded.summary.isEmpty)
        }
    }

    func testEnvelopeRoundTrips() throws {
        let envelope = SamplePayloads.envelope(for: .openURL(OpenURLParameters(url: "https://example.com")))
        let data = try BridgeRequestDecoder.encode(envelope)
        let decoded = try BridgeRequestDecoder.decodeEnvelope(data)
        XCTAssertEqual(decoded, envelope)
    }

    func testUnknownActionInABodyIsRefusedBeforeParametersAreRead() throws {
        let json = """
        {"action":"runShellCommand","counter":1,"deviceID":"d1","issuedAt":"2026-01-01T00:00:00Z",\
        "origin":"http://127.0.0.1:8080","payload":{"action":"runShellCommand","parameters":{"command":"rm -rf /"}},\
        "requestID":"abc","requestOrigin":"user","version":"nexus-bridge/1"}
        """
        XCTAssertThrowsError(try BridgeRequestDecoder.decodeEnvelope(Data(json.utf8))) { error in
            XCTAssertEqual((error as? NexusError)?.code, "unknownAction")
        }
    }

    func testActionAndPayloadMustAgree() throws {
        // A caller tries to get the low-impact "openURL" confirmed while carrying
        // a "quitApplication" payload underneath.
        let json = """
        {"action":"openURL","counter":1,"deviceID":"d1","issuedAt":"2026-01-01T00:00:00Z",\
        "origin":"http://127.0.0.1:8080",\
        "payload":{"action":"quitApplication","parameters":{"applicationID":"finder","saveChangesPrompt":true}},\
        "requestID":"abc","requestOrigin":"user","version":"nexus-bridge/1"}
        """
        XCTAssertThrowsError(try BridgeRequestDecoder.decodeEnvelope(Data(json.utf8))) { error in
            XCTAssertEqual((error as? NexusError)?.code, "actionMismatch")
        }
    }

    func testProtocolVersionMismatchIsRefusedWithAnUpdateMessage() throws {
        var envelope = SamplePayloads.envelope(for: .bridgeStatus(BridgeStatusParameters()))
        envelope.version = "nexus-bridge/99"
        let data = try BridgeRequestDecoder.encode(envelope)
        XCTAssertThrowsError(try BridgeRequestDecoder.decodeEnvelope(data)) { error in
            let nexus = error as? NexusError
            XCTAssertEqual(nexus?.code, "protocolVersion")
            XCTAssertTrue(nexus?.recovery.contains("Update Nexus OS") == true)
        }
    }

    func testOversizedBodyIsRefusedWithoutParsing() {
        let big = Data(repeating: 0x7B, count: BridgeLimits.maximumBodyBytes + 1)
        XCTAssertThrowsError(try BridgeRequestDecoder.decodeEnvelope(big)) { error in
            XCTAssertEqual((error as? NexusError)?.code, "bodyTooLarge")
        }
    }

    func testGarbageBodyProducesAReadableError() {
        XCTAssertThrowsError(try BridgeRequestDecoder.decodeEnvelope(Data("not json".utf8))) { error in
            XCTAssertEqual((error as? NexusError)?.code, "unreadableRequest")
        }
    }

    func testMalformedRequestIDIsRefused() throws {
        var envelope = SamplePayloads.envelope(for: .bridgeStatus(BridgeStatusParameters()))
        envelope.requestID = ""
        let data = try BridgeRequestDecoder.encode(envelope)
        XCTAssertThrowsError(try BridgeRequestDecoder.decodeEnvelope(data)) { error in
            XCTAssertEqual((error as? NexusError)?.code, "badRequestID")
        }
    }
}

// MARK: - Parameter validation

final class ParameterValidationTests: XCTestCase {
    func testEmptyApplicationIdentifierIsRefused() {
        XCTAssertThrowsError(try LaunchApplicationParameters(applicationID: "   ").validated()) { error in
            XCTAssertEqual((error as? NexusError)?.code, "missing.application")
        }
    }

    func testControlCharactersInAnIdentifierAreRefused() {
        XCTAssertThrowsError(try FocusApplicationParameters(applicationID: "safari\u{0}evil").validated()) { error in
            XCTAssertEqual((error as? NexusError)?.domain, .security)
        }
    }

    func testNullByteInAPathIsRefused() {
        XCTAssertThrowsError(try OpenFileParameters(path: "/tmp/a\u{0}b").validated()) { error in
            XCTAssertEqual((error as? NexusError)?.code, "nullByte")
        }
    }

    func testWindowSizeMustBeFiniteAndSane() {
        let target = WindowTarget(applicationID: "safari")
        XCTAssertThrowsError(try ResizeWindowParameters(target: target, width: .nan, height: 100).validated())
        XCTAssertThrowsError(try ResizeWindowParameters(target: target, width: .infinity, height: 100).validated())
        XCTAssertThrowsError(try ResizeWindowParameters(target: target, width: 1, height: 100).validated())
        XCTAssertThrowsError(try ResizeWindowParameters(target: target, width: 1e9, height: 100).validated())
        XCTAssertNoThrow(try ResizeWindowParameters(target: target, width: 1200, height: 800).validated())
    }

    func testWindowPositionMustBeOnAPlausibleDesktop() {
        let target = WindowTarget(applicationID: "safari")
        XCTAssertThrowsError(try MoveWindowParameters(target: target, x: 1e12, y: 0).validated())
        XCTAssertNoThrow(try MoveWindowParameters(target: target, x: -100, y: 40).validated())
    }

    func testTileLayoutCapacityIsEnforced() {
        let targets = (0..<3).map { WindowTarget(applicationID: "safari", windowIndex: $0) }
        XCTAssertThrowsError(try TileWindowsParameters(layout: .halvesLeftRight, targets: targets).validated()) { error in
            XCTAssertEqual((error as? NexusError)?.code, "tooManyWindows")
        }
        XCTAssertNoThrow(try TileWindowsParameters(layout: .thirds, targets: targets).validated())
        XCTAssertThrowsError(try TileWindowsParameters(layout: .thirds, targets: []).validated())
    }

    func testNotificationLengthsAreCapped() {
        let longBody = String(repeating: "a", count: BridgeLimits.maximumNotificationBody + 1)
        XCTAssertThrowsError(try ShowNotificationParameters(title: "Hi", body: longBody).validated())
        XCTAssertThrowsError(try ShowNotificationParameters(title: "", body: "x").validated())
        XCTAssertNoThrow(try ShowNotificationParameters(title: "Hi", body: "Done").validated())
    }

    func testNotificationSoundIsAFixedSetNotAFilePath() {
        // The only sounds available are named constants; there is no path field.
        XCTAssertEqual(Set(ShowNotificationParameters.NotificationSound.allCases.map(\.rawValue)),
                       ["none", "defaultSound", "sale", "alert"])
    }

    func testClipboardTextIsCapped() {
        let huge = String(repeating: "x", count: BridgeLimits.maximumClipboardCharacters + 1)
        XCTAssertThrowsError(try CopyApprovedTextParameters(text: huge, label: "Order").validated())
    }

    func testMCPArgumentsMustBeAJSONObject() {
        XCTAssertThrowsError(try InvokeApprovedMCPServerParameters(
            serverID: "files", toolName: "read", argumentsJSON: "[1,2,3]").validated()) { error in
            XCTAssertEqual((error as? NexusError)?.code, "mcpArgumentsNotObject")
        }
        XCTAssertThrowsError(try InvokeApprovedMCPServerParameters(
            serverID: "files", toolName: "read", argumentsJSON: "not json").validated())
        XCTAssertNoThrow(try InvokeApprovedMCPServerParameters(
            serverID: "files", toolName: "read", argumentsJSON: #"{"path":"a.txt"}"#).validated())
    }

    func testWorkspaceRestoreIsBounded() {
        let many = (0..<20).map { "app\($0)" }
        XCTAssertThrowsError(try RestoreWorkspaceParameters(
            workspaceID: "w1", workspaceName: "Gaming", applicationIDs: many, placements: []).validated())
    }

    func testEverySampleSummaryIsAPlainSentence() throws {
        for payload in SamplePayloads.all {
            let summary = try payload.validated().summary
            XCTAssertFalse(summary.isEmpty, "\(payload.action.rawValue) has an empty summary")
            XCTAssertTrue(summary.hasSuffix("."), "\(payload.action.rawValue) summary is not a sentence: \(summary)")
        }
    }
}

// MARK: - Permission metadata

final class MacPermissionTests: XCTestCase {
    func testEveryPermissionHasAReasonADeepLinkAndADegradedBehaviour() throws {
        for permission in MacPermission.allCases {
            XCTAssertFalse(permission.title.isEmpty)
            XCTAssertFalse(permission.reason.isEmpty)
            XCTAssertFalse(permission.degradedBehaviour.isEmpty)
            let link = try XCTUnwrap(permission.settingsURLString)
            XCTAssertTrue(link.hasPrefix("x-apple.systempreferences:"), "\(permission) has a wrong deep link: \(link)")
        }
    }

    func testWindowActionsAreGatedByAccessibility() {
        XCTAssertEqual(Set(MacPermission.accessibility.gatedActions),
                       [.moveWindow, .resizeWindow, .tileWindows, .restoreWorkspace])
        XCTAssertEqual(MacPermission.notifications.gatedActions, [.showNotification])
    }

    func testFullDiskAccessIsNeverRequired() {
        XCTAssertTrue(MacPermission.fullDisk.gatedActions.isEmpty)
        XCTAssertTrue(MacPermission.fullDisk.reason.lowercased().contains("does not need"))
    }

    func testStatusReportRoundTrips() throws {
        let report = BridgeStatusReport(
            bridgeVersion: "1.0.0", isPaused: true, pauseReason: "You paused Nexus.",
            pairedDeviceCount: 1,
            permissions: [.init(permission: .accessibility, state: .denied,
                                nextStep: MacPermission.accessibility.degradedBehaviour)],
            loopbackPort: 51234, uptimeSeconds: 42)
        let data = try NexusJSON.encode(BridgeResponse(
            requestID: "r1", action: .bridgeStatus, status: .completed,
            summary: "Read the Bridge's status.", result: .status(report)))
        let decoded = try NexusJSON.decoder.decode(BridgeResponse.self, from: data)
        XCTAssertEqual(decoded.result, .status(report))
    }

    func testRefusedResponseAlwaysCarriesAMessageAndANextStep() throws {
        let error = NexusError.security("x", "Nope.", recovery: "Do this instead.")
        let response = BridgeResponse.refused(requestID: "r", action: .openURL, error: error)
        XCTAssertEqual(response.status, .refused)
        XCTAssertEqual(response.error?.recovery, "Do this instead.")
        XCTAssertEqual(response.summary, "Nope.")
    }
}

// MARK: - Fixtures

enum SamplePayloads {
    static let all: [BridgeActionPayload] = [
        .launchApplication(LaunchApplicationParameters(applicationID: "jagex-launcher")),
        .openURL(OpenURLParameters(url: "https://example.com/page")),
        .openFile(OpenFileParameters(path: "/tmp/notes.txt")),
        .openFolder(OpenFolderParameters(path: "/tmp", revealInFinder: true)),
        .focusApplication(FocusApplicationParameters(applicationID: "safari")),
        .quitApplication(QuitApplicationParameters(applicationID: "discord")),
        .moveWindow(MoveWindowParameters(target: WindowTarget(applicationID: "safari"), x: 20, y: 40)),
        .resizeWindow(ResizeWindowParameters(target: WindowTarget(applicationID: "safari"), width: 1200, height: 800)),
        .tileWindows(TileWindowsParameters(layout: .halvesLeftRight, targets: [
            WindowTarget(applicationID: "safari"), WindowTarget(applicationID: "vscode"),
        ])),
        .restoreWorkspace(RestoreWorkspaceParameters(
            workspaceID: "ws-gaming", workspaceName: "Gaming", applicationIDs: ["jagex-launcher"],
            placements: [WindowPlacement(target: WindowTarget(applicationID: "jagex-launcher"),
                                         x: 0, y: 0, width: 1280, height: 800)])),
        .showNotification(ShowNotificationParameters(title: "Workflow finished", body: "Daily backup completed.")),
        .copyApprovedText(CopyApprovedTextParameters(text: "ORDER-1234", label: "Order number")),
        .runApprovedShortcut(RunApprovedShortcutParameters(shortcutName: "Start Focus")),
        .invokeApprovedMCPServer(InvokeApprovedMCPServerParameters(
            serverID: "notes", toolName: "search", argumentsJSON: #"{"query":"runes"}"#)),
        .detectApplications(DetectApplicationsParameters(applicationIDs: ["runescape"])),
        .bridgeStatus(BridgeStatusParameters()),
    ]

    static func envelope(for payload: BridgeActionPayload,
                         origin: ContentOrigin = .user,
                         at date: Date = Date(timeIntervalSince1970: 1_800_000_000)) -> BridgeRequestEnvelope {
        BridgeRequestEnvelope(requestID: "11111111-2222-3333-4444-555555555555",
                              deviceID: "device-1", counter: 1, issuedAt: date,
                              origin: "http://127.0.0.1:51234", requestOrigin: origin, payload: payload)
    }
}
