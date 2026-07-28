#if os(macOS)
import Foundation
import SwiftUI
import AppKit
import Combine
import NexusDesktopCore
import AppCore
import SecurityCore
import BridgeProtocol
import BridgeSecurity
import ApplicationCatalogue
import ActionValidator

/// Where the Nexus page is, from the shell's point of view.
enum ShellPhase: Equatable {
    /// No Nexus address has been chosen yet.
    case firstRun
    /// The web view is loading the Nexus origin.
    case loading
    /// The page is up.
    case connected
    /// Something is wrong, and the screen says what and what to do.
    case problem(ConnectionDiagnosis)

    var isConnected: Bool { self == .connected }
}

/// The composition root.
///
/// Everything the shell can do is assembled here once: settings, the audit log,
/// the validator, the permission inspector, notifications, the Bridge client, hot
/// keys and the emergency switch. Views read it and call it; they never build
/// their own copies, so there is exactly one audit log and one permission policy
/// in the process.
@MainActor
final class AppEnvironment: ObservableObject {
    static let shared = AppEnvironment()

    // MARK: - Published state

    @Published var settings: DesktopSettings {
        didSet { scheduleSettingsSave() }
    }
    @Published private(set) var phase: ShellPhase = .loading
    @Published private(set) var permissionStates: [MacPermission: BridgeStatusReport.PermissionState] = [:]
    @Published private(set) var bridgeAvailability: BridgeAvailability = .unknown
    @Published private(set) var recentActivity: [AuditRecord] = []
    @Published var isShowingPermissionTour = false
    @Published var isShowingUninstaller = false
    @Published private(set) var loadAttempt = 0

    /// The reason the escape hatch exists: one switch, checked before anything.
    let emergencySwitch = EmergencySwitch()

    // MARK: - Collaborators

    let layout: NexusFileLayout
    let auditLog: AuditLog
    let validator: ActionValidator.ActionValidator
    let notifications = NotificationService()
    let permissionInspector = PermissionInspector()
    let launchAtLogin = LaunchAtLoginController()
    let throttle = RequestThrottle()
    private(set) lazy var bridgeClient = BridgeClient(layout: layout)
    private(set) lazy var hotKeys = GlobalHotKeyCentre()

    private let settingsStore: JSONDocumentStore?
    private var saveWorkItem: DispatchWorkItem?
    private weak var window: NSWindow?
    /// Set by `NexusWebView` once the web view exists, so menu items and the
    /// menu-bar extra can reload, zoom and post events to the page.
    weak var webController: WebViewController?

    enum BridgeAvailability: Equatable {
        case unknown
        case available(BridgeEndpoint)
        case unavailable(NexusError)

        var isAvailable: Bool { if case .available = self { return true }; return false }
    }

    // MARK: - Construction

    private init() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let bundleURL = Bundle.main.bundleURL.pathExtension == "app" ? Bundle.main.bundleURL : nil
        let layout = NexusFileLayout.standard(home: home, applicationBundle: bundleURL)
        self.layout = layout

        let store = try? JSONDocumentStore(root: layout.settingsStoreRoot)
        self.settingsStore = store
        let loaded = store?.readIfPresent(DesktopSettings.self, name: NexusFileLayout.settingsDocumentName)
        self.settings = (loaded ?? DesktopSettings()).normalised()

        // Every audit record also goes to the log file the diagnostics bundle
        // collects, redacted on the way by `AuditLog` itself.
        let log = AuditLog(limit: 5000)
        self.auditLog = log
        self.validator = ActionValidator.ActionValidator(auditLog: log)

        Logger.shared.add(sink: FileLogSink(url: layout.logs.appendingPathComponent("nexus-desktop.log")))
        Logger.shared.install(redactor: { SecretRedactor().redact($0) })

