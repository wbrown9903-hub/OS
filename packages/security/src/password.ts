import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NexusError } from "./errors.js";

/**
 * Password hashing with scrypt from `node:crypto`.
 *
 * scrypt rather than argon2 deliberately: argon2 needs a native module, and a
 * native build step would break the promise that Nexus OS installs by
 * double-clicking one file on a Mac that has never seen a compiler. scrypt with
 * these parameters is memory-hard and is the algorithm Node ships.
 *
 * Stored form: `scrypt$N$r$p$salt$hash`, all base64. Everything needed to verify
 * is in the string, so parameters can be raised later without a migration.
 */

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const KEY_LENGTH = 64;

export const MINIMUM_PASSWORD_LENGTH = 10;

/** Rejects passwords that cannot protect an account, with a usable next step. */
export function assertPasswordAcceptable(password: string): void {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw NexusError.validation(
      "passwordTooShort",
      `Your password needs at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
      "Use a memorable phrase of three or four words — length protects you far more than symbols do.",
    );
  }
  if (password.length > 512) {
    throw NexusError.validation(
      "passwordTooLong",
      "That password is longer than Nexus OS accepts.",
      "Use a password of 512 characters or fewer.",
    );
  }
}

export function hashPassword(password: string): string {
  assertPasswordAcceptable(password);
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELISM,
  });
  return [
    "scrypt",
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELISM),
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

/** Constant-time verification. Returns false rather than throwing on a bad record. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelism = Number(parts[3]);
  if (!Number.isFinite(cost) || !Number.isFinite(blockSize) || !Number.isFinite(parallelism)) {
    return false;
  }
  const salt = Buffer.from(parts[4]!, "base64");
  const expected = Buffer.from(parts[5]!, "base64");
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length, {
    N: cost,
    r: blockSize,
    p: parallelism,
    maxmem: 256 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
