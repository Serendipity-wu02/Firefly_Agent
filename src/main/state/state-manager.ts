import fs from "node:fs";
import path from "node:path";
import { CharacterState } from "./character-state";
import { HealthStatus, type CharacterStateData, type CareActionType } from "../../shared/firefly-state";
import { findFireflyAction, resolveFireflyTarget } from "../../shared/firefly-actions";
import { IPC } from "../../shared/ipc-channels";

export interface StateManagerOptions {
  configPath: string;
  broadcast: (channel: string, payload: unknown) => void;
  sendToPet: (channel: string, payload: unknown) => void;
}

export class CharacterStateManager {
  private state: CharacterState;
  private configPath: string;
  private broadcast: (channel: string, payload: unknown) => void;
  private sendToPet: (channel: string, payload: unknown) => void;

  private decayTimer: NodeJS.Timeout | null = null;
  private actionTimer: NodeJS.Timeout | null = null;
  private proactiveTimer: NodeJS.Timeout | null = null;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(options: StateManagerOptions) {
    this.configPath = options.configPath;
    this.broadcast = options.broadcast;
    this.sendToPet = options.sendToPet;

    this.state = this.loadState();
    this.state.applyOfflineTime();
    this.saveState();

    this.startTimers();
  }

  getState(): CharacterStateData {
    return this.state.toJSON();
  }

  getUnlockedFeatures(): string[] {
    return this.state.unlockedFeatures();
  }

  handleCareAction(type: CareActionType): { state: CharacterStateData; actionId: string; feedback?: string } {
    let actionId = "idle";
    let feedback: string | undefined;

    switch (type) {
      case "feed":
        if (this.state.hunger <= 3) {
          return { state: this.state.toJSON(), actionId: this.state.current_action, feedback: "流萤现在很饱，暂时吃不下更多了。" };
        }
        actionId = this.state.feed();
        feedback = `她吃得津津有味，饱食度降到了 ${this.state.hunger}/100。`;
        break;

      case "rest":
        if (this.state.energy >= 92) {
          return { state: this.state.toJSON(), actionId: this.state.current_action, feedback: "精力还很充沛，先陪我继续玩一会儿吧。" };
        }
        actionId = this.state.rest();
        feedback = `休息了一会儿，精力恢复到了 ${this.state.energy}/100。`;
        break;

      case "treatment":
        if (this.state.health === HealthStatus.HEALTHY) {
          return { state: this.state.toJSON(), actionId: this.state.current_action, feedback: "现在很健康，不需要治疗。" };
        }
        actionId = this.state.treatment();
        feedback = "治疗完成，身体感觉好多了。";
        break;

      case "click":
        actionId = this.state.reactToClick();
        break;

      case "touch":
        actionId = this.state.reactToPet();
        break;

      case "drag":
        actionId = this.state.reactToDragFinished();
        break;
    }

    this.state.current_action = actionId;
    this.saveState();
    this.notifyStateChanged();

    // Dispatch resolved Action to Pet Window
    this.dispatchAction(actionId);

    return { state: this.state.toJSON(), actionId, feedback };
  }

  reactToClick(): { state: CharacterStateData; actionId: string } {
    return this.handleCareAction("click");
  }

  reactToPet(): { state: CharacterStateData; actionId: string } {
    return this.handleCareAction("touch");
  }

  reactToDragFinished(): { state: CharacterStateData; actionId: string } {
    return this.handleCareAction("drag");
  }

  dispatchAction(actionId: string): void {
    const action = findFireflyAction(actionId);
    if (!action) {
      console.warn(`[StateManager] Unknown action requested: ${actionId}`);
      return;
    }

    const target = resolveFireflyTarget(actionId);
    console.log(`[StateManager] Dispatched Action: "${action.alias}" (${actionId}) -> Target:`, target);
    this.sendToPet(IPC.LIVE2D_PLAY_ACTION, target);
  }

  private startTimers(): void {
    // 1. Decay timer: updates numeric state decay & broadcasts (15s)
    this.decayTimer = setInterval(() => {
      this.state.tick();
      this.saveState();
      this.notifyStateChanged();
    }, 15000);

    // 2. Action timer: in V2.4, Live2D visual actions are driven solely by Behavior Runtime / Embodiment.
    // Timer-based arbitrary Live2D action dispatch is disabled.
    this.actionTimer = setInterval(() => {
      // V2.4: Timer-driven automatic dispatch to Live2D is severed.
      // Behavior Runtime is the single source of truth for visual decisions.
    }, 18000);

    // 3. Proactive timer: in V2.4, proactive behavior is handled by FireflyProactiveScheduler.
    // Legacy direct Live2D dispatch from state timer is disabled.
    this.proactiveTimer = setInterval(() => {
      // V2.4: Handled by FireflyProactiveScheduler via Agent Core loop.
    }, 45000);

    // 4. Save timer: periodic persistence (30s)
    this.saveTimer = setInterval(() => {
      this.saveState();
    }, 30000);
  }

  private notifyStateChanged(): void {
    const json = this.state.toJSON();
    this.broadcast(IPC.STATE_CHANGED, json);
  }

  private loadState(): CharacterState {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, "utf-8");
        const json = JSON.parse(raw);
        if (json.character && typeof json.character === "object") {
          return new CharacterState(json.character);
        }
      }
    } catch (err) {
      console.warn("[StateManager] Error reading settings.json, using defaults:", err);
    }
    return new CharacterState();
  }

  private saveState(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let data: Record<string, unknown> = {};
      if (fs.existsSync(this.configPath)) {
        try {
          data = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        } catch {
          data = {};
        }
      }

      data.character = this.state.toJSON();
      fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.warn("[StateManager] Failed to save character state:", err);
    }
  }

  dispose(): void {
    if (this.decayTimer) clearInterval(this.decayTimer);
    if (this.actionTimer) clearInterval(this.actionTimer);
    if (this.proactiveTimer) clearInterval(this.proactiveTimer);
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.saveState();
  }
}
