import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  base: mode === "production" ? "/control/" : "/",

  server: {
    host: "127.0.0.1",
    port: 5175,
    proxy: {
      "/control/api": "http://127.0.0.1:5000",
    },
  },

  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
  },
}));
