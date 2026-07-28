import Foundation
import AppCore
import SecurityCore
import BridgeProtocol

/// The contract between the JavaScript running in the Nexus page and the Swift
/// shell hosting it.
///
/// # The one rule
///
/// A page may *ask* for any action in ``BridgeAction``. It may not name an action
/// that is not in that enum, it may not choose its own request identifier, and it
/// may not state its own authority. The `requestOrigin` of anything arriving from
/// the web view is fixed by Swift at ``ContentOrigin/external`` — the value that
/// grants nothing. The only way a request becomes user-authorised is for a person
/// to approve a native confirmation sheet, and that happens after validation, on
/// an already-resolved action.
///
/// Consequently there is nothing a page can put in a message that widens what it
/// is allowed to do. The worst a hostile page can achieve is a confirmation
/// sheet the user did not expect — which is visible, cancellable, and audited.
public enum WebBridgeContract {
    /// The name of the `WKScriptMessageHandlerWithReply` the shell installs.
    /// One handler, one name, one message shape.
    public static let handlerName = "nexus"

    /// The property the shim defines on `window`.
    public static let globalName = "nexus"

    /// Bumped when the shape of a message or a reply changes.
    public static let apiVersion = "nexus-desktop/1"

    /// Hard ceiling on a single message, mirroring the Bridge's own body limit so
    /// a page cannot make the shell allocate more than the Bridge would.
    public static let maximumMessageBytes = BridgeLimits.maximumBodyBytes

    /// The JavaScript injected at document start, in the page world, main frame
    /// only.
    ///
    /// It is generated from ``BridgeAction/allCases`` so the list a page can see
    /// is, by construction, the list Swift will accept — adding an action to the
    /// protocol updates this automatically, and there is no second list to forget.
    ///
    /// The shim is a **convenience, not a control**. Swift re-checks everything;
    /// a page that ignores `window.nexus` and posts to the message handler
    /// directly gets exactly the same treatment.
    public static func bootstrapJavaScript(shellVersion: String) -> String {
        let actionList = BridgeAction.allCases
            .map { "\"\($0.rawValue)\"" }
            .joined(separator: ",")

        return """
        (function () {
          "use strict";
          var handler = window.webkit
            && window.webkit.messageHandlers
            && window.webkit.messageHandlers.\(handlerName);
          if (!handler) { return; }

          var ACTIONS = Object.freeze([\(actionList)]);

          function request(action, parameters) {
            if (typeof action !== "string") {
              return Promise.reject(new Error("nexus.request(action, parameters): action must be a string."));
            }
            if (ACTIONS.indexOf(action) === -1) {
              return Promise.reject(new Error(
                "Nexus Desktop has no action called \\"" + action + "\\". Update Nexus OS so the app and the shell match."));
            }
            if (parameters !== undefined && (typeof parameters !== "object" || parameters === null || Array.isArray(parameters))) {
              return Promise.reject(new Error("nexus.request(action, parameters): parameters must be a plain object."));
            }
            return handler.postMessage({
              kind: "action",
              apiVersion: "\(apiVersion)",
              action: action,
              parameters: parameters || {}
            });
          }

          var api = {
            apiVersion: "\(apiVersion)",
            protocolVersion: "\(BridgeProtocolDocumentation.protocolVersion)",
            shellVersion: "\(shellVersion)",
            platform: "macos",
            isDesktopShell: true,
            actions: ACTIONS,
            request: request,
            status: function () { return request("bridgeStatus", { includePermissions: true }); }
          };
          Object.freeze(api);

          try {
            Object.defineProperty(window, "\(globalName)", {
              value: api, writable: false, configurable: false, enumerable: true
            });
          } catch (error) {
            // Another script already defined it. Swift does not trust the page's
            // copy for anything, so this is a page bug, not a security problem.
            return;
          }

          window.dispatchEvent(new CustomEvent("nexus:ready", { detail: {
            shellVersion: api.shellVersion,
            protocolVersion: api.protocolVersion,
            actions: ACTIONS
          }}));
        })();
        """
    }

    /// Delivers a shell-originated event to the page. Used for pause/resume,
    /// permission changes and connection state, so the interface can label data
    /// honestly instead of guessing.
    ///
    /// The payload is encoded by `JSONSerialization` on the Swift side and
    /// embedded as a JSON literal, so no string a person or a workflow typed is
    /// ever concatenated into executable JavaScript.
    public static func dispatchEventJavaScript(name: String, jsonPayload: String) -> String {
        """
        (function () {
          try {
            window.dispatchEvent(new CustomEvent("nexus:event", { detail: {
              name: \(quoted(name)),
              payload: \(jsonPayload)
            }}));
          } catch (error) { /* the page is mid-navigation; nothing to do */ }
        })();
        """
    }

    /// Minimal JSON string literal escaping, used only for names the shell itself
    /// controls. Kept here so no caller has to hand-roll it.
    public static func quoted(_ value: String) -> String {
        var out = "\""
        for scalar in value.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 || scalar.value == 0x2028 || scalar.value == 0x2029 {
                    out += String(format: "\\u%04x", scalar.value)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        return out + "\""
    }
}

/// A message from the page that survived decoding. Holding one means the body was
/// a plain object of the expected shape, named a known action, and carried
/// parameters that decoded into that action's own parameter type.
///
/// It carries no authority: `ActionValidator` has not run yet.
public struct WebBridgeMessage: Sendable, Equatable {
    public let payload: BridgeActionPayload
    public var action: BridgeAction { payload.action }

