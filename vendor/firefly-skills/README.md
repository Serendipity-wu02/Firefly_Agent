# Firefly vendor Skills

`skills/` in this directory is the canonical source of the 39 currently distributed vendor Skills. The repository-root `skills/` contains only the eight Firefly-maintained built-ins. The vendor source is packaging input, not an additional runtime scan root.

`skills-snapshot.zip` remains a tracked generated distribution artifact. Runtime resolves that ZIP, installs it into the user Skills area, performs the existing protected managed migration, and scans the existing builtin/user sources. Never update only the ZIP: edit canonical sources first and regenerate the snapshot.

Initial materialization preserves every distributed byte, including LF, CRLF and mixed line endings. The subtree's `-text` Git attribute prevents checkout normalization; it does not change repository-wide EOL policy.

## Sources and licenses

- [`../../scripts/packaging/upstream-skills/sources.json`](../../scripts/packaging/upstream-skills/sources.json) is the upstream acquisition catalogue.
- [`license-provenance.json`](license-provenance.json) is the licensing/provenance authority; preserve historical scope and limitations.
- [`LICENSE-NOTICES.md`](LICENSE-NOTICES.md) and each Skill's LICENSE/NOTICE retain applicable author, license and modification notices.
- Current classification: 19 VERIFIED_UPSTREAM, 16 FIREFLY_ADAPTED_UPSTREAM, two CYRENE_DERIVED_REWRITE (`office-design`, `write-expense-report`), and two pending replacement reviews (`pdf`, `xlsx`). Materialization does not upgrade, replace, rewrite or relicense any of them.

## Historical adaptation versus current generation

`scripts/packaging/skill-adaptations/`, `skill-replacements.json`, `skill-repairs.json`, and `adapt-skills-snapshot.mjs` retain upstream/source reconstruction, historical adaptation verification and migration-recognition evidence. They are not a hidden override of current canonical source. Recognized source/result/prior hashes remain necessary for compatibility tests and protected migration.

Current distribution changes must preserve mode declarations, tools, effectKind, hidden flags, user overrides and managed-update protections. Content/layout maintenance is not proof of real-model, external Office, GUI, installer, cross-platform or public redistribution clearance.
