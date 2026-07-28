import Foundation
import AppCore
import SecurityCore

/// The parameters of exactly one action. Self-describing on the wire so a payload
/// can never be decoded as the wrong action's parameters.
///
/// ```json
/// { "action": "openURL", "parameters": { "url": "https://example.com" } }
/// ```
public enum BridgeActionPayload: Sendable, Equatable {
    case launchApplication(LaunchApplicationParameters)
    case openURL(OpenURLParameters)
    case openFile(OpenFileParameters)
    case openFolder(OpenFolderParameters)
    case focusApplication(FocusApplicationParameters)
    case quitApplication(QuitApplicationParameters)
    case moveWindow(MoveWindowParameters)
    case resizeWindow(ResizeWindowParameters)
    case tileWindows(TileWindowsParameters)
    case restoreWorkspace(RestoreWorkspaceParameters)
    case showNotification(ShowNotificationParameters)
    case copyApprovedText(CopyApprovedTextParameters)
    case runApprovedShortcut(RunApprovedShortcutParameters)
    case invokeApprovedMCPServer(InvokeApprovedMCPServerParameters)
    case detectApplications(DetectApplicationsParameters)
    case bridgeStatus(BridgeStatusParameters)

    public var action: BridgeAction {
        switch self {
        case .launchApplication: return .launchApplication
        case .openURL: return .openURL
        case .openFile: return .openFile
        case .openFolder: return .openFolder
        case .focusApplication: return .focusApplication
        case .quitApplication: return .quitApplication
        case .moveWindow: return .moveWindow
        case .resizeWindow: return .resizeWindow
        case .tileWindows: return .tileWindows
        case .restoreWorkspace: return .restoreWorkspace
        case .showNotification: return .showNotification
        case .copyApprovedText: return .copyApprovedText
        case .runApprovedShortcut: return .runApprovedShortcut
        case .invokeApprovedMCPServer: return .invokeApprovedMCPServer
        case .detectApplications: return .detectApplications
        case .bridgeStatus: return .bridgeStatus
        }
    }

    /// One sentence describing exactly what will happen. The confirmation sheet
    /// and the audit record both use this string, so they can never disagree.
    public var summary: String {
        switch self {
        case .launchApplication(let p): return p.summary
        case .openURL(let p): return p.summary
        case .openFile(let p): return p.summary
        case .openFolder(let p): return p.summary
        case .focusApplication(let p): return p.summary
        case .quitApplication(let p): return p.summary
        case .moveWindow(let p): return p.summary
        case .resizeWindow(let p): return p.summary
        case .tileWindows(let p): return p.summary
        case .restoreWorkspace(let p): return p.summary
        case .showNotification(let p): return p.summary
        case .copyApprovedText(let p): return p.summary
        case .runApprovedShortcut(let p): return p.summary
        case .invokeApprovedMCPServer(let p): return p.summary
        case .detectApplications(let p): return p.summary
        case .bridgeStatus(let p): return p.summary
        }
    }

    /// Returns a normalised copy, or throws a `NexusError` naming the offending
    /// field with a next step for the user.
    public func validated() throws -> BridgeActionPayload {
        switch self {
        case .launchApplication(let p): return .launchApplication(try p.validated())
        case .openURL(let p): return .openURL(try p.validated())
        case .openFile(let p): return .openFile(try p.validated())
        case .openFolder(let p): return .openFolder(try p.validated())
        case .focusApplication(let p): return .focusApplication(try p.validated())
        case .quitApplication(let p): return .quitApplication(try p.validated())
        case .moveWindow(let p): return .moveWindow(try p.validated())
        case .resizeWindow(let p): return .resizeWindow(try p.validated())
        case .tileWindows(let p): return .tileWindows(try p.validated())
        case .restoreWorkspace(let p): return .restoreWorkspace(try p.validated())
        case .showNotification(let p): return .showNotification(try p.validated())
        case .copyApprovedText(let p): return .copyApprovedText(try p.validated())
        case .runApprovedShortcut(let p): return .runApprovedShortcut(try p.validated())
        case .invokeApprovedMCPServer(let p): return .invokeApprovedMCPServer(try p.validated())
        case .detectApplications(let p): return .detectApplications(try p.validated())
        case .bridgeStatus(let p): return .bridgeStatus(try p.validated())
        }
    }
}

