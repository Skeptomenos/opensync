import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

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
  },
});
