#if os(macOS)
import SwiftUI
import AppKit
import NexusDesktopCore
import AppCore

/// The in-app uninstaller.
///
/// Three screens: choose, review, result. The review screen is the important one
/// — it lists every path that will be removed and every path that will remain,
/// with the reason. Nothing happens until the user has seen that list.
struct UninstallView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var choice: UninstallChoice = .applicationOnly
    @State private var stage: Stage = .choosing
    @State private var report: UninstallReport?
    @State private var isWorking = false

    private enum Stage { case choosing, reviewing, finished }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch stage {
            case .choosing: chooser
            case .reviewing: review
            case .finished: result
            }
        }
        .frame(width: 680, height: 620)
        .background(NexusColour.canvas)
    }

    // MARK: - Choose

    private var chooser: some View {
        VStack(alignment: .leading, spacing: NexusSpace.x5) {
            header("Remove Nexus from this Mac",
                   "Pick how much to remove. The next screen lists exactly what goes and what stays before anything happens.")

            ScrollView {
                VStack(alignment: .leading, spacing: NexusSpace.x3) {
                    ForEach(UninstallChoice.allCases) { option in
                        Button {
                            choice = option
                        } label: {
                            HStack(alignment: .top, spacing: NexusSpace.x3) {
                                Image(systemName: choice == option ? "largecircle.fill.circle" : "circle")
                                    .foregroundStyle(choice == option ? NexusColour.accent : NexusColour.textMuted)
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: NexusSpace.x2) {
                                        Text(option.title)
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundStyle(NexusColour.textPrimary)
                                        if option.requiresBackupWarning {
                                            Text("Cannot be undone")
                                                .font(.system(size: 10, weight: .semibold))
                                                .padding(.horizontal, 6).padding(.vertical, 2)
                                                .background(Capsule().fill(NexusColour.danger.opacity(0.2)))
                                                .foregroundStyle(NexusColour.danger)
                                        }
                                    }
                                    Text(option.subtitle)
                                        .font(.system(size: 12))
                                        .foregroundStyle(NexusColour.textSecondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                Spacer()
                            }
                            .padding(NexusSpace.x3)
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(choice == option ? NexusColour.surface.opacity(0.8) : .clear))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Spacer()
            HStack {
                Button("Cancel") { dismiss() }
                    .buttonStyle(NexusSecondaryButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Continue") { stage = .reviewing }
                    .buttonStyle(NexusPrimaryButtonStyle())
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(NexusSpace.x6)
    }

    // MARK: - Review

    private var plan: UninstallPlan {
        Uninstaller(environment: environment).plan(for: choice)
    }

    private var review: some View {
        VStack(alignment: .leading, spacing: NexusSpace.x4) {
            header(choice.title, plan.confirmationSentence)

            ScrollView {
                VStack(alignment: .leading, spacing: NexusSpace.x5) {
                    if !plan.steps.isEmpty {
                        section("Before anything is removed", symbol: "gearshape.2") {
                            ForEach(plan.steps, id: \.self) { step in
                                row(icon: "checkmark.circle", title: step.title, detail: nil)
                            }
                        }
                    }

                    if !plan.removes.isEmpty {
                        section("Moved to the Trash", symbol: "trash") {
                            ForEach(plan.removes) { item in
                                row(icon: "minus.circle", title: item.label, detail: item.path)
                            }
                        }
                    }

                    section("Still on your Mac afterwards", symbol: "externaldrive") {
                        let remaining = plan.remainingSummary + UninstallPlan.alwaysRemains(origin: environment.origin)
                        if remaining.isEmpty {
                            Text("Nothing. Everything Nexus created will have been removed.")
                                .font(.system(size: 12))
                                .foregroundStyle(NexusColour.textSecondary)
                        } else {
                            ForEach(remaining) { item in
                                row(icon: "circle", title: item.label,
                                    detail: item.path, note: item.reasonKept)
                            }
                        }
                    }
                }
            }

            if choice.requiresBackupWarning {
                NexusAdvice(symbol: "exclamationmark.triangle.fill",
                            tint: NexusColour.danger,
                            headline: "This cannot be undone",
                            detail: "Work stored only on this Mac will be moved to the Trash along with everything else.",
                            nextStep: "Go back and choose “Export a backup first” if you might want any of it later.")
            }

            HStack {
                Button("Back") { stage = .choosing }
                    .buttonStyle(NexusSecondaryButtonStyle())
                Spacer()
                Button(isWorking ? "Working…" : confirmTitle) { run() }
                    .buttonStyle(NexusPrimaryButtonStyle())
                    .disabled(isWorking)
            }
        }
        .padding(NexusSpace.x6)
    }

    private var confirmTitle: String {
        choice == .exportBackupFirst ? "Export Backup" : "Remove Nexus"
    }

    // MARK: - Result

    @ViewBuilder
    private var result: some View {
        if let report {
            VStack(alignment: .leading, spacing: NexusSpace.x4) {
                header(report.headline, report.nextStep)

                ScrollView {
                    VStack(alignment: .leading, spacing: NexusSpace.x4) {
                        section("What happened", symbol: "list.bullet") {
                            ForEach(Array(report.entries.enumerated()), id: \.offset) { _, entry in
                                row(icon: entry.succeeded ? "checkmark.circle.fill" : "xmark.circle.fill",
                                    title: entry.label,
                                    detail: entry.problem?.message,
                                    note: entry.problem?.recovery,
                                    tint: entry.succeeded ? NexusColour.success : NexusColour.danger)
                            }
                        }

                        if !report.remaining.isEmpty {
                            section("What is still on this Mac", symbol: "externaldrive") {
                                ForEach(report.remaining) { item in
                                    row(icon: "circle", title: item.label, detail: item.path, note: item.reasonKept)
                                }
                            }
                        }
                    }
                }

                HStack {
                    if let backup = report.backupLocation {
                        Button("Reveal Backup in Finder") {
                            Uninstaller(environment: environment).reveal(backup)
                        }
                        .buttonStyle(NexusSecondaryButtonStyle())
                    }
                    Spacer()
                    if report.choice == .exportBackupFirst {
                        Button("Back to Options") { stage = .choosing }
                            .buttonStyle(NexusPrimaryButtonStyle())
                    } else {
                        Button("Quit Nexus") {
                            Uninstaller(environment: environment).finishAndQuit()
                        }
                        .buttonStyle(NexusPrimaryButtonStyle())
                        .keyboardShortcut(.defaultAction)
                    }
                }
            }
            .padding(NexusSpace.x6)
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func run() {
        isWorking = true
        let current = plan
        Task {
            let produced = await Uninstaller(environment: environment).run(current)
            await MainActor.run {
                report = produced
                isWorking = false
                stage = .finished
            }
        }
    }

    // MARK: - Pieces

    private func header(_ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: NexusSpace.x2) {
            Text(title)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(NexusColour.textPrimary)
            Text(subtitle)
                .font(.system(size: 13))
                .foregroundStyle(NexusColour.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, symbol: String,
                                        @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: NexusSpace.x2) {
            Label(title, systemImage: symbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(NexusColour.textMuted)
            content()
        }
    }

    private func row(icon: String, title: String, detail: String?,
                     note: String? = nil, tint: Color = NexusColour.textMuted) -> some View {
        HStack(alignment: .top, spacing: NexusSpace.x2) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundStyle(tint)
                .frame(width: 16)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 12))
                    .foregroundStyle(NexusColour.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail {
                    Text(detail)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(NexusColour.textMuted)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let note {
                    Text(note)
                        .font(.system(size: 11))
                        .foregroundStyle(NexusColour.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer()
        }
    }
}
#endif
