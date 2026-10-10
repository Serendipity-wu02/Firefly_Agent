import { describe, expect, it } from "vitest";
import { resolveScreenshotHelperPath } from "./helper-path";

describe("resolveScreenshotHelperPath", () => {
  // This fixture uses Windows paths from the Windows native screenshot helper.
  it.runIf(process.platform === "win32")("uses the development Rust release binary", () => {
    expect(resolveScreenshotHelperPath({
      isPackaged: false,
      appPath: "C:\\repo",
      resourcesPath: "C:\\app\\resources",
      envOverride: undefined,
    })).toBe("C:\\repo\\native\\target\\release\\firefly-screenshot.exe");
  });

  // This fixture uses Windows paths from the Windows native screenshot helper.
  it.runIf(process.platform === "win32")("uses the packaged resources binary", () => {
    expect(resolveScreenshotHelperPath({
      isPackaged: true,
      appPath: "C:\\app\\resources\\app.asar",
      resourcesPath: "C:\\app\\resources",
      envOverride: undefined,
    })).toBe("C:\\app\\resources\\bin\\firefly-screenshot.exe");
  });

  it("allows an explicit helper path override", () => {
    expect(resolveScreenshotHelperPath({
      isPackaged: true,
      appPath: "C:\\app\\resources\\app.asar",
      resourcesPath: "C:\\app\\resources",
      envOverride: "D:\\debug\\firefly-screenshot.exe",
    })).toBe("D:\\debug\\firefly-screenshot.exe");
  });
});
