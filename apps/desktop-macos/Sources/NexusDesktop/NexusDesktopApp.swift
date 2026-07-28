import Foundation

#if os(macOS)
import SwiftUI
import AppKit
import NexusDesktopCore
import AppCore

/// Nexus Desktop.
///
/// One window, no browser chrome, a real menu bar, a menu-bar extra and a visible
/// way out. The window hosts a `WKWebView` showing Nexus Cloud; everything native
/// — menus, shortcuts, notifications, permissions, the uninstaller — lives here.
@main
struct NexusDesktopApp: App {
    @NSApplicationDelegateAdaptor(NexusAppDelegate.self) private var delegate
    @StateObject private var environment = AppEnvironment.shared

    var body: some Scene {
        Window("Nexus", id: NexusWindowID.main) {
            RootView()
                .environmentObject(environment)
                .frame(minWidth: 960, minHeight: 640)
                // The window is the app. Closing it should not leave a menu bar
                // with nothing behind it, so the delegate reopens on dock click.
                .background(WindowConfigurator(environment: environment))
        }
        // Hidden title bar plus a full-size content view is what stops this
        // looking like a browser: the page runs edge to edge and the traffic
        // lights float over our own title bar view.
        .windowStyle(.hiddenTitleBar)
        .windowToolbarStyle(.unifiedCompact(showsTitle: false))
        .defaultSize(width: 1280, height: 840)
        .commands { NexusCommands(environment: environment) }

        Settings {
            SettingsView()
                .environmentObject(environment)
        }

        MenuBarExtra("Nexus", systemImage: environment.menuBarSymbolName,
                     isInserted: $environment.settings.showMenuBarExtra) {
            MenuBarContent()
                .environmentObject(environment)
        }
        .menuBarExtraStyle(.menu)
    }
}

public enum NexusWindowID {
    public static let main = "nexus.main"
}

/// The bits of application lifecycle SwiftUI does not express.
final class NexusAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        AppEnvironment.shared.applicationDidFinishLaunching()
    }

    /// Clicking the Dock icon with no window open reopens the window rather than
    /// doing nothing, which is the behaviour every other Mac app has.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { AppEnvironment.shared.showMainWindow() }
        return true
    }

    /// Quitting is quitting. The menu-bar extra is not a reason to keep a
    /// windowless process alive — "Quit to plain macOS" has to mean it.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppEnvironment.shared.applicationWillTerminate()
    }
}

/// Reaches the `NSWindow` behind the SwiftUI scene so the shell can apply the
/// chrome SwiftUI has no modifier for, and restore the frame the user left.
private struct WindowConfigurator: NSViewRepresentable {
    let environment: AppEnvironment

    func makeNSView(context: Context) -> NSView {
        let view = NSView(frame: .zero)
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            WindowChrome.apply(to: window)
            environment.adopt(window: window)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

#else

/// Nexus Desktop is a macOS application. The package still builds on other
/// platforms so the portable half (`NexusDesktopCore`) can be compiled and
/// unit-tested in the Linux container, but there is nothing to run here.
@main
enum NexusDesktopApp {
    static func main() {
        FileHandle.standardError.write(Data("""
        Nexus Desktop is the macOS shell for Nexus OS and can only run on macOS 14 or later.

        On this platform only the portable half of the package is built. To use Nexus OS
        here, run START_NEXUS.command and open http://127.0.0.1:4311/ in a browser.

        """.utf8))
    }
}

#endif
