import fs from "node:fs";
import { ensureFireflyDataDirectory } from "../migration/firefly-data";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  TaskSession,
  TaskSessionStatus,
  TaskSubagentType,
  TodoItem,
  TodoStatus,
  TaskTraceRecord,
  TaskTranscriptMessage,
  TaskUncertainEffect,
  AgentSessionIdentity,
} from "../../shared/task-session";

const SESSIONS_DIR_NAME = "sessions";
const INDEX_FILE_NAME = "index.json";
const TRACE_LIMIT = 2_000;
const sharedStores = new Map<string, TaskSessionStore>();

export function getTaskSessionStore(userDataRoot: string): TaskSessionStore {
  const key = path.resolve(userDataRoot);
  let store = sharedStores.get(key);
  if (!store) {
    store = new TaskSessionStore(key);
    sharedStores.set(key, store);
  }
  return store;
}

export interface CreateTaskSessionInput {
  parentConversationId: string;
  parentRunId: string;
  description: string;
  prompt: string;
  subagentType: TaskSubagentType;
  mode: "work" | "code";
  resolvedWorkspaceRoot?: string;
}

export interface ResumeTaskSessionInput {
  parentConversationId: string;
  parentRunId: string;
  subagentType: TaskSubagentType;
  prompt: string;
  mode: "work" | "code";
  resolvedWorkspaceRoot?: string;
}

export interface CreateAgentSessionInput extends Omit<CreateTaskSessionInput, "subagentType"> {
  agent: AgentSessionIdentity;
  sessionId: string;
}

export interface ResumeAgentSessionInput extends Omit<ResumeTaskSessionInput, "subagentType"> {
  agent: AgentSessionIdentity;
  mode: "work" | "code";
  resolvedWorkspaceRoot: string;
}

export interface TaskSessionCheckpoint {
  parentRunId?: string;
  childRunId?: string;
  status?: TaskSessionStatus;
  messages?: TaskTranscriptMessage[];
  trace?: TaskTraceRecord[];
  todoItems?: TodoItem[];
  uncertainEffects?: TaskUncertainEffect[];
  resultText?: string;
  error?: { code: string; message: string };
  completedAt?: number;
}

export interface TaskSessionStoreOptions {
  now?: () => number;
  createId?: () => string;
  createChildRunId?: () => string;
}

interface TaskSessionIndexRow {
  id: string;
  parentConversationId: string;
  status: TaskSessionStatus;
  updatedAt: number;
}

function isTaskStatus(value: unknown): value is TaskSessionStatus {
  return value === "running" || value === "completed" || value === "failed"
    || value === "cancelled" || value === "interrupted";
}

function isTaskType(value: unknown): value is TaskSubagentType {
  return value === "general" || value === "document" || value === "search";
}

function isTodoStatus(value: unknown): value is TodoStatus {
  return value === "pending" || value === "in_progress" || value === "completed" || value === "cancelled";
}

function cloneTodoItems(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<TodoItem>;
    if (typeof candidate.id !== "string" || candidate.id.trim().length === 0
      || typeof candidate.content !== "string" || candidate.content.trim().length === 0
      || !isTodoStatus(candidate.status)) return [];
    return [{
      id: candidate.id,
      content: candidate.content,
      status: candidate.status,
      ...(typeof candidate.activeForm === "string" ? { activeForm: candidate.activeForm } : {}),
    }];
  });
}

function cloneUncertainEffects(value: unknown): TaskUncertainEffect[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("TASK_SESSION_READ_FAILED");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("TASK_SESSION_READ_FAILED");
    const effect = entry as Partial<TaskUncertainEffect>;
    if (typeof effect.id !== "string" || typeof effect.toolCallId !== "string"
      || typeof effect.fingerprint !== "string" || typeof effect.toolName !== "string"
      || typeof effect.message !== "string") throw new Error("TASK_SESSION_READ_FAILED");
    if (effect.repeatAuthorization !== undefined
      && (effect.repeatAuthorization?.source !== "user"
        || !Number.isFinite(effect.repeatAuthorization.grantedAt))) {
      throw new Error("TASK_SESSION_READ_FAILED");
    }
    return {
      id: effect.id, toolCallId: effect.toolCallId, fingerprint: effect.fingerprint,
      toolName: effect.toolName, message: effect.message,
      ...(effect.repeatAuthorization ? { repeatAuthorization: { ...effect.repeatAuthorization } } : {}),
    };
  });
}

function isTaskSession(value: unknown): value is TaskSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<TaskSession>;
  const validIdentity = session.schemaVersion === 1
    ? isTaskType(session.subagentType) && session.agent === undefined
    : session.schemaVersion === 2 && isAgentIdentity(session.agent) && session.subagentType === undefined;
  return validIdentity
    && typeof session.id === "string"
    && typeof session.parentConversationId === "string"
    && typeof session.parentRunId === "string"
    && typeof session.childRunId === "string"
    && typeof session.description === "string"
    && (session.mode === "work" || session.mode === "code")
    && isTaskStatus(session.status)
    && Array.isArray(session.messages)
    && Array.isArray(session.trace)
    && typeof session.createdAt === "number"
    && typeof session.updatedAt === "number";
}

