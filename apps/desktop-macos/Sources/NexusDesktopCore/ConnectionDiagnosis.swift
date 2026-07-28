import Foundation
import AppCore

/// Why the Nexus page is not on screen, in words a person can act on.
///
/// Every branch produces a plain-language message *and* a next step, and where a
/// next step is something the shell can do, it names the button that does it.
/// This is a pure lookup so the whole table can be read — and tested — in one go.
public struct ConnectionDiagnosis: Sendable, Equatable {
    /// What went wrong, in one sentence, addressed to the user.
    public let headline: String
    /// A short paragraph explaining it without jargon.
    public let detail: String
    /// The concrete thing to do next.
    public let nextStep: String
    /// Which built-in button, if any, resolves it.
    public let remedy: Remedy
    /// True when retrying by itself has a realistic chance of working, so the
    /// shell knows whether to poll quietly in the background.
    public let isTransient: Bool

    public enum Remedy: String, Sendable, Equatable {
        /// "Try Again" — re-issue the same load.
        case retry
        /// "Change Address" — open the connection screen.
        case changeAddress
        /// "Open Network Settings" — macOS network pane.
        case openNetworkSettings
        /// "Start Nexus on this Mac" — the local server is not running.
        case startLocalNexus
        /// Nothing the shell can do automatically.
        case none
    }

    public init(headline: String, detail: String, nextStep: String, remedy: Remedy, isTransient: Bool) {
        self.headline = headline
        self.detail = detail
        self.nextStep = nextStep
        self.remedy = remedy
        self.isTransient = isTransient
    }

    /// Turns a `URLError` code into a diagnosis.
    ///
    /// `origin` matters: "nothing is listening on 127.0.0.1:4311" means *start
    /// your local Nexus*, whereas the same code against a hosted address means
    /// *the service is down or the address is wrong*. The shell should never give
    /// the same advice for both.
    public static func diagnose(urlErrorCode: Int, origin: NexusOrigin) -> ConnectionDiagnosis {
        switch urlErrorCode {
        case URLError.notConnectedToInternet.rawValue:
            return ConnectionDiagnosis(
                headline: "This Mac is offline",
                detail: "Nexus could not reach \(origin.displayName) because this Mac has no internet connection right now. Nothing has been lost — anything you were working on is still saved.",
                nextStep: "Reconnect to Wi-Fi or plug in a cable, then choose Try Again.",
                remedy: .openNetworkSettings,
                isTransient: true)

        case URLError.cannotConnectToHost.rawValue, URLError.cannotFindHost.rawValue:
            if origin.isLoopback {
                return ConnectionDiagnosis(
                    headline: "Nexus is not running on this Mac yet",
                    detail: "Nothing answered on \(origin.urlString). That address is your own Mac, so this normally means the Nexus interface has not been started.",
                    nextStep: "Double-click START_NEXUS.command in your Nexus OS folder and wait for it to say it is ready, then choose Try Again.",
                    remedy: .startLocalNexus,
                    isTransient: true)
            }
            return ConnectionDiagnosis(
                headline: "Nexus did not answer",
                detail: "\(origin.host) could not be reached. Either the address is wrong, or your Nexus is not running there at the moment.",
                nextStep: "Check the address in Settings › Connection. If it is right, wait a minute and choose Try Again.",
                remedy: .changeAddress,
                isTransient: true)

        case URLError.timedOut.rawValue:
            return ConnectionDiagnosis(
                headline: "Nexus took too long to answer",
                detail: "\(origin.displayName) accepted the connection but did not finish loading. This usually means it is still starting up, or the connection is very slow.",
                nextStep: "Wait a few seconds and choose Try Again.",
                remedy: .retry,
                isTransient: true)

        case URLError.networkConnectionLost.rawValue:
            return ConnectionDiagnosis(
                headline: "The connection dropped",
                detail: "The connection to \(origin.displayName) was interrupted part-way through loading.",
                nextStep: "Choose Try Again. If it keeps dropping, check your Wi-Fi.",
                remedy: .retry,
                isTransient: true)

        case URLError.dnsLookupFailed.rawValue:
            return ConnectionDiagnosis(
                headline: "That address could not be found",
                detail: "No site called \(origin.host) could be located. This is usually a typo in the address, or a network that blocks name lookups.",
                nextStep: "Check the spelling in Settings › Connection, then choose Try Again.",
                remedy: .changeAddress,
                isTransient: false)

        case URLError.secureConnectionFailed.rawValue,
             URLError.serverCertificateUntrusted.rawValue,
             URLError.serverCertificateHasBadDate.rawValue,
             URLError.serverCertificateHasUnknownRoot.rawValue,
             URLError.serverCertificateNotYetValid.rawValue:
            return ConnectionDiagnosis(
                headline: "The secure connection could not be trusted",
                detail: "\(origin.host) answered, but its security certificate could not be verified. Nexus stopped rather than send your work over a connection it cannot trust.",
                nextStep: "Check the address in Settings › Connection. If you host Nexus yourself, renew its certificate. Nexus Desktop has no option to ignore this, and that is deliberate.",
                remedy: .changeAddress,
                isTransient: false)

        case URLError.userAuthenticationRequired.rawValue:
            return ConnectionDiagnosis(
                headline: "Nexus asked you to sign in",
                detail: "\(origin.displayName) needs you to sign in before it will load.",
                nextStep: "Choose Try Again to load the sign-in page.",
                remedy: .retry,
                isTransient: true)

        case URLError.badURL.rawValue, URLError.unsupportedURL.rawValue:
            return ConnectionDiagnosis(
                headline: "That Nexus address cannot be used",
                detail: "“\(origin.urlString)” is not an address Nexus Desktop can open.",
                nextStep: "Open Settings › Connection and enter the address your Nexus is published on.",
                remedy: .changeAddress,
                isTransient: false)

        case URLError.cancelled.rawValue:
            return ConnectionDiagnosis(
                headline: "Loading was stopped",
                detail: "The page stopped loading before it finished, usually because a new address was opened or the window was closed.",
                nextStep: "Choose Try Again to load Nexus.",
                remedy: .retry,
                isTransient: true)

        default:
            return ConnectionDiagnosis(
                headline: "Nexus could not be loaded",
                detail: "Something went wrong while loading \(origin.displayName), and Nexus Desktop does not have a more specific explanation than that.",
                nextStep: "Choose Try Again. If it keeps failing, check the address in Settings › Connection, or open \(origin.urlString) in your browser to see what it says.",
                remedy: .retry,
                isTransient: true)
        }
    }