    public init(payload: BridgeActionPayload) {
        self.payload = payload
    }
}

/// Turns the untyped value WebKit hands over into a typed request, or into a
/// `NexusError` with a next step.
///
/// Everything about this is deliberately strict:
///
/// - the body must be a JSON object, not an array, a string or a number;
/// - `kind` must be `action` — a future message kind must be added here to exist;
/// - unknown top-level keys are refused rather than ignored, so a page cannot
///   smuggle a field that a later version of the shell might start honouring;
/// - the request identifier is generated by Swift and never read from the page.
public enum WebMessageDecoder {
    /// Keys the shell understands at the top level of a message.
    public static let allowedKeys: Set<String> = ["kind", "apiVersion", "action", "parameters"]

    public static func decode(body: Any) throws -> WebBridgeMessage {
        guard let object = body as? [String: Any] else {
            throw NexusError.validation(
                "messageNotAnObject",
                "The Nexus page sent a request Nexus Desktop could not read.",
                recovery: "Reload Nexus. If it keeps happening, update Nexus OS so the app and the interface match.")
        }
        let unknown = Set(object.keys).subtracting(allowedKeys).sorted()
        guard unknown.isEmpty else {
            throw NexusError.security(
                "unknownMessageFields",
                "The Nexus page sent a request containing fields Nexus Desktop does not accept (\(unknown.joined(separator: ", "))), so it was refused.",
                recovery: "Nothing was done. Update Nexus OS so the app and the interface match, then try again.")
        }
        guard let kind = object["kind"] as? String else {
            throw NexusError.validation(
                "messageWithoutKind",
                "The Nexus page sent a request that did not say what it was.",
                recovery: "Reload Nexus. If it keeps happening, update Nexus OS.")
        }
        guard kind == "action" else {
            throw NexusError.unsupported(
                "A request of type “\(kind)”",
                recovery: "This version of Nexus Desktop only performs actions. Update Nexus OS so the app and the interface match.")
        }
        guard let actionName = object["action"] as? String else {
            throw NexusError.validation(
                "messageWithoutAction",
                "The Nexus page asked Nexus Desktop to do something without saying what.",
                recovery: "Reload Nexus. If it keeps happening, update Nexus OS.")
        }
        // Turns an unrecognised name into "the app and the Bridge are different
        // versions" rather than a decoding failure. This is the closed-set check.
        let action = try BridgeAction.decode(name: actionName)

        let parameters = object["parameters"] ?? [String: Any]()
        guard let parameterObject = parameters as? [String: Any] else {
            throw NexusError.validation(
                "badParameters",
                "The details sent with “\(action.title)” were not in the expected form.",
                recovery: "Update Nexus OS so the app and the interface match, then try again.")
        }

        // Re-serialise through JSON so the payload is decoded by exactly the same
        // `Codable` implementation the Bridge uses over the wire. There is one
        // decoder for this protocol, not two.
        let document: [String: Any] = ["action": action.rawValue, "parameters": parameterObject]
        guard JSONSerialization.isValidJSONObject(document) else {
            throw NexusError.validation(
                "parametersNotJSON",
                "The details sent with “\(action.title)” contained values that are not valid JSON.",
                recovery: "Update Nexus OS so the app and the interface match, then try again.")
        }
        let data: Data
        do {
            data = try JSONSerialization.data(withJSONObject: document, options: [.sortedKeys])
        } catch {
            throw NexusError.validation(
                "parametersUnreadable",
                "The details sent with “\(action.title)” could not be read.",
                recovery: "Update Nexus OS so the app and the interface match, then try again.")
        }
        guard data.count <= WebBridgeContract.maximumMessageBytes else {
            throw NexusError.security(
                "messageTooLarge",
                "The Nexus page sent more information than Nexus Desktop accepts in one request, so it was ignored.",
                recovery: "Nothing was done. Try the action again with less information.")
        }

        let payload: BridgeActionPayload
        do {
            payload = try NexusJSON.decoder.decode(BridgeActionPayload.self, from: data)
        } catch let error as NexusError {
            throw error
        } catch {
            throw NexusError.validation(
                "badParameters",
                "The details sent with “\(action.title)” were not in the expected form.",
                recovery: "Update Nexus OS so the app and the interface match, then try again.")
        }
        return WebBridgeMessage(payload: payload)
    }
}

/// The reply the page receives. It is a `BridgeResponse` — the same type the
/// Bridge answers with — so the interface has one result shape to handle whether
/// an action was performed in the shell or forwarded to the Bridge.
public enum WebBridgeReply {
    /// Encodes a response into the plain JSON object WebKit can hand back to a
    /// JavaScript promise.
    public static func encode(_ response: BridgeResponse) throws -> [String: Any] {
        let data = try NexusJSON.encode(response)
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NexusError.storage(
                "replyNotEncodable",
                "Nexus Desktop could not describe the result of that action.",
                recovery: "The action itself may still have run. Check the Activity list in Nexus, then try again.")
        }
        return object
    }

    /// A refusal, in the same shape, so the page never has to distinguish "the
    /// call failed" from "the answer was no".
    public static func refusal(action: BridgeAction, requestID: String, error: NexusError) -> BridgeResponse {
        BridgeResponse.refused(requestID: requestID, action: action, error: error)
    }
}
