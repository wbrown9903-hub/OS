import XCTest
import AppCore
import SecurityCore
import BridgeProtocol
@testable import BridgeSecurity

// MARK: - Test rig

/// Builds a fully paired Bridge with a deterministic clock, so every security
/// property below is asserted against the real `BridgeGuard` pipeline rather than
/// against a stub.
final class BridgeFixture {
    let clock = FixedDateProvider(Date(timeIntervalSince1970: 1_800_000_000))
    let keys = InMemoryDeviceKeyStore()
    let pairing: PairingCoordinator
    let guardian: BridgeGuard
    let emergency = EmergencySwitch()
    let deviceKey: Data
    let deviceID = "device-1"
    let origin = "http://127.0.0.1:51234"
    private let counters = CounterSource()

    init(expectedPort: Int? = 51234) {
        pairing = PairingCoordinator(masterSecret: Data(repeating: 7, count: 32), keys: keys, dates: clock)
        let request = PairingRequest(deviceID: deviceID, deviceName: "This Mac",
                                     clientNonce: String(repeating: "ab", count: 32), requestedAt: clock.now)
        let (challenge, code) = try! pairing.begin(request)
        let result = try! pairing.complete(.make(code: code, challenge: challenge, request: request))
        deviceKey = Data(hexString: result.deviceKeyHex)!
        guardian = BridgeGuard(pairing: pairing, emergencySwitch: emergency,
                               origins: LoopbackOriginValidator(expectedPort: expectedPort),
                               ledger: NonceLedger(), dates: clock)
    }

    var signer: BridgeRequestSigner { BridgeRequestSigner(deviceID: deviceID, key: deviceKey, counters: counters) }

    func request(_ payload: BridgeActionPayload = .bridgeStatus(BridgeStatusParameters()),
                 origin requestOrigin: ContentOrigin = .user,
                 requestID: String = UUID().uuidString) throws -> SignedBridgeRequest {
        try signer.sign(payload: payload, origin: origin, requestOrigin: requestOrigin,
                        now: clock.now, requestID: requestID)
    }

    /// A request built by hand so a single field can be poisoned before signing.
    func signed(envelope: BridgeRequestEnvelope, key: Data? = nil,
                transportOrigin: String? = nil) throws -> SignedBridgeRequest {
        let body = try BridgeRequestDecoder.encode(envelope)
        return SignedBridgeRequest(body: body,
                                   signature: BridgeSignature.sign(body: body, key: key ?? deviceKey),
                                   deviceID: envelope.deviceID,
                                   transportOrigin: transportOrigin ?? origin)
    }

    func envelope(_ payload: BridgeActionPayload = .bridgeStatus(BridgeStatusParameters()),
                  counter: UInt64, issuedAt: Date? = nil, origin claimedOrigin: String? = nil,
                  requestID: String = UUID().uuidString) -> BridgeRequestEnvelope {
        BridgeRequestEnvelope(requestID: requestID, deviceID: deviceID, counter: counter,
                              issuedAt: issuedAt ?? clock.now, origin: claimedOrigin ?? origin,
                              requestOrigin: .user, payload: payload)
    }
}

func assertRefused(_ expression: @autoclosure () throws -> Any, code: String,
                   file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertThrowsError(try expression(), file: file, line: line) { error in
        let nexus = error as? NexusError
        XCTAssertEqual(nexus?.code, code, "wrong refusal reason", file: file, line: line)
        XCTAssertFalse(nexus?.message.isEmpty ?? true, "refusal has no message", file: file, line: line)
        XCTAssertFalse(nexus?.recovery.isEmpty ?? true, "refusal has no next step", file: file, line: line)
    }
}

// MARK: - Signing

final class RequestSigningTests: XCTestCase {
    func testAGenuineRequestIsAdmitted() throws {
        let fixture = BridgeFixture()
        let admitted = try fixture.guardian.admit(try fixture.request())
        XCTAssertEqual(admitted.action, .bridgeStatus)
        XCTAssertEqual(admitted.device.deviceID, "device-1")
    }

