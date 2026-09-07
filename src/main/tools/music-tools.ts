import type { ToolContext, ToolDefinition } from "../../shared/tool-types";
import {
  MusicService,
  type QQMusicControlAction,
} from "../runtime/music/music-service";

const MUSIC_CONTROL_CAPABILITY_ID = "music.control";
const MUSIC_CONTROL_TOOL_ID = "music_control";
const QQ_MUSIC_TARGET = "QQMusic";
const AUTHORIZED_QQ_MUSIC_ACTIONS = new Set<QQMusicControlAction>([
  "play",
  "pause",
  "next",
  "previous",
  "toggle",
]);

function hasPinnedQqMusicAuthorization(ctx: ToolContext | undefined): boolean {
  const authorization = ctx?.upstreamAuthorization;
  return authorization?.capabilityId === MUSIC_CONTROL_CAPABILITY_ID &&
    authorization.toolId === MUSIC_CONTROL_TOOL_ID &&
    authorization.authorizedScope.kind === "desktop" &&
    authorization.authorizedScope.target === QQ_MUSIC_TARGET;
}

export function createMusicTools(musicService: MusicService): ToolDefinition[] {
  const searchTool: ToolDefinition = {
    id: "music_search",
    name: "搜索音乐",
    description:
      "在音乐库中搜索歌曲（支持按歌名、歌手或专辑搜索）。搜索结果会自动编排序号（如 1、2、3），供后续选歌播放。",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词（如歌名或歌手名）",
        },
        limit: {
          type: "number",
          description: "返回结果最大数量，默认 5",
        },
      },
      required: ["query"],
    },
    enabled: true,
    execute: async (args: Record<string, unknown>) => {
      try {
        const query = String(args.query || "").trim();
        if (!query) {
          return JSON.stringify({ ok: false, error: "empty_query", message: "搜索关键词不能为空。" });
        }
        const limit = typeof args.limit === "number" ? args.limit : 5;
        const tracks = await musicService.search(query, limit);

        if (tracks.length === 0) {
          return JSON.stringify({
            ok: true,
            message: `未找到关于「${query}」的歌曲。`,
            tracks: [],
          });
        }

        const formatted = tracks.map((t, idx) => ({
          index: idx + 1,
          id: t.id,
          name: t.name,
          artists: t.artists.join(", "),
          album: t.album,
          duration: t.durationMs ? `${Math.floor(t.durationMs / 60000)}分${Math.floor((t.durationMs % 60000) / 1000)}秒` : undefined,
        }));

        return JSON.stringify({
          ok: true,
          query,
          count: formatted.length,
          tracks: formatted,
          hint: "可以通过序号（如 1）调用 music_play 进行播放。",
        });
      } catch (err: any) {
        return JSON.stringify({ ok: false, error: "search_failed", message: err?.message || String(err) });
      }
    },
  };

  const recommendTool: ToolDefinition = {
    id: "music_recommend",
    name: "推荐音乐",
    description: "获取音乐推荐列表，用于开拓者让流萤推荐歌曲时调用。",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "推荐数量，默认 5",
        },
      },
    },
    enabled: true,
    execute: async (args: Record<string, unknown>) => {
      try {
        const limit = typeof args.limit === "number" ? args.limit : 5;
        const tracks = await musicService.getRecommendations(limit);

        const formatted = tracks.map((t, idx) => ({
          index: idx + 1,
          id: t.id,
          name: t.name,
          artists: t.artists.join(", "),
          album: t.album,
        }));

        return JSON.stringify({
          ok: true,
          tracks: formatted,
          hint: "可以通过序号（如 1）调用 music_play 播放推荐曲目。",
        });
      } catch (err: any) {
        return JSON.stringify({ ok: false, error: "recommend_failed", message: err?.message || String(err) });
      }
    },
  };

  const playTool: ToolDefinition = {
    id: "music_play",
    name: "播放音乐",
    description:
      "播放音乐。可以传入刚才搜索或推荐结果中的序号（如 1、2、3），也可以传入歌曲 ID 或直接按歌名进行搜索播放。",
    inputSchema: {
      type: "object",
      properties: {
        selection: {
          type: "string",
          description: "曲目序号（如 '1'）或歌曲 ID",
        },
        title: {
          type: "string",
          description: "若未先搜索，可直接填入想播放的歌曲名称",
        },
      },
    },
    enabled: true,
    execute: async (args: Record<string, unknown>) => {
      try {
        const selection = args.selection !== undefined ? String(args.selection) : undefined;
        const title = args.title !== undefined ? String(args.title) : undefined;

        if (selection) {
          const num = parseInt(selection, 10);
          const selKey = !isNaN(num) && String(num) === selection.trim() ? num : selection;
          await musicService.playSelection(selKey);
          const snap = musicService.getSnapshot();
          return JSON.stringify({
            ok: true,
            action: "playing",
            track: snap.currentTrack?.name,
            artists: snap.currentTrack?.artists?.join(", "),
          });
        }

        if (title) {
          const tracks = await musicService.search(title, 1);
          if (tracks.length === 0) {
            return JSON.stringify({ ok: false, error: "not_found", message: `未找到歌曲《${title}》` });
          }
          await musicService.playTrack(tracks[0]);
          return JSON.stringify({
            ok: true,
            action: "playing",
            track: tracks[0].name,
            artists: tracks[0].artists.join(", "),
          });
        }

        return JSON.stringify({ ok: false, error: "missing_parameter", message: "必须提供 selection 或 title 参数。" });
      } catch (err: any) {
        return JSON.stringify({ ok: false, error: "play_failed", message: err?.message || String(err) });
      }
    },
  };

  const controlTool: ToolDefinition = {
    id: "music_control",
    name: "控制音乐",
    description:
      "控制音乐播放状态。QQ 音乐授权后台控制支持 play、pause、next、previous、toggle；未授权旧路径保留既有播放器控制语义。",
    risk: "side_effect",
    safetyLevel: "confirm_required",
    sideEffect: "external_action",
    timeoutMs: 5_000,
    retryable: false,
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["play", "pause", "next", "previous", "toggle", "resume", "prev", "stop", "volume"],
          description: "控制指令",
        },
        volume: {
          type: "number",
          description: "当 action 为 'volume' 时的音量值 (0-100)",
        },
      },
      required: ["action"],
    },
    enabled: true,
    execute: async (args: Record<string, unknown>, ctx?: ToolContext) => {
      try {
        const action = String(args.action || "");
        if (ctx?.upstreamAuthorization !== undefined) {
          if (!hasPinnedQqMusicAuthorization(ctx)) {
            return JSON.stringify({
              ok: false,
              error: "CONTROL_TARGET_MISMATCH",
              message: "授权控制目标不是固定的 QQMusic 桌面会话。",
            });
          }
          if (!AUTHORIZED_QQ_MUSIC_ACTIONS.has(action as QQMusicControlAction)) {
            return JSON.stringify({
              ok: false,
              error: "COMMAND_UNSUPPORTED",
              message: "该命令不属于 V1 QQ 音乐后台控制集合。",
              target: QQ_MUSIC_TARGET,
            });
          }
          const result = await musicService.controlQQMusic(
            action as QQMusicControlAction,
            ctx.signal,
          );
          return JSON.stringify(result);
        }

        switch (action) {
          case "pause":
            await musicService.pause();
            return JSON.stringify({ ok: true, status: "paused" });
          case "resume":
            await musicService.resume();
            return JSON.stringify({ ok: true, status: "playing" });
          case "next": {
            const ok = await musicService.next();
            const snap = musicService.getSnapshot();
            return JSON.stringify({ ok, action: "next", track: snap.currentTrack?.name });
          }
          case "prev": {
            const ok = await musicService.prev();
            const snap = musicService.getSnapshot();
            return JSON.stringify({ ok, action: "prev", track: snap.currentTrack?.name });
          }
          case "stop":
            await musicService.stop();
            return JSON.stringify({ ok: true, status: "stopped" });
          case "volume":
            if (typeof args.volume === "number") {
              await musicService.setVolume(args.volume);
              return JSON.stringify({ ok: true, volume: args.volume });
            }
            return JSON.stringify({ ok: false, error: "missing_volume" });
          default:
            return JSON.stringify({ ok: false, error: "unknown_action" });
        }
      } catch (err: any) {
        return JSON.stringify({ ok: false, error: "control_failed", message: err?.message || String(err) });
      }
    },
  };

  const statusTool: ToolDefinition = {
    id: "music_status",
    name: "查询音乐状态",
    description: "查询当前正在播放的歌曲信息以及播放器状态（播放中、已暂停、音量等）。",
    risk: "read_only",
    sideEffect: "read_only",
    inputSchema: {
      type: "object",
      properties: {},
    },
    enabled: true,
    execute: async () => {
      try {
        const snap = musicService.getSnapshot();
        return JSON.stringify({
          ok: true,
          backendState: snap.backendState,
          playerState: snap.playerState,
          accountState: snap.accountState,
          isPlaying: snap.playbackState.loaded && !snap.playbackState.paused,
          currentTrack: snap.currentTrack
            ? {
                name: snap.currentTrack.name,
                artists: snap.currentTrack.artists.join(", "),
                album: snap.currentTrack.album,
              }
            : null,
          volume: snap.playbackState.volume,
          queueLength: snap.queueLength,
        });
      } catch (err: any) {
        return JSON.stringify({ ok: false, error: "status_failed", message: err?.message || String(err) });
      }
    },
  };

  return [searchTool, recommendTool, playTool, controlTool, statusTool];
}
