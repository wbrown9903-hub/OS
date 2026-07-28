#if os(macOS)
import Foundation
import Security
import AppCore
import SecurityCore
import BridgeProtocol
import BridgeSecurity
import ActionValidator
import NexusDesktopCore

/// Talks to the Nexus Mac Bridge.
///
/// Everything about the transport comes from `BridgeSecurity`, which is shared
/// with the Bridge itself and unit-tested on Linux: the signature scheme
/// (`BridgeSignature`), the monotonic counter (`CounterSource`), the envelope
/// (`BridgeRequestEnvelope`) and the loopback origin rules
/// (`LoopbackOriginValidator`). The client re-implements none of it.
///
/// # What is sent
///
/// The already-resolved action, re-encoded as the same envelope any other paired
/// device would send, signed with a per-device key from the Keychain. The Bridge
/// then validates it **again**, independently. The shell's validation is not a
/// substitute for the Bridge's; it exists so the user can be asked in the window
/// they are looking at.
///
/// # Provenance across the hop
///
/// A request the user approved in a native sheet is forwarded with
/// `requestOrigin: .user`, because a person clicking a native button *is* the
/// authority the origin describes. Everything else is forwarded as `.external`,
/// so the Bridge applies its own policy to it. The shell never upgrades an
/// origin it did not personally witness a click for.
@MainActor
final class BridgeClient {
    private let layout: NexusFileLayout
    private let keyStore = KeychainDeviceKeyStore()
    private let session: URLSession
    private var counters: CounterSource
    private var cachedEndpoint: BridgeEndpoint?

    /// The identity this Mac paired under. Created on first launch and kept in
    /// preferences; the key that goes with it is in the Keychain.
    let deviceIdentifier: String

