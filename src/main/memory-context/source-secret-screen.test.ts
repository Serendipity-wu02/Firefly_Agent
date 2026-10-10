import { expect, it } from "vitest";
import { assertContextSecretFree } from "./source-secret-screen";
it.each([
 "Explain the api_key field and password validation", "The refresh_token property is optional",
 "请解释密码字段如何校验，不要保存密钥", "x".repeat(120000),
 {name:"api_key",type:"string",description:"API key field"},
 {password:"",access_token:null},
])("allows code/schema field discussion without a credential value %#",value=>expect(()=>assertContextSecretFree(value)).not.toThrow());
it.each([
 "api_key=SECRET_CANARY_1234567890", "refresh_token=REVIEW_SECRET_CANARY",
 "My passphrase is SYNTHETIC_ONLY_SECRET", "密码：SYNTHETIC_ONLY_SECRET",
 "Authorization: Bearer SYNTHETIC_ONLY_TOKEN", "sk-abcdefghijklmnopqrstuvwxyz123456",
 {rawAssistant:{nested:{api_key:"SYNTHETIC_ONLY_SECRET"}}},
 {toolCalls:[{arguments:'{"refresh_token":"SYNTHETIC_ONLY_SECRET"}'}]},
 "-----BEGIN PRIVATE KEY-----\nSYNTHETIC_ONLY_SECRET",
])("rejects credential values anywhere with a reason-only error %#",value=>{
 expect(()=>assertContextSecretFree(value)).toThrow(/^MEMORY_CONTEXT_TRANSCRIPT_SECRET$/);
});
it.each(["type Login = { api_key: string; password: string }","interface Login { access_token: string; password: string }","The token is a unit of text."])("allows explicit schema type declarations and ordinary token discussion: %s",value=>expect(()=>assertContextSecretFree(value)).not.toThrow());