extension BridgeActionPayload: Codable {
    private enum CodingKeys: String, CodingKey { case action, parameters }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let name = try container.decode(String.self, forKey: .action)
        // Unknown names become a readable NexusError rather than a DecodingError,
        // so the desktop app can tell the user the versions do not match.
        let action = try BridgeAction.decode(name: name)

        func read<P: BridgeActionParameters>(_ type: P.Type) throws -> P {
            do { return try container.decode(P.self, forKey: .parameters) }
            catch {
                throw NexusError.validation(
                    "badParameters",
                    "The details sent with “\(action.title)” were not in the expected form.",
                    recovery: "Update Nexus OS so the app and the Mac Bridge match, then try again.")
            }
        }

        switch action {
        case .launchApplication: self = .launchApplication(try read(LaunchApplicationParameters.self))
        case .openURL: self = .openURL(try read(OpenURLParameters.self))
        case .openFile: self = .openFile(try read(OpenFileParameters.self))
        case .openFolder: self = .openFolder(try read(OpenFolderParameters.self))
        case .focusApplication: self = .focusApplication(try read(FocusApplicationParameters.self))
        case .quitApplication: self = .quitApplication(try read(QuitApplicationParameters.self))
        case .moveWindow: self = .moveWindow(try read(MoveWindowParameters.self))
        case .resizeWindow: self = .resizeWindow(try read(ResizeWindowParameters.self))
        case .tileWindows: self = .tileWindows(try read(TileWindowsParameters.self))
        case .restoreWorkspace: self = .restoreWorkspace(try read(RestoreWorkspaceParameters.self))
        case .showNotification: self = .showNotification(try read(ShowNotificationParameters.self))
        case .copyApprovedText: self = .copyApprovedText(try read(CopyApprovedTextParameters.self))
        case .runApprovedShortcut: self = .runApprovedShortcut(try read(RunApprovedShortcutParameters.self))
        case .invokeApprovedMCPServer: self = .invokeApprovedMCPServer(try read(InvokeApprovedMCPServerParameters.self))
        case .detectApplications: self = .detectApplications(try read(DetectApplicationsParameters.self))
        case .bridgeStatus: self = .bridgeStatus(try read(BridgeStatusParameters.self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(action.rawValue, forKey: .action)
        switch self {
        case .launchApplication(let p): try container.encode(p, forKey: .parameters)
        case .openURL(let p): try container.encode(p, forKey: .parameters)
        case .openFile(let p): try container.encode(p, forKey: .parameters)
        case .openFolder(let p): try container.encode(p, forKey: .parameters)
        case .focusApplication(let p): try container.encode(p, forKey: .parameters)
        case .quitApplication(let p): try container.encode(p, forKey: .parameters)
        case .moveWindow(let p): try container.encode(p, forKey: .parameters)
        case .resizeWindow(let p): try container.encode(p, forKey: .parameters)
        case .tileWindows(let p): try container.encode(p, forKey: .parameters)
        case .restoreWorkspace(let p): try container.encode(p, forKey: .parameters)
        case .showNotification(let p): try container.encode(p, forKey: .parameters)
        case .copyApprovedText(let p): try container.encode(p, forKey: .parameters)
        case .runApprovedShortcut(let p): try container.encode(p, forKey: .parameters)
        case .invokeApprovedMCPServer(let p): try container.encode(p, forKey: .parameters)
        case .detectApplications(let p): try container.encode(p, forKey: .parameters)
        case .bridgeStatus(let p): try container.encode(p, forKey: .parameters)
        }
    }
}

/// Everything a caller sends, other than the signature (which travels in the
/// `X-Nexus-Signature` header and covers the exact bytes of this document).
public struct BridgeRequestEnvelope: Codable, Sendable, Equatable {
    /// Protocol version. A mismatch is refused with an "update Nexus OS" message.
    public var version: String
    /// Unique per request. Used for single-use enforcement.
    public var requestID: String
    /// Which paired device is speaking. Selects the signing key.
    public var deviceID: String
    /// Strictly increasing per device. A repeated or lower value is a replay.
    public var counter: UInt64
    /// When the caller created the request. Checked for freshness.
    public var issuedAt: Date
    /// The loopback origin the caller believes it is using. Cross-checked against
    /// the real transport peer, so a lying value cannot help an attacker.
    public var origin: String
    /// Who asked for this. `user` is the only origin that carries authority;
    /// everything else is a suggestion that still needs confirmation.
    public var requestOrigin: ContentOrigin
    public var action: BridgeAction
    public var payload: BridgeActionPayload

    public init(version: String = BridgeProtocolDocumentation.protocolVersion,
                requestID: String = UUID().uuidString,
                deviceID: String,
                counter: UInt64,
                issuedAt: Date,
                origin: String,
                requestOrigin: ContentOrigin,
                payload: BridgeActionPayload) {
        self.version = version
        self.requestID = requestID
        self.deviceID = deviceID
        self.counter = counter
        self.issuedAt = issuedAt
        self.origin = origin
        self.requestOrigin = requestOrigin
        self.action = payload.action
        self.payload = payload
    }

    /// Rejects a document whose top-level `action` disagrees with the payload it
    /// carries. Without this a caller could get a low-impact action confirmed by
    /// the user while a high-impact payload rode along underneath.
    public func checkedActionConsistency() throws {
        guard action == payload.action else {
            throw NexusError.security(
                "actionMismatch",
                "A request described itself as “\(action.title)” but carried the details of “\(payload.action.title)”.",
                recovery: "Nexus OS refused it. If this keeps happening, quit and reopen Nexus OS, then report it.")
        }
    }

    public func checkedVersion() throws {
        guard version == BridgeProtocolDocumentation.protocolVersion else {
            throw NexusError(domain: .unsupported, code: "protocolVersion",
                             message: "Nexus OS and the Mac Bridge are speaking different versions of the same protocol.",
                             recovery: "Update Nexus OS, then quit and reopen it. The Bridge expects "
                                 + BridgeProtocolDocumentation.protocolVersion + ".")
        }
    }

    public func checkedRequestID() throws {
        guard !requestID.isEmpty, requestID.count <= 128,
              requestID.allSatisfy({ $0.isHexDigit || $0 == "-" || $0.isLetter || $0.isNumber }) else {
            throw NexusError.security("badRequestID", "A request arrived without a usable identifier and was ignored.",
                                      recovery: "No action needed. If Nexus OS stops responding, quit and reopen it.")
        }
    }
}

/// Decoding helpers that keep `DecodingError` out of the user-facing path.
public enum BridgeRequestDecoder {
    public static func decodeEnvelope(_ data: Data) throws -> BridgeRequestEnvelope {
        guard data.count <= BridgeLimits.maximumBodyBytes else {
            throw NexusError.security("bodyTooLarge", "A request to the Mac Bridge was too large and was ignored.",
                                      recovery: "No action needed. Try the action again with less information.")
        }
        let envelope: BridgeRequestEnvelope
        do {
            envelope = try NexusJSON.decoder.decode(BridgeRequestEnvelope.self, from: data)
        } catch let error as NexusError {
            // BridgeAction.decode and the parameter reader already produced a
            // readable error; keep it rather than flattening it to "unreadable".
            throw error
        } catch {
            throw NexusError.validation("unreadableRequest", "A request to the Mac Bridge could not be read.",
                                        recovery: "Update Nexus OS so the app and the Bridge match, then try again.")
        }
        try envelope.checkedVersion()
        try envelope.checkedRequestID()
        try envelope.checkedActionConsistency()
        return envelope
    }

    /// Encodes with sorted keys so a request is byte-stable for signing.
    public static func encode(_ envelope: BridgeRequestEnvelope) throws -> Data {
        try NexusJSON.encode(envelope)
    }
}
