import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = path.resolve(__dirname, "..");
const developmentCsp = {
  name: "kingdom-chronicle-development-csp",
  apply: "serve" as const,
  transformIndexHtml(html: string) {
    return html.replace("connect-src 'none'", "connect-src 'self' http://localhost:* ws://localhost:*");
  },
};

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  plugins: [react(), developmentCsp],
  resolve: {
    alias: { "@": projectRoot },
    dedupe: ["react", "react-dom"],
  },
  server: { fs: { allow: [projectRoot, __dirname] } },
  build: {
    emptyOutDir: true,
    outDir: path.resolve(__dirname, ".vite/renderer/main_window"),
  },
});
