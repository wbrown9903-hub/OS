import Foundation
import AppCore
import SecurityCore
import BridgeProtocol

/// The portable list of applications Nexus OS can open, focus, quit and detect,
/// plus the matching rules and the "not installed → official install page"
/// fallback.
///
/// Detection *results* come from the macOS layer (Launch Services and the
/// configured search paths). Everything in this file is pure data and pure
/// logic, so the part that decides "which app did the caller mean" and "where do
/// we send someone who does not have it" is fully tested on Linux.
public struct ApplicationCatalogue: Sendable, Equatable {
    public private(set) var entries: [ApplicationDescriptor]
    private let index: [String: Int]

    public init(entries: [ApplicationDescriptor]) {
        self.entries = entries
        var index: [String: Int] = [:]
        for (position, entry) in entries.enumerated() {
            for key in entry.matchKeys where index[key] == nil { index[key] = position }
        }
        self.index = index
    }

    // MARK: - Built-in entries

    /// The applications Nexus OS ships knowing about. Install URLs are the
    /// vendors' own https pages; none of them is a redirector or a mirror.
    public static let builtIn: [ApplicationDescriptor] = [
        ApplicationDescriptor(
            id: "jagex-launcher",
            displayName: "Jagex Launcher",
            bundleIdentifier: "com.jagex.launcher",
            alternateBundleIdentifiers: ["com.jagex.jagexlauncher"],
            alternateNames: ["Jagex", "Jagex Launcher.app"],
            installURL: "https://www.jagex.com/en-GB/launcher",
            category: .game,
            installPathHints: ["/Applications/Jagex Launcher.app"]),

        ApplicationDescriptor(
            id: "runescape",
            displayName: "RuneScape",
            bundleIdentifier: "com.jagex.runescape",
            alternateBundleIdentifiers: ["com.jagex.rs2client", "com.jagex.runescape.launcher"],
            alternateNames: ["RS3", "RuneScape 3", "RuneScape Client"],
            installURL: "https://www.runescape.com/download",
            category: .game,
            installPathHints: ["/Applications/RuneScape.app"]),

        ApplicationDescriptor(
            id: "old-school-runescape",
            displayName: "Old School RuneScape",
            bundleIdentifier: "com.jagex.oldschool.runescape",
            alternateBundleIdentifiers: ["com.jagex.oldschool", "com.jagex.osrs"],
            alternateNames: ["OSRS", "Old School", "OldSchool RuneScape"],
            installURL: "https://oldschool.runescape.com/download",
            category: .game,
            installPathHints: ["/Applications/Old School RuneScape.app"]),

        ApplicationDescriptor(
            id: "claude",
            displayName: "Claude",
            bundleIdentifier: "com.anthropic.claudefordesktop",
            alternateBundleIdentifiers: ["com.anthropic.claude"],
            alternateNames: ["Claude Desktop", "Claude for Desktop", "Anthropic Claude"],
            installURL: "https://claude.ai/download",
            category: .ai,
            installPathHints: ["/Applications/Claude.app"]),

        ApplicationDescriptor(
            id: "chatgpt",
            displayName: "ChatGPT",
            bundleIdentifier: "com.openai.chat",
            alternateBundleIdentifiers: ["com.openai.chatgpt"],
            alternateNames: ["ChatGPT Desktop", "OpenAI ChatGPT"],
            installURL: "https://openai.com/chatgpt/download/",
            category: .ai,
            installPathHints: ["/Applications/ChatGPT.app"]),

        ApplicationDescriptor(
            id: "safari",
            displayName: "Safari",
            bundleIdentifier: "com.apple.Safari",
            alternateNames: ["Apple Safari"],
            installURL: "https://www.apple.com/safari/",
            category: .browser,
            installPathHints: ["/Applications/Safari.app", "/System/Applications/Safari.app"]),

        ApplicationDescriptor(
            id: "chrome",
            displayName: "Google Chrome",
            bundleIdentifier: "com.google.Chrome",
            alternateBundleIdentifiers: ["com.google.Chrome.beta", "com.google.Chrome.canary"],
            alternateNames: ["Chrome", "Google Chrome.app"],
            installURL: "https://www.google.com/chrome/",
            category: .browser,
            installPathHints: ["/Applications/Google Chrome.app"]),

        ApplicationDescriptor(
            id: "finder",
            displayName: "Finder",
            bundleIdentifier: "com.apple.finder",
            alternateNames: ["macOS Finder"],
            installURL: "https://support.apple.com/en-gb/guide/mac-help/mchlp2605/mac",
            category: .system,
            installPathHints: ["/System/Library/CoreServices/Finder.app"]),

        ApplicationDescriptor(
            id: "terminal",
            displayName: "Terminal",
            bundleIdentifier: "com.apple.Terminal",
            alternateNames: ["macOS Terminal", "Terminal.app"],
            installURL: "https://support.apple.com/en-gb/guide/terminal/welcome/mac",
            category: .system,
            // Opening a terminal is as close to shell access as this product
            // comes. The Bridge still passes it nothing to run, but it is never
            // opened without the user saying yes, in any permission mode.
            alwaysConfirm: true,
            installPathHints: ["/System/Applications/Utilities/Terminal.app",
                               "/Applications/Utilities/Terminal.app"]),

        ApplicationDescriptor(
            id: "xcode",
            displayName: "Xcode",
            bundleIdentifier: "com.apple.dt.Xcode",
            alternateNames: ["Apple Xcode"],
            installURL: "https://apps.apple.com/gb/app/xcode/id497799835",
            category: .development,
            installPathHints: ["/Applications/Xcode.app"]),

        ApplicationDescriptor(
            id: "vscode",
            displayName: "Visual Studio Code",
            bundleIdentifier: "com.microsoft.VSCode",
            alternateBundleIdentifiers: ["com.microsoft.VSCodeInsiders", "com.visualstudio.code.oss"],
            alternateNames: ["VS Code", "VSCode", "Code"],
            installURL: "https://code.visualstudio.com/download",
            category: .development,
            installPathHints: ["/Applications/Visual Studio Code.app"]),

        ApplicationDescriptor(
            id: "discord",
            displayName: "Discord",
            bundleIdentifier: "com.hnc.Discord",
            alternateBundleIdentifiers: ["com.discordapp.Discord", "com.hnc.DiscordPTB", "com.hnc.DiscordCanary"],
            alternateNames: ["Discord.app"],
            installURL: "https://discord.com/download",
            category: .communication,
            installPathHints: ["/Applications/Discord.app"]),
    ]