    func testSignatureIsStableAndKeyDependent() {
        let body = Data("hello".utf8)
        let a = BridgeSignature.sign(body: body, key: Data("key-a".utf8))
        let b = BridgeSignature.sign(body: body, key: Data("key-b".utf8))
        XCTAssertEqual(a, BridgeSignature.sign(body: body, key: Data("key-a".utf8)))
        XCTAssertNotEqual(a, b)
        XCTAssertEqual(a.count, 64)
        XCTAssertTrue(BridgeSignature.verify(body: body, signature: a, key: Data("key-a".utf8)))
        XCTAssertFalse(BridgeSignature.verify(body: body, signature: a, key: Data("key-b".utf8)))
    }

    /// Forgery: an attacker who does not hold the device key cannot produce an
    /// acceptable signature, whatever key they guess.
    func testForgedSignatureIsRejected() throws {
        let fixture = BridgeFixture()
        let envelope = fixture.envelope(counter: 1)
        let forged = try fixture.signed(envelope: envelope, key: Data("attacker-guessed-key".utf8))
        assertRefused(try fixture.guardian.admit(forged), code: "signatureInvalid")
    }

    /// Tampering: the signature covers the exact bytes, so changing one field of
    /// a captured request invalidates it.
    func testTamperedBodyIsRejected() throws {
        let fixture = BridgeFixture()
        let genuine = try fixture.request(.openURL(OpenURLParameters(url: "https://example.com")))
        let poisoned = String(data: genuine.body, encoding: .utf8)!
            .replacingOccurrences(of: "https://example.com", with: "https://evil.example")
        assertRefused(try fixture.guardian.admit(genuine.tampered(replacingBodyWith: Data(poisoned.utf8))),
                      code: "signatureInvalid")
    }

    func testMalformedSignatureLooksExactlyLikeAWrongOne() throws {
        let fixture = BridgeFixture()
        let genuine = try fixture.request()
        for bad in ["", "zz", "not-hex-at-all", String(repeating: "0", count: 63),
                    String(repeating: "0", count: 64), String(repeating: "gg", count: 32)] {
            let request = SignedBridgeRequest(body: genuine.body, signature: bad,
                                              deviceID: genuine.deviceID, transportOrigin: genuine.transportOrigin)
            assertRefused(try fixture.guardian.admit(request), code: "signatureInvalid")
        }
    }

    /// A body signed for device A cannot be presented as coming from device B,
    /// even when B's key is the one used.
    func testDeviceIdentityInTheBodyMustMatchTheSigningKey() throws {
        let fixture = BridgeFixture()
        var envelope = fixture.envelope(counter: 1)
        envelope.deviceID = "someone-else"
        let request = try fixture.signed(envelope: envelope)
        // Presented under the real device id, so our key is used and verifies,
        // but the body names a different device.
        let mismatched = SignedBridgeRequest(body: request.body, signature: request.signature,
                                             deviceID: fixture.deviceID, transportOrigin: fixture.origin)
        assertRefused(try fixture.guardian.admit(mismatched), code: "deviceMismatch")
    }

    func testUnknownDeviceIsRejectedWithoutRevealingWhetherTheSignatureWasValid() throws {
        let fixture = BridgeFixture()
        let genuine = try fixture.request()
        let request = SignedBridgeRequest(body: genuine.body, signature: genuine.signature,
                                          deviceID: "never-paired", transportOrigin: fixture.origin)
        assertRefused(try fixture.guardian.admit(request), code: "unknownDevice")
    }

    func testRevokedDeviceIsRejected() throws {
        let fixture = BridgeFixture()
        let request = try fixture.request()
        fixture.pairing.revoke(deviceID: fixture.deviceID)
        assertRefused(try fixture.guardian.admit(request), code: "revokedDevice")
    }

    /// A rejected request must not consume a counter value, or an attacker could
    /// lock the real client out by flooding forgeries.
    func testARejectedRequestDoesNotBurnACounterValue() throws {
        let fixture = BridgeFixture()
        let envelope = fixture.envelope(counter: 1)
        let forged = try fixture.signed(envelope: envelope, key: Data("wrong".utf8))
        assertRefused(try fixture.guardian.admit(forged), code: "signatureInvalid")
        XCTAssertEqual(fixture.guardian.ledger.highestAccepted(for: fixture.deviceID), 0)
        // The genuine client, still at counter 1, is admitted.
        XCTAssertNoThrow(try fixture.guardian.admit(try fixture.signed(envelope: envelope)))
    }
}

