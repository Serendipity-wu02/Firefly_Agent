export interface AgentProfile {
  id: string;
  nickname: string;
  role: string;
  systemPrompt: string;
  modelProfile: string;
  allowedTools: readonly string[];
  allowedSkills: readonly string[];
  supportedModes: readonly ("work" | "code")[];
  persistent: true;
  timeoutMs: number;
  concurrency: 1;
}
