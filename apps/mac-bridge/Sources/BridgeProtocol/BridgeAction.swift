import Foundation
import AppCore
import SecurityCore

/// The complete, closed set of things the Nexus Mac Bridge can be asked to do.
///
/// # Why this is an enum and not a string
///
/// The web layer (Nexus Cloud, running in a WKWebView) is treated as hostile
/// input. It may *request* anything; it may never *invent* anything. Because the
/// action is a closed enum, an action name the Bridge does not know is rejected
/// during decoding — before any parameter is read and before any permission is
/// consulted. Adding capability requires editing this file, which is a reviewable
/// change to the security surface rather than a runtime string.
///
/// # There is deliberately no shell, exec, AppleScript or "run command" action
///
/// See ``BridgeProtocolDocumentation/noShellAccessRationale``. Nothing in this
/// protocol accepts a command line, a script body, an interpreter name, an
/// environment dictionary or arbitrary process arguments. `launchApplication`
/// launches a *known application from the catalogue* with no arguments;
/// `runApprovedShortcut` runs a macOS Shortcut **by name** that the user added to
/// an allow-list in advance; `invokeApprovedMCPServer` calls a named tool on a
/// server the user already approved. None of these is a general execution
/// primitive, and none of them can be widened by the caller.
public enum BridgeAction: String, Codable, Sendable, CaseIterable, Hashable {
    case launchApplication
    case openURL
    case openFile
    case openFolder
    case focusApplication
    case quitApplication
    case moveWindow
    case resizeWindow
    case tileWindows
    case restoreWorkspace
    case showNotification
    case copyApprovedText
    case runApprovedShortcut
    case invokeApprovedMCPServer
    case detectApplications
    case bridgeStatus

    /// Stable tool identifier used by the permission engine and the audit log.
    public var toolIdentifier: String { "bridge.\(rawValue)" }

    /// Short title shown in confirmation sheets and the permission list.
    public var title: String {
        switch self {
        case .launchApplication: return "Open an application"
        case .openURL: return "Open a web link"
        case .openFile: return "Open a file"
        case .openFolder: return "Open a folder"
        case .focusApplication: return "Bring an application to the front"
        case .quitApplication: return "Quit an application"
        case .moveWindow: return "Move a window"
        case .resizeWindow: return "Resize a window"
        case .tileWindows: return "Arrange windows"
        case .restoreWorkspace: return "Restore a saved workspace"
        case .showNotification: return "Show a notification"
        case .copyApprovedText: return "Copy text to the clipboard"
        case .runApprovedShortcut: return "Run a shortcut you approved"
        case .invokeApprovedMCPServer: return "Use an approved MCP tool"
        case .detectApplications: return "Check which applications are installed"
        case .bridgeStatus: return "Read the Bridge's status"
        }
    }

    /// Plain-language explanation used on the permission onboarding screens.
    public var explanation: String {
        switch self {
        case .launchApplication: return "Starts an application from your Nexus application list. No command line is ever passed to it."
        case .openURL: return "Hands a web address to your default browser. Only http and https addresses are accepted."
        case .openFile: return "Opens a file that sits inside a folder you granted Nexus OS access to."
        case .openFolder: return "Reveals a folder inside a location you granted Nexus OS access to."
        case .focusApplication: return "Switches to an application that is already running."
        case .quitApplication: return "Asks an application to quit. It is never force-killed, so unsaved work still prompts."
        case .moveWindow: return "Moves a window on screen using the macOS Accessibility API."
        case .resizeWindow: return "Changes a window's size using the macOS Accessibility API."
        case .tileWindows: return "Arranges several windows into a layout such as halves or quarters."
        case .restoreWorkspace: return "Puts a set of applications and windows back where you saved them."
        case .showNotification: return "Posts a macOS notification. Secrets are stripped before it is shown."
        case .copyApprovedText: return "Places text on the clipboard, replacing what is there now."
        case .runApprovedShortcut: return "Runs a macOS Shortcut by name, but only one you added to the approved list."
        case .invokeApprovedMCPServer: return "Calls a tool on a local MCP server you already connected and approved."
        case .detectApplications: return "Looks up which of the applications in your list are installed. Reads nothing else."
        case .bridgeStatus: return "Reports the Bridge's version, granted macOS permissions and whether it is paused."
        }
    }