// MARK: - Replay and freshness

final class ReplayAndFreshnessTests: XCTestCase {
    func testTheSameRequestCannotBeSentTwice() throws {
        let fixture = BridgeFixture()
        let request = try fixture.request()
        XCTAssertNoThrow(try fixture.guardian.admit(request))
        assertRefused(try fixture.guardian.admit(request), code: "replayedRequest")
    }

    func testAnOlderCounterIsRejectedEvenWithAFreshRequestIdentifier() throws {
        let fixture = BridgeFixture()
        XCTAssertNoThrow(try fixture.guardian.admit(try fixture.signed(envelope: fixture.envelope(counter: 5))))
        assertRefused(try fixture.guardian.admit(try fixture.signed(envelope: fixture.envelope(counter: 4))),
                      code: "replayedRequest")
        assertRefused(try fixture.guardian.admit(try fixture.signed(envelope: fixture.envelope(counter: 5))),
                      code: "replayedRequest")
        XCTAssertNoThrow(try fixture.guardian.admit(try fixture.signed(envelope: fixture.envelope(counter: 6))))
    }

    func testAReusedRequestIdentifierIsRejectedEvenWithAHigherCounter() throws {
        let fixture = BridgeFixture()
        let id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        XCTAssertNoThrow(try fixture.guardian.admit(
            try fixture.signed(envelope: fixture.envelope(counter: 1, requestID: id))))
        assertRefused(try fixture.guardian.admit(
            try fixture.signed(envelope: fixture.envelope(counter: 2, requestID: id))),
                      code: "duplicateRequest")
    }

    func testAnAbsurdCounterJumpIsRejected() throws {
        let fixture = BridgeFixture()
        assertRefused(try fixture.guardian.admit(
            try fixture.signed(envelope: fixture.envelope(counter: UInt64.max))),
                      code: "counterJump")
    }

    func testACounterRestoredAfterRestartStillBlocksReplay() throws {
        let fixture = BridgeFixture()
        fixture.guardian.ledger.restore(deviceID: fixture.deviceID, counter: 100)
        assertRefused(try fixture.guardian.admit(try fixture.signed(envelope: fixture.envelope(counter: 99))),
                      code: "replayedRequest")
        XCTAssertNoThrow(try fixture.guardian.admit(try fixture.signed(envelope: fixture.envelope(counter: 101))))
    }

    func testStaleRequestIsRejected() throws {
        let fixture = BridgeFixture()
        let envelope = fixture.envelope(counter: 1, issuedAt: fixture.clock.now)
        let request = try fixture.signed(envelope: envelope)
        fixture.clock.advance(by: 31)
        assertRefused(try fixture.guardian.admit(request), code: "staleRequest")
    }

    func testARequestJustInsideTheWindowIsStillAccepted() throws {
        let fixture = BridgeFixture()
        let request = try fixture.signed(envelope: fixture.envelope(counter: 1, issuedAt: fixture.clock.now))
        fixture.clock.advance(by: 29)
        XCTAssertNoThrow(try fixture.guardian.admit(request))
    }

    func testARequestFromTheFutureIsRejected() throws {
        let fixture = BridgeFixture()
        let future = fixture.clock.now.addingTimeInterval(600)
        assertRefused(try fixture.guardian.admit(
            try fixture.signed(envelope: fixture.envelope(counter: 1, issuedAt: future))),
                      code: "futureRequest")
    }

    func testSmallClockSkewAheadIsTolerated() throws {
        let fixture = BridgeFixture()
        let slightlyAhead = fixture.clock.now.addingTimeInterval(3)
        XCTAssertNoThrow(try fixture.guardian.admit(
            try fixture.signed(envelope: fixture.envelope(counter: 1, issuedAt: slightlyAhead))))
    }
}

// MARK: - Origin

final class LoopbackOriginTests: XCTestCase {
    let validator = LoopbackOriginValidator()

    func testLoopbackFormsAreAccepted() {
        for origin in ["http://127.0.0.1:51234", "http://localhost:51234", "http://[::1]:51234",
                       "https://127.0.0.1:8443", "127.0.0.1", "::1", "localhost"] {
            XCTAssertTrue(validator.isLoopback(origin), "\(origin) should be loopback")
        }
    }

