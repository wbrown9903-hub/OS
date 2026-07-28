#if os(macOS)
import Foundation
import WebKit
import NexusDesktopCore
import AppCore
import BridgeProtocol

/// Builds the one `WKWebView` the shell ever creates, with every setting chosen
/// deliberately.
///
/// # What is switched on
///
/// - JavaScript, because Nexus Cloud is a React application.
/// - The persistent data store, so signing in survives a relaunch. Signing out
///   and clearing it is a real menu item and part of the uninstaller.
/// - Fraudulent-site warnings.
///
/// # What is switched off, and why
///
/// - **Back/forward swipe gestures.** Nexus is an application, not a browser;
///   swiping "back" out of a workspace is not a thing that should happen.
/// - **Magnification.** Zoom is a menu item bound to ⌘+/⌘− that changes
///   `pageZoom`, so the layout reflows like it does on the web instead of being
///   scaled like an image.
/// - **Link previews.** Force-touching a link to peek at another site is browser
///   behaviour and would show content from an origin the shell refuses to load.
/// - **Developer extras**, unless the build is a debug build.
///
/// # What is never done
///
/// - No `allowFileAccessFromFileURLs`, no `allowUniversalAccessFromFileURLs`, no
///   `WebSecurityEnabled = false`, no custom URL scheme handler that can read the
///   disk. There is no supported way for the page to reach a `file:` URL.
/// - No credential is ever injected. The authentication challenge handler
///   performs default handling and returns no credential, so a server that asks
///   for HTTP authentication gets macOS's own dialog, not something the shell
///   fabricated.
/// - No custom certificate trust. A certificate macOS does not trust produces the
///   connection error screen, with no "continue anyway" button.
enum WebViewFactory {

    static func makeConfiguration(origin: NexusOrigin,
                                  shellVersion: String,
                                  messageHandler: BridgeMessageHandler) -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()

        // The signed-in session belongs to the user, so it persists. It is
        // deleted by "Sign Out and Clear Data" and by the uninstaller.
        configuration.websiteDataStore = .default()

        let preferences = WKPreferences()
        preferences.isFraudulentWebsiteWarningEnabled = true
        preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.preferences = preferences

        let pagePreferences = WKWebpagePreferences()
        pagePreferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = pagePreferences

        configuration.suppressesIncrementalRendering = false
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        configuration.applicationNameForUserAgent = "NexusDesktop/\(shellVersion)"

        // App-Bound Domains stop a page from using `evaluateJavaScript`, cookie
        // access and other privileged WebKit APIs against anything not listed in
        // the bundle. It can only be enabled when the configured origin is one of
        // the domains declared in Info.plist — a user-chosen self-hosted address
        // cannot be, since the list is baked into the signed bundle. The shell
        // therefore turns it on when it applies and relies on the navigation
        // policy, which applies always, the rest of the time.
        if appBoundDomains().contains(origin.host) {
            configuration.limitsNavigationsToAppBoundDomains = true
        }

        let controller = WKUserContentController()
        // One handler, one name, replies delivered as JavaScript promises.
        controller.addScriptMessageHandler(messageHandler, contentWorld: .page,
                                           name: WebBridgeContract.handlerName)
        controller.addUserScript(WKUserScript(
            source: WebBridgeContract.bootstrapJavaScript(shellVersion: shellVersion),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true,
            in: .page))
        // A small amount of chrome-removal that belongs to the shell rather than
        // to Nexus Cloud: the window is draggable by its own title bar, so the
        // page must not fight it, and text selection of the frame is meaningless.
        controller.addUserScript(WKUserScript(
            source: Self.shellStyleScript,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true,
            in: .page))
        configuration.userContentController = controller

        return configuration
    }

    static func makeWebView(configuration: WKWebViewConfiguration) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsMagnification = false
        webView.allowsLinkPreview = false
        webView.underPageBackgroundColor = .windowBackgroundColor
        webView.autoresizingMask = [.width, .height]
        #if DEBUG
        // Only ever in a debug build. A shipped Nexus has no inspector, and no
        // private API is used to get one.
        webView.isInspectable = true
        #endif
        return webView
    }

    /// The domains declared in `WKAppBoundDomains` in Info.plist.
    private static func appBoundDomains() -> Set<String> {
        let raw = Bundle.main.object(forInfoDictionaryKey: "WKAppBoundDomains") as? [String] ?? []
        return Set(raw.map { $0.lowercased() })
    }

    /// Tells the page it is inside the desktop shell so it can hide anything that
    /// only makes sense in a browser tab, and marks the top strip as a window drag
    /// region. Nothing here grants the page any capability.
    private static let shellStyleScript = """
    (function () {
      var root = document.documentElement;
      if (!root) { return; }
      root.setAttribute("data-nexus-shell", "macos");
      root.style.setProperty("--nx-shell-titlebar-height", "38px");
    })();
    """
}
#endif
