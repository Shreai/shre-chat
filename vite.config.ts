import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    proxy: {
      "/v1": "http://127.0.0.1:18789",
      "/api/feedback": "http://127.0.0.1:8899",
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
