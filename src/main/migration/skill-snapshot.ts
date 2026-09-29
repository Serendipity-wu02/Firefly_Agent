import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { assertSkillMigrationPath } from "./legacy-skill-migration";
import { updateInstalledSkillDirectory } from "../skills/directory-install";
import { updateManagedSkillBundle } from "./managed-skill-update";
import managedFiles from "./managed-skill-files.json";
import managedVersions from "./managed-skill-versions.json";

const MANAGED_BUNDLES: Readonly<Record<string, string | readonly string[]>> = {
  "as-source-driven-development": "9af3c84ecee8ccf9ea56acd67897ccdcd4ce0ed960cbedb053633bc15b3256c0",
  "xlsx": "69fe57de5c506d8e7385777cca8cd14f72ba67429f5330fc0e29299b5291dc1a",
  "pdf": "f3afddf970f1c977ffe175fcae6b401794339a3876fd8e0b6a45a6c30e34aad4",
  "docx": "e6470c392870b2d7c34881abc2d60538b0ddafd088dcb85b79f28a5171337d18",
  "ecc-plan-canvas": "d8314738efdae8b1f8b304f819cfd0cb999c69ad0decf4ea3d9805c84567815d",
  "ecc-tdd-workflow": "22d64df7fed2c0c7e4725b859b11d8a77f62823222c8d8839b929dd830cdaac4",
  "skill-creator": "8a420fe93c5a89f6b1929f778c931f0524b11bc071ee8d17971bb1623e534774",
  "as-code-review-and-quality": "831528a372488919bd233da2ed9c65f318ba2174ea251497242fb5c4f392e1a5",
  "as-security-and-hardening": "dd198e6e26b33384c7737a5c26158bfad137ca3cf090114dec6cd78786c1b2fe",
  "as-frontend-ui-engineering": "51c9a8efd4f7016de08773a3393cdc6ead1eec7a06863de8ca039ccb78a09a4d",
  "as-incremental-implementation": "e36b8449378b93063d1fb487e9f2c58efc6c9d7dd2f34ced3b359676085f5c6e",
  "as-planning-and-task-breakdown": "2c1b385f31456dcccdf81332ec00903ced047f9cfa8332aeaaaba6cb919f549d",
  "as-debugging-and-error-recovery": "a22de82f81e0e1c5e62e29b7623a5cf05ba9c2161a85b690cacf604156ddee7a",
  "as-git-workflow-and-versioning": "c1fa44f39680fc8e35779023040a6e31e4b915722dcf8294e63356fc68dfb78b",
  "as-doubt-driven-development": "b9ff3cb8680cd91aefffadbd7fe4f9c9ec3f1d8cb6a1e778a15f5989530a0b49",
  "ecc-code-tour": "bf5d2c2bec39f6b451c1f7a03c32390a93050a1bafd21baba8b0368fd4cd98c8",
  "ecc-agent-introspection-debugging": "5ae2ac774811919c9ed09394e6e5d953c14a34dc60b2ef5722e40c89c96e3711",
  "ecc-coding-standards": "0d2c67550a07a8fa9945f5804325f52d89d55ddc4481633cfdda44825edcd347",
  "as-using-agent-skills": "8251f28c4680ddfc96e38713f0816cc82938f6fa754b25458a5bd859798c94f4",
  "as-api-and-interface-design": "c92860e9b743d169cb5ed762a8ebd09082f24663ca7c6f626716fb534daf9f54",
  "as-context-engineering": "e26b0ebe0a73a6b0f7cb104c694181d2937138d0fceba4f8773f12b744919246",
  "as-spec-driven-development": "d68571f75119e011cbfa7087dafda0743aef13f4efbfc98bd6f08732878dd8bb",
  "self-improving-agent": "8477a270061ce850c3e580e613dd18f87ccfcdb556348687fce66b5ec77a9158",
  "pptx-generator": ["a0d9d1b839e84492f33d28bfcc1d0526bcc9aefab4e7e53c05ff092f401982d7", "2eb6a4d3fccb07033a7c7446affca663975625e89c15d493c27fb40826d6142d"],
  "sp-brainstorming": "db2bb75deb783905af28d61e7387be800a82a2c4c9900ad92af43d67eb77c418",
  "sp-dispatching-parallel-agents": "077bc5897cb508852aace4975d90dd084764d7c733750045650bd12d8b0b779e",
  "sp-requesting-code-review": "2cc48ff3871fc360aee904a050de1e37c229d2aa7801b3ef75a4ea6ed341dd12",
  "sp-subagent-driven-development": "b0370f154a403766568ad13c303b969132b176130a5ce676c01caa7cb20c794b",
  "sp-systematic-debugging": "4853333b393b3a8d9404178ca58a0e8c1ad998a485233aac0dbfb2ef9ac94ef9",
  "sp-using-git-worktrees": "846b9d8966715ea5a4c373590dc0c0af28a129230f1498eab6771e877eb35406",
  "sp-using-superpowers": "d42105760d85e0391d9fae5cee6463166a4f378575053dbd3483df794a314225",
  "sp-verification-before-completion": "d7964c951960ade343d61bd9f858d5e235b94d9e2c9026f32e7aea4ab05d4697",
  "sp-writing-plans": "1a19a48cd7128565266a9a0b80f1568a26e3b7280d3138beb4763113b7c6f58d",
};

const HOST_ADAPTED_SUPERPOWERS = new Set([
  "sp-brainstorming",
  "sp-dispatching-parallel-agents",
  "sp-systematic-debugging",
  "sp-using-git-worktrees",
  "sp-using-superpowers",
  "sp-writing-plans",
]);

