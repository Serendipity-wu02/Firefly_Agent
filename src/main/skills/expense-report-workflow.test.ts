import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";

const skillRoot = path.join(process.cwd(), "vendor/firefly-skills/skills/write-expense-report");
const helper = path.join(skillRoot, "scripts/prepare-report.mjs");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) {
    const relative = path.relative(os.tmpdir(), directory);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Temporary directory is outside the system temporary root");
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(input: unknown) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-expense-test-"));
  temporaryRoots.push(directory);
  const inputPath = path.join(directory, "input.json");
  const preparedPath = path.join(directory, "prepared.json");
  const workbookPath = path.join(directory, "report.xlsx");
  fs.writeFileSync(inputPath, JSON.stringify(input), "utf8");
  return { directory, inputPath, preparedPath, workbookPath };
}

function runHelper(files: ReturnType<typeof fixture>, outputRoot = path.dirname(files.workbookPath), filename = path.basename(files.workbookPath)) {
  return spawnSync(process.execPath, [helper, files.inputPath, files.preparedPath, outputRoot, filename], {
    encoding: "utf8",
  });
}

const record = { date: "2026-09-01", category: "餐饮", amount: "1.005", note: "synthetic", currency: "CNY" };

it("rounds each decimal half up to cents before computing category totals and the grand total", () => {
  const files = fixture({ currency: "CNY", records: [
    record,
    { ...record, amount: "2.675" },
    { ...record, category: "交通", amount: "0.10", note: "=1+1" },
    { ...record, category: "交通", amount: "0.20" },
  ] });
  const before = fs.readFileSync(files.inputPath);
  const result = runHelper(files);
  expect(result.status, result.stderr).toBe(0);
  expect(fs.readFileSync(files.inputPath)).toEqual(before);
  expect(fs.existsSync(files.workbookPath)).toBe(false);
  expect(JSON.parse(fs.readFileSync(files.preparedPath, "utf8"))).toEqual({
    filename: "report.xlsx",
    sheets: [
      { name: "支出明细", headers: ["日期", "类目", "金额", "备注"], rows: [
        ["2026-09-01", "餐饮", 1.01, "synthetic"],
        ["2026-09-01", "餐饮", 2.68, "synthetic"],
        ["2026-09-01", "交通", 0.1, "=1+1"],
        ["2026-09-01", "交通", 0.2, "synthetic"],
      ] },
      { name: "分类汇总", headers: ["类目", "金额", "币种"], rows: [
        ["餐饮", 3.69, "CNY"], ["交通", 0.3, "CNY"], ["合计", 3.99, "CNY"],
      ] },
    ],
  });
});

it("keeps categories distinct from object prototype keys and orders equal totals deterministically", () => {
  const files = fixture({ currency: "CNY", records: [
    { ...record, category: "constructor", amount: "1" },
    { ...record, category: "__proto__", amount: "1" },
  ] });
  const result = runHelper(files);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(fs.readFileSync(files.preparedPath, "utf8")).sheets[1].rows).toEqual([
    ["__proto__", 1, "CNY"], ["constructor", 1, "CNY"], ["合计", 2, "CNY"],
  ]);
});

it.each([
  ["zero", { ...record, amount: "0" }],
  ["negative", { ...record, amount: "-1" }],
  ["rounds to zero", { ...record, amount: "0.004" }],
  ["non-finite", { ...record, amount: "NaN" }],
  ["exponent", { ...record, amount: "1e2" }],
  ["binary number input", { ...record, amount: 1.005 }],
  ["oversized", { ...record, amount: "90071992547409.92" }],
  ["missing category", { ...record, category: "" }],
  ["invalid calendar date", { ...record, date: "2026-02-30" }],
  ["ambiguous date", { ...record, date: "9/1/2026" }],
  ["missing note", { ...record, note: null }],
  ["mixed currency", { ...record, currency: "USD" }],
  ["unknown field", { ...record, guessed: true }],
])("rejects %s without writing outputs or modifying the input", (_label, invalidRecord) => {
  const files = fixture({ currency: "CNY", records: [invalidRecord] });
  const before = fs.readFileSync(files.inputPath);
  const result = runHelper(files);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[expense-report] Invalid input");
  expect(fs.existsSync(files.preparedPath)).toBe(false);
  expect(fs.existsSync(files.workbookPath)).toBe(false);
  expect(fs.readFileSync(files.inputPath)).toEqual(before);
});

