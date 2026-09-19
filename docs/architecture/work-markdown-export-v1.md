# Work Markdown Export and History V1

## Scope

Work can retain terminal task records in memory and export a selected record as
Markdown. This is a user-invoked Work action, not a general file-writing
capability and not a model-visible tool. Ordinary Chat, Worker, proactive
execution, Browser, Music, and `file_read` keep their existing boundaries.

The Main-owned history store retains at most 20 records and at most 512 KiB of
UTF-8 serialized record data. Records are ordered newest first for display;
the oldest records are evicted when either limit would be exceeded. A single
record larger than 512 KiB is not retained. The store is process-local and is
cleared when the application process exits; it is not connected to Memory,
RAG, disk persistence, cross-process recovery, or automatic reruns.

## Contract and call chain

1. `WorkTaskCoordinator` projects every terminal Work snapshot into the
   Main-owned `WorkHistoryStore` exactly once. The projection retains task
   identity, user-visible request, file display metadata, steps, status and
   verification, final answer, terminal reason, error, and timestamps.
2. The Renderer loads `window.work.getHistory()` when the Work window opens and
   receives `work:history-changed` updates. Selecting a history record changes
   only the history detail panel; it cannot cancel, replace, or rerun the
   current task.
3. The Work preload exposes `window.work.exportMarkdown(historyId)` without
   accepting a path from Renderer code.
4. Main validates the Work sender, opens Electron's native save dialog with a
   Markdown filter, and treats dialog cancellation as a no-op.
5. Main passes the selected history identity and user-selected target to the
   coordinator. The coordinator reads an immutable store copy and writes
   UTF-8 Markdown. No Provider, AgentCore, tool registry, approval request, or
   file-read call is made during export.

## Exported content and exclusions

The current-task document contains the user request, task phase, timestamps,
selected-file display metadata, human-readable planned operations, step status
and verification, observations, final answer, termination reason, and error
message when present. History documents contain the same display/export data
except observations, which are not retained in the history projection. Both
forms intentionally exclude absolute paths, opaque file and selection
identities, proposal/run/plan identifiers, tool argument JSON, permissions,
file handles, reusable file-selection grants, and local file bodies.

The final answer is copied from the completed `AgentRunResult.finalText` into
the Main-owned Work snapshot before projection. A failed or cancelled terminal
task is also retained as an execution record when it fits the history budget;
an active proposal or run cannot be exported. Export is keyed by the selected
history record, so creating a newer task cannot change an earlier export.

## Failure and acceptance boundary

Save-dialog cancellation leaves the selected history and current Work task
unchanged. A target write error is returned to the Work UI and does not change
task phase or completion evidence. The manual acceptance path is: complete
one Work task, choose its history record, export to a temporary `.md` target,
verify the visible success message and file contents, create or run another
task, and verify the first export still contains the first result. Cancel a
second save dialog and verify no task state change and no new file. Automated
tests cover bounded retention, oldest-record eviction, safe projection,
terminal failure/cancellation recording, and immutable history export. The
remaining platform boundary is that process-local history is intentionally
lost on application restart; cross-process recovery is not implemented.
