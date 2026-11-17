import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

let latestShotPngBuffer: Buffer | null = null;

function shotPngServerPlugin(): Plugin {
  return {
    name: "shot-png-server",
    configureServer(server) {
      // 1. Return network IP info for QR code link
      server.middlewares.use("/api/network-info", (_req, res) => {
        const ip = getLocalIp();
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ip, port: 3000 }));
      });

      // 2. Receive generated PNG card from client
      server.middlewares.use("/api/shot/save", (req, res) => {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", () => {
            try {
              const data = JSON.parse(body);
              if (data.imageBase64) {
                const base64Data = data.imageBase64.replace(/^data:image\/png;base64,/, "");
                latestShotPngBuffer = Buffer.from(base64Data, "base64");
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }
        res.statusCode = 404;
        res.end();
      });

      // 3. Serve direct downloadable PNG on /latest_shot.png
      server.middlewares.use("/latest_shot.png", (_req, res) => {
        if (!latestShotPngBuffer) {
          // Serve a fallback 1x1 PNG if not yet uploaded
          res.setHeader("Content-Type", "image/png");
          res.setHeader("Content-Disposition", 'attachment; filename="latest_shot.png"');
          const emptyPng = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            "base64"
          );
          res.end(emptyPng);
          return;
        }
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Disposition", 'attachment; filename="latest_shot.png"');
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.end(latestShotPngBuffer);
      });

      // 4. Save profile to disk (profiles and profiles_v2) according to Decaid standards
      server.middlewares.use("/api/profiles/save-disk", (req, res) => {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", () => {
            try {
              const payload = JSON.parse(body);
              const { v2Json, tclContent, title } = payload;
              const sanitizedName = (title || "custom_profile")
                .trim()
                .replace(/[<>:"/\\|?*]/g, "")
                .replace(/\s+/g, "_")
                .toLowerCase();

              const savedLocations: string[] = [];

              // Standard directory 1: Local project workspace archives
              const projectV2Dir = path.resolve(__dirname, "src/assets/profiles/profiles_v2");
              const projectTclDir = path.resolve(__dirname, "src/assets/profiles/profiles");
              fs.mkdirSync(projectV2Dir, { recursive: true });
              fs.mkdirSync(projectTclDir, { recursive: true });

              const projectV2Path = path.join(projectV2Dir, `${sanitizedName}.json`);
              const projectTclPath = path.join(projectTclDir, `${sanitizedName}.tcl`);
              fs.writeFileSync(projectV2Path, JSON.stringify(v2Json, null, 2), "utf-8");
              fs.writeFileSync(projectTclPath, tclContent, "utf-8");
              savedLocations.push(projectV2Path, projectTclPath);

              // Standard directory 2: System Decaid/DE1 profiles directories (Drive E:)
              const decentV2Dir = "E:\\decent\\src\\profiles_v2";
              const decentTclDir = "E:\\decent\\src\\profiles";

              if (fs.existsSync(decentV2Dir)) {
                const decentV2Path = path.join(decentV2Dir, `${sanitizedName}.json`);
                fs.writeFileSync(decentV2Path, JSON.stringify(v2Json, null, 2), "utf-8");
                savedLocations.push(decentV2Path);
              }

              if (fs.existsSync(decentTclDir)) {
                // Legacy DE1 uses readable title with spaces for .tcl filename
                const decentTclFilename =
                  (title || "custom_profile").trim().replace(/[<>:"/\\|?*]/g, "") + ".tcl";
                const decentTclPath = path.join(decentTclDir, decentTclFilename);
                fs.writeFileSync(decentTclPath, tclContent, "utf-8");
                savedLocations.push(decentTclPath);
              }

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, savedLocations }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }
        res.statusCode = 404;
        res.end();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), shotPngServerPlugin()],
  base: "./",
  build: {
    target: ["chrome69", "es2018"],
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
  },
  server: {
    host: "0.0.0.0", // Listen on all network interfaces so LAN devices/phones can connect
    port: 3000,
    proxy: {
      "/api/v1": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws/v1": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
});
