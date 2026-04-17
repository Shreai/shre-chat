import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:5510';

/**
 * Stamps __BUILD_TS__ in public/sw.js at build time so each deploy
 * produces a new service worker, triggering the browser to purge
 * stale caches and fetch fresh assets automatically.
 */
function swVersionPlugin(): Plugin {
  return {
    name: 'sw-version-stamp',
    writeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js');
      try {
        const src = readFileSync(swPath, 'utf-8');
        const stamped = src.replace(/__BUILD_TS__/g, Date.now().toString(36));
        writeFileSync(swPath, stamped);
      } catch {
        // sw.js may not exist in dev — ignore
      }
    },
  };
}

const proxyConfig = {
  target: apiTarget,
  changeOrigin: true,
  secure: true,
  headers: {
    Origin: apiTarget,
  },
};

export default defineConfig({
  define: {
    __SHRE_INTERNAL__: JSON.stringify(process.env.SHRE_INTERNAL === 'true'),
    __SHRE_CHANNEL__: JSON.stringify(process.env.SHRE_CHANNEL || 'production'),
  },
  plugins: [react(), swVersionPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/v1': { ...proxyConfig, ws: true },
      '/api': proxyConfig,
      '/ws': { ...proxyConfig, ws: true },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          if (
            id.includes('node_modules/react-markdown/') ||
            id.includes('node_modules/remark-') ||
            id.includes('node_modules/mdast-') ||
            id.includes('node_modules/micromark') ||
            id.includes('node_modules/unified') ||
            id.includes('node_modules/unist-') ||
            id.includes('node_modules/hast-') ||
            id.includes('node_modules/vfile')
          ) {
            return 'markdown';
          }
          if (id.includes('node_modules/@tanstack/')) {
            return 'virtualizer';
          }
          if (id.includes('node_modules/highlight.js/')) {
            return 'highlight';
          }
          if (id.includes('node_modules/xterm/') || id.includes('node_modules/@xterm/')) {
            return 'xterm';
          }
          // Emoji picker — rarely used, ~300K
          if (id.includes('node_modules/emoji-mart/') || id.includes('node_modules/@emoji-mart/')) {
            return 'emoji';
          }
          // Icons — tree-shaking helps but chunk split is cleaner
          if (id.includes('node_modules/lucide-react/')) {
            return 'icons';
          }
          // Radix UI primitives
          if (id.includes('node_modules/@radix-ui/')) {
            return 'radix';
          }
          // DOMPurify
          if (id.includes('node_modules/dompurify/')) {
            return 'sanitize';
          }
        },
      },
    },
  },
});
