import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../release-lab', import.meta.url))), data = path.join(root, 'user-data');
const executable = process.argv[2];
if (!executable || path.basename(executable) !== 'KingdomChronicleLab.exe' || !path.isAbsolute(executable)) throw new Error('Pass the installed isolated test EXE.');
const environment = { ...process.env, KINGDOM_UPDATE_LAB_USER_DATA: data };
const stateFile = path.join(data, 'updates/lab-state.json'), reportFile = path.join(root, 'update-cycles.json');
const report = { startedAt: new Date().toISOString(), cycles: [], failures: [], productionPublished: false };
const save = () => writeFile(reportFile, JSON.stringify(report, null, 2));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = async () => JSON.parse(await readFile(stateFile, 'utf8'));
async function until(predicate, timeout = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { const current = await state(); if (predicate(current)) return current; } catch { /* Atomic state replacement/startup. */ }
    await delay(100);
  }
  throw new Error(`Timed out. Last state: ${JSON.stringify(await state())}`);
}
async function command(argument) {
  const child = spawn(executable, argument ? [argument] : [], { env: environment, stdio: 'ignore', windowsHide: true });
  if (!argument) { child.unref(); return; }
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Lab CLI failed: ${code}`))); });
}
async function feed(version, mode) { await writeFile(path.join(root, 'server-control.json'), JSON.stringify({ version, mode })); }
const files = ['settings.json', 'cache/last-good.json', 'update-lab-preserve.json'];
async function fingerprints() {
  const result = {};
  for (const name of files) result[name] = createHash('sha256').update(await readFile(path.join(data, name))).digest('hex');
  result.report = createHash('sha256').update(await readFile(path.join(root, 'fixture-instance/colonybridge/latest/colony.json'))).digest('hex');
  return result;
}
const originalData = await fingerprints(); report.originalData = originalData;
async function startMenuLaunch() {
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const script = `$link=Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\Kingdom Chronicle Update Lab.lnk'; $shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($link); if($shortcut.TargetPath -ine ${quote(executable)}) { throw 'Unexpected lab shortcut target' }; Start-Process -FilePath $link -WindowStyle Hidden; Write-Output $shortcut.TargetPath`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', script], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = ''; child.stdout.on('data', value => output += value); child.stderr.on('data', value => output += value);
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(output)));
  });
}
async function check(version) {
  const prior = await state(); await command('--update-lab-check');
  return until(next => next.revision > prior.revision && ['available', 'error', 'current'].includes(next.phase) && (next.phase !== 'available' || next.latestVersion === version));
}
async function ready(version) {
  await check(version); const started = Date.now(); await command('--update-lab-download');
  const result = await until(next => next.latestVersion === version && ['ready', 'error'].includes(next.phase));
  return { state: result, seconds: (Date.now() - started) / 1000 };
}
async function install(version, downloadSeconds = null) {
  const previous = await state(); if (previous.phase !== 'ready' || previous.latestVersion !== version) throw new Error('Expected a verified ready update.');
  const started = Date.now(); await command('--update-lab-restart');
  const next = await until(value => value.currentVersion === version && value.pid !== previous.pid && ['current', 'checking'].includes(value.phase), 90_000);
  const success = JSON.parse(await readFile(path.join(data, 'updates/last-success.json'), 'utf8'));
  if (success.expectedVersion !== version) throw new Error('Relaunched app failed its expected-version health check.');
  const preserved = await fingerprints();
  if (JSON.stringify(preserved) !== JSON.stringify(originalData)) throw new Error('Fixture settings/reports changed across installation.');
  const directories = await readdir(path.dirname(executable));
  if (directories.some(name => /^app-\d/.test(name))) throw new Error('Version folders accumulated.');
  const relaunchSeconds = (Date.now()-started)/1000;
  if (path.resolve(next.executable) !== path.resolve(executable)) throw new Error('Unknown relaunch process.');
  process.kill(next.pid); await delay(1500);
  const shortcutTarget = await startMenuLaunch();
  const shortcutLaunch = await until(value => value.currentVersion === version && value.pid !== next.pid && value.phase === 'current');
  if (JSON.stringify(await fingerprints()) !== JSON.stringify(originalData)) throw new Error('Start Menu launch changed fixture data.');
  const item = { previousVersion: previous.currentVersion, currentVersion: version, previousPid: previous.pid, newPid: next.pid,
    automaticRelaunch: true, installAndHealthyRelaunchSeconds: relaunchSeconds, downloadSeconds, dataPreserved: true, versionFolders: 0,
    startMenuTarget: shortcutTarget, startMenuVersion: shortcutLaunch.currentVersion, startMenuPid: shortcutLaunch.pid };
  report.cycles.push(item); await save(); console.log(JSON.stringify(item));
}
try {
  // B was downloaded through the real native Updates screen.
  await install('0.3.101');
  for (const mode of ['offline', 'malformed']) {
    await feed('0.3.102', mode); const result = await check('0.3.102');
    if (result.phase !== 'error' || result.progress) throw new Error(`${mode} was not a clean error state.`);
    report.failures.push({ scenario: mode, safeError: true }); await save();
  }
  await feed('0.3.102', 'missing'); const missing = await ready('0.3.102');
  if (missing.state.phase !== 'error') throw new Error('Missing artifact was accepted.');
  report.failures.push({ scenario: 'missing artifact', safeError: true });
  await feed('0.3.102', 'corrupt-blockmap'); const fallback = await ready('0.3.102');
  if (fallback.state.phase !== 'ready') throw new Error('Full-package fallback failed.');
  report.failures.push({ scenario: 'corrupt blockmap', fullFallbackSucceeded: true });
  await install('0.3.102', fallback.seconds);
  await feed('0.3.103', 'interrupted'); const interrupted = await ready('0.3.103');
  if (interrupted.state.phase !== 'error' || interrupted.state.progress) throw new Error('Interrupted download was accepted.');
  report.failures.push({ scenario: 'interrupted connection', safeError: true }); await save();
  await feed('0.3.103', 'slow'); await check('0.3.103'); await command('--update-lab-download');
  const downloading = await until(value => value.phase === 'downloading');
  if (path.resolve(downloading.executable) !== path.resolve(executable)) throw new Error('Refusing to stop an unknown process.');
  process.kill(downloading.pid); await delay(1500); await command();
  const recovered = await until(value => value.currentVersion === '0.3.102' && value.latestVersion === '0.3.103' && ['ready', 'error'].includes(value.phase), 180_000);
  if (recovered.phase !== 'ready') throw new Error('Reopen did not recover the interrupted download.');
  report.failures.push({ scenario: 'close during download and reopen', backgroundRecoverySucceeded: true });
  await feed('0.3.103', 'normal'); await install('0.3.103');
  await feed('0.3.104', 'corrupt-installer'); const corrupt = await ready('0.3.104');
  if (corrupt.state.phase !== 'error') throw new Error('Checksum mismatch was accepted.');
  report.failures.push({ scenario: 'corrupt installer/checksum mismatch', safeError: true }); await save();
  await feed('0.3.104', 'normal'); const final = await ready('0.3.104');
  if (final.state.phase !== 'ready') throw new Error('Valid retry after corruption failed.');
  await install('0.3.104', final.seconds);
  report.completedAt = new Date().toISOString(); await save();
  console.log(`UPDATE LAB COMPLETE: ${report.cycles.length} upgrades; ${report.failures.length} recovery scenarios. ${reportFile}`);
} catch (error) { report.error = String(error); await save(); console.error(error); process.exitCode = 1; }
