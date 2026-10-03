/** Session opening keeps stale requests distinct from unavailable sessions. */
export type ReactSessionMode = "chat" | "work" | "code";
export type SessionSelectionResult = "selected" | "stale" | "unavailable";
export type OpenSessionResult =
  | { status: "opened"; mode: ReactSessionMode }
  | { status: "stale" | "unavailable" };

export function normalizeSessionMode(mode: string | undefined): ReactSessionMode | null {
  switch (mode) {
    case "chat":
    case "work":
    case "code":
      return mode;
    case "learn":
    case "daily":
      return "work";
    default:
      return null;
  }
}

export interface OpenSessionArgs {
  sessionId: string;
  isCurrent: () => boolean;
  getSession: (sessionId: string) => Promise<{ mode?: string } | null>;
  selectSession: (sessionId: string, mode: ReactSessionMode) => Promise<SessionSelectionResult>;
}

export async function openSessionByIdWithDeps(args: OpenSessionArgs): Promise<OpenSessionResult> {
  if (!args.isCurrent()) return { status: "stale" };
  try {
    const session = await args.getSession(args.sessionId);
    if (!args.isCurrent()) return { status: "stale" };
    const mode = session && normalizeSessionMode(session.mode);
    if (!mode) return { status: "unavailable" };
    const selected = await args.selectSession(args.sessionId, mode);
    if (!args.isCurrent() || selected === "stale") return { status: "stale" };
    return selected === "selected" ? { status: "opened", mode } : { status: "unavailable" };
  } catch (error) {
    if (!args.isCurrent()) return { status: "stale" };
    throw error;
  }
}

export interface BootstrapReactSessionArgs {
  urlSessionId: string | null;
  currentMode: ReactSessionMode;
  openSession: (sessionId: string) => Promise<OpenSessionResult>;
  refreshSessions: (mode: ReactSessionMode, selectCurrent: boolean) => Promise<void>;
}

export async function bootstrapReactSession(args: BootstrapReactSessionArgs): Promise<void> {
  if (args.urlSessionId) {
    let opened: OpenSessionResult = { status: "unavailable" };
    try {
      opened = await args.openSession(args.urlSessionId);
    } catch {
      // Opening a specific session is best-effort; the real list/select path is authoritative.
    }
    if (opened.status === "stale") return;
    await args.refreshSessions(args.currentMode, opened.status !== "opened");
    return;
  }
  await args.refreshSessions(args.currentMode, true);
}
