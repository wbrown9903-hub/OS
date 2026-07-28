#if os(macOS)
import Foundation
import AppKit
import WebKit
import NexusDesktopCore
import AppCore
import SecurityCore
import BridgeProtocol
import ActionValidator

/// The only door between the Nexus page and this Mac.
///
/// Every message travels the same path, in this order, with no shortcut for any
/// action and no path that skips a step:
///
/// 1. **Provenance.** The message must come from the main frame of the configured
///    Nexus origin. A third-party iframe, or a frame on any other origin, is
///    refused before its contents are read.
/// 2. **Pause.** If the user has paused Nexus, nothing is done. This is checked
///    before decoding, exactly as `BridgeGuard` does it in the Bridge.
/// 3. **Rate.** A token bucket per action, so a page in a loop cannot bury the
///    user in confirmation sheets until they click Allow to make it stop.
/// 4. **Decode.** `WebMessageDecoder` turns the untyped body into a typed
///    `BridgeActionPayload` using the protocol's own `Codable` implementation.
///    An action name that is not in `BridgeAction` dies here.
/// 5. **Validate and decide.** `ActionValidator` runs the parameter checks, the
///    `PathGuard`, the `URLValidator`, the `ApplicationCatalogue` and then the
///    `PermissionEngine`. The shell adds no rules of its own and cannot lower the
///    result.
/// 6. **Confirm.** A `.confirm` outcome shows a native sheet. Nothing about it is
///    drawn by the page.
/// 7. **Perform.** Only a `ResolvedAction` — every string already turned into a
///    checked value — reaches the dispatcher.
/// 8. **Audit.** Every outcome is written to the `AuditLog`, including every
///    refusal, using the same sentence the user was shown.
///
/// # Why the page cannot widen its own authority
///
/// The `requestOrigin` of anything arriving here is fixed at
/// ``ContentOrigin/external``. The page does not send it, cannot set it, and no
/// field it can control influences it. `external` grants nothing: it is the value
/// `PermissionEngine` treats as untrusted, and it forces a confirmation for every
/// system-level action even in Trusted Workspace mode. The only thing that
/// upgrades a request to user authority is a person approving a native sheet, and
/// that happens *after* validation, against an action that has already been fully
/// resolved — so approving cannot change what was approved.
final class BridgeMessageHandler: NSObject, WKScriptMessageHandlerWithReply {
    private unowned let environment: AppEnvironment
    private weak var controller: WebViewController?

    init(environment: AppEnvironment) {
        self.environment = environment
        super.init()
    }

    func attach(to controller: WebViewController) {
        self.controller = controller
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        let body = message.body
        let frameOrigin = message.frameInfo.securityOrigin
        let isMainFrame = message.frameInfo.isMainFrame
        let frameScheme = frameOrigin.protocol
        let frameHost = frameOrigin.host
        let framePort = frameOrigin.port

        Task { @MainActor [weak self] in
            guard let self else {
                replyHandler(nil, "Nexus Desktop is closing.")
                return
            }
            let response = await self.handle(body: body,
                                             isMainFrame: isMainFrame,
                                             frameScheme: frameScheme,
                                             frameHost: frameHost,
                                             framePort: framePort)
            do {
                replyHandler(try WebBridgeReply.encode(response), nil)
            } catch {
                // The reply itself could not be encoded. Say so rather than
                // resolving the page's promise with nothing.
                replyHandler(nil, "Nexus Desktop could not describe the result of that action. "
                    + "Check the Activity list in Nexus to see whether it ran.")
            }
        }
    }

    // MARK: - The pipeline

