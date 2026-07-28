#if os(macOS)
import Foundation
import AppKit
import UserNotifications
import AppCore
import SecurityCore
import BridgeProtocol

/// Native notifications through `UNUserNotificationCenter`.
///
/// Three things matter here beyond "show a banner":
///
/// - **De-duplication.** A webhook can be delivered twice, and a sale sound must
///   never play twice. A request carrying a `deduplicationKey` is shown once;
///   the second attempt reports `duplicate` rather than silently succeeding, so
///   the caller can tell the difference.
/// - **Redaction.** The text arriving here has already been through
///   `SecretRedactor` in `ActionValidator`. A second pass is applied anyway,
///   because a notification is the easiest place in the product for a token to
///   leak onto a lock screen, and the cost of checking twice is nothing.
/// - **Honest refusal.** If the user has turned notifications off, the caller is
///   told exactly that, with the pane to turn it on — never a silent no-op.
final class NotificationService: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    enum PostResult {
        case posted
        case duplicate
        case permissionMissing(NexusError)
        case failed(NexusError)
    }

    private let centre = UNUserNotificationCenter.current()
    private let redactor = SecretRedactor()
    private let lock = NSLock()
    private var recentKeys: [String: Date] = [:]
    /// A key is considered a duplicate for this long. Long enough to cover a
    /// retried webhook, short enough that a daily reminder still fires.
    private let deduplicationWindow: TimeInterval = 6 * 60 * 60

    override init() {
        super.init()
        centre.delegate = self
    }

    func registerCategories() {
        let openNexus = UNNotificationAction(identifier: "nexus.open", title: "Open Nexus", options: [.foreground])
        let category = UNNotificationCategory(identifier: "nexus.default",
                                              actions: [openNexus],
                                              intentIdentifiers: [],
                                              options: [])
        centre.setNotificationCategories([category])
    }

    /// Asks for permission. Called once by the onboarding card, never in a loop:
    /// macOS shows its own prompt at most once, and re-requesting after a denial
    /// does nothing except make the app look broken.
    func requestAuthorisation() async -> BridgeStatusReport.PermissionState {
        do {
            let granted = try await centre.requestAuthorization(options: [.alert, .sound, .badge])
            return granted ? .granted : .denied
        } catch {
            return .denied
        }
    }

    func currentState() async -> BridgeStatusReport.PermissionState {
        let settings = await centre.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return .granted
        case .denied: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .notDetermined
        }
    }

    func post(title: String, body: String, subtitle: String?,
              sound: ShowNotificationParameters.NotificationSound,
              deduplicationKey: String?) async -> PostResult {
        let state = await currentState()
        guard state != .denied else {
            return .permissionMissing(NexusError.permission(
                "notificationsDenied",
                "Notifications are turned off for Nexus OS, so “\(redactor.redact(title))” was not shown.",
                recovery: "Open System Settings › Notifications › Nexus OS and switch Allow Notifications on. Until then, results appear in the Nexus window instead."))
        }

        if let key = deduplicationKey, isDuplicate(key) {
            return .duplicate
        }

        let content = UNMutableNotificationContent()
        content.title = redactor.redact(title)
        content.body = redactor.redact(body)
        if let subtitle { content.subtitle = redactor.redact(subtitle) }
        content.categoryIdentifier = "nexus.default"
        switch sound {
        case .none: content.sound = nil
        case .defaultSound: content.sound = .default
        // The Bridge protocol names a sound from a fixed set; it never accepts a
        // file path, so there is nothing here that can be pointed at a file.
        case .sale: content.sound = UNNotificationSound(named: UNNotificationSoundName("sale.wav"))
        case .alert: content.sound = .defaultCritical
        }

        let request = UNNotificationRequest(identifier: deduplicationKey ?? UUID().uuidString,
                                            content: content,
                                            trigger: nil)
        do {
            try await centre.add(request)
            if let key = deduplicationKey { remember(key) }
            return .posted
        } catch {
            return .failed(NexusError(
                domain: .unsupported, code: "notificationFailed",
                message: "macOS would not show the notification “\(content.title)”.",
                recovery: "Check System Settings › Notifications › Nexus OS. The result is still listed in the Nexus window."))
        }
    }

    private func isDuplicate(_ key: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        prune()
        return recentKeys[key] != nil
    }

    private func remember(_ key: String) {
        lock.lock(); recentKeys[key] = Date(); prune(); lock.unlock()
    }

    private func prune() {
        let cutoff = Date().addingTimeInterval(-deduplicationWindow)
        recentKeys = recentKeys.filter { $0.value > cutoff }
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Show the banner even when Nexus is frontmost. A workflow that finishes
    /// while the user is looking at another part of the interface should still
    /// announce itself.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async
        -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    /// Tapping a notification brings Nexus forward. It never performs an action:
    /// a notification is a message, not a control surface, and acting on a tap
    /// would be authority derived from content.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse) async {
        await MainActor.run {
            AppEnvironment.shared.showMainWindow()
        }
    }
}
#endif
