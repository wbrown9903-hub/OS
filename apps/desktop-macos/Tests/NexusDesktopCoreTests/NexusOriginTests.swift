import XCTest
import AppCore
@testable import NexusDesktopCore

/// The origin is the shell's whole security perimeter for navigation, so the
/// parsing and matching rules are pinned here rather than trusted to review.
final class NexusOriginTests: XCTestCase {

    // MARK: - Parsing what a person types

    func testBareHostGetsHTTPS() throws {
        let origin = try NexusOrigin.parse("nexus.example.com")
        XCTAssertEqual(origin.scheme, "https")
        XCTAssertEqual(origin.host, "nexus.example.com")
        XCTAssertEqual(origin.port, 443)
        XCTAssertEqual(origin.urlString, "https://nexus.example.com")
    }

    func testPathQueryAndFragmentAreDiscarded() throws {
        let origin = try NexusOrigin.parse("https://nexus.example.com/dashboard?tab=1#top")
        XCTAssertEqual(origin.urlString, "https://nexus.example.com")
    }

    func testLoopbackMayUseHTTP() throws {
        for host in ["127.0.0.1", "localhost"] {
            let origin = try NexusOrigin.parse("http://\(host):4311")
            XCTAssertEqual(origin.scheme, "http")
            XCTAssertEqual(origin.port, 4311)
            XCTAssertTrue(origin.isLoopback)
        }
    }

    func testHostPortWithoutSchemeIsTreatedAsHTTPS() throws {
        let origin = try NexusOrigin.parse("nexus.example.com:8443")
        XCTAssertEqual(origin.scheme, "https")
        XCTAssertEqual(origin.port, 8443)
    }

    func testPlainHTTPToAnInternetHostIsRefused() {
        XCTAssertThrowsError(try NexusOrigin.parse("http://nexus.example.com")) { error in
            let nexusError = error as? NexusError
            XCTAssertEqual(nexusError?.code, "insecureOrigin")
            XCTAssertFalse(nexusError?.recovery.isEmpty ?? true, "every refusal must carry a next step")
        }
    }

    func testCredentialsInAddressAreRefused() {
        XCTAssertThrowsError(try NexusOrigin.parse("https://user:secret@nexus.example.com")) { error in
            XCTAssertEqual((error as? NexusError)?.code, "credentialsInAddress")
        }
    }

    func testNonWebSchemesAreRefused() {
        for candidate in ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,<b>", "ftp://example.com"] {
            XCTAssertThrowsError(try NexusOrigin.parse(candidate), "\(candidate) must not be accepted")
        }
    }

    func testPrivateNetworkAddressIsRefused() {
        XCTAssertThrowsError(try NexusOrigin.parse("https://192.168.1.20")) { error in
            XCTAssertEqual((error as? NexusError)?.code, "privateAddress")
        }
    }

    func testHomographHostIsRefused() {
        // "аpple" begins with Cyrillic а.
        XCTAssertThrowsError(try NexusOrigin.parse("https://\u{0430}pple.com")) { error in
            XCTAssertEqual((error as? NexusError)?.code, "homographHost")
        }
    }

    func testEmptyAndControlCharacterInputAreRefused() {
        XCTAssertThrowsError(try NexusOrigin.parse("   "))
        XCTAssertThrowsError(try NexusOrigin.parse("https://nexus.example.com\u{0000}"))
        XCTAssertThrowsError(try NexusOrigin.parse("https://nexus.example.com\nSet-Cookie: x"))
    }

    // MARK: - Matching

    func testMatchingIsExactNotPrefix() throws {
        let origin = try NexusOrigin.parse("https://nexus.example.com")
        XCTAssertTrue(origin.matches(URL(string: "https://nexus.example.com/app/page")!))
        XCTAssertTrue(origin.matches(URL(string: "https://nexus.example.com:443/")!))
        XCTAssertFalse(origin.matches(URL(string: "https://nexus.example.com.attacker.test/")!))
        XCTAssertFalse(origin.matches(URL(string: "https://evil.nexus.example.com/")!))
        XCTAssertFalse(origin.matches(URL(string: "http://nexus.example.com/")!))
        XCTAssertFalse(origin.matches(URL(string: "https://nexus.example.com:8443/")!))
    }

    func testLoopbackPortsAreDistinctOrigins() {
        let origin = NexusOrigin.localDefault
        XCTAssertTrue(origin.matches(URL(string: "http://127.0.0.1:4311/dashboard")!))
        XCTAssertFalse(origin.matches(URL(string: "http://127.0.0.1:4312/")!))
        XCTAssertFalse(origin.matches(URL(string: "http://localhost:4311/")!),
                       "localhost and 127.0.0.1 are different origins to WebKit, so they must be here too")
    }

    func testFrameTripleMatchingHandlesDefaultPortZero() throws {
        let origin = try NexusOrigin.parse("https://nexus.example.com")
        XCTAssertTrue(origin.matches(scheme: "https", host: "nexus.example.com", port: 0))
        XCTAssertTrue(origin.matches(scheme: "https", host: "nexus.example.com", port: 443))
        XCTAssertFalse(origin.matches(scheme: "https", host: "nexus.example.com", port: 8443))
        XCTAssertFalse(origin.matches(scheme: "http", host: "nexus.example.com", port: 0))
    }

    func testDefaultOriginIsTheBundledLocalServer() {
        XCTAssertEqual(NexusOrigin.localDefault.urlString, "http://127.0.0.1:4311")
    }

    func testRoundTripsThroughCoding() throws {
        let origin = try NexusOrigin.parse("https://nexus.example.com:8443")
        let data = try JSONEncoder().encode(origin)
        XCTAssertEqual(try JSONDecoder().decode(NexusOrigin.self, from: data), origin)
    }
}
