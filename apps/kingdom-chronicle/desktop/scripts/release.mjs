import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, stat, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildProduction } from './build-production.mjs';
const require = createRequire(import.meta.url), root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2), has = name => args.includes(name), option = name => args[args.indexOf(name) + 1];
const lab = has('--lab'), publish = has('--publish'), resume = has('--resume');
if (lab && publish) throw new Error('Test builds cannot publish to production.');
const packageFile = path.join(root, 'package.json'), pkg = JSON.parse(await readFile(packageFile, 'utf8'));
const bumps = ['--patch', '--minor', '--major'].filter(has);
if (has('--migration') && (lab || bumps.length || has('--version') || has('--bridge-version') || resume)) throw new Error('--migration is a production candidate build with two explicit patch increments. Use it alone.');
if (bumps.length > 1 || resume && (bumps.length || has('--version'))) throw new Error('Use one version option; resume preserves the validated version.');
let version = has('--version') ? option('--version') : pkg.version;
if (bumps.length) {
  const parts = pkg.version.split('.').map(Number), index = bumps[0] === '--major' ? 0 : bumps[0] === '--minor' ? 1 : 2;
  parts[index]++; for (let i = index + 1; i < 3; i++) parts[i] = 0;
  version = parts.join('.');
}
let bridgeVersion = has('--bridge-version') ? option('--bridge-version') : undefined;
if (has('--migration')) {
  const parts = pkg.version.split('.').map(Number); parts[2]++; bridgeVersion = parts.join('.'); parts[2]++; version = parts.join('.');
  console.log(`Migration candidate: Squirrel bridge ${bridgeVersion}; NSIS ${version}. Production is published only with --publish.`);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A stable x.y.z version is required.');
const directory = resume ? path.resolve(option('--resume')) : path.resolve(root, lab ? 'release-lab' : 'release', version);
if (!directory.startsWith(root + path.sep)) throw new Error('Release output must remain inside this project.');
await mkdir(directory, { recursive: true });
const reportFile = path.join(directory, 'release-report.json'), logFile = path.join(directory, 'release.log');
let report = resume ? JSON.parse(await readFile(reportFile, 'utf8')) : { version, lab, createdAt: new Date().toISOString(), stages: {}, published: false };
if (resume && (report.lab !== lab)) throw new Error('Resume requires the original --lab setting.');
if (resume && !report.artifacts) throw new Error('This run failed before artifact generation. Rerun the original build command.');
version = report.version;
const save = () => writeFile(reportFile, JSON.stringify(report, null, 2));
async function mark(name, action) {
  const start = performance.now(); report.currentStage = name; await save();
  try { const result = await action(); report.stages[name] = { seconds: (performance.now() - start) / 1000, success: true }; await save(); return result; }
  catch (error) { report.stages[name] = { seconds: (performance.now() - start) / 1000, success: false, error: String(error) }; await save(); throw error; }
}
function run(scriptArgs, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, scriptArgs, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
    child.once('error', reject); child.once('exit', async code => {
      await writeFile(logFile, `\n${scriptArgs.join(' ')}\n${output}`, { flag: 'a' });
      if (code === 0) resolve(output); else reject(new Error(`Command failed (${code}); see ${logFile}`));
    });
  });
}
async function artifact(file) {
  const sha512 = createHash('sha512'), sha256 = createHash('sha256');
  for await (const chunk of createReadStream(file)) { sha512.update(chunk); sha256.update(chunk); }
  return { fileName: path.basename(file), sizeBytes: (await stat(file)).size, sha512: sha512.digest('base64'), sha256: sha256.digest('hex') };
}
const host = 'https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site';
const api = `${host}/api/desktop-updates-publish`;
const token = process.env.KINGDOM_RELEASE_UPLOAD_TOKEN;
async function request(url, options) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Publication HTTP ${response.status}: ${(await response.text()).slice(0, 600)}`);
  return response;
}
async function upload(file, item, artifactVersion = version) {
  report.uploads ??= {};
  const state = report.uploads[item.fileName] ??= { parts: [] };
  if (state.verified) return; // Immutable object, already byte-verified in this journal.
  const uploadStarted = performance.now();
  const url = new URL(api); url.searchParams.set('version', artifactVersion); url.searchParams.set('file', item.fileName);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  if (!state.uploadId && !state.complete) {
    url.searchParams.set('action', 'start');
    const started = await (await request(url, { method: 'POST', headers, body: JSON.stringify(item) })).json();
    state.uploadId = started.uploadId; state.complete = !!started.exists; await save();
  }
  if (!state.complete) {
    const data = await readFile(file), partSize = 20 * 1024 * 1024;
    url.searchParams.set('uploadId', state.uploadId); url.searchParams.delete('action');
    for (let offset = 0, number = 1; offset < data.length; offset += partSize, number++) {
      if (state.parts.some(part => part.partNumber === number)) continue;
      url.searchParams.set('partNumber', String(number));
      const body = data.subarray(offset, offset + partSize);
      const part = await (await request(url, { method: 'PUT', headers: { authorization: headers.authorization, 'content-length': String(body.length) }, body })).json();
      state.parts.push(part); await save();
    }
    url.searchParams.delete('partNumber'); url.searchParams.set('action', 'complete');
    await request(url, { method: 'POST', headers, body: JSON.stringify({ parts: state.parts }) });
    state.complete = true; await save();
  }
  state.uploadSeconds = (performance.now() - uploadStarted) / 1000;
  // Verify the actual remote bytes, not just self-declared object metadata.
  const remote = `${host}/api/desktop-updates/stable/${artifactVersion}/${item.fileName}`;
  const hash = createHash('sha512'); let size = 0;
  const verifyStarted = performance.now();
  const response = await request(remote);
  for await (const chunk of response.body) { hash.update(chunk); size += chunk.length; }
  if (size !== item.sizeBytes || hash.digest('base64') !== item.sha512) throw new Error(`Remote checksum mismatch: ${item.fileName}`);
  state.verificationSeconds = (performance.now() - verifyStarted) / 1000;
  state.verified = true; await save();
}
try {
  await mark('environmentValidation', async () => {
    if (process.platform !== 'win32' || Number(process.versions.node.split('.')[0]) < 22) throw new Error('Windows and Node >=22 required.');
    for (const [name, wanted] of [['electron', '42.7.0'], ['electron-builder', '26.15.3'], ['electron-updater', '6.8.9']]) {
      if (require(`${name}/package.json`).version !== wanted) throw new Error(`Install locked dependencies: ${name} ${wanted}`);
    }
    if (publish && (!token || token.length < 32)) throw new Error('KINGDOM_RELEASE_UPLOAD_TOKEN is required only for publication.');
    if (publish) {
      const response = await fetch(`${host}/api/desktop-updates/stable/latest.yml`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
      if (response.ok) {
        const currentYaml = await response.text();
        const current = /^version: (\d+\.\d+\.\d+)$/m.exec(currentYaml)?.[1];
        if (!current) throw new Error('Invalid current production metadata.');
        const compare = (a, b) => { const x=a.split('.').map(Number), y=b.split('.').map(Number); return x[0]-y[0] || x[1]-y[1] || x[2]-y[2]; };
        if (version === current && resume && report.artifacts && currentYaml.includes(report.artifacts[0].sha512)) {
          // Recover an unknown outcome after metadata commit, without another build.
          report.published = true;
        } else if (compare(version, current) <= 0 && !report.published) throw new Error(`Version ${version} is already published or older than ${current}.`);
      } else if (response.status === 404) {
        const legacyResponse = await request(`${host}/api/desktop-update`);
        const legacy = (await legacyResponse.json()).latest;
        const compare = (a, b) => { const x=a.split('.').map(Number), y=b.split('.').map(Number); return x[0]-y[0] || x[1]-y[1] || x[2]-y[2]; };
        if (!legacy || compare(version, legacy.version) <= 0) throw new Error('The first NSIS release must be newer than the current legacy release.');
        if (!(bridgeVersion || report.legacy?.version) || compare(bridgeVersion || report.legacy.version, legacy.version) <= 0) throw new Error('The first NSIS release needs a newer Squirrel compatibility bridge: build with --migration.');
      } else throw new Error(`Cannot validate publication target: HTTP ${response.status}`);
    }
  });
  if (!resume) {
    if (!lab && (bumps.length || has('--version') || has('--migration'))) { pkg.version = version; await writeFile(packageFile, JSON.stringify(pkg, null, 2) + '\n'); }
    await mark('typecheck', () => run(['node_modules/typescript/bin/tsc', '--noEmit']));
    await mark('applicationTypecheck', () => run(['node_modules/typescript/bin/tsc', '--noEmit'], path.dirname(root)));
    await mark('lint', () => run(['node_modules/eslint/bin/eslint.js', '.', '--ignore-pattern', 'desktop/release*', '--ignore-pattern', 'dist', '--ignore-pattern', '.next', '--ignore-pattern', 'outputs', '--ignore-pattern', 'work'], path.dirname(root)));
    const desktopTests = (await readdir(path.join(root, 'tests'))).filter(x => x.endsWith('.test.ts')).map(x => `tests/${x}`);
    const appTests = (await readdir(path.join(root, '../tests'))).filter(x => x.endsWith('.test.mjs')).map(x => `tests/${x}`);
    const desktopOutput = await mark('desktopTests', () => run(['--import', 'tsx', '--test', '--test-reporter=tap', ...desktopTests]));
    const appOutput = await mark('applicationTests', () => run(['--import', 'tsx', '--test', '--test-reporter=tap', ...appTests], path.dirname(root)));
    const count = label => [desktopOutput, appOutput].reduce((total, output) => total + Number(new RegExp(`# ${label} (\\d+)`).exec(output)?.[1] ?? 0), 0);
    report.tests = { passed: count('pass'), skipped: count('skipped'), failed: count('fail') };
    await buildProduction(root, { lab, mark });
    const staged = path.join(directory, 'app'); await mkdir(staged, { recursive: true });
    await cp(path.join(root, '.vite'), path.join(staged, '.vite'), { recursive: true });
    await cp(path.join(root, 'assets'), path.join(staged, 'assets'), { recursive: true });
    const stagedPackage = { ...pkg, version, productName: lab ? 'Kingdom Chronicle Update Lab' : pkg.productName,
      name: lab ? 'kingdom-chronicle-update-lab' : pkg.name, devDependencies: undefined, scripts: undefined,
      dependencies: { 'electron-updater': '6.8.9', 'electron-squirrel-startup': '1.0.1' } };
    await writeFile(path.join(staged, 'package.json'), JSON.stringify(stagedPackage, null, 2));
    if (!existsSync(path.join(staged, 'node_modules'))) await symlink(path.join(root, 'node_modules'), path.join(staged, 'node_modules'), 'junction');
    process.env.KINGDOM_RELEASE_LAB = lab ? '1' : '0';
    const config = require('../electron-builder.config.cjs');
    config.directories = { app: staged, output: directory };
    const start = performance.now(); let packaged = start, signed = start;
    config.afterPack = async () => { packaged = performance.now(); report.stages.packaging = { seconds: (packaged - start)/1000, success: true }; await save(); };
    config.afterSign = async () => { signed = performance.now(); report.stages.executableResourcesAndSigning = { seconds: (signed - packaged)/1000, success: true, signingConfigured: !!process.env.CSC_LINK }; await save(); };
    await mark('windowsArtifacts', () => require('electron-builder').build({ projectDir: root, config, publish: 'never' }));
    report.stages.compressionAndInstaller = { seconds: (performance.now() - signed)/1000, success: true };
    const name = `${lab ? 'KingdomChronicleLab' : 'KingdomChronicle'}-${version}-Setup.exe`;
    report.artifacts = [await artifact(path.join(directory, name)), await artifact(path.join(directory, name + '.blockmap'))];
    report.appAsarBytes = (await stat(path.join(directory, 'win-unpacked/resources/app.asar'))).size;
    // Namespace every file by version so both old and new blockmaps stay reachable.
    const yaml = await readFile(path.join(directory, 'latest.yml'), 'utf8');
    report.yaml = yaml.replaceAll(`url: ${name}`, `url: ${version}/${name}`).replaceAll(`path: ${name}`, `path: ${version}/${name}`);
    await writeFile(path.join(directory, 'latest.yml'), report.yaml);
    report.summary = has('--notes') ? option('--notes') : `Kingdom Chronicle ${version}`;
    report.appId = config.appId;
    if (bridgeVersion) {
      if (lab) throw new Error('A legacy migration bridge cannot be a test-channel build.');
      report.legacyBridgeVersion = bridgeVersion;
      const { buildLegacyBridge } = await import('./release-legacy-bridge.mjs');
      report.legacy = await mark('legacyBridge', () => buildLegacyBridge(root, directory, bridgeVersion, version, artifact));
    }
    await save();
  }
  if (resume && !report.legacy && (bridgeVersion || report.legacyBridgeVersion)) {
    report.legacyBridgeVersion = bridgeVersion || report.legacyBridgeVersion;
    const { buildLegacyBridge } = await import('./release-legacy-bridge.mjs');
    report.legacy = await mark('legacyBridge', () => buildLegacyBridge(root, directory, report.legacyBridgeVersion, version, artifact));
  }
  await mark('artifactValidation', async () => {
    for (const item of report.artifacts) {
      const actual = await artifact(path.join(directory, item.fileName));
      if (JSON.stringify(actual) !== JSON.stringify(item)) throw new Error(`Release changed: ${item.fileName}`);
    }
    if (report.legacy) {
      const actual = await artifact(path.join(directory, report.legacy.artifact.fileName));
      if (JSON.stringify(actual) !== JSON.stringify(report.legacy.artifact)) throw new Error('Legacy bridge changed after validation.');
    }
    if (!report.yaml.includes(`version: ${version}`) || !report.yaml.includes(report.artifacts[0].sha512)) throw new Error('Metadata does not match the installer.');
    if (publish && (report.lab || report.appId !== 'com.squirrel.KingdomChronicle.KingdomChronicle')) throw new Error('Development artifacts cannot reach production.');
  });
  if (publish) {
    await mark('uploadAndRemoteVerification', async () => {
      for (const item of report.artifacts) await upload(path.join(directory, item.fileName), item);
      if (report.legacy) await upload(path.join(directory, report.legacy.artifact.fileName), report.legacy.artifact, report.legacy.version);
    });
    if (!report.published) await mark('publishMetadataLast', async () => {
      const release = { appId: report.appId, version, releasedAt: report.createdAt, summary: report.summary, artifacts: report.artifacts, legacy: report.legacy };
      await request(`${api}?action=commit`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(release) });
      report.published = true; await save();
    });
    await mark('publishedMetadataVerification', async () => {
      const yaml = await (await request(`${host}/api/desktop-updates/stable/latest.yml`)).text();
      if (!yaml.includes(`version: ${version}\n`) || !yaml.includes(report.artifacts[0].sha512)) throw new Error('Published metadata differs from validated artifacts.');
    });
  }
  report.currentStage = 'complete'; await save();
  console.log(`KINGDOM CHRONICLE RELEASE ${publish ? 'COMPLETE' : 'READY (NOT PUBLISHED)'}\nVersion: ${version}\nTests: ${report.tests?.passed ?? 'see log'} passed; ${report.tests?.skipped ?? 'see log'} skipped\nInstaller: ${(report.artifacts[0].sizeBytes/1_000_000).toFixed(2)} MB\nBlockmap: ${report.artifacts[1].sizeBytes} bytes\nSigning configured: ${!!process.env.CSC_LINK}\nDifferential download: measure with an installed client\nReport: ${reportFile}`);
} catch (error) {
  console.error(`KINGDOM CHRONICLE RELEASE FAILED\nStage: ${report.currentStage}\n${error}\nDetailed log: ${logFile}\n${report.artifacts ? `Retry successful artifacts: npm run release -- --resume "${directory}"${lab ? ' --lab' : ''}${publish ? ' --publish' : ''}` : 'No complete artifacts yet. Rerun the original build command without another version bump.'}`);
  process.exitCode = 1;
  process.once('exit', () => { process.exitCode = 1; });
}
