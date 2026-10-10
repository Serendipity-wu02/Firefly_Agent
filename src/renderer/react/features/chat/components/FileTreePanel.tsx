// FileTreePanel — 右侧面板的会话工作区文件树 + 文件预览。
//
// 文件树：antd Tree.DirectoryTree，首次只拉根目录，展开目录节点时再拉该层；点击目录名即展开。
// 文件预览：点击文件由 ChatPage 打开 file:<relPath> 标签，内容走
// workspaceFiles.read（主进程 realpath 防越界、1MB 上限、二进制拒绝）。
// 高亮：shiki 单例 + github-light 主题，按扩展名选语言；渐进式渲染（先纯文本后上色），
// 高亮失败或语言不支持时保持纯文本，不阻塞阅读。

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Tree } from "antd";
import type { DataNode, EventDataNode } from "antd/es/tree";
import { FileText, RefreshCw } from "lucide-react";
import { createHighlighter, type BundledLanguage, type Highlighter, type ThemedToken } from "shiki";
import { useTranslation } from "../../../i18n";
import { uiColorContrast, uiColorTokens } from "../../../../../shared/ui-colors";
import type { WorkspaceFileEntry, WorkspaceFileErrorCode, WorkspaceReadResult } from "../../../../../shared/workspace-files-types";
import { MarkdownContent } from "./ChatMessageList";
import { releaseFocusedDescendant } from "./focus-handoff";
import { vscodeIconForFile } from "./vscodeFileIcon";
import { WorkspaceTextEditor, workspaceEditorKey, useWorkspaceEditorState, getWorkspaceEditorState, consumeWorkspaceEditorSave } from "./WorkspaceTextEditor";
import "./FileTreePanel.css";

/** 预览最多渲染的行数：再多一次性铺 DOM 会卡 */
const PREVIEW_MAX_LINES = 2000;

/** shiki 主题：亮色 GitHub 主题，配色和应用的浅色界面匹配 */
const HIGHLIGHT_THEME = "github-light";

/** 按扩展名支持的语法（与 HIGHLIGHT_LANGS 列表保持一致） */
const EXT_LANG: Record<string, BundledLanguage> = {
  ts: "typescript", tsx: "tsx", mts: "typescript",
  js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "jsonc",
  css: "css", scss: "scss",
  html: "html", htm: "html",
  md: "markdown", markdown: "markdown",
  py: "python",
  sh: "bash", bash: "bash", zsh: "bash",
  yml: "yaml", yaml: "yaml",
  xml: "xml", svg: "xml",
  toml: "toml", sql: "sql", go: "go", rs: "rust", java: "java",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp", cxx: "cpp",
};

/** 从相对路径取语言（不认识的扩展名返回 undefined → 纯文本） */
function langForPath(relPath: string): BundledLanguage | undefined {
  const name = relPath.slice(relPath.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return undefined;
  return EXT_LANG[name.slice(dot + 1).toLowerCase()];
}

/** 是否是 Markdown 文件（预览/源码可切换） */
function isMarkdownPath(relPath: string): boolean {
  return /\.(md|markdown)$/i.test(relPath);
}

/** 眼睛图标：渲染预览 */
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 36C35.0457 36 44 24 44 24C44 24 35.0457 12 24 12C12.9543 12 4 24 4 24C4 24 12.9543 36 24 36Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
      <path d="M24 29C26.7614 29 29 26.7614 29 24C29 21.2386 26.7614 19 24 19C21.2386 19 19 21.2386 19 24C19 26.7614 21.2386 29 24 29Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

/** 代码图标：源码视图 */
function CodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M18 16L10 24L18 32" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 16L38 24L30 32" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// shiki 高亮器全局单例：只创建一次，语言随初始化按需懒加载
let highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [HIGHLIGHT_THEME],
      langs: [...new Set(Object.values(EXT_LANG))],
    });
  }
  return highlighterPromise;
}

