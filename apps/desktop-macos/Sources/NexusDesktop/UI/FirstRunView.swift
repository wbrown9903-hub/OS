#if os(macOS)
import SwiftUI
import AppKit
import NexusDesktopCore
import AppCore

/// The first thing anyone sees: *connect to your Nexus*.
///
/// It offers the two answers that actually exist — the copy running on this Mac,
/// or one published somewhere else — and it explains the difference in a sentence
/// each. There is no field labelled "server URL" with no further help, and no
/// step that requires knowing what a port is.
struct FirstRunView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var choice: Choice = .thisMac
    @State private var address: String = ""
    @State private var problem: NexusError?
    @FocusState private var addressFocused: Bool

    private enum Choice: Hashable { case thisMac, elsewhere }

    var body: some View {
        ZStack {
            NexusBackground()
            ScrollView {
                VStack(spacing: NexusSpace.x6) {
                    header

                    NexusPanel {
                        VStack(alignment: .leading, spacing: NexusSpace.x5) {
                            choiceRow(
                                .thisMac,
                                title: "Nexus is running on this Mac",
                                detail: "The usual answer. START_NEXUS.command runs Nexus at \(NexusOrigin.localDefault.urlString) on this machine, and nothing leaves your Mac.")

                            choiceRow(
                                .elsewhere,
                                title: "Nexus is somewhere else",
                                detail: "Use this if you host Nexus yourself or someone gave you an address. It must be an https address.")

                            if choice == .elsewhere {
                                VStack(alignment: .leading, spacing: NexusSpace.x2) {
                                    Text("Nexus address")
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(NexusColour.textSecondary)
                                    TextField("https://nexus.example.com", text: $address)
                                        .textFieldStyle(.roundedBorder)
                                        .focused($addressFocused)
                                        .onSubmit(connect)
                                    Text("Nexus Desktop only ever loads pages from this address. Links to anywhere else open in your browser.")
                                        .font(.system(size: 11))
                                        .foregroundStyle(NexusColour.textMuted)
                                }
                                .padding(.leading, NexusSpace.x6)
                            }

                            if let problem {
                                NexusAdvice(symbol: "exclamationmark.triangle.fill",
                                            tint: NexusColour.danger,
                                            headline: problem.message,
                                            detail: "Nothing has been saved, so you can simply correct it and try again.",
                                            nextStep: problem.recovery)
                            }

                            HStack(spacing: NexusSpace.x3) {
                                Button("Connect", action: connect)
                                    .buttonStyle(NexusPrimaryButtonStyle())
                                    .keyboardShortcut(.defaultAction)
                                Button("What is Nexus Desktop?") { showExplanation() }
                                    .buttonStyle(NexusSecondaryButtonStyle())
                            }
                        }
                    }
                    .frame(maxWidth: 640)

                    reassurance
                        .frame(maxWidth: 640)
                }
                .padding(NexusSpace.x7)
                .frame(maxWidth: .infinity)
            }
        }
        .onAppear {
            address = environment.settings.origin.isLoopback ? "" : environment.settings.origin.urlString
            choice = environment.settings.origin.isLoopback ? .thisMac : .elsewhere
        }
    }

    private var header: some View {
        VStack(spacing: NexusSpace.x3) {
            Image(systemName: "circle.hexagongrid.fill")
                .font(.system(size: 44))
                .foregroundStyle(NexusColour.accent)
                .accessibilityHidden(true)
            Text("Connect to your Nexus")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(NexusColour.textPrimary)
            Text("Nexus Desktop is the window your Nexus lives in. It does not store your work — it shows it, and lets Nexus do a small, fixed set of things on this Mac when you allow them.")
                .font(.system(size: 13))
                .foregroundStyle(NexusColour.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 560)
        }
    }

    private func choiceRow(_ value: Choice, title: String, detail: String) -> some View {
        Button {
            choice = value
            problem = nil
            if value == .elsewhere { addressFocused = true }
        } label: {
            HStack(alignment: .top, spacing: NexusSpace.x3) {
                Image(systemName: choice == value ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(choice == value ? NexusColour.accent : NexusColour.textMuted)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(NexusColour.textPrimary)
                    Text(detail)
                        .font(.system(size: 12))
                        .foregroundStyle(NexusColour.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(choice == value ? [.isSelected] : [])
    }

    private var reassurance: some View {
        VStack(alignment: .leading, spacing: NexusSpace.x3) {
            Label("Nexus Desktop is not a browser. It shows one address and nothing else.",
                  systemImage: "lock.shield")
            Label("It can never run a command on this Mac. There is no such action, by design.",
                  systemImage: "terminal.fill")
            Label("You can pause everything, or remove Nexus completely, from the Nexus menu.",
                  systemImage: "pause.circle")
        }
        .font(.system(size: 12))
        .foregroundStyle(NexusColour.textMuted)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func connect() {
        problem = nil
        let raw = choice == .thisMac ? NexusOrigin.localDefault.urlString : address
        do {
            try environment.connect(to: raw)
        } catch let error as NexusError {
            problem = error
        } catch {
            problem = NexusError.validation(
                "addressUnusable",
                "That address could not be used.",
                recovery: "Check it and try again, or choose “Nexus is running on this Mac”.")
        }
    }

    private func showExplanation() {
        let alert = NSAlert()
        alert.messageText = "What Nexus Desktop is"
        alert.informativeText = """
        Nexus OS has two halves.

        The interface — everything you see and arrange — runs as a web application. \
        Nexus Desktop is a window for it, with real Mac menus, keyboard shortcuts, \
        notifications and full-screen support.

        The second half is the Mac Bridge, a small helper that can open an app, \
        open a file you allowed, arrange windows or show a notification. It knows \
        sixteen specific things and nothing else — it cannot run commands, and \
        adding that ability is deliberately out of scope.

        Everything the interface asks for is checked against your permission \
        settings, and anything that changes your Mac asks you first unless you have \
        said otherwise.
        """
        alert.addButton(withTitle: "Got it")
        alert.runModal()
    }
}
#endif
