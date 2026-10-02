const fs = require("node:fs");
const path = require("node:path");

module.exports = {
  packagerConfig: {
    asar: false,
    executableName: "KingdomChronicle",
    afterComplete: [
      (buildPath, _electronVersion, platform, _arch, done) => {
        if (platform !== "win32") return done();
        const packagedRuntime = path.join(buildPath, "KingdomChronicle.exe");
        const launcher = path.join(__dirname, "launcher", "build", "KingdomChronicle.exe");
        const icon = path.join(__dirname, "assets", "kingdom-chronicle.ico");
        const locales = path.join(buildPath, "locales");
        fs.promises.copyFile(packagedRuntime, path.join(buildPath, "electron-runtime.bin")).then(() => Promise.all([
          fs.promises.copyFile(icon, path.join(buildPath, "kingdom-chronicle-icon.bin")),
          fs.promises.copyFile(launcher, path.join(buildPath, "KingdomChronicle.exe")),
          ...["dxcompiler.dll", "dxil.dll", "vk_swiftshader.dll", "vulkan-1.dll", "vk_swiftshader_icd.json"]
            .map((file) => fs.promises.rm(path.join(buildPath, file), { force: true })),
          fs.promises.readdir(locales).then((files) => Promise.all(files
            .filter((file) => file.toLowerCase() !== "en-us.pak")
            .map((file) => fs.promises.rm(path.join(locales, file), { force: true })))),
        ])).then(() => done(), done);
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "KingdomChronicle",
        authors: "Marko",
        description: "Read-only MineColonies companion powered by Colony Bridge",
        setupIcon: path.resolve(__dirname, "assets", "kingdom-chronicle.ico"),
      },
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-vite",
      config: {
        build: [
          { entry: "src/main.ts", config: "vite.main.config.ts" },
          { entry: "src/preload.ts", config: "vite.preload.config.ts" },
        ],
        renderer: [
          { name: "main_window", config: "vite.renderer.config.ts" },
        ],
      },
    },
  ],
};
