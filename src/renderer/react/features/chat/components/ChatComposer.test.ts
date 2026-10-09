import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let senderProps: Record<string, unknown> | undefined;

vi.mock("@ant-design/x", () => ({
  Sender: (props: Record<string, unknown>) => {
    senderProps = props;
    return null;
  },
}));

vi.mock("antd", () => ({
  Popover: ({ children }: { children?: unknown }) => children ?? null,
  Segmented: () => null,
}));

vi.mock("./ReasoningControl", () => ({ ReasoningControl: () => null }));
vi.mock("./StyleControl", () => ({ StyleControl: () => null }));
vi.mock("./PermissionControl", () => ({ PermissionControl: () => null }));
vi.mock("../../../../../shared/renderer-base", () => ({ resolveAsset: (path: string) => path }));

import { ChatComposer, parseComposerMessage, splitStickerMarkers } from "./ChatComposer";

describe("ChatComposer cancellation", () => {
  beforeEach(() => {
    senderProps = undefined;
  });

  it("forwards cancellation to the Sender stop button", () => {
    const onCancel = vi.fn();
    vi.stubGlobal("React", React);

    renderToStaticMarkup(createElement(ChatComposer, {
      value: "",
      mode: "chat",
      docked: true,
      attachments: [],
      modelBusy: true,
      onChange: vi.fn(),
      onSubmit: vi.fn(),
      onCancel,
      onChooseWorkspace: vi.fn(),
      onChooseFiles: vi.fn(),
      onRemoveAttachment: vi.fn(),
      onScreenshot: vi.fn(),
      onChooseSticker: vi.fn(),
    }));

    expect(senderProps?.onCancel).toBe(onCancel);
  });

  it("does not disable an active Work run when its workspace label is not loaded", () => {
    vi.stubGlobal("React", React);

    renderToStaticMarkup(createElement(ChatComposer, {
      value: "",
      mode: "work",
      docked: true,
      attachments: [],
      modelBusy: true,
      onChange: vi.fn(),
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      onChooseWorkspace: vi.fn(),
      onChooseFiles: vi.fn(),
      onRemoveAttachment: vi.fn(),
      onScreenshot: vi.fn(),
      onChooseSticker: vi.fn(),
    }));

    expect(senderProps?.disabled).toBe(false);
  });

});

describe("sticker markers in the text box", () => {
  const known = new Set(["firefly-happy", "hug"]);
  it("hides recognised markers from the typed text and restores them after it", () => {
    const { visible, markers } = splitStickerMarkers("你好 [sticker:firefly-happy]", known);
    expect(visible).toBe("你好 ");
    expect(markers).toEqual(["[sticker:firefly-happy]"]);
    expect(`${visible}${markers.join("")}`).toBe("你好 [sticker:firefly-happy]");
  });
  it("keeps a sticker-only draft sendable and every duplicate", () => {
    const { visible, markers } = splitStickerMarkers("[sticker:hug][sticker:hug]", known);
    expect(visible).toBe(""); expect(markers).toEqual(["[sticker:hug]", "[sticker:hug]"]);
  });
  it("round-trips typing, including a trailing space, without moving or losing a marker", () => {
    const original = "a[sticker:hug]";
    const { markers } = splitStickerMarkers(original, known);
    for (const typed of ["a ", "a b", "", "a\n"]) {
      const next = `${typed}${markers.join("")}`;
      expect(splitStickerMarkers(next, known).visible).toBe(typed);
      expect(splitStickerMarkers(next, known).markers).toEqual(markers);
    }
  });
  it("leaves unrecognised markers visible so they can never become hidden text", () => {
    const { visible, markers } = splitStickerMarkers("x [sticker:retired] y", known);
    expect(visible).toBe("x [sticker:retired] y"); expect(markers).toEqual([]);
  });
  it("leaves text without markers untouched", () => {
    expect(splitStickerMarkers("plain [text]", known)).toEqual({ visible: "plain [text]", markers: [] });
  });
});

describe("ChatComposer Code sticker policy", () => {
  const baseProps = {
    value: "",
    docked: true,
    workspaceName: "project",
    attachments: [],
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onChooseWorkspace: vi.fn(),
    onChooseFiles: vi.fn(),
    onRemoveAttachment: vi.fn(),
    onScreenshot: vi.fn(),
    onChooseSticker: vi.fn(),
  };

  it("hides the sticker picker in Code mode but keeps it in Work mode", () => {
    renderToStaticMarkup(createElement(ChatComposer, { ...baseProps, mode: "code" }));
    const codeHtml = renderToStaticMarkup(senderProps?.prefix as React.ReactElement);
    renderToStaticMarkup(createElement(ChatComposer, { ...baseProps, mode: "work" }));
    const workHtml = renderToStaticMarkup(senderProps?.prefix as React.ReactElement);

    expect(codeHtml).not.toContain('aria-label="表情包"');
    expect(workHtml).toContain('aria-label="表情包"');
  });

  it("strips sticker markers without turning them into a Code message sticker", () => {
    expect(parseComposerMessage("code", "检查一下 [sticker:playful]")).toEqual({
      rawContent: "检查一下",
      visibleContent: "检查一下",
      userSticker: undefined,
    });
    expect(parseComposerMessage("work", "检查一下 [sticker:playful]")).toEqual({
      rawContent: "检查一下 [sticker:playful]",
      visibleContent: "检查一下",
      userSticker: "playful",
    });
  });

  it("keeps the plan mode toggle in the Code composer footer", () => {
    const html = renderToStaticMarkup(createElement(ChatComposer, {
      ...baseProps,
      mode: "code",
      conversationId: "session-1",
    }));

    expect(html).toContain("计划模式 · off");
    expect(html).toContain("cy-plan-control");
  });
});
