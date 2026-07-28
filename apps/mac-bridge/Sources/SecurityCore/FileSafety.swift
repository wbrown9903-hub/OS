import Foundation
import AppCore

/// Confines file operations to explicitly granted roots. Workflows, plugins and
/// AI-proposed actions can only ever name a path inside a root the user chose.
public struct PathGuard: Sendable {
    public let roots: [URL]

    public init(roots: [URL]) {
        self.roots = roots.map { $0.standardizedFileURL.resolvingSymlinksInPath() }
    }

    @discardableResult
    public func resolve(_ candidate: String, relativeTo root: URL? = nil) throws -> URL {
        guard !candidate.isEmpty else {
            throw NexusError.validation("emptyPath", "No file or folder was specified.", recovery: "Choose a file or folder first.")
        }
        guard !candidate.contains("\0") else {
            throw NexusError.security("nullByte", "That file path contains an invalid character.",
                                      recovery: "Choose the file using the file picker instead of typing its path.")
        }
        let expanded = (candidate as NSString).expandingTildeInPath
        let base = root ?? roots.first
        let url: URL = expanded.hasPrefix("/")
            ? URL(fileURLWithPath: expanded)
            : (base.map { $0.appendingPathComponent(expanded) } ?? URL(fileURLWithPath: expanded))
        return try confine(url)
    }

    /// Resolves symlinks before comparing, so a link pointing outside a root is
    /// rejected rather than followed.
    @discardableResult
    public func confine(_ url: URL) throws -> URL {
        let resolved = Self.fullyResolve(url)
        guard !roots.isEmpty else {
            throw NexusError.permission("noRoots", "Nexus OS has not been given access to any folders yet.",
                                        recovery: "Open Settings › Permissions › Files and choose the folders Nexus OS may use.")
        }
        for root in roots where resolved.path == root.path || resolved.path.hasPrefix(root.path + "/") {
            return resolved
        }
        throw NexusError.security("outsideAllowedFolder",
                                  "That location is outside the folders you have allowed Nexus OS to use.",
                                  recovery: "Add the folder under Settings › Permissions › Files, or pick a location inside an allowed folder.")
    }

    public func isAllowed(_ url: URL) -> Bool { (try? confine(url)) != nil }

    /// `resolvingSymlinksInPath()` only resolves components that exist on disk, so a
    /// path such as `<root>/link-to-elsewhere/new-file.txt` would appear to stay
    /// inside the root while actually writing outside it. This walks down from the
    /// deepest existing ancestor, resolving it, then re-appends the missing tail.
    static func fullyResolve(_ url: URL) -> URL {
        let standardized = url.standardizedFileURL
        var remainder: [String] = []
        var probe = standardized
        let fm = FileManager.default

        while !fm.fileExists(atPath: probe.path) {
            let parent = probe.deletingLastPathComponent()
            // Stop at the filesystem root rather than looping forever.
            guard parent.path != probe.path, parent.path.count < probe.path.count else { break }
            remainder.insert(probe.lastPathComponent, at: 0)
            probe = parent
        }
        var resolved = probe.resolvingSymlinksInPath()
        for component in remainder { resolved.appendPathComponent(component) }
        return resolved.standardizedFileURL
    }
}

/// Validates downloaded media before it is cached or displayed. Applies to the
/// RuneScape news banner, user-supplied images, theme packs and plugin icons.
public struct MediaValidator: Sendable {
    public enum ImageFormat: String, Sendable, CaseIterable {
        case png, jpeg, gif, webp
        public var fileExtension: String { self == .jpeg ? "jpg" : rawValue }
        public var mimeType: String { self == .jpeg ? "image/jpeg" : "image/\(rawValue)" }
    }

    public let maximumBytes: Int
    public init(maximumBytes: Int = 8 * 1024 * 1024) { self.maximumBytes = maximumBytes }

