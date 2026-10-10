// Skill 注册表 —— 镜像 ToolRegistry 的 Map + 单例模式。
// 启动时由 initSkills 灌入扫描结果；getBody/getReference 懒加载 + 缓存。

import * as fs from "fs";
import * as path from "path";
import type { SkillEntry, SkillMode, SkillModeOverrides } from "./types";
import { isExternalSkillId, parseSkillFrontmatter } from "./skill-scanner";

export class SkillRegistry {
  private skills = new Map<string, SkillEntry>();
  private bodyCache = new Map<string, string>();
  private availability = new Map<string, () => boolean>();
  private externalAccessGate: (skill: SkillEntry) => boolean = () => false;

  /** Main-only host probe. Default denies every reserved external-prefix entry. */
  setExternalAccessGate(probe: (skill: SkillEntry) => boolean): void {
    this.externalAccessGate = probe;
    this.bodyCache.clear();
  }

  private canAccess(skill: SkillEntry): boolean {
    if (!isExternalSkillId(skill.id)) return true;
    if (!skill.enabled || skill.external?.status !== "ready") return false;
    try { return this.externalAccessGate(skill) === true; } catch { return false; }
  }

  register(skill: SkillEntry): void {
    this.bodyCache.delete(skill.id);
    this.skills.set(skill.id, { ...skill });
  }

  getEnabled(): SkillEntry[] {
    return Array.from(this.skills.values()).filter(s => s.enabled && this.canAccess(s) && (this.availability.get(s.id)?.() ?? true));
  }

  /** 按会话模式过滤的启用 skill 列表。
   *  过滤规则（优先级从高到低）：
   *    1. skill.enabled && availability 探针通过
   *    2. 若 overrides[skillId][mode] 存在：用覆盖值
   *    3. 否则按 modes 字段：!modes || modes.includes(mode)
   *  未声明 modes 且无覆盖的 skill 默认全模式可见。 */
  getEnabledForMode(mode: SkillMode, overrides?: SkillModeOverrides): SkillEntry[] {
    if (mode !== "work" && mode !== "code") throw new Error("INVALID_SKILL_MODE");
    return Array.from(this.skills.values()).filter((s) => {
      if (!s.enabled || !this.canAccess(s) || !(this.availability.get(s.id)?.() ?? true)) return false;
      const override = overrides ? overrides[s.id]?.[mode] : undefined;
      if (override !== undefined) return override;
      return !s.modes || s.modes.includes(mode);
    });
  }

  getAll(): SkillEntry[] {
    return Array.from(this.skills.values());
  }

  getById(id: string): SkillEntry | undefined {
    return this.skills.get(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    const s = this.skills.get(id);
    if (s) s.enabled = enabled;
  }

  unregister(id: string): boolean {
    this.bodyCache.delete(id);
    this.availability.delete(id);
    return this.skills.delete(id);
  }

  setAvailability(id: string, probe: () => boolean): void {
    this.availability.set(id, probe);
  }

  isAvailable(id: string): boolean {
    const skill = this.skills.get(id);
    if (isExternalSkillId(id) && (!skill || !this.canAccess(skill))) return false;
    return this.availability.get(id)?.() ?? true;
  }

  /**
   * 懒加载 SKILL.md 正文（去掉 frontmatter）+ 缓存。
   * 普通 Skill 保留原懒加载缓存语义；外部 Skill 在缓存命中前也重新验证宿主与来源。
   * 返回 null 表示 skill 不存在或读取失败。
   */
  getBody(id: string): string | null {
    const s = this.skills.get(id);
    if (!s || !this.canAccess(s)) return null;
    const cached = this.bodyCache.get(id);
    if (cached !== undefined) return cached;
    try {
      const raw = fs.readFileSync(s.bodyPath, "utf8");
      // Reuse the scanner's data-only parser. A changed/unsafe header must not
      // become raw instructions; legacy plain-body fallback remains supported.
      let parseFailed = false;
      const parsed = parseSkillFrontmatter(raw, () => { parseFailed = true; });
      if (parseFailed) return null;
      const body = parsed ? parsed.body : raw.trim();
      if (!this.canAccess(s)) return null;
      this.bodyCache.set(id, body);
      return body;
    } catch {
      return null;
    }
  }

  /**
   * 读 references 附件。
   * 路径穿越防护：ref 必须命中扫描阶段缓存的 references 清单，且不含路径分隔符/..，
   * 否则拒绝（返回 null）。不直接拿 ref 拼路径。
   */
  getReference(id: string, ref: string): string | null {
    const s = this.skills.get(id);
    if (!s || !this.canAccess(s)) return null;
    if (!s.references.includes(ref)) return null;
    if (ref.includes("/") || ref.includes("\\") || ref.includes("..")) return null;
    const refPath = path.join(s.dirPath, "references", ref);
    try {
      const content = fs.readFileSync(refPath, "utf8");
      return this.canAccess(s) ? content : null;
    } catch {
      return null;
    }
  }
}

// 全局单例
export const skillRegistry = new SkillRegistry();
