// MCP lifecycle and persistent configuration; paths belong to StorageContext.
import { AtomicJsonStore } from "../atomic-json-store";
import { getStorageContext } from "../storage-context";
import { connectMcpServer, disconnectMcpServer, getMcpServerStates, McpServerConfig } from "./mcp-adapter";
import { logger, LogTag } from "../logger";

const LOG_PREFIX = "[MCP Manager]";

// The adapter serializes per server; this queue owns the shared config document.
// Hold it through connection/disconnection and commit so removals cannot be undone
// by an older add snapshot. A rejected operation must not poison later callers.
let managerOperation: Promise<void> = Promise.resolve();
function queueManagerOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = managerOperation.then(operation);
  managerOperation = result.then(() => {}, () => {});
  return result;
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function validConfigs(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((item: unknown) => {
    if (!record(item) || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name || (item.transport !== "stdio" && item.transport !== "sse")) return false;
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    if (["command", "cwd", "url"].some((key) => item[key] !== undefined && typeof item[key] !== "string")) return false;
    if (item.args !== undefined && (!Array.isArray(item.args) || !item.args.every((arg: unknown) => typeof arg === "string"))) return false;
    if (item.env !== undefined && (!record(item.env) || !Object.values(item.env).every((entry) => typeof entry === "string"))) return false;
    return item.enabled === undefined || typeof item.enabled === "boolean";
  });
}
function configStore(): AtomicJsonStore<McpServerConfig[]> {
  return new AtomicJsonStore(getStorageContext().files.mcp, validConfigs);
}
function loadConfigs(): McpServerConfig[] {
  const store = configStore(); // initialization errors must not become empty configuration
  try {
    const configs = store.read([]);
    logger.info(LogTag.MCP, `loaded ${configs.length} MCP server configs`);
    return configs;
  } catch (error) {
    console.error(LOG_PREFIX, "configuration read failed:", (error as Error).message);
    return [];
  }
}
function saveConfigs(configs: McpServerConfig[]): void {
  configStore().write(configs); // propagate write failure; never report a false success
}
/**
 * 一次性清理已下架的内置 MCP server 配置（id 白名单模式）。
 * 幂等：条目不存在时不报错、不写盘。
 * 只删除传入的固定 id，不会误删用户自定义 MCP。
 * 返回被实际移除的 id 列表（用于日志）。
 */
export function pruneMcpServersByIds(serverIds: string[]): Promise<string[]> {
  const ids = [...serverIds];
  return queueManagerOperation(() => pruneMcpServersByIdsNow(ids));
}
async function pruneMcpServersByIdsNow(serverIds: string[]): Promise<string[]> {
  const configs = loadConfigs();
  const removed: string[] = [];
  const kept = configs.filter((c) => {
    if (serverIds.includes(c.id)) {
      removed.push(c.id);
      return false;
    }
    return true;
  });
  if (removed.length > 0) {
    saveConfigs(kept);
  }
  // 如果有已连接的实例也断开（启动期通常还没连，但如果早期注册过会存在）
  for (const id of removed) {
    try {
      await disconnectMcpServer(id);
    } catch {
      // ignore
    }
  }
  return removed;
}

/**
 * 启动时自动连接所有已保存的 MCP server。
 * 支持 AbortSignal 协作取消：退出（或恢复屏障超时后放弃等待）时，
 * 未开始的连接不再启动；单个连接完成后若信号已中止，立即断开该连接，
 * 保证迟到的连接不残留为无所有者资源。
 */
export function initMcpManager(options: { signal?: AbortSignal } = {}): Promise<void> {
  const signal = options.signal;
  return queueManagerOperation(() => initMcpManagerNow(signal));
}
async function initMcpManagerNow(signal?: AbortSignal): Promise<void> {
  logger.info(LogTag.MCP, "initializing MCP Manager...");
  const configs = loadConfigs();

  if (configs.length === 0) {
    logger.info(LogTag.MCP, "no MCP servers configured, skipping");
    return;
  }

  let connected = 0;
  let failed = 0;

  for (const config of configs) {
    if (signal?.aborted) {
      console.log(LOG_PREFIX, "restore aborted, remaining servers skipped:", config.name);
      break;
    }
    try {
      await connectMcpServer(config);
      connected++;
      // 连接完成后再核对一次信号：退出中则立刻断开这条迟到连接
      if (signal?.aborted) {
        try {
          await disconnectMcpServer(config.id);
        } catch {
          // ignore
        }
        console.log(LOG_PREFIX, "late connection disconnected after abort:", config.name);
      }
    } catch (err) {
      failed++;
      console.error(LOG_PREFIX, "自动连接失败 [" + config.name + "]:", (err as Error).message);
    }
  }

  console.log(LOG_PREFIX, "初始化完成: " + connected + " 个成功, " + failed + " 个失败");
}

