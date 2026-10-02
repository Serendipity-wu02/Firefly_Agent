# Bounded H lexical and explicit temporal repair

Authorized continuation of dca39ae; no production wiring, new model, M promotion or real-data migration. S/M/H meanings and protected original worktrees stay unchanged.

## Causes observed before independent challenge scoring

BM25 cannot prove paraphrase equivalence. Camel-case/fullwidth identifier spelling can obscure lexical matches. Ordinary relevance cannot implement latest intent without original times. Unordered token-set dedup drops word-order conflicts; ordered tokens alone still drop sign punctuation differences (RED numeric-sign regression). Earlier 32 cases are diagnostic/regression, not untouched evaluation.

## Minimal contract

- Main query gains explicit temporal `{kind:'latest'}` or `{kind:'range',from,to}` (inclusive epoch milliseconds, safe nonnegative integers). Text, quoted history, import/capture time, names and H output cannot mint temporal intent. No NLP trigger added.
- Range uses overlap of the complete original message span and keeps complete tool pairs. Any null original message time makes that turn unproved, excluded by range. Returned temporal status reports partial/unavailable coverage.
- Latest reorders only known-time candidates matching the same exact set of query terms; unknown positions and other relevance classes retain original order. It operates within the existing 50-candidate limit and means newest event, not verified truth.
- Temporal mode is lexical only in this stage. Temporal plus vector fails explicitly; existing non-temporal vector RRF/MMR is unchanged and synthetic vectors are not semantic evidence.
- Search-only fullwidth ASCII/space folding is nonexpanding. Keep whole identifiers and add casing-derived pieces without synonym tables or entity-specific tuning. Original quote text stays unchanged.
- Dedup requires exact joined original text plus original span. Punctuation/order/time differences are retained. Near-equivalent wording can still be redundant.
- Ranking/tokenizer identities advance to v2. Old evidence is stale and must be re-queried. Storage schema/index payload stays unchanged; rollback to dca39ae re-queries v1 without database migration.

## Isolation and validation

Actor/session/scope filtering, source/current-head/forget checks, excerpt/index limits, quoted evidence, local dispatch claim and M actual-use behavior remain authoritative. All fixtures/logs/builds use E:, synthetic data only. Existing 32 are preserved and compared as regression. Independent single-author 36 retrieval plus 6 safety challenge is frozen before candidate scoring; labels never enter retriever inputs. Candidate is frozen before implementer opens case contents; no sample-driven tuning afterwards. Full tests, types/build, native development/ASAR lifecycle, exact-final-HEAD independent review follow. No CI/dependency/default-writer changes, push, PR or merge.

## Limits and next decision

BM25-only genuine paraphrases, newest outside candidate budget, partial/unknown event times and near-semantic redundancy remain explicit limitations. Higher-layer intent mapping and real embedding quality need separately approved implementation/evaluation. DeepSeek official direct Flash is authorized within RMB5, but a safe existing secret-owning invocation seam is still required; no key extraction, display, copy, configuration or real-chat reads.
