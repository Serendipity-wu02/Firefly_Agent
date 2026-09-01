/**
 * @file persona-loader.ts
 * @description Loads, parses, and validates resources/persona/firefly.yaml as the Single Source of Truth.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { PersonaProfile } from "./persona-types";

export class PersonaLoader {
  private static cachedProfile: PersonaProfile | null = null;
  private static resolvedYamlPath: string | null = null;

  /**
   * 自动探测并解析 resources/persona/firefly.yaml 物理绝对路径
   */
  static resolveYamlPath(customRoot?: string): string {
    if (this.resolvedYamlPath && !customRoot) {
      return this.resolvedYamlPath;
    }

    const candidateRoots: string[] = [];

    if (customRoot) {
      candidateRoots.push(customRoot);
    }

    // 1. Electron app.getAppPath() (if available)
    try {
      // Dynamic require electron to avoid crashing in pure Node environments
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require("electron");
      if (app && typeof app.getAppPath === "function") {
        candidateRoots.push(app.getAppPath());
      }
    } catch {
      // Not in Electron runtime
    }

    // 2. process.cwd()
    candidateRoots.push(process.cwd());

    // 3. __dirname relative path
    candidateRoots.push(path.resolve(__dirname, "../../../")); // from src/main/character or dist/main/main/character
    candidateRoots.push(path.resolve(__dirname, "../../../../")); // fallback
    candidateRoots.push(path.resolve(__dirname, "../../"));

    for (const root of candidateRoots) {
      const canonicalP = path.join(root, "resources", "persona", "firefly.yaml");
      if (fs.existsSync(canonicalP)) {
        this.resolvedYamlPath = canonicalP;
        return canonicalP;
      }
    }

    // Fallback default
    const fallbackCanonical = path.join(process.cwd(), "resources", "persona", "firefly.yaml");
    this.resolvedYamlPath = fallbackCanonical;
    return fallbackCanonical;
  }

  /**
   * 获取流萤人设只读单例（自动从 firefly.yaml 加载）
   */
  static getProfile(customRoot?: string): PersonaProfile {
    if (this.cachedProfile && !customRoot) {
      return this.cachedProfile;
    }

    const yamlPath = this.resolveYamlPath(customRoot);
    if (!fs.existsSync(yamlPath)) {
      throw new Error(`[PersonaLoader] Canonical persona file not found at: ${yamlPath}`);
    }

    const rawContent = fs.readFileSync(yamlPath, "utf-8");
    const rawData = yaml.load(rawContent) as Record<string, any>;

    if (!rawData || typeof rawData !== "object") {
      throw new Error(`[PersonaLoader] Invalid YAML structure in: ${yamlPath}`);
    }

    this.cachedProfile = this.mapRawToProfile(rawData);
    return this.cachedProfile;
  }

  /**
   * 强制重新从磁盘加载 firefly.yaml（用于热重载或测试重置）
   */
  static reloadProfile(customRoot?: string): PersonaProfile {
    this.cachedProfile = null;
    this.resolvedYamlPath = null;
    return this.getProfile(customRoot);
  }

  /**
   * 将原始 YAML 数据严格映射为强类型 PersonaProfile
   */
  private static mapRawToProfile(raw: Record<string, any>): PersonaProfile {
    const rawChar = raw.character || {};
    const rawIdent = raw.identity || {};
    const rawVocab = raw.vocabulary || {};
    const rawDaily = raw.daily_mode || {};
    const rawWork = raw.work_mode || {};
    const rawAuthorsNote = raw.authors_note || {};
    const rawTrans = raw.transition_lines || {};
    const rawGuard = raw.guardrails || {};
    const rawCap = raw.capabilities || {};
    const rawMem = raw.memory_rules || {};
    const rawProactive = raw.proactive_chat || {};

    return {
      character: {
        name: String(rawChar.name || "").trim(),
        nameEn: String(rawChar.name_en || "").trim(),
        source: String(rawChar.source || "").trim(),
        identity: String(rawChar.identity || "").trim(),
      },
      identity: {
        background: String(rawIdent.background || "").trim(),
        personality: Array.isArray(rawIdent.personality) ? rawIdent.personality.map(String) : [],
        likes: Array.isArray(rawIdent.likes) ? rawIdent.likes.map(String) : [],
        fears: Array.isArray(rawIdent.fears) ? rawIdent.fears.map(String) : [],
      },
      vocabulary: {
        preferred: Array.isArray(rawVocab.preferred) ? rawVocab.preferred.map(String) : [],
        forbidden: Array.isArray(rawVocab.forbidden) ? rawVocab.forbidden.map(String) : [],
        speakingHabits: Array.isArray(rawVocab.speaking_habits)
          ? rawVocab.speaking_habits.map(String)
          : [],
        outputRules: Array.isArray(rawVocab.output_rules) ? rawVocab.output_rules.map(String) : [],
      },
      dailyMode: {
        theme: {
          primaryColor: rawDaily.theme?.primary_color || "#E6F4EA",
          accentColor: rawDaily.theme?.accent_color || "#FFF7E6",
          background: rawDaily.theme?.background || "glassmorphism",
          bubbleStyle: rawDaily.theme?.bubble_style || "rounded",
          particleEffect: rawDaily.theme?.particle_effect || "firefly",
        },
        tone: {
          description: rawDaily.tone?.description || "温和、阳光、真诚",
          characteristics: Array.isArray(rawDaily.tone?.characteristics)
            ? rawDaily.tone.characteristics.map(String)
            : [],
          example: rawDaily.tone?.example || "",
        },
        emotionRules:
          rawDaily.emotion_rules && typeof rawDaily.emotion_rules === "object"
            ? Object.fromEntries(
                Object.entries(rawDaily.emotion_rules).map(([k, v]) => [k, String(v)]),
              )
            : {},
        proactiveCare: rawDaily.proactive_care !== false,
        hudVisible: !!rawDaily.hud_visible,
        thinkVisible: !!rawDaily.think_visible,
      },
      workMode: {
        theme: {
          primaryColor: rawWork.theme?.primary_color || "#1a3a2a",
          accentColor: rawWork.theme?.accent_color || "#00ff88",
          background: rawWork.theme?.background || "hud_grid",
          bubbleStyle: rawWork.theme?.bubble_style || "angular",
          font: rawWork.theme?.font || "monospace",
          transitionEffect: rawWork.theme?.transition_effect || "glitch",
        },
        tone: {
          description: rawWork.tone?.description || "冷静、果断、高效",
          characteristics: Array.isArray(rawWork.tone?.characteristics)
            ? rawWork.tone.characteristics.map(String)
            : [],
        },
        subTones: {
          execution: {
            name: rawWork.sub_tones?.execution?.name || "高能执行态",
            trigger: rawWork.sub_tones?.execution?.trigger || "",
            tone: rawWork.sub_tones?.execution?.tone || "",
            example: rawWork.sub_tones?.execution?.example || "",
          },
          warning: {
            name: rawWork.sub_tones?.warning?.name || "护盾警告态",
            trigger: rawWork.sub_tones?.warning?.trigger || "",
            tone: rawWork.sub_tones?.warning?.tone || "",
            example: rawWork.sub_tones?.warning?.example || "",
          },
          completion: {
            name: rawWork.sub_tones?.completion?.name || "战斗结算态",
            trigger: rawWork.sub_tones?.completion?.trigger || "",
            tone: rawWork.sub_tones?.completion?.tone || "",
            example: rawWork.sub_tones?.completion?.example || "",
          },
        },
        proactiveCare: !!rawWork.proactive_care,
        hudVisible: rawWork.hud_visible !== false,
        thinkVisible: rawWork.think_visible !== false,
      },
      authorsNote: {
        daily: String(rawAuthorsNote.daily || "").trim(),
        dailyUnlocked: String(rawAuthorsNote.daily_unlocked || "").trim(),
        work: String(rawAuthorsNote.work || "").trim(),
      },
      transitionLines: {
        toWork: String(rawTrans.to_work || "").trim(),
        toDaily: String(rawTrans.to_daily || "").trim(),
      },
      guardrails: {
        antiOoc: Array.isArray(rawGuard.anti_ooc) ? rawGuard.anti_ooc.map(String) : [],
        roleBoundary: Array.isArray(rawGuard.role_boundary)
          ? rawGuard.role_boundary.map(String)
          : [],
        decisionPriority: Array.isArray(rawGuard.decision_priority)
          ? rawGuard.decision_priority.map(String)
          : [],
      },
      capabilities: {
        selfIntro: String(rawCap.self_intro || "").trim(),
        rules: Array.isArray(rawCap.rules) ? rawCap.rules.map(String) : [],
      },
      memoryRules: {
        rules: Array.isArray(rawMem.rules) ? rawMem.rules.map(String) : [],
        confidenceThreshold:
          typeof rawMem.confidence_threshold === "number" ? rawMem.confidence_threshold : 0.85,
        namespaces:
          rawMem.namespaces && typeof rawMem.namespaces === "object"
            ? Object.fromEntries(Object.entries(rawMem.namespaces).map(([k, v]) => [k, String(v)]))
            : {},
      },
      proactiveChat: {
        emotionDetect: String(rawProactive.emotion_detect || "").trim(),
        concernFollowUp: String(rawProactive.concern_follow_up || "").trim(),
        idleCasual: String(rawProactive.idle_casual || "").trim(),
      },
    };
  }
}
