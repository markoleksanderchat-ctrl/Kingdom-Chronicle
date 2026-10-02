import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../release-lab', import.meta.url)));
const fixtureFile = process.argv[2];
if (!fixtureFile) throw new Error('Pass a saved QA runtime fixture.');
const saved = JSON.parse(await readFile(fixtureFile, 'utf8'));
const instance = path.join(root, 'fixture-instance'), output = path.join(instance, 'colonybridge'), latest = path.join(output, 'latest/colony.json');
const data = path.join(root, 'user-data');
await mkdir(path.dirname(latest), { recursive: true }); await mkdir(path.join(data, 'cache'), { recursive: true });
await writeFile(latest, JSON.stringify(saved.snapshot));
await writeFile(path.join(output, 'bridge-info.json'), JSON.stringify({ bridgeVersion: '0.29.7', protocolId: 'com.colonybridge.snapshot', schemaVersion: 2,
  outputLayoutVersion: 1, transport: 'filesystem', readOnly: true, status: 'offline', outputRoot: output, latestFiles: [latest], coloniesDetected: 1, lastSuccessfulExportAt: saved.snapshot.generatedAt }));
await writeFile(path.join(data, 'settings.json'), JSON.stringify({ instancePath: instance }));
await writeFile(path.join(data, 'cache/last-good.json'), JSON.stringify({ ...saved, instancePath: instance, instanceName: 'fixture-instance' }));
await writeFile(path.join(data, 'update-lab-preserve.json'), JSON.stringify({ marker: 'settings and reports must survive' }));
await writeFile(path.join(root, 'server-control.json'), JSON.stringify({ version: '0.3.100', mode: 'normal' }));
console.log(JSON.stringify({ userData: data, fixture: latest }));
