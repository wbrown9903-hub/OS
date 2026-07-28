#if os(macOS)
import Foundation
import AppKit
import WebKit
import SwiftUI
import NexusDesktopCore
import AppCore
import SecurityCore

/// Owns the web view and enforces the navigation policy on it.
///
/// The policy itself lives in ``NavigationPolicy`` in the portable core and is
/// unit-tested there; this class is the thin adapter that asks it and acts on the
/// answer. Nothing here decides what is allowed — it only carries out the
/// decision and makes sure the user is told about a refusal rather than left
/// looking at a page that quietly did nothing.
@MainActor
final class WebViewController: NSObject, ObservableObject {
    let webView: WKWebView
    private unowned let environment: AppEnvironment
    private let messageHandler: BridgeMessageHandler
    private var retryWorkItem: DispatchWorkItem?
    private let backoff = RetryBackoff()

    /// A refusal worth telling the user about, shown as a transient banner over
    /// the page rather than an alert that interrupts them.
    @Published private(set) var lastRefusal: NexusError?

    init(environment: AppEnvironment) {
        self.environment = environment
        let handler = BridgeMessageHandler(environment: environment)
        self.messageHandler = handler
        let configuration = WebViewFactory.makeConfiguration(
            origin: environment.origin,
            shellVersion: environment.shellVersion,
            messageHandler: handler)
        self.webView = WebViewFactory.makeWebView(configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.pageZoom = environment.settings.pageZoom
        handler.attach(to: self)
        environment.webController = self
    }

    // MARK: - Driving the page

    func load(origin: NexusOrigin) {
        retryWorkItem?.cancel()
        environment.markLoading()
        var request = URLRequest(url: origin.url)
        // Always ask the network rather than serve a stale shell after an update.
        request.cachePolicy = .reloadRevalidatingCacheData
        request.timeoutInterval = 30
        webView.load(request)
    }

    func reload() {
        // `reloadFromOrigin` bypasses the cache, which is what a person means when
        // they press ⌘R because something looks wrong.
        if webView.url == nil {
            load(origin: environment.origin)
        } else {
            webView.reloadFromOrigin()
        }
    }

    func goHome() {
        load(origin: environment.origin)
    }

    func setZoom(_ zoom: Double) {
        let clamped = min(max(zoom, 0.5), 3.0)
        webView.pageZoom = clamped
        environment.settings.pageZoom = clamped
    }

    func adjustZoom(by delta: Double) {
        setZoom(environment.settings.pageZoom + delta)
    }

    func post(event: ShellEvent) {
        guard webView.url != nil else { return }
        webView.evaluateJavaScript(event.javaScript) { _, error in
            if let error {
                Logger.shared.debug("desktop.web", "A shell event could not be delivered to the page.",
                                    metadata: ["event": event.name, "reason": "\(error)"])
            }
        }
    }

    func show(refusal: NexusError) {
        lastRefusal = refusal
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            if self?.lastRefusal == refusal { self?.lastRefusal = nil }
        }
    }

    func dismissRefusal() { lastRefusal = nil }

    /// Signing out is a real action, not a suggestion to clear your browser.
    func signOutAndClearData() async {
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        await webView.configuration.websiteDataStore.removeData(ofTypes: types, modifiedSince: .distantPast)
        load(origin: environment.origin)
    }

    // MARK: - Automatic retry

    private func scheduleRetry() {
        retryWorkItem?.cancel()
        guard let delay = backoff.delay(forAttempt: environment.loadAttempt + 1) else { return }
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor in self?.environment.retryConnection() }
        }
        retryWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }
}

// MARK: - Navigation policy

