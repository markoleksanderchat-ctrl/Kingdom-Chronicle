import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export async function buildLegacyBridge(root, directory, bridgeVersion, nsisVersion, fingerprint) {
  const compare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0]-y[0] || x[1]-y[1] || x[2]-y[2]; };
  if (!/^\d+\.\d+\.\d+$/.test(bridgeVersion) || compare(bridgeVersion, nsisVersion) >= 0) throw new Error('Bridge version must be stable and lower than the new NSIS version.');
  const stage = path.join(directory, `legacy-bridge-${Date.now()}`); await mkdir(stage, { recursive: true });
  // Reuse the already-packaged production application and resolved runtime
  // dependencies. Forge's default symlink copy requires Windows developer mode.
  require('@electron/asar').extractAll(path.join(directory, 'win-unpacked/resources/app.asar'), stage);
  const pkg = JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8'));
  pkg.version = bridgeVersion;
  pkg.config = { forge: './forge.config.cjs' };
  pkg.devDependencies = { electron: '42.7.0', '@electron-forge/cli': '7.11.2' };
  await writeFile(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
  const launcher = path.join(stage, 'launcher-build');
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/Build-WindowsAssets.ps1'), '-VersionOverride', bridgeVersion, '-LauncherOutputDirectory', launcher], { stdio: 'inherit', windowsHide: true });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Bridge launcher build failed: ${code}`)));
  });
  // Preserve Squirrel's version-folder contract for the old C# updater, but
  // never run Setup.exe's destructive clean-install path over legacy UserData.
  const configPath = path.join(stage, 'forge.config.cjs');
  await writeFile(configPath, `const fs=require('node:fs');const path=require('node:path');const config=require(${JSON.stringify(path.join(root, 'forge.config.cjs'))});config.plugins=[];config.packagerConfig.electronZipDir=undefined;config.packagerConfig.electronVersion='42.7.0';config.packagerConfig.afterComplete.push((p,v,platform,arch,done)=>Promise.all([fs.promises.copyFile(${JSON.stringify(path.join(launcher, 'KingdomChronicle.exe'))},path.join(p,'KingdomChronicle.exe')),fs.promises.copyFile(${JSON.stringify(path.join(directory, 'win-unpacked/resources/app-update.yml'))},path.join(p,'resources/app-update.yml'))]).then(()=>done(),done));module.exports=config;`);
  const { api } = require('@electron-forge/core');
  const out = path.join(directory, 'bridge-artifacts');
  await api.make({ dir: stage, outDir: out, interactive: false });
  const source = path.join(out, 'make/squirrel.windows/x64', `KingdomChronicle-${bridgeVersion}-full.nupkg`);
  const file = path.join(directory, `KingdomChronicle-${bridgeVersion}-Bridge-Setup.exe`);
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/Build-LegacyBridgeInstaller.ps1'), '-Package', source, '-Version', bridgeVersion, '-Output', file], { stdio: 'inherit', windowsHide: true });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Preserving bridge installer build failed: ${code}`)));
  });
  return { version: bridgeVersion, artifact: await fingerprint(file) };
}
