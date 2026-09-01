import { app, BrowserWindow, Menu, screen } from "electron";
import fs from "node:fs";
import path from "node:path";
import { IPC } from "../../shared/ipc-channels";

const PET_WINDOW_BASE_WIDTH = 429;
const PET_WINDOW_BASE_HEIGHT = 315;
const STATUS_WINDOW_WIDTH = 420;
const STATUS_WINDOW_HEIGHT = 560;
const CHAT_WINDOW_WIDTH = 440;
const CHAT_WINDOW_HEIGHT = 620;
const SUMMARY_WINDOW_WIDTH = 240;
const SUMMARY_WINDOW_HEIGHT = 130;
const SETTINGS_WINDOW_WIDTH = 500;
const SETTINGS_WINDOW_HEIGHT = 600;

export class WindowManager {
  private petWindow: BrowserWindow | null = null;
  private statusWindow: BrowserWindow | null = null;
  private chatWindow: BrowserWindow | null = null;
  private summaryWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private isDev: boolean;
  private configPath: string;
  private petScale = 1.0;

  constructor(isDev: boolean) {
    this.isDev = isDev;
    try {
      this.configPath = path.join(app.getAppPath(), "config", "settings.json");
    } catch {
      this.configPath = path.join(process.cwd(), "config", "settings.json");
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

    win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      console.log(`[Renderer Console L${level}] ${message} (${sourceId}:${line})`);
    });

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
      return this.chatWindow;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;

    const petBounds = this.petWindow?.getBounds();
    const defaultX = petBounds
      ? Math.max(workArea.x, petBounds.x - CHAT_WINDOW_WIDTH - 16)
      : workArea.x + workArea.width - CHAT_WINDOW_WIDTH - 420;
    const defaultY = petBounds ? petBounds.y : workArea.y + workArea.height - CHAT_WINDOW_HEIGHT - 32;

    const win = new BrowserWindow({
      x: defaultX,
      y: defaultY,
      width: CHAT_WINDOW_WIDTH,
      height: CHAT_WINDOW_HEIGHT,
      title: "与流萤对话",
      frame: true,
      resizable: true,
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), "dist", "preload", "preload", "index.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const targetUrl = this.isDev
      ? "http://localhost:5173/react/index.html?tab=chat"
      : path.join(app.getAppPath(), "dist", "renderer", "react", "index.html");
    console.log(`[WindowManager] OPEN CHAT WINDOW -> Target: ${targetUrl}`);

    if (this.isDev) {
      win.loadURL("http://localhost:5173/react/index.html?tab=chat");
    } else {
      win.loadFile(path.join(app.getAppPath(), "dist", "renderer", "react", "index.html"), {
        query: { tab: "chat" },
      });
    }

    win.once("ready-to-show", () => {
      win.show();
    });

    win.on("closed", () => {
      this.chatWindow = null;
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

    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;

    const win = new BrowserWindow({
      x: workArea.x + Math.round((workArea.width - SETTINGS_WINDOW_WIDTH) / 2),
      y: workArea.y + Math.round((workArea.height - SETTINGS_WINDOW_HEIGHT) / 2),
      width: SETTINGS_WINDOW_WIDTH,
      height: SETTINGS_WINDOW_HEIGHT,
      title: "流萤 设置",
      frame: true,
      resizable: true,
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), "dist", "preload", "preload", "index.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (this.isDev) {
      win.loadURL("http://localhost:5173/react/index.html?tab=settings");
    } else {
      win.loadFile(path.join(app.getAppPath(), "dist", "renderer", "react", "index.html"), {
        query: { tab: "settings" },
      });
    }

    win.once("ready-to-show", () => {
      win.show();
    });

    win.on("closed", () => {
      this.settingsWindow = null;
    });

    this.settingsWindow = win;
    return win;
  }

  createSummaryWindow(): BrowserWindow {
    if (this.summaryWindow && !this.summaryWindow.isDestroyed()) {
      this.summaryWindow.show();
      return this.summaryWindow;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;

    const petBounds = this.petWindow?.getBounds();
    const defaultX = petBounds
      ? Math.max(workArea.x, Math.min(workArea.x + workArea.width - SUMMARY_WINDOW_WIDTH, petBounds.x + petBounds.width - SUMMARY_WINDOW_WIDTH))
      : workArea.x + workArea.width - SUMMARY_WINDOW_WIDTH - 20;
    const defaultY = petBounds
      ? Math.max(workArea.y, petBounds.y - SUMMARY_WINDOW_HEIGHT - 8)
      : workArea.y + workArea.height - SUMMARY_WINDOW_HEIGHT - 350;

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

    const targetUrl = this.isDev
      ? "http://localhost:5173/react/index.html?tab=summary"
      : path.join(app.getAppPath(), "dist", "renderer", "react", "index.html");
    console.log(`[WindowManager] OPEN SUMMARY WINDOW -> Target: ${targetUrl}`);

    if (this.isDev) {
      win.loadURL("http://localhost:5173/react/index.html?tab=summary");
    } else {
      win.loadFile(path.join(app.getAppPath(), "dist", "renderer", "react", "index.html"), {
        query: { tab: "summary" },
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
      this.summaryWindow?.hide();
    } else {
      this.petWindow.show();
      this.petWindow.focus();
      this.summaryWindow?.show();
    }
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

  getSettingsWindow(): BrowserWindow | null {
    if (!this.settingsWindow || this.settingsWindow.isDestroyed()) return null;
    return this.settingsWindow;
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