    /// The baseline impact of the action. `ActionValidator` may raise this (never
    /// lower it) once the concrete parameters are known — for example launching
    /// Terminal is raised to `.system`.
    public var baselineImpact: ActionImpact {
        switch self {
        case .detectApplications, .bridgeStatus:
            return .read
        case .openURL, .openFile, .openFolder, .showNotification, .copyApprovedText:
            return .write
        case .launchApplication, .focusApplication, .moveWindow, .resizeWindow,
             .tileWindows, .restoreWorkspace, .runApprovedShortcut, .invokeApprovedMCPServer:
            return .system
        case .quitApplication:
            // Quitting can lose unsaved work in another application, so it is
            // treated as irreversible and always confirmable.
            return .destructive
        }
    }

    /// What the action can reach, shown verbatim in the confirmation prompt.
    public var dataAccess: [String] {
        switch self {
        case .launchApplication, .focusApplication, .quitApplication, .detectApplications:
            return ["the list of applications on this Mac"]
        case .openURL:
            return ["your default browser"]
        case .openFile, .openFolder:
            return ["the folders you granted Nexus OS access to"]
        case .moveWindow, .resizeWindow, .tileWindows, .restoreWorkspace:
            return ["window positions of running applications"]
        case .showNotification:
            return ["macOS Notification Centre"]
        case .copyApprovedText:
            return ["your clipboard"]
        case .runApprovedShortcut:
            return ["the Shortcuts you added to the approved list"]
        case .invokeApprovedMCPServer:
            return ["the MCP servers you connected"]
        case .bridgeStatus:
            return ["the Bridge's own status"]
        }
    }

    /// Decodes an action name coming off the wire, turning an unrecognised value
    /// into a user-readable `NexusError` instead of a `DecodingError`.
    public static func decode(name: String) throws -> BridgeAction {
        guard let action = BridgeAction(rawValue: name) else {
            throw NexusError.security(
                "unknownAction",
                "Nexus OS was asked to perform an action the Mac Bridge does not have: “\(name)”.",
                recovery: "This can mean the app and the Bridge are different versions. Update Nexus OS, then try again.")
        }
        return action
    }
}

/// Reference text kept next to the protocol so the rationale cannot drift away
/// from the code it explains. Rendered in the Bridge README and in Settings.
public enum BridgeProtocolDocumentation {
    public static let protocolVersion = "nexus-bridge/1"

    public static let noShellAccessRationale = """
    The Nexus Mac Bridge has no shell, exec, AppleScript or "run command" action, \
    and adding one is out of scope for this protocol.

    The Bridge's whole purpose is to be a narrow, auditable waist between untrusted \
    content (a web view, a language model, an MCP tool result, a webhook) and the \
    user's Mac. A single generic execution action would collapse that waist: every \
    other control in this file — the closed action set, per-action impact, path \
    confinement, URL validation, the approved-shortcut list — becomes decorative \
    the moment one action can run `/bin/sh -c`.

    Concretely, the protocol never accepts: a command string, a script body, an \
    interpreter path, argv, an environment dictionary, a working directory, or a \
    path to an executable. `launchApplication` takes a catalogue identifier, not an \
    executable path, and passes no arguments. `runApprovedShortcut` takes the name \
    of a Shortcut the user added to an allow-list beforehand; a name that is not on \
    that list is refused, so the caller cannot introduce new behaviour. \
    `invokeApprovedMCPServer` reaches only servers the user already connected, and \
    the MCP layer applies its own permission policy on top.

    If a future feature genuinely needs to run something, the correct shape is a \
    new named action with typed parameters and its own impact and validation — not \
    a general escape hatch.
    """

    public static let originRule = """
    The Bridge listens only on 127.0.0.1 with a port chosen at random at start-up \
    and published to the Nexus Desktop app over an out-of-band channel. Requests \
    whose transport origin is not loopback are refused before the body is read.
    """

    public static let signingRule = """
    Every request carries an HMAC-SHA256 signature over the exact bytes of its \
    body, keyed by a per-device secret established during pairing. Because the \
    envelope (device, counter, timestamp, origin, action and parameters) lives \
    inside those bytes, the signature covers all of it. The signature is checked \
    before the body is parsed.
    """
}
