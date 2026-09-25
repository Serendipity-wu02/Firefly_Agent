import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { LIVE2D_ACTIONS, findAction } from "../shared/live2d-actions";

const root = path.resolve(__dirname, "..", "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("Firefly character migration", () => {
  it("loads the copied Firefly model and every referenced asset exists", () => {
    const modelDir = path.join(root, "src", "renderer", "public", "models", "firefly");
    const manifestPath = path.join(modelDir, "Firefly.model3.json");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      FileReferences: {
        Moc: string;
        Physics: string;
        Textures: string[];
        Motions: Record<string, Array<{ File: string }>>;
        Expressions: Array<{ File: string }>;
      };
    };
    const referenced = [
      manifest.FileReferences.Moc,
      manifest.FileReferences.Physics,
      ...manifest.FileReferences.Textures,
      ...Object.values(manifest.FileReferences.Motions).flat().map((entry) => entry.File),
      ...manifest.FileReferences.Expressions.map((entry) => entry.File),
    ];
    for (const relativePath of referenced) {
      expect(fs.existsSync(path.join(modelDir, relativePath)), relativePath).toBe(true);
    }
    expect(read("src/renderer/main.ts")).toContain('models/firefly/Firefly.model3.json');
  });

  it("exposes only targets that exist in the Firefly manifest", () => {
    expect(findAction("打招呼")?.target).toEqual({ kind: "motion", group: "Tap", motionName: "1" });
    expect(findAction("开心")?.target).toEqual({ kind: "expression", name: "expression4" });
    expect(LIVE2D_ACTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it("uses Firefly identity in every effective mode prompt and the dynamic worldbook", () => {
    const promptFiles = [
      "prompts/soul.md",
      "prompts/chat_system.md",
      "prompts/work_system.md",
      "prompts/learn_system.md",
      "prompts/code_system.md",
      "prompts/cyrene_harness.md",
      "prompts/chat_identity.md",
      "prompts/work_identity.md",
      "prompts/code_identity.md",
      "prompts/learn_identity.md",
      "prompts/plan_identity.md",
      "prompts/canon_quotes.md",
      "prompts/canon_quotes_lite.md",
      "prompts/phone_identity.md",
      "prompts/phone_system.md",
    ];
    for (const file of promptFiles) {
      const content = read(file);
      expect(content, file).toContain("流萤");
      expect(content, file).not.toMatch(/昔涟|Cyrene/);
    }
    expect(read("prompts/soul.md")).toMatch(/^# 流萤 · 人格核心/);
    expect(read("prompts/soul.md")).not.toMatch(/^character:|^daily_mode:|^work_mode:/m);
    expect(read("prompts/soul.md")).toContain("## 对话示例");
    expect(read("prompts/soul.md")).toContain("共同经历过的见面、相处和约定，只能依据当前对话或明确提供的有效记忆");
    expect(read("prompts/phone_style.md")).not.toMatch(/昔涟|Cyrene/);
    for (const style of ["01_default.md", "02_lively.md", "03_healing.md", "04_focused.md", "05_sweet.md"]) {
      expect(read(`prompts/styles/${style}`), style).not.toMatch(/昔涟|Cyrene|人家|♪/);
    }

    const worldbookDir = path.join(root, "prompts", "worldbook");
    for (const file of fs.readdirSync(worldbookDir).filter((name) => name.endsWith(".md"))) {
      const content = fs.readFileSync(path.join(worldbookDir, file), "utf8");
      expect(content, file).not.toMatch(/昔涟|Cyrene|翁法罗斯|德谬歌/);
    }
  });

  it("uses the Firefly avatar and visible primary branding", () => {
    expect(fs.existsSync(path.join(root, "src", "renderer", "public", "avatars", "firefly-avatar.png"))).toBe(true);
    expect(read("src/renderer/react/features/chat/components/ChatMessageList.tsx"))
      .toContain('resolveAsset("avatars/firefly-avatar.png")');
    expect(read("src/renderer/react/i18n/zh-CN.json")).not.toMatch(/昔涟/);
    expect(read("src/renderer/react/index.html")).toContain("流萤");
  });

  it("does not render old character artwork in the active chat and settings UI", () => {
    const activeFiles = [
      "src/renderer/react/features/chat/components/ChatComposer.tsx",
      "src/renderer/react/features/chat/components/ChatMessageList.tsx",
      "src/renderer/react/features/chat/components/ChatWorkspaceNotices.tsx",
      "src/renderer/react/features/chat/components/ContextUsageRing.tsx",
      "src/renderer/react/features/chat/components/InteractionPanel.tsx",
      "src/renderer/react/features/chat/components/ModelModePanel.tsx",
      "src/renderer/react/features/chat/components/PluginModePanel.tsx",
      "src/renderer/react/features/chat/components/StatusFloat.tsx",
      "src/renderer/react/features/chat/components/StyleControl.tsx",
      "src/renderer/react/features/chat/components/ToolModePanel.tsx",
      "src/renderer/react/components/ui/ModelModeButton.tsx",
      "src/renderer/react/components/ui/MomentsModeButton.tsx",
      "src/renderer/react/components/ui/NewTaskButton.tsx",
      "src/renderer/react/components/ui/PluginModeButton.tsx",
      "src/renderer/react/components/ui/ToolModeButton.tsx",
      "src/renderer/settings/index.html",
      "src/renderer/settings/settings.ts",
      "src/renderer/toast/toast.ts",
    ];
    for (const file of activeFiles) {
      expect(read(file), file).not.toMatch(/status-moods\/|status-float\/|assets\/welcome\/|assets\/(?:model|new|plugin|tools|moments|compressing)\.png|icons\/(?:sticker-picker|mimi)\.png|toast-avatar\.png|cyrene-avatar\.png/);
    }
  });
});
