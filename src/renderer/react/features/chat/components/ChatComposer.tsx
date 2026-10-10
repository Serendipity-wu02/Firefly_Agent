import { DesktopAsrButton } from "./DesktopAsrButton";
import { Sender } from "@ant-design/x";
import { Popover } from "antd";
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useTranslation } from "../../../i18n";
import { resolveAsset } from "../../../../../shared/renderer-base";
import type { ContextUsageSnapshot } from "../../../../../shared/context-usage";
import { ContextUsageRing } from "./ContextUsageRing";
import "./ModelEffortControl.css";
import { StyleControl } from "./StyleControl";
import { PermissionControl } from "./PermissionControl";
import { PlanModeToggle } from "./PlanModeToggle";
import { ModelEffortControl } from "./ModelEffortControl";
import { PendingQueueDock, type PendingQueueDockItem } from "./PendingQueueDock";

interface ChatComposerProps {
  value: string;
  mode: string;
  docked: boolean;
  /** 当前会话 ID：用于上下文用量与计划模式状态。 */
  conversationId?: string;
  workspaceName?: string;
  /** 当前会话绑定的项目根路径：计划文件优先落到工作区 .firefly/。 */
  workspaceRoot?: string;
  attachments: ComposerAttachment[];
  requireDocumentRead?: boolean;
  onRequireDocumentReadChange?: (value: boolean) => void;
  attachmentBusy?: boolean;
  modelBusy?: boolean;
  pendingQueue?: PendingQueueDockItem[];
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  onQueueMessage?: (value: string) => void;
  onRemoveQueuedMessage?: (id: string) => void;
  onEditQueuedMessage?: (id: string, content: string) => Promise<boolean>;
  onAdjustQueuedMessage?: (id: string) => Promise<boolean>;
  onChooseWorkspace: () => void;
  onChooseFiles: (files: File[]) => void;
  onRemoveAttachment: (index: number) => void;
  onScreenshot: () => void;
  /** 粘贴图片（Ctrl+V 剪贴板含图片且无文本时触发）；由父级落临时文件并追加附件。 */
  onPasteImage?: (file: File) => void;
  onChooseSticker: (id: string) => void;
  activeModelProfileId?: string;
  onSelectModelProfile?: (id: string) => void;
  /** 上下文容量快照：运行中实时刷新，空闲时为最近一次终态快照；无快照不渲染圆环。 */
  contextUsage?: ContextUsageSnapshot;
}

export interface ComposerAttachment {
  name: string;
  kind: string;
  filePath?: string;
  mime?: string;
  previewUrl?: string;
  hasAnnotations?: boolean;
  caption?: string;
  status?: string;
  reason?: string;
  imageSendMode?: "direct" | "caption";
}

/** 粘贴图片 MIME 白名单：与主进程截图临时文件的校验口径一致。 */
const PASTE_IMAGE_MIME_WHITELIST = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function PlusIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

interface EnabledSticker {
  id: string;
  src: string;
  description?: string;
}

export function parseComposerMessage(mode: string, content: string): {
  rawContent: string;
  visibleContent: string;
  userSticker?: string;
} {
  const trimmed = content.trim();
  const stickerMatch = trimmed.match(/\[sticker:([^\]]+)\]/i);
  const visibleContent = trimmed.replace(/\[sticker:[^\]]+\]/gi, "").trim();
  if (mode === "code") {
    return { rawContent: visibleContent, visibleContent, userSticker: undefined };
  }
  return {
    rawContent: trimmed,
    visibleContent,
    userSticker: stickerMatch?.[1]?.trim() || undefined,
  };
}

/** Separates what the user typed from recognised `[sticker:id]` markers. Re-appending the markers after the typed
 * text restores the original message content, and typed text round-trips exactly, trailing spaces included. */
export function splitStickerMarkers(value: string, knownIds: ReadonlySet<string>): { visible: string; markers: string[] } {
  const markers: string[] = [];
  const visible = value.replace(/\[sticker:([^\]]+)\]/gi, (marker, rawId: string) => {
    if (!knownIds.has(rawId.trim())) return marker;
    markers.push(marker);
    return "";
  });
  return { visible, markers };
}

function stickerUrl(src: string): string {
  return src.startsWith("/stickers/") ? resolveAsset(src) : src;
}

