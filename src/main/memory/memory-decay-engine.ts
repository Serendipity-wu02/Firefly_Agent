import type { MemoryRecord } from "./memory-types";
import type { DecayConfig } from "./evolution-types";
import { DEFAULT_DECAY_CONFIG } from "./evolution-types";

/**
 * 记忆时间衰减与存活评估引擎 (MemoryDecayEngine)
 * 实现艾宾浩斯指数半衰期模型与召回频次强化计算。
 */
export class MemoryDecayEngine {
  private readonly config: DecayConfig;

  constructor(config?: Partial<DecayConfig>) {
    this.config = {
      ...DEFAULT_DECAY_CONFIG,
      ...(config || {}),
    };
  }

  getConfig(): Readonly<DecayConfig> {
    return this.config;
  }

  /**
   * 计算指定时间戳下的记忆动态有效强度 (Effective Strength 0.0 - 1.0)
   */
  calculateStrength(record: MemoryRecord, currentTime?: number): number {
    const now = currentTime || Date.now();
    const importance = Math.max(0, Math.min(1, record.importance ?? 0.5));
    const accessCount = Math.max(0, record.accessCount ?? 0);

    // 1. 频次强化因子: (1 + w * ln(1 + accessCount))
    const reinforcement = 1 + this.config.accessReinforcementWeight * Math.log(1 + accessCount);

    // 2. 永久固化 (pinned) 或 L2 语义核心画像完全免疫自然时间衰减
    if (record.pinned || record.layer === "L2_SEMANTIC") {
      const strength = Math.min(1.0, importance * reinforcement);
      return Number(strength.toFixed(4));
    }

    // 3. 计算时间差
    const lastActiveTime = record.lastAccessedAt || record.updatedAt || record.createdAt || now;
    const elapsedMs = Math.max(0, now - lastActiveTime);
    const halfLifeMs = Math.max(1, this.config.halfLifeDays * 24 * 60 * 60 * 1000);

    // 4. 指数衰减系数: e^(- (ln2 * t) / halfLife)
    const decayFactor = Math.exp((-Math.LN2 * elapsedMs) / halfLifeMs);

    // 5. 综合有效强度
    const dynamicStrength = Math.max(0, Math.min(1.0, importance * decayFactor * reinforcement));
    return Number(dynamicStrength.toFixed(4));
  }

  /**
   * 判断记忆条目是否已达到明确的 TTL 过期时间戳
   */
  isExpired(record: MemoryRecord, currentTime?: number): boolean {
    if (!record.expiresAt) {
      return false;
    }
    const now = currentTime || Date.now();
    return record.expiresAt <= now;
  }

  /**
   * 综合判断记忆条目是否可被安全清理修剪 (Prunable)
   */
  isPrunable(record: MemoryRecord, currentTime?: number): boolean {
    // 永久固化或 L2 画像不可被自然修剪
    if (record.pinned || record.layer === "L2_SEMANTIC") {
      return false;
    }

    // 达到明确 TTL 即刻过期
    if (this.isExpired(record, currentTime)) {
      return true;
    }

    // 有效强度低于最低留存阈值
    const strength = this.calculateStrength(record, currentTime);
    return strength < this.config.minStrengthThreshold;
  }
}
