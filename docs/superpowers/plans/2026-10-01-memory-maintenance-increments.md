# Approved follow-up memory increments after isolated B2

User authorized the parent's researched design on 2026-10-01 09:39 UTC (“衰减那个之前讨论过的，后续按你的来”). This is an incremental plan, not code delivered in B2. Baseline product definitions and immutable repository remain authoritative. All steps stay isolated until a separately reviewed production cutover; no real-data migration or publishing authorization is inferred.

## B3 — support and source validity

First implement support sets and evidence validity. Each support edge records its exact source/version/generation/span, actor, acceptance kind, rule version and event identity. A confirmation must itself have a trusted durable source/version; the B2 synthetic nonce is an isolated test seam, not production confirmation ingress. Main events cannot be LLM self-reported confirmations. Separate assertion time, recording time and support validity. Manual correction and explicit forget outrank automatic work; generation checks stay mandatory.

Selected behavior: loss of the sole automatic support makes a fact unavailable for automatic recall while awaiting verification; an independent still-valid explicit user confirmation can keep it effective. Explicit denial or loss of the last effective support sends it to review. Immutable assertion history remains. The raw fact repository's B2 current() remains unchanged until this support-aware consumer is explicitly installed; no silent fallback policy. Production ingestion requires owned WebContents/frame/session verification plus durable provider revisions/generations and scoped actor provisioning.

Boundary tests: unique support edited/pending/deleted; two independent supports where one fails; confirmation source itself edited/deleted; imported summary not independent support; duplicate source revisions not two supports; explicit denial versus uncertain contradiction; corrected revision loses old support; forget versus delayed support/job; remember uses a fresh event and generation. Test support state and assertion history independently.

## B4 — selective extraction, deduplication and clear change

Extend the extractor adapter separately from Main policy. Stable cross-session facts may enter M; temporary plans stay S. Main resolves the current subject and normalized attribute. Same normalized fact merges support without overwriting provenance; a clear authenticated current-subject change appends a sourced/timed revision and replaces only the current projection. Ambiguous subject, inference, sensitivity or unclear contradiction remains candidate. No general last-arrival-wins rule.

Boundary tests: equivalent Chinese/English preference adds independent support; model-proposed subjectKey ignored; explicit change versus hypothetical/quoted/third-party change; simultaneous clear changes expectedRevision conflict; out-of-order source events cannot overwrite a newer event; unknown time remains unknown; manual correction/forget priority over queued automatic updates; merge retains all prior sources and revisions. Run a separately labelled real-model Chinese evaluation if a model adapter is introduced; deterministic fixtures are not that evaluation.

## B5 — S context budget, sourced compression

Keep recent raw messages and earlier sourced summaries in S under an explicitly supplied session/token budget. Compress or move out of the prompt window without promoting the summary to M. H remains historical conversation retrieval, not an expired S/M archive. Require exact source/support freshness and suppression for automated injection; manual raw conversation reads remain available after fact forget.

Boundary tests: current-session isolation; injected token budget limits; long Chinese/emoji text; summary source edited/deleted; summary generated before forget rejected; stale summaries cannot recreate M; scoped H retrieval; manual raw-read path does not create automatic recall permission.

## B6 — recall weighting and recoverable archive

Implement the already-approved decay semantics without reopening them: decay changes recall strength, never truth or hard deletion. Protect important stable facts. Separate last actual recall hit from last decay calculation; repeated calculations must not refresh access time. Low-value unused facts may move to a recoverable M archive, never renamed H. Recover/remember cannot bypass explicit forget markers or release old generations. No automatic hard deletion.

Boundary tests: repeated decay calculation leaves lastAccessed unchanged; an actual scoped recall hit updates it; protected stable fact remains available; validity expiration versus recall weight separate; recover archive preserves sources/revisions; archived forgotten fact cannot restore; forget before/after archive races; old queued job cannot resurrect on archive restore; source-support policy still applies to archived/recovered facts.

## Release boundary

Each increment gets TDD, independent differential/quality review and exact-HEAD relevant/full/type/build evidence. Integration staging follows support validity before automatic change and automated consumers. Production writer/ingress/consumer switch uses a concrete reviewed preview and backup/rollback pair, not this plan. Printer availability checks for native Excel export are an independent Office follow-up: this machine has no printer; work computer printer availability and native visual/physical printing remain unverified. Ordinary generated PDFs stay printer-independent. Do not install drivers, change print/security settings, or send a physical print job.