function StickerGrid({ onChoose }: { onChoose: (id: string) => void }) {
  const { t } = useTranslation();
  const [stickers, setStickers] = useState<EnabledSticker[]>([]);

  useEffect(() => {
    let active = true;
    void window.chat?.getEnabledStickers?.().then((items) => {
      if (active) setStickers(items);
    }).catch(() => {
      if (active) setStickers([]);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="cy-sticker-picker" aria-label={t("composer.stickerList")}>
      {stickers.length === 0 && <span className="cy-sticker-picker__empty">{t("composer.stickerEmpty")}</span>}
      {stickers.map((sticker) => (
        <button type="button" key={sticker.id} title={sticker.description ?? sticker.id} onClick={() => onChoose(sticker.id)}>
          <img src={stickerUrl(sticker.src)} alt={sticker.description ?? sticker.id} draggable={false} />
        </button>
      ))}
    </div>
  );
}

/** What the "+" menu offers; stickers are left out where the mode does not send them. */
export function composerAddMenuEntries(supportsStickers: boolean): Array<"upload" | "screenshot" | "sticker"> {
  return supportsStickers ? ["upload", "screenshot", "sticker"] : ["upload", "screenshot"];
}

function PaperclipIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 11.5-8.6 8.6a5.2 5.2 0 0 1-7.4-7.4l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.7 8.7a1.8 1.8 0 0 1-2.5-2.5l7.9-7.9" /></svg>;
}

function CameraFrameIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><rect x="8" y="8" width="8" height="8" rx="1.5" /></svg>;
}

function SmileIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.2a4.2 4.2 0 0 0 7 0M9 9.6h.01M15 9.6h.01" /></svg>;
}

/** The single "+" entry: attach a file, take a screenshot, or pick a sticker. */
function ComposerAddMenu({ supportsStickers, attachmentBusy, onUpload, onScreenshot, onChooseSticker }: {
  supportsStickers: boolean;
  attachmentBusy: boolean;
  onUpload: () => void;
  onScreenshot: () => void;
  onChooseSticker: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "stickers">("menu");
  const close = () => { setOpen(false); setView("menu"); };
  const entries = composerAddMenuEntries(supportsStickers);

  const menu = (
    <div className="cy-add-menu">
      <span className="cy-add-menu__title">{t("composer.addMenuTitle")}</span>
      {entries.includes("upload") && (
        <button type="button" className="cy-add-menu__item" aria-label={t("composer.uploadFile")} disabled={attachmentBusy} onClick={() => { close(); onUpload(); }}>
          <PaperclipIcon /><span>{t("composer.uploadFile")}</span>
        </button>
      )}
      {entries.includes("screenshot") && (
        <button type="button" className="cy-add-menu__item" aria-label={t("composer.screenshot")} onClick={() => { close(); onScreenshot(); }}>
          <CameraFrameIcon /><span>{t("composer.screenshot")}</span><small>Alt+Shift+S</small>
        </button>
      )}
      {entries.includes("sticker") && (
        <button type="button" className="cy-add-menu__item" aria-label={t("composer.stickerPicker")} onClick={() => setView("stickers")}>
          <SmileIcon /><span>{t("composer.stickerPicker")}</span>
        </button>
      )}
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => { setOpen(next); if (!next) setView("menu"); }}
      trigger="click"
      placement="topLeft"
      rootClassName="cy-add-popover"
      content={view === "stickers" ? (
        <div className="cy-add-menu">
          <button type="button" className="cy-add-menu__back" onClick={() => setView("menu")}><span aria-hidden="true">‹</span><span>{t("composer.stickerPicker")}</span></button>
          <StickerGrid onChoose={(id) => { onChooseSticker(id); close(); }} />
        </div>
      ) : menu}
    >
      <button type="button" className="cy-composer__icon-button cy-composer__add-button" aria-label={t("composer.addMenuTitle")} title={t("composer.addMenuTitle")}>
        <PlusIcon />
      </button>
    </Popover>
  );
}

function FolderIcon() {
  return (
    <svg className="cy-composer__terminal-folder-icon" width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M5 8C5 6.89543 5.89543 6 7 6H19L24 12H41C42.1046 12 43 12.8954 43 14V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z" />
      <path d="M14 22L19 27L14 32" />
      <path d="M26 32H34" />
    </svg>
  );
}

function CodeFolderIcon() {
  return (
    <svg className="cy-composer__code-folder-icon" width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M43 23V14C43 12.8954 42.1046 12 41 12H24L19 6H7C5.89543 6 5 6.89543 5 8V40C5 41.1046 5.89543 42 7 42H22" />
      <path d="M38 29L43 34L38 39" />
      <path d="M30 29L25 34L30 39" />
    </svg>
  );
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>;
}