function isAgentIdentity(value: unknown): value is AgentSessionIdentity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Partial<AgentSessionIdentity>;
  return typeof identity.id === "string" && identity.id.trim().length > 0
    && typeof identity.modelProfile === "string" && identity.modelProfile.trim().length > 0
    && typeof identity.savedModelProfileId === "string" && identity.savedModelProfileId.trim().length > 0;
}

function cloneSession(session: TaskSession): TaskSession {
  return JSON.parse(JSON.stringify(session)) as TaskSession;
}

/**
 * Task 私有会话存储。它不依赖 Electron，方便测试；生产启动时传入 app.getPath("userData")。
 */
export class TaskSessionStore {
  private readonly taskRoot: string;
  private readonly sessionsDir: string;
  private readonly indexPath: string;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly createChildRunId: () => string;
  private index = new Map<string, TaskSessionIndexRow>();

  constructor(root: string, options: TaskSessionStoreOptions = {}) {
    this.taskRoot = ensureFireflyDataDirectory(root, "tasks");
    this.sessionsDir = path.join(this.taskRoot, SESSIONS_DIR_NAME);
    this.indexPath = path.join(this.taskRoot, INDEX_FILE_NAME);
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
    this.createChildRunId = options.createChildRunId ?? randomUUID;
    this.initialize();
  }

  create(input: CreateTaskSessionInput): TaskSession {
    return this.createPrivateSession(input);
  }

  createAgent(input: CreateAgentSessionInput): TaskSession {
    if (!isAgentIdentity(input.agent)) throw new Error("AGENT_IDENTITY_INVALID");
    if (!/^agent-[a-f0-9]{64}$/.test(input.sessionId)) throw new Error("AGENT_SESSION_ID_INVALID");
    if (this.get(input.sessionId)) throw new Error("AGENT_SESSION_EXISTS");
    return this.createPrivateSession(input);
  }

  private createPrivateSession(input: CreateTaskSessionInput | CreateAgentSessionInput): TaskSession {
    const now = this.now();
    const identity = "agent" in input ? input.agent : undefined;
    const session: TaskSession = {
      schemaVersion: identity ? 2 : 1,
      id: "sessionId" in input ? input.sessionId : this.createId(),
      parentConversationId: input.parentConversationId,
      parentRunId: input.parentRunId,
      childRunId: this.createChildRunId(),
      description: input.description,
      ...(identity ? { agent: { ...identity } } : { subagentType: (input as CreateTaskSessionInput).subagentType }),
      mode: input.mode,
      ...(input.resolvedWorkspaceRoot ? { resolvedWorkspaceRoot: input.resolvedWorkspaceRoot } : {}),
      status: "running",
      messages: [{ role: "user", content: input.prompt }],
      trace: [],
      todoItems: [],
      uncertainEffects: [],
      createdAt: now,
      updatedAt: now,
    };
    this.write(session, Boolean(identity));
    return cloneSession(session);
  }

  get(taskId: string): TaskSession | null {
    const session = this.read(taskId);
    return session ? cloneSession(session) : null;
  }

