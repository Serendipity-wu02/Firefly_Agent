import { app, protocol } from "electron";
import { FireflyApplication } from "./application/application";
import { createDefaultApplicationRuntime } from "./application/default-dependencies";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "assets",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
]);

const isDev = process.env.VITE_DEV === "1";
const fireflyApplication = new FireflyApplication(() =>
  createDefaultApplicationRuntime({ isDev }),
);
let quitRequested = false;

void app
  .whenReady()
  .then(async () => {
    try {
      await fireflyApplication.start();
    } catch (error: unknown) {
      console.error("[FireflyApplication] Startup failed:", error);
      app.exit(1);
    }
  })
  .catch((error: unknown) => {
    console.error("[FireflyApplication] Electron readiness failed:", error);
    app.exit(1);
  });

app.on("activate", () => {
  fireflyApplication.activate();
});

app.on("before-quit", (event) => {
  if (quitRequested) return;
  event.preventDefault();
  quitRequested = true;

  void fireflyApplication
    .stop()
    .then(() => app.quit())
    .catch((error: unknown) => {
      console.error("[FireflyApplication] Shutdown failed:", error);
      app.exit(1);
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !fireflyApplication.hasTray()) {
    app.quit();
  }
});
