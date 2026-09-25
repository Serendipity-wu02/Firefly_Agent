import type { ConversationMode } from "../../shared/chat-types";
import { loadPromptFile } from "../prompts/prompt-loader";
import { buildTaskCompanionPrompt } from "../tasks/task-character-pool";

export type PromptLoader = (filename: string) => string;

const MODE_FILES: Record<ConversationMode, readonly string[]> = {
  chat: ["chat_system.md", "chat_identity.md", "soul.md", "canon_quotes.md"],
  work: ["work_system.md", "work_identity.md", "soul.md", "work_remark.md", "canon_quotes_lite.md"],
  learn: ["learn_system.md", "learn_identity.md", "soul.md", "canon_quotes.md"],
  code: ["code_system.md", "code_identity.md", "soul.md", "code_remark.md", "canon_quotes_lite.md"],
};

export function buildModePrompt(mode: ConversationMode, load: PromptLoader = loadPromptFile): string {
  const taskCompanions = mode === "work" || mode === "code"
    ? buildTaskCompanionPrompt()
    : "";
  return [...MODE_FILES[mode].map(load), taskCompanions].filter(Boolean).join("\n\n---\n\n");
}
