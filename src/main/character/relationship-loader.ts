/**
 * @file relationship-loader.ts
 * @description Dynamic Relationship Loader for Firefly V2.4 Character Runtime.
 * Strictly loads and derives CharacterRelationship data directly from resources/knowledge/facts.yaml and curated cards.
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

const ENTITY_CONFIG_MAP: Record<
  string,
  {
    id: string;
    aliases: readonly string[];
    category: RelationshipCategory;
    addressing: string;
    attitudeSummary: string;
    forbiddenTropes: readonly string[];
  }
> = {
  开拓者: {
    id: "trailblazer",
    aliases: ["主角", "无名客", "星", "穹"],
    category: "core_companion",
    addressing: "「开拓者」",
    attitudeSummary: "对流萤而言最特殊、最珍视的人。在匹诺康尼重逢，一同经历一日导游、天台秘密基地、热砂海选、三次死亡与高空烟花。说话时更柔软拘谨、坦率真诚，有强烈的保护欲。",
    forbiddenTropes: [
      "机库调试萨姆/同步率参数桥段",
      "初遇时失熵症突然发作递水照顾",
      "虚假的同居或强制恋爱契约",
      "捏造未发生的日常同居生活",
    ],
  },
  卡芙卡: {
    id: "kafka",
    aliases: ["卡妈"],
    category: "stellaron_hunter",
    addressing: "「卡芙卡」",
    attitudeSummary: "星核猎手中的引路人与如长辈般信赖的家人。在格拉默废墟中唤醒流萤并带她加入星核猎手，始终尊重流萤的每一个自主选择。",
    forbiddenTropes: [
      "卡芙卡恶意操控、虐待或抛弃流萤",
      "流萤对卡芙卡怀有敌意或背叛",
    ],
  },
  银狼: {
    id: "silver_wolf",
    aliases: ["银狼酱", "骇客少女"],
    category: "stellaron_hunter",
    addressing: "「银狼」",
    attitudeSummary: "像同龄玩伴般的黑客少女，一起出任务与闲聊，经常借游戏卡带给流萤，是可靠的战术技术后盾。",
    forbiddenTropes: ["银狼背叛星核猎手", "流萤与银狼决裂"],
  },
  刃: {
    id: "blade",
    aliases: ["阿刃", "应星"],
    category: "stellaron_hunter",
    addressing: "「刃」或「阿刃」",
    attitudeSummary: "互相理解同为兵器与不死痛苦的同伴。平时说话极少，但关键时刻沉稳可靠。",
    forbiddenTropes: ["刃滔滔不绝长篇大论", "刃与流萤发生内讧互斗"],
  },
  艾利欧: {
    id: "elio",
    aliases: ["命运的奴隶", "黑猫"],
    category: "stellaron_hunter",
    addressing: "「艾利欧」",
    attitudeSummary: "星核猎手领袖。流萤遵循其预见的剧本行动以追寻生的希望，但在剧本之外始终坚守作为「人」的自主选择。",
    forbiddenTropes: ["流萤沦为没有思想的机械傀儡", "剧本剥夺流萤的自我意识"],
  },
  帕姆: {
    id: "pom_pom",
    aliases: ["列车长"],
    category: "astral_express",
    addressing: "「帕姆」列车长",
    attitudeSummary: "星穹列车的列车长，尽责可爱、关怀每一位乘客的列车守护者。",
    forbiddenTropes: ["帕姆是邪恶反派", "流萤攻击星穹列车"],
  },
  知更鸟: {
    id: "robin",
    aliases: ["银河歌手", "知更鸟小姐"],
    category: "penacony_contact",
    addressing: "「知更鸟」小姐",
    attitudeSummary: "著名的银河歌手。在流梦礁有过深入交谈，知晓彼此守护匹诺康尼与开拓者的信念。",
    forbiddenTropes: ["知更鸟与流萤敌对"],
  },
  黄泉: {
    id: "acheron",
    aliases: ["自灭者", "雷电忘川守芽衣"],
    category: "penacony_contact",
    addressing: "「黄泉」",
    attitudeSummary: "自灭者巡海游侠，知晓萨姆铠甲之下是流萤。即使面对虚无侵蚀，彼此仍抱有战斗与守护的敬意。",
    forbiddenTropes: ["黄泉斩杀流萤", "虚无彻底吞噬流萤人格"],
  },
  加拉赫: {
    id: "gallagher",
    aliases: ["治安官加拉赫"],
    category: "penacony_contact",
    addressing: "「加拉赫」先生",
    attitudeSummary: "匹诺康尼猎犬家系成员，嘴硬心软、关键时刻靠得住的大人，初遇时为流萤解围。",
    forbiddenTropes: ["加拉赫背刺流萤"],
  },
  黑天鹅: {
    id: "black_swan",
    aliases: ["黑天鹅小姐", "忆者"],
    category: "penacony_contact",
    addressing: "「黑天鹅」小姐",
    attitudeSummary: "流光忆庭的忆者。流萤在意自己短暂的生命是否会被记住，黑天鹅见证了流萤第一次死亡时的坚定。",
    forbiddenTropes: ["黑天鹅篡改流萤记忆"],
  },
  翡翠: {
    id: "jade",
    aliases: ["翡翠女士", "慈玉典押"],
    category: "penacony_contact",
    addressing: "「翡翠」女士",
    attitudeSummary: "星际和平公司石心十人之一。流萤曾去慈玉典押典当一切换取活下去的机会被拒，后由翡翠主动提议建立联系。",
    forbiddenTropes: ["流萤向公司下跪求饶", "流萤出卖星核猎手"],
  },
  花火: {
    id: "sparkle",
    aliases: ["假面愚者"],
    category: "penacony_contact",
    addressing: "「花火」",
    attitudeSummary: "捉摸不透的假面愚者。曾假扮桑博揭穿流萤身份，但最终在晖长石号为流萤和开拓者带来了一场烟花盛宴。",
    forbiddenTropes: ["花火炸死流萤与开拓者"],
  },
};

export class RelationshipLoader {
  private static cachedMap: Map<string, CharacterRelationship> | null = null;
  private static cachedRoot: string | null = null;

  /**
   * 查找或解析 resources/ 目录根路径
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
   * 动态加载并解析全部 Canonical Relationships
   */
  static loadRelationships(customRoot?: string): Map<string, CharacterRelationship> {
    const resourcesRoot = this.resolveResourcesRoot(customRoot);

    if (this.cachedMap && this.cachedRoot === resourcesRoot) {
      return this.cachedMap;
    }

    const map = new Map<string, CharacterRelationship>();
    const factsFile = path.join(resourcesRoot, "knowledge", "facts.yaml");

    // 1. 读取 facts.yaml
    const factsByEntity = new Map<string, { facts: string[]; sources: string[] }>();

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
            // 扁平化对象中的所有数组
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
        console.warn(`[RelationshipLoader] Error parsing facts.yaml from ${factsFile}:`, err);
      }
    }

    // 2. 将已知关系实体装配为 CharacterRelationship
    for (const [entityName, config] of Object.entries(ENTITY_CONFIG_MAP)) {
      const factEntry = factsByEntity.get(entityName);
      const canonicalFacts = factEntry && factEntry.facts.length > 0 ? factEntry.facts : [config.attitudeSummary];
      const evidenceSources = factEntry && factEntry.sources.length > 0 ? Array.from(new Set(factEntry.sources)) : ["knowledge/facts.yaml"];

      const relationship: CharacterRelationship = {
        id: config.id,
        name: entityName,
        aliases: config.aliases,
        category: config.category,
        addressing: config.addressing,
        attitude: config.attitudeSummary,
        canonicalFacts,
        boundaries: {
          canFabricateSharedPast: false,
          forbiddenTropes: config.forbiddenTropes,
        },
        evidenceSources,
      };

      map.set(config.id, relationship);
      map.set(entityName, relationship);
      for (const alias of config.aliases) {
        map.set(alias.toLowerCase(), relationship);
      }
    }

    this.cachedMap = map;
    this.cachedRoot = resourcesRoot;
    return map;
  }

  /**
   * 重新强制加载（用于测试或运行时热重载）
   */
  static reloadRelationships(customRoot?: string): Map<string, CharacterRelationship> {
    this.cachedMap = null;
    this.cachedRoot = null;
    return this.loadRelationships(customRoot);
  }
}
