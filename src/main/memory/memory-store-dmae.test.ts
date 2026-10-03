import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const electronMock = vi.hoisted(() => ({
  userDataDir: "",
}))

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataDir,
  },
}))

describe("memoryStore DMAE", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-store-dmae-"))
    vi.resetModules()
  })

  it("addL2Memory generates keywords and initializes L2DmaeState", async () => {
    const { memoryStore } = await import("./memory-store")
    const memory = await memoryStore.addL2Memory({
      content: "我每天早上都喝咖啡",
      triggerText: "我每天早上都喝咖啡",
      sourceConversationId: "test",
      isPinned: false,
    })

    expect(memory.keywords?.length).toBeGreaterThan(0)
    expect(memory.keywords).toContain("咖")

    const state = await memoryStore.getL2DmaeState(memory.id)
    expect(state).toBeDefined()
    expect(state!.activation).toBe(0)
    expect(state!.state).toBe("archived")

    const persisted = JSON.parse(
      fs.readFileSync(path.join(electronMock.userDataDir, "memory.json"), "utf8"),
    )
    expect(persisted.l2[0].keywords).toEqual(memory.keywords)
    expect(persisted.l2DmaeStates).toHaveLength(1)
    expect(persisted.l2DmaeStates[0].l2Id).toBe(memory.id)
  })

  it("updateL2DmaeState persists changes", async () => {
    const { memoryStore } = await import("./memory-store")
    const memory = await memoryStore.addL2Memory({
      content: "周末去爬山",
      triggerText: "周末去爬山",
      sourceConversationId: "test",
      isPinned: false,
    })

    await memoryStore.updateL2DmaeState(memory.id, {
      activation: 80,
      intrinsicValue: 36,
      userSilence: 2,
      modelSilence: 1,
      state: "active",
    })

    const state = await memoryStore.getL2DmaeState(memory.id)
    expect(state!.activation).toBe(80)
    expect(state!.intrinsicValue).toBe(36)
    expect(state!.state).toBe("active")
  })

})
