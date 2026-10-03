export interface SpecialistDefinition {
  id: string;
  nickname: string;
  role: string;
  description: string;
  modelProfile: string;
  supportedModes: readonly ("work" | "code")[];
}

export interface AgentRoutingView {
  profiles: Array<{ id: string; label: string }>;
  routes: Array<{ id: string; profileId?: string }>;
  agents: Array<SpecialistDefinition & { overrideProfileId?: string; effectiveProfileId?: string; error?: string }>;
}

export interface AgentRoutingUpdate {
  kind: "agent" | "route";
  id: string;
  profileId: string | null;
}

export const SPECIALIST_AGENTS: readonly SpecialistDefinition[] = [
  { id: "strategy-planning", nickname: "艾利欧", role: "战略与规划", description: "战略、规划、任务拆解；为主代理提出跨 Agent 编排建议", modelProfile: "reasoning", supportedModes: ["work", "code"] },
  { id: "architecture", nickname: "姬子", role: "架构与集成", description: "架构、模块边界、API 与系统集成", modelProfile: "reasoning", supportedModes: ["work", "code"] },
  { id: "implementation", nickname: "刃", role: "代码实现", description: "代码实现、重构、修复与 TDD", modelProfile: "coding", supportedModes: ["work", "code"] },
  { id: "research", nickname: "大黑塔", role: "技术研究", description: "深度技术研究、外部资料与实验验证", modelProfile: "research", supportedModes: ["work", "code"] },
  { id: "knowledge", nickname: "丹恒", role: "知识管理", description: "源码事实、代码库理解、Memory/RAG 与知识整理", modelProfile: "research", supportedModes: ["work", "code"] },
  { id: "review", nickname: "瓦尔特", role: "质量审查", description: "Code Review、可靠性与质量把关", modelProfile: "reasoning", supportedModes: ["work", "code"] },
  { id: "security-governance", nickname: "星期日", role: "安全治理", description: "安全、规则、治理与最终验收", modelProfile: "reasoning", supportedModes: ["work", "code"] },
  { id: "ui-visual", nickname: "三月七", role: "界面与视觉", description: "React、UI/UX、视觉、图表与表现层", modelProfile: "vision", supportedModes: ["work", "code"] },
  { id: "documents-data", nickname: "知更鸟", role: "文档与数据", description: "DOCX/PDF/PPTX/XLSX、报告、表格与数据产物", modelProfile: "document", supportedModes: ["work"] },
  { id: "tooling-skills", nickname: "银狼", role: "工具与 Skills", description: "Skills、插件、工具链与自动化", modelProfile: "coding", supportedModes: ["work", "code"] },
  { id: "ops-release", nickname: "帕姆", role: "工程运维", description: "Git、worktree、CI、构建、打包与发布准备", modelProfile: "fast", supportedModes: ["work", "code"] },
  { id: "coordination-debug", nickname: "卡芙卡", role: "协调与调试", description: "Runtime 调试、复杂故障与跨 Agent 执行协调建议", modelProfile: "reasoning", supportedModes: ["work", "code"] },
];
