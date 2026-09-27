import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { decryptLegacyChannelSecret } from "./channel-credentials";

it("reads the original obf format with the original derivation without rewriting data", () => {
  const userData = "C:/public-fixture/user-data";
  const appName = "public-fixture";
  const key = createHash("sha256").update(`${userData}::${appName}::cyrene-bot-secret`).digest().subarray(0, 16);
  const plain = Buffer.from("public test credential", "utf8");
  const encrypted = Buffer.from(plain.map((byte, index) => byte ^ key[index % key.length]));
  const stored = `obf:${encrypted.toString("base64")}`;
  expect(decryptLegacyChannelSecret(stored, userData, appName)).toBe(plain.toString("utf8"));
  expect(stored).toBe(`obf:${encrypted.toString("base64")}`);
});

it("rejects current formats at the legacy boundary", () => {
  expect(() => decryptLegacyChannelSecret("obf2:fixture", "public", "public")).toThrow("INVALID_LEGACY_CHANNEL_SECRET");
});
