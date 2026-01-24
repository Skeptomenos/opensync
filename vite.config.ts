import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import {
  handleSyncSession,
  handleSyncMessage,
  handleSyncBatch,
  handleSyncSessionsList,
  handleApiSessions,
  handleApiSessionsGet,
  handleApiSearch,
  handleApiStats,
  handleApiExport,
} from "./server/sync";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "authelia-headers",
      configureServer(server) {
        // Middleware to expose Authelia headers as /api/me endpoint
        server.middlewares.use("/api/me", (req, res) => {
          // Authelia passes these headers through Traefik
          const email = req.headers["remote-email"] || req.headers["remote-user"];
          const name = req.headers["remote-name"];
          const groups = req.headers["remote-groups"];

          res.setHeader("Content-Type", "application/json");
          
          if (email) {
            res.end(JSON.stringify({
              email: Array.isArray(email) ? email[0] : email,
              name: Array.isArray(name) ? name[0] : name,
              groups: groups ? (Array.isArray(groups) ? groups[0] : groups).split(",") : [],
            }));
          } else {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Not authenticated" }));
          }
        });

        // Sync API endpoints for opencode-sync and claude-code-sync plugins
        // These endpoints handle session and message synchronization with Pocketbase
        server.middlewares.use("/sync/session", (req, res) => {
          handleSyncSession(req, res);
        });

        server.middlewares.use("/sync/message", (req, res) => {
          handleSyncMessage(req, res);
        });

        server.middlewares.use("/sync/batch", (req, res) => {
          handleSyncBatch(req, res);
        });

        server.middlewares.use("/sync/sessions/list", (req, res) => {
          handleSyncSessionsList(req, res);
        });

        // Read API endpoints for external consumers (plugins, scripts)
        // Note: These require API key authentication (same as sync endpoints)
        server.middlewares.use("/api/sessions/get", (req, res) => {
          handleApiSessionsGet(req, res);
        });

        server.middlewares.use("/api/sessions", (req, res) => {
          handleApiSessions(req, res);
        });

        server.middlewares.use("/api/search", (req, res) => {
          handleApiSearch(req, res);
        });

        server.middlewares.use("/api/stats", (req, res) => {
          handleApiStats(req, res);
        });

        // Export API endpoint for downloading sessions in various formats
        // Supports: json, csv, markdown
        server.middlewares.use("/api/export", (req, res) => {
          handleApiExport(req, res);
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    allowedHosts: true, // Allow all hosts (required behind reverse proxy)
    proxy: {
      // Proxy Pocketbase API requests to avoid CORS during development.
      // In production, Traefik handles this by routing both to the same origin.
      // All Pocketbase endpoints start with /api/ or /_/ (admin).
      "/api/health": {
        target: "http://localhost:8090",
        changeOrigin: true,
      },
      "/api/collections": {
        target: "http://localhost:8090",
        changeOrigin: true,
      },
      "/api/admins": {
        target: "http://localhost:8090",
        changeOrigin: true,
      },
      "/api/realtime": {
        target: "http://localhost:8090",
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying for realtime subscriptions
      },
      "/api/files": {
        target: "http://localhost:8090",
        changeOrigin: true,
      },
      "/_": {
        target: "http://localhost:8090",
        changeOrigin: true,
      },
    },
  },
});
