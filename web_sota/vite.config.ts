import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Frontend 14114; proxies /api -> FastAPI/Starlette backend on 14115.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 14114,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:14115", changeOrigin: true },
    },
  },
});
