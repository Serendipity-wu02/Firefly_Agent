import type { AgentRoutingView, AgentRoutingUpdate } from "../../../shared/specialist-agents";

interface RoutingBridge {
  getAgentRouting?: () => Promise<AgentRoutingView>;
  updateAgentRouting?: (input: AgentRoutingUpdate) => Promise<AgentRoutingView>;
}

export async function loadAgentRoutingPanel(root: HTMLElement, bridge: RoutingBridge): Promise<void> {
  root.textContent = "正在读取 Agent Routing…";
  const render = (view: AgentRoutingView) => {
    root.replaceChildren();
    const notice = document.createElement("p");
    notice.textContent = "继承角色默认路由不等于使用主聊天模型；路由未配置时拒绝执行。改变已绑定的模型档案 ID 不会迁移已有 Agent 会话，请使用新对话。编辑同一档案的模型或服务会影响后续请求。";
    root.append(notice);
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    root.append(status);
    const addRow = (kind: AgentRoutingUpdate["kind"], id: string, title: string, selected: string | undefined, state: string) => {
      const label = document.createElement("label");
      label.className = "field field--full";
      const text = document.createElement("span");
      text.textContent = `${title} — ${state}`;
      const select = document.createElement("select");
      select.dataset.routingKind = kind;
      select.dataset.routingId = id;
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = kind === "agent" ? "继承角色默认路由" : "未配置";
      select.append(empty);
      for (const profile of view.profiles) {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.label;
        select.append(option);
      }
      if (selected && !view.profiles.some(profile => profile.id === selected)) {
        const stale = document.createElement("option");
        stale.value = selected;
        stale.textContent = `已不存在的档案：${selected}`;
        select.append(stale);
      }
      select.value = selected ?? "";
      select.addEventListener("change", async () => {
        const controls = [...root.querySelectorAll("select")];
        controls.forEach(control => { control.disabled = true; });
        status.textContent = "正在保存…";
        try {
          if (!bridge.updateAgentRouting) throw new Error("Agent Routing 保存接口不可用");
          const saved = await bridge.updateAgentRouting({ kind, id, profileId: select.value || null });
          render(saved);
        } catch (error) {
          status.textContent = `保存失败：${error instanceof Error ? error.message : String(error)}`;
          controls.forEach(control => { control.disabled = false; });
        }
      });
      label.append(text, select);
      root.append(label);
    };
    for (const route of view.routes) addRow("route", route.id, `默认路由 ${route.id}`, route.profileId, route.profileId ? "已绑定" : "未配置");
    for (const agent of view.agents) addRow("agent", agent.id,
      `${agent.nickname} · ${agent.role} · ${agent.modelProfile}`, agent.overrideProfileId,
      agent.error ?? `${agent.overrideProfileId ? "独立绑定" : "继承"}：${agent.effectiveProfileId ?? "未配置"}`);
  };
  try {
    if (!bridge.getAgentRouting) throw new Error("Agent Routing 读取接口不可用");
    render(await bridge.getAgentRouting());
  } catch (error) {
    root.textContent = `Agent Routing 加载失败：${error instanceof Error ? error.message : String(error)}`;
  }
}
