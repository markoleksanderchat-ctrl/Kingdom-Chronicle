import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../release-lab', import.meta.url)));
await mkdir(root, { recursive: true });
const control = path.join(root, 'server-control.json'), log = path.join(root, 'server-requests.jsonl');
const server = http.createServer(async (req, res) => {
  const start = Date.now(); let sent = 0;
  try {
    const settings = JSON.parse(await readFile(control, 'utf8'));
    if (settings.mode === 'offline') { res.writeHead(503); res.end('Test offline'); return; }
    const url = new URL(req.url, 'http://127.0.0.1:5195');
    if (url.pathname === '/stable/latest.yml') {
      const body = settings.mode === 'malformed' ? 'version: [broken' : await readFile(path.join(root, settings.version, 'latest.yml'));
      res.writeHead(200, { 'content-type': 'text/yaml', 'cache-control': 'no-store' }); res.end(body); return;
    }
    const match = /^\/stable\/(\d+\.\d+\.\d+)\/(KingdomChronicleLab-\d+\.\d+\.\d+-Setup\.exe(?:\.blockmap)?)$/.exec(url.pathname);
    if (!match) { res.writeHead(404); res.end(); return; }
    const file = path.join(root, match[1], match[2]), info = await stat(file);
    if (settings.mode === 'missing' && match[1] === settings.version) { res.writeHead(404); res.end(); return; }
    if (settings.mode === 'corrupt-blockmap' && file.endsWith('.blockmap') && match[1] === settings.version) { res.end('broken blockmap'); return; }
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    const offset = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    const headers = { 'content-type': 'application/octet-stream', 'accept-ranges': 'bytes', 'content-length': String(end - offset + 1) };
    if (range) headers['content-range'] = `bytes ${offset}-${end}/${info.size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(file, { start: offset, end, highWaterMark: settings.mode === 'slow' ? 32768 : 256 * 1024 });
    res.once('close', () => stream.destroy());
    for await (let chunk of stream) {
      if (settings.mode === 'corrupt-installer' && match[1] === settings.version && file.endsWith('.exe')) { chunk = Buffer.from(chunk); chunk[0] ^= 255; }
      sent += chunk.length;
      if (settings.mode === 'interrupted' && sent > 200_000) { res.destroy(); break; }
      if (!res.write(chunk)) await new Promise(resolve => res.once('drain', resolve));
      if (settings.mode === 'slow') await new Promise(resolve => setTimeout(resolve, 30));
    }
    res.end();
  } catch (error) { if (!res.headersSent) res.writeHead(404); res.end(String(error)); }
  finally { await appendFile(log, JSON.stringify({ at: new Date().toISOString(), url: req.url, range: req.headers.range ?? null, status: res.statusCode, bytes: sent, seconds: (Date.now()-start)/1000 }) + '\n'); }
});
server.listen(5195, '127.0.0.1', () => console.log('Update lab: http://127.0.0.1:5195/stable'));
