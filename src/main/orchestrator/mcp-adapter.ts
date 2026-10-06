// MCP Adapter — 将 MCP server 的工具发现和调用适配到 ToolRegistry
import { isDeepStrictEqual } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ToolDefinition, toolRegistry, type ToolEffectKind } from "./tools/registry/tool-registry";
import type { ToolRiskLevel } from "../permission-policy";
import { ToolExecutionError } from "./tools/registry/tool-execution-error";
import type { ToolContext } from "./tools/registry/tool-context";
import { createAbortError, isCancellationError, raceWithSignal } from "../abort-utils";

const LOG_PREFIX = "[MCP Adapter]";

const MCP_EFFECT_RISK: Record<ToolEffectKind, ToolRiskLevel> = {
  read: "network",
  verification: "network",
  mutation: "fs-write",
  external_side_effect: "input-control",
  unknown: "input-control",
};

export interface McpServerConfig {
  id: string;              // 唯一标识
  name: string;            // 展示名
  transport: "stdio" | "sse";
  command?: string;         // stdio 必填,sse 不用
  args?: string[];         // 命令行参数
  env?: Record<string, string>;
  cwd?: string;
  url?: string;            // sse 必填,stdio 不用
  /** 按 toolName 显式覆盖 effectKind（serverId + toolName 作为 key） */
  effectKindOverrides?: Record<string, ToolEffectKind>;
}

/** MCP Tool annotations（MCP 协议 2025-03-26 版） */
interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  [key: string]: unknown;
}

interface McpServerState {
  config: McpServerConfig;
  client: Client;
  transport: Transport;
  connected: boolean;
  toolIds: string[];       // 已注册到 ToolRegistry 的工具 ID 列表
}

/**
 * 从本地 override 或 MCP Tool annotations 推导 effectKind。
 * 当前配置没有可信 server 标记，server 的 readOnlyHint 不可降低工具风险。
 *
 * 优先级（保守策略）：
 * 1. 本地有效 override（最高优先级）
 * 2. destructiveHint=true → external_side_effect（第三方 annotations 矛盾时采用保守策略）
 * 3. 其余 server annotations → unknown（按 input-control 风险检查权限）
 *
 * 注意：destructiveHint=false 不等于 readOnlyHint=true。
 * 第三方 annotations 同时设置 readOnlyHint + destructiveHint 时，destructive 优先（按外部副作用风险检查权限）。
 */
function resolveMcpEffectKind(
  annotations: McpToolAnnotations | undefined,
  overrides: Record<string, ToolEffectKind> | undefined,
  toolName: string,
): ToolEffectKind {
  // 优先级 1：本地有效 override
  const override = overrides && Object.prototype.hasOwnProperty.call(overrides, toolName)
    ? overrides[toolName]
    : undefined;
  if (typeof override === "string" && Object.prototype.hasOwnProperty.call(MCP_EFFECT_RISK, override)) {
    return override as ToolEffectKind;
  }
  if (!annotations) return "unknown";
  // 优先级 2：destructiveHint=true（保守策略，按外部副作用风险检查权限）
  if (annotations.destructiveHint === true) return "external_side_effect";
  // 优先级 3：无可信 server 标记时，其余 annotations 不能降级风险
  return "unknown";
}

function sameConnectionConfig(a: McpServerConfig, b: McpServerConfig): boolean {
  const comparable = (config: McpServerConfig) => ({
    id: config.id, name: config.name, transport: config.transport,
    command: config.command, args: config.args ?? [], env: config.env ?? {},
    cwd: config.cwd, url: config.url, effectKindOverrides: config.effectKindOverrides ?? {},
  });
  return isDeepStrictEqual(comparable(a), comparable(b));
}

// Adapter 是每个 ID 的唯一连接所有者。相同请求合并；变更/断开按调用顺序执行。
const mcpOperations = new Map<string, { config?: McpServerConfig; promise: Promise<unknown> }>();

function queueMcpOperation<T>(serverId: string, config: McpServerConfig | undefined, run: () => Promise<T>): Promise<T> {
  const previous = mcpOperations.get(serverId);
  const promise = (previous ? previous.promise.catch(() => undefined) : Promise.resolve()).then(run);
  const operation = { config, promise };
  mcpOperations.set(serverId, operation);
  const clear = () => {
    if (mcpOperations.get(serverId) === operation) mcpOperations.delete(serverId);
  };
  void promise.then(clear, clear);
  return promise;
}

/**
 * 连接一个 MCP server，发现其工具并注册到 ToolRegistry。
 * 返回注册的工具 ID 列表。
 */
