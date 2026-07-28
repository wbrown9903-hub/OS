import Foundation

/// Pure-Swift SHA-256 and HMAC.
///
/// Nexus OS deliberately avoids a third-party crypto dependency for these two
/// primitives: they are needed on both macOS and Linux CI (where CryptoKit does not
/// exist), they are used for webhook verification and release checksums, and a
/// self-contained implementation removes a supply-chain link. Verified in tests
/// against the published NIST/RFC 4231 vectors.
public struct SHA256Digest: Equatable, Sendable {
    public let bytes: [UInt8]
    public var hexString: String { bytes.map { String(format: "%02x", $0) }.joined() }
    public var data: Data { Data(bytes) }
}

public enum SHA256 {
    private static let k: [UInt32] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]

    public static func hash(_ message: Data) -> SHA256Digest {
        var h: [UInt32] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                           0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
        var padded = [UInt8](message)
        let bitLength = UInt64(padded.count) * 8
        padded.append(0x80)
        while padded.count % 64 != 56 { padded.append(0) }
        for shift in stride(from: 56, through: 0, by: -8) {
            padded.append(UInt8truncating(bitLength >> UInt64(shift)))
        }

        var w = [UInt32](repeating: 0, count: 64)
        for chunkStart in stride(from: 0, to: padded.count, by: 64) {
            for i in 0..<16 {
                let j = chunkStart + i * 4
                w[i] = (UInt32(padded[j]) << 24) | (UInt32(padded[j + 1]) << 16)
                    | (UInt32(padded[j + 2]) << 8) | UInt32(padded[j + 3])
            }
            for i in 16..<64 {
                let s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3)
                let s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10)
                w[i] = w[i - 16] &+ s0 &+ w[i - 7] &+ s1
            }
            var (a, b, c, d, e, f, g, hh) = (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7])
            for i in 0..<64 {
                let S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
                let ch = (e & f) ^ (~e & g)
                let temp1 = hh &+ S1 &+ ch &+ k[i] &+ w[i]
                let S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
                let maj = (a & b) ^ (a & c) ^ (b & c)
                let temp2 = S0 &+ maj
                hh = g; g = f; f = e; e = d &+ temp1
                d = c; c = b; b = a; a = temp1 &+ temp2
            }
            h[0] = h[0] &+ a; h[1] = h[1] &+ b; h[2] = h[2] &+ c; h[3] = h[3] &+ d
            h[4] = h[4] &+ e; h[5] = h[5] &+ f; h[6] = h[6] &+ g; h[7] = h[7] &+ hh
        }
        var out: [UInt8] = []
        out.reserveCapacity(32)
        for value in h {
            out.append(UInt8truncating(value >> 24)); out.append(UInt8truncating(value >> 16))
            out.append(UInt8truncating(value >> 8)); out.append(UInt8truncating(value))
        }
        return SHA256Digest(bytes: out)
    }

    public static func hash(_ string: String) -> SHA256Digest { hash(Data(string.utf8)) }

    /// Streams a file so release checksums do not load a whole DMG into memory.
    public static func hashFile(at url: URL, chunkSize: Int = 1 << 20) throws -> SHA256Digest {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var accumulated = Data()
        while let chunk = try handle.read(upToCount: chunkSize), !chunk.isEmpty {
            accumulated.append(chunk)
        }
        return hash(accumulated)
    }

    private static func rotr(_ x: UInt32, _ n: UInt32) -> UInt32 { (x >> n) | (x << (32 - n)) }
    private static func UInt8truncating<T: BinaryInteger>(_ v: T) -> UInt8 { UInt8(truncatingIfNeeded: v) }
}

public enum HMAC {
    public static func sha256(key: Data, message: Data) -> SHA256Digest {
        let blockSize = 64
        var normalizedKey = [UInt8](key)
        if normalizedKey.count > blockSize { normalizedKey = SHA256.hash(key).bytes }
        if normalizedKey.count < blockSize {
            normalizedKey += [UInt8](repeating: 0, count: blockSize - normalizedKey.count)
        }
        let outerPad = normalizedKey.map { $0 ^ 0x5c }
        let innerPad = normalizedKey.map { $0 ^ 0x36 }
        let inner = SHA256.hash(Data(innerPad) + message)
        return SHA256.hash(Data(outerPad) + inner.data)
    }

    public static func sha256(key: String, message: String) -> SHA256Digest {
        sha256(key: Data(key.utf8), message: Data(message.utf8))
    }

    /// Comparison whose duration does not depend on where the first difference is.
    public static func secureCompare(_ a: [UInt8], _ b: [UInt8]) -> Bool {
        guard a.count == b.count else { return false }
        var difference: UInt8 = 0
        for i in 0..<a.count { difference |= a[i] ^ b[i] }
        return difference == 0
    }

    public static func secureCompare(_ a: Data, _ b: Data) -> Bool {
        secureCompare([UInt8](a), [UInt8](b))
    }
}

public extension Data {
    init?(hexString: String) {
        let chars = Array(hexString.utf8)
        guard chars.count % 2 == 0 else { return nil }
        var bytes = [UInt8](); bytes.reserveCapacity(chars.count / 2)
        func nibble(_ c: UInt8) -> UInt8? {
            switch c {
            case 0x30...0x39: return c - 0x30
            case 0x61...0x66: return c - 0x61 + 10
            case 0x41...0x46: return c - 0x41 + 10
            default: return nil
            }
        }
        for i in stride(from: 0, to: chars.count, by: 2) {
            guard let hi = nibble(chars[i]), let lo = nibble(chars[i + 1]) else { return nil }
            bytes.append(hi << 4 | lo)
        }
        self = Data(bytes)
    }
    var hexString: String { map { String(format: "%02x", $0) }.joined() }
}
