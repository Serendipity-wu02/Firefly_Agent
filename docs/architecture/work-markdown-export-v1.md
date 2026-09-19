# Work Markdown Export V1

## Scope

Work can export the current terminal task record as Markdown. This is a
user-invoked Work action, not a general file-writing capability and not a
model-visible tool. Ordinary Chat, Worker, proactive execution, Browser,
Music, and `file_read` keep their existing boundaries.

## Contract and call chain

1. The Renderer shows `导出 Markdown` only for a terminal Work snapshot.
2. The Work preload exposes `window.work.exportMarkdown()` without accepting a
   path from Renderer code.
3. Main validates the Work sender, opens Electron's native save dialog with a
   Markdown filter, and treats dialog cancellation as a no-op.
4. Main passes the user-selected target to the current
   `WorkTaskCoordinator`, which refuses active, missing, or disposed tasks.
5. The coordinator renders the current snapshot and writes UTF-8 Markdown.
   No Provider, AgentCore, tool registry, approval request, or file-read call
   is made during export.

## Exported content and exclusions

The document contains the user request, task phase, timestamps, selected-file
display metadata, human-readable planned operations, step status and
verification, observations, final answer, termination reason, and error
message when present. It intentionally excludes absolute paths, opaque file
and selection identities, tool argument JSON, and local file bodies.

The final answer is copied from the completed `AgentRunResult.finalText` into
the Main-owned Work snapshot before export. A failed or cancelled terminal
task may also be exported as an execution record; an active proposal or run
cannot be exported.

## Failure and acceptance boundary

Save-dialog cancellation leaves the Work task unchanged. A target write error
is returned to the Work UI and does not change task phase or completion
evidence. The manual acceptance path is: complete a Work task, choose a
temporary `.md` target in the native save dialog, verify the visible success
message and file contents, then cancel a second dialog and verify no task
state change. Automated tests cover rendering, exclusion of private
identities/paths, terminal-only gating, and the Main write path.
