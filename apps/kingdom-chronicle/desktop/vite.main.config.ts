import { defineConfig } from "vite";

export default defineConfig({
  define: { __KC_UPDATE_LAB__: "false", __KC_LAB_USER_DATA__: "undefined" },
  build: { rollupOptions: { external: ["electron", "electron-updater"] } },
});