/** 错误码 → i18n key（树与预览共用） */
const ERROR_KEYS: Record<WorkspaceFileErrorCode, string> = {
  NO_WORKSPACE: "fileTree.errNoWorkspace",
  OUT_OF_ROOT: "fileTree.errOutOfRoot",
  NOT_FOUND: "fileTree.errNotFound",
  IS_DIRECTORY: "fileTree.errIsDirectory",
  TOO_LARGE: "fileTree.errTooLarge",
  BINARY: "fileTree.errBinary",
  LIST_FAILED: "fileTree.errListFailed",
  READ_FAILED: "fileTree.errReadFailed",
  INVALID_REQUEST: "fileTree.errInvalidRequest",
  FORBIDDEN: "fileTree.errForbidden",
  CANCELLED: "fileTree.errCancelled",
  CONFLICT: "fileTree.errConflict",
  WORKSPACE_CHANGED: "fileTree.errWorkspaceChanged",
  LINK_READ_ONLY: "fileTree.errLinkReadOnly",
  UNSUPPORTED_TEXT: "fileTree.errUnsupportedText",
  READ_ONLY: "fileTree.errReadOnly",
  WRITE_FAILED: "fileTree.errWriteFailed",
  WRITE_BUSY: "fileTree.errWriteBusy",
};

interface TreeItem extends DataNode {
  key: string;
  title: string;
  isDir: boolean;
  /** 目录子级是否已拉取（懒加载标记） */
  loaded?: boolean;
  /** 覆写 DataNode 的宽泛 children 类型，保证 attachChildren 递归参数匹配 */
  children?: TreeItem[];
}

/** 条目 → 树节点（文件按类型显示 VS Code 官方图标，目录用 📂/📁 emoji） */
function toTreeItem(entry: WorkspaceFileEntry): TreeItem {
  return {
    key: entry.relPath,
    title: entry.name,
    isDir: entry.isDir,
    isLeaf: !entry.isDir,
    icon: entry.isDir
      ? (props: { expanded?: boolean }) => (
          <span className="cy-file-tree__folder-icon" aria-hidden="true">
            {props.expanded ? "📁" : "📂"}
          </span>
        )
      : () => {
          const iconUrl = vscodeIconForFile(entry.name);
          return iconUrl
            ? <img className="cy-file-tree__type-icon" src={iconUrl} alt="" width={14} height={14} />
            : <FileText size={14} strokeWidth={1.75} aria-hidden="true" />;
        },
  };
}

/** 把拉取到的子级挂到指定目录节点上（递归查找） */
function attachChildren(items: TreeItem[], parentKey: string, children: TreeItem[]): TreeItem[] {
  return items.map((item) => {
    if (item.key === parentKey) return { ...item, children, loaded: true };
    if (item.children) return { ...item, children: attachChildren(item.children, parentKey, children) };
    return item;
  });
}