    /// An HTTP status the server returned. A 200 never reaches here.
    public static func diagnose(httpStatus: Int, origin: NexusOrigin) -> ConnectionDiagnosis {
        switch httpStatus {
        case 401, 403:
            return ConnectionDiagnosis(
                headline: "Nexus would not let this Mac in",
                detail: "\(origin.displayName) answered, but refused the request (error \(httpStatus)). Your session has probably expired.",
                nextStep: "Choose Try Again to load the sign-in page. If that does not help, sign in at \(origin.urlString) in your browser first.",
                remedy: .retry,
                isTransient: true)
        case 404:
            return ConnectionDiagnosis(
                headline: "There is no Nexus at that address",
                detail: "\(origin.host) answered, but there is nothing at \(origin.urlString) (error 404). The address is probably pointing at the wrong place.",
                nextStep: "Open Settings › Connection and check the address.",
                remedy: .changeAddress,
                isTransient: false)
        case 500...599:
            return ConnectionDiagnosis(
                headline: "Nexus reported a problem on its side",
                detail: "\(origin.displayName) answered with error \(httpStatus), which means the problem is at the Nexus end rather than on this Mac.",
                nextStep: "Wait a minute and choose Try Again. If you run Nexus yourself, check its log with TEST_NEXUS.command.",
                remedy: .retry,
                isTransient: true)
        default:
            return ConnectionDiagnosis(
                headline: "Nexus answered unexpectedly",
                detail: "\(origin.displayName) replied with status \(httpStatus) instead of a page.",
                nextStep: "Choose Try Again. If it keeps happening, check the address in Settings › Connection.",
                remedy: .retry,
                isTransient: true)
        }
    }

    /// The shell has decided to stop retrying by itself.
    public static func offline(origin: NexusOrigin) -> ConnectionDiagnosis {
        ConnectionDiagnosis(
            headline: "You are offline",
            detail: "Nexus needs a connection to \(origin.displayName) to show your workspace. Nothing has been lost; the moment the connection returns, Nexus will pick up where you left off.",
            nextStep: "Reconnect to the network, then choose Try Again.",
            remedy: .retry,
            isTransient: true)
    }

    /// Turned into the standard error shape when a caller wants to log it.
    public var asError: NexusError {
        NexusError(domain: .network, code: "connection", message: "\(headline). \(detail)", recovery: nextStep)
    }
}

/// How long the shell waits before each automatic retry, and when it gives up and
/// leaves the decision to the user.
///
/// Backoff exists so a Mac that wakes on a train does not hammer a server, and so
/// the offline screen does not flicker between states. It never retries forever:
/// after ``maximumAutomaticAttempts`` the screen says so and waits for a click.
public struct RetryBackoff: Sendable, Equatable {
    public let maximumAutomaticAttempts: Int
    private let base: TimeInterval
    private let ceiling: TimeInterval

    public init(maximumAutomaticAttempts: Int = 6, base: TimeInterval = 1.5, ceiling: TimeInterval = 30) {
        self.maximumAutomaticAttempts = maximumAutomaticAttempts
        self.base = base
        self.ceiling = ceiling
    }

    /// `nil` means "stop retrying automatically and show the Try Again button".
    public func delay(forAttempt attempt: Int) -> TimeInterval? {
        guard attempt >= 1, attempt <= maximumAutomaticAttempts else { return nil }
        let raw = base * pow(2, Double(attempt - 1))
        return min(raw, ceiling)
    }
}