    public static let standard = ApplicationCatalogue(entries: builtIn)

    // MARK: - Matching

    /// Resolves whatever the caller named. Exact match on the normalised id,
    /// display name, bundle identifier or any recorded alternate. No fuzzy or
    /// prefix matching: an unrecognised name is an error, not a guess.
    public func resolve(_ identifier: String) -> ApplicationDescriptor? {
        let key = ApplicationDescriptor.normalise(identifier)
        guard !key.isEmpty, let position = index[key] else { return nil }
        return entries[position]
    }

    public func require(_ identifier: String) throws -> ApplicationDescriptor {
        guard let entry = resolve(identifier) else { throw ApplicationCatalogueError.unknown(identifier) }
        return entry
    }

    public func contains(_ identifier: String) -> Bool { resolve(identifier) != nil }

    public func entries(in category: ApplicationCategory) -> [ApplicationDescriptor] {
        entries.filter { $0.category == category }
    }

    // MARK: - User-defined entries

    /// Adds a custom application. Validates the bundle identifier shape and runs
    /// the install URL through the same `URLValidator` used everywhere else, so a
    /// user-supplied entry cannot smuggle a `javascript:` or `file:` link into a
    /// button labelled "Install".
    public func adding(custom entry: ApplicationDescriptor) throws -> ApplicationCatalogue {
        guard !entry.id.trimmingCharacters(in: .whitespaces).isEmpty else {
            throw NexusError.validation("emptyApplicationID", "The application needs a name.",
                                        recovery: "Type a short name such as “My Editor”, then save.")
        }
        if let existing = resolve(entry.id), existing.id != entry.id || !existing.isUserDefined {
            throw ApplicationCatalogueError.duplicate(entry.id)
        }
        if let bundleIdentifier = entry.bundleIdentifier,
           !ApplicationDescriptor.isValidBundleIdentifier(bundleIdentifier) {
            throw ApplicationCatalogueError.badBundleIdentifier(bundleIdentifier)
        }
        do {
            _ = try URLValidator(policy: .remoteFetch).validate(entry.installURL)
        } catch let error as NexusError {
            throw ApplicationCatalogueError.badInstallURL(entry.installURL, reason: error)
        }
        var next = entries.filter { $0.id != entry.id }
        next.append(entry)
        return ApplicationCatalogue(entries: next)
    }

    public func removing(id: String) -> ApplicationCatalogue {
        ApplicationCatalogue(entries: entries.filter { $0.id != id })
    }

    /// Convenience for the "Add application" sheet.
    public static func userDefined(id: String, displayName: String, bundleIdentifier: String?,
                                   installURL: String, category: ApplicationCategory = .other,
                                   alternateNames: [String] = []) -> ApplicationDescriptor {
        ApplicationDescriptor(id: id, displayName: displayName, bundleIdentifier: bundleIdentifier,
                              alternateNames: alternateNames, installURL: installURL,
                              category: category, isUserDefined: true)
    }
}