    @MainActor
    private func handle(body: Any,
                        isMainFrame: Bool,
                        frameScheme: String,
                        frameHost: String,
                        framePort: Int) async -> BridgeResponse {
        let requestID = UUID().uuidString

        // 1. Provenance. Anything not from the Nexus page's own main frame is
        //    refused without being read.
        guard isMainFrame else {
            return refuse(requestID: requestID, action: .bridgeStatus, error: NexusError.security(
                "requestFromSubframe",
                "Something embedded inside the Nexus page tried to control this Mac, so it was refused.",
                recovery: "Nothing was done. If you were not expecting this, choose Pause Nexus in the menu bar and report it."))
        }
        guard environment.origin.matches(scheme: frameScheme, host: frameHost, port: framePort) else {
            return refuse(requestID: requestID, action: .bridgeStatus, error: NexusError.security(
                "requestFromOtherOrigin",
                "A page that is not your Nexus (\(frameHost)) tried to control this Mac, so it was refused.",
                recovery: "Nothing was done. Check the Nexus address in Settings › Connection, and choose Pause Nexus if you did not expect this."))
        }

        // 2. Paused means paused — checked before the body is even decoded.
        if environment.isPaused {
            let error = EmergencySwitch.pausedError(reason: environment.settings.pauseReason)
            environment.auditLog.record(AuditRecord(
                timestamp: Date(), subject: "shell.paused",
                summary: "A request from the Nexus page was refused because Nexus is paused.",
                impact: .system, requestOrigin: .external, outcome: .denied, detail: error.description))
            return refuse(requestID: requestID, action: .bridgeStatus, error: error)
        }

        // 3./4. Decode into a typed request.
        let message: WebBridgeMessage
        do {
            message = try WebMessageDecoder.decode(body: body)
        } catch let error as NexusError {
            environment.auditLog.record(AuditRecord(
                timestamp: Date(), subject: "shell.unknownRequest",
                summary: "A request from the Nexus page could not be understood and was refused.",
                impact: .system, requestOrigin: .external, outcome: .denied, detail: error.description))
            return refuse(requestID: requestID, action: .bridgeStatus, error: error)
        } catch {
            return refuse(requestID: requestID, action: .bridgeStatus, error: NexusError.validation(
                "unreadableRequest",
                "A request from the Nexus page could not be read.",
                recovery: "Reload Nexus. If it keeps happening, update Nexus OS so the app and the interface match."))
        }

        let action = message.action

        // 3. Rate limit, now that the action is known.
        do {
            try environment.throttle.admit(action)
        } catch let error as NexusError {
            environment.auditLog.record(AuditRecord(
                timestamp: Date(), subject: action.toolIdentifier,
                summary: message.payload.summary, impact: action.baselineImpact,
                requestOrigin: .external, outcome: .denied, detail: error.description))
            return refuse(requestID: requestID, action: action, error: error)
        } catch {
            return refuse(requestID: requestID, action: action, error: RequestThrottle.tooFast(action))
        }

        // 5. Validate and decide. `requestOrigin` is fixed here, not read from
        //    the message: the page states no authority for itself.
        let envelope = BridgeRequestEnvelope(
            requestID: requestID,
            deviceID: environment.bridgeClient.deviceIdentifier,
            counter: 0,                       // the shell's own validation pass does not consume a counter
            issuedAt: Date(),
            origin: environment.bridgeClient.transportOrigin,
            requestOrigin: .external,
            payload: message.payload)

        let outcome = environment.validator.validate(envelope: envelope, context: environment.validationContext())

        switch outcome {
        case .deny(let error):
            // Already audited by the validator.
            controller?.show(refusal: error)
            return refuse(requestID: requestID, action: action, error: error)

        case .allow(let resolved):
            return await perform(resolved, userApproved: false)

        case .confirm(let resolved, let prompt):
            // 6. A native sheet. The page draws none of this and learns only the
            //    final answer.
            let approved = await ConfirmationSheet.present(prompt: prompt,
                                                           action: resolved.action,
                                                           impact: resolved.impact,
                                                           window: NSApp.keyWindow)
            environment.validator.recordUserDecision(resolved, approved: approved)
            guard approved else {
                return BridgeResponse.refused(
                    requestID: requestID, action: action,
                    error: NexusError(domain: .cancelled, code: "userDeclined",
                                      message: "You did not allow “\(action.title)”, so nothing was done.",
                                      recovery: "If you meant to allow it, ask Nexus to try again. "
                                          + "You can change how often you are asked in Settings › Mac Bridge."))
            }
            return await perform(resolved, userApproved: true)
        }
    }

    // MARK: - Performing

    @MainActor
    private func perform(_ resolved: ResolvedAction, userApproved: Bool) async -> BridgeResponse {
        let response = await ActionDispatcher(environment: environment)
            .perform(resolved, userApproved: userApproved)
        environment.validator.recordCompletion(resolved, error: response.error)
        if let record = environment.auditLog.all.last { environment.noteActivity(record) }
        return response
    }

    @MainActor
    private func refuse(requestID: String, action: BridgeAction, error: NexusError) -> BridgeResponse {
        BridgeResponse.refused(requestID: requestID, action: action, error: error)
    }
}
#endif
