// utils/encryption.ts
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.PRIVATE_KEY_ENCRYPTION_SECRET; // 32 bytes for AES-256
const IV_LENGTH = 12; // For GCM

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error("PRIVATE_KEY_ENCRYPTION_SECRET must be at least 32 characters");
}

const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32)); // Ensure 32 bytes

export const encryptPrivateKey = (text: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Return: iv + authTag + encrypted (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decryptPrivateKey = (encryptedData: string): string => {
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
};