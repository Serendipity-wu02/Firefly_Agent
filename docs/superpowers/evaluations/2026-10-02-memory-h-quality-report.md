# H quality evaluation — 2026-10-02

Accepted product baseline remains `0f90f6ef27f5cd771bbd7378cda75a2bf563c898`. Product source, installed writer and Skills are unchanged. This stage adds isolated synthetic diagnostic scripts only. Offline results reveal quality gaps that the earlier structural/security gates did not measure; **production acceptance is not established**. Paid requests and cost: **0 / RMB0**. User fixed service to existing DeepSeek Flash and budget RMB5; online is blocked by the absence of an existing safe invocation boundary.

## Frozen dataset and interpretation

8 development /32 holdout cases, eight categories, single-author manual relevance labels (3 answer,1 supporting context,0 wrong/irrelevant). Different queries/documents/entities across splits; exact text disjointness checked. No ranking/dictionary/parameter tuning or model downloads. Text-hash document IDs do not encode grades; qrels never enter retrieval. Authored equivalence groups count independent evidence once; duplicate variants consume rank with no additional nDCG gain. Recall includes supporting context and **is not answer accuracy**. Some grade1 judgments are weak: h09 dinner time supports event context, but does not answer the dietary-choice question; independent adjudication is needed. Macro averages across small case-local corpora; no real-chat sampling or independent human adjudication, so no representative production quality claim.

Frozen development SHA256 `244f8a47f541b452bd42ef3b6d041ccbfb75caadd56d673aee4a5bb0b699318e`; holdout SHA256 `6f522bae17619c29934bed874a16e72dc0ee4eb277a9fa8e597cf52cac86d74b`. Manifest was created before first scoring; original raw-text results remain intact.

## Results

| Path, same frozen holdout | Recall@3 | nDCG@3 | Full answer at rank1 | Conflicting history in top3 |
|---|---:|---:|---:|---:|
| Pure `rankHistory(id,text)` diagnostic |84.4%|0.774|19/32|25/32|
| Actual H repository parser/index/ranker/excerpt |84.4%|0.780|20/32|25/32|

Repository Recall@8=85.9%, nDCG@8=0.788. Overall duplicateRate@3=4.17%; within the four redundancy cases it is33.3%. Exact token-set dedup catches literal repeats but cannot eliminate all near-equivalent evidence.

| Repository category,4 cases each | Recall@3 | nDCG@3 | Full answer rank1 |
|---|---:|---:|---:|
| Chinese entity |100%|0.991|4/4|
| Mixed Chinese/identifier |100%|0.983|4/4|
| Semantic paraphrase |25%|0.250|1/4|
| Evolving current facts |87.5%|0.619|0/4|
| Historical/relative time |87.5%|0.702|1/4|
| Tool result |87.5%|0.975|4/4|
| Similar wrong history |100%|0.915|3/4|
| Redundant evidence |87.5%|0.807|3/4|

Conflict exposure is an adversarial diagnostic, not necessarily a product bug: H retains historical records and quotations. Current-fact questions often retrieve the earlier decision ahead of a correction; H retrieval must not be treated as M's authoritative current fact. Low paraphrase recall is consistent with the default lexical-only route; no semantic embedding quality has been tested. Temporal texts are retrieved without a trusted time-intent resolver. More top-k results alone do not establish correct disambiguation.

The independent reviewer identified an Important fidelity/claim risk in the raw-text pass: literal tool-role prefixes and content IDs differed from actual `messages.map(m=>m.text).join('\n')` and keyed partition index IDs (`history-repository.ts:130`). The additional repository pass corrects that projection using structured paired messages, the actual parser/index/ranker/excerpt and public synthetic key17, with unchanged labels/parameters. This is **a post-observation fidelity correction**, not another pristine holdout. Its tie order changed two case hit lists; results are reported separately. In-process synthetic-import commands do not prove the worker-process or canonical Main ingress path; those authorization/lifecycle checks are separately probed.

Actual parser also rejected one grade0 h10 distractor containing the word 密码 as `MEMORY_HISTORY_SECRET` (`history-repository.ts:35`). Fixture/qrels/denominator remain unchanged; rejection is explicit in repository-results.json. No sensitive-word filter was weakened.

## Safety, framing and verification

