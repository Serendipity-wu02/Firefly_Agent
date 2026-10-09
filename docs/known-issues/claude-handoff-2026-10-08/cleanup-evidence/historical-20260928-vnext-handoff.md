# vNext Skills integration handoff

Scope: checkpoint 3 content and packaging only. No commit, upstream upgrade, new loader, runtime API change or real userData operation. Baseline: `9d59527dff34677d873aaf5bc912ed057bf5cccd`.

## Exact support paths and parent ownership

- Plan: `prompts/workflow-support/plan-mode.md`. Replace the old `getBody("firefly-plan-mode")` at the same conditional injection point in `src/main/orchestrator/build-options.ts`; preserve the existing plan-mode gate, write_plan and approval/runtime boundaries.
- Hygiene: `prompts/workflow-support/work-hygiene.md`. Compose into Work's existing mode prompt; it does not grant file cleanup or overwrite permission.
- Plan references, relative to `prompts/workflow-support/`: `references/coverage-check.md`, `references/execution-handoff.md`, `references/plan-templates.md`. Make these available through the existing prompt-loading mechanism when required; they are no longer Skill references.
- Persona material: `prompts/persona-support/original-voice.md`; nine scene files remain in `prompts/persona-support/references/`. The headings `## 流萤的表达` and `## 场景参考` remain. Do not permanently inject all scene samples.
- General tone still loads `prompts/tone-rules.md` through the current tone injector. Do not redirect that loader to this persona material. The parent owns the default Learn wording cleanup.
- Both support directories contain the original repository MIT license, including both copyright notices. Packaging's existing extraFiles entries include the nested files.
- `prompts/knowledge_workflow.md` still referenced `firefly-diagram` at line 79 when inspected; parent must use `diagram`. No existing prompt outside the two new support directories was edited here.

## Five capability owners

| Old ID | New owner | Scope and preserved implementation |
| --- | --- | --- |
| firefly-diagram | diagram | Work/Code; static SVG versus Mermaid, layout budget, theme tokens, sanitized output discipline |
| firefly-exam-paper | assessment | Work; blueprint, separate paper/answers/review, scoring, all five subject references |
| firefly-learn-tutor | tutoring | Work; eight-step teaching/learning flow, feedback, review and progress continuation |
| firefly-obsidian-workspace | knowledge-workspace | Work; relative Vault paths, section semantics, contentHash/expectedContentHash, materials protection |
| firefly-plugin-dev | plugin-development | Work/Code; actual Firefly SDK, all three references, not a foreign host plugin skill |
| firefly-original-voice | persona-support/original-voice.md | Persona material, not a Skill |
| firefly-plan-mode | workflow-support/plan-mode.md | Shared planning protocol with existing runtime enforcement |
| firefly-work-hygiene | workflow-support/work-hygiene.md | Shared Work hygiene protocol |

All five are explicit, on-demand capabilities with no autoInject manifest. No old factory, contracts.ts or invented replacement loader is delivered. The three knowledge capabilities retain the six existing obsidian tools in frontmatter and the enabled/Vault/tool-availability conditions in their bodies. These instructions are not enforcement: parent must preserve actual capability availability and permission checks.

## Vendor pool and source evidence

All 39 IDs, source revisions, licenses, references and helpers are retained. Only seven frontmatter blocks change: `docx`, `pdf`, `xlsx`, `pptx-generator`, `office-design` explicitly declare Work/Code; `self-improving-agent` and `skill-creator` drop Learn. No other body or attachment changed. Historical suggested modes in `upstream-skills/sources.json` are review input, not active declarations. Current SKILL frontmatter is authoritative.

`vnext-predecessor.json` preserves the exact old manifest text, old manifest/archive hashes, prior distribution evidence, original changed frontmatter and old builtin file hashes. `vnext-predecessor-fixture.mjs` reconstructs the exact old ZIP and verifies its fixed SHA-256 before historical adaptation/governance tests. Historical governance, repairs, replacements and source hashes are not rewritten.

- Previous manifest SHA-256: `62e6c60c8deedca78f465dceabdbdfd426653a6d463a04295440a460e6ff46bc`.
- Previous ZIP SHA-256: `6d3ec335cbd5f39282e3f8f0878140d5275f6f96afc75b172b365824fce92ee7`.
- Current ZIP SHA-256: `8a120122f239939536801eea283d6334d50935da5e87343c009277a29660f388`, 835500 bytes, 39 IDs / 257 members.
- Current manifest SHA-256: `34d5eee1fe1638babe00fdcad8b8d1aceb09c95b78237d45568ca6d74322616d`.

Parent owns installer sentinel recognition, managed-body predecessor recognition, aliases, settings/mode overrides, slash commands, protected user edits and backups. In particular the seven changed vendor body hashes above need recognition of their exact prior versions; current sourceSha256/fireflyAdaptation fields deliberately remain historical. Do not treat a user-modified old tree as disposable.

## Delegation wiring deferred to parent

These retained files still describe the legacy task tool. Do not mechanically rename parameters or treat them as delegate_agent declarations; checkpoint 5 must wire the actual runtime contract and regenerate the ZIP/provenance together:

- `vendor/firefly-skills/skills/as-doubt-driven-development/SKILL.md`: 16, 118.
- `vendor/firefly-skills/skills/as-using-agent-skills/SKILL.md`: 89.
- `vendor/firefly-skills/skills/sp-dispatching-parallel-agents/SKILL.md`: 13.
- `vendor/firefly-skills/skills/sp-requesting-code-review/SKILL.md`: 14.
- `vendor/firefly-skills/skills/sp-subagent-driven-development/SKILL.md`: 18.
- `vendor/firefly-skills/skills/skill-creator/SKILL.md`: 17.
- `vendor/firefly-skills/skills/sp-using-superpowers/references/firefly-tools.md`: 7.

## Verification and parent test updates

The new `src/main/skills/final-skills-pool.test.ts` first failed on the eight old IDs/missing content, then passed against the five replacements. It now exercises existing invoke_skill/read_skill_reference, scanner/catalog, mode/dependency metadata, licenses, attachments, support content and canonical/ZIP equality.

Targeted packaging tests retain security, rollback and deterministic no-op checks. Historical tests validate the reconstructed exact predecessor instead of relabeling old hashes as current.

Final directed result: five new Vitest cases passed; 29 Node cases passed across build-skills-snapshot, adapt-skills-snapshot, skill-replacement, electron-builder-config and xlsx-workspace. Two successive prepare:skills runs reported unchanged with identical ZIP and manifest hashes. The scoped git diff whitespace check passed. Node emitted the existing MODULE_TYPELESS_PACKAGE_JSON warning; no package-wide module setting was changed.

An additional four-file integration check returned 24 passes and two old-contract failures:
- `src/main/skills/canonical-source.test.ts:48` still expects eight builtin IDs.
- `src/main/skills/skill-scanner.test.ts:11` still selects `firefly-diagram`.

These existing tests are parent-owned and were not edited here. `firefly-skills.test.ts` and `host-semantic-closure.test.ts` passed in that same run. Re-run after parent integration; concurrent changes can alter those results. No full application build, real-model, live Vault, installer or runtime GUI validation is claimed.

