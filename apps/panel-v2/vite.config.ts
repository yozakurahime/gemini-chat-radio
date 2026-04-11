import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  base: "/painel/",
  server: {
    host: "::",
    port: 5174,
    strictPort: true,
    hmr: { overlay: false },
    proxy: {
      "/api": "http://localhost:3001",
      "/ads": "http://localhost:3001",
      "/cache": "http://localhost:3001",
      "/admin": "http://localhost:3001",
      "/auth": "http://localhost:3001",
      "/media": "http://localhost:3001",
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
}));
