/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// The build stamp lets staff and maintainers tell two deploys of the same version apart
const buildStamp = process.env.BUILD_STAMP ?? new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/, so CI sets BASE_PATH
  base: process.env.BASE_PATH ?? "/",
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version} (${buildStamp})`),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["cards/*.pdf", "models/*.onnx"],
      manifest: {
        name: "Keep Tahoe Blue Card Digitizer",
        short_name: "KTB Cards",
        description: "Turns Cleanup Data Cards into checked, exportable data",
        theme_color: "#0b5aa5",
        background_color: "#ffffff",
        display: "standalone",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      workbox: {
        // OpenCV.js and the ONNX runtime are large but must work offline
        maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,svg,wasm,onnx,json,pdf,mjs}"],
        // transformers.js's runtime is only needed for handwriting and Other
        // matching. It's cached on first use instead of on first visit
        globIgnores: ["**/*asyncify*.wasm"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith(".wasm"),
            handler: "CacheFirst",
            options: { cacheName: "runtimes", cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Text and embedding models, and the runtime transformers.js fetches for them
            urlPattern: ({ url }) =>
              url.hostname === "huggingface.co" ||
              url.hostname.endsWith(".hf.co") ||
              url.hostname === "cdn.jsdelivr.net",
            handler: "CacheFirst",
            options: {
              cacheName: "ml-models",
              expiration: { maxEntries: 200 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  worker: { format: "es" },
  optimizeDeps: { exclude: ["onnxruntime-web", "@huggingface/transformers"] },
  build: { target: "es2022", chunkSizeWarningLimit: 20000 },
  test: {
    alias: { "@techstark/opencv-js": new URL("./tests/helpers/opencv-node.ts", import.meta.url).pathname },
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
