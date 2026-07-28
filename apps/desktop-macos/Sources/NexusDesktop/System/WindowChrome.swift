#if os(macOS)
import Foundation
import AppKit

/// Makes the window look like an application rather than a browser.
///
/// What stays: the traffic lights, native full-screen (green button and
/// ⌃⌘F), Mission Control, Stage Manager, window snapping and every other window
/// behaviour a Mac user expects. Removing those would make the app feel foreign,
/// which is the opposite of the goal.
///
/// What goes: the title bar's own background and title text, so the Nexus
/// interface runs to the top edge and the shell draws its own strip underneath
/// the traffic lights.
enum WindowChrome {
    /// Height of the shell's own title strip. The traffic lights sit inside it,
    /// and `--nx-shell-titlebar-height` tells the page to leave room.
    static let titleBarHeight: CGFloat = 38

    static func apply(to window: NSWindow) {
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.styleMask.insert(.fullSizeContentView)
        window.isMovableByWindowBackground = false   // the title strip handles dragging
        window.backgroundColor = .windowBackgroundColor
        window.tabbingMode = .disallowed             // Nexus is one window, not a tab set
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.minSize = NSSize(width: 960, height: 640)

        // The traffic lights are kept and nudged down so they sit centred in the
        // taller strip. They are never hidden: closing, minimising and zooming
        // must work exactly as they do everywhere else on the Mac.
        for button: NSWindow.ButtonType in [.closeButton, .miniaturizeButton, .zoomButton] {
            guard let control = window.standardWindowButton(button) else { continue }
            control.isHidden = false
        }
    }

    /// Called when the window enters or leaves full screen so the shell's title
    /// strip can collapse — in full screen macOS provides its own auto-hiding
    /// menu bar and the traffic lights move into it.
    static func titleBarHeight(isFullScreen: Bool) -> CGFloat {
        isFullScreen ? 0 : titleBarHeight
    }
}
#endif
