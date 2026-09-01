import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";
import type { FireflyTarget } from "../../shared/firefly-actions";

// Ensure PIXI is available globally for pixi-live2d-display
(window as any).PIXI = PIXI;
try {
  Live2DModel.registerTicker(PIXI.Ticker);
} catch {
  // Ignored if already registered
}

export interface ParsedHitArea {
  name: string;
  id: string;
  group?: string;
  motionName?: string;
  motionIndex?: number;
  expressionName?: string;
  rawMotion?: string;
}

export interface MotionGroupItem {
  index: number;
  name: string;
  file: string;
}

export interface Live2DManagerOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  modelPath?: string;
  onLoad?: () => void;
  onModelUnavailable?: () => void;
  onError?: (error: unknown) => void;
}

export class Live2DManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly modelPath: string;

  private app: PIXI.Application | null = null;
  private model: Live2DModel | null = null;
  private isLive2DAvailable = false;
  private isDisposed = false;
  private isPaused = false;
  private currentZoom = 1.0;
  private baseWidth: number;
  private baseHeight: number;

  private hitAreas: ParsedHitArea[] = [];
  private motionMap = new Map<string, number>();
  private groupMotions = new Map<string, MotionGroupItem[]>();
  private availableExpressions = new Set<string>();
  private rawModelJson: any = null;

  constructor(options: Live2DManagerOptions) {
    this.canvas = options.canvas;
    this.baseWidth = options.width;
    this.baseHeight = options.height;
    this.modelPath = options.modelPath ?? "assets://firefly/models/Firefly.model3.json";

    // 1. Initialize PIXI WebGL Application
    try {
      this.app = new PIXI.Application({
        view: this.canvas,
        width: this.baseWidth,
        height: this.baseHeight,
        backgroundAlpha: 0,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: true,
      });
    } catch (err) {
      console.warn("[Live2DManager] PIXI Application initialization failed:", err);
    }

    // 2. Start Model loading
    void this.initModel(options);
  }

  private async initModel(options: Live2DManagerOptions): Promise<void> {
    if (this.isDisposed) return;

    console.log("[Live2D] init:start");
    console.log("[Live2D] model-load:start", this.modelPath);

    try {
      // Step A: Fetch and inspect raw model3.json
      const res = await fetch(this.modelPath);
      if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
      }
      const json = await res.json();
      this.rawModelJson = json;
      this.parseModelJson(json);

      if (this.isDisposed) return;

      // Step B: Load Live2D Model via pixi-live2d-display
      if (!this.app) {
        throw new Error("PIXI.Application is not initialized");
      }

      const model = await Live2DModel.from(this.modelPath, {
        autoInteract: false,
      });

      if (this.isDisposed) {
        model.destroy({ children: true, texture: true, baseTexture: true });
        return;
      }

      this.model = model;
      this.isLive2DAvailable = true;
      this.canvas.style.display = "block";

      this.setupModelTransform();
      this.app.stage.addChild(model);

      console.log("[Live2D] model-load:success");
      console.log(
        `[Live2DManager] Live2D model loaded successfully from "${this.modelPath}". ` +
          `HitAreas: ${this.hitAreas.length}, Motions: ${this.motionMap.size}, Expressions: ${this.availableExpressions.size}`
      );
      console.log("[Live2D] manager-ready");
      options.onLoad?.();
    } catch (err) {
      console.error(
        `[Live2DManager] Live2D model load failed at "${this.modelPath}" (${(err as any)?.message || err}):`,
        err
      );
      this.isLive2DAvailable = false;
      this.canvas.style.display = "none";
      options.onModelUnavailable?.();
      options.onError?.(err);
    }
  }

  private parseModelJson(json: any): void {
    if (!json || typeof json !== "object") return;

    // Parse HitAreas
    this.hitAreas = [];
    if (Array.isArray(json.HitAreas)) {
      for (const item of json.HitAreas) {
        if (!item || typeof item !== "object") continue;
        const parsed: ParsedHitArea = {
          name: String(item.Name ?? ""),
          id: String(item.Id ?? ""),
          rawMotion: item.Motion ? String(item.Motion) : undefined,
        };

        if (item.Motion && typeof item.Motion === "string") {
          const parts = item.Motion.split(":");
          if (parts.length >= 2) {
            const group = parts[0];
            const motionRef = parts[1];
            parsed.group = group;

            if (group.toLowerCase() === "expression") {
              parsed.expressionName = motionRef;
            } else {
              const parsedNum = parseInt(motionRef, 10);
              if (!isNaN(parsedNum)) {
                parsed.motionIndex = parsedNum;
                parsed.motionName = motionRef;
              } else {
                parsed.motionName = motionRef;
              }
            }
          } else if (parts.length === 1) {
            parsed.group = parts[0];
            parsed.motionIndex = 0;
          }
        }
        this.hitAreas.push(parsed);
      }
    }

    // Parse Motions
    this.motionMap.clear();
    this.groupMotions.clear();
    const fileRefs = json.FileReferences ?? {};
    const motions = fileRefs.Motions ?? {};
    if (typeof motions === "object" && motions !== null) {
      for (const [group, list] of Object.entries(motions)) {
        if (!Array.isArray(list)) continue;
        const groupItems: MotionGroupItem[] = [];
        list.forEach((item, index) => {
          let name = item?.Name;
          const file = item?.File ? String(item.File) : "";
          if (!name && file) {
            const fileName = file.split("/").pop() || file;
            name = fileName.replace(/\.motion3\.json$/i, "");
          }
          const finalName = name ? String(name) : String(index);
          groupItems.push({ index, name: finalName, file });
          this.motionMap.set(`${group}:${finalName}`.toLowerCase(), index);
          this.motionMap.set(`${group}:${index}`.toLowerCase(), index);
        });
        this.groupMotions.set(group, groupItems);
      }
    }

    // Parse Expressions
    this.availableExpressions.clear();
    const expressions = fileRefs.Expressions ?? [];
    if (Array.isArray(expressions)) {
      for (const exp of expressions) {
        if (exp?.Name) {
          this.availableExpressions.add(String(exp.Name));
        }
      }
    }
  }

  private setupModelTransform(): void {
    if (!this.model) return;
    this.model.anchor.set(0.5, 1.0);
    this.model.x = this.baseWidth / 2;
    this.model.y = this.baseHeight;

    if (this.model.width > 0 && this.model.height > 0) {
      const scaleX = (this.baseWidth * 0.9) / this.model.width;
      const scaleY = (this.baseHeight * 0.95) / this.model.height;
      const fitScale = Math.min(scaleX, scaleY);
      this.model.scale.set(fitScale * this.currentZoom);
    }
  }

  private resolveMotionIndex(groupOrName: string, motionNameOrIndex?: string | number): number | undefined {
    if (motionNameOrIndex !== undefined) {
      if (typeof motionNameOrIndex === "number") {
        return motionNameOrIndex;
      }
      const parsedNum = parseInt(motionNameOrIndex, 10);
      if (!isNaN(parsedNum)) {
        return parsedNum;
      }
      const key = `${groupOrName}:${motionNameOrIndex}`.toLowerCase();
      if (this.motionMap.has(key)) {
        return this.motionMap.get(key);
      }
      return undefined;
    }

    // Single argument passed
    const key = groupOrName.toLowerCase();
    if (this.motionMap.has(key)) {
      return this.motionMap.get(key);
    }
    const parsedNum = parseInt(groupOrName, 10);
    if (!isNaN(parsedNum)) {
      return parsedNum;
    }
    if (this.groupMotions.has(groupOrName)) {
      return 0;
    }
    return undefined;
  }

  playTarget(target: FireflyTarget): void {
    if (!this.isLive2DAvailable || !this.model) return;

    if (target.kind === "motion") {
      const index = this.resolveMotionIndex(target.group, target.motionName);
      this.model.motion(target.group, index);
    } else if (target.kind === "expression") {
      this.model.expression(target.name);
    }
  }

  playActionId(actionId: string): void {
    if (!this.isLive2DAvailable || !this.model) return;

    const index = this.resolveMotionIndex(actionId);
    if (index !== undefined) {
      this.model.motion(actionId, index);
    } else if (this.availableExpressions.has(actionId)) {
      this.model.expression(actionId);
    }
  }

  playMotion(group: string, motionNameOrIndex?: string | number, priority?: number): Promise<boolean> | undefined {
    if (this.isLive2DAvailable && this.model) {
      const index = this.resolveMotionIndex(group, motionNameOrIndex);
      return this.model.motion(group, index, priority);
    }
    return undefined;
  }

  setExpression(name: string): void {
    if (this.isLive2DAvailable && this.model) {
      this.model.expression(name);
    }
  }

  resize(width: number, height: number): void {
    this.baseWidth = width;
    this.baseHeight = height;

    if (this.app) {
      this.app.renderer.resize(width, height);
    }

    if (this.isLive2DAvailable) {
      this.setupModelTransform();
    }
  }

  applyZoom(scale: number): void {
    this.currentZoom = scale;
    if (this.isLive2DAvailable) {
      this.setupModelTransform();
    }
  }

  pause(): void {
    this.isPaused = true;
    if (this.app) {
      this.app.ticker.stop();
    }
  }

  resume(): void {
    if (this.isDisposed) return;
    this.isPaused = false;
    if (this.app) {
      this.app.ticker.start();
    }
  }

  getPixelAlpha(clientX: number, clientY: number): number {
    if (this.isLive2DAvailable && this.app && this.canvas) {
      try {
        const gl = (this.app.renderer as PIXI.Renderer)?.gl;
        if (gl) {
          const rect = this.canvas.getBoundingClientRect();
          const relX = clientX - rect.left;
          const relY = clientY - rect.top;
          if (relX < 0 || relY < 0 || relX >= rect.width || relY >= rect.height) {
            return 0;
          }
          const res = this.app.renderer.resolution || 1;
          const x = Math.floor(relX * res);
          const y = Math.floor((rect.height - relY) * res);
          const pixel = new Uint8Array(4);
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          return pixel[3];
        }
      } catch {
        return 255;
      }
    }
    return 0;
  }

  getModel(): Live2DModel | null {
    return this.model;
  }

  getHitAreas(): readonly ParsedHitArea[] {
    return this.hitAreas;
  }

  getIsLive2DAvailable(): boolean {
    return this.isLive2DAvailable;
  }

  getRawModelJson(): any {
    return this.rawModelJson;
  }

  getAvailableExpressions(): readonly string[] {
    return Array.from(this.availableExpressions);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.model) {
      try {
        this.model.destroy({ children: true, texture: true, baseTexture: true });
      } catch {}
      this.model = null;
    }

    if (this.app) {
      try {
        this.app.destroy(true, { children: true, texture: true, baseTexture: true });
      } catch {}
      this.app = null;
    }

    try {
      if ((PIXI.utils as any)?.clearTextureCache) {
        (PIXI.utils as any).clearTextureCache();
      }
      if ((PIXI.utils as any)?.destroyTextureCache) {
        (PIXI.utils as any).destroyTextureCache();
      }
    } catch {}
  }
}

// Export alias for backward compatibility
export { Live2DManager as FireflyLive2DManager };
