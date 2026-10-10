import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearRecentMemoryInjections, wasRecentlyInjectedMemory } from "../memory/recent-injected-memory"

const ragMock = vi.hoisted(() => ({
  searchMemory: vi.fn(),
  searchMemoryEntries: vi.fn(),
  updateWorldbookActivation: vi.fn(),
  getPermanentWorldbookEntries: vi.fn(),
  getActiveWorldbookEntries: vi.fn(),
  getCascadeWorldbookEntries: vi.fn(),
  INJECTION_HEADER: "HEADER",
  INJECTION_PREAMBLE: "PREAMBLE",
}))

const memoryStoreMock = vi.hoisted(() => ({
  getAllL2: vi.fn(),
  getL0: vi.fn(),
  getL1: vi.fn(),
}))

const entityGraphMock = vi.hoisted(() => ({
  search: vi.fn(),
}))

const l2DmaeManagerMock = vi.hoisted(() => ({
  getActiveL2ForPrompt: vi.fn(),
}))

vi.mock("../rag", () => ragMock)
vi.mock("../memory/memory-store", () => ({ memoryStore: memoryStoreMock }))
vi.mock("../memory/entity-graph", () => ({ entityGraph: entityGraphMock }))
vi.mock("../memory/l2-dmae-manager", () => ({ l2DmaeManager: l2DmaeManagerMock }))
vi.mock("./tools/registry/tool-registry", () => ({ toolRegistry: { getEnabledTools: vi.fn(() => []), getEnabledToolsForMode: vi.fn(() => []) } }))

describe("buildMemoryInjection", () => {
  beforeEach(() => {
    clearRecentMemoryInjections()
    ragMock.searchMemory.mockReset()
    ragMock.searchMemory.mockResolvedValue([])
    memoryStoreMock.getAllL2.mockReset()
    memoryStoreMock.getAllL2.mockResolvedValue([])
    l2DmaeManagerMock.getActiveL2ForPrompt.mockReset()
    l2DmaeManagerMock.getActiveL2ForPrompt.mockResolvedValue([])
    entityGraphMock.search.mockReset()
    entityGraphMock.search.mockReturnValue("")
  })

  it("records injected user memory l2 ids from DMAE active L2", async () => {
    memoryStoreMock.getAllL2.mockResolvedValue([
      { id: "l2_run", content: "用户喜欢跑步", triggerText: "我喜欢跑步" },
    ])
    l2DmaeManagerMock.getActiveL2ForPrompt.mockResolvedValue([
      { id: "l2_run", content: "用户喜欢跑步", triggerText: "我喜欢跑步" },
    ])
    const { buildMemoryInjection } = await import("./index")

    const context = await buildMemoryInjection("跑步")

    expect(context).toContain("用户喜欢跑步")
    expect(wasRecentlyInjectedMemory("l2_run")).toBe(true)
    expect(l2DmaeManagerMock.getActiveL2ForPrompt).toHaveBeenCalledWith(expect.any(Array), 4)
  })

  it("appends sourceQuote as 原文 suffix when L2 has one, falls back to triggerText otherwise", async () => {
    memoryStoreMock.getAllL2.mockResolvedValue([
      { id: "l2_run", content: "用户喜欢跑步", triggerText: "我喜欢跑步", sourceQuote: "我每周都去跑步，雷打不动" },
      { id: "l2_react", content: "用户用 React 做前端", triggerText: "我用 React 做前端" },
    ])
    l2DmaeManagerMock.getActiveL2ForPrompt.mockResolvedValue([
      { id: "l2_run", content: "用户喜欢跑步", triggerText: "我喜欢跑步", sourceQuote: "我每周都去跑步，雷打不动" },
      { id: "l2_react", content: "用户用 React 做前端", triggerText: "我用 React 做前端" },
    ])
    const { buildMemoryInjection } = await import("./index")

    const context = await buildMemoryInjection("跑步 React")

    // 有 sourceQuote → 用 sourceQuote 原文
    expect(context).toContain("· 用户喜欢跑步（原文：我每周都去跑步，雷打不动）")
    // 无 sourceQuote → 回退到 triggerText
    expect(context).toContain("· 用户用 React 做前端（原文：我用 React 做前端）")
  })

  it("returns empty when no active L2", async () => {
    memoryStoreMock.getAllL2.mockResolvedValue([
      { id: "l2_run", content: "用户喜欢跑步", triggerText: "我喜欢跑步" },
    ])
    l2DmaeManagerMock.getActiveL2ForPrompt.mockResolvedValue([])
    const { buildMemoryInjection } = await import("./index")

    const context = await buildMemoryInjection("跑步")

    expect(context).toBe("")
    expect(wasRecentlyInjectedMemory("l2_run")).toBe(false)
  })
})

