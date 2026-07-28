import Foundation
import AppCore
import SecurityCore
import BridgeProtocol

/// Step 1. The client asks to be paired. Nothing is trusted yet; this only opens
/// a challenge and causes the Mac to display a code to the person sitting at it.
public struct PairingRequest: Codable, Sendable, Equatable {
    public var version: String
    public var deviceID: String
    public var deviceName: String
    /// 32 random bytes, hex. Contributed by the client so neither side alone
    /// determines the derived key.
    public var clientNonce: String
    public var requestedAt: Date

    public init(version: String = BridgeProtocolDocumentation.protocolVersion,
                deviceID: String, deviceName: String, clientNonce: String, requestedAt: Date) {
        self.version = version; self.deviceID = deviceID; self.deviceName = deviceName
        self.clientNonce = clientNonce; self.requestedAt = requestedAt
    }
}

/// Step 2. The Bridge's reply. The pairing code is **not** in here — it is shown
/// on the Mac's screen, so completing a pairing requires someone to be looking at
/// the machine. Provenance, not content, is what grants authority.
public struct PairingChallenge: Codable, Sendable, Equatable {
    public var challengeID: String
    public var serverNonce: String
    public var expiresAt: Date
    /// How many digits the person will see, so the UI can size the field.
    public var codeLength: Int

    public init(challengeID: String, serverNonce: String, expiresAt: Date, codeLength: Int = 6) {
        self.challengeID = challengeID; self.serverNonce = serverNonce
        self.expiresAt = expiresAt; self.codeLength = codeLength
    }
}

/// Step 3. The client proves it saw the code. `proof` binds the code to both
/// nonces and to the device identity, so a captured proof is useless elsewhere.
public struct PairingConfirmation: Codable, Sendable, Equatable {
    public var challengeID: String
    public var deviceID: String
    public var proof: String

    public init(challengeID: String, deviceID: String, proof: String) {
        self.challengeID = challengeID; self.deviceID = deviceID; self.proof = proof
    }

    public static func proof(code: String, clientNonce: String, serverNonce: String, deviceID: String) -> String {
        let message = "nexus.bridge.pairing-proof.v1|\(deviceID)|\(clientNonce)|\(serverNonce)"
        return HMAC.sha256(key: Data(code.utf8), message: Data(message.utf8)).hexString
    }

    public static func make(code: String, challenge: PairingChallenge,
                            request: PairingRequest) -> PairingConfirmation {
        PairingConfirmation(
            challengeID: challenge.challengeID, deviceID: request.deviceID,
            proof: proof(code: code, clientNonce: request.clientNonce,
                         serverNonce: challenge.serverNonce, deviceID: request.deviceID))
    }
}

/// Step 4. The result, handed back over the already-established loopback
/// connection exactly once. The key is never written to a config file, an export
/// or a log; on macOS the Bridge keeps its copy in the Keychain.
public struct PairingResult: Codable, Sendable, Equatable {
    public var deviceID: String
    public var deviceKeyHex: String
    /// First 16 hex characters of SHA-256 of the key. Safe to display and to log,
    /// and enough for the user to confirm both sides hold the same key.
    public var keyFingerprint: String
    public var pairedAt: Date

    public init(deviceID: String, deviceKeyHex: String, keyFingerprint: String, pairedAt: Date) {
        self.deviceID = deviceID; self.deviceKeyHex = deviceKeyHex
        self.keyFingerprint = keyFingerprint; self.pairedAt = pairedAt
    }
}

public struct PairedDevice: Codable, Sendable, Equatable, Identifiable {
    public var id: String { deviceID }
    public var deviceID: String
    public var deviceName: String
    public var keyFingerprint: String
    public var pairedAt: Date
    public var revokedAt: Date?
    public var lastSeenAt: Date?
    public var highestCounter: UInt64

    public init(deviceID: String, deviceName: String, keyFingerprint: String, pairedAt: Date,
                revokedAt: Date? = nil, lastSeenAt: Date? = nil, highestCounter: UInt64 = 0) {
        self.deviceID = deviceID; self.deviceName = deviceName; self.keyFingerprint = keyFingerprint
        self.pairedAt = pairedAt; self.revokedAt = revokedAt
        self.lastSeenAt = lastSeenAt; self.highestCounter = highestCounter
    }

    public var isActive: Bool { revokedAt == nil }
}

/// Where per-device keys live. On macOS this is backed by the Keychain through
/// `SecurityCore.CredentialStore`; the in-memory implementation below exists for
/// tests and previews only.
public protocol DeviceKeyStore: AnyObject, Sendable {
    func store(key: Data, deviceID: String) throws
    func key(for deviceID: String) throws -> Data
    func removeKey(for deviceID: String) throws
}

