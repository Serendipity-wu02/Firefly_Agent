import type { ChatMessage } from "../../../shared/chat-types";
import type { ContextUsageSnapshot } from "../context/context-budget";
import { ToolResultPruner, type PruningConfig } from "./tool-result-pruner";
import { PairedSafeCut } from "./safe-cut";

export type CompactionStrategy = "none" | "soft" | "hard" | "emergency";

export interface CompactorOptions {
  softThreshold: number;
  hardThreshold: number;
  retainCount: number;
  emergencyRetainCount: number;
  pruningConfig?: Partial<PruningConfig>;
  summaryGenerator?: (olderMessages: ChatMessage[]) => string;
}

export const DEFAULT_COMPACTOR_OPTIONS: CompactorOptions = {
  softThreshold: 0.7,
  hardThreshold: 0.85,
  retainCount: 4,
  emergencyRetainCount: 2,
};

export interface CompactionResult {
  messages: ChatMessage[];
  strategyApplied: CompactionStrategy;
  compacted: boolean;
  prunedToolCount: number;
  summarizedCount: number;
}

/**
 * ContextCompactor (上下文压缩协调器)
 *
 * 负责在 Context Projection 层实施多级压缩策略 (Soft / Hard / Emergency)。
 *
 * 核心设计准则：
 * 1. 仅对投影物化数组生效，绝对不删除或修改 AgentSession 中的原始事件历史；
 * 2. 严格利用 PairedSafeCut 保证 assistant.toolCalls 与 tool 结果的成对完整性；
 * 3. 失败安全 (Failure Safety)：任何异常均优雅回退至原始投影，绝不崩溃 Agent Loop。
 */
export class ContextCompactor {
  /**
   * 根据上下文压力快照自适应选择并执行压缩
   */
  static compact(
    messages: ChatMessage[],
    usage?: ContextUsageSnapshot,
    customOptions?: Partial<CompactorOptions>,
  ): CompactionResult {
    try {
      if (!messages || messages.length === 0) {
        return {
          messages: messages || [],
          strategyApplied: "none",
          compacted: false,
          prunedToolCount: 0,
          summarizedCount: 0,
        };
      }

      const opts: CompactorOptions = { ...DEFAULT_COMPACTOR_OPTIONS, ...customOptions };
      const pressure = usage ? usage.pressureRatio : 0;

      if (pressure >= opts.hardThreshold) {
        return this.hardCompact(messages, opts);
      }

      if (pressure >= opts.softThreshold || (usage && usage.needsCompaction)) {
        return this.softCompact(messages, opts);
      }

      return {
        messages: [...messages],
        strategyApplied: "none",
        compacted: false,
        prunedToolCount: 0,
        summarizedCount: 0,
      };
    } catch (err) {
      console.warn("[ContextCompactor] Compaction failed safely, returning original projection:", err);
      return {
        messages: [...messages],
        strategyApplied: "none",
        compacted: false,
        prunedToolCount: 0,
        summarizedCount: 0,
      };
    }
  }

  /**
   * Soft Compaction:
   * 仅针对历史中的 tool 结果进行即时修剪，不截断或摘要非工具对话内容
   */
  static softCompact(
    messages: ChatMessage[],
    customOptions?: Partial<CompactorOptions>,
  ): CompactionResult {
    try {
      const opts: CompactorOptions = { ...DEFAULT_COMPACTOR_OPTIONS, ...customOptions };
      const { messages: prunedMessages, prunedCount } = ToolResultPruner.pruneMessages(
        messages,
        opts.pruningConfig,
      );

      return {
        messages: prunedMessages,
        strategyApplied: "soft",
        compacted: prunedCount > 0,
        prunedToolCount: prunedCount,
        summarizedCount: 0,
      };
    } catch (err) {
      console.warn("[ContextCompactor] Soft compaction failed safely:", err);
      return {
        messages: [...messages],
        strategyApplied: "none",
        compacted: false,
        prunedToolCount: 0,
        summarizedCount: 0,
      };
    }
  }

