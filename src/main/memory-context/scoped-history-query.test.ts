import { expect, it, vi } from "vitest";
import { queryScopedHistory } from "./scoped-history-query";
it("returns actual covered evidence with an explicit missing-snapshot notice",async()=>{
 const a={},b={},evidence={},query=vi.fn(async()=>evidence);
 const result=await queryScopedHistory({actors:[a,b],assertCurrent:()=>{},capture:async actor=>actor===a?{status:"captured",diagnostics:[]}:{status:"coverage-insufficient",diagnostics:["MEMORY_HISTORY_SNAPSHOT_MISSING"]},query});
 expect(query).toHaveBeenCalledWith([a]);expect(result.tokens).toEqual([evidence]);expect(result.coverage).toMatchObject({status:"insufficient",selected:2,covered:1});expect(result.notice).toContain("MEMORY_HISTORY_SNAPSHOT_MISSING");expect(result.notice).toContain("不能据此断言历史不存在");
});
it("a missing native helper leaves a clear coverage gap rather than an empty-history claim",async()=>{
 const query=vi.fn();const result=await queryScopedHistory({actors:[{}],assertCurrent:()=>{},capture:async()=>{throw Error("MEMORY_HISTORY_NATIVE_UNAVAILABLE")},query});
 expect(query).not.toHaveBeenCalled();expect(result.tokens).toEqual([]);expect(result.notice).toContain("MEMORY_HISTORY_NATIVE_UNAVAILABLE");expect(result.coverage.status).toBe("insufficient");
});
it.each(["MEMORY_ACTOR_DENIED","MEMORY_HISTORY_STALE","private raw failure"])("never hides an authorization or integrity failure as partial coverage: %s",async code=>{
 await expect(queryScopedHistory({actors:[{}],assertCurrent:()=>{},capture:async()=>{throw Error(code)},query:vi.fn()})).rejects.toThrow(code);
});
it("bounds actual reads while reporting the entire authorized selection",async()=>{
 const actors=Array.from({length:40},()=>({})),capture=vi.fn(async()=>({status:"captured" as const,diagnostics:[]}));
 const result=await queryScopedHistory({actors,assertCurrent:()=>{},capture,query:async()=>({})});expect(capture).toHaveBeenCalledTimes(31);expect(result.coverage).toMatchObject({selected:40,covered:31,status:"insufficient"});expect(result.notice).toContain("MEMORY_HISTORY_SELECTION_BUDGET_EXHAUSTED");
});
it("rechecks live authority and does not query after cancellation",async()=>{
 let live=true;const query=vi.fn();await expect(queryScopedHistory({actors:[{}],assertCurrent:()=>{if(!live)throw Error("MEMORY_RUN_CANCELLED")},capture:async()=>{live=false;return {status:"captured",diagnostics:[]}},query})).rejects.toThrow("MEMORY_RUN_CANCELLED");expect(query).not.toHaveBeenCalled();
});
