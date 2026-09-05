export const TTS_TEXT_PREVIEW_LIMIT = 40;

export interface TtsTextIntegrity {
  utf16Length: number;
  utf8ByteLength: number;
  sha256: string;
  safePreview: string;
}

type RuntimeTextEncoder = {
  encode: (text: string) => Uint8Array;
};

type RuntimeSubtleCrypto = {
  digest: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer>;
};

function getTextEncoder(): RuntimeTextEncoder {
  const TextEncoderConstructor = (globalThis as unknown as {
    TextEncoder?: new () => RuntimeTextEncoder;
  }).TextEncoder;
  if (!TextEncoderConstructor) {
    throw new Error("TextEncoder is unavailable");
  }
  return new TextEncoderConstructor();
}

function getSubtleCrypto(): RuntimeSubtleCrypto {
  const runtimeCrypto = (globalThis as unknown as {
    crypto?: { subtle?: RuntimeSubtleCrypto };
  }).crypto;
  if (!runtimeCrypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable");
  }
  return runtimeCrypto.subtle;
}

export function getSafeTtsTextPreview(text: string): string {
  return Array.from(text)
    .slice(0, TTS_TEXT_PREVIEW_LIMIT)
    .join("")
    .replace(/[\u0000-\u001f\u007f]/g, "�");
}

export async function getTtsTextIntegrity(text: string): Promise<TtsTextIntegrity> {
  const bytes = getTextEncoder().encode(text);
  const digest = await getSubtleCrypto().digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");

  return {
    utf16Length: text.length,
    utf8ByteLength: bytes.byteLength,
    sha256,
    safePreview: getSafeTtsTextPreview(text),
  };
}

export function formatTtsTextIntegrity(
  boundary: string,
  requestId: string,
  integrity: TtsTextIntegrity,
): string {
  return (
    `[TTS Text Integrity] boundary=${boundary} requestId=${requestId} ` +
    `utf16Length=${integrity.utf16Length} utf8ByteLength=${integrity.utf8ByteLength} ` +
    `sha256=${integrity.sha256} preview=${JSON.stringify(integrity.safePreview)}`
  );
}

export async function traceTtsTextIntegrity(
  boundary: string,
  requestId: string,
  text: string,
): Promise<TtsTextIntegrity> {
  const integrity = await getTtsTextIntegrity(text);
  console.log(formatTtsTextIntegrity(boundary, requestId, integrity));
  return integrity;
}
