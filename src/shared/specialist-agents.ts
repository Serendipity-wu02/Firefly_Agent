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
  { id: "strategy-planning", nickname: "艾利欧", role: "战略与规划", description: "目标优先级、任务拆解、依赖与执行计划；协调安排由卡芙卡汇总后交主代理决定", modelProfile: "reasoning", supportedModes: ["work", "code"] },
  { id: "architecture", nickname: "姬子", role: "架构与集成", description: "规格、模块边界、API 与系统集成；将计划转成一致的技术契约", modelProfile: "reasoning", supportedModes: ["work", "code"] },
  { id: "implementation", nickname: "刃", role: "代码实现", description: "代码实现、重构、修复与 TDD", modelProfile: "coding", supportedModes: ["work", "code"] },
  { id: "research", nickname: "大黑塔", role: "技术研究", description: "候选方案探索、源码资料研究、假设质疑与实验验证；研究兴趣不替代任务验收标准", modelProfile: "research", supportedModes: ["work", "code"] },
  { id: "knowledge", nickname: "丹恒", role: "知识管理", description: "源码事实、代码库理解、Memory/RAG 与知识整理", modelProfile: "research", supportedModes: ["work", "code"] },
  { id: "review", nickname: "瓦尔特", role: "质量审查", description: "Code Review、回归质量、可靠性和完成证据核验；独立复核实现结果", modelProfile: "reasoning", supportedModes: ["work", "code"] },
  { id: "security-governance", nickname: "星期日", role: "安全治理", description: "安全审查、权限规则、风险与治理边界验收；不能自行扩大任何角色权限", modelProfile: "reasoning", supportedModes: ["work", "code"] },
  { id: "ui-visual", nickname: "三月七", role: "界面与视觉", description: "React、UI/UX、图表、视觉与办公主题；与知更鸟协作统一文档表现", modelProfile: "vision", supportedModes: ["work", "code"] },
  { id: "documents-data", nickname: "知更鸟", role: "文档与数据", description: "DOCX/PDF/PPTX/XLSX、报告、表格与数据产物", modelProfile: "document", supportedModes: ["work"] },
  { id: "tooling-skills", nickname: "银狼", role: "工具、Skills 与技术排障", description: "Skills、插件、工具链、自动化与系统化技术根因调查；不绕过授权和安全边界", modelProfile: "coding", supportedModes: ["work", "code"] },
  { id: "ops-release", nickname: "帕姆", role: "工程运维", description: "Git、worktree、CI、构建、打包、发布检查与费用报表事务；只处理已授权资源", modelProfile: "fast", supportedModes: ["work", "code"] },
  { id: "coordination-debug", nickname: "卡芙卡", role: "执行协调", description: "并行分工、依赖排序、故障复现安排与升级交接建议；技术根因交银狼、实际委派交主代理", modelProfile: "reasoning", supportedModes: ["work", "code"] },
];
