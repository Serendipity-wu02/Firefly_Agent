import { createHash } from "node:crypto";
import { LEGACY_CHANNEL_SECRET_SUFFIX } from "../../shared/legacy-firefly-contracts";

export function decryptLegacyChannelSecret(stored: string, userData: string, appName: string): string {
  if (!stored.startsWith("obf:")) throw new Error("INVALID_LEGACY_CHANNEL_SECRET");
  const key = createHash("sha256").update(`${userData}::${appName}::${LEGACY_CHANNEL_SECRET_SUFFIX}`).digest().subarray(0, 16);
  const encrypted = Buffer.from(stored.slice(4), "base64");
  const plain = Buffer.alloc(encrypted.length);
  for (let index = 0; index < encrypted.length; index++) plain[index] = encrypted[index] ^ key[index % key.length];
  return plain.toString("utf8");
}