    func testNonLoopbackOriginsAreRejected() {
        let hostile = [
            "http://192.168.1.10:51234",        // LAN
            "http://10.0.0.5:51234",            // private
            "https://nexus.example.com",        // remote site
            "http://0.0.0.0:51234",             // wildcard bind, not loopback
            "http://169.254.169.254/",          // cloud metadata
            "http://127.0.0.1.evil.example",    // prefix trick
            "http://evil.example#127.0.0.1",    // fragment trick
            "http://localhost.evil.example",    // suffix trick
            "http://127.0.0.1@evil.example",    // credentials trick
            "http://user:pass@127.0.0.1:51234", // embedded credentials
            "file:///etc/passwd",               // not http
            "ws://127.0.0.1:51234",             // wrong scheme
            "null",                             // what a sandboxed frame sends
            "",                                 // absent
            "http://127.0.0.2:51234",           // loopback subnet, not the bound address
            "http://[::ffff:127.0.0.1]:51234",  // IPv4-mapped form
        ]
        for origin in hostile {
            XCTAssertFalse(validator.isLoopback(origin), "\(origin) must not be accepted")
            assertRefused(try validator.validate(origin), code: "originNotLoopback")
        }
    }

    func testPortMustMatchWhenTheBridgeKnowsIt() {
        let bound = LoopbackOriginValidator(expectedPort: 51234)
        XCTAssertTrue(bound.isLoopback("http://127.0.0.1:51234"))
        XCTAssertFalse(bound.isLoopback("http://127.0.0.1:51235"))
        XCTAssertFalse(bound.isLoopback("http://127.0.0.1"))
    }

    func testAClaimedOriginThatDisagreesWithTheObservedOneIsRejected() throws {
        assertRefused(try validator.validate(transportOrigin: "http://127.0.0.1:51234",
                                             claimedOrigin: "http://127.0.0.1:9999"),
                      code: "originNotLoopback")
        XCTAssertNoThrow(try validator.validate(transportOrigin: "http://127.0.0.1:51234",
                                                claimedOrigin: "http://localhost:51234"))
    }

    func testTheGuardRefusesARequestArrivingFromOffMachine() throws {
        let fixture = BridgeFixture()
        let request = try fixture.request()
        assertRefused(try fixture.guardian.admit(request.arriving(from: "http://192.168.1.20:51234")),
                      code: "originNotLoopback")
    }

    func testTheGuardRefusesARequestWhoseBodyLiesAboutItsOrigin() throws {
        let fixture = BridgeFixture()
        let envelope = fixture.envelope(counter: 1, origin: "http://127.0.0.1:9999")
        assertRefused(try fixture.guardian.admit(try fixture.signed(envelope: envelope)),
                      code: "originNotLoopback")
    }
}

// MARK: - Emergency switch

final class EmergencySwitchTests: XCTestCase {
    func testEngagingStopsEveryActionExceptReadingTheStatus() throws {
        let fixture = BridgeFixture()
        fixture.emergency.engage(reason: "You chose Pause Nexus.", at: fixture.clock.now)

        // Status still answers, so the menu bar can explain what is going on.
        XCTAssertNoThrow(try fixture.guardian.admit(try fixture.request(.bridgeStatus(BridgeStatusParameters()))))

        // Everything else is refused.
        for payload in NonStatusPayloads.all {
            assertRefused(try fixture.guardian.admit(try fixture.request(payload)), code: "bridgePaused")
        }
    }

    func testTotalBlackoutRefusesEvenTheStatusAction() throws {
        let fixture = BridgeFixture()
        fixture.emergency.allowsStatusWhileDisabled = false
        fixture.emergency.engage(reason: "Something looked wrong.", at: fixture.clock.now)
        assertRefused(try fixture.guardian.admit(try fixture.request()), code: "bridgePaused")
    }

    func testTheRefusalNamesTheReasonAndHowToResume() {
        let switchUnderTest = EmergencySwitch()
        switchUnderTest.engage(reason: "You chose Pause Nexus.")
        XCTAssertThrowsError(try switchUnderTest.check(.launchApplication)) { error in
            let nexus = error as? NexusError
            XCTAssertEqual(nexus?.code, "bridgePaused")
            XCTAssertTrue(nexus?.message.contains("You chose Pause Nexus.") == true)
            XCTAssertTrue(nexus?.recovery.contains("Resume Nexus") == true)
        }
    }

