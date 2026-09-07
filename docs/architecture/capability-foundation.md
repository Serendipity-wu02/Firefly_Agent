# Firefly Capability Foundation V1.1.1

This document describes the current capability foundation. It is metadata and
contract infrastructure; resource-boundary evaluation and human approval are
documented in `sandbox-foundation.md` and `approval-foundation.md`. Capability
authorization and SubAgent stages remain future boundaries.

## Current ownership

- `src/shared/capability-types.ts` owns the serializable capability identity,
  descriptor, requester, request, result, error, context, and tool-binding
  contracts.
- `src/main/runtime/capabilities/capability-registry.ts` owns declarative
  descriptor registration and lookup.
- `src/main/runtime/capabilities/capability-errors.ts` owns deterministic
  registry error codes.
- `src/main/tools/tool-registry.ts` remains the one concrete tool registry.
- `src/main/runtime/execution/tool-execution-engine.ts` remains the sole tool
  execution owner.

## Boundaries

Capability answers **what kind of authority or ability exists**.

Tool answers **how a concrete callable operation is exposed to the Agent**.

ToolExecutionEngine answers **how a tool call is executed**, including the
existing policy, timeout, retry, concurrency, and result handling.

The `CapabilityBinding` contract connects a `toolId` to a `capabilityId` as
metadata. Existing tools are not required to declare bindings in this phase,
so the current tool execution path is unchanged.

Registry presence means only **known capability**. It does not mean allowed,
approved, or safe to execute. No authorization decision is made by the
registry.

## Deliberately unimplemented stages

- Capability authorization policy is not implemented.
- OS/container sandbox isolation is not implemented. Sandbox Foundation V1
  provides only a pure resource-boundary evaluation contract.
- Approval UI or permission prompts are not implemented here; Approval
  Foundation owns the pending request lifecycle separately.
- SubAgent model execution is not implemented; SubAgent Foundation V1 provides
  only typed profile/task/lifecycle contracts.
- Browser, Files, PowerShell, Desktop Automation, Weather, and Sandbox
  capabilities are not implemented.
- No `CapabilityExecutor`, `CapabilityToolExecutor`, or second tool executor
  exists.

The intended future flow is:

```text
Agent / SubAgent
        ↓
Capability Request
        ↓
Capability resolution
        ↓
Sandbox evaluation
        ↓
Future Approval
        ↓
Tool binding
        ↓
ToolExecutionEngine
        ↓
Concrete Tool
```

Capability resolution is declarative registry lookup. Sandbox evaluation is the
current pure resource-boundary component described in
`sandbox-foundation.md`; Approval Foundation owns consent state but does not
execute tools or grant capability registration. SubAgent Foundation owns only
delegated-worker metadata and task lifecycle, not model or tool execution.
