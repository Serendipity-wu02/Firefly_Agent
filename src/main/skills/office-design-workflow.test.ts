import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const skillsDir = path.resolve("vendor/firefly-skills/skills");
const officeDir = path.join(skillsDir, "office-design");
const validator = path.join(officeDir, "scripts/validate_theme.py");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-office-design-"));
  temporaryRoots.push(directory);
  return directory;
}

function runPython(args: string[], cwd: string) {
  const result = spawnSync("python", ["-B", ...args], {
    cwd, encoding: "utf8", timeout: 10_000, windowsHide: true,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONIOENCODING: "utf-8" },
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
}

function completeTheme() {
  return {
    id: "test",
    colors: {
      primary: "#18364B", secondary: "#315569", accent: "#006B68", background: "#FFFFFF",
      surface: "#F1F5F7", foreground: "#172B36", muted: "#4A5D69", border: "#BCCAD2",
    } as Record<string, unknown>,
    fonts: { cjk: ["Microsoft YaHei"], latin: ["Arial"], fallback: ["Helvetica"] } as Record<string, unknown>,
    spacing: { base: 6 } as Record<string, unknown>,
    roles: {
      table_header: "primary", input: "#0000FF", formula: "#000000", warning: "#9A4700", success: "#17633C",
    } as Record<string, unknown>,
    chart_colors: ["#006B68", "#315569", "#845C24"],
  };
}

function validateContent(content: string | Buffer) {
  const directory = temporaryDirectory();
  const filename = path.join(directory, "theme with spaces.json");
  fs.writeFileSync(filename, content);
  const before = fs.readFileSync(filename);
  const modifiedAt = fs.statSync(filename).mtimeMs;
  const result = runPython([validator, filename], directory);
  expect(fs.readFileSync(filename)).toEqual(before);
  expect(fs.statSync(filename).mtimeMs).toBe(modifiedAt);
  expect(fs.readdirSync(directory)).toEqual(["theme with spaces.json"]);
  return result;
}

function expectInvalid(theme: unknown, error: string) {
  const result = validateContent(JSON.stringify(theme));
  expect(result.stderr).toBe("");
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.status).toBe("error");
  expect(report.errors).toContain(error);
}

