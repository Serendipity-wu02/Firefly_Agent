# Firefly vendor Skills

`skills/` in this directory is the canonical source of the 39 currently distributed vendor Skills. The repository-root `skills/` contains exactly five Firefly-maintained capabilities: `assessment`, `diagram`, `knowledge-workspace`, `plugin-development`, and `tutoring`. The vendor source is packaging input, not an additional runtime scan root.

`skills-snapshot.zip` remains a tracked generated distribution artifact. Runtime resolves that ZIP, installs it into the user Skills area, performs the existing protected managed migration, and scans the existing builtin/user sources. Never update only the ZIP: edit canonical sources first and regenerate the snapshot.

Initial materialization preserves every distributed byte, including LF, CRLF and mixed line endings. The subtree's `-text` Git attribute prevents checkout normalization; it does not change repository-wide EOL policy.

## Sources and licenses

- [`../../scripts/packaging/upstream-skills/sources.json`](../../scripts/packaging/upstream-skills/sources.json) is the upstream acquisition catalogue.
- [`license-provenance.json`](license-provenance.json) is the licensing/provenance authority; preserve historical scope and limitations.
- [`LICENSE-NOTICES.md`](LICENSE-NOTICES.md) and each Skill's LICENSE/NOTICE retain applicable author, license and modification notices.
- Current classification: 19 verified upstream, 16 Firefly-adapted upstream, two Firefly-maintained workflows with inherited lineage (`office-design`, `write-expense-report`), and two retained Windows workflows (`pdf`, `xlsx`) whose newer upstream versions have not been shown to preserve all current behavior. The Office and expense workflows have separate NOTICE files; their historical authorship and MIT source remain recorded.

The current formal ZIP contains 39 Skill IDs and 257 files (SHA-256 `8a120122f239939536801eea283d6334d50935da5e87343c009277a29660f388`). Against the immediate pre-vNext ZIP, only seven frontmatter blocks change: five Office capabilities explicitly declare Work/Code, and `self-improving-agent` and `skill-creator` remove Learn. The other 32 directories and every attachment remain byte-identical. `license-provenance.json.currentDistribution` records these seven hashes. `scripts/packaging/vnext-predecessor.json` preserves the exact previous manifest text/hash, archive hash, prior distribution evidence and changed frontmatter for deterministic historical verification. This does not establish public redistribution clearance for unrelated assets or replace live Office/model verification.

The retired voice, hygiene and planning bodies now belong to `prompts/persona-support/` and `prompts/workflow-support/`. They are not auto-injected Skills. General tone remains owned by the existing `prompts/tone-rules.md` chain; scene samples are maintenance references and are not automatically loaded. Work hygiene uses the Work prompt layer; plan-mode guidance and its references load only in the existing plan state. Exact-ID settings and managed-install migration are integrated; see the [migration contract](../../src/main/migration/legacy-skill-migration.md). Persistent Agent production integration remains separate and incomplete, as documented in the [runtime architecture](../../docs/architecture/firefly-runtime.md).

## Historical adaptation versus current generation

`scripts/packaging/skill-adaptations/`, `skill-replacements.json`, `skill-repairs.json`, and `adapt-skills-snapshot.mjs` retain upstream/source reconstruction, historical adaptation verification and migration-recognition evidence. They are not a hidden override of current canonical source. Recognized source/result/prior hashes remain necessary for compatibility tests and protected migration.

Current distribution changes must preserve mode declarations, tools, effectKind, hidden flags, user overrides and managed-update protections. Content/layout maintenance is not proof of real-model, external Office, GUI, installer, cross-platform or public redistribution clearance.

## Generation

Run `npm run prepare:skills` explicitly. The generator validates the canonical 39 IDs against the tracked manifest and the five root built-ins, rejects unsafe filesystem entries, packs sorted paths with the existing fixed-date JSZip format, and safely extracts and compares every output byte before publishing. It does not apply historical overlays. With unchanged content, ZIP and manifest (including generatedAt) are unchanged. Historical adaptation/provenance fields retain their original meaning.

`build`, `dev`, `start`, and `package:win:dir` intentionally do not run preparation automatically while the generated ZIP remains tracked. The packaging fileset excludes `skills/**` here and ships the ZIP, manifest and legal/provenance materials at the existing resources path.
