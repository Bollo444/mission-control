import crypto from "node:crypto";

/*
  Opt-in encryption for secrets at rest. Active ONLY when MC_ENCRYPTION_KEY is
  set in the environment; otherwise values are stored plaintext exactly as before
  (fully non-breaking). AES-256-GCM. Stored format:

    enc:v1:<ivBase64>:<tagBase64>:<ciphertextBase64>

  Back up MC_ENCRYPTION_KEY — without it, encrypted values cannot be recovered.
*/

const PREFIX = "enc:v1:";

function masterKey(): Buffer | null {
  const raw = process.env.MC_ENCRYPTION_KEY;
  if (!raw) return null;
  // A 32-byte hex key is used directly; any other passphrase is hashed to 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptionEnabled(): boolean {
  return masterKey() !== null;
}

export function isEncrypted(v: string): boolean {
  return typeof v === "string" && v.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  const key = masterKey();
  if (!key || !plain || isEncrypted(plain)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const key = masterKey();
  if (!key) return stored; // no key available — leave as-is (unusable but safe)
  try {
    const parts = stored.split(":"); // ["enc","v1",iv,tag,ct]
    const iv = Buffer.from(parts[2], "base64");
    const tag = Buffer.from(parts[3], "base64");
    const ct = Buffer.from(parts[4], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return stored;
  }
}
