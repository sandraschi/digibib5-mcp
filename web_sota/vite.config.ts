import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Frontend 14114; proxies /api -> Starlette backend on 14115.
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		host: "127.0.0.1",
		port: 14114,
		strictPort: true,
		proxy: {
			"/api": { target: "http://127.0.0.1:14115", changeOrigin: true },
		},
	},
});
