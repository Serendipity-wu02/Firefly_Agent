import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { marked } from "marked";
import matter from "gray-matter";
import { createHash } from "node:crypto";
import { buildAdaptedSnapshot } from "./adapt-skills-snapshot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
test("repacking is deterministic and preserves every unrelated archive entry", async () => {
  const original = await fs.readFile(path.join(root, "vendor/firefly-skills/skills-snapshot.zip"));
  const overlay = path.join(root, "scripts/packaging/skill-adaptations");
  const first = await buildAdaptedSnapshot(original, overlay);
  const second = await buildAdaptedSnapshot(first.bytes, overlay);
  assert.deepEqual(first.bytes, second.bytes);
  assert.deepEqual(first.files, second.files);
  const before = await JSZip.loadAsync(original);
  const after = await JSZip.loadAsync(first.bytes);
  const { repairs } = JSON.parse(await fs.readFile(path.join(root, "scripts/packaging/skill-repairs.json"), "utf8"));
  for (const [name, entry] of Object.entries(before.files)) {
    if (entry.dir) continue;
    const repair = repairs.findLast(repair => repair.path === name);
    if (repair) {
      assert.equal(createHash("sha256").update(await after.file(name).async("nodebuffer")).digest("hex"), repair.resultSha256);
      continue;
    }
    let expected;
    try { expected = await fs.readFile(path.join(overlay, name)); } catch (error) {
      if (error.code !== "ENOENT") throw error;
      expected = await entry.async("nodebuffer");
    }
    assert.deepEqual(await after.file(name).async("nodebuffer"), expected, name);
  }
  assert.equal(Object.keys(after.files).filter(name => /^[^/]+\/SKILL.md$/.test(name)).length, 39);
  assert.ok(first.files.some(file => file.path.endsWith("scripts/review-package")));
});

