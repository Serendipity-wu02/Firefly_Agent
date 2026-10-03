// Skill 系统启动入口 + 对外 API。
// 唯一碰 electron 的模块（app.getPath）；scanSkills/registry/tools 都是纯逻辑或单例。

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { scanSkills } from "./skill-scanner";
import { skillRegistry } from "./skill-registry";
import { registerSkillTools } from "./skill-tools";
import type { SkillEntry } from "./types";
import { logger, LogTag } from "../logger";
import { getExternalContentPaths, resolveSkillScanSources, resolvePackagedSkillDirectory } from "../external-content-paths";
import { synchronizeManagedSkillDirectories, validateManagedSourceDirectory } from "./directory-install";

const LOG_PREFIX = "[Skills]";

/** skill enabled 状态持久化文件（userData/skills-enabled.json）。 */
function enabledStatePath(): string {
  return path.join(app.getPath("userData"), "skills-enabled.json");
}

/** 读取持久化的 enabled 状态（id → bool）。 */
function loadEnabledState(): Record<string, boolean> {
  try {
    const p = enabledStatePath();
    if (!fs.existsSync(p)) return {};
    const raw: unknown = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.values(raw).some((value) => typeof value !== "boolean")) throw new Error("SKILL_SETTINGS_READ_FAILED");
    return raw as Record<string, boolean>;
  } catch {
    throw new Error("SKILL_SETTINGS_READ_FAILED");
  }
}

/**
 * 启动入口：将受校验的第三方 Skills 目录同步到 user 区，
 * 再扫描双源 skills → 灌入 registry（user 目录级覆盖 builtin + 合并 enabled 状态）→ 注册 meta-tool。
 * 必须在 app.whenReady 之后调用（依赖 app.getPath）。
 */
export async function initSkills(): Promise<void> {
  const paths = getExternalContentPaths();

  const sourceDirectory = resolvePackagedSkillDirectory(paths);
  const userSkillsDir = paths.userSkillDirectories[0];
  try {
    if (sourceDirectory) {
      const manifestPath = path.join(path.dirname(sourceDirectory), "skills-manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { skills: string[]; files: Record<string, string> };
      if (!Array.isArray(manifest.skills) || !manifest.files || typeof manifest.files !== "object"
        || Array.isArray(manifest.files)) throw new Error("SKILL_DIRECTORY_MANIFEST_INVALID");
      validateManagedSourceDirectory(sourceDirectory, manifest.skills, manifest.files);
      synchronizeManagedSkillDirectories({ sourceDirectory, userSkillsDir, expectedIds: manifest.skills,
        expectedFileHashes: manifest.files });
    }
  } catch (error) {
    const reason = error instanceof Error && /^SKILL_[A-Z_]+$/.test(error.message) ? error.message : "SKILL_DIRECTORY_SYNC_FAILED";
    logger.warn(LogTag.Skills, "managed directory sync failed; scanning existing files without replacing them", { reason });
  }

  const sources = resolveSkillScanSources(paths);

  // 合并：扫描源按低到高优先级排列，user 覆盖 builtin。
  const map = new Map<string, SkillEntry>();
  for (const source of sources) {
    for (const skill of scanSkills(source.directory, source.source)) map.set(skill.id, skill);
  }

  // 合并 enabled 状态（settings.json 持久化的覆盖默认 true）
  const saved = loadEnabledState();
  for (const s of map.values()) {
    if (s.id in saved) s.enabled = saved[s.id];
    skillRegistry.register(s);
  }

  registerSkillTools();
  logger.info(LogTag.Skills, "scan roots:", sources.map((source) => `${source.source}:${source.directory}`).join(" | "));
  logger.info(LogTag.Skills, `loaded ${map.size} skills:`, Array.from(map.keys()).join(", ") || "(none)");
}

/** 持久化某 skill 的 enabled 状态。 */
export function setSkillEnabled(id: string, enabled: boolean): void {
  try {
    const saved = loadEnabledState();
    saved[id] = enabled;
    fs.mkdirSync(path.dirname(enabledStatePath()), { recursive: true });
    fs.writeFileSync(enabledStatePath(), JSON.stringify(saved, null, 2), "utf8");
    skillRegistry.setEnabled(id, enabled);
  } catch (err) {
    console.warn(LOG_PREFIX, "持久化 enabled 失败:", err);
  }
}

/** 返回所有 skill 的元数据（给 UI 用）。hiddenFromUi 的技能不暴露。 */
export function listSkillsForUi() {
  return skillRegistry
    .getAll()
    .filter((s) => !s.hiddenFromUi)
    .map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tools: s.tools ?? [],
      enabled: s.enabled,
      source: s.source,
      version: s.version,
      references: s.references,
    }));
}

/**
 * 重新扫描 user skills 目录并更新 registry。
 * 用于用户安装/删除 skill 后，无需重启应用即可刷新 UI。
 * 返回扫描后 registry 中 skill 总数。
 */
export function rescanSkills(): number {
  const paths = getExternalContentPaths();
  const sources = resolveSkillScanSources(paths);

  const map = new Map<string, SkillEntry>();
  for (const source of sources) {
    for (const skill of scanSkills(source.directory, source.source)) map.set(skill.id, skill);
  }

  const saved = loadEnabledState();
  // 清理 registry 中已不存在的 skill，避免删除后仍残留
  for (const id of skillRegistry.getAll().map((s) => s.id)) {
    if (!map.has(id)) skillRegistry.unregister?.(id);
  }
  for (const s of map.values()) {
    if (s.id in saved) s.enabled = saved[s.id];
    skillRegistry.register(s);
  }

  logger.info(LogTag.Skills, `rescanned ${map.size} skills:`, Array.from(map.keys()).join(", ") || "(none)");
  return map.size;
}

export { skillRegistry } from "./skill-registry";
export { buildAutoInjectedSkillContext, buildAutoInjectedSoulContext, buildSkillCatalog } from "./skill-catalog";
export { parseSlashCommand } from "./skill-commands";
