import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { NexusError } from "./errors.js";

/**
 * Per-user encryption for stored credentials.
 *
 * On the Mac, secrets live in the Keychain (`CredentialStore.swift`). On the
 * server there is no Keychain, so the equivalent guarantee is built here:
 *
 *   - one server master key (never in the database, never in an export),
 *   - one random salt per user (in the database, useless on its own),
 *   - scrypt to turn the pair into a 256-bit key,
 *   - AES-256-GCM so tampering with the stored ciphertext is detected, not decrypted.
 *
 * A stolen database therefore yields nothing without the master key, and a stolen
 * master key still requires the per-user salt row. Plaintext exists only inside
 * one function call and is never logged, exported or written to a config document.
 */

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface StoredSecret extends EncryptedSecret {
  /** Four characters of the original value, so a person can recognise which key it is. */
  hint: string;
}

/** Generates a new server master key. Printed once, then stored in `.env`. */
export function generateMasterKey(): string {
  return randomBytes(32).toString("base64");
}

/** Generates the per-user salt stored in `User.encryptionSalt`. */
export function newUserSalt(): string {
  return randomBytes(16).toString("base64");
}

/**
 * Four characters is enough to recognise a key and far too little to use one.
 * Matches `SecretReference.hint(for:)` on the Mac.
 */
export function hintFor(secret: string): string {
  if (secret.length <= 4) return "••••";
  return `••••${secret.slice(-4)}`;
}

export class SecretCipher {
  /** Derived keys are cached because scrypt is deliberately slow. */
  private readonly derived = new Map<string, Buffer>();

  constructor(private readonly masterKey: string) {
    if (!masterKey || masterKey.length < 16) {
      throw NexusError.security(
        "missingMasterKey",
        "Nexus OS cannot protect saved credentials because its master key is missing or too short.",
        "Set NEXUS_MASTER_KEY in your .env file to a long random value, then restart Nexus OS. Running the desktop launcher creates one for you.",
      );
    }
  }

  private keyFor(userSalt: string): Buffer {
    const cached = this.derived.get(userSalt);
    if (cached) return cached;
    const key = scryptSync(this.masterKey, userSalt, KEY_LENGTH, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELISM,
    });
    this.derived.set(userSalt, key);
    return key;
  }

  encrypt(plaintext: string, userSalt: string): StoredSecret {
    if (plaintext.length === 0) {
      throw NexusError.validation(
        "emptySecret",
        "No credential was entered.",
        "Paste the key from the service's dashboard, then choose Test Connection.",
      );
    }
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.keyFor(userSalt), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      hint: hintFor(plaintext),
    };
  }

  decrypt(record: EncryptedSecret, userSalt: string): string {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.keyFor(userSalt),
        Buffer.from(record.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(record.ciphertext, "base64")),
        decipher.final(),
      ]);
      return plaintext.toString("utf8");
    } catch {
      // A failed tag check means the stored value was altered or the master key
      // changed. Both are recoverable only by re-entering the credential.
      throw NexusError.security(
        "secretUnreadable",
        "A saved credential could not be read. It may have been altered, or this server's master key has changed.",
        "Open Settings › Connections, select this connection and enter the credential again.",
      );
    }
  }
}