    /// Identifies the format from the file's own bytes rather than trusting the
    /// server's Content-Type or the URL's extension.
    public static func detectFormat(_ data: Data) -> ImageFormat? {
        let b = [UInt8](data.prefix(16))
        guard b.count >= 12 else { return nil }
        if b.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) { return .png }
        if b.starts(with: [0xFF, 0xD8, 0xFF]) { return .jpeg }
        if b.starts(with: Array("GIF87a".utf8)) || b.starts(with: Array("GIF89a".utf8)) { return .gif }
        if b.starts(with: Array("RIFF".utf8)), Array(b[8..<12]) == Array("WEBP".utf8) { return .webp }
        return nil
    }

    @discardableResult
    public func validateImage(_ data: Data, declaredMIME: String? = nil) throws -> ImageFormat {
        guard !data.isEmpty else {
            throw NexusError.validation("emptyImage", "The image file is empty.",
                                        recovery: "Choose a different image, or use the built-in artwork.")
        }
        guard data.count <= maximumBytes else {
            throw NexusError.validation("imageTooLarge",
                                        "That image is larger than the \(maximumBytes / 1024 / 1024) MB limit.",
                                        recovery: "Use a smaller image, or reduce its resolution before adding it.")
        }
        guard let format = Self.detectFormat(data) else {
            throw NexusError.security("unknownImageFormat",
                                      "That file is not a PNG, JPEG, GIF or WebP image.",
                                      recovery: "Nexus OS only displays standard image formats. Convert the file, or pick another image.")
        }
        // SVG and HTML can carry script. They are refused outright, including when
        // a server mislabels them as an image.
        if let declaredMIME = declaredMIME?.lowercased(),
           declaredMIME.contains("svg") || declaredMIME.contains("html") || declaredMIME.contains("xml") {
            throw NexusError.security("scriptableImageType",
                                      "That address returned a document rather than a picture.",
                                      recovery: "Use a direct link to a PNG or JPEG image.")
        }
        if containsScriptMarkup(data) {
            throw NexusError.security("scriptInImage",
                                      "That image file contains embedded web code and was rejected.",
                                      recovery: "Use a different image. This can indicate a tampered or unsafe file.")
        }
        return format
    }

    /// Scans the leading bytes for markup that would execute if the file were ever
    /// handed to a web view. Works directly on bytes — a polyglot file that begins
    /// with a valid PNG header is still caught, and no text decoding can fail.
    private func containsScriptMarkup(_ data: Data) -> Bool {
        let haystack = [UInt8](data.prefix(4096)).map { byte -> UInt8 in
            (byte >= 0x41 && byte <= 0x5A) ? byte + 32 : byte     // ASCII lowercase
        }
        let needles = ["<script", "<svg", "<!doctype html", "<html", "javascript:", "<iframe", "onerror="]
        return needles.contains { needle in
            let pattern = [UInt8](needle.utf8)
            guard haystack.count >= pattern.count else { return false }
            for start in 0...(haystack.count - pattern.count) {
                if Array(haystack[start..<(start + pattern.count)]) == pattern { return true }
            }
            return false
        }
    }

    /// Audio for the sale sound and UI feedback. Same principle: sniff, don't trust.
    public func validateAudio(_ data: Data, maximumBytes: Int = 5 * 1024 * 1024) throws -> String {
        guard data.count <= maximumBytes else {
            throw NexusError.validation("audioTooLarge", "That sound file is too large.",
                                        recovery: "Choose a file under \(maximumBytes / 1024 / 1024) MB.")
        }
        let b = [UInt8](data.prefix(12))
        guard b.count >= 12 else {
            throw NexusError.validation("audioUnreadable", "That sound file could not be read.", recovery: "Choose a different file.")
        }
        if b.starts(with: Array("RIFF".utf8)), Array(b[8..<12]) == Array("WAVE".utf8) { return "wav" }
        if b.starts(with: [0x66, 0x74, 0x79, 0x70], offsetBy: 4) { return "m4a" }
        if b.starts(with: [0x49, 0x44, 0x33]) || (b[0] == 0xFF && (b[1] & 0xE0) == 0xE0) { return "mp3" }
        if b.starts(with: Array("fLaC".utf8)) { return "flac" }
        if b.starts(with: Array("FORM".utf8)) { return "aiff" }
        throw NexusError.security("unknownAudioFormat", "That file is not a recognised sound format.",
                                  recovery: "Use a WAV, MP3, M4A, AIFF or FLAC file.")
    }
}

private extension Array where Element == UInt8 {
    func starts(with pattern: [UInt8], offsetBy offset: Int) -> Bool {
        guard count >= offset + pattern.count else { return false }
        return Array(self[offset..<(offset + pattern.count)]) == pattern
    }
}
