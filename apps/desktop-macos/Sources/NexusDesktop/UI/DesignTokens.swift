#if os(macOS)
import SwiftUI

/// The native side of the Nexus palette.
///
/// These are the same values as the `--nx-*` custom properties in
/// `apps/web/styles/tokens.css`, so the first-run screen, the connection screens
/// and the permission tour look like the interface they sit in front of rather
/// than like a system dialog that wandered in.
///
/// They are the only colours the shell hard-codes. Everything else uses the
/// semantic AppKit colours so it follows the system appearance, accent colour and
/// increased-contrast setting without any extra code.
enum NexusColour {
    static let canvas = Color(red: 0x07 / 255, green: 0x09 / 255, blue: 0x0f / 255)
    static let surface = Color(red: 0x12 / 255, green: 0x17 / 255, blue: 0x22 / 255)
    static let border = Color(red: 0x23 / 255, green: 0x2c / 255, blue: 0x3e / 255)
    static let borderStrong = Color(red: 0x35 / 255, green: 0x41 / 255, blue: 0x5a / 255)
    static let textPrimary = Color(red: 0xee / 255, green: 0xf2 / 255, blue: 0xfa / 255)
    static let textSecondary = Color(red: 0xa8 / 255, green: 0xb4 / 255, blue: 0xcc / 255)
    static let textMuted = Color(red: 0x6c / 255, green: 0x7a / 255, blue: 0x94 / 255)
    static let accent = Color(red: 0x4c / 255, green: 0xc9 / 255, blue: 0xf0 / 255)
    static let success = Color(red: 0x3d / 255, green: 0xdc / 255, blue: 0x97 / 255)
    static let warning = Color(red: 0xf5 / 255, green: 0xb1 / 255, blue: 0x4c / 255)
    static let danger = Color(red: 0xff / 255, green: 0x6b / 255, blue: 0x6b / 255)
}

enum NexusSpace {
    static let x1: CGFloat = 4
    static let x2: CGFloat = 8
    static let x3: CGFloat = 12
    static let x4: CGFloat = 16
    static let x5: CGFloat = 24
    static let x6: CGFloat = 32
    static let x7: CGFloat = 48
}

/// A panel in the shell's own screens. One definition, so the first-run screen,
/// the error screen and the permission cards agree.
struct NexusPanel<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(NexusSpace.x6)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(NexusColour.surface.opacity(0.9)))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(NexusColour.border, lineWidth: 1))
    }
}

/// The shell's background. A flat, calm surface — the interface provides the
/// personality, and a busy shell behind a loading page reads as noise.
struct NexusBackground: View {
    var body: some View {
        NexusColour.canvas
            .overlay(
                LinearGradient(
                    colors: [NexusColour.accent.opacity(0.10), .clear],
                    startPoint: .topLeading, endPoint: .center))
            .ignoresSafeArea()
    }
}

/// The primary button style used on every shell screen.
struct NexusPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .padding(.horizontal, NexusSpace.x5)
            .padding(.vertical, NexusSpace.x3)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(NexusColour.accent.opacity(configuration.isPressed ? 0.75 : 1)))
            .foregroundStyle(NexusColour.canvas)
            .contentShape(Rectangle())
    }
}

struct NexusSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .padding(.horizontal, NexusSpace.x5)
            .padding(.vertical, NexusSpace.x3)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(NexusColour.surface.opacity(configuration.isPressed ? 1 : 0.6)))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(NexusColour.borderStrong, lineWidth: 1))
            .foregroundStyle(NexusColour.textPrimary)
            .contentShape(Rectangle())
    }
}

/// A message with a next step. Every error surface in the shell uses this, which
/// is how "plain-language message and a next step" is enforced structurally
/// rather than by remembering to write one.
struct NexusAdvice: View {
    let symbol: String
    let tint: Color
    let headline: String
    let detail: String
    let nextStep: String

    var body: some View {
        HStack(alignment: .top, spacing: NexusSpace.x4) {
            Image(systemName: symbol)
                .font(.system(size: 22))
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: NexusSpace.x2) {
                Text(headline)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(NexusColour.textPrimary)
                Text(detail)
                    .font(.system(size: 13))
                    .foregroundStyle(NexusColour.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Label(nextStep, systemImage: "arrow.turn.down.right")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(NexusColour.accent)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, NexusSpace.x1)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(headline). \(detail). Next step: \(nextStep)")
    }
}
#endif
