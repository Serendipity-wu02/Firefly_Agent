import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { initializeMainFileLogging, logger } from "./logger";

describe("main file logging", () => {
  it("installs into the explicitly configured userData directory", () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-logging-"));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const uninstall = initializeMainFileLogging(userDataDir);
    try {
      logger.warn("Runtime", "startup chats index", { sessionCount: 2 });
      const output = fs.readFileSync(path.join(userDataDir, "logs", "firefly.log"), "utf8");
      expect(output).toContain("sessionCount");
      expect(output).not.toContain("model-settings.json");
    } finally {
      uninstall();
      stderr.mockRestore();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
