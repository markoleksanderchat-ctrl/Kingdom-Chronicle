import { build } from 'vite';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { mkdir, appendFile } from 'node:fs/promises';
export async function buildProduction(root, { lab = false, mark = async (_name, action) => action() } = {}) {
  await mkdir(path.join(root, '.vite/build'), { recursive: true });
  await mark('mainCompilation', () => build({ configFile: false, root,
    define: { __KC_UPDATE_LAB__: JSON.stringify(lab), __KC_LAB_USER_DATA__: lab ? JSON.stringify(path.join(root, 'release-lab/user-data')) : 'undefined', MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined', MAIN_WINDOW_VITE_NAME: '"main_window"' },
    resolve: { alias: { '@': path.dirname(root) } },
    build: { emptyOutDir: false, outDir: path.join(root, '.vite/build'),
      lib: { entry: path.join(root, 'src/main.ts'), formats: ['cjs'], fileName: () => 'main.js' },
      rollupOptions: { external: id => id === 'electron' || id === 'electron-updater' || id.startsWith('node:') || builtinModules.includes(id) }, minify: false } }));
  await mark('preloadCompilation', () => build({ configFile: false, root,
    build: { emptyOutDir: false, outDir: path.join(root, '.vite/build'),
      lib: { entry: path.join(root, 'src/preload.ts'), formats: ['cjs'], fileName: () => 'preload.js' },
      rollupOptions: { external: ['electron'] }, minify: false } }));
  await mark('frontendBuild', () => build({ configFile: path.join(root, 'vite.renderer.config.ts'), base: './' }));
  // The update lab changes only application CSS for one small-change release.
  if (lab && process.env.KINGDOM_LAB_CSS_MARKER) await appendFile(path.join(root, '.vite/renderer/main_window/index.html'),
    `\n<style>:root { --update-lab-marker: ${Number(process.env.KINGDOM_LAB_CSS_MARKER) || 0}; }</style>\n`);
}