    init(layout: NexusFileLayout) {
        self.layout = layout

        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: Self.deviceIDKey), !existing.isEmpty {
            deviceIdentifier = existing
        } else {
            let created = UUID().uuidString
            defaults.set(created, forKey: Self.deviceIDKey)
            deviceIdentifier = created
        }
        // The counter must never go backwards across a relaunch, or the Bridge's
        // replay ledger will refuse every request until it catches up.
        let stored = UInt64(max(0, defaults.integer(forKey: Self.counterKey)))
        counters = CounterSource(startingAt: stored)

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 20
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.waitsForConnectivity = false
        session = URLSession(configuration: configuration)
    }

    private static let deviceIDKey = "com.nexusos.desktop.bridge.deviceID"
    private static let counterKey = "com.nexusos.desktop.bridge.counter"

    /// The loopback origin used for the envelope's `origin` field. Before the
    /// Bridge has been found this is the loopback host with no port, which the
    /// Bridge's own validator accepts only when it is not expecting a port —
    /// i.e. it will be replaced by the real origin before anything is sent.
    var transportOrigin: String { cachedEndpoint?.origin ?? "127.0.0.1" }

    // MARK: - Discovery

    /// Reads the endpoint file the Bridge publishes at start-up.
    @discardableResult
    func discoverEndpoint() -> Result<BridgeEndpoint, NexusError> {
        let url = layout.bridgeEndpointFile
        guard FileManager.default.fileExists(atPath: url.path) else {
            cachedEndpoint = nil
            return .failure(BridgeEndpoint.notRunning)
        }
        guard let data = FileManager.default.contents(atPath: url.path) else {
            cachedEndpoint = nil
            return .failure(BridgeEndpoint.unreadable)
        }
        do {
            let endpoint = try BridgeEndpoint.decode(data)
            cachedEndpoint = endpoint
            return .success(endpoint)
        } catch let error as NexusError {
            cachedEndpoint = nil
            return .failure(error)
        } catch {
            cachedEndpoint = nil
            return .failure(BridgeEndpoint.unreadable)
        }
    }

    // MARK: - Forwarding

    func forward(_ resolved: ResolvedAction, userApproved: Bool) async -> BridgeResponse {
        let endpoint: BridgeEndpoint
        switch discoverEndpoint() {
        case .success(let found):
            endpoint = found
        case .failure(let error):
            return BridgeResponse.refused(requestID: resolved.requestID, action: resolved.action,
                                          error: Self.unavailable(action: resolved.action, reason: error))
        }
        guard let requestURL = endpoint.requestURL else {
            return BridgeResponse.refused(requestID: resolved.requestID, action: resolved.action,
                                          error: BridgeEndpoint.unreadable)
        }

        let key: Data
        do {
            key = try keyStore.key(for: endpoint.deviceID)
        } catch {
            return BridgeResponse.refused(
                requestID: resolved.requestID, action: resolved.action,
                error: NexusError.security(
                    "bridgeNotPaired",
                    "This Mac is not paired with the Nexus Mac Bridge yet, so “\(resolved.action.title.lowercased())” was not run.",
                    recovery: "Open Settings › Mac Bridge and choose Pair this Mac. The Bridge shows a six-digit code on screen."))
        }

        let signer = BridgeRequestSigner(deviceID: endpoint.deviceID, key: key, counters: counters)
        let signed: SignedBridgeRequest
        do {
            signed = try signer.sign(
                payload: resolved.payload,
                origin: endpoint.origin,
                // The one place provenance crosses the hop. See the type comment.
                requestOrigin: userApproved ? .user : resolved.requestOrigin,
                now: Date(),
                requestID: resolved.requestID)
            persistCounter()
        } catch let error as NexusError {
            return BridgeResponse.refused(requestID: resolved.requestID, action: resolved.action, error: error)
        } catch {
            return BridgeResponse.refused(
                requestID: resolved.requestID, action: resolved.action,
                error: NexusError.security("bridgeSigningFailed",
                                           "Nexus could not sign the request to the Mac Bridge, so nothing was sent.",
                                           recovery: "Quit and reopen Nexus OS. If it keeps happening, unpair and pair this Mac again in Settings › Mac Bridge."))
        }

        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.httpBody = signed.body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(signed.signature, forHTTPHeaderField: "X-Nexus-Signature")
        request.setValue(signed.deviceID, forHTTPHeaderField: "X-Nexus-Device")
        request.setValue(endpoint.origin, forHTTPHeaderField: "Origin")
        request.setValue(BridgeProtocolDocumentation.protocolVersion, forHTTPHeaderField: "X-Nexus-Protocol")

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return BridgeResponse.refused(requestID: resolved.requestID, action: resolved.action,
                                              error: Self.unreadableReply)
            }
            // The Bridge answers with a `BridgeResponse` even when it refuses, so
            // a non-2xx status still carries a message and a next step.
            if let decoded = try? NexusJSON.decoder.decode(BridgeResponse.self, from: data) {
                return decoded
            }
            return BridgeResponse.refused(
                requestID: resolved.requestID, action: resolved.action,
                error: NexusError(domain: .network, code: "bridgeStatus\(http.statusCode)",
                                  message: "The Mac Bridge answered unexpectedly (status \(http.statusCode)), so “\(resolved.action.title.lowercased())” may not have run.",
                                  recovery: "Check the Activity list in Nexus. If the Bridge keeps answering like this, quit Nexus OS and run BUILD_NEXUS.command."))
        } catch {
            let urlError = error as NSError
            if urlError.code == NSURLErrorCannotConnectToHost || urlError.code == NSURLErrorNetworkConnectionLost {
                cachedEndpoint = nil
                return BridgeResponse.refused(
                    requestID: resolved.requestID, action: resolved.action,
                    error: Self.unavailable(action: resolved.action, reason: BridgeEndpoint.notRunning))
            }
            return BridgeResponse.refused(
                requestID: resolved.requestID, action: resolved.action,
                error: NexusError(domain: .network, code: "bridgeUnreachable",
                                  message: "Nexus could not reach the Mac Bridge, so “\(resolved.action.title.lowercased())” did not run.",
                                  recovery: "Quit and reopen Nexus OS. If the Bridge still does not answer, run BUILD_NEXUS.command to reinstall it."))
        }
    }

    private func persistCounter() {
        UserDefaults.standard.set(Int(counters.current), forKey: Self.counterKey)
    }

    // MARK: - Errors

    static func unavailable(action: BridgeAction, reason: NexusError) -> NexusError {
        NexusError(
            domain: .notFound,
            code: "bridgeUnavailable",
            message: "“\(action.title)” needs the Nexus Mac Bridge, which is not running on this Mac.",
            recovery: reason.recovery)
    }

    static let unreadableReply = NexusError(
        domain: .network, code: "bridgeReplyUnreadable",
        message: "The Mac Bridge replied with something Nexus could not read.",
        recovery: "Quit Nexus OS and run BUILD_NEXUS.command so the app and the Bridge are rebuilt together.")
}

/// The Bridge signing key, in the login Keychain.
///
/// It conforms to `BridgeSecurity.DeviceKeyStore`, the same protocol the Bridge
/// uses, so the key never travels through a settings file, an export, a log or a
/// notification. `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` keeps it off
/// iCloud Keychain and off any other Mac.
final class KeychainDeviceKeyStore: DeviceKeyStore, @unchecked Sendable {
    private let service = "com.nexusos.desktop.bridge-key"

    func store(key: Data, deviceID: String) throws {
        try removeKey(for: deviceID)
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: deviceID,
            kSecValueData as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NexusError.storage(
                "keychainWriteFailed",
                "Nexus could not save the Mac Bridge key to your Keychain.",
                recovery: "Open Keychain Access and make sure your login keychain is unlocked, then pair again from Settings › Mac Bridge.")
        }
    }

    func key(for deviceID: String) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: deviceID,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            throw PairingError.unknownDevice
        }
        return data
    }

    func removeKey(for deviceID: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: deviceID,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NexusError.storage(
                "keychainDeleteFailed",
                "Nexus could not remove the Mac Bridge key from your Keychain.",
                recovery: "Open Keychain Access, search for “\(service)” and delete the entry by hand.")
        }
    }

    /// Used by the uninstaller: remove every key this app created, whatever the
    /// device identifier was.
    func removeAllKeys() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NexusError.storage(
                "keychainDeleteFailed",
                "Nexus could not remove its keys from your Keychain.",
                recovery: "Open Keychain Access, search for “\(service)” and delete the entries by hand.")
        }
    }
}
#endif
