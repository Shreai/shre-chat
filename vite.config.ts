import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_API_TARGET || "http://127.0.0.1:18789";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    proxy: {
      "/v1": {
        target: apiTarget,
        changeOrigin: true,
        secure: true,
        ws: true,
      },
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: true,
      },
      "/ws": {
        target: apiTarget,
        changeOrigin: true,
        secure: true,
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/react-markdown/") || id.includes("node_modules/remark-") || id.includes("node_modules/mdast-") || id.includes("node_modules/micromark") || id.includes("node_modules/unified") || id.includes("node_modules/unist-") || id.includes("node_modules/hast-") || id.includes("node_modules/vfile")) {
            return "markdown";
          }
          if (id.includes("node_modules/@tanstack/")) {
            return "virtualizer";
          }
          if (id.includes("node_modules/highlight.js/")) {
            return "highlight";
          }
          if (id.includes("node_modules/xterm/") || id.includes("node_modules/@xterm/")) {
            return "xterm";
          }
        },
      },
    },
  },
});