export function ChatComposer({
  value,
  mode,
  docked,
  conversationId,
  workspaceName,
  workspaceRoot,
  attachments,
  requireDocumentRead = false,
  onRequireDocumentReadChange,
  attachmentBusy = false,
  modelBusy = false,
  pendingQueue = [],
  onChange,
  onSubmit,
  onCancel,
  onQueueMessage,
  onRemoveQueuedMessage,
  onEditQueuedMessage,
  onAdjustQueuedMessage,
  onChooseWorkspace,
  onChooseFiles,
  onRemoveAttachment,
  onScreenshot,
  onPasteImage,
  onChooseSticker,
  activeModelProfileId,
  onSelectModelProfile,
  contextUsage,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compositionActiveRef = useRef(false);
  const [enabledStickers, setEnabledStickers] = useState<EnabledSticker[]>([]);
  const supportsWorkFiles = ["work", "code"].includes(mode);
  const supportsPermission = supportsWorkFiles;
  const supportsPlanToggle = mode === "code";
  const supportsStyle = mode === "chat";
  const supportsStickers = mode !== "code";
  const requiresWorkspace = supportsWorkFiles;
  const placeholder = mode === "chat"
    ? t("composer.placeholderChat")
    : requiresWorkspace && !workspaceName
      ? t("composer.placeholderTaskNoWorkspace")
      : t("composer.placeholderTask");
  const selectedStickerIds = supportsStickers ? [...value.matchAll(/\[sticker:([^\]]+)\]/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean) : [];
  const stickerOccurrences = new Map<string, number>();
  const selectedStickers = selectedStickerIds.map((id) => {
    const occurrence = stickerOccurrences.get(id) ?? 0;
    stickerOccurrences.set(id, occurrence + 1);
    return {
      id,
      occurrence,
      sticker: enabledStickers.find((item) => item.id === id),
    };
  }).filter((item): item is { id: string; occurrence: number; sticker: EnabledSticker } => Boolean(item.sticker));

  // The draft string stays the message content, so it keeps its `[sticker:id]` markers. The text box shows only
  // what the user typed; recognised stickers appear once, as removable thumbnails above it. Unrecognised markers
  // stay visible so they can never become hidden text.
  const { visible: visibleValue, markers: hiddenMarkers } = supportsStickers
    ? splitStickerMarkers(value, new Set(enabledStickers.map((item) => item.id)))
    : { visible: value, markers: [] as string[] };
  const withStickerMarkers = (typed: string) => `${typed}${hiddenMarkers.join("")}`;

  useEffect(() => {
    let active = true;
    void window.chat?.getEnabledStickers?.().then((items) => {
      if (active) setEnabledStickers(items);
    }).catch(() => {
      if (active) setEnabledStickers([]);
    });
    return () => {
      active = false;
    };
  }, []);

  const removeSelectedSticker = (id: string, targetIndex: number) => {
    let index = -1;
    const nextValue = value.replace(/\[sticker:([^\]]+)\]/gi, (marker, rawId: string) => {
      if (rawId.trim() !== id) return marker;
      index += 1;
      return index === targetIndex ? "" : marker;
    });
    onChange(nextValue.replace(/ {2,}/g, " ").trim());
  };

  const hasComposerHeader = attachments.length > 0 || selectedStickers.length > 0;

  // Sender 的 onKeyDown 声明在 Element 层级；函数体只用基类属性，参数随组件声明放宽
  const handleSenderKeyDown = (event: KeyboardEvent<Element>) => {
    if (!modelBusy || event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent;
    if (compositionActiveRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
    event.preventDefault();
    if (value.trim()) onQueueMessage?.(value);
    // Sender 会先调用 onKeyDown；返回 false 可阻止它继续执行内建提交逻辑。
    return false;
  };

  // Ctrl+V 粘贴图片：仅当剪贴板无 text/plain 且含白名单图片时才拦截默认粘贴行为——
  // 浏览器剪贴板常同时带 text/plain + image/png（复制网页富文本），
  // 粗暴拦截会把用户想粘的文字吃掉。大小/临时文件由父级 handlePastedImage 负责。
  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    if (!onPasteImage) return;
    const data = event.clipboardData;
    if (!data || Array.from(data.types).includes("text/plain")) return;
    const imageItem = Array.from(data.items).find((item) =>
      item.kind === "file" && PASTE_IMAGE_MIME_WHITELIST.has(item.type));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    onPasteImage(file);
  };

  return (
    <div
      className={`cy-composer-stack ${docked ? "is-docked" : "is-centered"}`}
      onCompositionStartCapture={() => { compositionActiveRef.current = true; }}
      onCompositionEndCapture={() => { compositionActiveRef.current = false; }}
    >
      <PendingQueueDock
        items={pendingQueue}
        adjustmentAvailable={modelBusy}
        onEdit={onEditQueuedMessage}
        onAdjust={onAdjustQueuedMessage}
        onRemove={onRemoveQueuedMessage}
      />
      {supportsWorkFiles && (
        <div className="cy-composer__project-strip">
          <button type="button" className="cy-composer__footer-button" aria-label={t("composer.workspaceChoose")} onClick={onChooseWorkspace}>
            {mode === "code" ? <CodeFolderIcon /> : <FolderIcon />}
            <span>{workspaceName ?? (docked ? t("composer.workspaceFolder") : t("composer.workspaceEnter"))}</span>
            <ChevronIcon />
          </button>
        </div>
      )}
      <div className="cy-composer-shell">
        <input
          ref={fileInputRef}
          className="cy-composer__file-input"
          type="file"
          accept=".txt,.md,.json,.csv,.log,.png,.jpg,.jpeg,.webp,.gif,.bmp"
          multiple
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            if (files.length > 0) onChooseFiles(files);
            event.currentTarget.value = "";
          }}
        />
        <Sender
        rootClassName="cy-composer"
        value={visibleValue}
        placeholder={modelBusy ? t("composer.placeholderBusy") : placeholder}
        // 忙态使用 Sender 自带的停止按钮；Enter 入队由 onKeyDown 在内建提交前处理。
        loading={modelBusy}
        disabled={!modelBusy && requiresWorkspace && !workspaceName}
        autoSize={{ minRows: 3, maxRows: 7 }}
        onChange={(next) => onChange(withStickerMarkers(next))}
        onCancel={onCancel}
        onPaste={handlePaste}
        onKeyDown={handleSenderKeyDown}
        onSubmit={(submitValue) => {
          const full = withStickerMarkers(submitValue);
          if (!full.trim()) return;
          onSubmit(full);
        }}
        suffix={(actionNode, { components }) => {
          const send = modelBusy ? (
            <components.LoadingButton
              title={t("composer.stopRun")}
              aria-label={t("composer.stopRun")}
            />
          ) : hiddenMarkers.length > 0 && !visibleValue.trim() ? (
            // A sticker alone is a complete message even though the text box is empty.
            <span className="cy-composer__send-sticker"><components.SendButton disabled={false} /></span>
          ) : actionNode;
          return (
            <div className="cy-composer__suffix">
              <ContextUsageRing usage={contextUsage} sessionId={conversationId} busy={modelBusy} />
              {onSelectModelProfile && (
                <ModelEffortControl sessionId={conversationId} activeProfileId={activeModelProfileId} onSelectModelProfile={onSelectModelProfile} />
              )}
              <DesktopAsrButton key={`${mode}:${conversationId ?? "new"}:${workspaceRoot ?? ""}`} onText={text => onChange(`${value}${value && !/\s$/.test(value) ? " " : ""}${text}`)} />
              {send}
            </div>
          );
        }}
        header={hasComposerHeader ? (
          <div className="cy-composer__attachments" aria-label={t("composer.attachmentsLabel")}>
            {attachments.map((attachment, index) => (
              <div className={`cy-composer__attachment ${attachment.kind === "image" && attachment.previewUrl ? "is-image" : ""}`} key={`${attachment.filePath ?? attachment.name}-${index}`}>
                {attachment.kind === "image" && attachment.previewUrl ? (
                  <img src={attachment.previewUrl} alt="" draggable={false} />
                ) : (
                  <span title={attachment.name}>{attachment.name}</span>
                )}
                <button type="button" aria-label={t("composer.removeAttachment", { name: attachment.name })} onClick={() => onRemoveAttachment(index)}>×</button>
              </div>
            ))}
            {selectedStickers.map(({ id, occurrence, sticker }) => (
              <div className="cy-composer__attachment cy-composer__attachment--sticker" key={`${id}-${occurrence}`}>
                <img src={stickerUrl(sticker.src)} alt={sticker.description ?? t("composer.stickerSelected")} draggable={false} />
                <button type="button" aria-label={t("composer.removeSticker")} onClick={() => removeSelectedSticker(id, occurrence)}>×</button>
              </div>
            ))}
          </div>
        ) : undefined}
        prefix={
          <div className="cy-composer__prefix-actions">
            <ComposerAddMenu
              supportsStickers={supportsStickers}
              attachmentBusy={attachmentBusy}
              onUpload={() => fileInputRef.current?.click()}
              onScreenshot={onScreenshot}
              onChooseSticker={onChooseSticker}
            />
            {supportsPermission && <PermissionControl />}
            {supportsPlanToggle && conversationId && (
              <PlanModeToggle conversationId={conversationId} workspaceRoot={workspaceRoot} />
            )}
            {supportsStyle && <StyleControl />}
          </div>
        }
        />
        {mode === "work" && attachments.some((attachment) => attachment.kind === "document") && (
          <div className="cy-composer__footer">
            <label className="cy-composer__read-requirement">
              <input type="checkbox" checked={requireDocumentRead} onChange={(event) => onRequireDocumentReadChange?.(event.target.checked)} />
              {t("composer.requireDocumentRead")}
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
