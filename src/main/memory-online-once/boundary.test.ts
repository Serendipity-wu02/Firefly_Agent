import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { PROVIDER_CAPABILITIES } from "../orchestrator/vendors/capabilities";
import { setVendorRuntimeSettingsGetter } from "../orchestrator/vendors/runtime-settings";
import { buildFixedRequest, eligibleProfile, sanitizeUsage, BODY_SHA256 } from "./boundary";
const cap = PROVIDER_CAPABILITIES.find(c => c.id === "deepseek")!;
export const profile = { id: "synthetic-id", provider: cap.displayName, model: "deepseek-flash", baseUrl: "https://api.deepseek.com", apiKey: "FAKE-SECRET-NEVER-EXPORT", explicitTransport: "openai" as const };
afterEach(() => setVendorRuntimeSettingsGetter(() => ({})));
describe("fixed Main-only probe boundary", () => {
  it("matches the frozen 1008-byte synthetic body, endpoint and cap", () => {
    const req = buildFixedRequest(profile);
    expect(req.url).toBe("https://api.deepseek.com/chat/completions");
    expect(Buffer.byteLength(req.body)).toBe(1008);
    expect(createHash("sha256").update(req.body).digest("hex")).toBe(BODY_SHA256);
    expect(BODY_SHA256).toBe("1315510055a951f46d7e721bc056f7443e236bb545ab6550a0331203c82c79ed");
    expect(req.body).not.toContain(profile.apiKey);
    expect(JSON.parse(req.body)).toMatchObject({ model: "deepseek-flash", max_tokens: 256, stream: false, thinking: { type: "disabled" } });
  });
  it("refuses unknown provider/model/transport/key and nonofficial URL spellings", () => {
    for (const change of [{provider:"deepseek"},{model:"deepseek-v4-pro"},{explicitTransport:"anthropic"},{apiKey:""}, ...["https://api.deepseek.com/v1","https://api.deepseek.com:443","https://api.deepseek.com?x=1","https://api.deepseek.com#x","https://key@api.deepseek.com","https://api.deepseek.com.evil.test","http://api.deepseek.com"].map(baseUrl=>({baseUrl}))]) {
      expect(eligibleProfile({...profile,...change} as typeof profile)).toBe(false);
      expect(()=>buildFixedRequest({...profile,...change} as typeof profile)).toThrow("PROFILE_REFUSED");
    }
    expect(eligibleProfile({...profile,baseUrl:profile.baseUrl+"/"})).toBe(true);
    expect(eligibleProfile({...profile,explicitTransport:undefined})).toBe(true);
  });
  it("refuses an adapter output whose global runtime setting removed max_tokens", () => {
    setVendorRuntimeSettingsGetter(() => ({disableMaxToken:true}));
    expect(()=>buildFixedRequest(profile)).toThrow("BODY_REFUSED");
  });
  it("exports only whitelisted numeric usage including native cache counters", () => {
    expect(sanitizeUsage({model:"deepseek-flash",choices:[{message:{content:profile.apiKey}}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120,prompt_cache_hit_tokens:64,prompt_cache_miss_tokens:36,secret:profile.apiKey}})).toEqual({promptTokens:100,completionTokens:20,totalTokens:120,cacheHitTokens:64,cacheMissTokens:36,upperMicroCny:360});
  });
  it.each([
    {prompt_tokens:-1,completion_tokens:1,total_tokens:0},
    {prompt_tokens:1.5,completion_tokens:1,total_tokens:2.5},
    {prompt_tokens:1,completion_tokens:257,total_tokens:258},
    {prompt_tokens:1048577,completion_tokens:1,total_tokens:1048578},
    {prompt_tokens:1,completion_tokens:1,total_tokens:3},
    {prompt_tokens:1,completion_tokens:1,total_tokens:2,prompt_cache_hit_tokens:2,prompt_cache_miss_tokens:0},
    {prompt_tokens:1,completion_tokens:1,total_tokens:2,prompt_cache_hit_tokens:1},
    {prompt_tokens:"1",completion_tokens:1,total_tokens:2},
  ])("rejects unreliable usage without exception text", usage => {
    expect(sanitizeUsage({model:"deepseek-flash",usage})).toBeNull();
  });
  it("refuses missing usage, provider error and unexpected response model", () => {
    const usage={prompt_tokens:1,completion_tokens:1,total_tokens:2};
    for(const raw of [null,{}, {model:"deepseek-v4-pro",usage},{model:"deepseek-flash",usage,error:{message:profile.apiKey}}])expect(sanitizeUsage(raw)).toBeNull();
  });
});