it.each([
  { currency: "CNY", records: [] },
  { currency: "", records: [record] },
  { currency: "CNY", records: [record], extra: true },
  { currency: "CNY", records: [
    { ...record, amount: "50000000000000" }, { ...record, amount: "50000000000000" },
  ] },
])("rejects incomplete or unsafe aggregate input %#", (input) => {
  const files = fixture(input);
  const result = runHelper(files);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[expense-report] Invalid input");
  expect(fs.existsSync(files.preparedPath)).toBe(false);
});

it.each(["preparedPath", "workbookPath"] as const)("protects an existing %s without altering either source or destination", (protectedPath) => {
  const files = fixture({ currency: "CNY", records: [record] });
  fs.writeFileSync(files[protectedPath], "existing synthetic artifact", "utf8");
  const before = fs.readFileSync(files.inputPath);
  const result = runHelper(files);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[expense-report] Output exists");
  expect(fs.readFileSync(files[protectedPath], "utf8")).toBe("existing synthetic artifact");
  expect(fs.readFileSync(files.inputPath)).toEqual(before);
  if (protectedPath === "workbookPath") expect(fs.existsSync(files.preparedPath)).toBe(false);
});

it("rejects malformed JSON rather than treating it as an empty ledger", () => {
  const files = fixture({});
  fs.writeFileSync(files.inputPath, "{broken synthetic json", "utf8");
  const result = runHelper(files);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[expense-report] Invalid input");
  expect(fs.readFileSync(files.inputPath, "utf8")).toBe("{broken synthetic json");
  expect(fs.existsSync(files.preparedPath)).toBe(false);
});

it("checks the workbook in the explicitly supplied runtime root, not the input directory or process cwd", () => {
  const files = fixture({ currency: "CNY", records: [record] });
  const outputRoot = path.join(files.directory, "runtime-workspace");
  fs.mkdirSync(outputRoot);
  fs.writeFileSync(files.workbookPath, "unrelated input-directory workbook", "utf8");
  const result = runHelper(files, outputRoot);
  expect(result.status, result.stderr).toBe(0);
  const payload = JSON.parse(fs.readFileSync(files.preparedPath, "utf8"));
  expect(payload.filename).toBe("report.xlsx");
  expect(fs.existsSync(path.join(outputRoot, payload.filename))).toBe(false);
  expect(fs.readFileSync(files.workbookPath, "utf8")).toBe("unrelated input-directory workbook");
});

it("refuses an existing workbook in the actual runtime root even when the input directory has no workbook", () => {
  const files = fixture({ currency: "CNY", records: [record] });
  const outputRoot = path.join(files.directory, "runtime-workspace");
  fs.mkdirSync(outputRoot);
  const actualWorkbook = path.join(outputRoot, "report.xlsx");
  fs.writeFileSync(actualWorkbook, "protected runtime workbook", "utf8");
  const result = runHelper(files, outputRoot);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[expense-report] Output exists");
  expect(fs.readFileSync(actualWorkbook, "utf8")).toBe("protected runtime workbook");
  expect(fs.existsSync(files.preparedPath)).toBe(false);
});

it.each(["../report.xlsx", "nested/report.xlsx", "nested\\report.xlsx"])("rejects filename %s instead of checking a path different from write_excel", (filename) => {
  const files = fixture({ currency: "CNY", records: [record] });
  const result = runHelper(files, files.directory, filename);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[expense-report] Invalid input");
  expect(fs.existsSync(files.preparedPath)).toBe(false);
});