        if settings.isPaused {
            emergencySwitch.engage(reason: settings.pauseReason ?? "You paused Nexus.")
        }
        self.phase = settings.hasCompletedFirstRun ? .loading : .firstRun
    }

    // MARK: - Lifecycle

    func applicationDidFinishLaunching() {
        NSApp.setActivationPolicy(.regular)
        refreshPermissionStates()
        refreshBridgeAvailability()
        installHotKeys()
        notifications.registerCategories()

        if settings.hasCompletedFirstRun && !settings.hasCompletedPermissionOnboarding {
            // The tour runs after the first successful load, so someone opening
            // Nexus for the first time sees Nexus, not a wall of permissions.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                guard let self, self.phase.isConnected else { return }
                self.isShowingPermissionTour = true
            }
        }

        NotificationCenter.default.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.handleWake() }
            }
        NotificationCenter.default.addObserver(
            forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.refreshPermissionStates() }
            }
    }

    func applicationWillTerminate() {
        saveSettingsNow()
        hotKeys.unregisterAll()
    }

    func adopt(window: NSWindow) {
        self.window = window
        if settings.restoreWindowFrame, let saved = settings.lastWindowFrame {
            window.setFrame(from: saved)
        }
        window.delegate = WindowFrameRecorder.shared
        WindowFrameRecorder.shared.onFrameChange = { [weak self] descriptor in
            Task { @MainActor in self?.settings.lastWindowFrame = descriptor }
        }
    }

    func showMainWindow() {
        NSApp.activate(ignoringOtherApps: true)
        if let window {
            window.makeKeyAndOrderFront(nil)
        } else {
            // The scene was closed; ask SwiftUI to open it again by id.
            NSApp.sendAction(Selector(("newWindowForTab:")), to: nil, from: nil)
            NSApp.windows.first?.makeKeyAndOrderFront(nil)
        }
    }

    // MARK: - Connection

    var origin: NexusOrigin { settings.origin }
    var navigationPolicy: NavigationPolicy { NavigationPolicy(origin: origin) }

    func markLoading() {
        phase = .loading
    }

    func markConnected() {
        let wasBroken = !phase.isConnected
        phase = .connected
        loadAttempt = 0
        if wasBroken { webController?.post(event: .connectionRestored) }
        if settings.hasCompletedFirstRun && !settings.hasCompletedPermissionOnboarding {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.isShowingPermissionTour = true
            }
        }
    }

    func markProblem(_ diagnosis: ConnectionDiagnosis) {
        phase = .problem(diagnosis)
        Logger.shared.warning("desktop.connection", diagnosis.headline, metadata: ["origin": origin.urlString])
    }

    func retryConnection() {
        loadAttempt += 1
        markLoading()
        webController?.load(origin: origin)
    }

    /// Applies a new address after the user typed one, and reloads.
    func connect(to raw: String) throws {
        let parsed = try NexusOrigin.parse(raw)
        settings.origin = parsed
        settings.hasCompletedFirstRun = true
        saveSettingsNow()
        loadAttempt = 0
        markLoading()
        webController?.load(origin: parsed)
    }

    private func handleWake() {
        guard case .problem(let diagnosis) = phase, diagnosis.isTransient else { return }
        retryConnection()
    }

    // MARK: - Pause (the visible escape back to plain macOS)

    var isPaused: Bool { emergencySwitch.isEngaged }

    func pause(reason: String = "You paused Nexus from the menu bar.") {
        emergencySwitch.engage(reason: reason)
        settings.isPaused = true
        settings.pauseReason = reason
        saveSettingsNow()
        auditLog.record(AuditRecord(timestamp: Date(), subject: "shell.pause",
                                    summary: "Nexus was paused. Nothing on this Mac can be changed by the Nexus page until it is resumed.",
                                    impact: .system, requestOrigin: .user, outcome: .completed, detail: reason))
        webController?.post(event: .pauseChanged(isPaused: true, reason: reason))
        objectWillChange.send()
    }

    func resume() {
        emergencySwitch.release()
        settings.isPaused = false
        settings.pauseReason = nil
        saveSettingsNow()
        auditLog.record(AuditRecord(timestamp: Date(), subject: "shell.resume",
                                    summary: "Nexus was resumed.", impact: .system,
                                    requestOrigin: .user, outcome: .completed, detail: "You resumed Nexus."))
        webController?.post(event: .pauseChanged(isPaused: false, reason: nil))
        objectWillChange.send()
    }

    func togglePause() {
        isPaused ? resume() : pause(reason: "You paused Nexus with the keyboard shortcut.")
    }

    /// The full escape: pause everything, drop the login item, and quit. After
    /// this the Mac behaves as though Nexus were not installed, without anything
    /// being deleted.
    func quitToPlainMacOS() {
        pause(reason: "You chose Quit to plain macOS.")
        _ = launchAtLogin.setEnabled(false)
        settings.launchAtLogin = false
        hotKeys.unregisterAll()
        saveSettingsNow()
        NSApp.terminate(nil)
    }

    var menuBarSymbolName: String {
        if isPaused { return "pause.circle" }
        switch phase {
        case .connected: return "circle.hexagongrid.fill"
        case .problem: return "exclamationmark.triangle"
        case .loading, .firstRun: return "circle.hexagongrid"
        }
    }

    // MARK: - Permissions

    func refreshPermissionStates() {
        Task { @MainActor in
            let observed = await permissionInspector.currentStates(launchAtLogin: launchAtLogin)
            for (permission, state) in observed where permissionStates[permission] != state {
                webController?.post(event: .permissionChanged(permission: permission, state: state))
            }
            permissionStates = observed
        }
    }

    var onboarding: PermissionOnboarding {
        PermissionOnboarding(
            states: permissionStates,
            declined: Set(settings.declinedPermissions.compactMap(MacPermission.init(rawValue:))))
    }

    func finishPermissionTour() {
        settings.hasCompletedPermissionOnboarding = true
        isShowingPermissionTour = false
        saveSettingsNow()
    }

    func recordPermissionDecline(_ permission: MacPermission) {
        settings.recordDecline(permission, at: Date())
        saveSettingsNow()
    }

    // MARK: - Bridge

    func refreshBridgeAvailability() {
        Task { @MainActor in
            let previous = bridgeAvailability.isAvailable
            switch bridgeClient.discoverEndpoint() {
            case .success(let endpoint):
                bridgeAvailability = .available(endpoint)
                if !previous { webController?.post(event: .bridgeAvailabilityChanged(isAvailable: true, reason: nil)) }
            case .failure(let error):
                bridgeAvailability = .unavailable(error)
                if previous {
                    webController?.post(event: .bridgeAvailabilityChanged(isAvailable: false, reason: error.message))
                }
            }
        }
    }

    /// Everything the validator needs, rebuilt from current settings each time so
    /// a permission the user just changed takes effect on the next request.
    func validationContext() -> ValidationContext {
        let roots = settings.grantedFolderPaths.map { URL(fileURLWithPath: $0) }
        return ValidationContext(
            pathGuard: PathGuard(roots: roots),
            catalogue: .standard,
            approvals: settings.approvals,
            policy: settings.bridgePolicy,
            permissionStates: permissionStates)
    }

    // MARK: - Activity

    func noteActivity(_ record: AuditRecord) {
        recentActivity.insert(record, at: 0)
        if recentActivity.count > 200 { recentActivity.removeLast(recentActivity.count - 200) }
    }

    // MARK: - Settings persistence

    private func scheduleSettingsSave() {
        saveWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor in self?.saveSettingsNow() }
        }
        saveWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: work)
    }

    func saveSettingsNow() {
        guard let settingsStore else { return }
        do {
            try settingsStore.write(settings.normalised(), name: NexusFileLayout.settingsDocumentName)
        } catch {
            Logger.shared.error("desktop.settings", "Nexus Desktop could not save its settings.",
                                metadata: ["reason": "\(error)"])
        }
    }

    // MARK: - Hot keys

    private func installHotKeys() {
        hotKeys.unregisterAll()
        if let summon = settings.summonShortcut {
            hotKeys.register(summon, named: "summon") { [weak self] in
                Task { @MainActor in
                    self?.showMainWindow()
                    self?.webController?.post(event: .shortcutPressed(name: "summon"))
                }
            }
        }
        if let pause = settings.pauseShortcut {
            hotKeys.register(pause, named: "pause") { [weak self] in
                Task { @MainActor in self?.togglePause() }
            }
        }
    }

    func reinstallHotKeys() { installHotKeys() }

    // MARK: - Version

    var shellVersion: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        return short ?? "0.1.0"
    }
}

/// Records the window frame so it can be restored next launch, without making
/// `AppEnvironment` an `NSWindowDelegate`.
final class WindowFrameRecorder: NSObject, NSWindowDelegate {
    static let shared = WindowFrameRecorder()
    var onFrameChange: ((String) -> Void)?

    func windowDidResize(_ notification: Notification) { record(notification) }
    func windowDidMove(_ notification: Notification) { record(notification) }

    private func record(_ notification: Notification) {
        guard let window = notification.object as? NSWindow, !window.isZoomed else { return }
        onFrameChange?(window.frameDescriptor)
    }
}

extension NSWindow {
    var frameDescriptor: String { NSStringFromRect(frame) }

    func setFrame(from descriptor: String) {
        let rect = NSRectFromString(descriptor)
        guard rect.width > 200, rect.height > 200 else { return }
        // Only restore a frame that is still on a connected display; a monitor
        // that has been unplugged must not send the window somewhere invisible.
        let visible = NSScreen.screens.contains { $0.visibleFrame.intersects(rect) }
        guard visible else { return }
        setFrame(rect, display: true)
    }
}
#endif
