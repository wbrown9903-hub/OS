import Foundation
import AppCore
import SecurityCore
import BridgeProtocol

/// One card in the first-run permission tour.
///
/// Every word shown to the user comes from ``MacPermission`` in the Bridge
/// protocol — the title, the plain-language reason, what still works if they say
/// no, which actions stop working and the exact System Settings pane. The
/// onboarding screen owns none of that copy, so the Info.plist usage description,
/// the Permissions screen and this tour can never drift apart.
public struct PermissionCard: Sendable, Equatable, Identifiable {
    public var id: String { permission.rawValue }
    public let permission: MacPermission
    public let state: BridgeStatusReport.PermissionState

    public init(permission: MacPermission, state: BridgeStatusReport.PermissionState) {
        self.permission = permission
        self.state = state
    }

    public var title: String { permission.title }
    public var reason: String { permission.reason }
    public var ifYouSayNo: String { permission.degradedBehaviour }
    public var settingsURLString: String? { permission.settingsURLString }

    /// "Arranging windows and 3 other actions stop working." — concrete, not
    /// abstract, so the choice is informed.
    public var affectedActions: [String] {
        permission.gatedActions.map(\.title)
    }

    /// What the button should say for this state.
    public var primaryActionTitle: String {
        switch state {
        case .granted: return "Continue"
        case .denied: return "Open System Settings"
        case .notDetermined: return "Allow \(permission.title)"
        case .notApplicable: return "Continue"
        }
    }

    public var statusSentence: String {
        switch state {
        case .granted: return "\(permission.title) is on. \(permission.title == "Open at Login" ? "Nexus will start when you log in." : "Nothing else to do here.")"
        case .denied: return "\(permission.title) is off. \(permission.degradedBehaviour)"
        case .notDetermined: return "\(permission.title) has not been decided yet."
        case .notApplicable: return "Nexus OS does not use \(permission.title)."
        }
    }
}

/// Decides which permission to show next, and — just as importantly — when to
/// stop asking.
///
/// The rules:
///
/// 1. **Ask once.** A permission the user declined is recorded in
///    ``DesktopSettings/declinedPermissions`` and never shown by the tour again.
///    It stays visible in Settings › Permissions, where the user can change their
///    mind on their own schedule.
/// 2. **Never block.** Every permission Nexus OS asks for is optional, so the
///    tour can always be skipped, and skipping leaves a working product.
/// 3. **Never ask for what is not used.** `fullDisk` is deliberately excluded:
///    the Bridge states plainly that Nexus OS does not want it, and asking about
///    a permission you do not use trains people to click Allow without reading.
/// 4. **Detect rather than assume.** After the user returns from System Settings
///    the shell re-reads the real state and moves on by itself; nothing depends
///    on the user telling the app what they did.
public struct PermissionOnboarding: Sendable {
    /// The order cards are shown in: most useful first, least intrusive last.
    public static let tourOrder: [MacPermission] = [.notifications, .accessibility, .automation, .filesFolders, .loginItem]

    /// Permissions the tour never mentions, with the reason.
    public static let excludedFromTour: [MacPermission] = [.fullDisk]

    public let states: [MacPermission: BridgeStatusReport.PermissionState]
    public let declined: Set<MacPermission>

    public init(states: [MacPermission: BridgeStatusReport.PermissionState],
                declined: Set<MacPermission> = []) {
        self.states = states
        self.declined = declined
    }

    public func state(of permission: MacPermission) -> BridgeStatusReport.PermissionState {
        states[permission] ?? .notDetermined
    }

    /// The cards the tour will actually show, in order: undecided permissions the
    /// user has not already declined.
    public var pendingCards: [PermissionCard] {
        Self.tourOrder.compactMap { permission in
            guard !declined.contains(permission) else { return nil }
            let state = self.state(of: permission)
            guard state == .notDetermined else { return nil }
            return PermissionCard(permission: permission, state: state)
        }
    }

    /// Every permission, including the ones the tour skips, for the Permissions
    /// screen in Settings. `fullDisk` is listed with its "not used" explanation
    /// rather than hidden, because a person auditing the app should be able to
    /// see the complete answer.
    public var allCards: [PermissionCard] {
        (Self.tourOrder + Self.excludedFromTour).map { permission in
            let state = permission == .fullDisk ? BridgeStatusReport.PermissionState.notApplicable
                                                : self.state(of: permission)
            return PermissionCard(permission: permission, state: state)
        }
    }

    /// True when there is nothing left to ask about, so the tour closes itself.
    public var isComplete: Bool { pendingCards.isEmpty }

    /// One line for the menu-bar extra and the Settings header.
    public var summary: String {
        let granted = Self.tourOrder.filter { state(of: $0) == .granted }.count
        let denied = Self.tourOrder.filter { state(of: $0) == .denied }
        if denied.isEmpty {
            return "\(granted) of \(Self.tourOrder.count) permissions granted."
        }
        let names = denied.map(\.title).joined(separator: ", ")
        return "\(granted) of \(Self.tourOrder.count) granted. Off: \(names)."
    }

    /// The actions that cannot run right now because a permission is off, with
    /// the reason attached — the input to "Unavailable never means invisible".
    public func unavailableActions() -> [(action: BridgeAction, permission: MacPermission, nextStep: String)] {
        var results: [(BridgeAction, MacPermission, String)] = []
        for permission in MacPermission.allCases where state(of: permission) == .denied {
            for action in permission.gatedActions {
                results.append((action, permission,
                                "Turn \(permission.title) on for Nexus OS in System Settings › Privacy & Security, then try again."))
            }
        }
        return results.sorted { $0.0.rawValue < $1.0.rawValue }
    }
}