    func testReleasingRestoresNormalService() throws {
        let fixture = BridgeFixture()
        fixture.emergency.engage(reason: "Paused.", at: fixture.clock.now)
        assertRefused(try fixture.guardian.admit(try fixture.request(.openURL(OpenURLParameters(url: "https://a.example")))),
                      code: "bridgePaused")
        fixture.emergency.release()
        XCTAssertFalse(fixture.emergency.isEngaged)
        XCTAssertNoThrow(try fixture.guardian.admit(
            try fixture.request(.openURL(OpenURLParameters(url: "https://a.example")))))
    }

    func testTheFirstReasonIsKeptSoAnAutomaticTripCannotOverwriteTheUsers() {
        let switchUnderTest = EmergencySwitch()
        switchUnderTest.engage(reason: "You chose Pause Nexus.")
        switchUnderTest.engage(reason: "Automatic trip.")
        XCTAssertEqual(switchUnderTest.current.reason, "You chose Pause Nexus.")
    }

    func testPausingIsCheckedBeforeAnythingElseIsSpent() throws {
        // With the status carve-out off, a paused Bridge refuses even a request
        // whose signature is invalid — it never gets as far as checking.
        let fixture = BridgeFixture()
        fixture.emergency.allowsStatusWhileDisabled = false
        fixture.emergency.engage(reason: "Paused.", at: fixture.clock.now)
        let forged = try fixture.signed(envelope: fixture.envelope(counter: 1), key: Data("wrong".utf8))
        assertRefused(try fixture.guardian.admit(forged), code: "bridgePaused")
    }
}

// MARK: - Pairing

final class PairingTests: XCTestCase {
    private func makeRequest(_ coordinator: PairingCoordinator, now: Date) -> PairingRequest {
        PairingRequest(deviceID: "mac-mini", deviceName: "Studio Mac",
                       clientNonce: String(repeating: "cd", count: 32), requestedAt: now)
    }

    func testHappyPathDerivesTheSameKeyOnBothSides() throws {
        let clock = FixedDateProvider(Date(timeIntervalSince1970: 1_800_000_000))
        let secret = PairingCoordinator.newMasterSecret()
        let coordinator = PairingCoordinator(masterSecret: secret, keys: InMemoryDeviceKeyStore(), dates: clock)
        let request = makeRequest(coordinator, now: clock.now)
        let (challenge, code) = try coordinator.begin(request)

        XCTAssertEqual(code.count, 6)
        XCTAssertTrue(code.allSatisfy(\.isNumber))
        XCTAssertEqual(challenge.serverNonce.count, 64)

        let result = try coordinator.complete(.make(code: code, challenge: challenge, request: request))
        let expected = PairingCoordinator.deriveKey(masterSecret: secret, deviceID: request.deviceID,
                                                    clientNonce: request.clientNonce,
                                                    serverNonce: challenge.serverNonce)
        XCTAssertEqual(result.deviceKeyHex, expected.hexString)
        XCTAssertEqual(result.keyFingerprint.count, 16)
        XCTAssertEqual(coordinator.pairedDevices.count, 1)
        XCTAssertEqual(try coordinator.key(for: request.deviceID), expected)
    }

    func testTheCodeIsNeverSentToTheClient() throws {
        let clock = FixedDateProvider(Date(timeIntervalSince1970: 1_800_000_000))
        let coordinator = PairingCoordinator(masterSecret: Data(repeating: 1, count: 32),
                                             keys: InMemoryDeviceKeyStore(), dates: clock)
        let request = makeRequest(coordinator, now: clock.now)
        let (challenge, code) = try coordinator.begin(request)
        let encoded = try XCTUnwrap(String(data: NexusJSON.encode(challenge), encoding: .utf8))
        XCTAssertFalse(encoded.contains(code), "the pairing code must stay on the Mac's screen")
    }