describe("Office theme validator", () => {
  it("accepts a complete theme without changing its bytes or directory", () => {
    const result = validateContent(JSON.stringify(completeTheme()));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({ status: "ok", errors: [] });
  });

  it.each(["primary", "secondary", "accent", "background", "surface", "foreground", "muted", "border"])(
    "requires colors.%s", (key) => {
      const theme = completeTheme();
      delete theme.colors[key];
      expectInvalid(theme, `colors.${key} is required`);
    },
  );

  it.each(["primary", "secondary", "accent", "background", "surface", "foreground", "muted", "border"])(
    "rejects a malformed colors.%s", (key) => {
      const theme = completeTheme();
      theme.colors[key] = "123456";
      expectInvalid(theme, `colors.${key} must be #RRGGBB`);
    },
  );

  it.each(["#FFF", "#GG1234", "#12345678", "#123456\n", " #123456", 123456, true, [], {}].map(value => [value]))(
    "rejects an invalid color value %j", (value) => {
      const theme = completeTheme();
      theme.colors.primary = value;
      expectInvalid(theme, "colors.primary must be #RRGGBB");
    },
  );

  it.each(["cjk", "latin", "fallback"])("requires fonts.%s", (key) => {
    const theme = completeTheme();
    delete theme.fonts[key];
    expectInvalid(theme, `fonts.${key} is required`);
  });

  it.each(["cjk", "latin", "fallback"])("validates fonts.%s as a nonempty font list", (key) => {
    const theme = completeTheme();
    theme.fonts[key] = "Arial";
    expectInvalid(theme, `fonts.${key} must be a nonempty array of nonblank strings`);
  });

  it.each([[], [""], ["  "], [42], [null], ["Arial", {}]].map(value => [value]))("rejects invalid fonts.latin %j", (value) => {
    const theme = completeTheme();
    theme.fonts.latin = value;
    expectInvalid(theme, "fonts.latin must be a nonempty array of nonblank strings");
  });

  it.each(["table_header", "input", "formula", "warning", "success"])("requires roles.%s", (key) => {
    const theme = completeTheme();
    delete theme.roles[key];
    expectInvalid(theme, `roles.${key} is required`);
  });

  it.each(["table_header", "input", "formula", "warning", "success"])("rejects an unresolved roles.%s", (key) => {
    const theme = completeTheme();
    theme.roles[key] = "Primary";
    expectInvalid(theme, `roles.${key} must be #RRGGBB or an existing colors key`);
  });

  it.each([12, true, ["primary"], {}, "#ABC", " primary"].map(value => [value]))("rejects invalid roles.warning %j", (value) => {
    const theme = completeTheme();
    theme.roles.warning = value;
    expectInvalid(theme, "roles.warning must be #RRGGBB or an existing colors key");
  });

  it("requires spacing.base", () => {
    const theme = completeTheme();
    delete theme.spacing.base;
    expectInvalid(theme, "spacing.base is required");
  });

  it.each([0, -1, "8", true, [], {}].map(value => [value]))("rejects invalid spacing.base %j", (value) => {
    const theme = completeTheme();
    theme.spacing.base = value;
    expectInvalid(theme, "spacing.base must be a finite positive number");
  });

  it.each(["NaN", "Infinity", "-Infinity", "1e400"])("rejects nonfinite spacing.base %s", (value) => {
    const theme = completeTheme();
    theme.spacing.base = "nonfinite-value";
    const result = validateContent(JSON.stringify(theme).replace('"nonfinite-value"', value));
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).errors).toContain("spacing.base must be a finite positive number");
  });

  it("retains the empty chart palette diagnostic", () => {
    expectInvalid({ ...completeTheme(), chart_colors: [] }, "chart_colors is required");
  });

  it.each(["#123456", {}, true, ["primary"], ["#ABC"], ["#123456", 3]].map(value => [value]))("rejects invalid chart_colors %j", (value) => {
    expectInvalid({ ...completeTheme(), chart_colors: value }, "chart_colors must be a nonempty array of #RRGGBB colors");
  });

  it.each(["colors", "fonts", "roles", "spacing"])("requires the %s object", (key) => {
    const theme: Record<string, unknown> = completeTheme();
    delete theme[key];
    expectInvalid(theme, `${key} is required`);
  });

  it.each(["colors", "fonts", "roles", "spacing"])("rejects a non-object %s section", (key) => {
    expectInvalid({ ...completeTheme(), [key]: [] }, `${key} must be an object`);
  });

  it.each([null, [], "theme", 42, true].map(value => [value]))("rejects a non-object root %j without a traceback", (value) => {
    expectInvalid(value, "theme must be an object");
  });

  it.each(["", "  ", null, 42, true, [], {}].map(value => [value]))("rejects invalid id %j", (value) => {
    expectInvalid({ ...completeTheme(), id: value }, "id must be a nonblank string");
  });

  it("requires id and chart_colors", () => {
    const theme: Record<string, unknown> = completeTheme();
    delete theme.id;
    delete theme.chart_colors;
    const result = validateContent(JSON.stringify(theme));
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).errors).toEqual(["id is required", "chart_colors is required"]);
  });

  it("returns all independent errors rather than stopping at the first", () => {
    const theme = completeTheme();
    theme.colors.accent = "#BAD";
    theme.fonts.cjk = [false];
    theme.roles.input = "PRIMARY";
    theme.spacing.base = false;
    theme.chart_colors = ["not-a-color"];
    const result = validateContent(JSON.stringify(theme));
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).errors).toEqual([
      "colors.accent must be #RRGGBB",
      "fonts.cjk must be a nonempty array of nonblank strings",
      "spacing.base must be a finite positive number",
      "roles.input must be #RRGGBB or an existing colors key",
      "chart_colors must be a nonempty array of #RRGGBB colors",
    ]);
  });

  it("accepts exact color references, mixed-case hex and fractional spacing without normalizing the object", () => {
    const theme = completeTheme();
    theme.roles.warning = "accent";
    theme.colors.accent = "#aBcDeF";
    theme.spacing.base = 2.5;
    const directory = temporaryDirectory();
    const filename = path.join(directory, "input.json");
    fs.writeFileSync(filename, JSON.stringify(theme));
    const result = runPython(["-c", [
      "import copy, importlib.util, json, sys",
      "spec = importlib.util.spec_from_file_location('office_validator', sys.argv[1])",
      "module = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(module)",
      "theme = json.load(open(sys.argv[2], encoding='utf-8'))",
      "before = copy.deepcopy(theme)",
      "errors = module.validate_theme(theme)",
      "print(json.dumps({'errors': errors, 'unchanged': theme == before, 'theme': theme}))",
    ].join("\n"), validator, filename], directory);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({ errors: [], unchanged: true, theme });
  });

  it.each(["{", Buffer.from([0xff, 0xfe, 0xfd])])("reports unreadable JSON %j with exit 2", (content) => {
    const result = validateContent(content);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ status: "error", errors: [expect.any(String)] });
  });

  it("reports a missing file with exit 2 without creating it", () => {
    const directory = temporaryDirectory();
    const result = runPython([validator, path.join(directory, "missing.json")], directory);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({ status: "error", errors: [expect.any(String)] });
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it("keeps the original Python regression assertions passing", () => {
    const result = runPython([path.join(officeDir, "tests/test_validate_theme.py")], temporaryDirectory());
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Ran 3 tests");
    expect(result.stderr).toContain("OK");
  });
});