  listForParent(parentConversationId: string): TaskSession[] {
    return [...this.index.values()]
      .filter((row) => row.parentConversationId === parentConversationId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .flatMap((row) => {
        const session = this.read(row.id);
        return session ? [cloneSession(session)] : [];
      });
  }

  resume(taskId: string, input: ResumeTaskSessionInput): TaskSession {
    const session = this.require(taskId);
    if (session.parentConversationId !== input.parentConversationId) {
      throw new Error("TASK_PARENT_MISMATCH");
    }
    if (session.subagentType !== input.subagentType) {
      throw new Error("TASK_PROFILE_MISMATCH");
    }
    if (session.mode !== input.mode) throw new Error("TASK_MODE_MISMATCH");
    if (session.resolvedWorkspaceRoot !== input.resolvedWorkspaceRoot) throw new Error("TASK_WORKSPACE_MISMATCH");
    return this.resumePrivateSession(session, input);
  }

  resumeAgent(taskId: string, input: ResumeAgentSessionInput): TaskSession {
    const session = this.require(taskId);
    if (session.parentConversationId !== input.parentConversationId) throw new Error("TASK_PARENT_MISMATCH");
    if (session.agent?.id !== input.agent.id) throw new Error("AGENT_IDENTITY_MISMATCH");
    if (session.agent.modelProfile !== input.agent.modelProfile
      || session.agent.savedModelProfileId !== input.agent.savedModelProfileId) throw new Error("AGENT_MODEL_PROFILE_CHANGED");
    if (session.mode !== input.mode) throw new Error("AGENT_MODE_MISMATCH");
    if (session.resolvedWorkspaceRoot !== input.resolvedWorkspaceRoot) throw new Error("AGENT_WORKSPACE_MISMATCH");
    return this.resumePrivateSession(session, input);
  }

  private resumePrivateSession(session: TaskSession, input: Pick<ResumeTaskSessionInput, "parentRunId" | "prompt">): TaskSession {
    if (session.status === "running") {
      throw new Error("TASK_ALREADY_RUNNING");
    }

    session.parentRunId = input.parentRunId;
    session.childRunId = this.createChildRunId();
    session.status = "running";
    session.resultText = undefined;
    session.error = undefined;
    session.completedAt = undefined;
    session.messages.push({ role: "user", content: input.prompt });
    session.updatedAt = this.now();
    this.write(session, Boolean(session.agent));
    return cloneSession(session);
  }

  checkpoint(taskId: string, patch: TaskSessionCheckpoint): TaskSession {
    const session = this.require(taskId);
    if (patch.parentRunId !== undefined) session.parentRunId = patch.parentRunId;
    if (patch.childRunId !== undefined) session.childRunId = patch.childRunId;
    if (patch.status !== undefined) session.status = patch.status;
    if (patch.messages !== undefined) session.messages = cloneSession({ ...session, messages: patch.messages }).messages;
    if (patch.trace !== undefined) session.trace = patch.trace.slice(-TRACE_LIMIT);
    if (patch.todoItems !== undefined) session.todoItems = cloneTodoItems(patch.todoItems);
    if (patch.uncertainEffects !== undefined) session.uncertainEffects = cloneUncertainEffects(patch.uncertainEffects);
    if (patch.resultText !== undefined) session.resultText = patch.resultText;
    if (patch.error !== undefined) session.error = { ...patch.error };
    if (patch.completedAt !== undefined) session.completedAt = patch.completedAt;
    session.updatedAt = this.now();
    this.write(session);
    return cloneSession(session);
  }

  private initialize(): void {
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    this.readIndex();

    let changed = false;
    for (const filename of fs.readdirSync(this.sessionsDir)) {
      if (!/^agent-[a-f0-9]{64}\.json$/.test(filename)) continue;
      const id = filename.slice(0, -5);
      if (this.index.has(id)) continue;
      const session = this.read(id);
      if (!session || session.id !== id || session.schemaVersion !== 2) throw new Error("AGENT_SESSION_IDENTITY_INVALID");
      this.index.set(id, this.indexRow(session));
      changed = true;
    }
    for (const row of this.index.values()) {
      const session = this.read(row.id);
      if (!session) continue;
      if (session.status === "running") {
        session.status = "interrupted";
        session.updatedAt = this.now();
        this.writeSession(session);
        this.index.set(session.id, this.indexRow(session));
        changed = true;
      }
    }
    if (changed) this.writeIndex();
  }

  private require(taskId: string): TaskSession {
    const session = this.read(taskId);
    if (!session) throw new Error("TASK_NOT_FOUND");
    return session;
  }

  private read(taskId: string): TaskSession | null {
    const file = path.join(this.sessionsDir, `${taskId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      if (!isTaskSession(parsed)) throw new Error("TASK_SESSION_READ_FAILED");
      return {
        ...parsed,
        todoItems: cloneTodoItems(parsed.todoItems),
        uncertainEffects: cloneUncertainEffects(parsed.uncertainEffects),
      };
    } catch {
      throw new Error("TASK_SESSION_READ_FAILED: 原文件已保留");
    }
  }

  private write(session: TaskSession, acquire = false): void {
    if (acquire) {
      const previous = this.index.get(session.id);
      this.index.set(session.id, this.indexRow(session));
      try {
        this.writeIndex();
        this.writeSession(session);
      } catch (error) {
        if (previous) this.index.set(session.id, previous);
        else this.index.delete(session.id);
        throw error;
      }
      return;
    }
    this.writeSession(session);
    this.index.set(session.id, this.indexRow(session));
    this.writeIndex();
  }

  private writeSession(session: TaskSession): void {
    this.atomicWrite(path.join(this.sessionsDir, `${session.id}.json`), session);
  }

  private writeIndex(): void {
    this.atomicWrite(this.indexPath, [...this.index.values()]);
  }

  private readIndex(): void {
    if (!fs.existsSync(this.indexPath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, "utf8")) as unknown;
      if (!Array.isArray(parsed)) throw new Error("TASK_INDEX_READ_FAILED");
      for (const row of parsed) {
        if (!row || typeof row !== "object") throw new Error("TASK_INDEX_READ_FAILED");
        const candidate = row as Partial<TaskSessionIndexRow>;
        if (typeof candidate.id !== "string"
          || typeof candidate.parentConversationId !== "string"
          || !isTaskStatus(candidate.status)
          || typeof candidate.updatedAt !== "number") throw new Error("TASK_INDEX_READ_FAILED");
        this.index.set(candidate.id, candidate as TaskSessionIndexRow);
      }
    } catch {
      throw new Error("TASK_INDEX_READ_FAILED: 原文件已保留");
    }
  }

  private indexRow(session: TaskSession): TaskSessionIndexRow {
    return {
      id: session.id,
      parentConversationId: session.parentConversationId,
      status: session.status,
      updatedAt: session.updatedAt,
    };
  }

  private atomicWrite(filePath: string, value: unknown): void {
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  }
}
