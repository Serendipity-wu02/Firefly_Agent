export interface ScopedHistoryCoverage {
 readonly status:"complete"|"insufficient";
 readonly selected:number;
 readonly covered:number;
 readonly diagnostics:readonly string[];
}
interface Options {
 actors:readonly object[];
 assertCurrent():void;
 capture(actor:object):Promise<{status:"captured"|"coverage-insufficient";diagnostics:readonly string[]}>;
 query(coveredActors:object[]):Promise<object>;
}
/** Partial availability never relaxes actor/source validation or invokes a legacy fallback. */
export async function queryScopedHistory(options:Options):Promise<{tokens:object[];coverage:ScopedHistoryCoverage;notice?:string}> {
 options.assertCurrent();
 const actors=[...options.actors],covered:object[]=[],diagnostics=new Set<string>();
 if(actors.length>31)diagnostics.add("MEMORY_HISTORY_SELECTION_BUDGET_EXHAUSTED");
 for(const actor of actors.slice(0,31)){
  options.assertCurrent();
  try{
   const result=await options.capture(actor);options.assertCurrent();
   if(result.status==="captured")covered.push(actor);
   else if(result.status==="coverage-insufficient"){
    diagnostics.add("MEMORY_HISTORY_COVERAGE_INSUFFICIENT");
    for(const code of result.diagnostics)if(/^MEMORY_[A-Z0-9_]{1,100}$/.test(code))diagnostics.add(code);
   }else throw Error("MEMORY_HISTORY_CAPTURE_INVALID");
  }catch(error){
   options.assertCurrent();
   if(!(error instanceof Error)||!["MEMORY_HISTORY_NATIVE_UNAVAILABLE","MEMORY_HISTORY_COVERAGE_INSUFFICIENT"].includes(error.message))throw error;
   diagnostics.add(error.message);
  }
 }
 options.assertCurrent();
 const tokens=covered.length?[await options.query(covered)]:[];options.assertCurrent();
 const coverage:ScopedHistoryCoverage=Object.freeze({status:covered.length===actors.length?"complete":"insufficient",selected:actors.length,covered:covered.length,diagnostics:Object.freeze([...diagnostics])});
 const notice=coverage.status==="insufficient"?"历史检索覆盖不足，仅检索了已授权且来源可验证的会话；不能据此断言历史不存在。未修复或改写原会话，也未回退旧检索。覆盖状态："+JSON.stringify(coverage):undefined;
 return {tokens,coverage,...(notice?{notice}:{})};
}
