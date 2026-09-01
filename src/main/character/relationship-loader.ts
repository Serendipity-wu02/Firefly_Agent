/**
 * @file relationship-loader.ts
 * @description Dynamic Relationship Loader for Firefly V2.4 Character Runtime.
 * Strictly loads and derives CharacterRelationship data directly from resources/knowledge/facts.yaml and curated cards.
 * Zero hardcoded prose, zero fallback canonical facts.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type {
  CharacterRelationship,
  RelationshipCategory,
} from "./relationship-types";

interface RawFactItem {
  entity?: string;
  scene?: string | null;
  source?: string;
  fact?: string;
  keywords?: string;
  verified_against?: string | null;
}

interface RawFactsFile {
  facts?: RawFactItem[];
  [key: string]: unknown;
}

/**
 * 纯运行时分类规则 (Runtime Classification Rules)
 * 仅用于按实体名称分配枚举类别，不包含任何角色事实、态度或禁忌文本。
 */
function classifyEntityCategory(entityName: string): RelationshipCategory {
  if (entityName === "开拓者") return "core_companion";
  if (["卡芙卡", "银狼", "刃", "艾利欧", "星核猎手"].includes(entityName)) return "stellaron_hunter";
  if (["帕姆", "三月七", "丹恒", "姬子", "瓦尔特"].includes(entityName)) return "astral_express";
  if (["知更鸟", "黄泉", "加拉赫", "黑天鹅", "翡翠", "花火", "米哈伊尔", "钟表匠"].includes(entityName)) return "penacony_contact";
  return "world_figure";
}

/**
 * 纯运行时实体别名映射 (Runtime Alias Mapping)
 */
function getRuntimeAliases(entityName: string): readonly string[] {
  switch (entityName) {
    case "开拓者":
      return ["主角", "无名客", "星", "穹"];
    case "卡芙卡":
      return ["卡妈"];
    case "银狼":
      return ["银狼酱", "骇客少女"];
    case "刃":
      return ["阿刃", "应星"];
    case "艾利欧":
      return ["命运的奴隶", "黑猫"];
    case "知更鸟":
      return ["银河歌手", "知更鸟小姐"];
    case "黄泉":
      return ["自灭者", "雷电忘川守芽衣"];
    case "加拉赫":
      return ["治安官加拉赫"];
    case "黑天鹅":
      return ["黑天鹅小姐", "忆者"];
    case "翡翠":
      return ["翡翠女士", "慈玉典押"];
    case "花火":
      return ["假面愚者"];
    case "帕姆":
      return ["列车长"];
    default:
      return [];
  }
}

/**
 * 纯运行时实体标准 ID 派生
 */
function getEntityId(entityName: string): string {
  const map: Record<string, string> = {
    开拓者: "trailblazer",
    卡芙卡: "kafka",
    银狼: "silver_wolf",
    刃: "blade",
    艾利欧: "elio",
    帕姆: "pom_pom",
    知更鸟: "robin",
    黄泉: "acheron",
    加拉赫: "gallagher",
    黑天鹅: "black_swan",
    翡翠: "jade",
    花火: "sparkle",
  };
  return map[entityName] || entityName.toLowerCase();
}

export class RelationshipLoader {
  private static cachedMap: Map<string, CharacterRelationship> | null = null;
  private static cachedRoot: string | null = null;

  /**
   * 解析 resources 根目录路径
   */
  static resolveResourcesRoot(customRoot?: string): string {
    if (customRoot) {
      if (fs.existsSync(path.join(customRoot, "resources"))) {
        return path.join(customRoot, "resources");
      }
      if (fs.existsSync(customRoot)) {
        return customRoot;
      }
    }

    const candidateRoots = [
      path.resolve(process.cwd(), "resources"),
      path.resolve(__dirname, "../../../resources"),
      path.resolve(__dirname, "../../resources"),
      path.resolve(__dirname, "../resources"),
    ];

    for (const r of candidateRoots) {
      if (fs.existsSync(r)) {
        return r;
      }
    }

    return path.resolve(process.cwd(), "resources");
  }