    func testTwoDevicesGetDifferentKeys() throws {
        let clock = FixedDateProvider(Date(timeIntervalSince1970: 1_800_000_000))
        let coordinator = PairingCoordinator(masterSecret: Data(repeating: 2, count: 32),
                                             keys: InMemoryDeviceKeyStore(), dates: clock)
        var keys: Set<String> = []
        for name in ["a", "b"] {
            let request = PairingRequest(deviceID: name, deviceName: name,
                                         clientNonce: String(repeating: "ef", count: 32), requestedAt: clock.now)
            let (challenge, code) = try coordinator.begin(request)
            keys.insert(try coordinator.complete(.make(code: code, challenge: challenge, request: request)).deviceKeyHex)
        }
        XCTAssertEqual(keys.count, 2)
    }

    func testWrongCodeIsRefused() throws {
        let clock = FixedDateProvider(Date(timeIntervalSince1970: 1_800_000_000))
        let coordinator = PairingCoordinator(masterSecret: Data(repeating: 3, count: 32),
                                             keys: InMemoryDeviceKeyStore(), dates: clock)
        let request = makeRequest(coordinator, now: clock.now)
        let (challenge, code) = try coordinator.begin(request)
        let wrong = code == "000000" ? "111111" : "000000"
        assertRefused(try coordinator.complete(.make(code: wrong, challenge: challenge, request: request)),
                      code: "pairingCodeWrong")
        XCTAssertTrue(coordinator.pairedDevices.isEmpty)
    }

    func testGuessingIsLimited() throws {
        let clock = FixedDateProvider(Date(timeIntervalSince1970: 1_800_000_000))
        let coordinator = PairingCoordinator(masterSecret: Data(repeating: 4, count: 32),
                                             keys: InMemoryDeviceKeyStore(), dates: clock)
        let request = makeRequest(coordinator, now: clock.now)
        let (challenge, code) = try coordinator.begin(request)
        let wrong = code == "000000" ? "111111" : "000000"
        for _ in 0..<PairingCoordinator.maximumAttempts {
            assertRefused(try coordinator.complete(.make(code: wrong, challenge: challenge, request: request)),
                          code: "pairingCodeWrong")
        }
        assertRefused(try coordinator.complete(.make(code: code, challenge: challenge, request: request)),
                      code: "pairingAttempts")
    }

    func testAnExpiredChallengeIsRefused() throws {
        let clock = FixedDateProvider(Date(timeIntervalSince1970: 1_800_000_000))
        let coordinator = PairingCoordinator(masterSecret: Data(repeating: 5, count: 32),
                                             keys: InMemoryDeviceKeyStore(), dates: clock)
        let request = makeRequest(coordinator, now: clock.now)
        let (challenge, code) = try coordinator.begin(request)
        clock.advance(by: PairingCoordinator.challengeLifetime + 1)
        assertRefused(try coordinator.complete(.make(code: code, challenge: challenge, request: request)),
                      code: "pairingExpired")
    }

    func testAProofFromADifferentDeviceIsRefused() throws {
        let clock = FixedDateProvider(Date(timeIntervalSince1970: 1_800_000_000))
        let coordinator = PairingCoordinator(masterSecret: Data(repeating: 6, count: 32),
                                             keys: InMemoryDeviceKeyStore(), dates: clock)
        let request = makeRequest(coordinator, now: clock.now)
        let (challenge, code) = try coordinator.begin(request)
        var confirmation = PairingConfirmation.make(code: code, challenge: challenge, request: request)
        confirmation.deviceID = "someone-else"
        assertRefused(try coordinator.complete(confirmation), code: "pairingUnknown")
    }

    func testAnUnknownChallengeIsRefused() throws {
        let coordinator = PairingCoordinator(masterSecret: Data(repeating: 8, count: 32),
                                             keys: InMemoryDeviceKeyStore())
        assertRefused(try coordinator.complete(
            PairingConfirmation(challengeID: "nope", deviceID: "x", proof: "00")), code: "pairingUnknown")
    }

    func testARequestWithoutARealNonceIsRefused() throws {
        let coordinator = PairingCoordinator(masterSecret: Data(repeating: 9, count: 32),
                                             keys: InMemoryDeviceKeyStore())
        assertRefused(try coordinator.begin(PairingRequest(deviceID: "x", deviceName: "x",
                                                           clientNonce: "short", requestedAt: Date())),
                      code: "badNonce")
    }

