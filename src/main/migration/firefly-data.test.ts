import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureFireflyDataDirectory, ensureFireflyExportManifest, migrateFireflyDataOnStartup, writeMigratedJson } from "./firefly-data";
import { fireflyEnvironment } from "../../shared/firefly-environment";
import { normalizeFireflyEvent, normalizeFireflyFields, normalizeStoredMoment, readFireflyStorage } from "../../shared/legacy-firefly-contracts";
import { parsePanelMessage } from "../../renderer/settings/panel-bridge-protocol";
import { FileToolOutputStore } from "../orchestrator/harness/tool-output/file-tool-output-store";

const roots: string[] = [];
function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-migration-test-"));
  roots.push(root);
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("legacy Firefly data migration", () => {
  it("migrates every store at startup without waiting for a Work run", () => {
    const root = temporaryRoot();
    for (const kind of ["chats", "runs", "tasks"]) {
      fs.mkdirSync(path.join(root, `cyrene-${kind}`));
      fs.writeFileSync(path.join(root, `cyrene-${kind}`, "index.json"), "[]");
    }
    expect(migrateFireflyDataOnStartup(root)).toEqual([]);
    expect(migrateFireflyDataOnStartup(root)).toEqual([]);
    for (const kind of ["chats", "runs", "tasks"]) {
      expect(fs.readFileSync(path.join(root, `firefly-${kind}`, "index.json"), "utf8")).toBe("[]");
      expect(fs.readFileSync(path.join(root, `cyrene-${kind}`, "index.json"), "utf8")).toBe("[]");
    }
  });
  it("reports only the failed store and leaves its source intact", () => {
    const root = temporaryRoot();
    for (const kind of ["runs", "tasks"]) fs.mkdirSync(path.join(root, `cyrene-${kind}`));
    fs.writeFileSync(path.join(root, "cyrene-runs", "index.json"), "broken");
    fs.writeFileSync(path.join(root, "cyrene-tasks", "index.json"), "[]");
    expect(migrateFireflyDataOnStartup(root)).toEqual(["runs"]);
    expect(fs.existsSync(path.join(root, "firefly-runs"))).toBe(false);
    expect(fs.readFileSync(path.join(root, "cyrene-runs", "index.json"), "utf8")).toBe("broken");
    expect(fs.readFileSync(path.join(root, "firefly-tasks", "index.json"), "utf8")).toBe("[]");
  });
  it("prioritizes current environment and preserves legacy browser preferences", () => {
    expect(fireflyEnvironment({ FIREFLY_PERF_HARNESS: "0", CYRENE_PERF_HARNESS: "1" }, "FIREFLY_PERF_HARNESS")).toBe("0");
    expect(fireflyEnvironment({ CYRENE_HOME: "legacy-home" }, "FIREFLY_HOME")).toBeUndefined();
    const values = new Map([["cyrene.rag.model", "bgem3"]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(readFireflyStorage(storage, "firefly.rag.model")).toBe("bgem3");
    values.set("firefly.rag.model", "saved-current");
    expect(readFireflyStorage(storage, "firefly.rag.model")).toBe("saved-current");
    expect(values.get("cyrene.rag.model")).toBe("bgem3");
  });
  it("preserves tool result references and reviews across directory migration", async () => {
    const root = temporaryRoot();
    const store = new FileToolOutputStore(root);
    const reference = await store.put({ conversationId: "conversation-a", runId: "run-a", toolCallId: "call-a", toolName: "search_code", outcome: "success", output: "public result", truncatedForModel: false });
    fs.mkdirSync(path.join(root, "firefly-runs", "reviews"));
    fs.writeFileSync(path.join(root, "firefly-runs", "reviews", "run-a.json"), '{"runId":"run-a"}');
    fs.renameSync(path.join(root, "firefly-runs"), path.join(root, "cyrene-runs"));
    const reloaded = new FileToolOutputStore(root);
    await expect(reloaded.read({ conversationId: "conversation-a", resultRef: reference.resultRef, offset: 0, length: 8192 })).resolves.toMatchObject({ content: "public result" });
    expect(fs.readFileSync(path.join(root, "firefly-runs", "reviews", "run-a.json"), "utf8")).toBe('{"runId":"run-a"}');
    expect(fs.existsSync(path.join(root, "cyrene-runs", "reviews", "run-a.json"))).toBe(true);
  });
  it("leaves both source and backup unchanged when normalized replacement fails", () => {
    const file = path.join(temporaryRoot(), "settings.json");
    fs.writeFileSync(file, '{"cyreneFeeling":"quiet"}');
    const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("injected write failure"); });
    try {
      expect(() => writeMigratedJson(file, { cyreneFeeling: "quiet" }, { fireflyFeeling: "quiet" })).toThrow("FIREFLY_DATA_NORMALIZATION_FAILED");
    } finally { rename.mockRestore(); }
    expect(fs.readFileSync(file, "utf8")).toBe('{"cyreneFeeling":"quiet"}');
    expect(fs.readFileSync(`${file}.pre-firefly.bak`, "utf8")).toBe(fs.readFileSync(file, "utf8"));
    writeMigratedJson(file, { cyreneFeeling: "quiet" }, { fireflyFeeling: "quiet" });
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ fireflyFeeling: "quiet" });
  });
  it("rejects retired panel protocol versions", () => {
    expect(parsePanelMessage({ protocol: "cyrene-panel/1", kind: "invoke", seq: 1, channel: "snapshot", args: [] })).toBeNull();
    expect(parsePanelMessage({ protocol: "cyrene-panel/2", kind: "invoke", seq: 1, channel: "snapshot", args: [] })).toBeNull();
  });
  it.each(["chats", "runs", "tasks"] as const)("copies %s once and preserves original IDs and backup", (kind) => {
    const root = temporaryRoot();
    const source = path.join(root, `cyrene-${kind}`);
    fs.mkdirSync(path.join(source, "nested"), { recursive: true });
    const content = JSON.stringify({ id: "run-1", sessionId: "chat-1", taskId: "task-1" });
    fs.writeFileSync(path.join(source, "nested", "record.json"), content);
    const destination = ensureFireflyDataDirectory(root, kind);
    expect(fs.readFileSync(path.join(destination, "nested", "record.json"), "utf8")).toBe(content);
    expect(fs.readFileSync(path.join(source, "nested", "record.json"), "utf8")).toBe(content);
    fs.writeFileSync(path.join(destination, "nested", "record.json"), "[]");
    expect(ensureFireflyDataDirectory(root, kind)).toBe(destination);
    expect(fs.readFileSync(path.join(destination, "nested", "record.json"), "utf8")).toBe("[]");
  });
  it("keeps existing current data without merging or overwriting", () => {
    const root = temporaryRoot();
    fs.mkdirSync(path.join(root, "cyrene-chats"));
    fs.writeFileSync(path.join(root, "cyrene-chats", "index.json"), "broken");
    fs.mkdirSync(path.join(root, "firefly-chats"));
    expect(ensureFireflyDataDirectory(root, "chats")).toBe(path.join(root, "firefly-chats"));
    expect(fs.readdirSync(path.join(root, "firefly-chats"))).toEqual([]);
  });
  it("rejects damaged data without exposing a partial directory and supports retry", () => {
    const root = temporaryRoot();
    const source = path.join(root, "cyrene-runs");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "index.json"), "broken");
    expect(() => ensureFireflyDataDirectory(root, "runs")).toThrow("FIREFLY_DATA_MIGRATION_FAILED");
    expect(fs.readdirSync(root)).toEqual(["cyrene-runs"]);
    expect(fs.readFileSync(path.join(source, "index.json"), "utf8")).toBe("broken");
    fs.writeFileSync(path.join(source, "index.json"), "[]");
    expect(fs.existsSync(ensureFireflyDataDirectory(root, "runs"))).toBe(true);
  });
  it("backs up JSON once and gives saved current settings precedence", () => {
    const root = temporaryRoot();
    const file = path.join(root, "settings.json");
    const original = { cyreneMomentsPostingEnabled: true, fireflyMomentsPostingEnabled: false, cyreneFeeling: "quiet" };
    const raw = JSON.stringify(original);
    fs.writeFileSync(file, raw);
    const current = normalizeFireflyFields(original);
    expect(current).toEqual({ fireflyMomentsPostingEnabled: false, fireflyFeeling: "quiet" });
    writeMigratedJson(file, original, current);
    writeMigratedJson(file, current, current);
    expect(fs.readFileSync(`${file}.pre-firefly.bak`, "utf8")).toBe(raw);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(current);
  });
  it("normalizes only identity fields, not user content", () => {
    expect(normalizeStoredMoment({ author: "user", actor: "cyrene", mentions: ["cyrene", "firefly"], content: "cyrene" }))
      .toEqual({ author: "user", actor: "firefly", mentions: ["firefly"], content: "cyrene" });
  });
  it("normalizes replay events without duplicating or changing payload", () => {
    const event = { type: "CUSTOM", name: "cyrene.plan", value: { id: "plan-1" } };
    const current = normalizeFireflyEvent(event);
    expect(current).toEqual({ ...event, name: "firefly.plan" });
    expect(normalizeFireflyEvent(current)).toBe(current);
    expect(event.name).toBe("cyrene.plan");
  });
  it("migrates the export manifest without deleting its source", () => {
    const root = temporaryRoot();
    const source = path.join(root, ".cyrene-export-manifest.json");
    fs.writeFileSync(source, '{"files":[]}');
    const current = ensureFireflyExportManifest(root);
    expect(path.basename(current)).toBe(".firefly-export-manifest.json");
    expect(fs.readFileSync(current, "utf8")).toBe(fs.readFileSync(source, "utf8"));
  });
});
