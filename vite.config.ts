/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false, // We use our own public/manifest.json
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com/,
            handler: "NetworkFirst",
            options: { cacheName: "firestore-cache" },
          },
        ],
      },
    }),
  ],
  base: "/",
  server: {
    proxy: {
      // Dev proxy: browser calls /api/anthropic/... → Vite forwards to api.anthropic.com
      // This bypasses CORS because the request leaves from Node (server), not the browser.
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/recipe test/setup.ts",
    env: {
      VITE_PASS1_PROVIDER: "gemini-2.5-flash",
      VITE_PASS2_PROVIDER: "gemini-2.5-flash",
      VITE_MAGIC_PROVIDER: "gemini-2.5-flash",
    },
  },
});