extension WebViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let decision = environment.navigationPolicy.decide(
            for: navigationAction.request.url,
            isMainFrame: navigationAction.targetFrame?.isMainFrame ?? false)

        switch decision {
        case .allowInApp:
            decisionHandler(.allow)

        case .openExternally(let url):
            decisionHandler(.cancel)
            // A link leaves the app entirely. `NSWorkspace` hands it to whichever
            // application the *user* chose as their default; the shell never picks
            // an application for a URL a web page supplied.
            NSWorkspace.shared.open(url)
            Logger.shared.info("desktop.navigation", "Opened a link in the default browser.",
                               metadata: ["host": url.host ?? "-"])

        case .refuse(let error):
            decisionHandler(.cancel)
            show(refusal: error)
            Logger.shared.warning("desktop.navigation", error.message,
                                  metadata: ["url": navigationAction.request.url?.absoluteString ?? "-"])
        }
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard let url = navigationResponse.response.url else {
            decisionHandler(.cancel)
            return
        }
        let decision = environment.navigationPolicy.decideResponse(
            for: url,
            isMainFrame: navigationResponse.isForMainFrame,
            canShowMIMEType: navigationResponse.canShowMIMEType)

        guard decision.isAllowedInApp else {
            decisionHandler(.cancel)
            if let error = decision.refusal { show(refusal: error) }
            return
        }

        // A 5xx means the Nexus end is broken, and rendering its error page would
        // hide that behind something that looks like a Nexus screen. A 4xx is
        // allowed through, because a sign-in page is a legitimate 401.
        if let http = navigationResponse.response as? HTTPURLResponse,
           navigationResponse.isForMainFrame,
           (500...599).contains(http.statusCode) {
            decisionHandler(.cancel)
            environment.markProblem(.diagnose(httpStatus: http.statusCode, origin: environment.origin))
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        environment.markConnected()
        webView.pageZoom = environment.settings.pageZoom
        post(event: .pauseChanged(isPaused: environment.isPaused, reason: environment.settings.pauseReason))
        post(event: .bridgeAvailabilityChanged(isAvailable: environment.bridgeAvailability.isAvailable,
                                               reason: nil))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadFailure(error)
    }

    private func handleLoadFailure(_ error: Error) {
        let code = (error as NSError).code
        // A cancellation caused by our own policy decision is not a connection
        // problem and must not replace the page with an error screen.
        if code == NSURLErrorCancelled { return }
        let diagnosis = ConnectionDiagnosis.diagnose(urlErrorCode: code, origin: environment.origin)
        environment.markProblem(diagnosis)
        if diagnosis.isTransient { scheduleRetry() }
    }

    /// The shell never supplies a credential. Default handling means macOS's own
    /// dialog appears for HTTP authentication and the system trust evaluation
    /// decides certificates — there is no code path that accepts an untrusted one.
    func webView(_ webView: WKWebView,
                 didReceive challenge: URLAuthenticationChallenge,
                 completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        completionHandler(.performDefaultHandling, nil)
    }

    /// The web content process crashed. Reloading is the only sensible response,
    /// and saying so is better than a blank window.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Logger.shared.error("desktop.web", "The Nexus page stopped responding and was reloaded.")
        environment.markProblem(ConnectionDiagnosis(
            headline: "The Nexus page stopped responding",
            detail: "macOS ended the part of Nexus Desktop that draws the page, usually because it ran out of memory. Your work is saved on the Nexus side.",
            nextStep: "Choose Try Again to reload. If this keeps happening, close some other applications first.",
            remedy: .retry,
            isTransient: true))
        scheduleRetry()
    }
}

// MARK: - Window handling

extension WebViewController: WKUIDelegate {

    /// `target="_blank"` and `window.open`. Nexus Desktop never opens a second
    /// web view: an in-app link stays in the window, and an outside link goes to
    /// the browser. Returning nil is what tells WebKit not to create one.
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        switch environment.navigationPolicy.decide(for: url, isMainFrame: true) {
        case .allowInApp:
            webView.load(navigationAction.request)
        case .openExternally(let external):
            NSWorkspace.shared.open(external)
        case .refuse(let error):
            show(refusal: error)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        presentPageDialog(message: message, buttons: ["OK"]) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        presentPageDialog(message: message, buttons: ["OK", "Cancel"]) { index in
            completionHandler(index == 0)
        }
    }

    /// Text the page asked for is not a place to type a password, so the shell
    /// says where the prompt came from and offers no secure-entry field.
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Nexus is asking for some text"
        alert.informativeText = prompt
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        let response = alert.runModal()
        completionHandler(response == .alertFirstButtonReturn ? field.stringValue : nil)
    }

    /// The page asked to open a file picker. The chosen files are handed to the
    /// page as ordinary uploads; this does not widen what the Bridge may touch,
    /// because the Bridge's `PathGuard` roots are a separate list.
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.message = "Choose the file to give to Nexus."
        panel.begin { result in
            completionHandler(result == .OK ? panel.urls : nil)
        }
    }

    private func presentPageDialog(message: String, buttons: [String], completion: @escaping (Int) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Nexus"
        // The page's own text is informative, never the headline, so a page
        // cannot make its message look like it came from macOS or from Nexus
        // Desktop itself.
        alert.informativeText = message
        for title in buttons { alert.addButton(withTitle: title) }
        let response = alert.runModal()
        completion(response.rawValue - NSApplication.ModalResponse.alertFirstButtonReturn.rawValue)
    }
}

/// Puts the web view into SwiftUI.
struct NexusWebView: NSViewRepresentable {
    @EnvironmentObject private var environment: AppEnvironment
    let controller: WebViewController

    func makeNSView(context: Context) -> WKWebView {
        controller.load(origin: environment.origin)
        return controller.webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
#endif