8 fresh Main/SQLite safety probe groups passed: copied/temporary caps denied; default-session exclusion and explicit real allowlist; foreign-scope zero plaintext provider reads and unchanged original permit; forget excludes H and blocks old local send; no M access-use refresh; injection remains quoted user evidence with original role/null time and cloned evidence denied; complete tool output/pair/timezone retained and edited unsourced tool denies old permit; source deletion/recreation cannot revive old H. These are lifecycle and structural assertions, not model injection-resistance or provider token-count proof. Synthetic JSON-length counting is used only for lifecycle scaffolding. Existing related H/S/M tests: **247 passed /0 failed,12 files**. Main typecheck and isolated harness strict typecheck passed; all four diagnostic TS entrypoints bundled and executed successfully. Product full/build/native packaging was not repeated because no product/dependency/configuration code changed; accepted baseline's earlier validation remains historical evidence.

The provider-only offline probe uses actual DeepSeek preset, pure adapter body serialization and an invalid synthetic token string, with no fetch/real credential/config access. It preserved system/user quote/function schema/assistant call/tool result and serialized max_tokens256, thinking disabled, non-stream in1008 bytes. It rejected a cap-stripped body caused by disableMaxToken (`openai-adapter.ts:75`). A synthetic DeepSeek usage response preserved total input/output but demonstrated native cache hit/miss fields are omitted from normalized cachedInput (`openai-adapter.ts:153`). This is an observed adapter gap, queued for a separate scoped fix; no runtime behavior changed here.

Early harness-only failures were corrected and logs retained: capability lookup expects displayName, own TypeScript include omitted the existing node:sqlite declaration, two fixture factId values needed narrowing, and actual repository admission rejected the sensitive-word distractor. None was bypassed by changing runtime, thresholds or qrels. Final green type log is types-harness-final.log.

## Online decision and next isolated work

Current [official DeepSeek RMB pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) is peak cache-miss input2 /million and output8 /million; preset model `deepseek-flash`, official URL `https://api.deepseek.com`. User's actual saved model/baseURL/transport are **unverified**. Model settings live under real userData (`settings-store.ts:27`); no existing credential-encapsulating invocation tool/proxy was found. Do not read/copy/configure keys to unblock this. See ONLINE-PLAN.md: max2 serial attempts, no retries/tool loop,256 output cap/non-thinking, reserve full1,048,576 input tokens per attempt at peak rates, worst2.0992 each /4.1984 total, leaving0.8016 untouched. Timeout/usage missing/unknown billing keeps the full reservation and stops. This bound is conditional on the actual direct official service/rates; a custom gateway's unknown prices disallow execution. Budget is approved; safe invocation capability is the blocker.

Recommended next isolated increments for parent review:

1. Fix DeepSeek native cache usage mapping with synthetic response tests, preserving total input/output and distinguishing miss/hit; verify both non-stream and stream paths. This is separate from Memory integration and cannot prove actual cache behavior without secure real calls.
2. Expand relevance benchmark with independently authored/fresh entities and adjudicated qrels, longer distractor corpora, negation/correction histories and metadata time cases. Keep this evaluated holdout as regression evidence, not future untouched quality proof. Preserve current security gates and explicit false-match/conflict diagnostics.
3. Assess a sanctioned real semantic embedding route in owned synthetic profiles; do not present injected toy vectors as quality. Keep actor/session/scope filtering before model input/statistics, explicit dimensions/identity/cancellation and failure behavior, separate lexical fallback reports.
4. Design trusted query-intent/time handling and conflict-aware historical citations: known original time/zone and source revision, latest vs requested historical window, unknown stays unknown. **M remains current valid facts; H remains history.** Do not silently discard older H or promote retrieval to a new M fact. Parent must resolve current-vs-history presentation and time-intent UX before behavior changes.
5. Add equivalence-aware diversity only after a fresh benchmark demonstrates benefit; preserve conflicting revisions/time-separated decisions rather than deduplicating them as near matches. Re-run authorization/source/forget/dispatch gates for every ranking/index change.
6. Real provider budget support requires trustworthy whole-request framing counts for the actual DeepSeek endpoint. Its [official usage guide](https://api-docs.deepseek.com/quick_start/token_usage) treats character conversions as approximate; post-call usage is authoritative after execution, not an exact precounter. Keep S `mode:"exact"` gate fail closed (`token-budget.ts:35`). Two small online calls can measure whole-body usage/cache observations, not prove all request variants or install a production counter.

No activation, real migration, default writer switch, Skills replacement, commit integration, push/PR/merge or physical power-loss validation in this stage. Protected original main/core trees were checked using explicit git -C: clean at5096f754… and8b7c06bf… respectively.