export function connectMcpServer(config: McpServerConfig): Promise<string[]> {
  // 固定调用时的配置，避免等待中的 caller 修改导致沿用错误 client/工具风险。
  const snapshot: McpServerConfig = {
    ...config,
    args: config.args === undefined ? undefined : [...config.args],
    env: config.env === undefined ? undefined : { ...config.env },
    effectKindOverrides: config.effectKindOverrides === undefined ? undefined : { ...config.effectKindOverrides },
  };
  const pending = mcpOperations.get(snapshot.id);
  if (pending?.config && sameConnectionConfig(pending.config, snapshot)) {
    return (pending.promise as Promise<string[]>).then(ids => [...ids]);
  }
  return queueMcpOperation(snapshot.id, snapshot, async () => {
    const existing = mcpServerStates.get(snapshot.id);
    if (existing?.connected && sameConnectionConfig(existing.config, snapshot)) return [...existing.toolIds];
    if (existing) await disconnectMcpServerNow(snapshot.id);
    return connectMcpServerNow(snapshot);
  }).then(ids => [...ids]);
}

function forgetMcpState(state: McpServerState): void {
  state.connected = false;
  if (mcpServerStates.get(state.config.id) !== state) return;
  mcpServerStates.delete(state.config.id);
  for (const toolId of state.toolIds) toolRegistry.unregister(toolId);
}

async function closeMcpResources(client: Client, transport: Transport): Promise<void> {
  // SDK 1.29.0 Protocol.close() 关闭其 transport；失败时直接释放 transport。
  // https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.29.0/src/shared/protocol.ts
  try { await client.close(); }
  catch (err) {
    console.error(LOG_PREFIX, "client.close 失败:", err instanceof Error ? err.message : String(err));
    try { await transport.close(); }
    catch (closeErr) {
      console.error(LOG_PREFIX, "transport.close 失败:", closeErr instanceof Error ? closeErr.message : String(closeErr));
      throw closeErr;
    }
  }
}

async function releaseMcpState(state: McpServerState): Promise<void> {
  await closeMcpResources(state.client, state.transport);
  forgetMcpState(state);
}

async function cleanupFailedMcpState(state: McpServerState): Promise<void> {
  try { await releaseMcpState(state); }
  catch {
    console.error(LOG_PREFIX, "资源清理未完成，将在下次连接/断开时重试:", state.config.id);
  }
}

