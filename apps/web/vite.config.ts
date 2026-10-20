import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function devSessionToken(): Plugin {
  return {
    name: "dcv-dev-session-token",
    apply: "serve",
    transformIndexHtml(html) {
      const token = process.env.DCV_TOKEN;
      if (!token) {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            children: `window.__DCV_TOKEN__=${JSON.stringify(token)};`,
            injectTo: "head-prepend"
          }
        ]
      };
    }
  };
}

export default defineConfig({
  plugins: [react(), devSessionToken()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4317",
        changeOrigin: false
      }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true
  }
});
