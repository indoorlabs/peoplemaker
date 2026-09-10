// 데모를 띄운다 — 의존성 없이.
//
//   node scripts/serve-demo.mjs [포트]
//
// 왜 vite 를 안 쓰는가: 이 저장소에서 three 는 **주입받는 것**이지 번들할
// 것이 아니다. 데모는 importmap 으로 node_modules 의 three 를 그대로
// 가리키고, 이 서버는 파일을 그냥 내어 준다. 번들러가 없으니 데모가 실제로
// 브라우저에서 도는 코드와 저장소의 코드가 같다.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 5180;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
};

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = url === '/' ? 'demo/index.html' : url.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  // 저장소 밖으로 나가는 경로는 안 준다.
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('밖'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(`없다: ${rel}`); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, () => {
  console.log(`데모: http://localhost:${port}/`);
  console.log(`  ?people=200&tier=full  로 인원과 단계를 준다`);
});
