import Foundation
import AppCore
import SecurityCore
import BridgeProtocol
import BridgeSecurity

/// How Nexus Desktop finds the Mac Bridge.
///
/// The Bridge binds `127.0.0.1` on a port chosen at random each launch — there is
/// no well-known port to scan for — and writes this document to
/// `~/Library/Application Support/Nexus OS/bridge-endpoint.json`. That file is
/// the out-of-band channel referred to in
/// ``BridgeProtocolDocumentation/originRule``.
///
/// The file carries **no key material**. It says where to knock and which paired
/// device identity the Bridge expects; the signing key itself lives in the
/// Keychain on both sides. A file an attacker could write therefore lets them
/// redirect the shell to a port of their choosing — which is why the origin is
/// re-validated as loopback here, and why every request is signed with a key that
/// port cannot produce.
public struct BridgeEndpoint: Codable, Sendable, Equatable {
    /// Protocol version the Bridge speaks. A mismatch is an "update Nexus OS".
    public var version: String
    /// `http://127.0.0.1:<port>`
    public var origin: String
    public var port: Int
    /// The device identity this Mac paired under, so the shell knows which
    /// Keychain entry to sign with.
    public var deviceID: String
    /// First 16 hex characters of SHA-256 of the shared key. Safe to display, and
    /// enough for the user to confirm both sides hold the same key.
    public var keyFingerprint: String
    public var bridgeVersion: String
    public var startedAt: Date

    public init(version: String = BridgeProtocolDocumentation.protocolVersion,
                origin: String, port: Int, deviceID: String, keyFingerprint: String,
                bridgeVersion: String, startedAt: Date) {
        self.version = version
        self.origin = origin
        self.port = port
        self.deviceID = deviceID
        self.keyFingerprint = keyFingerprint
        self.bridgeVersion = bridgeVersion
        self.startedAt = startedAt
    }

    /// The URL a signed request is posted to.
    public var requestURL: URL? { URL(string: origin + "/v1/request") }

    /// Parses and checks the endpoint document.
    ///
    /// Refuses anything that is not loopback, so a tampered file cannot point the
    /// shell at a machine on the network, and refuses a version mismatch with a
    /// message the user can act on.
    public static func decode(_ data: Data) throws -> BridgeEndpoint {
        guard data.count <= 8 * 1024 else {
            throw Self.unreadable
        }
        let endpoint: BridgeEndpoint
        do {
            endpoint = try NexusJSON.decoder.decode(BridgeEndpoint.self, from: data)
        } catch {
            throw Self.unreadable
        }
        guard endpoint.version == BridgeProtocolDocumentation.protocolVersion else {
            throw NexusError(
                domain: .unsupported, code: "bridgeProtocolVersion",
                message: "The Mac Bridge running on this Mac speaks a different version of the Nexus protocol (\(endpoint.version)) than this app (\(BridgeProtocolDocumentation.protocolVersion)).",
                recovery: "Quit Nexus OS, run BUILD_NEXUS.command once so both halves are rebuilt together, then open Nexus OS again.")
        }
        guard (1...65535).contains(endpoint.port) else { throw Self.unreadable }
        // The transport origin must be loopback. This is the same validator the
        // Bridge applies to inbound requests, used here in the other direction.
        try LoopbackOriginValidator(expectedPort: endpoint.port).validate(endpoint.origin)
        guard !endpoint.deviceID.isEmpty, endpoint.deviceID.count <= 128 else { throw Self.unreadable }
        guard endpoint.requestURL != nil else { throw Self.unreadable }
        return endpoint
    }

    public static let unreadable = NexusError.storage(
        "bridgeEndpointUnreadable",
        "Nexus OS found the Mac Bridge's connection details, but they were not readable.",
        recovery: "Quit Nexus OS and open it again. If the message returns, run BUILD_NEXUS.command to reinstall the Bridge.")

    /// What the shell reports when the file is not there at all — the normal
    /// state when the Bridge has never been installed, and the reason every
    /// Bridge-backed action fails with a next step rather than in silence.
    public static let notRunning = NexusError.notFound(
        "The Nexus Mac Bridge",
        recovery: "The Bridge is the small helper that opens apps and arranges windows for you. Open Settings › Mac Bridge and choose Install the Mac Bridge, or run BUILD_NEXUS.command. Everything else in Nexus keeps working without it.")
}

/// Which actions the shell performs itself and which it forwards to the Bridge.
///
/// The split is by *authority required*, not by convenience:
///
/// - The shell can post a notification, put text on the clipboard, open a web
///   link in the default browser and describe its own state. None of these needs
///   a privileged macOS API, and all of them are things the shell already does
///   for its own UI.
/// - Everything that controls another application, touches the file system, uses
///   the Accessibility API, runs a Shortcut or reaches an MCP server goes to the
///   Bridge, which holds those permissions, those bookmarks and those approvals.
///
/// Both halves run the same `ActionValidator` first. The Bridge validates again
/// on arrival; the shell's check is not a substitute for the Bridge's, it is the
/// layer that lets the user answer a confirmation in the window they are looking
/// at.
public enum ActionRouting: Sendable, Equatable {
    case performedByShell
    case forwardedToBridge

    public static func route(for action: BridgeAction) -> ActionRouting {
        switch action {
        case .showNotification, .copyApprovedText, .openURL, .bridgeStatus:
            return .performedByShell
        case .launchApplication, .focusApplication, .quitApplication,
             .openFile, .openFolder,
             .moveWindow, .resizeWindow, .tileWindows, .restoreWorkspace,
             .runApprovedShortcut, .invokeApprovedMCPServer, .detectApplications:
            return .forwardedToBridge
        }
    }

    /// True when the action cannot even be attempted without the Bridge, so the
    /// UI can label it "Needs the Mac Bridge" before the user tries.
    public static func requiresBridge(_ action: BridgeAction) -> Bool {
        route(for: action) == .forwardedToBridge
    }
}
