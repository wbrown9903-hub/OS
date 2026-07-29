#if os(macOS)
import SwiftUI
import AppKit
import NexusDesktopCore
import AppCore

/// The offline and connection-error screen.
///
/// Everything on it is real: the headline and the next step come from
/// ``ConnectionDiagnosis``, the Retry button issues an actual load, and the
/// secondary button does the specific thing the diagnosis named — open Network
/// settings, change the address, or show how to start Nexus on this Mac. There is
/// no decorative "something went wrong" illustration standing in for an answer.
struct ConnectionProblemView: View {
    @EnvironmentObject private var environment: AppEnvironment
    let diagnosis: ConnectionDiagnosis

    @State private var isRetrying = false
    @State private var showingAddressEditor = false
    @State private var draftAddress = ""
    @State private var addressProblem: NexusError?

    var body: some View {
        ZStack {
            NexusBackground()
            VStack(spacing: NexusSpace.x6) {
                Image(systemName: symbol)
                    .font(.system(size: 40))
                    .foregroundStyle(tint)
                    .accessibilityHidden(true)

                VStack(spacing: NexusSpace.x3) {
                    Text(diagnosis.headline)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(NexusColour.textPrimary)
                    Text(diagnosis.detail)
                        .font(.system(size: 13))
                        .foregroundStyle(NexusColour.textSecondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: 520)
                }

                NexusPanel {
                    NexusAdvice(symbol: "arrow.turn.down.right",
                                tint: NexusColour.accent,
                                headline: "What to do next",
                                detail: diagnosis.nextStep,
                                nextStep: secondaryTitle ?? "Choose Try Again when you are ready.")
                }
                .frame(maxWidth: 560)

                HStack(spacing: NexusSpace.x3) {
                    Button(isRetrying ? "Trying…" : "Try Again") { retry() }
                        .buttonStyle(NexusPrimaryButtonStyle())
                        .keyboardShortcut("r", modifiers: .command)
                        .disabled(isRetrying)

                    if let title = secondaryTitle {
                        Button(title) { performSecondary() }
                            .buttonStyle(NexusSecondaryButtonStyle())
                    }

                    Button("Open in Browser") {
                        NSWorkspace.shared.open(environment.origin.url)
                    }
                    .buttonStyle(NexusSecondaryButtonStyle())
                    .help("Opens \(environment.origin.urlString) in your default browser so you can see what it says.")
                }

                Text("Nexus is at \(environment.origin.urlString)")
                    .font(.system(size: 11))
                    .foregroundStyle(NexusColour.textMuted)
            }
            .padding(NexusSpace.x7)
        }
        .sheet(isPresented: $showingAddressEditor) { addressEditor }
    }

    private var symbol: String {
        switch diagnosis.remedy {
        case .openNetworkSettings: return "wifi.slash"
        case .startLocalNexus: return "play.circle"
        case .changeAddress: return "questionmark.circle"
        case .retry, .none: return "exclamationmark.triangle"
        }
    }

    private var tint: Color {
        diagnosis.isTransient ? NexusColour.warning : NexusColour.danger
    }

    private var secondaryTitle: String? {
        switch diagnosis.remedy {
        case .retry, .none: return nil
        case .changeAddress: return "Change Address"
        case .openNetworkSettings: return "Open Network Settings"
        case .startLocalNexus: return "How do I start Nexus?"
        }
    }

    private func retry() {
        isRetrying = true
        environment.retryConnection()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { isRetrying = false }
    }

    private func performSecondary() {
        switch diagnosis.remedy {
        case .changeAddress:
            draftAddress = environment.origin.urlString
            addressProblem = nil
            showingAddressEditor = true
        case .openNetworkSettings:
            if let url = URL(string: "x-apple.systempreferences:com.apple.Network-Settings.extension") {
                NSWorkspace.shared.open(url)
            }
        case .startLocalNexus:
            showStartInstructions()
        case .retry, .none:
            retry()
        }
    }

    private var addressEditor: some View {
        VStack(alignment: .leading, spacing: NexusSpace.x4) {
            Text("Where is your Nexus?")
                .font(.system(size: 17, weight: .semibold))
            Text("Nexus Desktop loads pages from this address and no other. Use http only for a Nexus running on this Mac.")
                .font(.system(size: 12))
                .foregroundStyle(NexusColour.textSecondary)
            TextField("https://nexus.example.com", text: $draftAddress)
                .textFieldStyle(.roundedBorder)
                .onSubmit(applyAddress)
            if let addressProblem {
                NexusAdvice(symbol: "exclamationmark.triangle.fill", tint: NexusColour.danger,
                            headline: addressProblem.message,
                            detail: "Nothing was changed.",
                            nextStep: addressProblem.recovery)
            }
            HStack {
                Button("Use this Mac (\(NexusOrigin.localDefault.urlString))") {
                    draftAddress = NexusOrigin.localDefault.urlString
                }
                .buttonStyle(.link)
                Spacer()
                Button("Cancel") { showingAddressEditor = false }
                    .keyboardShortcut(.cancelAction)
                Button("Connect", action: applyAddress)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(NexusSpace.x5)
        .frame(width: 520)
    }

    private func applyAddress() {
        do {
            try environment.connect(to: draftAddress)
            showingAddressEditor = false
        } catch let error as NexusError {
            addressProblem = error
        } catch {
            addressProblem = NexusError.validation("addressUnusable", "That address could not be used.",
                                                   recovery: "Check it and try again.")
        }
    }

    private func showStartInstructions() {
        let alert = NSAlert()
        alert.messageText = "Starting Nexus on this Mac"
        alert.informativeText = """
        1. Open the Nexus OS folder you downloaded.
        2. Double-click START_NEXUS.command.
        3. Wait until it says “Nexus OS is running”. Leave that window open.
        4. Come back here and choose Try Again.

        If double-clicking does nothing, right-click the file and choose Open, \
        then choose Open again in the dialog macOS shows.
        """
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Try Again Now")
        if alert.runModal() == .alertSecondButtonReturn { retry() }
    }
}
#endif
