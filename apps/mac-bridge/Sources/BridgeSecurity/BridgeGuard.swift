import Foundation
import AppCore
import SecurityCore
import BridgeProtocol

/// A request that survived every transport-level check. Holding one of these is
/// proof that the bytes came from loopback, were signed by an active paired
/// device, are fresh, are not a replay, and describe a known action. It says
/// nothing about whether the user is willing to allow it — that is
/// `ActionValidator`'s job.
public struct AdmittedRequest: Sendable, Equatable {
    public let envelope: BridgeRequestEnvelope
    public let device: PairedDevice
    public let receivedAt: Date

    public init(envelope: BridgeRequestEnvelope, device: PairedDevice, receivedAt: Date) {
        self.envelope = envelope; self.device = device; self.receivedAt = receivedAt
    }

    public var action: BridgeAction { envelope.action }
}

/// The transport-security gate. Everything the Bridge receives passes through
/// `admit` before anything else looks at it.
///
/// Order is part of the design:
///
/// 1. **Emergency switch** — a paused Bridge does no work.
/// 2. **Loopback origin** — refuse anything not from this Mac.
/// 3. **Size limit** — refuse an oversized body before allocating for it.
/// 4. **Signature over raw bytes** — refuse anything not signed by a paired
///    device's key. This happens *before parsing*, so a malformed or hostile
///    document is never fed to the decoder unless a paired device sent it.
/// 5. **Parse and shape checks** — protocol version, request id, unknown action,
///    action/payload agreement.
/// 6. **Identity agreement** — the device named in the body must be the device
///    whose key verified the signature.
/// 7. **Freshness** — not stale, not from the future.
/// 8. **Replay** — counter strictly increasing, request id single-use.
/// 9. **Commit** — only now is the counter advanced, so a rejected request can
///    never lock the real client out.
public final class BridgeGuard: @unchecked Sendable {
    public let emergencySwitch: EmergencySwitch
    public let origins: LoopbackOriginValidator
    public let freshness: FreshnessPolicy
    public let ledger: NonceLedger
    private let pairing: PairingCoordinator
    private let dates: DateProvider

    public init(pairing: PairingCoordinator,
                emergencySwitch: EmergencySwitch = EmergencySwitch(),
                origins: LoopbackOriginValidator = LoopbackOriginValidator(),
                freshness: FreshnessPolicy = FreshnessPolicy(),
                ledger: NonceLedger = NonceLedger(),
                dates: DateProvider = SystemDateProvider()) {
        self.pairing = pairing
        self.emergencySwitch = emergencySwitch
        self.origins = origins
        self.freshness = freshness
        self.ledger = ledger
        self.dates = dates
    }

    @discardableResult
    public func admit(_ request: SignedBridgeRequest) throws -> AdmittedRequest {
        let now = dates.now

        // 1. Paused means paused.
        try emergencySwitch.preflight()

        // 2. Loopback only, and the claimed origin has to agree with the observed one.
        try origins.validate(request.transportOrigin)

        // 3. Bound the work an unauthenticated caller can cause.
        guard request.body.count <= BridgeLimits.maximumBodyBytes else {
            throw NexusError.security("bodyTooLarge", "A request to the Mac Bridge was too large and was ignored.",
                                      recovery: "No action needed. Try the action again with less information.")
        }

        // 4. Signature first, over the exact bytes, before the decoder sees them.
        let device = try activeDevice(request.deviceID)
        let key = try pairing.key(for: request.deviceID)
        guard BridgeSignature.verify(body: request.body, signature: request.signature, key: key) else {
            throw Self.badSignature
        }

        // 5. Now it is safe to parse. Unknown actions surface as a readable error.
        let envelope = try BridgeRequestDecoder.decodeEnvelope(request.body)

        // 6. The signed body must name the same device whose key we just used.
        guard envelope.deviceID == request.deviceID else {
            throw NexusError.security(
                "deviceMismatch",
                "A request was signed by one device but claimed to come from another, and was refused.",
                recovery: "Unpair and pair this device again from Settings › Mac Bridge.")
        }
        try origins.validate(transportOrigin: request.transportOrigin, claimedOrigin: envelope.origin)

        // 1b. With the action known, apply the switch precisely.
        try emergencySwitch.check(envelope.action)

        // 7. Freshness.
        try freshness.check(issuedAt: envelope.issuedAt, now: now)

        // 8. Replay.
        try ledger.check(deviceID: envelope.deviceID, counter: envelope.counter,
                         requestID: envelope.requestID, at: now)

        // 9. Commit last, so nothing rejected above consumed a counter value.
        ledger.commit(deviceID: envelope.deviceID, counter: envelope.counter,
                      requestID: envelope.requestID, at: now)

        return AdmittedRequest(envelope: envelope, device: device, receivedAt: now)
    }

    private func activeDevice(_ deviceID: String) throws -> PairedDevice {
        guard !deviceID.isEmpty, deviceID.count <= 128 else { throw PairingError.unknownDevice }
        guard let device = pairing.device(deviceID) else { throw PairingError.unknownDevice }
        guard device.isActive else { throw PairingError.revokedDevice }
        return device
    }

    /// One message for every signature failure — wrong key, altered body, bad
    /// encoding — so nothing about the key is learnable from the response.
    public static let badSignature = NexusError.security(
        "signatureInvalid",
        "A request to the Mac Bridge was not signed correctly and was refused.",
        recovery: "Quit and reopen Nexus OS. If it keeps happening, unpair and pair this Mac again in Settings › Mac Bridge.")
}
