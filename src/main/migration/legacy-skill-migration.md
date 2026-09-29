# Legacy Skill migration contract

## Runtime boundary

`skill-id-aliases.ts` is removed. Scanner, registry/cache, slash activation, commands,
Skill tools, run allowlists, enabled setters and resource lookup use exact IDs.
Customized directories retaining historical names remain independent user Skills;
they do not override a differently named replacement or inherit its permission.
Learn/Call changes in shared files are retained.

## Integrated entry points

- `skills/index.ts`: validate the shipped archive before installation or managed
  updates; retain the existing safe ZIP installer and historical snapshot upgrade;
  apply the exact vNext predecessor upgrade; archive recognized old builtin copies
  before scanning. Rescan also retires recognized old copies.
- `settings/settings-facade.ts`: migrate persisted `skillModeOverrides` in
  `loadGeneralSettings0`, before existing field normalization. Ordinary normalization
  no longer translates Skill IDs. Read failures retain the existing write blocker.
- `skills/index.ts`: migrate `skills-enabled.json` at its persistence boundary.

## Exports

From `legacy-skill-migration.ts`:

- `getProtectedSkillIds(userSkillsDirectory)` reads identity/provenance only.
- `migrateLegacySkillDirectories(userSkillsDirectory)` returns `archivedIds`,
  `protectedIds`, `archiveDirectory`. Exact known complete trees move to the sibling
  `skill-id-migration-history` directory, outside scanning. Modified/unknown trees
  and custom replacement IDs stay in place. Archive conflicts and links fail closed.
- `migrateLegacySkillSettings(input, protectedIds)` returns `settings` and
  `historicalSettings`. Precedence is Cyrene, Firefly, new capability; explicit newer
  values, including false, win. Old plan/voice/hygiene values go only to history.
  Protected old IDs keep their own settings; old values cannot target a protected
  custom replacement ID.
- `migrateLegacySkillSettingsFile(file, { field?, protectedIds? })` persists history
  before removing old keys. Omit `field` for boolean enabled state; use
  `field: "skillModeOverrides"` for general settings. History is stored in
  `<file>.skill-id-history.json` as arrays of original values per historical ID.
  Original settings retain the existing `<file>.pre-firefly.bak` backup convention.

From `vnext-skill-snapshot.ts`:

- `assertVnextSkillSnapshotSource(archive)` rejects unknown shipped archive bytes
  before installer or older upgrade code runs.
- `migrateVnextSkillSnapshot(userRoot, archive)` upgrades only the seven exact
  predecessor bundles whose mode metadata changed. It validates all recognized
  bundle members and skips the entire bundle on extra files or directories.
  Only exact known member paths plus `.pre-firefly.bak`, and the exact
  `SKILL.md.pre-vnext.bak` path, are exempt regular backup files; arbitrary
  backup suffixes are not accepted. Existing backups remain protected. It creates
  `SKILL.md.pre-vnext.bak` before replacing an unchanged body. It reuses safe ZIP
  extraction and `replaceUnmodifiedSkill`; it does not reinstall the 39 directories.

## Fixed evidence and future integration

`legacy-skill-trees.json` records exact tree hashes from repository objects at
`f1f6579`, `dedc7ea`, `6c18981` and `9d59527dff34677d873aaf5bc912ed057bf5cccd`.
Production migration does not invoke Git or read another checkout.

`vnext-skill-versions.json` recognizes the seven predecessor bundles from the real
archive `6d3ec335cbd5f39282e3f8f0878140d5275f6f96afc75b172b365824fce92ee7`.
The accepted current archive is
`bdc2d00cbf2a6e4d41c931990e5ec5b47b3a13a67742d43f8189bb96cea3b673`.
The test reconstructs the former with `scripts/packaging/vnext-predecessor-fixture.mjs`,
asserts its exact SHA-256 without Git history, and compares every distributed member with the latter,
including previously repaired Office, expense and host workflows.

The exact foundation archive `8a120122f239939536801eea283d6334d50935da5e87343c009277a29660f388`
is also recognized by per-bundle hashes. Six bodies and one tools reference update
to specialist delegation; originals are preserved with `.pre-specialists.bak`.
The earlier seven frontmatter updates retain `.pre-vnext.bak` and the exact 6d3e
recognition. Both predecessors are reconstructed and compared against every current
ZIP member in tests without Git history. Unknown archives remain rejected; their
own claimed manifest hashes do not establish trust.

No real userData or services were used in verification; fixtures use OS temporary
directories and immutable repository blobs.
