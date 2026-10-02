# DeepSeek Flash: pending secure invocation path

Updated 2026-10-02 after parent relayed user instructions: use the user's existing DeepSeek Flash endpoint only; RMB5 total including every attempt/retry. Paid requests made: **0**. No credentials, environment secret values, real chats or userData read. No recharge/subscription/credential setup.

## What is known, and what remains unknown

Tracked preset `src/main/orchestrator/vendors/capabilities.ts:31` is provider ID `deepseek`, display name `DeepSeek（深度求索）`, OpenAI transport, `https://api.deepseek.com`, model `deepseek-flash`, automatic cache. This agrees with the current official [RMB pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/): Flash is DeepSeek-V4.1-Flash. It does **not** verify the user's actual saved base URL/model/transport. A custom gateway could have different prices.

`src/main/settings-store.ts:27` resolves model-settings.json under `app.getPath('userData')`; model-settings.ts stores API keys together with endpoint/model. Neither file contents nor userData were read. Tools discovery found no existing secret-encapsulating DeepSeek invocation tool/proxy. SDK runtime accepts a plaintext key in VendorConfig/client options, so directly invoking it would require prohibited key/config access. No usable safe entry point currently established. Parent must obtain the non-sensitive actual model/baseURL/transport and identify an **existing** authorized invocation boundary that keeps credentials internal; do not ask the user to paste a key, add a new credential, or read/copy their saved settings.

## Official price and conservative bound

Use peak rates regardless of actual time/holiday, with zero expected cache benefit: input cache miss RMB2 / million tokens, input hit RMB0.04 / million, output RMB8 / million. Direct RMB billing avoids an exchange-rate assumption. Rates checked from official pricing on 2026-10-02; recheck before execution and stop if actual endpoint/price cannot be established. Only official direct service at these rates is bounded below; third-party gateway billing remains unknown.

No provider-authoritative whole-request precounter for DeepSeek was established. [Official token usage](https://api-docs.deepseek.com/quick_start/token_usage) treats character conversions as approximations and actual returned usage as authoritative. Plain text tokenizer counts do not prove system/tool schema/role framing totals. Use the full advertised 1M context as the uncertainty bound, conservatively 1,048,576 input tokens rather than expected 1008-byte payload size.

| Boundary | Limit |
|---|---:|
| Paid generation attempts, all executions combined | 2 total, serial |
| SDK/application retries, failover, automatic tool loops | 0 |
| Serialized synthetic request body | <4096 UTF-8 bytes |
| Final wire output field | `max_tokens:256` |
| Thinking | `thinking:{type:"disabled"}` |
| Stream / automatic tool execution | false / disabled |
| Input cost reservation per attempt | 1,048,576 × 2 / 1,000,000 = RMB2.097152 |
| Output reservation per attempt | 256 × 8 / 1,000,000 = RMB0.002048 |
| Worst reservation per attempt | RMB2.099200 |
| Two-attempt subtotal | RMB4.198400 |
| Untouchable reserve to RMB5 | RMB0.801600 |

These are conditional worst-case reservations, **not** estimated input-token guarantees. Before each send, freeze/digest the exact final body, check model/endpoint/price, output cap/non-thinking, byte limit and remaining worst-case reservation. Reject `disableMaxToken`, extension overrides or a rebuilt/different body. Existing SDK client config uses `maxRetries:0`; the ordinary testConnection/chat path omits output bounds and is unsuitable. The offline serializer reproduced that runtime disableMaxToken can strip the cap; the evaluation guard refused that body. Every attempted request consumes its full reservation until trustworthy usage is checked. Timeout, transport ambiguity, unexpected response/price/model, usage missing/inconsistent or output above cap → retain full reservation and **stop**, with no retry. Do not reclaim unknown charges. No calls are made merely to discover billing/credential availability.

## Two-request experiment if the path is established and parent checks pass

Send the same immutable small synthetic request twice, once cold and once as a cache-repeat probe. The saved body `deepseek-synthetic-body.json` contains a system instruction, user quotation with role/source/revision/null event time, a real assistant tool-call/result pair and one small function schema; final question expects quantity42. No actual tool is executed. No web/search/image/files or other billable tools. No database write, model activation or Memory production seam installation.

Record only approved non-sensitive request identity/digest, returned model/finish reason, allowlisted usage (`prompt_tokens`, `completion_tokens`, cache hit/miss), output sample and timing. Do not record request headers/auth/error objects. Cache hit is observational and not guaranteed. Current OpenAI-compatible adapter maps prompt/output totals but **drops DeepSeek's native prompt_cache_hit_tokens / prompt_cache_miss_tokens** in the normalized cachedInput field; the offline synthetic response demonstrated this. A trusted secure boundary must expose raw allowlisted usage for cache validation, or cache behavior remains unproven. Do not add a runtime cache fix in this diagnostic stage.

This experiment compares actual usage for the exact serialized whole request. It does not prove an authoritative pre-send counter, universal model budget correctness, all request variants or H relevance quality. S requires `mode:"exact"` in token-budget.ts; leave unsupported real-provider counting fail closed. Earlier OpenAI/Anthropic doc research is background only: OpenAI official Responses counting claims exact framing but cannot imply DeepSeek endpoint support; Anthropic official count is an estimate. No alternate provider is proposed after the user's service choice.

Blocked online work: actual non-sensitive saved endpoint/model and an existing secret-safe invocation path. Budget has been approved; do not solicit or configure secrets to unblock it.
