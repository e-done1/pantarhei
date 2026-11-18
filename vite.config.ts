import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const gatewayHost = process.env.GATEWAY_HOST || "localhost:8080";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    target: ["chrome69", "es2018"],
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
  },
  server: {
    host: "0.0.0.0", // Listen on all network interfaces so LAN devices/tablets can connect
    port: 3000,
    proxy: {
      "/api": {
        target: `http://${gatewayHost}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://${gatewayHost}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
