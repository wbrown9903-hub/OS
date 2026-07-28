import Foundation
import AppCore
import SecurityCore
import BridgeProtocol
import BridgeSecurity
import ApplicationCatalogue

/// The single decision point between an admitted request and anything actually
/// happening on the Mac.
///
/// It does four things, in order, for every request:
///
/// 1. **Schema validation** — each parameter type's own `validated()` runs, so
///    empty names, absurd window sizes, over-long text and malformed MCP
///    arguments are rejected with a message naming the field.
/// 2. **Resolution through the existing guards** — file and folder paths go
///    through `SecurityCore.PathGuard` (which resolves symlinks before comparing,
///    so `../` and a symlink pointing out of a granted root are both refused);
///    web addresses go through `SecurityCore.URLValidator` (which refuses
///    `javascript:`, `data:`, `file:`, credentials-in-URL and private addresses);
///    application names go through the portable `ApplicationCatalogue`.
/// 3. **Permission** — `SecurityCore.PermissionEngine` decides allow / confirm /
///    deny from the user's `PermissionPolicy` and the request's `ContentOrigin`.
///    The validator may *raise* the requirement afterwards (Terminal always
///    confirms; clipboard and shortcut actions from a non-user origin always
///    confirm) but never lowers it.
/// 4. **Audit** — every outcome, including every denial, is written to the
///    `AuditLog` with the same summary sentence the user saw.
public struct ActionValidator: Sendable {
    private let engine = PermissionEngine()
    private let redactor = SecretRedactor()
    private let auditLog: AuditLog
    private let dates: DateProvider

    public init(auditLog: AuditLog, dates: DateProvider = SystemDateProvider()) {
        self.auditLog = auditLog
        self.dates = dates
    }

    // MARK: - Entry points

    /// Validates a request that already passed `BridgeGuard.admit`.
    public func validate(_ admitted: AdmittedRequest, context: ValidationContext) -> ValidationOutcome {
        validate(envelope: admitted.envelope, context: context)
    }

    public func validate(envelope: BridgeRequestEnvelope, context: ValidationContext) -> ValidationOutcome {
        let action = envelope.action
        do {
            try envelope.checkedActionConsistency()
            let payload = try envelope.payload.validated()
            try context.checkPermission(for: action)
            let resolved = try resolve(payload: payload, envelope: envelope, context: context)
            return decide(resolved, context: context)
        } catch let error as NexusError {
            return denied(action: action, requestID: envelope.requestID,
                          summary: envelope.payload.summary, impact: action.baselineImpact,
                          origin: envelope.requestOrigin, error: error)
        } catch {
            let wrapped = NexusError.validation("unexpected", "That action could not be checked and was refused.",
                                                recovery: "Try again. If it keeps happening, quit and reopen Nexus OS.")
            return denied(action: action, requestID: envelope.requestID,
                          summary: envelope.payload.summary, impact: action.baselineImpact,
                          origin: envelope.requestOrigin, error: wrapped)
        }
    }

    /// Decodes and validates raw bytes. Used by the tests and by any caller that
    /// has already established transport trust some other way. An unknown action
    /// becomes a readable refusal here rather than a decoding crash.
    public func validate(rawBody: Data, context: ValidationContext) -> ValidationOutcome {
        do {
            let envelope = try BridgeRequestDecoder.decodeEnvelope(rawBody)
            return validate(envelope: envelope, context: context)
        } catch let error as NexusError {
            auditLog.record(AuditRecord(timestamp: dates.now, subject: "bridge.unknown",
                                        summary: "A request the Bridge could not understand was refused.",
                                        impact: .system, requestOrigin: .external,
                                        outcome: .denied, detail: error.description))
            return .deny(error)
        } catch {
            let wrapped = NexusError.validation("unreadableRequest", "A request to the Mac Bridge could not be read.",
                                                recovery: "Update Nexus OS so the app and the Bridge match, then try again.")
            return .deny(wrapped)
        }
    }

    // MARK: - Resolution

