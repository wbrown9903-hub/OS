import Foundation
import AppCore

/// Removes credential-shaped material from anything on its way to a log, a
/// notification, a diagnostics export or an AI provider payload.
///
/// The rule Nexus OS follows: redaction is applied at the *sink*, not at the call
/// site, so a future contributor cannot leak a secret by forgetting to wrap it.
public struct SecretRedactor: Sendable {
    public static let placeholder = "«redacted»"

    /// Ordered so the most specific shapes match before the generic high-entropy rule.
    private static let patterns: [(name: String, regex: NSRegularExpression)] = {
        let raw: [(String, String)] = [
            ("anthropic", #"sk-ant-[A-Za-z0-9_\-]{16,}"#),
            ("openai", #"sk-(?:proj-)?[A-Za-z0-9_\-]{20,}"#),
            ("github", #"gh[pousr]_[A-Za-z0-9]{16,}"#),
            ("githubFineGrained", #"github_pat_[A-Za-z0-9_]{20,}"#),
            ("shopify", #"shp(?:at|ca|pa|ss)_[A-Fa-f0-9]{16,}"#),
            ("google", #"ya29\.[A-Za-z0-9_\-]{20,}"#),
            ("slack", #"xox[abposr]-[A-Za-z0-9\-]{10,}"#),
            ("awsAccessKey", #"AKIA[0-9A-Z]{16}"#),
            ("jwt", #"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}"#),
            ("privateKeyBlock", #"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"#),
            ("bearer", #"(?i)(bearer|authorization:)\s+[A-Za-z0-9_\-\.=]{12,}"#),
            ("assignedSecret", #"(?i)\b(api[_\-]?key|apikey|secret|token|password|passwd|client[_\-]?secret|access[_\-]?token|refresh[_\-]?token)\b\s*[:=]\s*[\"']?[^\s\"',;}]{6,}"#),
            ("basicAuthURL", #"[a-zA-Z][a-zA-Z0-9+.\-]*:\/\/[^\s:@\/]+:[^\s@\/]+@"#),
            ("hexSecret", #"\b[A-Fa-f0-9]{40,}\b"#),
            ("wordPressAppPassword", #"\b(?:[A-Za-z0-9]{4} ){5}[A-Za-z0-9]{4}\b"#),
        ]
        return raw.compactMap { name, pattern in
            (try? NSRegularExpression(pattern: pattern)).map { (name, $0) }
        }
    }()

    /// BIP-39 style recovery phrases are never accepted or stored by Nexus OS.
    /// Detecting them lets the wallet centre warn instead of silently logging one.
    private static let mnemonicRegex = try? NSRegularExpression(pattern: #"(?i)\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b"#)

    public init() {}

    public func redact(_ input: String) -> String {
        guard !input.isEmpty else { return input }
        var output = input
        for (_, regex) in Self.patterns {
            output = regex.stringByReplacingMatches(
                in: output, range: NSRange(output.startIndex..., in: output),
                withTemplate: Self.placeholder)
        }
        if let mnemonicRegex = Self.mnemonicRegex, looksLikeMnemonic(output, regex: mnemonicRegex) {
            output = mnemonicRegex.stringByReplacingMatches(
                in: output, range: NSRange(output.startIndex..., in: output),
                withTemplate: "«recovery phrase removed»")
        }
        return output
    }

    public func redact(_ dictionary: [String: String]) -> [String: String] {
        dictionary.reduce(into: [:]) { $0[$1.key] = redact($1.value) }
    }

    /// Recursively redacts a JSON value, dropping values under credential-shaped keys entirely.
    public func redactJSON(_ value: Any) -> Any {
        switch value {
        case let string as String: return redact(string)
        case let dict as [String: Any]:
            return dict.reduce(into: [String: Any]()) { result, pair in
                result[pair.key] = isSensitiveKey(pair.key) ? Self.placeholder : redactJSON(pair.value)
            }
        case let array as [Any]: return array.map(redactJSON)
        default: return value
        }
    }

    public func isSensitiveKey(_ key: String) -> Bool {
        let k = key.lowercased()
        return ["secret", "token", "password", "passwd", "apikey", "api_key", "authorization",
                "credential", "privatekey", "private_key", "seed", "mnemonic", "clientsecret",
                "client_secret", "accesstoken", "access_token", "refreshtoken", "refresh_token",
                "signingkey", "webhooksecret", "webhook_secret"]
            .contains { k.contains($0) }
    }

    /// A long run of lowercase words is only treated as a mnemonic when the words
    /// are short and uniform, so ordinary prose is not mangled.
    private func looksLikeMnemonic(_ text: String, regex: NSRegularExpression) -> Bool {
        let range = NSRange(text.startIndex..., in: text)
        guard let match = regex.firstMatch(in: text, range: range),
              let r = Range(match.range, in: text) else { return false }
        let words = text[r].split(separator: " ")
        guard (12...24).contains(words.count) else { return false }
        let avg = words.reduce(0) { $0 + $1.count } / max(words.count, 1)
        return avg <= 7 && words.allSatisfy { $0.allSatisfy { $0.isLowercase && $0.isLetter } }
    }
}

public extension Logger {
    /// Call once during startup so no sink can ever receive an unredacted record.
    func installNexusRedaction() {
        let redactor = SecretRedactor()
        install(redactor: { redactor.redact($0) })
    }
}
