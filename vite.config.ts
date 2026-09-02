import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
