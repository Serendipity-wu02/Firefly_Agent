import { defineConfig } from "vite";
import { resolve } from "path";
import fs from "node:fs";
import react from "@vitejs/plugin-react";

function copyCubismCorePlugin() {
  return {
    name: "copy-cubism-core",
    generateBundle() {
      const corePath = resolve(__dirname, "src/renderer/live2d/live2dcubismcore.min.js");
      if (fs.existsSync(corePath)) {
        this.emitFile({
          type: "asset",
          fileName: "live2d/live2dcubismcore.min.js",
          source: fs.readFileSync(corePath),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyCubismCorePlugin()],
  root: resolve(__dirname, "src/renderer"),
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        renderer: resolve(__dirname, "src/renderer/index.html"),
        chat: resolve(__dirname, "src/renderer/ui/index.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