  /**
   * Hard Compaction:
   * 1. 批量修剪工具输出
   * 2. 利用 PairedSafeCut 寻找配对安全切点
   * 3. 切割历史并在投影层物化 Summary Node，保留活跃尾部窗口
   */
  static hardCompact(
    messages: ChatMessage[],
    customOptions?: Partial<CompactorOptions>,
  ): CompactionResult {
    try {
      const opts: CompactorOptions = { ...DEFAULT_COMPACTOR_OPTIONS, ...customOptions };

      // 1. 先执行工具修剪
      const { messages: prunedMessages, prunedCount } = ToolResultPruner.pruneMessages(
        messages,
        opts.pruningConfig,
      );

      const systemMessages = prunedMessages.filter((m) => m.role === "system");
      const nonSystemMessages = prunedMessages.filter((m) => m.role !== "system");

      if (nonSystemMessages.length <= opts.retainCount + 1) {
        return {
          messages: prunedMessages,
          strategyApplied: "hard",
          compacted: prunedCount > 0,
          prunedToolCount: prunedCount,
          summarizedCount: 0,
        };
      }

      // 2. 配对安全切分
      const cutIndex = PairedSafeCut.findCutIndex(nonSystemMessages, opts.retainCount);
      if (cutIndex <= 0) {
        return {
          messages: prunedMessages,
          strategyApplied: "hard",
          compacted: prunedCount > 0,
          prunedToolCount: prunedCount,
          summarizedCount: 0,
        };
      }

      const older = nonSystemMessages.slice(0, cutIndex);
      const recent = nonSystemMessages.slice(cutIndex);

      // 3. 构建 Summary Node
      const summaryText = opts.summaryGenerator
        ? opts.summaryGenerator(older)
        : this.generateDefaultSummary(older);

      const summaryNode: ChatMessage = {
        id: `summary-${Date.now()}`,
        role: "system",
        content: summaryText,
        timestamp: Date.now(),
      };

      const result = [...systemMessages, summaryNode, ...recent];

      // 4. 完整性校验
      const integrity = PairedSafeCut.validateIntegrity(result);
      if (!integrity.valid) {
        console.warn("[ContextCompactor] Hard compaction failed integrity check, falling back:", integrity.reason);
        return {
          messages: prunedMessages,
          strategyApplied: "soft",
          compacted: prunedCount > 0,
          prunedToolCount: prunedCount,
          summarizedCount: 0,
        };
      }

      return {
        messages: result,
        strategyApplied: "hard",
        compacted: true,
        prunedToolCount: prunedCount,
        summarizedCount: older.length,
      };
    } catch (err) {
      console.warn("[ContextCompactor] Hard compaction failed safely:", err);
      return {
        messages: [...messages],
        strategyApplied: "none",
        compacted: false,
        prunedToolCount: 0,
        summarizedCount: 0,
      };
    }
  }

  /**
   * Emergency Compaction:
   * 上下文溢出 (400/413) 后的激进压缩策略
   */
  static emergencyCompact(
    messages: ChatMessage[],
    customOptions?: Partial<CompactorOptions>,
  ): CompactionResult {
    try {
      const opts: CompactorOptions = {
        ...DEFAULT_COMPACTOR_OPTIONS,
        ...customOptions,
        retainCount: customOptions?.emergencyRetainCount || 2,
        pruningConfig: {
          maxResultChars: 1_024,
          headChars: 512,
          tailChars: 128,
          middleMarker: "\n[... 紧急压缩截断 ...]\n",
          preserveErrors: false,
          ...(customOptions?.pruningConfig || {}),
        },
      };

      const result = this.hardCompact(messages, opts);
      return {
        ...result,
        strategyApplied: "emergency",
      };
    } catch (err) {
      console.warn("[ContextCompactor] Emergency compaction failed safely:", err);
      return {
        messages: [...messages],
        strategyApplied: "none",
        compacted: false,
        prunedToolCount: 0,
        summarizedCount: 0,
      };
    }
  }

  private static generateDefaultSummary(olderMessages: ChatMessage[]): string {
    const toolCount = olderMessages.filter((m) => m.role === "tool").length;
    const userCount = olderMessages.filter((m) => m.role === "user").length;
    return `[前序对话历史摘要：开拓者与流萤进行了 ${userCount} 轮温馨交流，执行了 ${toolCount} 次动作与工具调用，双方相处愉快]`;
  }
}
