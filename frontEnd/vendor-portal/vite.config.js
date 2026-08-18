import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // Local:
  // http://127.0.0.1:5175/
  //
  // Production:
  // https://finspheresolutions.com/app/vendor/
  base: mode === "production"
    ? "/app/vendor/"
    : "/",

  server: {
    host: "127.0.0.1",
    port: 5175,

    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
    emptyOutDir: true,
  },
}));