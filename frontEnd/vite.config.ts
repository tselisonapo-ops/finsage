import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
    minify: "esbuild",
    rollupOptions: {
      input: {
        dashboard: path.resolve(__dirname, "dashboard.html"),
        leaseWizard: path.resolve(__dirname, "lease-wizard.html"),
        hostMount: path.resolve(__dirname, "src/drawer/hostMount.ts"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:5000",
    },
  },
});