describe("Office theme consumer compatibility", () => {
  it.each(["business", "academic", "formal-cn", "financial"])("validates and maps %s through the real PDF and PPTX readers", (id) => {
    const directory = temporaryDirectory();
    const themePath = path.join(officeDir, "assets/themes", `${id}.json`);
    const before = fs.readFileSync(themePath);
    const theme = JSON.parse(before.toString("utf8"));
    expect(theme.id).toBe(id);
    const validation = runPython([validator, themePath], directory);
    expect(validation.status).toBe(0);
    expect(JSON.parse(validation.stdout)).toEqual({ status: "ok", errors: [] });

    const pdf = runPython(["-c", [
      "import json, sys",
      "sys.path.insert(0, sys.argv[1])",
      "from make import apply_theme",
      "tokens = {'preserved': 'original'}",
      "apply_theme(tokens, sys.argv[2])",
      "print(json.dumps(tokens))",
    ].join("\n"), path.join(skillsDir, "pdf/scripts"), id], directory);
    expect(pdf.status).toBe(0);
    expect(pdf.stderr).toBe("");
    expect(JSON.parse(pdf.stdout)).toEqual({
      preserved: "original", theme_id: id, accent: theme.colors.accent,
      accent_lt: theme.colors.surface, dark: theme.colors.foreground, muted: theme.colors.muted,
      page_bg: theme.colors.background, cover_bg: theme.colors.primary, cover_fg: theme.colors.background,
    });

    const pptx = spawnSync(process.execPath, ["-e",
      "const {loadTheme}=require(process.argv[1]); console.log(JSON.stringify(loadTheme(process.argv[2])))",
      path.join(skillsDir, "pptx-generator/scripts/theme-loader.js"), id,
    ], { cwd: directory, encoding: "utf8", timeout: 10_000, windowsHide: true });
    expect(pptx.error).toBeUndefined();
    expect(pptx.status).toBe(0);
    expect(pptx.stderr).toBe("");
    const palette = JSON.parse(pptx.stdout);
    expect(Object.keys(palette).sort()).toEqual(["accent", "bg", "light", "primary", "secondary"]);
    expect(palette.secondary).toBe(theme.colors.foreground.slice(1).toUpperCase());
    for (const color of Object.values(palette)) expect(color).toMatch(/^[0-9A-F]{6}$/);

    expect(theme.roles.input).toBe("#0000FF");
    expect(theme.roles.formula).toBe("#000000");
    expect(theme.roles.table_header).toBe("primary");
    expect(fs.readFileSync(themePath)).toEqual(before);
    expect(fs.readdirSync(directory)).toEqual([]);
  });
});
