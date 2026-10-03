# Runtime profile and storage ownership

Main first evaluates `identity-preflight`: resolve arguments/environment, normalize and validate existing root aliases, apply all Electron paths, install StorageContext, then import/init services. No logger/settings/MCP/plugin/Skills/Memory imports occur in preflight. A failed preflight throws before those imports. Isolation does not require NODE_OPTIONS.

## Entry parameters

Electron accepts `--firefly-profile=production|development|test|smoke` and `--firefly-isolation-root=<absolute existing directory>`. Environment equivalents are FIREFLY_RUNTIME_PROFILE and FIREFLY_ISOLATION_ROOT. Existing FIREFLY_ISOLATED_SMOKE_APPDATA selects smoke and supplies its root. Explicit arguments take precedence. Bare/duplicate arguments, unknown profile, relative/missing roots, production overlap or canonical path escapes fail closed. Production rejects isolation parameters; packaged production remains default. Unpackaged instances default to development, which requires explicit isolation. `npm run dev` and `firefly run` pass development identity; configure FIREFLY_ISOLATION_ROOT before invoking them. No tooling creates a root behind the user's back.

Production userData remains `<appData>/Firefly`, sessionData remains userData, file logs remain userData/logs. Isolated profiles use appData=isolationRoot, userData=isolationRoot/Firefly-<kind>, sessionData=userData/session, logs=userData/logs and name Firefly-<kind>. Realpath/junction resolution and path.relative containment handle Windows case/aliases and ..; no string-prefix containment. Apply checks ownership again before mkdir and verifies Electron retained every path before storage installation.

## StorageContext

config/data/state roots retain userData (logical ownership, no data migration). cache=userData/cache, logs=profile.logs, session=profile.sessionData. MCP=mcp-servers.json; token state=token-usage.json; retained manifest=content-manifest.json; main log=logs/firefly.log. File getters check isolated ownership. Memory only establishes future contracts: userData/memory/data, memory/index, memory/temp; canonical equality and pairwise ancestor/descendant aliases are rejected. Existing Memory data files remain untouched and current Memory implementations are not relocated.

`storage-direct-access.json` inventories all literal appData/userData/sessionData/logs path reads/writes and unresolved dynamic getPath calls outside tests. BOOTSTRAP_ALLOWED owns Electron assignment/verification; MIGRATE_LATER records the existing remaining consumers. MIGRATE_NOW completed MCP/token direct userData lookups and explicit logger/manifest ownership (the latter used injected/derived roots rather than direct getPath). `npm run check:storage-boundary` rejects new files, increased call budgets and unapproved dynamic queries; build runs it before emitting artifacts. This is a regression gate for source call sites, not an adversarial JavaScript proof.

## Safe JSON writes

AtomicJsonStore validates both the incoming and serialized JSON shape before writing and validates an existing document before replacing it. ENOENT reads use an in-memory default without writeback. Invalid JSON/shape remains unchanged and is not automatically restored. A same-directory unique exclusive temporary file is written with flush/fsync, then rename replaces the primary without deleting it first. Exactly one `.bak` retains the previous valid bytes. Backup failures prevent primary replacement; primary replacement failures preserve the old document and clean owned temporary files. Directory durability across power loss and multi-process writes are not promised. Windows ACLs inherit from the profile directory; mode 0600 applies where supported.

Manifest remains native installer preservation functionality: installer.nsh stages prompts/skills, core-bootstrap invokes migration before Skills startup, readManifest compares shipped hashes, writeManifest refreshes the owner's file, tests cover customized/native content. No shutdown consumer exists. Non-production profiles do not consume/remove installer staging. Existing real manifest files are never deleted by this task.

## MCP secret design audit (no migration)

MCP currently persists command/args/env strings, potentially containing secrets. Future secretRef should identify profile + server + field, with protected bytes stored separately and resolved only in memory. Prefer Electron safeStorage after app ready, backed by Windows DPAPI/macOS Keychain/Linux supported secret stores; reject unprotected/basic_text/unavailable encryption rather than using obfuscation. DPAPI does not isolate from other applications running as the same Windows user. Protect secret records/backups with the user's ACL, validate ownership/reference scope, redact diagnostics, and never copy production references into test/smoke. Current MCP values remain unchanged; no real secret migration, re-encryption or restoration was performed.

Official references: https://www.electronjs.org/docs/latest/api/app#appsetpathname-path ; https://nodejs.org/docs/latest-v24.x/api/fs.html#fswritefilesyncfile-data-options ; https://www.electronjs.org/docs/latest/api/safe-storage . Installed runtime observed: Electron 43.1.0, Node 24.19.0.