/**
 * 添加一个新的 MCP server 配置，连接并持久化。
 */
export function addMcpServer(config: McpServerConfig): Promise<{
  ok: boolean;
  toolIds?: string[];
  error?: string;
}> {
  const snapshot: McpServerConfig = {
    ...config,
    args: config.args === undefined ? undefined : [...config.args],
    env: config.env === undefined ? undefined : { ...config.env },
    effectKindOverrides: config.effectKindOverrides === undefined ? undefined : { ...config.effectKindOverrides },
  };
  return queueManagerOperation(() => addMcpServerNow(snapshot));
}
async function addMcpServerNow(config: McpServerConfig): Promise<{
  ok: boolean;
  toolIds?: string[];
  error?: string;
}> {
  console.log(LOG_PREFIX, "添加 MCP server:", config.name);

  // 检查是否已存在
  const configs = loadConfigs();
  if (configs.some(c => c.id === config.id)) {
    return { ok: false, error: "已存在相同 ID 的 MCP server: " + config.id };
  }

  let connected = false;
  try {
    const toolIds = await connectMcpServer(config);
    connected = true;
    configs.push(config);
    saveConfigs(configs);
    return { ok: true, toolIds };
  } catch (err) {
    if (connected) {
      try { await disconnectMcpServer(config.id); }
      catch { logger.warn(LogTag.MCP, "failed to disconnect unpersisted MCP server", { serverId: config.id }); }
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * 移除一个 MCP server，断开连接并持久化。
 *
 * 配置清理不依赖连接状态：历史上「配置存在但连接从未成功」的 server
 * （如 npx 不可用的场景）在 mcpServerStates 中没有记录，若因 disconnect
 * 失败而跳过配置清理，残留配置会导致后续 addMcpServer 报"已存在相同 ID"
 * 且永远无法修复。
 */
export function removeMcpServer(serverId: string): Promise<{ ok: boolean; error?: string }> {
  return queueManagerOperation(() => removeMcpServerNow(serverId));
}
async function removeMcpServerNow(serverId: string): Promise<{ ok: boolean; error?: string }> {
  console.log(LOG_PREFIX, "移除 MCP server:", serverId);

  await disconnectMcpServer(serverId);

  const configs = loadConfigs().filter(c => c.id !== serverId);
  saveConfigs(configs);
  return { ok: true };
}

/**
 * 获取所有 MCP server 的状态列表。
 */
export function listMcpServers(): Array<{
  id: string;
  name: string;
  connected: boolean;
  toolCount: number;
  toolIds: string[];
}> {
  // Read the persistent source directly: a failed read must not look like an
  // empty list, and disconnected saved servers must remain manageable.
  const configs = configStore().read([]);
  const runtime = getMcpServerStates();
  const byId = new Map(runtime.map(server => [server.id, server]));
  const storedIds = new Set(configs.map(config => config.id));
  return [
    ...configs.map(config => {
      const state = byId.get(config.id);
      return {
        id: config.id,
        name: config.name,
        connected: state?.connected ?? false,
        toolCount: state?.toolCount ?? 0,
        toolIds: [...(state?.toolIds ?? [])],
      };
    }),
    // Failed cleanup can leave an owned runtime entry without persisted config.
    // Keep it visible, but never return the underlying connection configuration.
    ...runtime.filter(server => !storedIds.has(server.id)).map(server => ({
      id: server.id,
      name: server.name,
      connected: server.connected,
      toolCount: server.toolCount,
      toolIds: [...server.toolIds],
    })),
  ];
}

/**
 * 读取已持久化的 MCP server 配置（含连接失败、未连接的）。
 * 内置 MCP 同步逻辑需要完整连接配置；设置页的 listMcpServers 只返回
 * 配置与运行态合并后的安全摘要，不包含 command/env 等连接信息。
 */
export function listMcpServerConfigs(): McpServerConfig[] {
  return loadConfigs();
}
