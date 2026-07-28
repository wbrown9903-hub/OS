import Foundation
import AppCore
import SecurityCore

/// What the shell does with an attempted navigation.
public enum NavigationDecision: Sendable, Equatable {
    /// Load it in the Nexus web view. Only ever returned for the Nexus origin.
    case allowInApp
    /// Hand it to the user's default browser via `NSWorkspace` and cancel the
    /// navigation. Nexus Desktop is not a browser and never becomes one.
    case openExternally(URL)
    /// Refuse, and tell the user why and what to do.
    case refuse(NexusError)

    public var isAllowedInApp: Bool { if case .allowInApp = self { return true }; return false }
    public var externalURL: URL? { if case .openExternally(let url) = self { return url }; return nil }
    public var refusal: NexusError? { if case .refuse(let error) = self { return error }; return nil }
}

/// Decides where every navigation goes.
///
/// The rule is short enough to hold in your head: **the Nexus origin renders in
/// the window, ordinary web links go to your browser, and everything else is
/// refused.** There is no address bar, no way to type a destination, and no
/// scheme that reaches a local handler.
///
/// This is a pure value so the whole table is testable without WebKit.
public struct NavigationPolicy: Sendable {
    public let origin: NexusOrigin

    /// Schemes the shell will hand to the user's default browser. Anything not
    /// listed is refused rather than passed to `NSWorkspace`, because
    /// `NSWorkspace.open` will happily launch a registered handler for a scheme
    /// nobody vetted — which is precisely the authority the shell must not lend
    /// to a web page.
    public static let externallyOpenableSchemes: Set<String> = ["http", "https", "mailto", "tel"]

    public init(origin: NexusOrigin) {
        self.origin = origin
    }

    /// - Parameters:
    ///   - url: the navigation target, as WebKit reported it.
    ///   - isMainFrame: whether this navigation replaces the whole page.
    ///   - isRedirect: whether the server, rather than the user, chose it.
    public func decide(for url: URL?, isMainFrame: Bool, isRedirect: Bool = false) -> NavigationDecision {
        guard let url else {
            return .refuse(NexusError.security(
                "navigationWithoutAddress",
                "Something in the Nexus page tried to navigate without giving an address, so nothing was opened.",
                recovery: "Reload Nexus. If it keeps happening, report it — the page is not behaving as expected."))
        }
        guard let scheme = url.scheme?.lowercased(), !scheme.isEmpty else {
            return .refuse(Self.blockedScheme("(no type)", url: url))
        }

        // WebKit creates blank documents for iframes and for `window.open` before
        // the real URL arrives. Allowing them in sub-frames only keeps ordinary
        // pages working without ever letting a blank main frame replace Nexus.
        if scheme == "about" {
            let resource = url.absoluteString.lowercased()
            if !isMainFrame && (resource == "about:blank" || resource == "about:srcdoc") {
                return .allowInApp
            }
            return .refuse(Self.blockedScheme(scheme, url: url))
        }

        // Never negotiable, whatever the origin says: these execute code, read the
        // disk or reach an internal handler.
        if URLValidator.neverAllowedSchemes.contains(scheme) {
            return .refuse(Self.blockedScheme(scheme, url: url))
        }

        // The Nexus origin itself, and only it, renders in the window.
        if origin.matches(url) {
            return .allowInApp
        }

        guard Self.externallyOpenableSchemes.contains(scheme) else {
            return .refuse(Self.blockedScheme(scheme, url: url))
        }

        if scheme == "mailto" || scheme == "tel" {
            return decideContactLink(url, scheme: scheme)
        }

        // An ordinary web link. Validate it the same way every other outbound URL
        // in Nexus OS is validated before it reaches the browser: no credentials,
        // no private or metadata addresses, no homograph host.
        do {
            var policy = URLValidator.Policy.web
            policy.maximumLength = 2048
            let validated = try URLValidator(policy: policy).validate(url.absoluteString)
            return .openExternally(validated)
        } catch let error as NexusError {
            return .refuse(NexusError(
                domain: error.domain,
                code: error.code,
                message: "Nexus did not open that link: \(error.message)",
                recovery: error.recovery))
        } catch {
            return .refuse(Self.blockedScheme(scheme, url: url))
        }
    }

    /// A main-frame navigation away from the Nexus origin is the one case where
    /// refusing silently would be confusing: the page has already gone. The shell
    /// opens it in the browser instead and stays where it is, which is what the
    /// person meant by clicking a link inside an app.
    private func decideContactLink(_ url: URL, scheme: String) -> NavigationDecision {
        let body = url.absoluteString
        guard body.count <= 1024 else {
            return .refuse(NexusError.validation(
                "contactLinkTooLong",
                "That \(scheme == "tel" ? "phone" : "email") link was unusually long, so it was not opened.",
                recovery: "Copy the address out of the page and use your mail or phone app directly."))
        }
        guard !body.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7F }) else {
            return .refuse(NexusError.security(
                "contactLinkControlCharacters",
                "That \(scheme == "tel" ? "phone" : "email") link contained hidden characters, so it was not opened.",
                recovery: "Copy the address out of the page and use your mail or phone app directly."))
        }
        return .openExternally(url)
    }

    /// Applied to the response rather than the request, so a same-origin URL that
    /// answers with an attachment cannot turn the shell into a download manager.
    public func decideResponse(for url: URL, isMainFrame: Bool, canShowMIMEType: Bool) -> NavigationDecision {
        guard origin.matches(url) else {
            return .refuse(NexusError.security(
                "responseFromOtherSite",
                "A reply arrived from a site other than your Nexus, so it was not displayed.",
                recovery: "Reload Nexus. If this keeps happening, check the Nexus address in Settings › Connection."))
        }
        guard canShowMIMEType else {
            return .refuse(NexusError.unsupported(
                "That file",
                recovery: "Nexus Desktop shows the Nexus interface, not files. Use Save to download it, or open the link in your browser."))
        }
        return .allowInApp
    }

    private static func blockedScheme(_ scheme: String, url: URL) -> NexusError {
        NexusError.security(
            "blockedScheme",
            "Nexus refused to open a “\(scheme)” link, because that kind of link can run code or reach files on your Mac.",
            recovery: "Nothing was opened and nothing was changed. If you expected this link to work, copy it and open it yourself so you can see where it goes.")
    }
}