    private func resolve(payload: BridgeActionPayload, envelope: BridgeRequestEnvelope,
                         context: ValidationContext) throws -> ResolvedAction {
        let action = payload.action
        var impact = action.baselineImpact
        var applications: [ApplicationDescriptor] = []
        var resolvedURL: URL?
        var resolvedPath: URL?
        var notification: (title: String, body: String, subtitle: String?)?
        var clipboard: String?

        switch payload {
        case .launchApplication(let p):
            let entry = try context.catalogue.require(p.applicationID)
            applications = [entry]
            if entry.alwaysConfirm { impact = max(impact, .system) }

        case .focusApplication(let p):
            applications = [try context.catalogue.require(p.applicationID)]

        case .quitApplication(let p):
            applications = [try context.catalogue.require(p.applicationID)]

        case .openURL(let p):
            var policy = URLValidator.Policy.web
            policy.allowedHosts = context.approvals.allowedURLHosts
            resolvedURL = try URLValidator(policy: policy).validate(p.url)
            if let browser = p.inApplicationID {
                applications = [try context.catalogue.require(browser)]
            }

        case .openFile(let p):
            resolvedPath = try context.pathGuard.resolve(p.path)
            if let app = p.withApplicationID {
                let entry = try context.catalogue.require(app)
                applications = [entry]
                if entry.alwaysConfirm { impact = max(impact, .system) }
            }

        case .openFolder(let p):
            resolvedPath = try context.pathGuard.resolve(p.path)

        case .moveWindow(let p):
            applications = [try context.catalogue.require(p.target.applicationID)]

        case .resizeWindow(let p):
            applications = [try context.catalogue.require(p.target.applicationID)]

        case .tileWindows(let p):
            applications = try p.targets.map { try context.catalogue.require($0.applicationID) }

        case .restoreWorkspace(let p):
            applications = try p.applicationIDs.map { try context.catalogue.require($0) }
            for placement in p.placements {
                _ = try context.catalogue.require(placement.target.applicationID)
            }
            if applications.contains(where: \.alwaysConfirm) { impact = max(impact, .system) }

        case .showNotification(let p):
            // Notification text is user-visible and leaves the app's process, so
            // it is redacted here rather than trusting the caller not to include
            // a token in a "workflow finished" message.
            notification = (redactor.redact(p.title), redactor.redact(p.body), p.subtitle.map(redactor.redact))

        case .copyApprovedText(let p):
            guard p.text.count <= context.approvals.maximumClipboardCharacters else {
                throw NexusError.validation(
                    "clipboardTooLong",
                    "That text is longer than the \(context.approvals.maximumClipboardCharacters) character limit for the clipboard.",
                    recovery: "Copy a smaller piece of text, or raise the limit in Settings › Mac Bridge.")
            }
            clipboard = p.text

        case .runApprovedShortcut(let p):
            guard context.approvals.approvesShortcut(p.shortcutName) else {
                throw NexusError.permission(
                    "shortcutNotApproved",
                    "The shortcut “\(p.shortcutName)” is not on your approved list, so it was not run.",
                    recovery: "Open Settings › Mac Bridge › Shortcuts and tick it if you want Nexus OS to be able to run it.")
            }

        case .invokeApprovedMCPServer(let p):
            guard context.approvals.approvedMCPServerIDs.contains(p.serverID) else {
                throw NexusError.permission(
                    "mcpServerNotApproved",
                    "The MCP server “\(p.serverID)” is not connected in Nexus OS, so nothing was run.",
                    recovery: "Open Settings › MCP, connect that server and choose a permission mode for it.")
            }

        case .detectApplications(let p):
            applications = try p.applicationIDs.map { try context.catalogue.require($0) }

        case .bridgeStatus:
            break
        }

        // A request that did not come from the person at the keyboard can never
        // silently take the clipboard or run a shortcut, whatever the mode says.
        if !envelope.requestOrigin.grantsAuthority,
           action == .copyApprovedText || action == .runApprovedShortcut {
            impact = max(impact, .system)
        }

        return ResolvedAction(requestID: envelope.requestID, action: action, payload: payload,
                              impact: impact, summary: payload.summary,
                              requestOrigin: envelope.requestOrigin,
                              resolvedURL: resolvedURL, resolvedPath: resolvedPath,
                              applications: applications, redactedNotification: notification,
                              clipboardText: clipboard)
    }

    // MARK: - Permission

