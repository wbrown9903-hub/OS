import Foundation
import AppCore
import SecurityCore
import BridgeProtocol

public enum ApplicationCategory: String, Codable, Sendable, CaseIterable {
    case game, ai, browser, system, development, communication, other

    public var title: String {
        switch self {
        case .game: return "Games"
        case .ai: return "AI"
        case .browser: return "Browsers"
        case .system: return "macOS"
        case .development: return "Development"
        case .communication: return "Communication"
        case .other: return "Other"
        }
    }
}

/// One application Nexus OS knows how to talk about.
///
/// The Bridge never accepts a path to an executable. A caller names an entry from
/// this catalogue, and the macOS layer resolves that entry to a real bundle
/// through Launch Services. The catalogue itself — including the official install
/// link used when an application is missing — is portable and unit-tested here.
public struct ApplicationDescriptor: Codable, Sendable, Equatable, Identifiable, Hashable {
    /// Stable Nexus identifier, e.g. `old-school-runescape`. Never changes.
    public let id: String
    public let displayName: String
    /// The primary bundle identifier, when there is a single canonical one.
    public let bundleIdentifier: String?
    /// Other bundle identifiers the same product has shipped under.
    public let alternateBundleIdentifiers: [String]
    /// Names a person might type or a model might produce.
    public let alternateNames: [String]
    /// The official page to send the user to when it is not installed. Always
    /// https, always the vendor's own domain — validated at construction.
    public let installURL: String
    public let category: ApplicationCategory
    /// True for entries the user added themselves.
    public let isUserDefined: Bool
    /// Applications that must always be confirmed, whatever the permission mode
    /// says. Terminal is here because opening a terminal is the closest thing to
    /// shell access the product has, and it should never happen silently.
    public let alwaysConfirm: Bool
    /// Where the bundle usually lives. Hints only; the macOS layer asks Launch
    /// Services first and treats these as a fallback for unregistered copies.
    public let installPathHints: [String]

    public init(id: String, displayName: String, bundleIdentifier: String?,
                alternateBundleIdentifiers: [String] = [], alternateNames: [String] = [],
                installURL: String, category: ApplicationCategory,
                isUserDefined: Bool = false, alwaysConfirm: Bool = false,
                installPathHints: [String] = []) {
        self.id = id
        self.displayName = displayName
        self.bundleIdentifier = bundleIdentifier
        self.alternateBundleIdentifiers = alternateBundleIdentifiers
        self.alternateNames = alternateNames
        self.installURL = installURL
        self.category = category
        self.isUserDefined = isUserDefined
        self.alwaysConfirm = alwaysConfirm
        self.installPathHints = installPathHints
    }

    /// Every identifier this entry answers to, lower-cased and space-stripped.
    public var matchKeys: Set<String> {
        var keys: Set<String> = [ApplicationDescriptor.normalise(id), ApplicationDescriptor.normalise(displayName)]
        if let bundleIdentifier { keys.insert(ApplicationDescriptor.normalise(bundleIdentifier)) }
        for alternate in alternateBundleIdentifiers { keys.insert(ApplicationDescriptor.normalise(alternate)) }
        for alternate in alternateNames { keys.insert(ApplicationDescriptor.normalise(alternate)) }
        return keys
    }

    /// Matching is deliberately forgiving about spacing, case and punctuation —
    /// "Old School RuneScape", "old-school-runescape" and "oldschoolrunescape"
    /// are the same thing — and deliberately *not* forgiving about anything else.
    /// No prefix or substring matching: "Terminal" must never satisfy a request
    /// that said "Termina".
    public static func normalise(_ value: String) -> String {
        String(value.lowercased().unicodeScalars.filter {
            CharacterSet.alphanumerics.contains($0)
        }.map(Character.init))
    }

    /// Bundle identifiers must be reverse-DNS. Applied to user-defined entries so
    /// a typo becomes a clear message rather than a silent never-matching entry.
    public static func isValidBundleIdentifier(_ value: String) -> Bool {
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count >= 2, value.count <= 255 else { return false }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-"))
        return parts.allSatisfy { part in
            !part.isEmpty && part.unicodeScalars.allSatisfy { allowed.contains($0) }
        }
    }

    /// The next step shown when this application is not installed. Never a bare
    /// "not found" — always the official download page.
    public var notInstalledNextStep: String {
        "\(displayName) is not installed on this Mac. Choose Install to open the official download page."
    }
}

public enum ApplicationCatalogueError {
    public static func unknown(_ identifier: String) -> NexusError {
        NexusError.notFound(
            "The application “\(identifier)”",
            recovery: "It is not in your Nexus application list. Add it under Settings › Applications › Add application, "
                + "then try again.")
    }

    public static func badBundleIdentifier(_ value: String) -> NexusError {
        NexusError.validation(
            "badBundleIdentifier",
            "“\(value)” is not a valid application identifier.",
            recovery: "An identifier looks like com.example.AppName. You can find it in the app's Info.plist, "
                + "or leave it blank and pick the app with the file picker.")
    }

    public static func badInstallURL(_ value: String, reason: NexusError) -> NexusError {
        NexusError.validation(
            "badInstallURL",
            "The install link for that application was rejected: \(reason.message)",
            recovery: "Use the vendor's official https:// download page.")
    }

    public static func duplicate(_ identifier: String) -> NexusError {
        NexusError.validation(
            "duplicateApplication",
            "There is already an application called “\(identifier)” in your list.",
            recovery: "Give the new entry a different name, or edit the existing one.")
    }
}
