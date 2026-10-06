import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ create: vi.fn((options: any) => options), dialog: vi.fn() }));
vi.mock("electron", () => ({ session: {}, dialog: { showMessageBox: state.dialog } }));
vi.mock("./browser-service", () => ({ createBrowserService: state.create }));
vi.mock("./electron-browser-guest", () => ({ createElectronBrowserGuest: vi.fn() }));
import { createElectronBrowserService } from "./electron-browser-service";
import { BROWSER_PUBLIC_SCOPE } from "../../shared/manual-browser";
describe("native bounded browser consent", () => {
  it("enables only a consent path and asks the trusted host about exact hosts/actions with deny selected", async () => {
    const service = createElectronBrowserService({ profile: {} as any }) as any;
    expect(service.permissionPolicy).toEqual(BROWSER_PUBLIC_SCOPE);
    expect(service.gateOpen).not.toBe(true);
    expect(service.confirmPermission).toBeTypeOf("function");
    const host = {}, owner = { host, conversationId: "synthetic-session", signal: new AbortController().signal };
    state.dialog.mockResolvedValueOnce({ response: 0 });
    expect(await service.confirmPermission(owner, BROWSER_PUBLIC_SCOPE)).toBe(false);
    expect(state.dialog).toHaveBeenLastCalledWith(host, expect.objectContaining({ defaultId: 0, cancelId: 0, noLink: true }));
    const prompt = state.dialog.mock.calls.at(-1)![1];
    for (const domain of BROWSER_PUBLIC_SCOPE.hosts) expect(prompt.detail).toContain(domain);
    expect(prompt.detail).toContain("synthetic-session");
    state.dialog.mockResolvedValueOnce({ response: 1 });
    expect(await service.confirmPermission(owner, BROWSER_PUBLIC_SCOPE)).toBe(true);
  });
});