  /**
   * 从 Canonical Corpus (facts.yaml 与 curated_cards) 动态加载人际关系数据
   */
  static loadRelationships(customRoot?: string): Map<string, CharacterRelationship> {
    if (!customRoot && this.cachedMap) {
      return this.cachedMap;
    }

    const resourcesRoot = this.resolveResourcesRoot(customRoot);

    if (this.cachedMap && this.cachedRoot === resourcesRoot) {
      return this.cachedMap;
    }

    const map = new Map<string, CharacterRelationship>();
    const factsByEntity = new Map<string, { facts: string[]; sources: string[] }>();

    // 1. 读取 resources/knowledge/facts.yaml
    const factsFile = path.join(resourcesRoot, "knowledge", "facts.yaml");
    if (fs.existsSync(factsFile)) {
      try {
        const rawContent = fs.readFileSync(factsFile, "utf-8");
        const parsed = yaml.load(rawContent);

        let items: RawFactItem[] = [];
        if (Array.isArray(parsed)) {
          items = parsed;
        } else if (parsed && typeof parsed === "object") {
          const dict = parsed as RawFactsFile;
          if (Array.isArray(dict.facts)) {
            items = dict.facts;
          } else {
            for (const val of Object.values(dict)) {
              if (Array.isArray(val)) {
                items.push(...val);
              }
            }
          }
        }

        for (const item of items) {
          if (!item || !item.entity || !item.fact) continue;
          const entity = item.entity.trim();
          if (!factsByEntity.has(entity)) {
            factsByEntity.set(entity, { facts: [], sources: [] });
          }
          const entry = factsByEntity.get(entity)!;
          entry.facts.push(item.fact.trim());
          if (item.verified_against) {
            entry.sources.push(item.verified_against);
          } else {
            entry.sources.push("knowledge/facts.yaml");
          }
        }
      } catch (err) {
        console.warn(`[RelationshipLoader] Error reading facts.yaml from ${factsFile}:`, err);
      }
    }

    // 2. 读取 resources/knowledge/curated_cards/*.md
    const cardsDir = path.join(resourcesRoot, "knowledge", "curated_cards");
    if (fs.existsSync(cardsDir)) {
      try {
        const cardFiles = fs.readdirSync(cardsDir).filter((f) => f.endsWith(".md"));
        for (const file of cardFiles) {
          const cardPath = path.join(cardsDir, file);
          const content = fs.readFileSync(cardPath, "utf-8");
          const relativeSource = path.join("knowledge", "curated_cards", file).replace(/\\/g, "/");

          // 提取触发实体关键词
          for (const [entity] of factsByEntity.entries()) {
            if (content.includes(entity) || file.includes(entity)) {
              const entry = factsByEntity.get(entity)!;
              if (!entry.sources.includes(relativeSource)) {
                entry.sources.push(relativeSource);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[RelationshipLoader] Error scanning curated_cards from ${cardsDir}:`, err);
      }
    }

    // 3. 将从语料中解析到的实体组装为 CharacterRelationship (无任何硬编码 fallback)
    for (const [entityName, data] of factsByEntity.entries()) {
      const category = classifyEntityCategory(entityName);
      const id = getEntityId(entityName);
      const aliases = getRuntimeAliases(entityName);
      const canonicalFacts = data.facts;
      const evidenceSources = Array.from(new Set(data.sources));

      // 提取主观事实概述 (直接使用语料中第一条官方事实，绝不自造态度文字)
      const attitude = canonicalFacts.length > 0 ? canonicalFacts[0] : "";

      const relationship: CharacterRelationship = {
        id,
        name: entityName,
        aliases,
        category,
        addressing: `「${entityName}」`,
        attitude,
        canonicalFacts,
        boundaries: {
          canFabricateSharedPast: false,
          forbiddenTropes: ["严禁捏造未经官方语料记载的虚构互动或共同经历"],
        },
        evidenceSources,
      };

      map.set(id, relationship);
      map.set(entityName, relationship);
      for (const alias of aliases) {
        map.set(alias.toLowerCase(), relationship);
      }
    }

    this.cachedMap = map;
    this.cachedRoot = resourcesRoot;
    return map;
  }

  /**
   * 强制重新加载 (清空缓存)
   */
  static reloadRelationships(customRoot?: string): Map<string, CharacterRelationship> {
    this.cachedMap = null;
    this.cachedRoot = null;
    return this.loadRelationships(customRoot);
  }
}
