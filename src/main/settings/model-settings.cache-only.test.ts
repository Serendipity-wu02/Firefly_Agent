import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({read:vi.fn(),stat:vi.fn(),exists:vi.fn(),write:vi.fn(),dir:vi.fn()}));
vi.mock("node:fs",()=>({default:{readFileSync:mocks.read,statSync:mocks.stat,existsSync:mocks.exists,writeFileSync:mocks.write,mkdirSync:mocks.dir}}));
vi.mock("../settings-store",()=>({getSettingsPath:()=>"E:/synthetic/cache-models.json"}));
vi.mock("../logger",()=>({logger:{info:vi.fn(),warn:vi.fn()},LogTag:{Runtime:"runtime"}}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
describe("Main cache-only saved-profile lookup",()=>{
 it("does not cold-read settings, stat the file, or fall back to a default profile",async()=>{
  const m=await import("./model-settings");
  expect(m.getCachedSavedModelProfile("missing")).toBeUndefined();expect(m.listCachedSavedModelProfileIds()).toEqual([]);
  expect(mocks.read).not.toHaveBeenCalled();expect(mocks.stat).not.toHaveBeenCalled();expect(mocks.exists).not.toHaveBeenCalled();
 });
 it("uses only a loaded synthetic cache, strict ID and a detached narrow profile snapshot",async()=>{
  const m=await import("./model-settings");
  mocks.stat.mockReturnValue({size:100});mocks.exists.mockReturnValue(true);
  mocks.read.mockReturnValue(JSON.stringify({schemaVersion:2,provider:"DeepSeek（深度求索）",modelProfiles:[{id:"saved-id",provider:"DeepSeek（深度求索）",model:"deepseek-flash",baseUrl:"https://api.deepseek.com",apiKey:"FAKE-KEY"}],defaultModelProfileId:"saved-id"}));
  m.loadModelSettings();vi.clearAllMocks();
  expect(m.listCachedSavedModelProfileIds()).toEqual(["saved-id"]);expect(m.getCachedSavedModelProfile("other")).toBeUndefined();
  const profile=m.getCachedSavedModelProfile("saved-id")!;expect(profile.apiKey).toBe("FAKE-KEY");profile.apiKey="changed";
  expect(m.getCachedSavedModelProfile("saved-id")!.apiKey).toBe("FAKE-KEY");
  expect(mocks.read).not.toHaveBeenCalled();expect(mocks.stat).not.toHaveBeenCalled();
 });
});