export function FileTreePanel({
  sessionId,
  workspaceRoot,
  onOpenFile,
  refreshRevision,
}: {
  sessionId: string;
  /** 工作区根路径（仅用于判定是否绑定；实际访问全部走 sessionId 由主进程校验） */
  workspaceRoot?: string;
  onOpenFile: (relPath: string) => void;
  /** 外部工作区变更通知；变化时重新读取目录及展开的子目录。 */
  refreshRevision?: number | string;
}) {
  const { t } = useTranslation();
  const [treeData, setTreeData] = useState<TreeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<WorkspaceFileErrorCode | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const expandedRef = useRef<string[]>([]);
  const workspaceRef = useRef({ sessionId, workspaceRoot });
  // 每次读取周期都有独立身份，旧根目录/懒加载结果不能写入新周期。
  const requestScope = useMemo(() => ({ active: false, generation: 0 }), [sessionId, workspaceRoot, refreshRevision, refreshSequence]);
  // 文件树根容器引用：切标签前用它释放焦点，避免 aria-hidden 区域持有 activeElement
  const treeRootRef = useRef<HTMLDivElement>(null);

  const listDirectory = useCallback(async (relPath: string) => {
    const api = window.workspaceFiles;
    if (!api) throw new Error("workspaceFiles API unavailable");
    const result = await api.list(sessionId, relPath);
    if (!result.ok) throw Object.assign(new Error(result.code), { code: result.code });
    return { items: result.entries.map(toTreeItem), truncated: Boolean(result.truncated) };
  }, [sessionId]);

  useEffect(() => {
    requestScope.active = true;
    const generation = ++requestScope.generation;
    const isCurrent = () => requestScope.active && requestScope.generation === generation;
    if (workspaceRef.current.sessionId !== sessionId || workspaceRef.current.workspaceRoot !== workspaceRoot) {
      expandedRef.current = [];
      setExpandedKeys([]);
      workspaceRef.current = { sessionId, workspaceRoot };
    }
    setLoading(Boolean(workspaceRoot));
    setError(null);
    setTreeData([]);
    setTruncated(false);
    if (!workspaceRoot) return () => { requestScope.active = false; };

    const expanded = new Set(expandedRef.current);
    let nextTruncated = false;
    // 保持展开状态，但不沿用已缓存的子节点；目录消失时不会再请求它。
    const readExpanded = async (relPath: string): Promise<TreeItem[]> => {
      const result = await listDirectory(relPath);
      if (!isCurrent()) return [];
      nextTruncated ||= result.truncated;
      return Promise.all(result.items.map(async (item) => item.isDir && expanded.has(item.key)
        ? { ...item, loaded: true, children: await readExpanded(item.key) }
        : item));
    };
    readExpanded("")
      .then((items) => {
        if (!isCurrent()) return;
        setTreeData(items);
        setTruncated(nextTruncated);
      })
      .catch((err: { code?: WorkspaceFileErrorCode }) => {
        if (isCurrent()) setError(err?.code ?? "LIST_FAILED");
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    return () => { requestScope.active = false; };
  }, [listDirectory, sessionId, workspaceRoot, requestScope]);

  const loadData = useCallback(async (node: EventDataNode<TreeItem>) => {
    const item = node as unknown as TreeItem;
    if (!requestScope.active || !item.isDir || item.loaded) return;
    const generation = requestScope.generation;
    const isCurrent = () => requestScope.active && requestScope.generation === generation;
    try {
      const result = await listDirectory(item.key);
      if (!isCurrent()) return;
      setTreeData((current) => attachChildren(current, item.key, result.items));
      setTruncated((current) => current || result.truncated);
    } catch (err) {
      if (isCurrent()) setError((err as { code?: WorkspaceFileErrorCode })?.code ?? "LIST_FAILED");
    }
  }, [listDirectory, requestScope]);

  const stateMessage = !workspaceRoot ? t("fileTree.errNoWorkspace")
    : loading ? t("fileTree.loading")
    : error ? t(ERROR_KEYS[error])
    : treeData.length === 0 ? t("fileTree.empty") : null;

  return (
    <div className="cy-file-tree" ref={treeRootRef} aria-busy={loading}>
      <div className="cy-file-tree__header">
        <span>{t("fileTree.title")}</span>
        <button
          type="button"
          className="cy-file-refresh"
          aria-label={t("fileTree.refresh")}
          title={!workspaceRoot ? t("fileTree.errNoWorkspace") : t("fileTree.refresh")}
          disabled={!workspaceRoot || loading}
          onClick={() => setRefreshSequence((value) => value + 1)}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {t("fileTree.refresh")}
        </button>
      </div>
      {stateMessage ? <div className="cy-file-tree__state" role="status">{stateMessage}</div> : (
        <Tree.DirectoryTree
          treeData={treeData}
          loadData={loadData}
          expandedKeys={expandedKeys}
          onExpand={(keys) => {
            if (!requestScope.active) return;
            const next = keys.map(String);
            expandedRef.current = next;
            setExpandedKeys(next);
          }}
          showIcon
          blockNode
          onSelect={(_keys, info) => {
            const item = info.node as unknown as TreeItem;
            if (!item.isDir) {
              releaseFocusedDescendant(treeRootRef.current);
              onOpenFile(item.key);
            }
          }}
        />
      )}
      {truncated && <div className="cy-file-tree__truncated">{t("fileTree.truncated", { count: 1000 })}</div>}
    </div>
  );
}

// The shared color bootstrap owns this attribute. Observing it changes only token
// presentation; it must not trigger another file read or mutate the theme itself.
function subscribePreviewColors(changed: () => void): () => void {
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui-colors"] });
  return () => observer.disconnect();
}
function previewColorSnapshot(): string {
  return document.documentElement.dataset.uiColors ?? "";
}

export function FilePreviewContent({
  sessionId,
  workspaceRoot,
  relPath,
  scrollToLine,
  lineSeq,
  refreshRevision,
}: {
  sessionId: string;
  workspaceRoot?: string;
  relPath: string;
  /** 从消息文件链接跳转过来时定位到该行（居中滚动）；缺省不做定位 */
  scrollToLine?: number;
  /** 定位序号：同标签换行号时靠它变化触发重新滚动 */
  lineSeq?: number;
  /** 外部工作区变更通知；不重置用户选择的 Markdown 展示方式。 */
  refreshRevision?: number | string;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "error"; code: WorkspaceFileErrorCode }
    | ({ phase: "ok" } & Extract<WorkspaceReadResult, { ok: true }>)
  >({ phase: "loading" });
  // shiki 高亮结果（null = 未高亮/不支持，先按纯文本渲染）
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const customColorKey = useSyncExternalStore(subscribePreviewColors, previewColorSnapshot, () => "");
  const customPalette = useMemo(() => {
    if (!customColorKey) return null;
    const [accent, background, foreground] = customColorKey.split(":");
    return uiColorTokens({ enabled: true, accent, background, foreground });
  }, [customColorKey]);
  const tokenColor = (color: string) => customPalette && uiColorContrast({
    background: customPalette["--cy-bg-page"], foreground: color,
  }) < 4.5 ? customPalette["--cy-text"] : color;

  // Markdown 文件的查看方式：渲染预览 / 源码（非 md 文件不用）；
  // 带行号定位跳转过来时直接进源码视图（预览视图没有行号概念）
  const isMarkdown = isMarkdownPath(relPath);
  const [mdView, setMdView] = useState<"preview" | "source">(scrollToLine === undefined ? "preview" : "source");
  const scrollHostRef = useRef<HTMLDivElement>(null);
  const editorKey = workspaceEditorKey(sessionId, workspaceRoot, relPath);
  const editorState = useWorkspaceEditorState(editorKey);
  const editing = Boolean(editorState?.draft);
  const [refreshSequence, setRefreshSequence] = useState(0);

  useEffect(() => {
    // 只有切换文件时恢复默认视图，刷新和失败重试保留用户选择。
    setMdView(scrollToLine === undefined ? "preview" : "source");
  }, [sessionId, relPath]);

  useEffect(() => {
    let cancelled = false;
    const draft = getWorkspaceEditorState(editorKey)?.draft;
    if (draft) {
      setState({ phase: "ok", ok: true, content: draft.original, size: draft.size, editVersion: draft.editVersion });
      return;
    }
    setState({ phase: "loading" });
    setTokens(null);
    const api = window.workspaceFiles;
    if (!api) {
      setState({ phase: "error", code: "READ_FAILED" });
      return;
    }
    api.read(sessionId, relPath)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setState({ phase: "error", code: result.code });
          return;
        }
        setState({ phase: "ok", ...result });
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "error", code: "READ_FAILED" });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, relPath, editorKey, refreshRevision, refreshSequence]);

  useEffect(() => {
    if (!editorState?.saved) return;
    setState({ phase: "ok", ...editorState.saved });
    consumeWorkspaceEditorSave(editorKey);
  }, [editorKey, editorState?.saved]);

  const highlightedText = state.phase === "ok" ? state.content : undefined;
  useEffect(() => {
    let cancelled = false;
    setTokens(null);
    const lang = langForPath(relPath);
    if (highlightedText !== undefined && lang) getHighlighter()
      .then(highlighter => highlighter.codeToTokens(highlightedText, { lang, theme: HIGHLIGHT_THEME }))
      .then(highlight => { if (!cancelled) setTokens(highlight.tokens); })
      .catch(() => { /* Plain text remains readable when highlighting fails. */ });
    return () => { cancelled = true; };
  }, [editorKey, relPath, highlightedText]);

  // 行号定位：文件内容就绪后把目标行滚到视口中间；lineSeq 变化（同标签换行号）时重滚
  useEffect(() => {
    if (state.phase !== "ok" || scrollToLine === undefined) return;
    const host = scrollHostRef.current;
    if (!host) return;
    const row = host.querySelector<HTMLElement>(`[data-line="${scrollToLine}"]`);
    row?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [state.phase, scrollToLine, lineSeq, mdView]);

  // 高亮结果与纯文本统一成"每行一个 token 列表"的结构再渲染。
  const text = state.phase === "ok" ? state.content : "";
  const totalLines = tokens ? tokens.length : text.split("\n").length;
  const lineTokens: ThemedToken[][] = tokens ?? text.split("\n").map((line) => [{ content: line, offset: 0 }]);
  const lines = lineTokens.slice(0, PREVIEW_MAX_LINES);
  const renderedContent = isMarkdown && totalLines > PREVIEW_MAX_LINES
    ? text.split("\n").slice(0, PREVIEW_MAX_LINES).join("\n")
    : text;

  return (
    <div className="cy-file-preview" ref={scrollHostRef} aria-busy={state.phase === "loading"}>
      <div className="cy-file-preview__header">
        <span className="cy-file-preview__path" title={relPath}>{relPath}</span>
        {state.phase === "ok" && <span className="cy-file-preview__size">{(state.size / 1024).toFixed(1)} KB</span>}
        <button
          type="button"
          className="cy-file-refresh"
          aria-label={t("fileTree.refreshPreview")}
          title={t("fileTree.refreshPreview")}
          disabled={state.phase === "loading" || editing}
          onClick={() => setRefreshSequence((value) => value + 1)}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
        {isMarkdown && !editing && (
          <span className="cy-file-preview__md-toggle" role="group" aria-label={t("rightInspector.toggle")}>
            <button
              type="button"
              className={`cy-file-preview__md-btn ${mdView === "preview" ? "is-active" : ""}`}
              onClick={() => setMdView("preview")}
              aria-label={t("fileTree.viewPreview")}
              title={t("fileTree.viewPreview")}
            >
              <EyeIcon />
            </button>
            <button
              type="button"
              className={`cy-file-preview__md-btn ${mdView === "source" ? "is-active" : ""}`}
              onClick={() => setMdView("source")}
              aria-label={t("fileTree.viewSource")}
              title={t("fileTree.viewSource")}
            >
              <CodeIcon />
            </button>
          </span>
        )}
      </div>
      <WorkspaceTextEditor editorKey={editorKey} sessionId={sessionId} relPath={relPath}
        snapshot={state.phase === "ok" ? state : undefined} errorText={code => t(ERROR_KEYS[code])} />
      {editing ? null : state.phase !== "ok" ? (
        <div className="cy-file-preview__state" role="status">
          {state.phase === "loading" ? t("fileTree.previewLoading") : t(ERROR_KEYS[state.code])}
        </div>
      ) : isMarkdown && mdView === "preview" ? (
        <div className="cy-file-preview__markdown">
          <MarkdownContent content={renderedContent} />
        </div>
      ) : (
        <pre className="cy-file-preview__code">
          {lines.map((line, index) => (
            <div className="cy-file-preview__line" key={index} data-line={index + 1}>
              <span className="cy-file-preview__lineno">{index + 1}</span>
              <span className="cy-file-preview__text">
                {line.map((token, tokenIndex) =>
                  token.color ? (
                    <span key={tokenIndex} style={{ color: tokenColor(token.color) }}>{token.content}</span>
                  ) : (
                    token.content
                  ),
                )}
              </span>
            </div>
          ))}
        </pre>
      )}
      {!editing && state.phase === "ok" && totalLines > PREVIEW_MAX_LINES && (
        <div className="cy-file-preview__truncated">
          {t("fileTree.previewLinesHint", { count: PREVIEW_MAX_LINES })}
        </div>
      )}
    </div>
  );
}
