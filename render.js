// Renders every specs/*.json that has no matching site/videos/*.mp4 yet.
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
async function renderOne(b, specPath, out) {
  const spec = JSON.parse(fs.readFileSync(specPath));
  const p = await b.newPage(); await p.setViewport({ width: 1080, height: 1920 });
  await p.goto('file://' + path.resolve('preview.html'));
  const dur = await p.evaluate(s => load(s), spec);
  const { b64 } = await p.evaluate((d, s) => renderMusic(d, s), dur, spec.id || 1);
  fs.writeFileSync(out + '.wav', Buffer.from(b64, 'base64'));
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-i', out + '.wav', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out + '.tmp.mp4']);
  for (let f = 0; f < Math.round(dur * 30); f++) {
    await p.evaluate(t => frame(t), f / 30);
    const buf = await p.screenshot({ type: 'jpeg', quality: 90 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); const code = await new Promise(r => ff.on('close', r)); await p.close();
  if (code) throw new Error('ffmpeg failed for ' + specPath);
  fs.renameSync(out + '.tmp.mp4', out + '.mp4'); fs.unlinkSync(out + '.wav');
  await new Promise(r => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.6', '-i', out + '.mp4', '-frames:v', '1', out + '.jpg']).on('close', r));
}
(async () => {
  fs.mkdirSync('site/videos', { recursive: true });
  const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const list = [];
  for (const f of fs.readdirSync('specs').filter(f => f.endsWith('.json')).sort()) {
    const id = f.replace('.json', ''), out = 'site/videos/' + id;
    if (!fs.existsSync(out + '.mp4')) { console.log('rendering', id); await renderOne(b, 'specs/' + f, out); }
    const spec = JSON.parse(fs.readFileSync('specs/' + f));
    list.push({ id, file: 'videos/' + id + '.mp4', thumb: 'videos/' + id + '.jpg', yt: spec.yt || {}, publishAt: spec.publishAt || null });
  }
  await b.close();
  fs.writeFileSync('site/videos.json', JSON.stringify(list, null, 2));
  fs.writeFileSync('site/index.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodeInShorts</title><style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0d0b24;color:#f5f3ff;padding:24px}h1{color:#5EEAD4}.g{display:flex;flex-wrap:wrap;gap:16px}.c{width:220px}video{width:220px;border-radius:12px}a{color:#5EEAD4}</style></head><body><h1>CodeInShorts</h1><p>Daily coding Shorts · <a href="https://www.youtube.com/@codeinshortsdev">youtube.com/@codeinshortsdev</a></p><div class="g">${list.map(v => `<div class="c"><video src="${v.file}" poster="${v.thumb}" controls preload="none"></video><div>${(v.yt.title || v.id).replace(/</g, '&lt;')}</div></div>`).join('')}</div></body></html>`);
  console.log('videos:', list.length);
})();