    private func decide(_ resolved: ResolvedAction, context: ValidationContext) -> ValidationOutcome {
        let descriptor = ToolDescriptor(id: resolved.action.toolIdentifier,
                                        name: resolved.action.title,
                                        toolDescription: resolved.summary,
                                        impact: resolved.impact,
                                        dataAccess: resolved.action.dataAccess)
        let decision = engine.evaluate(tool: descriptor, policy: context.policy,
                                       requestOrigin: resolved.requestOrigin)

        // Escalations the permission engine cannot know about, applied after it
        // so they can only tighten the result.
        let mustConfirm = alwaysConfirms(resolved)

        switch decision {
        case .deny(let error):
            return denied(action: resolved.action, requestID: resolved.requestID, summary: resolved.summary,
                          impact: resolved.impact, origin: resolved.requestOrigin, error: error)

        case .confirm(let prompt, _):
            let full = prompt + escalationNote(resolved)
            auditLog.record(AuditRecord(timestamp: dates.now, subject: resolved.action.toolIdentifier,
                                        summary: resolved.summary, impact: resolved.impact,
                                        requestOrigin: resolved.requestOrigin, outcome: .confirmed,
                                        detail: "Waiting for the user to approve."))
            return .confirm(resolved, prompt: full)

        case .allow(let reason):
            guard !mustConfirm else {
                let prompt = confirmationPrompt(for: resolved)
                auditLog.record(AuditRecord(timestamp: dates.now, subject: resolved.action.toolIdentifier,
                                            summary: resolved.summary, impact: resolved.impact,
                                            requestOrigin: resolved.requestOrigin, outcome: .confirmed,
                                            detail: "Always confirmed: " + escalationReason(resolved)))
                return .confirm(resolved, prompt: prompt)
            }
            auditLog.record(AuditRecord(timestamp: dates.now, subject: resolved.action.toolIdentifier,
                                        summary: resolved.summary, impact: resolved.impact,
                                        requestOrigin: resolved.requestOrigin, outcome: .allowed,
                                        detail: reason))
            return .allow(resolved)
        }
    }

    private func alwaysConfirms(_ resolved: ResolvedAction) -> Bool {
        if resolved.applications.contains(where: \.alwaysConfirm) { return true }
        if !resolved.requestOrigin.grantsAuthority,
           resolved.action == .copyApprovedText || resolved.action == .runApprovedShortcut { return true }
        return false
    }

    private func escalationReason(_ resolved: ResolvedAction) -> String {
        if let app = resolved.applications.first(where: \.alwaysConfirm) {
            return "\(app.displayName) is always confirmed, in every permission mode."
        }
        return "This did not come from you directly, so it is always confirmed."
    }

    private func escalationNote(_ resolved: ResolvedAction) -> String {
        alwaysConfirms(resolved) ? "\n" + escalationReason(resolved) : ""
    }

    private func confirmationPrompt(for resolved: ResolvedAction) -> String {
        var lines = ["Allow “\(resolved.action.title)”?", resolved.summary, resolved.impact.label]
        if !resolved.action.dataAccess.isEmpty {
            lines.append("It can reach: " + resolved.action.dataAccess.joined(separator: ", ") + ".")
        }
        if !resolved.requestOrigin.grantsAuthority {
            lines.append("Requested by: \(resolved.requestOrigin.explanation)")
        }
        lines.append(escalationReason(resolved))
        return lines.joined(separator: "\n")
    }

    // MARK: - Audit

    private func denied(action: BridgeAction, requestID: String, summary: String, impact: ActionImpact,
                        origin: ContentOrigin, error: NexusError) -> ValidationOutcome {
        auditLog.record(AuditRecord(timestamp: dates.now, subject: action.toolIdentifier,
                                    summary: summary, impact: impact, requestOrigin: origin,
                                    outcome: .denied, detail: error.description))
        return .deny(error)
    }

    /// Records what happened after the user answered a confirmation, so the audit
    /// trail shows the decision and not just the request.
    public func recordUserDecision(_ resolved: ResolvedAction, approved: Bool) {
        auditLog.record(AuditRecord(timestamp: dates.now, subject: resolved.action.toolIdentifier,
                                    summary: resolved.summary, impact: resolved.impact,
                                    requestOrigin: .user,
                                    outcome: approved ? .allowed : .cancelled,
                                    detail: approved ? "You approved this." : "You cancelled this."))
    }

    /// Records the result of actually performing the action.
    public func recordCompletion(_ resolved: ResolvedAction, error: NexusError? = nil) {
        auditLog.record(AuditRecord(timestamp: dates.now, subject: resolved.action.toolIdentifier,
                                    summary: resolved.summary, impact: resolved.impact,
                                    requestOrigin: resolved.requestOrigin,
                                    outcome: error == nil ? .completed : .failed,
                                    detail: error?.description ?? "Done."))
    }
}
