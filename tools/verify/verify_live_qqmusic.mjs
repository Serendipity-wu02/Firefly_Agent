import { QQMusicDesktopBridge } from "../dist/main/main/runtime/music/qqmusic-desktop-bridge.js";
import { MusicService } from "../dist/main/main/runtime/music/music-service.js";
import { createMusicTools } from "../dist/main/main/tools/music-tools.js";

async function main() {
  console.log("=== Starting Real QQ Music Live Verification ===");

  const bridge = new QQMusicDesktopBridge();
  const service = new MusicService({ desktopBridge: bridge });
  await service.start();

  // 1. Initial poll
  console.log("\n[1] Polling current QQ Music state...");
  const snap1 = await bridge.poll();
  console.log("Bridge available:", snap1.available);
  console.log("Player state:", snap1.playerState);
  if (snap1.track) {
    console.log("Current Track Name:", snap1.track.name);
    console.log("Current Artists:", snap1.track.artists.join(", "));
    console.log("Current Album:", snap1.track.album);
    console.log("Duration (ms):", snap1.track.durationMs);
  }
  console.log("Playback State:", snap1.playbackState);

  // 2. Query through MusicTools (music_status)
  console.log("\n[2] Testing music_status tool execution...");
  const tools = createMusicTools(service);
  const statusTool = tools.find((t) => t.id === "music_status");
  const controlTool = tools.find((t) => t.id === "music_control");

  const statusRes = JSON.parse(await statusTool.execute({}));
  console.log("music_status output:", JSON.stringify(statusRes, null, 2));

  // 3. Testing music_control pause
  console.log("\n[3] Testing music_control pause...");
  const pauseRes = JSON.parse(await controlTool.execute({ action: "pause" }));
  console.log("pause result:", pauseRes);
  await new Promise((r) => setTimeout(r, 600));
  await bridge.poll();
  console.log("After pause -> isPlaying:", bridge.getSnapshot().playbackState.paused ? "Paused (True)" : "Still Playing");

  // 4. Testing music_control resume
  console.log("\n[4] Testing music_control resume...");
  const resumeRes = JSON.parse(await controlTool.execute({ action: "resume" }));
  console.log("resume result:", resumeRes);
  await new Promise((r) => setTimeout(r, 600));
  await bridge.poll();
  console.log("After resume -> isPaused:", bridge.getSnapshot().playbackState.paused);

  // 5. Testing music_control next
  console.log("\n[5] Testing music_control next...");
  const nextRes = JSON.parse(await controlTool.execute({ action: "next" }));
  console.log("next result:", nextRes);
  await new Promise((r) => setTimeout(r, 1200));
  await bridge.poll();
  console.log("After next -> New Track:", bridge.getSnapshot().track?.name, "by", bridge.getSnapshot().track?.artists.join(", "));

  // 6. Testing music_control prev
  console.log("\n[6] Testing music_control prev...");
  const prevRes = JSON.parse(await controlTool.execute({ action: "prev" }));
  console.log("prev result:", prevRes);
  await new Promise((r) => setTimeout(r, 1200));
  await bridge.poll();
  console.log("After prev -> New Track:", bridge.getSnapshot().track?.name, "by", bridge.getSnapshot().track?.artists.join(", "));

  await service.shutdown();
  console.log("\n=== Real QQ Music Live Verification Completed Successfully! ===");
}

main().catch(console.error);
