// 클립을 가볍게 다시 쓴다 — **안 변하는 트랙을 접어서.**
//
//   node scripts/compact-clips.mjs [팩id …] [--dry] [--eps 1e-7]
//   node scripts/compact-clips.mjs --all
//
// 클립이 배포에서 가장 무겁다 (팩 하나 17MB · 열둘 205MB). 그런데 이동
// 트랙의 절반이 처음부터 끝까지 같은 값이다 — 바이페드 동작이 뼈마다 자리를
// 싣는데 뼈 길이는 안 변하기 때문이다.
//
// **잰 값이 한 글자도 달라지면 안 된다.** 그래서 다시 쓴 뒤 build-pack 을
// 돌려 catalog.json 을 견주는 것이 이 작업의 진짜 검사다 (게이트가 그것을
// 자동으로 한다 — scripts/check-clippack.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGLB } from '../src/lib/gltf.mjs';
import { extractAnimation, motionOnly, encodeGLB } from '../src/lib/gltfWrite.mjs';
import { compactChannels, compactReport, CLIP_EPS } from '../src/lib/clipPack.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const epsArg = argv.indexOf('--eps');
const eps = epsArg >= 0 ? Number(argv[epsArg + 1]) : CLIP_EPS;
let ids = argv.filter((a) => !a.startsWith('--') && !(epsArg >= 0 && a === argv[epsArg + 1]));
if (argv.includes('--all') || !ids.length) {
  ids = fs.readdirSync(path.join(ROOT, 'packs'))
    .filter((id) => fs.existsSync(path.join(ROOT, 'packs', id, 'clips')));
}

let before = 0;
let after = 0;
const all = { tracks: 0, folded: 0, keysBefore: 0, keysAfter: 0, maxRotDeg: 0, maxPosM: 0 };

for (const id of ids) {
  const dir = path.join(ROOT, 'packs', id, 'clips');
  if (!fs.existsSync(dir)) { console.error(`${id}: clips/ 가 없다`); continue; }
  let b = 0;
  let a = 0;
  const acc = { tracks: 0, folded: 0, keysBefore: 0, keysAfter: 0, maxRotDeg: 0, maxPosM: 0 };
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
    const file = path.join(dir, name);
    const buf = fs.readFileSync(file);
    const doc = parseGLB(buf);
    const anim = extractAnimation(doc);
    const { channels, report } = compactChannels(anim.channels, { eps });
    const { doc: out, missing } = motionOnly(doc, { name: anim.name, channels });
    if (missing.length) { console.error(`  ✗ ${id}/${name}: 뼈를 못 찾았다 — ${missing.slice(0, 3).join(', ')}`); continue; }
    const bytes = encodeGLB(out);
    b += buf.length;
    a += bytes.length;
    acc.tracks += report.tracks; acc.folded += report.folded;
    acc.keysBefore += report.keysBefore; acc.keysAfter += report.keysAfter;
    acc.maxRotDeg = Math.max(acc.maxRotDeg, report.maxRotDeg);
    acc.maxPosM = Math.max(acc.maxPosM, report.maxPosM);
    if (!dry) fs.writeFileSync(file, bytes);
  }
  before += b;
  after += a;
  all.tracks += acc.tracks; all.folded += acc.folded;
  all.keysBefore += acc.keysBefore; all.keysAfter += acc.keysAfter;
  all.maxRotDeg = Math.max(all.maxRotDeg, acc.maxRotDeg);
  all.maxPosM = Math.max(all.maxPosM, acc.maxPosM);
  console.log(`  ${id.padEnd(24)} ${(b / 1024 / 1024).toFixed(2)}MB → ${(a / 1024 / 1024).toFixed(2)}MB · ${compactReport(acc)}`);
}

console.log(
  `${dry ? '[재기만] ' : ''}팩 ${ids.length}개 · ${(before / 1024 / 1024).toFixed(2)}MB → ${(after / 1024 / 1024).toFixed(2)}MB`
  + ` (${(100 * (1 - after / before)).toFixed(1)}% 줄었다) · ${compactReport(all)}`,
);
if (!dry) console.log('  다시 구워서 잰 값이 그대로인지 볼 것: node scripts/build-pack.mjs <팩>');
