# Firefly vendor Skills

`skills/` in this directory is the canonical source of the 39 currently distributed vendor Skills. The repository-root `skills/` contains only the eight Firefly-maintained built-ins. The vendor source is packaging input, not an additional runtime scan root.

`skills-snapshot.zip` remains a tracked generated distribution artifact. Runtime resolves that ZIP, installs it into the user Skills area, performs the existing protected managed migration, and scans the existing builtin/user sources. Never update only the ZIP: edit canonical sources first and regenerate the snapshot.

Initial materialization preserves every distributed byte, including LF, CRLF and mixed line endings. The subtree's `-text` Git attribute prevents checkout normalization; it does not change repository-wide EOL policy.

## Sources and licenses

- [`../../scripts/packaging/upstream-skills/sources.json`](../../scripts/packaging/upstream-skills/sources.json) is the upstream acquisition catalogue.
- [`license-provenance.json`](license-provenance.json) is the licensing/provenance authority; preserve historical scope and limitations.
- [`LICENSE-NOTICES.md`](LICENSE-NOTICES.md) and each Skill's LICENSE/NOTICE retain applicable author, license and modification notices.
- Current classification: 19 verified upstream, 16 Firefly-adapted upstream, two Firefly-maintained workflows with inherited lineage (`office-design`, `write-expense-report`), and two retained Windows workflows (`pdf`, `xlsx`) whose newer upstream versions have not been shown to preserve all current behavior. The Office and expense workflows have separate NOTICE files; their historical authorship and MIT source remain recorded.

The current formal ZIP contains 39 Skill IDs and 257 files (SHA-256 `6d3ec335cbd5f39282e3f8f0878140d5275f6f96afc75b172b365824fce92ee7`). Against the previous formal ZIP, Office and expense workflows plus three host-instruction bodies changed; the other 34 directories are byte-identical. `license-provenance.json.currentDistribution` records the 15 changed members and their current hashes. This does not establish public redistribution clearance for unrelated assets or replace live Office/model verification.

## Historical adaptation versus current generation

`scripts/packaging/skill-adaptations/`, `skill-replacements.json`, `skill-repairs.json`, and `adapt-skills-snapshot.mjs` retain upstream/source reconstruction, historical adaptation verification and migration-recognition evidence. They are not a hidden override of current canonical source. Recognized source/result/prior hashes remain necessary for compatibility tests and protected migration.

Current distribution changes must preserve mode declarations, tools, effectKind, hidden flags, user overrides and managed-update protections. Content/layout maintenance is not proof of real-model, external Office, GUI, installer, cross-platform or public redistribution clearance.

## Generation

Run `npm run prepare:skills` explicitly. The generator validates the canonical 39 IDs against the tracked manifest and the eight root built-ins, rejects unsafe filesystem entries, packs sorted paths with the existing fixed-date JSZip format, and safely extracts and compares every output byte before publishing. It does not apply historical overlays. With unchanged content, ZIP and manifest (including generatedAt) are unchanged. Historical adaptation/provenance fields retain their original meaning.

`build`, `dev`, `start`, and `package:win:dir` intentionally do not run preparation automatically while the generated ZIP remains tracked. The packaging fileset excludes `skills/**` here and ships the ZIP, manifest and legal/provenance materials at the existing resources path.