public final class InMemoryDeviceKeyStore: DeviceKeyStore, @unchecked Sendable {
    private let lock = NSLock()
    private var keys: [String: Data] = [:]
    public init() {}
    public func store(key: Data, deviceID: String) throws { lock.lock(); keys[deviceID] = key; lock.unlock() }
    public func key(for deviceID: String) throws -> Data {
        lock.lock(); defer { lock.unlock() }
        guard let key = keys[deviceID] else { throw PairingError.unknownDevice }
        return key
    }
    public func removeKey(for deviceID: String) throws { lock.lock(); keys.removeValue(forKey: deviceID); lock.unlock() }
}

public enum PairingError {
    public static let unknownDevice = NexusError.security(
        "unknownDevice",
        "A request arrived from a device Nexus OS has not been paired with.",
        recovery: "Open Nexus OS on this Mac and pair the device again from Settings › Mac Bridge.")
    public static let revokedDevice = NexusError.security(
        "revokedDevice",
        "That device's access to the Mac Bridge was removed.",
        recovery: "Pair it again from Settings › Mac Bridge if you still want it to control this Mac.")
    public static let expiredChallenge = NexusError.security(
        "pairingExpired",
        "The pairing code expired before it was entered.",
        recovery: "Choose Pair Again in Nexus OS and enter the new code within two minutes.")
    public static let wrongCode = NexusError.security(
        "pairingCodeWrong",
        "That pairing code did not match the one shown on this Mac.",
        recovery: "Check the six digits on this Mac's screen and type them again.")
    public static let tooManyAttempts = NexusError.security(
        "pairingAttempts",
        "Too many pairing codes were tried, so this attempt was cancelled.",
        recovery: "Choose Pair Again in Nexus OS to get a fresh code.")
    public static let unknownChallenge = NexusError.security(
        "pairingUnknown",
        "That pairing attempt is no longer active.",
        recovery: "Choose Pair Again in Nexus OS to start over.")
}

/// Runs the four-step handshake and derives the per-device key.
///
/// Key derivation:
/// ```text
/// deviceKey = HMAC_SHA256(masterSecret,
///                         "nexus.bridge.device-key.v1|" deviceID "|" clientNonce "|" serverNonce)
/// ```
/// The master secret is 32 random bytes generated on first run and kept in the
/// Keychain, so every paired device gets a distinct key and revoking one device
/// cannot be undone by an attacker who saw another device's key.
public final class PairingCoordinator: @unchecked Sendable {
    private struct PendingChallenge {
        let challengeID: String
        let deviceID: String
        let deviceName: String
        let clientNonce: String
        let serverNonce: String
        let code: String
        let expiresAt: Date
        var attempts: Int
    }

    public static let challengeLifetime: TimeInterval = 120
    public static let maximumAttempts = 5

    private let lock = NSLock()
    private let masterSecret: Data
    private let keys: DeviceKeyStore
    private let dates: DateProvider
    private var pending: [String: PendingChallenge] = [:]
    private var devices: [String: PairedDevice] = [:]

    public init(masterSecret: Data, keys: DeviceKeyStore, dates: DateProvider = SystemDateProvider()) {
        self.masterSecret = masterSecret; self.keys = keys; self.dates = dates
    }

    /// Generates a fresh master secret. Call once, then keep it in the Keychain.
    public static func newMasterSecret() -> Data { SecureRandom.bytes(32) }

    public var pairedDevices: [PairedDevice] {
        lock.lock(); defer { lock.unlock() }
        return devices.values.sorted { $0.pairedAt < $1.pairedAt }
    }

    /// Step 1 → 2. Returns the challenge to send back and the code to display on
    /// this Mac. The code is intentionally *not* part of the challenge.
    public func begin(_ request: PairingRequest) throws -> (challenge: PairingChallenge, displayCode: String) {
        guard request.version == BridgeProtocolDocumentation.protocolVersion else {
            throw NexusError(domain: .unsupported, code: "protocolVersion",
                             message: "That device speaks a different version of the Nexus Bridge protocol.",
                             recovery: "Update Nexus OS on both machines, then pair again.")
        }
        guard !request.deviceID.isEmpty, request.deviceID.count <= 128 else {
            throw NexusError.validation("badDeviceID", "That device did not identify itself properly.",
                                        recovery: "Quit and reopen Nexus OS, then pair again.")
        }
        guard request.clientNonce.count >= 32, Data(hexString: request.clientNonce) != nil else {
            throw NexusError.security("badNonce", "That pairing attempt was not formed correctly and was refused.",
                                      recovery: "Quit and reopen Nexus OS, then pair again.")
        }
        let now = dates.now
        let challenge = PairingChallenge(challengeID: UUID().uuidString,
                                         serverNonce: SecureRandom.hex(32),
                                         expiresAt: now.addingTimeInterval(Self.challengeLifetime))
        let code = SecureRandom.pairingCode()
        lock.lock()
        pending[challenge.challengeID] = PendingChallenge(
            challengeID: challenge.challengeID, deviceID: request.deviceID,
            deviceName: request.deviceName, clientNonce: request.clientNonce,
            serverNonce: challenge.serverNonce, code: code,
            expiresAt: challenge.expiresAt, attempts: 0)
        lock.unlock()
        return (challenge, code)
    }