    func testRevokingEveryDeviceRemovesEveryKey() throws {
        let fixture = BridgeFixture()
        fixture.pairing.revokeAll()
        XCTAssertThrowsError(try fixture.keys.key(for: fixture.deviceID))
        assertRefused(try fixture.guardian.admit(try fixture.request()), code: "revokedDevice")
    }

    func testTheProofBindsTheCodeToBothNoncesAndTheDevice() {
        let a = PairingConfirmation.proof(code: "123456", clientNonce: "aa", serverNonce: "bb", deviceID: "d")
        XCTAssertNotEqual(a, PairingConfirmation.proof(code: "123457", clientNonce: "aa", serverNonce: "bb", deviceID: "d"))
        XCTAssertNotEqual(a, PairingConfirmation.proof(code: "123456", clientNonce: "ac", serverNonce: "bb", deviceID: "d"))
        XCTAssertNotEqual(a, PairingConfirmation.proof(code: "123456", clientNonce: "aa", serverNonce: "bc", deviceID: "d"))
        XCTAssertNotEqual(a, PairingConfirmation.proof(code: "123456", clientNonce: "aa", serverNonce: "bb", deviceID: "e"))
    }
}

// MARK: - Unknown actions reaching the guard

final class UnknownActionAtTheGuardTests: XCTestCase {
    func testAProperlySignedUnknownActionIsStillRefused() throws {
        // The attacker in this test *has* the device key — they are the web layer
        // asking for something the Bridge does not implement. It is still refused.
        let fixture = BridgeFixture()
        let json = """
        {"action":"runShellCommand","counter":1,"deviceID":"device-1","issuedAt":"2027-01-15T14:40:00Z",\
        "origin":"http://127.0.0.1:51234","payload":{"action":"runShellCommand","parameters":{}},\
        "requestID":"abc-1","requestOrigin":"user","version":"nexus-bridge/1"}
        """
        let body = Data(json.utf8)
        let request = SignedBridgeRequest(body: body,
                                          signature: BridgeSignature.sign(body: body, key: fixture.deviceKey),
                                          deviceID: fixture.deviceID, transportOrigin: fixture.origin)
        assertRefused(try fixture.guardian.admit(request), code: "unknownAction")
    }

    func testAnOversizedBodyIsRefusedBeforeTheSignatureIsChecked() throws {
        let fixture = BridgeFixture()
        let body = Data(repeating: 0x20, count: BridgeLimits.maximumBodyBytes + 1)
        let request = SignedBridgeRequest(body: body, signature: String(repeating: "0", count: 64),
                                          deviceID: fixture.deviceID, transportOrigin: fixture.origin)
        assertRefused(try fixture.guardian.admit(request), code: "bodyTooLarge")
    }
}

enum NonStatusPayloads {
    static let all: [BridgeActionPayload] = [
        .launchApplication(LaunchApplicationParameters(applicationID: "safari")),
        .openURL(OpenURLParameters(url: "https://example.com")),
        .openFile(OpenFileParameters(path: "/tmp/a.txt")),
        .openFolder(OpenFolderParameters(path: "/tmp")),
        .focusApplication(FocusApplicationParameters(applicationID: "safari")),
        .quitApplication(QuitApplicationParameters(applicationID: "safari")),
        .moveWindow(MoveWindowParameters(target: WindowTarget(applicationID: "safari"), x: 0, y: 0)),
        .resizeWindow(ResizeWindowParameters(target: WindowTarget(applicationID: "safari"), width: 800, height: 600)),
        .tileWindows(TileWindowsParameters(layout: .halvesLeftRight,
                                           targets: [WindowTarget(applicationID: "safari"),
                                                     WindowTarget(applicationID: "vscode")])),
        .restoreWorkspace(RestoreWorkspaceParameters(workspaceID: "w", workspaceName: "W",
                                                     applicationIDs: ["safari"], placements: [])),
        .showNotification(ShowNotificationParameters(title: "T", body: "B")),
        .copyApprovedText(CopyApprovedTextParameters(text: "x", label: "L")),
        .runApprovedShortcut(RunApprovedShortcutParameters(shortcutName: "S")),
        .invokeApprovedMCPServer(InvokeApprovedMCPServerParameters(serverID: "s", toolName: "t")),
        .detectApplications(DetectApplicationsParameters()),
    ]
}