const ORIGINAL_FILES: Readonly<Record<string, string>> = {
  "sp-brainstorming/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "sp-dispatching-parallel-agents/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "sp-systematic-debugging/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "sp-using-git-worktrees/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "sp-using-superpowers/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "sp-writing-plans/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "office-design/scripts/validate_theme.py": "d5e061a300f0fce1480ba5e6399600bf3d30936f08683b00fb0e717233e62e95",
  "pdf/README.md": "9afc9773201fb318e1c81707cc6a187f742f7b34d07f5b390103e02c1e8247f5",
  "pdf/scripts/make.py": "8f8cab930a2fde8f5e0d4f4284cee265c1ad88dd27e7e1248f4060e76b5a6b01",
  "pdf/scripts/pdf_cover.py": "9ffd65961df07ec599aaec0215704d156cc09b6d90feaa439e1913fa3dd39c17",
  "pdf/tests/test_make.py": "54092c8418004ae90a2221118081faa05c58de95388e51090a0ef6e534540030",
  "skill-creator/SKILL.md": "d69fc33633db25cbc1cf91e8a9d3a0e5f2029042c475966fdc4b40817c457520",
  "xlsx/SKILL.md": "eb0f5e1066e2babc1f54307b0046612985d901c5dbda8c6009855b00de95e391",
  "xlsx/scripts/xlsx_workspace.py": "8bb2759728474590455887754ba0a1dad364fb9336f0a7fcde65c799e71929b3",
};

function readUnmodifiedSkill(file: string, expectedHash: string): Buffer | null {
  let original: Buffer;
  try {
    if (!fs.lstatSync(file).isFile()) return null;
    original = fs.readFileSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return createHash("sha256").update(original).digest("hex") === expectedHash ? original : null;
}

export function replaceUnmodifiedSkill(file: string, expectedHash: string, replacement: Buffer): boolean {
  const original = readUnmodifiedSkill(file, expectedHash);
  if (!original) return false;
  const backup = `${file}.pre-firefly.bak`;
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  const temporary = `${file}.migration-${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, replacement, { flag: "wx" });
    if (!fs.readFileSync(file).equals(original)) throw new Error("SKILL_CHANGED_DURING_MIGRATION");
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return true;
}

export async function migrateInstalledSkillSnapshot(userRoot: string, sourceDirectory: string | null): Promise<void> {
  if (!sourceDirectory || !fs.existsSync(sourceDirectory) || !fs.existsSync(userRoot)) return;
  assertSkillMigrationPath(sourceDirectory);
  const root = fs.realpathSync(userRoot);
  const pending: Array<[string, string]> = [];
  for (const [relative, hash] of Object.entries(ORIGINAL_FILES)) {
    const target = path.join(root, relative);
    if (!fs.existsSync(target)) continue;
    const location = path.relative(root, fs.realpathSync(target));
    if (location === ".." || location.startsWith(`..${path.sep}`) || path.isAbsolute(location)) throw new Error("SKILL_MIGRATION_PATH_ESCAPE");
    if (readUnmodifiedSkill(target, hash)) pending.push([relative, hash]);
  }
  const bundleIds = new Set([...Object.keys(MANAGED_BUNDLES), ...managedVersions.versions.map(version => version.id)]);
  const bundles = [...bundleIds].flatMap(id => {
    const hashes = MANAGED_BUNDLES[id];
    const priorVersions = managedVersions.versions.filter(version => version.id === id);
    const recognized = [...(typeof hashes === "string" ? [hashes] : hashes ?? []), ...priorVersions.map(version => version.bodySha256)]
      .find(hash => readUnmodifiedSkill(path.join(root, id, "SKILL.md"), hash) !== null);
    if (!recognized) return [];
    if (!id.startsWith("sp-") || HOST_ADAPTED_SUPERPOWERS.has(id)
      || id === "sp-requesting-code-review" || id === "sp-subagent-driven-development") return [[id, recognized] as const];
    return !readUnmodifiedSkill(path.join(root, id, "LICENSE"), "a37e0e9697144819e1d965176ac4ae5bc3fa02d11e7812036bbcadf6dafe2400")
      || !readUnmodifiedSkill(path.join(root, id, "NOTICE.md"), "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3")
      ? [[id, recognized] as const] : [];
  });
  if (pending.length === 0 && bundles.length === 0) return;
  for (const [relative, hash] of pending) {
    const target = path.join(root, relative);
    const replacement = path.join(sourceDirectory, relative);
    assertSkillMigrationPath(replacement);
    if (!fs.existsSync(target)) continue;
    const location = path.relative(root, fs.realpathSync(target));
    if (location === ".." || location.startsWith(`..${path.sep}`) || path.isAbsolute(location)) throw new Error("SKILL_MIGRATION_PATH_ESCAPE");
    replaceUnmodifiedSkill(target, hash, fs.readFileSync(replacement));
  }
  for (const [id, hash] of bundles) {
    const priorVersion = managedVersions.versions.find(version => version.id === id && version.bodySha256 === hash);
    const recognizedFiles = priorVersion ? Object.fromEntries(Object.entries(priorVersion.files)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")) : Object.fromEntries(Object.entries(managedFiles.files)
      .filter(([file]) => file.startsWith(`${id}/`))
      .map(([file, fileHash]) => [file.slice(id.length + 1), fileHash]));
    try {
      const updated = updateInstalledSkillDirectory(path.join(root, id), stage =>
        updateManagedSkillBundle(stage, path.join(sourceDirectory, id), hash, recognizedFiles));
      if (!updated) console.info("[Skills] managed update preserved installed bundle", { id });
    } catch (error) {
      const reason = error instanceof Error && /^SKILL_[A-Z_]+$/.test(error.message) ? error.message : "SKILL_UPDATE_FAILED";
      console.warn("[Skills] managed update incomplete; originals retained for recovery", { id, reason });
    }
  }
}