    /// Step 3 → 4. Verifies the proof, derives the key and records the device.
    public func complete(_ confirmation: PairingConfirmation) throws -> PairingResult {
        let now = dates.now
        lock.lock()
        guard var challenge = pending[confirmation.challengeID] else {
            lock.unlock(); throw PairingError.unknownChallenge
        }
        guard challenge.deviceID == confirmation.deviceID else {
            pending.removeValue(forKey: confirmation.challengeID)
            lock.unlock(); throw PairingError.unknownChallenge
        }
        guard now <= challenge.expiresAt else {
            pending.removeValue(forKey: confirmation.challengeID)
            lock.unlock(); throw PairingError.expiredChallenge
        }
        challenge.attempts += 1
        guard challenge.attempts <= Self.maximumAttempts else {
            pending.removeValue(forKey: confirmation.challengeID)
            lock.unlock(); throw PairingError.tooManyAttempts
        }
        pending[confirmation.challengeID] = challenge
        lock.unlock()

        let expected = PairingConfirmation.proof(code: challenge.code, clientNonce: challenge.clientNonce,
                                                 serverNonce: challenge.serverNonce, deviceID: challenge.deviceID)
        guard let provided = Data(hexString: confirmation.proof.lowercased()),
              HMAC.secureCompare(provided, Data(hexString: expected) ?? Data()) else {
            throw PairingError.wrongCode
        }

        let deviceKey = Self.deriveKey(masterSecret: masterSecret, deviceID: challenge.deviceID,
                                       clientNonce: challenge.clientNonce, serverNonce: challenge.serverNonce)
        try keys.store(key: deviceKey, deviceID: challenge.deviceID)
        let fingerprint = String(SHA256.hash(deviceKey).hexString.prefix(16))
        let device = PairedDevice(deviceID: challenge.deviceID, deviceName: challenge.deviceName,
                                  keyFingerprint: fingerprint, pairedAt: now)
        lock.lock()
        devices[device.deviceID] = device
        pending.removeValue(forKey: confirmation.challengeID)
        lock.unlock()

        return PairingResult(deviceID: device.deviceID, deviceKeyHex: deviceKey.hexString,
                             keyFingerprint: fingerprint, pairedAt: now)
    }

    public static func deriveKey(masterSecret: Data, deviceID: String,
                                 clientNonce: String, serverNonce: String) -> Data {
        let info = "nexus.bridge.device-key.v1|\(deviceID)|\(clientNonce)|\(serverNonce)"
        return HMAC.sha256(key: masterSecret, message: Data(info.utf8)).data
    }

    public func device(_ deviceID: String) -> PairedDevice? {
        lock.lock(); defer { lock.unlock() }; return devices[deviceID]
    }

    public func revoke(deviceID: String) {
        lock.lock()
        if var device = devices[deviceID] { device.revokedAt = dates.now; devices[deviceID] = device }
        lock.unlock()
        try? keys.removeKey(for: deviceID)
    }

    /// Used by the uninstaller and by "Forget every device".
    public func revokeAll() {
        lock.lock()
        let ids = Array(devices.keys)
        for id in ids { devices[id]?.revokedAt = dates.now }
        pending.removeAll()
        lock.unlock()
        for id in ids { try? keys.removeKey(for: id) }
    }

    /// Restores devices from the Bridge's own store at start-up.
    public func adopt(_ device: PairedDevice) {
        lock.lock(); devices[device.deviceID] = device; lock.unlock()
    }

    public func key(for deviceID: String) throws -> Data {
        lock.lock()
        let known = devices[deviceID]
        lock.unlock()
        guard let known else { throw PairingError.unknownDevice }
        guard known.isActive else { throw PairingError.revokedDevice }
        return try keys.key(for: deviceID)
    }
}