async function connectMcpServerNow(config: McpServerConfig): Promise<string[]> {
  console.log(LOG_PREFIX, "连接 MCP server:", config.name, "(" + config.id + ")");

  let transport: Transport;
  if (config.transport === "sse") {
    if (!config.url) {
      throw new Error("sse transport requires url");
    }
    transport = new SSEClientTransport(new URL(config.url));
  } else {
    if (!config.command) {
      throw new Error("stdio transport requires command");
    }
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: config.cwd,
    });
  }

  // 监听 transport 错误
  transport.onerror = (err: Error) => {
    console.error(LOG_PREFIX, "transport 错误 [" + config.name + "]:", err.message);
  };

  const client = new Client(
    { name: "firefly", version: "0.8.0" },
    { capabilities: {} },
  );

  // 在连接完成前也持有资源；清理失败时保留 disconnected 状态供重试。
  const state: McpServerState = {
    config, client, transport, connected: false, toolIds: [],
  };
  mcpServerStates.set(config.id, state);
  let closed = false;
  client.onclose = () => {
    closed = true;
    const owned = mcpServerStates.get(config.id);
    if (owned?.client === client) forgetMcpState(owned);
  };

  try {
    await client.connect(transport);
    console.log(LOG_PREFIX, "已连接到", config.name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(LOG_PREFIX, "连接失败 [" + config.name + "]:", msg);
    // 连接失败时清理 transport
    try {
      await transport.close();
      forgetMcpState(state);
    } catch (closeErr) {
      console.error(LOG_PREFIX, "连接失败后的 transport 清理未完成:", config.id,
        closeErr instanceof Error ? closeErr.message : String(closeErr));
    }
    throw err;
  }

  // 发现工具
  let mcpTools: Array<{
    name: string;
    description?: string;
    annotations?: McpToolAnnotations;
    inputSchema: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  }> = [];

  try {
    const result = await client.listTools();
    mcpTools = result.tools as Array<{
      name: string;
      description?: string;
      annotations?: McpToolAnnotations;
      inputSchema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
      };
    }>;
    console.log(LOG_PREFIX, "发现 " + mcpTools.length + " 个工具:", mcpTools.map(t => t.name).join(", "));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(LOG_PREFIX, "listTools 失败 [" + config.name + "]:", msg);
    await cleanupFailedMcpState(state);
    throw err;
  }

  // 注册到 ToolRegistry
  const registeredIds = state.toolIds;
  try {
    if (closed) throw new Error("MCP connection closed during discovery");
    for (const mt of mcpTools) {
      // 用短横线拼接，不用冒号——Kimi 等厂商 function.name 正则不允许冒号
      // （Kimi: ^[a-zA-Z_][a-zA-Z0-9-_]$）。短横线所有厂商都接受。
      const toolId = config.id + "-" + mt.name;

      // 如果已存在同名工具，跳过
      if (toolRegistry.getById(toolId)) {
        console.warn(LOG_PREFIX, "工具已存在，跳过:", toolId);
        continue;
      }

      // 从 annotations 或 override 解析 effectKind
      const resolvedEffectKind = resolveMcpEffectKind(mt.annotations, config.effectKindOverrides, mt.name);
      if (resolvedEffectKind === "unknown") {
        console.warn(LOG_PREFIX, `工具 ${toolId} 的 effectKind 为 unknown，将按 input-control 风险检查权限`);
      }

      const toolDef: ToolDefinition = {
        id: toolId,
        name: "[" + config.name + "] " + mt.name,
        description: mt.description || mt.name,
        enabled: true,
        effectKind: resolvedEffectKind,
        risk: MCP_EFFECT_RISK[resolvedEffectKind],
        inputSchema: {
          type: "object",
          properties: mt.inputSchema?.properties as Record<string, { type: string; description: string }> || {},
          required: mt.inputSchema?.required,
        },
        needsContext: true,
        // Cancellation belongs to SDK request options, never to server-visible tool arguments.
        execute: async (args: Record<string, unknown>, ctx?: ToolContext) => {
          if (ctx?.signal?.aborted) throw createAbortError();
          console.log(LOG_PREFIX, "调用工具:", toolId, JSON.stringify(args));
          try {
            const owned = mcpServerStates.get(config.id);
            if (!owned?.connected || owned.client !== client || closed) {
              throw new Error("MCP connection is no longer owned");
            }
            const request = { name: mt.name, arguments: args };
            const result = await raceWithSignal(ctx?.signal
              ? client.callTool(request, undefined, { signal: ctx.signal })
              : client.callTool(request), ctx?.signal);
            const currentOwner = mcpServerStates.get(config.id);
            if (!currentOwner?.connected || currentOwner.client !== client || closed) {
              throw new Error("MCP connection is no longer owned");
            }
            // 提取文本内容
            const texts: string[] = [];
            if (result.content && Array.isArray(result.content)) {
              for (const block of result.content) {
                if (block && typeof block === "object" && (block as { type: string }).type === "text") {
                  texts.push(String((block as { text: string }).text));
                }
              }
            }
            const output = texts.join("\n") || JSON.stringify(result.content);
            if (result.isError === true) {
              throw new Error(`E_MCP_TOOL_FAILED${output ? `: ${output}` : ""}`);
            }
            console.log(LOG_PREFIX, "工具返回 [" + toolId + "]:", output.slice(0, 200));
            return output;
          } catch (err) {
            if (isCancellationError(err, ctx?.signal)) throw createAbortError();
            const msg = err instanceof Error ? err.message : String(err);
            console.error(LOG_PREFIX, "工具调用失败 [" + toolId + "]:", msg);
            throw new ToolExecutionError(
              "E_MCP_TOOL_FAILED",
              msg.startsWith("E_MCP_TOOL_FAILED") ? msg : `E_MCP_TOOL_FAILED: ${msg}`,
              "semantic_failure",
              false,
              "unknown",
            );
          }
        },
      };

      toolRegistry.register(toolDef);
      registeredIds.push(toolId);
      console.log(LOG_PREFIX, "已注册工具:", toolId);
    }

    // 保存状态
    state.connected = true;

    console.log(LOG_PREFIX, "MCP server 就绪:", config.name, "(" + registeredIds.length + " 个工具)");
    return [...registeredIds];
  } catch (err) {
    for (const toolId of registeredIds) toolRegistry.unregister(toolId);
    state.toolIds = [];
    await cleanupFailedMcpState(state);
    throw err;
  }
}

/**
 * 断开并清理一个 MCP server 及其注册的工具。
 */
export function disconnectMcpServer(serverId: string): Promise<boolean> {
  return queueMcpOperation(serverId, undefined, () => disconnectMcpServerNow(serverId));
}

async function disconnectMcpServerNow(serverId: string): Promise<boolean> {
  console.log(LOG_PREFIX, "断开 MCP server:", serverId);
  const state = mcpServerStates.get(serverId);
  if (!state) {
    console.warn(LOG_PREFIX, "未找到 MCP server:", serverId);
    return false;
  }

  // 先撤销所有权和工具，关闭期间旧 execute 闭包也不能继续使用 client。
  state.connected = false;
  for (const toolId of state.toolIds) toolRegistry.unregister(toolId);
  state.toolIds = [];
  await releaseMcpState(state);
  console.log(LOG_PREFIX, "已断开:", serverId);
  return true;
}

/**
 * 获取有运行时所有权的 MCP server 状态（包括清理失败、等待重试的资源）。
 */
export function getMcpServerStates(): Array<{
  id: string;
  name: string;
  connected: boolean;
  toolCount: number;
  toolIds: string[];
}> {
  return Array.from(mcpServerStates.values()).map(s => ({
    id: s.config.id,
    name: s.config.name,
    connected: s.connected,
    toolCount: s.toolIds.length,
    toolIds: [...s.toolIds],
  }));
}

// 内部状态存储
const mcpServerStates = new Map<string, McpServerState>();
