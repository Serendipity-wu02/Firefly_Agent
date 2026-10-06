import { contextFail } from "./context-contracts";

// Context may discuss credential field names. M's conservative fact extractor is not
// a context filter: reject credential-shaped values, not the words in code docs.
const label = String.raw`(?:password|passwd|passphrase|credential|api[ _-]?key|(?:access|refresh|session|id|auth)[ _-]?token|token|(?:client[ _-]?)?secret|private[ _-]?key|密码|口令|私钥|密钥|令牌)`;
const sensitiveKey = new RegExp(`^${label}$`, "i");
const assignment = new RegExp(`(?:^|[^A-Za-z0-9_])${label}["']?\\s*(?::|=|：)\\s*["']?[^\\s"',;{}\\[\\]]+`, "i");
const personalDisclosure = new RegExp(`(?:\\bmy\\s+${label}\\s+is\\s+|(?:我的)?(?:密码|口令|私钥|密钥|令牌)是)[^\\s"',;{}]+`, "i");
const typeField = new RegExp(`(${label}\\s*:\\s*)(?:string|number|boolean|unknown|never|any)(?=\\s*[;,}])`, "gi");
const credential = /\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{16,}|\bBearer\s+[A-Za-z0-9_.~+/=-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
/** Reason-only, Main context screening. It is deliberately not a complete DLP guarantee. */
export function assertContextSecretFree(value: unknown): void {
 const active = new Set<object>();
 let nodes = 0;
 function visit(item: unknown, depth: number): void {
  if (++nodes > 200000 || depth > 100) contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  if (typeof item === "string") {
   const text = item.normalize("NFKC");
   // Only syntactically recognizable TS declarations can omit primitive type names.
   const screened=/\b(?:type|interface)\s+[A-Za-z_$][\w$]*(?:\s*=)?\s*\{/.test(text)?text.replace(typeField,"$1"):text;
   if (credential.test(text) || personalDisclosure.test(text) || assignment.test(screened)) contextFail("MEMORY_CONTEXT_TRANSCRIPT_SECRET");
   return;
  }
  if (item === null || typeof item !== "object") return;
  if (active.has(item)) contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  active.add(item);
  for (const [key, child] of Object.entries(item)) {
   if (sensitiveKey.test(key.normalize("NFKC")) && typeof child === "string" && child.trim()) contextFail("MEMORY_CONTEXT_TRANSCRIPT_SECRET");
   visit(child, depth + 1);
  }
  active.delete(item);
 }
 visit(value, 0);
}
