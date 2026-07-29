#if os(macOS)
import SwiftUI
import AppKit
import NexusDesktopCore
import AppCore

/// What fills the window.
///
/// The web view is created once and kept alive across every state change, so a
/// transient network problem does not throw away the loaded interface — the error
/// screen is drawn *over* it and disappears when the connection returns.
struct RootView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @StateObject private var controller: WebViewController = WebViewController(environment: .shared)

    var body: some View {
        ZStack(alignment: .top) {
            NexusBackground()

            if case .firstRun = environment.phase {
                FirstRunView()
                    .transition(.opacity)
            } else {
                NexusWebView(controller: controller)
                    .padding(.top, WindowChrome.titleBarHeight)
                    .opacity(environment.phase.isConnected ? 1 : 0)
                    .accessibilityLabel("Nexus")

                switch environment.phase {
                case .loading:
                    LoadingView()
                case .problem(let diagnosis):
                    ConnectionProblemView(diagnosis: diagnosis)
                        .transition(.opacity)
                case .connected, .firstRun:
                    EmptyView()
                }
            }

            TitleBarView()

            if environment.isPaused {
                PausedBanner()
            }

            if let refusal = controller.lastRefusal {
                RefusalBanner(error: refusal) { controller.dismissRefusal() }
            }
        }
        .animation(.easeInOut(duration: 0.18), value: environment.phase)
        .onAppear { environment.webController = controller }
        .sheet(isPresented: $environment.isShowingPermissionTour) {
            PermissionOnboardingView()
                .environmentObject(environment)
        }
        .sheet(isPresented: $environment.isShowingUninstaller) {
            UninstallView()
                .environmentObject(environment)
        }
    }
}

/// The shell's own title bar: an app name, the connection state, and nothing that
/// resembles an address bar. Dragging it moves the window, double-clicking zooms
/// it, exactly as a real title bar does.
private struct TitleBarView: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        HStack(spacing: NexusSpace.x3) {
            // Room for the traffic lights, which macOS draws over this view.
            Spacer().frame(width: 72)

            Text("Nexus")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(NexusColour.textPrimary)

            StatusPill()

            Spacer()

            if environment.isPaused {
                Button("Resume Nexus") { environment.resume() }
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(NexusColour.warning)
                    .help("Nexus is paused. Nothing on your Mac can be changed until you resume it.")
            }
        }
        .padding(.horizontal, NexusSpace.x3)
        .frame(height: WindowChrome.titleBarHeight)
        .background(.ultraThinMaterial)
        .overlay(alignment: .bottom) {
            Rectangle().fill(NexusColour.border).frame(height: 1)
        }
        .background(WindowDragArea())
    }
}

/// The one honest label of the connection. Never an unqualified state.
private struct StatusPill: View {
    @EnvironmentObject private var environment: AppEnvironment

    private var text: String {
        if environment.isPaused { return "Paused" }
        switch environment.phase {
        case .connected: return environment.origin.isLoopback ? "Live · on this Mac" : "Live · \(environment.origin.host)"
        case .loading: return "Connecting…"
        case .problem: return "Not connected"
        case .firstRun: return "Not set up"
        }
    }

    private var tint: Color {
        if environment.isPaused { return NexusColour.warning }
        switch environment.phase {
        case .connected: return NexusColour.success
        case .loading: return NexusColour.textMuted
        case .problem, .firstRun: return NexusColour.danger
        }
    }

    var body: some View {
        HStack(spacing: NexusSpace.x1) {
            Circle().fill(tint).frame(width: 6, height: 6)
            Text(text)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(NexusColour.textSecondary)
        }
        .padding(.horizontal, NexusSpace.x2)
        .padding(.vertical, 3)
        .background(Capsule().fill(NexusColour.surface.opacity(0.7)))
        .accessibilityLabel("Connection status: \(text)")
    }
}

/// Makes the title strip behave like a real title bar.
private struct WindowDragArea: NSViewRepresentable {
    final class DragView: NSView {
        override func mouseDown(with event: NSEvent) {
            if event.clickCount == 2 {
                window?.performZoom(nil)
            } else {
                window?.performDrag(with: event)
            }
        }
    }

    func makeNSView(context: Context) -> NSView { DragView() }
    func updateNSView(_ nsView: NSView, context: Context) {}
}

private struct LoadingView: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        VStack(spacing: NexusSpace.x4) {
            ProgressView()
                .controlSize(.large)
            Text("Connecting to \(environment.origin.displayName)…")
                .font(.system(size: 13))
                .foregroundStyle(NexusColour.textSecondary)
            if environment.loadAttempt > 0 {
                Text("Attempt \(environment.loadAttempt + 1). Nexus keeps trying by itself for a short while.")
                    .font(.system(size: 12))
                    .foregroundStyle(NexusColour.textMuted)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(NexusBackground())
    }
}

/// The escape hatch has to be visible while it is engaged, or it is not an
/// escape hatch — it is a setting.
private struct PausedBanner: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        VStack {
            Spacer()
            HStack(spacing: NexusSpace.x4) {
                Image(systemName: "pause.circle.fill")
                    .foregroundStyle(NexusColour.warning)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Nexus is paused")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(NexusColour.textPrimary)
                    Text(environment.settings.pauseReason
                         ?? "Nothing on your Mac can be opened, closed or moved by Nexus until you resume it.")
                        .font(.system(size: 12))
                        .foregroundStyle(NexusColour.textSecondary)
                }
                Spacer()
                Button("Resume") { environment.resume() }
                    .buttonStyle(NexusPrimaryButtonStyle())
                Button("Quit to plain macOS") { environment.quitToPlainMacOS() }
                    .buttonStyle(NexusSecondaryButtonStyle())
            }
            .padding(NexusSpace.x4)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(.ultraThinMaterial))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(NexusColour.warning.opacity(0.5), lineWidth: 1))
            .padding(NexusSpace.x5)
        }
    }
}

/// A refusal the shell made on the user's behalf — a blocked link, a message from
/// the wrong origin. Shown, never swallowed, and never as a modal that stops work.
private struct RefusalBanner: View {
    let error: NexusError
    let dismiss: () -> Void

    var body: some View {
        VStack {
            HStack(alignment: .top, spacing: NexusSpace.x3) {
                Image(systemName: "hand.raised.fill")
                    .foregroundStyle(NexusColour.warning)
                VStack(alignment: .leading, spacing: 2) {
                    Text(error.message)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(NexusColour.textPrimary)
                    Text(error.recovery)
                        .font(.system(size: 12))
                        .foregroundStyle(NexusColour.textSecondary)
                }
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.plain)
                .foregroundStyle(NexusColour.textMuted)
                .accessibilityLabel("Dismiss this message")
            }
            .padding(NexusSpace.x3)
            .frame(maxWidth: 640)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(.ultraThinMaterial))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(NexusColour.border, lineWidth: 1))
            .padding(.top, WindowChrome.titleBarHeight + NexusSpace.x3)
            Spacer()
        }
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}
#endif
