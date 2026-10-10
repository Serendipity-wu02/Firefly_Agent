import * as fs from "node:fs";
import * as path from "node:path";

function invalid(message) {
  throw new Error(`Invalid input: ${message}`);
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || !keys.every(key => Object.hasOwn(value, key))) {
    invalid(`expected exactly ${keys.join(", ")}`);
  }
}

function centsFromDecimal(amount) {
  if (typeof amount !== "string" || amount.length > 100 || !/^\d+(?:\.\d+)?$/.test(amount)) {
    invalid("amount must be an unsigned decimal string, without exponent notation");
  }
  const [whole, fraction = ""] = amount.split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2))
    + (fraction.length > 2 && fraction[2] >= "5" ? 1n : 0n);
  if (cents <= 0n) invalid("expense must round to positive cents");
  numericAmount(cents);
  return cents;
}

function numericAmount(cents) {
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) invalid("amount or total exceeds safe cents");
  const decimal = `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
  const amount = Number(decimal);
  if (amount.toFixed(2) !== decimal) invalid("amount or total cannot retain exact cents in Excel numbers");
  return amount;
}

function prepareSheets(input) {
  exactKeys(input, ["currency", "records"]);
  if (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) {
    invalid("currency must be an explicitly confirmed three-letter uppercase code");
  }
  if (!Array.isArray(input.records) || input.records.length === 0) invalid("records must be nonempty");
  const byCategory = new Map();
  let totalCents = 0n;
  const rows = input.records.map(record => {
    exactKeys(record, ["date", "category", "amount", "note", "currency"]);
    if (typeof record.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
      invalid("date must be a confirmed YYYY-MM-DD calendar date");
    }
    const date = new Date(`${record.date}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== record.date) {
      invalid("date is not a valid calendar date");
    }
    if (typeof record.category !== "string" || !record.category.trim()) invalid("category is required");
    if (typeof record.note !== "string") invalid("note must be text, including an explicit empty string");
    if (record.currency !== input.currency) invalid("mixed or missing currency; no conversion is performed");
    const cents = centsFromDecimal(record.amount);
    totalCents += cents;
    byCategory.set(record.category, (byCategory.get(record.category) ?? 0n) + cents);
    return [record.date, record.category, numericAmount(cents), record.note];
  });
  const summaryRows = [...byCategory.entries()]
    .sort(([leftCategory, leftCents], [rightCategory, rightCents]) => {
      if (leftCents !== rightCents) return leftCents > rightCents ? -1 : 1;
      return leftCategory < rightCategory ? -1 : leftCategory > rightCategory ? 1 : 0;
    })
    .map(([category, cents]) => [category, numericAmount(cents), input.currency]);
  summaryRows.push(["合计", numericAmount(totalCents), input.currency]);
  return [
    { name: "支出明细", headers: ["日期", "类目", "金额", "备注"], rows },
    { name: "分类汇总", headers: ["类目", "金额", "币种"], rows: summaryRows },
  ];
}

function main() {
  const [inputPath, preparedPath, outputRoot, filename, ...extra] = process.argv.slice(2);
  if (!inputPath || !preparedPath || !outputRoot || !filename || extra.length) {
    invalid("usage: node prepare-report.mjs INPUT_JSON PREPARED_JSON RUNTIME_OUTPUT_ROOT FILENAME");
  }
  if (![inputPath, preparedPath, outputRoot].every(value => path.isAbsolute(value))) {
    invalid("input, prepared output and runtime output root must be absolute paths");
  }
  if (/[\\/<>:"|?*]/.test(filename) || filename.includes("..") || path.extname(filename) !== ".xlsx") {
    invalid("filename must be one new .xlsx filename, without directories or unsafe characters");
  }
  if (!fs.statSync(outputRoot).isDirectory()) invalid("runtime output root must be an existing directory");
  const workbookPath = path.resolve(outputRoot, filename);
  let input;
  try {
    input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) invalid("malformed JSON");
    throw error;
  }
  const payload = { filename, sheets: prepareSheets(input) };
  if (path.resolve(preparedPath) === path.resolve(workbookPath)) invalid("prepared JSON must not be the workbook");
  try {
    fs.lstatSync(workbookPath);
    throw new Error("Output exists: workbook path; choose a new confirmed filename");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    fs.writeFileSync(preparedPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Output exists: prepared JSON; choose a new path");
    throw error;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`[expense-report] ${error.message}\n`);
  process.exitCode = 1;
}
