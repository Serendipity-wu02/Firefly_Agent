import type { ExternalSkill, ExternalSkillSourceId } from "../../shared/external-skills";
import { EXTERNAL_LIMITS, EXTERNAL_SOURCES, externalSkillId } from "./external-policy";
import { ExternalFetchError, parseExternalJson, validateExternalPath, type ExternalFetcher, type ExternalTree, type ExternalRequestDiagnostic } from "./external-fetch";

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new ExternalFetchError("CATALOG_INVALID");
  return value as Record<string, unknown>;
}
function label(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) throw new ExternalFetchError("CATALOG_INVALID");
  return value;
}
function optionalLabel(value: unknown): string | undefined { return value === undefined ? undefined : label(value); }
function localPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("./")) throw new ExternalFetchError("PATH_INVALID");
  const relative = value.slice(2);
  return validateExternalPath(relative.endsWith("/") ? relative.slice(0, -1) : relative);
}

/** Read-only expansion of the real upstream schema. Content review is deferred to preparation. */
export async function discoverExternalSkills(sourceId: ExternalSkillSourceId, fetcher: ExternalFetcher, signal: AbortSignal, declarations?: Map<string, string>, diagnose?: (diagnostic: ExternalRequestDiagnostic) => void): Promise<ExternalSkill[]> {
  if (typeof sourceId !== "string" || !Object.hasOwn(EXTERNAL_SOURCES, sourceId)) throw new ExternalFetchError("SOURCE_INVALID");
  if (signal.aborted) throw new ExternalFetchError("CANCELLED");
  const controller = new AbortController();
  let abortError: ExternalFetchError | undefined, rejectAbort!: (error: ExternalFetchError) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abort = (error: ExternalFetchError) => { if (!abortError) { abortError = error; controller.abort(); rejectAbort(error); } };
  const onCancel = () => abort(new ExternalFetchError("CANCELLED"));
  signal.addEventListener("abort", onCancel, { once: true });
  const timeout = setTimeout(() => abort(new ExternalFetchError("PREPARE_TIMEOUT", true)), EXTERNAL_LIMITS.prepareMs);
  const check = () => { if (abortError) throw abortError; };
  let diagnosticStage: ExternalRequestDiagnostic["stage"] = "metadata", catalogBytes = 0;
  const work = async () => {
    const source = EXTERNAL_SOURCES[sourceId], commit = await fetcher.resolveCommit(sourceId, controller.signal); check();
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new ExternalFetchError("CATALOG_INVALID");
    diagnosticStage = "tree";
    const tree: ExternalTree = await fetcher.readTree(sourceId, commit, controller.signal); check();
    if (tree.commit !== commit) throw new ExternalFetchError("TREE_INVALID");
    const byPath = new Map(tree.entries.map(entry => [entry.path, entry]));
    async function readJson(path: string) {
      check(); const file = byPath.get(path);
      if (!file || file.type !== "blob") throw new ExternalFetchError("CATALOG_INVALID");
      if (file.size !== undefined && file.size > EXTERNAL_LIMITS.catalogBytes) throw new ExternalFetchError("LIMIT_EXCEEDED");
      const bytes = await fetcher.readBlob(sourceId, file.sha, EXTERNAL_LIMITS.catalogBytes, controller.signal, "catalog"); check();
      if (bytes.length > EXTERNAL_LIMITS.catalogBytes) throw new ExternalFetchError("LIMIT_EXCEEDED");
      catalogBytes = bytes.length; return object(parseExternalJson(bytes));
    }
    diagnosticStage = "catalog";
    const catalog = await readJson(source.catalogPath);
    if (!Array.isArray(catalog.plugins) || catalog.plugins.length > EXTERNAL_LIMITS.candidates) {
      throw new ExternalFetchError(Array.isArray(catalog.plugins) ? "LIMIT_EXCEEDED" : "CATALOG_INVALID");
    }
    const metadata = catalog.metadata === undefined ? {} : object(catalog.metadata);
    const catalogVersion = optionalLabel(metadata.version);
    const candidates: ExternalSkill[] = [], identities = new Map<string, string>();
    function add(path: string, bundle: ExternalSkill["bundle"], description: string, blocked = false, declarationRoot?: string) {
      validateExternalPath(path); check();
      if (!blocked && byPath.get(path + "/SKILL.md")?.type !== "blob") throw new ExternalFetchError("CATALOG_INVALID");
      const id = externalSkillId(sourceId, source.repository, path);
      if (identities.has(id)) throw new ExternalFetchError("CATALOG_INVALID");
      identities.set(id, path);
      if (declarationRoot) declarations?.set(id, declarationRoot);
      if (candidates.length >= EXTERNAL_LIMITS.candidates) throw new ExternalFetchError("LIMIT_EXCEEDED");
      candidates.push({ id, sourceId, upstreamName: blocked ? bundle.name : path.split("/").at(-1)!, description,
        bundle, repository: source.repository, path, commit, licenses: [], files: [],
        ...(declarationRoot ? { declaration: "pending" as const } : sourceId === "anthropic" ? { declaration: "verified" as const } : {}),
        review: blocked ? "blocked" : "unreviewed", blockers: blocked ? ["DEPENDENCY_BLOCKED"] : ["REVIEW_REQUIRED"] });
    }
    if (sourceId === "anthropic") {
      for (const raw of catalog.plugins) {
        const plugin = object(raw), name = label(plugin.name);
        if (plugin.source !== "./" || !Array.isArray(plugin.skills)) throw new ExternalFetchError("CATALOG_INVALID");
        const version = optionalLabel(plugin.version) ?? catalogVersion, license = optionalLabel(plugin.license);
        const bundle = { name, ...(version ? { version } : {}), ...(license ? { license } : {}) };
        const description = optionalLabel(plugin.description) ?? "";
        for (const path of plugin.skills) add(localPath(path), bundle, description);
      }
    } else {
      const plugins = catalog.plugins.map(raw => {
        const plugin = object(raw), name = label(plugin.name), origin = object(plugin.source);
        if (!["local", "url", "git-subdir"].includes(origin.source as string)) throw new ExternalFetchError("CATALOG_INVALID");
        return { plugin, name, origin };
      });
      for (const { plugin, name, origin } of plugins) {
        check();
        if (origin.source !== "local") {
          // Inert third-party metadata is validated but never fetched.
          try {
            if (typeof origin.url !== "string" || /[\\%#\x00-\x1f\x7f]/.test(origin.url)) throw new Error();
            const url = new URL(origin.url);
            if (url.protocol !== "https:" || url.username || url.password || url.hash || url.href !== origin.url) throw new Error();
            validateExternalPath(url.pathname.slice(1));
            if (origin.source === "git-subdir") validateExternalPath(origin.path);
          } catch { throw new ExternalFetchError("CATALOG_INVALID"); }
          const safeName = validateExternalPath(name);
          if (safeName.includes("/")) throw new ExternalFetchError("PATH_INVALID");
          add("catalog-entry/" + safeName, { name }, "Informational-only external repository entry; no-import. " + (optionalLabel(plugin.description) ?? ""), true);
          continue;
        }
        const root = localPath(origin.path);
        for (const entry of tree.entries) {
          if (entry.type !== "blob" || !entry.path.startsWith(root + "/") || !entry.path.endsWith("/SKILL.md")) continue;
          add(entry.path.slice(0, -"/SKILL.md".length), { name }, optionalLabel(plugin.description) ?? "", false, root);
        }
      }
    }
    check();
    if (!candidates.length) throw new ExternalFetchError("CATALOG_INVALID");
    return candidates.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  };
  try { return await Promise.race([work(), aborted]); }
  catch (error) {
    const failure = abortError ?? (error instanceof ExternalFetchError ? error : new ExternalFetchError("NETWORK_FAILED", true));
    if (!failure.diagnostic) {
      try { diagnose?.({ sourceId, stage: diagnosticStage, status: null, contentType: "json", bytes: catalogBytes, errorClass: "ExternalFetchError", code: failure.code }); } catch { /* Diagnostics cannot replace the failure. */ }
    }
    // Stop siblings immediately after any failure, including injected fetchers that ignore abort.
    abortError = failure; controller.abort();
    throw failure;
  } finally { clearTimeout(timeout); signal.removeEventListener("abort", onCancel); }
}

/** Main checks a pending real path against its pinned owning manifest before content review. */
export async function verifyExternalSkillDeclaration(skill: ExternalSkill, root: string, tree: ExternalTree, fetcher: ExternalFetcher, signal: AbortSignal, diagnose?: (diagnostic: ExternalRequestDiagnostic) => void): Promise<ExternalSkill> {
  let bytes = 0;
  try {
    if (skill.sourceId !== "openai" || skill.commit !== tree.commit || !skill.path.startsWith(validateExternalPath(root) + "/")) throw new ExternalFetchError("TREE_INVALID");
    if (signal.aborted) throw new ExternalFetchError("CANCELLED");
    const entry = tree.entries.find(item => item.path === root + "/.codex-plugin/plugin.json");
    if (!entry || entry.type !== "blob") throw new ExternalFetchError("CATALOG_INVALID");
    if (entry.size !== undefined && entry.size > EXTERNAL_LIMITS.catalogBytes) throw new ExternalFetchError("LIMIT_EXCEEDED");
    const raw = await fetcher.readBlob("openai", entry.sha, EXTERNAL_LIMITS.catalogBytes, signal, "catalog"); bytes = raw.length;
    if (raw.length > EXTERNAL_LIMITS.catalogBytes) throw new ExternalFetchError("LIMIT_EXCEEDED");
    if (signal.aborted) throw new ExternalFetchError("CANCELLED");
    const manifest = object(parseExternalJson(raw)), name = label(manifest.name), version = optionalLabel(manifest.version), license = optionalLabel(manifest.license);
    const bundle = { name, ...(version ? { version } : {}), ...(license ? { license } : {}) };
    let declared = false;
    if (manifest.skills !== undefined) {
      const roots = typeof manifest.skills === "string" ? [manifest.skills] : manifest.skills;
      if (!Array.isArray(roots) || roots.length === 0) throw new ExternalFetchError("CATALOG_INVALID");
      const verifiedRoots = roots.map(value => root + "/" + localPath(value));
      declared = verifiedRoots.some(skillRoot => skill.path === skillRoot || (skill.path.startsWith(skillRoot + "/") && skill.path.slice(skillRoot.length + 1).split("/").length === 1));
    }
    const description = optionalLabel(manifest.description) ?? skill.description;
    return declared ? { ...skill, bundle, description, declaration: "verified" }
      : { ...skill, bundle, description, declaration: "blocked", review: "blocked", blockers: ["DEPENDENCY_BLOCKED"] };
  } catch (error) {
    const failure = error instanceof ExternalFetchError ? error : new ExternalFetchError("NETWORK_FAILED", true);
    if (!failure.diagnostic) {
      try { diagnose?.({ sourceId: skill.sourceId, stage: "catalog", status: null, contentType: "json", bytes, errorClass: error instanceof ExternalFetchError ? "ExternalFetchError" : "Error", code: failure.code }); } catch { /* Diagnostics cannot alter declaration validation. */ }
    }
    throw failure;
  }
}
