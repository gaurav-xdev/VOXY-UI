import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_TARGET = process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:8080";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Precompressed assets: the server serves .br/.gz directly (no per-request CPU).
    compression({ algorithms: ["brotliCompress", "gzip"], threshold: 1024, exclude: [/\.(png|jpe?g|webp|woff2)$/i] }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    target: "es2022",
    outDir: "dist/client",
    sourcemap: false, // no source maps shipped to browsers
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(three|@react-three|three-stdlib|maath|meshline|troika|postprocessing|camera-controls)/.test(id)) return "three";
          if (/node_modules\/(react|react-dom|scheduler|react-router|@tanstack)\//.test(id)) return "react";
          if (/node_modules\/(framer-motion|motion-dom|motion-utils|gsap|lenis)/.test(id)) return "motion";
          return undefined;
        },
      },
    },
  },
  // Dev: the SPA talks to the API through a same-origin proxy (cookies + CSRF behave like production).
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: { "/api": { target: API_TARGET, changeOrigin: false, xfwd: true } },
  },
});
