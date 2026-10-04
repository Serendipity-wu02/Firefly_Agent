// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

it("keeps scheduler updates and Token usage active while the task list is collapsed", async () => {
  vi.useFakeTimers();
  document.body.innerHTML = readFileSync(new NodeURL("./index.html", import.meta.url), "utf8");
  const section = document.querySelector<HTMLDetailsElement>("details.task-section");
  expect(section).toBeTruthy();
  expect(section!.querySelector("summary")?.textContent).toContain("定时任务");
  section!.open = false;
  let onSchedulerChanged: (() => void) | undefined;
  let title = "Existing schedule fixture";
  const today = new Date();
  const nextFireAt = new Date(today.getTime() + 60_000).getTime();
  Object.assign(window, {
    tasks: { minimize() {}, close() {}, onSchedulerChanged(callback: () => void) { onSchedulerChanged = callback; return () => {}; } },
    fireflyScheduler: { list: async () => ({ ok: true, value: [{ id: "fixture", enabled: true, title, schedule: { kind: "once" }, nextFireAt }] }) },
    tokenUsage: { get: async () => ({ days: [{ date: `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`, input: 120, output: 30, hit: 0, miss: 0, requests: 1, cacheUsageRequests: 0 }] }) },
  });
  await import("./tasks");
  await vi.waitFor(() => expect(document.querySelector("#task-list")?.textContent).toContain(title));
  expect(document.querySelector("#usage-number")?.textContent).toBe("150");
  expect(section!.contains(document.querySelector("#usage-number"))).toBe(false);
  title = "Updated while folded";
  onSchedulerChanged!();
  await vi.waitFor(() => expect(document.querySelector("#task-list")?.textContent).toContain(title));
  expect(section!.open).toBe(false);
  section!.open = true;
  expect(section!.textContent).toContain("Updated while folded");
});
