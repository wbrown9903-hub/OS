#if os(macOS)
import SwiftUI
import AppKit
import NexusDesktopCore
import AppCore
import BridgeProtocol

/// The first-run permission tour.
///
/// Design rules, all of them visible in the code below:
///
/// - **One permission per screen**, in plain language, with what it is for and
///   what still works if you say no.
/// - **The exact pane.** "Open System Settings" goes straight to the right pane
///   via the `x-apple.systempreferences:` URL that ``MacPermission`` owns — the
///   user is never asked to navigate a settings tree from a description.
/// - **Detect, then continue.** When the app becomes active again the state is
///   re-read from macOS and the tour moves on by itself.
/// - **Never nag.** "Not now" records the decision; that permission is not shown
///   by the tour again. It stays available in Settings › Permissions.
/// - **Always skippable**, because every permission Nexus asks for is optional.
struct PermissionOnboardingView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var isWaitingForSettings = false

    private var cards: [PermissionCard] { environment.onboarding.pendingCards }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if cards.isEmpty {
                completion
            } else {
                let card = cards[min(index, cards.count - 1)]
                content(for: card)
            }
        }
        .frame(width: 620)
        .background(NexusColour.canvas)
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            guard isWaitingForSettings else { return }
            environment.refreshPermissionStates()
            // Give the state a moment to land, then move on without being asked.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                isWaitingForSettings = false
                advance()
            }
        }
    }

    // MARK: - A card

    @ViewBuilder
    private func content(for card: PermissionCard) -> some View {
        VStack(alignment: .leading, spacing: NexusSpace.x5) {
            HStack {
                Text("Permissions")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(NexusColour.textMuted)
                Spacer()
                Text("\(min(index + 1, cards.count)) of \(cards.count)")
                    .font(.system(size: 12))
                    .foregroundStyle(NexusColour.textMuted)
            }

            VStack(alignment: .leading, spacing: NexusSpace.x3) {
                Text(card.title)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(NexusColour.textPrimary)
                Text(card.reason)
                    .font(.system(size: 13))
                    .foregroundStyle(NexusColour.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            NexusPanel {
                VStack(alignment: .leading, spacing: NexusSpace.x3) {
                    Label("If you say no", systemImage: "hand.thumbsdown")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(NexusColour.textSecondary)
                    Text(card.ifYouSayNo)
                        .font(.system(size: 13))
                        .foregroundStyle(NexusColour.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)

                    if !card.affectedActions.isEmpty {
                        Divider().overlay(NexusColour.border)
                        Text("Without it, these stop working:")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(NexusColour.textSecondary)
                        ForEach(card.affectedActions, id: \.self) { action in
                            Label(action, systemImage: "minus.circle")
                                .font(.system(size: 12))
                                .foregroundStyle(NexusColour.textMuted)
                        }
                    }
                }
            }

            if isWaitingForSettings {
                NexusAdvice(symbol: "gear",
                            tint: NexusColour.accent,
                            headline: "System Settings is open",
                            detail: "Find Nexus OS in the list and switch it on. Nexus is watching for the change.",
                            nextStep: "Come back to this window when you are done — it continues by itself.")
            }

            HStack(spacing: NexusSpace.x3) {
                Button(card.primaryActionTitle) { grant(card) }
                    .buttonStyle(NexusPrimaryButtonStyle())
                    .keyboardShortcut(.defaultAction)

                Button("Not now") { decline(card) }
                    .buttonStyle(NexusSecondaryButtonStyle())
                    .help("Nexus will not ask you about \(card.title) again. You can turn it on later in Settings › Permissions.")

                Spacer()

                Button("Skip all") { finish() }
                    .buttonStyle(.plain)
                    .font(.system(size: 12))
                    .foregroundStyle(NexusColour.textMuted)
            }
        }
        .padding(NexusSpace.x6)
    }

    private var completion: some View {
        VStack(alignment: .leading, spacing: NexusSpace.x5) {
            Text("You are set up")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(NexusColour.textPrimary)
            Text(environment.onboarding.summary)
                .font(.system(size: 13))
                .foregroundStyle(NexusColour.textSecondary)
            Text("Anything you turned down stays available in Settings › Permissions. Nexus will not ask again.")
                .font(.system(size: 12))
                .foregroundStyle(NexusColour.textMuted)
            HStack {
                Spacer()
                Button("Start using Nexus") { finish() }
                    .buttonStyle(NexusPrimaryButtonStyle())
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(NexusSpace.x6)
    }

    // MARK: - Actions

    private func grant(_ card: PermissionCard) {
        switch card.permission {
        case .notifications:
            Task {
                _ = await environment.notifications.requestAuthorisation()
                environment.refreshPermissionStates()
                advance()
            }
        case .accessibility:
            // macOS shows its own prompt with a button that opens the pane.
            environment.permissionInspector.promptForAccessibility()
            isWaitingForSettings = true
            environment.permissionInspector.openSystemSettings(for: .accessibility)
        case .filesFolders:
            if let folder = environment.permissionInspector.chooseFolderToShare() {
                var paths = environment.settings.grantedFolderPaths
                paths.append(folder.path)
                environment.settings.grantedFolderPaths = paths
                environment.saveSettingsNow()
                environment.refreshPermissionStates()
            }
            advance()
        case .loginItem:
            if let error = environment.launchAtLogin.setEnabled(true) {
                presentProblem(error)
            } else {
                environment.settings.launchAtLogin = true
            }
            environment.refreshPermissionStates()
            advance()
        case .automation, .fullDisk:
            // Automation is asked for by macOS at the moment it is needed, which
            // is the only moment the prompt can name the target application.
            advance()
        }
        environment.settings.recordPrompt(card.permission, at: Date())
    }

    private func decline(_ card: PermissionCard) {
        environment.recordPermissionDecline(card.permission)
        advance()
    }

    private func advance() {
        if index + 1 < cards.count {
            index += 1
        } else {
            finish()
        }
    }

    private func finish() {
        environment.finishPermissionTour()
        dismiss()
    }

    private func presentProblem(_ error: NexusError) {
        let alert = NSAlert()
        alert.messageText = error.message
        alert.informativeText = error.recovery
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }
}

/// The permanent version of the tour, in Settings. Every permission is listed
/// including the one Nexus deliberately does not use, with its live state and a
/// button that goes to the exact pane.
struct PermissionListView: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        VStack(alignment: .leading, spacing: NexusSpace.x4) {
            Text(environment.onboarding.summary)
                .font(.system(size: 12))
                .foregroundStyle(NexusColour.textSecondary)

            ForEach(environment.onboarding.allCards) { card in
                HStack(alignment: .top, spacing: NexusSpace.x3) {
                    Image(systemName: symbol(for: card.state))
                        .foregroundStyle(tint(for: card.state))
                        .frame(width: 18)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(card.title).font(.system(size: 13, weight: .medium))
                        Text(card.statusSentence)
                            .font(.system(size: 12))
                            .foregroundStyle(NexusColour.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    if card.permission != .fullDisk, card.state != .granted {
                        Button("Open Settings") {
                            environment.permissionInspector.openSystemSettings(for: card.permission)
                        }
                        .buttonStyle(.link)
                    }
                }
                Divider().overlay(NexusColour.border)
            }

            Button("Check again") { environment.refreshPermissionStates() }
                .buttonStyle(NexusSecondaryButtonStyle())
        }
    }

    private func symbol(for state: BridgeStatusReport.PermissionState) -> String {
        switch state {
        case .granted: return "checkmark.circle.fill"
        case .denied: return "xmark.circle.fill"
        case .notDetermined: return "questionmark.circle"
        case .notApplicable: return "minus.circle"
        }
    }

    private func tint(for state: BridgeStatusReport.PermissionState) -> Color {
        switch state {
        case .granted: return NexusColour.success
        case .denied: return NexusColour.danger
        case .notDetermined: return NexusColour.warning
        case .notApplicable: return NexusColour.textMuted
        }
    }
}
#endif
