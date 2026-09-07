import { app, BrowserWindow, Menu, screen } from "electron";
import fs from "node:fs";
import path from "node:path";
import { IPC } from "../../shared/ipc-channels";
import type { ApprovalChangedEvent } from "../../shared/approval-ipc-types";
import {
  RENDERER_VIEW_QUERY_PARAM,
  type RendererView,
  type WindowStateSnapshot,
} from "../../shared/window-types";

const PET_WINDOW_BASE_WIDTH = 429;
const PET_WINDOW_BASE_HEIGHT = 315;
// Harness Chat Window sizing: V1.1.0 canonical 1344×756 (16:9 desktop chat).
const CHAT_WINDOW_WIDTH = 1344;
const CHAT_WINDOW_HEIGHT = 756;
// Settings keeps the existing Harness surface dimensions while moving to its
// own BrowserWindow, so the current settings layout remains usable without a
// second sizing contract.
const SETTINGS_WINDOW_WIDTH = CHAT_WINDOW_WIDTH;
const SETTINGS_WINDOW_HEIGHT = CHAT_WINDOW_HEIGHT;
// Mood (Summary) Window: V1.1.0 canonical 254×388, floating outside the
// Harness Chat Window's right-top corner as an independent BrowserWindow.
const SUMMARY_WINDOW_WIDTH = 254;
const SUMMARY_WINDOW_HEIGHT = 388;
const APPROVAL_WINDOW_WIDTH = 520;
const APPROVAL_WINDOW_HEIGHT = 600;

export class WindowManager {
  private petWindow: BrowserWindow | null = null;
  private chatWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private summaryWindow: BrowserWindow | null = null;
  private approvalWindow: BrowserWindow | null = null;
  private approvalWindowCloseHandler: (() => void) | null = null;
  private approvalPresentationRefreshHandler: (() => void) | null = null;
  private chatRendererReady = false;
  private isDev: boolean;
  private configPath: string;
  private petScale = 1.0;

  constructor(isDev: boolean) {
    this.isDev = isDev;
    try {
      this.configPath = path.join(app.getPath("userData"), "settings.json");
    } catch {
      this.configPath = path.join(process.cwd(), "settings.json");
    }
    this.loadPetScale();
  }