describe("buildAlwaysOnContext", () => {
  beforeEach(() => {
    ragMock.updateWorldbookActivation.mockReset()
    ragMock.getPermanentWorldbookEntries.mockReset()
    ragMock.getActiveWorldbookEntries.mockReset()
    ragMock.getCascadeWorldbookEntries.mockReset()
    ragMock.getPermanentWorldbookEntries.mockReturnValue([])
    ragMock.getActiveWorldbookEntries.mockReturnValue([])
    ragMock.getCascadeWorldbookEntries.mockReturnValue([])
    memoryStoreMock.getL0.mockReset()
    memoryStoreMock.getL1.mockReset()
    memoryStoreMock.getL0.mockResolvedValue({})
    memoryStoreMock.getL1.mockResolvedValue({})
  })

  it("does not let document modelContext trigger worldbook activation", async () => {
    const { buildAlwaysOnContext } = await import("./index")

    await buildAlwaysOnContext(
      "请总结这个文档\n\n【文档内容】\n文档里写着 迷迷 和 PHILIA093。",
      [],
    )

    expect(ragMock.updateWorldbookActivation).toHaveBeenCalledWith("请总结这个文档", "")
  })

  it("keeps legacy profile injection available to callers that explicitly use the legacy builder", async () => {
    ragMock.getPermanentWorldbookEntries.mockReturnValue(["常驻世界书"])
    memoryStoreMock.getL0.mockResolvedValue({ preferredName: "旧画像称呼" })
    memoryStoreMock.getL1.mockResolvedValue({ currentProject: "旧项目" })
    const { buildAlwaysOnContext } = await import("./index")

    const context = await buildAlwaysOnContext("你好", [])

    expect(context).toBe("【常驻背景】\n常驻世界书\n\n[用户画像]\n称呼：旧画像称呼\n\n[近期状态]\n当前项目：旧项目")
    expect(memoryStoreMock.getL0).toHaveBeenCalledTimes(1)
    expect(memoryStoreMock.getL1).toHaveBeenCalledTimes(1)
  })

  it("builds worldbook background without reading legacy personal profiles", async () => {
    ragMock.getPermanentWorldbookEntries.mockReturnValue(["常驻世界书"])
    ragMock.getActiveWorldbookEntries.mockReturnValue(["当轮激活世界书"])
    ragMock.getCascadeWorldbookEntries.mockReturnValue(["级联世界书"])
    memoryStoreMock.getL0.mockResolvedValue({ preferredName: "不得读取的旧画像" })
    memoryStoreMock.getL1.mockResolvedValue({ currentProject: "不得读取的旧项目" })
    memoryStoreMock.getAllL2.mockClear()
    entityGraphMock.search.mockClear()
    l2DmaeManagerMock.getActiveL2ForPrompt.mockClear()
    const { buildWorldbookContext } = await import("./index")

    const context = await buildWorldbookContext(
      "世界书主题\n\n【文档内容】\n不应触发的附件内容",
      [{ role: "assistant", content: "上轮回复" }, { role: "user", content: "世界书主题" }],
    )

    expect(context).toBe("【常驻背景】\n常驻世界书\n\nHEADER\nPREAMBLE\n\n当轮激活世界书\n\n级联世界书")
    expect(ragMock.updateWorldbookActivation).toHaveBeenCalledWith("世界书主题", "上轮回复")
    expect(memoryStoreMock.getL0).not.toHaveBeenCalled()
    expect(memoryStoreMock.getL1).not.toHaveBeenCalled()
    expect(memoryStoreMock.getAllL2).not.toHaveBeenCalled()
    expect(entityGraphMock.search).not.toHaveBeenCalled()
    expect(l2DmaeManagerMock.getActiveL2ForPrompt).not.toHaveBeenCalled()
  })

  it("does not fall back to personal profiles when worldbook loading fails", async () => {
    ragMock.getPermanentWorldbookEntries.mockImplementation(() => { throw new Error("worldbook fixture failure") })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const { buildWorldbookContext } = await import("./index")

      expect(await buildWorldbookContext("你好", [])).toBe("")
      expect(memoryStoreMock.getL0).not.toHaveBeenCalled()
      expect(memoryStoreMock.getL1).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith("[Orchestrator] worldbook dmae failed:", expect.any(Error))
    } finally {
      warn.mockRestore()
    }
  })
})
