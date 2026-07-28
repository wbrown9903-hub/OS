#if os(macOS)
import Foundation
import AppKit
import NexusDesktopCore
import AppCore
import SecurityCore
import BridgeProtocol
import ActionValidator

/// Carries out an action that has already been validated, permitted and — where
/// required — approved by the person at the keyboard.
///
/// It takes a `ResolvedAction`, never a raw request. By the time a value of that
/// type exists, the URL is a validated `URL`, the path is confined to a folder
/// the user granted, the application is a catalogue entry and the notification
/// text has been through the secret redactor. There is nothing left for this file
/// to interpret, which is exactly the point: **there is one place in Nexus OS
/// where a string becomes an instruction, and it is not here.**
///
/// The split between "the shell does it" and "the Bridge does it" is decided by
/// ``ActionRouting`` in the portable core.
@MainActor
struct ActionDispatcher {
    let environment: AppEnvironment

    func perform(_ resolved: ResolvedAction, userApproved: Bool) async -> BridgeResponse {
        switch ActionRouting.route(for: resolved.action) {
        case .performedByShell:
            return await performLocally(resolved)
        case .forwardedToBridge:
            return await environment.bridgeClient.forward(resolved, userApproved: userApproved)
        }
    }

    // MARK: - Performed by the shell

    private func performLocally(_ resolved: ResolvedAction) async -> BridgeResponse {
        switch resolved.payload {
        case .showNotification:
            return await showNotification(resolved)
        case .copyApprovedText:
            return copyText(resolved)
        case .openURL:
            return openURL(resolved)
        case .bridgeStatus(let parameters):
            return status(resolved, includePermissions: parameters.includePermissions)
        default:
            // Unreachable while `ActionRouting` and this switch agree. If they
            // ever stop agreeing, refuse rather than guess.
            return BridgeResponse.refused(
                requestID: resolved.requestID, action: resolved.action,
                error: NexusError.unsupported(
                    "“\(resolved.action.title)” in this version of Nexus Desktop",
                    recovery: "Update Nexus OS so the app and the Mac Bridge match, then try again."))
        }
    }

    private func showNotification(_ resolved: ResolvedAction) async -> BridgeResponse {
        guard let text = resolved.redactedNotification else {
            return BridgeResponse.refused(
                requestID: resolved.requestID, action: resolved.action,
                error: NexusError.validation("notificationMissingText",
                                             "That notification had no text, so nothing was shown.",
                                             recovery: "Try the action again."))
        }
        var sound = ShowNotificationParameters.NotificationSound.none
        var deduplicationKey: String?
        if case .showNotification(let parameters) = resolved.payload {
            sound = parameters.sound
            deduplicationKey = parameters.deduplicationKey
        }
        // The text is already redacted by `ActionValidator`, so a token that
        // slipped into a "workflow finished" message never reaches the banner.
        let result = await environment.notifications.post(
            title: text.title, body: text.body, subtitle: text.subtitle,
            sound: sound, deduplicationKey: deduplicationKey)

        switch result {
        case .posted:
            return completed(resolved, summary: resolved.summary)
        case .duplicate:
            return BridgeResponse(requestID: resolved.requestID, action: resolved.action,
                                  status: .completed,
                                  summary: "That notification had already been shown, so it was not shown twice.",
                                  result: BridgeResult.none)
        case .permissionMissing(let error):
            return BridgeResponse(requestID: resolved.requestID, action: resolved.action,
                                  status: .permissionMissing, summary: error.message, error: error)
        case .failed(let error):
            return BridgeResponse.refused(requestID: resolved.requestID, action: resolved.action, error: error)
        }
    }

    private func copyText(_ resolved: ResolvedAction) -> BridgeResponse {
        guard let text = resolved.clipboardText else {
            return BridgeResponse.refused(
                requestID: resolved.requestID, action: resolved.action,
                error: NexusError.validation("clipboardEmpty", "There was no text to copy.",
                                             recovery: "Choose the text in Nexus and try again."))
        }
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        guard pasteboard.setString(text, forType: .string) else {
            return BridgeResponse.refused(
                requestID: resolved.requestID, action: resolved.action,
                error: NexusError(domain: .unsupported, code: "clipboardRefused",
                                  message: "macOS would not let Nexus put that text on the clipboard.",
                                  recovery: "Copy the text from the Nexus page by hand with ⌘C."))
        }
        return completed(resolved, summary: resolved.summary)
    }

    private func openURL(_ resolved: ResolvedAction) -> BridgeResponse {
        guard let url = resolved.resolvedURL else {
            return BridgeResponse.refused(
                requestID: resolved.requestID, action: resolved.action,
                error: NexusError.validation("noURL", "There was no web address to open.",
                                             recovery: "Try the action again."))
        }
        // `resolvedURL` came out of `SecurityCore.URLValidator`, so it is already
        // an http/https address with no credentials and no private host. It is
        // handed to whichever browser the *user* set as their default; the shell
        // never chooses an application on a page's behalf.
        guard NSWorkspace.shared.open(url) else {
            return BridgeResponse.refused(
                requestID: resolved.requestID, action: resolved.action,
                error: NexusError(domain: .unsupported, code: "noBrowser",
                                  message: "macOS could not open \(url.host ?? url.absoluteString) in a browser.",
                                  recovery: "Set a default browser in System Settings › Desktop & Dock › Default web browser, then try again."))
        }
        return completed(resolved, summary: resolved.summary)
    }

    /// The Bridge's own status, merged with what the shell knows about itself.
    ///
    /// When the Bridge is not running the shell still answers, because the
    /// interface needs to be able to say *why* something is unavailable. It never
    /// claims a permission is granted that it has not observed.
    private func status(_ resolved: ResolvedAction, includePermissions: Bool) -> BridgeResponse {
        let permissions: [BridgeStatusReport.PermissionStatus] = includePermissions
            ? MacPermission.allCases.map { permission in
                let state = permission == .fullDisk
                    ? BridgeStatusReport.PermissionState.notApplicable
                    : (environment.permissionStates[permission] ?? .notDetermined)
                return BridgeStatusReport.PermissionStatus(
                    permission: permission,
                    state: state,
                    nextStep: state == .granted
                        ? "Nothing to do."
                        : "Open System Settings › Privacy & Security › \(permission.title) and switch Nexus OS on. \(permission.degradedBehaviour)")
            }
            : []

        let endpoint: BridgeEndpoint?
        if case .available(let discovered) = environment.bridgeAvailability { endpoint = discovered } else { endpoint = nil }

        let report = BridgeStatusReport(
            bridgeVersion: endpoint?.bridgeVersion ?? "not installed",
            isPaused: environment.isPaused,
            pauseReason: environment.settings.pauseReason,
            pairedDeviceCount: endpoint == nil ? 0 : 1,
            permissions: permissions,
            loopbackPort: endpoint?.port ?? 0,
            uptimeSeconds: Int(ProcessInfo.processInfo.systemUptime))

        var summary = resolved.summary
        if endpoint == nil {
            summary = "Nexus Desktop is running. The Mac Bridge is not installed, so actions that open apps or arrange windows are unavailable."
        }
        return BridgeResponse(requestID: resolved.requestID, action: resolved.action,
                              status: .completed, summary: summary, result: .status(report))
    }

    private func completed(_ resolved: ResolvedAction, summary: String) -> BridgeResponse {
        BridgeResponse(requestID: resolved.requestID, action: resolved.action,
                       status: .completed, summary: summary, result: BridgeResult.none)
    }
}
#endif