  private loadPetScale(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const json = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        // In V2.4, default petScale is 1.0; legacy 0.7 scale is ignored to prevent shrinking
        if (typeof json.window?.pet_scale === "number" && json.window.pet_scale !== 0.7) {
          this.petScale = json.window.pet_scale;
        } else {
          this.petScale = 1.0;
        }
      }
    } catch {
      this.petScale = 1.0;
    }
  }

  saveWindowPosition(x: number, y: number): void {
    try {
      let data: any = {};
      if (fs.existsSync(this.configPath)) {
        try {
          data = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        } catch {
          data = {};
        }
      }

      if (!data.window) data.window = {};
      data.window.x = x;
      data.window.y = y;
      data.window.pet_scale = this.petScale;

      fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.warn("[WindowManager] Failed to save window position:", err);
    }
  }

  setPetScale(scale: number): void {
    this.petScale = Math.max(0.5, Math.min(1.5, scale));
    const width = Math.round(PET_WINDOW_BASE_WIDTH * this.petScale);
    const height = Math.round(PET_WINDOW_BASE_HEIGHT * this.petScale);

    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.setSize(width, height);
      this.petWindow.webContents.send(IPC.PET_ZOOM, this.petScale);
      const [x, y] = this.petWindow.getPosition();
      this.saveWindowPosition(x, y);
    }
  }

  getPetScale(): number {
    return this.petScale;
  }

  private sendWindowState(win: BrowserWindow): void {
    if (win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) return;
    const state: WindowStateSnapshot = { isMaximized: win.isMaximized() };
    win.webContents.send(IPC.WINDOW_STATE_CHANGED, state);
  }

  private bindWindowState(win: BrowserWindow): void {
    const sync = (): void => this.sendWindowState(win);
    win.on("maximize", sync);
    win.on("unmaximize", sync);
    win.on("restore", sync);
    win.webContents.on("did-finish-load", sync);
  }

  private getRendererDevUrl(view: RendererView): string {
    return `http://localhost:5173/ui/index.html?${RENDERER_VIEW_QUERY_PARAM}=${view}`;
  }

  createPetWindow(): BrowserWindow {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.show();
      this.petWindow.focus();
      return this.petWindow;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;

    let savedX: number | null = null;
    let savedY: number | null = null;

    try {
      if (fs.existsSync(this.configPath)) {
        const json = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        if (typeof json.window?.x === "number") savedX = json.window.x;
        if (typeof json.window?.y === "number") savedY = json.window.y;
      }
    } catch {}

    const width = Math.round(PET_WINDOW_BASE_WIDTH * this.petScale);
    const height = Math.round(PET_WINDOW_BASE_HEIGHT * this.petScale);

    const defaultX = savedX !== null ? savedX : workArea.x + workArea.width - width - 24;
    const defaultY = savedY !== null ? savedY : workArea.y + workArea.height - height - 32;

    const win = new BrowserWindow({
      x: defaultX,
      y: defaultY,
      width,
      height,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      alwaysOnTop: true,
      backgroundColor: "#00000000",
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), "dist", "preload", "preload", "index.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    if (this.isDev) {
      // Dev-only diagnostics: mirror renderer console onto main stdout.
      // Real renderer errors still surface via the app's own error handlers;
      // production stdout must not become a debug trace firehose.
      win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
        console.log(`[Renderer Console L${level}] ${message} (${sourceId}:${line})`);
      });
    }

    if (this.isDev) {
      // DevTools no longer auto-open on every dev launch; opt in explicitly
      // with FIREFLY_OPEN_DEVTOOLS=1 when debugging the pet renderer.
      if (process.env.FIREFLY_OPEN_DEVTOOLS === "1") {
        win.webContents.openDevTools({ mode: "detach" });
      }
      win.loadURL("http://localhost:5173");
    } else {
      win.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
    }

    win.once("ready-to-show", () => {
      console.log("[WindowManager] petWindow ready-to-show triggered, showing window");
      win.show();
    });

    win.on("moved", () => {
      const [x, y] = win.getPosition();
      this.saveWindowPosition(x, y);
    });

    win.on("closed", () => {
      this.petWindow = null;
    });

    this.petWindow = win;
    return win;
  }

  createStatusWindow(): BrowserWindow {
    console.log("[WindowManager] createStatusWindow invoked -> Redirecting to unified Harness Chat Window");
    return this.createChatWindow();
  }

  createChatWindow(): BrowserWindow {
    if (this.chatWindow && !this.chatWindow.isDestroyed()) {
      this.chatWindow.show();
      this.chatWindow.focus();
      this.notifyApprovalPresentationAvailability();
      return this.chatWindow;
    }

    const win = new BrowserWindow({
      width: CHAT_WINDOW_WIDTH,
      height: CHAT_WINDOW_HEIGHT,
      center: true,
      title: "流萤 · Firefly",
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: true,
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), "dist", "preload", "preload", "index.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setMenu(null);
    this.bindWindowState(win);
    win.center();

    const targetUrl = this.isDev
      ? this.getRendererDevUrl("chat")
      : path.join(app.getAppPath(), "dist", "renderer", "ui", "index.html");
    console.log(`[WindowManager] OPEN CHAT WINDOW -> Target: ${targetUrl}`);

    if (this.isDev) {
      win.loadURL(targetUrl);
    } else {
      win.loadFile(path.join(app.getAppPath(), "dist", "renderer", "ui", "index.html"), {
        query: { [RENDERER_VIEW_QUERY_PARAM]: "chat" },
      });
    }

    win.once("ready-to-show", () => {
      win.center();
      win.show();
      // Open the Mood Window once, anchored to the Chat Window's right-top
      // corner (getSummaryAnchor computed inside createSummaryWindow). It is
      // an independent window: it does NOT follow chat moves afterwards.
      this.createSummaryWindow();
      this.chatRendererReady = true;
      this.notifyApprovalPresentationAvailability();
    });

    win.webContents.on("did-finish-load", () => {
      this.chatRendererReady = true;
      this.notifyApprovalPresentationAvailability();
    });

    // Deliberately NO move/moved/restore repositioning: the Mood Window's
    // position is an initial anchor only — dragging the Chat Window must
    // never move the Mood Window (same for the Desktop Pet window).

    win.on("minimize", () => {
      this.summaryWindow?.hide();
      this.notifyApprovalPresentationAvailability();
    });

    win.on("restore", () => {
      if (this.summaryWindow && !this.summaryWindow.isDestroyed()) {
        this.summaryWindow.show();
      }
      this.notifyApprovalPresentationAvailability();
    });

    win.on("hide", () => {
      this.summaryWindow?.hide();
      this.notifyApprovalPresentationAvailability();
    });

    win.on("show", () => {
      if (this.summaryWindow && !this.summaryWindow.isDestroyed()) {
        this.summaryWindow.show();
      }
      this.notifyApprovalPresentationAvailability();
    });

    win.on("closed", () => {
      this.chatWindow = null;
      this.chatRendererReady = false;
      this.notifyApprovalPresentationAvailability();
      if (this.summaryWindow && !this.summaryWindow.isDestroyed()) {
        this.summaryWindow.hide();
      }
    });

    this.chatWindow = win;
    return win;
  }

  createSettingsWindow(): BrowserWindow {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.show();
      this.settingsWindow.focus();
      return this.settingsWindow;
    }

    const win = new BrowserWindow({
      width: SETTINGS_WINDOW_WIDTH,
      height: SETTINGS_WINDOW_HEIGHT,
      center: true,
      title: "流萤 · 设置",
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: true,
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), "dist", "preload", "preload", "index.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setMenu(null);
    this.bindWindowState(win);

    const targetUrl = this.isDev
      ? this.getRendererDevUrl("settings")
      : path.join(app.getAppPath(), "dist", "renderer", "ui", "index.html");
    console.log(`[WindowManager] OPEN SETTINGS WINDOW -> Target: ${targetUrl}`);

    if (this.isDev) {
      win.loadURL(targetUrl);
    } else {
      win.loadFile(path.join(app.getAppPath(), "dist", "renderer", "ui", "index.html"), {
        query: { [RENDERER_VIEW_QUERY_PARAM]: "settings" },
      });
    }

    win.once("ready-to-show", () => {
      win.center();
      win.show();
      win.focus();
    });
    win.on("closed", () => {
      this.settingsWindow = null;
    });

    this.settingsWindow = win;
    return win;
  }

  openApprovalWindow(): void {
    if (this.approvalWindow && !this.approvalWindow.isDestroyed()) {
      this.approvalWindow.show();
      this.approvalWindow.focus();
      return;
    }

    const win = new BrowserWindow({
      width: APPROVAL_WINDOW_WIDTH,
      height: APPROVAL_WINDOW_HEIGHT,
      center: true,
      title: "流萤 · 权限确认",
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: false,
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), "dist", "preload", "preload", "index.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setMenu(null);

    const targetUrl = this.isDev
      ? this.getRendererDevUrl("approval")
      : path.join(app.getAppPath(), "dist", "renderer", "ui", "index.html");
    console.log(`[WindowManager] OPEN APPROVAL WINDOW -> Target: ${targetUrl}`);

    if (this.isDev) {
      win.loadURL(targetUrl);
    } else {
      win.loadFile(path.join(app.getAppPath(), "dist", "renderer", "ui", "index.html"), {
        query: { [RENDERER_VIEW_QUERY_PARAM]: "approval" },
      });
    }

    win.once("ready-to-show", () => {
      win.center();
      win.show();
      win.focus();
    });

    win.on("closed", () => {
      this.approvalWindow = null;
      this.approvalWindowCloseHandler?.();
    });

    this.approvalWindow = win;
  }

  closeApprovalWindow(): boolean {
    if (!this.approvalWindow || this.approvalWindow.isDestroyed()) {
      this.approvalWindow = null;
      return false;
    }
    this.approvalWindow.close();
    return true;
  }

  getApprovalWindow(): BrowserWindow | null {
    if (!this.approvalWindow || this.approvalWindow.isDestroyed()) return null;
    return this.approvalWindow;
  }

  isApprovalWindowSender(sender: unknown): boolean {
    return this.getApprovalWindow()?.webContents === sender;
  }

  isApprovalSurfaceSender(sender: unknown): boolean {
    return this.isApprovalWindowSender(sender) || this.getChatWindow()?.webContents === sender;
  }

  sendApprovalChanged(event: ApprovalChangedEvent): void {
    const win = this.getApprovalWindow();
    if (win) {
      win.webContents.send(IPC.APPROVAL_CHANGED, event);
    }
  }

  isChatInlineReady(): boolean {
    const win = this.getChatWindow();
    return !!win && this.chatRendererReady && win.isVisible() && !win.isMinimized();
  }

  sendApprovalInline(event: ApprovalChangedEvent): void {
    const win = this.getChatWindow();
    if (win && !win.webContents.isDestroyed()) {
      win.webContents.send(IPC.APPROVAL_CHANGED, event);
    }
  }

  clearApprovalInline(): void {
    this.sendApprovalInline({ record: null });
  }

  setApprovalWindowCloseHandler(handler: (() => void) | null): void {
    this.approvalWindowCloseHandler = handler;
  }

  setApprovalPresentationRefreshHandler(handler: (() => void) | null): void {
    this.approvalPresentationRefreshHandler = handler;
  }

  private notifyApprovalPresentationAvailability(): void {
    this.approvalPresentationRefreshHandler?.();
  }

  /**
   * Compute the Mood (Summary) Window initial anchor.
   * Requirement: the mood card must open OUTSIDE the Harness Chat Window's
   * right-top corner (MoodX = ChatRight + gap, MoodY = ChatTop) — never
   * embedded in it and never anchored to the Desktop Pet window. When the
   * right side has no room, fall back to the left side of the Chat Window;
   * if neither side fits the screen, clamp to the work-area right edge and
   * report the resulting overlap honestly.
   */
  private getSummaryAnchor(): { x: number; y: number } {
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;

    const chatBounds = this.chatWindow?.getBounds();
    if (chatBounds) {
      const workRight = workArea.x + workArea.width;
      const rightX = chatBounds.x + chatBounds.width + 8;
      const leftX = chatBounds.x - SUMMARY_WINDOW_WIDTH - 8;
      const fitsRight = rightX + SUMMARY_WINDOW_WIDTH <= workRight;
      const fitsLeft = leftX >= workArea.x;

      let x: number;
      if (fitsRight) {
        x = rightX;
      } else if (fitsLeft) {
        x = leftX;
      } else {
        // Screen geometry cannot fit the mood window beside the chat window
        // on either side; clamp to the work area (partial overlap possible).
        x = Math.max(workArea.x, Math.min(rightX, workRight - SUMMARY_WINDOW_WIDTH));
      }

      // Top-aligned with the Chat Window, clamped into the work area.
      const y = Math.max(
        workArea.y,
        Math.min(chatBounds.y, workArea.y + workArea.height - SUMMARY_WINDOW_HEIGHT),
      );
      return { x, y };
    }

    const defaultX = Math.max(workArea.x, workArea.x + workArea.width - SUMMARY_WINDOW_WIDTH - 24);
    const defaultY = Math.max(workArea.y, workArea.y + workArea.height - SUMMARY_WINDOW_HEIGHT - 350);
    return { x: defaultX, y: defaultY };
  }

  createSummaryWindow(): BrowserWindow {
    if (this.summaryWindow && !this.summaryWindow.isDestroyed()) {
      this.summaryWindow.show();
      return this.summaryWindow;
    }

    const { x: defaultX, y: defaultY } = this.getSummaryAnchor();

    const win = new BrowserWindow({
      x: defaultX,
      y: defaultY,
      width: SUMMARY_WINDOW_WIDTH,
      height: SUMMARY_WINDOW_HEIGHT,
      title: "流萤 · 认知心境",
      transparent: true,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      backgroundColor: "#00000000",
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), "dist", "preload", "preload", "index.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setMenu(null);
    this.bindWindowState(win);

    const targetUrl = this.isDev
      ? this.getRendererDevUrl("summary")
      : path.join(app.getAppPath(), "dist", "renderer", "ui", "index.html");
    console.log(`[WindowManager] OPEN SUMMARY WINDOW -> Target: ${targetUrl}`);

    if (this.isDev) {
      win.loadURL(targetUrl);
    } else {
      win.loadFile(path.join(app.getAppPath(), "dist", "renderer", "ui", "index.html"), {
        query: { [RENDERER_VIEW_QUERY_PARAM]: "summary" },
      });
    }

    win.once("ready-to-show", () => {
      win.show();
    });

    win.on("closed", () => {
      this.summaryWindow = null;
    });

    this.summaryWindow = win;
    return win;
  }

  toggleSummaryWindow(): void {
    if (!this.summaryWindow || this.summaryWindow.isDestroyed()) {
      this.createSummaryWindow();
      return;
    }
    if (this.summaryWindow.isVisible()) {
      this.summaryWindow.hide();
    } else {
      this.summaryWindow.show();
    }
  }

  togglePetWindow(): void {
    if (!this.petWindow || this.petWindow.isDestroyed()) {
      this.createPetWindow();
      return;
    }
    if (this.petWindow.isVisible()) {
      this.petWindow.hide();
    } else {
      this.petWindow.show();
      this.petWindow.focus();
    }
    // Mood (Summary) Window is bound to the Harness Chat Window lifecycle
    // only — Desktop Pet visibility must never show/hide or move it.
  }

  showContextMenu(): void {
    if (!this.petWindow || this.petWindow.isDestroyed()) return;

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "💬 与流萤对话",
        click: () => this.createChatWindow(),
      },
      {
        label: "💭 流萤认知心境",
        click: () => this.toggleSummaryWindow(),
      },
      {
        label: "⚙ 设置",
        click: () => this.createSettingsWindow(),
      },
      { type: "separator" },
      {
        label: "❌ 退出",
        click: () => app.quit(),
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: this.petWindow });
  }

  getPetWindow(): BrowserWindow | null {
    if (!this.petWindow || this.petWindow.isDestroyed()) return null;
    return this.petWindow;
  }

  getSummaryWindow(): BrowserWindow | null {
    if (!this.summaryWindow || this.summaryWindow.isDestroyed()) return null;
    return this.summaryWindow;
  }

  getStatusWindow(): BrowserWindow | null {
    return this.getChatWindow();
  }

  getChatWindow(): BrowserWindow | null {
    if (!this.chatWindow || this.chatWindow.isDestroyed()) return null;
    return this.chatWindow;
  }

  sendToPet(channel: string, payload?: unknown): void {
    const win = this.getPetWindow();
    if (win) {
      win.webContents.send(channel, payload);
    }
  }

  broadcast(channel: string, payload?: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  }
}
