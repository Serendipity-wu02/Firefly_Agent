# Firefly Sandbox Foundation V1.1.1

This document defines the first resource-boundary contract for future
capabilities. It does not claim OS isolation, container isolation, a VM,
Windows Job Objects, process virtualization, or desktop automation.

## Ownership boundaries

- Capability answers **what authority or ability exists**.
- Sandbox answers **where and within what resource boundary it may operate**.
- Approval answers **whether the user has consented**; its lifecycle is owned
  separately by `approval-foundation.md`.
- `ToolExecutionEngine` answers **how a concrete tool operation executes** and
  remains the sole tool execution owner.
- SubAgent Foundation supplies a requester/task shape, not a model or tool
  runtime in this boundary.

Sandbox `allowed` means only that the requested resource matches a registered
profile rule. It does not mean approved, authorized, or executed.

The future boundary is therefore:

```text
Capability request
        ↓
Capability resolution
        ↓
Sandbox resource evaluation
        ↓
Approval request/decision
        ↓
Tool binding
        ↓
ToolExecutionEngine
        ↓
Concrete tool
```

## Contracts

`src/shared/sandbox-types.ts` owns the serializable contracts:

- stable `SandboxProfileId` values;
- discriminated filesystem, network, process, and desktop resource scopes;
- profile rules and versions;
- the small `CapabilitySandboxRequirement` relationship containing only
  `capabilityId` and `profileId`;
- evaluation input/context separate from `CapabilityRequest`;
- discriminated allow/deny decisions with stable denial codes.

The shared contracts contain no `BrowserWindow`, Electron object, session, tool
executor, or I/O dependency.

## Deterministic evaluator

`src/main/runtime/sandbox/sandbox-policy.ts` contains the pure
`SandboxPolicyEvaluator`. It performs no execution, file access, network
request, Electron operation, LLM call, or `ToolExecutionEngine` call.

An unknown profile denies with `POLICY_NOT_FOUND`. A known profile with no
matching resource rule denies with `RESOURCE_NOT_ALLOWED`; malformed scopes
deny with `INVALID_SCOPE`; a non-matching resource denies with
`OUTSIDE_SCOPE`. Unknown or unmodeled resource kinds default to denial.

No production profile is wired into `src/main/index.ts`, so existing tools
remain on the current `ToolPolicy` and `ToolExecutionEngine` path until a
future integration supplies an explicit profile.

## Resource rules

Filesystem scopes require absolute paths. Allowed roots are resolved with
platform-aware path semantics, including Windows drive/UNC paths and
case-insensitive Windows comparisons. Traversal outside the root and prefix
collisions such as `C:\\workspace-evil` are rejected. The evaluator never
opens or modifies a file.

Network scopes accept hostname metadata only. Matching normalizes host case and
trailing dots, then requires exact host equality and, when configured, an exact
port match. Suffix or lookalike hosts such as `example.com.evil.test` are not
accepted. The evaluator never opens a socket or sends a request.

Process and desktop scopes are metadata-only rules in V1. No process execution,
command-line parsing, desktop automation, or OS isolation is provided.

## Deliberate omissions

This foundation does not add approval dialogs, SubAgent model execution,
Browser,
Files, PowerShell, or Desktop Automation implementations, a second tool
registry, or any second execution engine. Approval Foundation provides only
the consent lifecycle and remains a separate boundary. The evaluator can be
integrated with Capability and the existing ToolExecutionEngine in a later,
explicit composition step.
