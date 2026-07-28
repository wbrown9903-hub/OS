#if os(macOS)
import Foundation
import AppKit
import Carbon.HIToolbox
import NexusDesktopCore
import AppCore

/// System-wide keyboard shortcuts.
///
/// These work while another application is frontmost, which is the whole point:
/// ⌥⌘N should bring Nexus forward from anywhere, and the pause shortcut has to
/// work at the moment something is going wrong.
///
/// # Why Carbon
///
/// `RegisterEventHotKey` is still the only supported way for a normal
/// (non-accessibility) application to reserve a system-wide key combination.
/// `NSEvent.addGlobalMonitorForEvents` is the alternative, and it is a worse one
/// for this purpose: it requires Accessibility permission, it observes every key
/// the user presses rather than one combination, and it cannot stop the key
/// reaching the frontmost app. Reserving exactly two combinations through a
/// documented API is the smaller ask, and Nexus can do it without Accessibility.
///
/// The shortcuts are released on quit and by the uninstaller, so a removed Nexus
/// does not keep swallowing ⌥⌘N.
final class GlobalHotKeyCentre: @unchecked Sendable {
    private struct Registration {
        let reference: EventHotKeyRef
        let name: String
        let handler: () -> Void
    }

    private static let signature: OSType = 0x4E58_4853  // 'NXHS'
    private let lock = NSLock()
    private var registrations: [UInt32: Registration] = [:]
    private var nextID: UInt32 = 1
    private var eventHandler: EventHandlerRef?

    init() {
        installEventHandler()
    }

    deinit {
        unregisterAll()
        if let eventHandler { RemoveEventHandler(eventHandler) }
    }

    /// Registers a binding. A combination another application already owns cannot
    /// be taken; that is reported rather than failing quietly, so Settings can
    /// tell the user to pick a different one.
    @discardableResult
    func register(_ binding: HotKeyBinding, named name: String, handler: @escaping () -> Void) -> NexusError? {
        lock.lock()
        let id = nextID
        nextID += 1
        lock.unlock()

        var hotKeyID = EventHotKeyID(signature: Self.signature, id: id)
        var reference: EventHotKeyRef?
        let status = RegisterEventHotKey(binding.keyCode, binding.modifiers, hotKeyID,
                                         GetApplicationEventTarget(), 0, &reference)
        guard status == noErr, let reference else {
            return NexusError(
                domain: .unsupported, code: "hotKeyUnavailable",
                message: "The keyboard shortcut \(binding.displayName) is already used by another application, so Nexus could not reserve it.",
                recovery: "Choose a different shortcut in Settings › Shortcuts, or quit the application that is using \(binding.displayName).")
        }
        lock.lock()
        registrations[id] = Registration(reference: reference, name: name, handler: handler)
        lock.unlock()
        _ = hotKeyID
        return nil
    }

    func unregisterAll() {
        lock.lock()
        let all = registrations
        registrations.removeAll()
        lock.unlock()
        for (_, registration) in all {
            UnregisterEventHotKey(registration.reference)
        }
    }

    fileprivate func fire(id: UInt32) {
        lock.lock()
        let registration = registrations[id]
        lock.unlock()
        registration?.handler()
    }

    private func installEventHandler() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let context = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, event, userData in
            guard let event, let userData else { return noErr }
            var hotKeyID = EventHotKeyID()
            let status = GetEventParameter(event, EventParamName(kEventParamDirectObject),
                                           EventParamType(typeEventHotKeyID), nil,
                                           MemoryLayout<EventHotKeyID>.size, nil, &hotKeyID)
            guard status == noErr, hotKeyID.signature == GlobalHotKeyCentre.signature else { return noErr }
            let centre = Unmanaged<GlobalHotKeyCentre>.fromOpaque(userData).takeUnretainedValue()
            centre.fire(id: hotKeyID.id)
            return noErr
        }, 1, &spec, context, &eventHandler)
    }
}
#endif
