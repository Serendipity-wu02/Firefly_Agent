import type { MemoryWriteProposal } from "./write-types";

/**
 * 记忆重要性评估引擎 (ImportanceEvaluator)
 * 独立计算记忆条目本身的内在留存价值 (Intrinsic Retention Value)。
 * 与用于单次 Query 匹配打分的 MemoryRanker 严格解耦。
 */
export class ImportanceEvaluator {
  /**
   * 评估单条记忆提议的重要性得分 (0.0 - 1.0)
   */
  evaluate(proposal: MemoryWriteProposal): number {
    // 1. 若提议显式指定了有效重要性，作为基础参考
    if (proposal.importance !== undefined && proposal.importance >= 0 && proposal.importance <= 1.0) {
      if (proposal.pinned) {
        return Math.max(proposal.importance, 0.90);
      }
      return Number(proposal.importance.toFixed(4));
    }

    // 2. 基于分类的基础重要性评分
    let baseScore = 0.50;
    switch (proposal.category) {
      case "profile":
        baseScore = 0.95; // 姓名/生日/禁忌等核心基础画像
        break;
      case "preference":
        baseScore = 0.85; // 明确喜好与习惯
        break;
      case "relation":
        baseScore = 0.80; // 人际纽带与关系事实
        break;
      case "event":
        baseScore = 0.75; // 重要约定与里程碑事件
        break;
      case "entity":
        baseScore = 0.65; // 具名实体与背景概念
        break;
      case "working_state":
        baseScore = 0.35; // 会话临时状态
        break;
      case "casual_chat":
      case "ephemeral_chat":
      case "system_noise":
        baseScore = 0.10; // 无长期保存价值的日常闲聊与瞬态噪声
        break;
      default:
        baseScore = 0.50;
        break;
    }

    // 3. 来源显式度调整 (Explicitness Adjustment)
    if (proposal.source === "user_explicit") {
      baseScore += 0.05;
    } else if (proposal.source === "chat_extract") {
      // 提取型信息略微保守
      baseScore -= 0.05;
    }

    // 4. 显式纠错加权 (Correction Adjustment)
    if (proposal.isCorrection) {
      baseScore = Math.max(baseScore, 0.90);
    }

    // 5. 永久固化置顶 (Pinned)
    if (proposal.pinned) {
      baseScore = Math.max(baseScore, 0.95);
    }

    // 6. 确定性边界截断 (0.0 - 1.0)
    const finalScore = Math.max(0.0, Math.min(1.0, baseScore));
    return Number(finalScore.toFixed(4));
  }
}