test("every distributed Markdown file target and heading anchor resolves", async () => {
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(root, "vendor/firefly-skills/skills-snapshot.zip")));
  const names = new Set(Object.keys(zip.files));
  const anchors = new Map();
  const links = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !name.endsWith(".md")) continue;
    const targets = new Set();
    const counts = new Map();
    marked.walkTokens(marked.lexer(await entry.async("string")), token => {
      if (token.type === "heading") {
        const slug = token.text.toLowerCase().trim().replace(/<[^>]*>/g, "").replace(/[`*_~]/g, "")
          .replace(/[^\p{L}\p{N}\p{M}\p{Pc}\s-]/gu, "").replace(/\s/g, "-");
        const count = counts.get(slug) ?? 0;
        counts.set(slug, count + 1);
        targets.add(slug + (count ? "-" + count : ""));
      }
      if (token.type === "link" || token.type === "image") links.push({ name, href: token.href });
    });
    anchors.set(name, targets);
  }
  for (const { name, href } of links) {
    if (/^[a-z][a-z\d+.-]*:/i.test(href)) continue;
    const [file, anchor] = href.split("#");
    const target = file ? path.posix.normalize(path.posix.join(path.posix.dirname(name), decodeURIComponent(file))) : name;
    assert.ok(names.has(target), name + " -> " + href);
    if (anchor) assert.ok(anchors.get(target)?.has(decodeURIComponent(anchor)), name + " -> " + href);
  }
});

test("distributed host instructions use registered Skill IDs and installed resource paths", async () => {
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(root, "vendor/firefly-skills/skills-snapshot.zip")));
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !name.endsWith(".md")) continue;
    const content = await entry.async("string");
    assert.doesNotMatch(content, /superpowers:[a-z][a-z-]+/i, name);
    assert.doesNotMatch(content, /ask_user_choice/, name);
  }
  for (const skillId of ["docx", "pdf", "xlsx", "office-design"]) {
    const body = await zip.file(`${skillId}/SKILL.md`).async("string");
    assert.match(body, /\$skillDir/, skillId);
    assert.match(body, /\$scriptRoot/, skillId);
    assert.doesNotMatch(body, /python scripts\//, skillId);
  }
  const delegation = await zip.file("sp-subagent-driven-development/SKILL.md").async("string");
  assert.doesNotMatch(delegation, /node scripts\//);
  assert.match(delegation, /\$skillDir/);
  for (const name of ["create", "edit", "fix", "format", "read-analyze", "validate"]) {
    const reference = await zip.file(`xlsx/references/${name}.md`).async("string");
    assert.match(reference, /Firefly Windows binding:/, name);
    assert.match(reference, /unique isolated workspace/, name);
  }
  for (const name of ["scenario_c_apply_template", "troubleshooting"]) {
    const reference = await zip.file(`docx/references/${name}.md`).async("string");
    assert.match(reference, /Firefly Windows binding:/, name);
    assert.doesNotMatch(reference, /scripts\/docx_preview\.sh/, name);
  }
  assert.match(await zip.file("pptx-generator/references/editing.md").async("string"), /isolated authorized Windows workspace/);
});

test("the 39-item host review and attachment hashes describe the distributed archive", async () => {
  const bytes = await fs.readFile(path.join(root, "vendor/firefly-skills/skills-snapshot.zip"));
  const zip = await JSZip.loadAsync(bytes);
  const review = JSON.parse(await fs.readFile(path.join(root, "docs/archive/refactor/2026-09-26-dependency-governance.distribution.json"), "utf8")).hostSemanticReview;
  assert.equal(review.archiveSha256, createHash("sha256").update(bytes).digest("hex"));
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
  const skillIds = names.filter(name => /^[^/]+\/SKILL.md$/.test(name)).map(name => name.split("/")[0]).sort();
  assert.equal(skillIds.length, 39);
  assert.deepEqual(review.entries.map(entry => entry.id), skillIds);
  for (const entry of review.entries) {
    const body = matter(await zip.file(`${entry.id}/SKILL.md`).async("string"));
    const children = names.filter(name => name.startsWith(`${entry.id}/`) && name !== `${entry.id}/SKILL.md`);
    assert.deepEqual(entry.modes, body.data.modes ?? ["work", "code", "learn"], entry.id);
    assert.deepEqual(entry.crossSkillIds, skillIds.filter(id => id !== entry.id && body.content.includes(id)), entry.id);
    assert.equal(entry.referenceCount, children.filter(name => name.startsWith(`${entry.id}/references/`)).length, entry.id);
    assert.equal(entry.scriptCount, children.filter(name => name.startsWith(`${entry.id}/scripts/`)).length, entry.id);
    assert.equal(entry.templateCount, children.filter(name => name.startsWith(`${entry.id}/templates/`)).length, entry.id);
  }
  for (const attachment of review.attachments) {
    const content = await zip.file(attachment.path).async("nodebuffer");
    assert.equal(attachment.sha256, createHash("sha256").update(content).digest("hex"), attachment.path);
    assert.equal(attachment.bytes, content.length, attachment.path);
  }
});

test("does not apply anchor repairs to unknown modified content", async () => {
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(root, "vendor/firefly-skills/skills-snapshot.zip")));
  zip.file("pptx-generator/SKILL.md", "unrecognized public fixture");
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(buildAdaptedSnapshot(bytes, path.join(root, "scripts/packaging/skill-adaptations")), /REPAIR_SOURCE_MISMATCH/);
  assert.equal(await zip.file("pptx-generator/SKILL.md").async("string"), "unrecognized public fixture");
});

test("does not replace an unrecognized XLSX helper during snapshot adaptation", async () => {
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(root, "vendor/firefly-skills/skills-snapshot.zip")));
  zip.file("xlsx/scripts/xlsx_workspace.py", "unrecognized helper content");
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(buildAdaptedSnapshot(bytes, path.join(root, "scripts/packaging/skill-adaptations")), /OVERLAY_SOURCE_MISMATCH/);
});
