# Permission Profile V1

`PermissionProfile` is a user configuration scheme, not a Capability, Sandbox, Approval, or execution owner. The four schemes in this document supersede the earlier product-planning five-level vocabulary and the earlier implementation names.

## Canonical state

The typed values are `READ_ONLY`, `RESTRICTED_SCOPE`, `ASK_EVERY_TIME`, and `FULL_ACCESS`. `RESTRICTED_SCOPE` is the safe default. `SettingsManager` owns the persisted `permissionProfile` setting. Renderer state mirrors the `SETTINGS_CHANGED` snapshot and is never the canonical store. The Settings window and the compact Chat quick switcher both use the same four controls and the existing typed `SETTINGS_SAVE` path. There is no fifth project-read-only scheme.

The Chat quick switcher is only a convenience presenter. It sends `{ permissionProfile }` through the existing settings bridge, waits for the canonical save result, and reloads the effective settings snapshot when saving fails. It does not create a custom IPC channel, a renderer-local persistence store, or a second permission engine.

Persisted `RESTRICTED` maps to `ASK_EVERY_TIME`, `STANDARD` maps to
`RESTRICTED_SCOPE`, persisted `ASK_EVERY_TIME` keeps its meaning, and
`ELEVATED` maps to `FULL_ACCESS`. Invalid or missing values use
`RESTRICTED_SCOPE`; no invalid value falls back to `FULL_ACCESS`.

## Policy mapping

`PermissionProfilePolicyResolver` is pure and answers only profile-derived policy questions. The authorization pipeline passes the optional profile to the existing ApprovalRequirementResolver after Capability Registry and Sandbox checks. ApprovalService remains lifecycle-only.

- `READ_ONLY`: only a capability explicitly marked `sideEffect: "read_only"` can continue after Capability and Sandbox checks. Writes and other side effects are denied before Approval; Approval cannot release this denial.
- `RESTRICTED_SCOPE`: the existing explicit workspace/allowlist Sandbox scope remains authoritative. An in-scope capability follows its declared approval requirement; an out-of-scope request is denied before Approval.
- `ASK_EVERY_TIME`: Capability and Sandbox are still required. A capability with a side effect requires a per-request Approval; a read-only capability keeps its declared requirement. Approval cannot widen a denied Sandbox scope or bypass a hard reject.
- `FULL_ACCESS`: uses the maximum currently configured legal scope and keeps the declared approval requirement where one exists, while avoiding unnecessary prompts. It never bypasses Capability Registry, binding validation, Sandbox evaluation, AuthorizedInvocation, hard denies, or ToolExecutionEngine policy.

Unknown capabilities are denied before the profile resolver for every profile. A profile cannot override a denied Sandbox decision. The resolver contains no BrowserWindow, SettingsManager, ApprovalService, ToolExecutionEngine, or registry mutation.

When a scheme changes while an Approval request is pending, the request is
re-evaluated at resume. A switch to a prohibiting scheme cancels and denies
the request; a switch to a less prompting scheme does not auto-approve it.
Approved, denied, cancelled, and expired requests cannot be resumed twice.

## Deferred UI issue

The known Pet UI issue remains unchanged: Pet speech/dialog text is visually embedded in the small Pet panel. Speech-bubble layout is outside this round and was not modified.
