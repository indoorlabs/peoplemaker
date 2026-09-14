// 올려 둔 팩을 받는다 — **목록대로, 해시를 확인하면서.**
//
//   node scripts/fetch-packs.mjs <목록 주소> [--tier far] [--pack id,id] [--to packs]
//
//   node scripts/fetch-packs.mjs https://github.com/indoorlabs/peoplemaker/releases/download/packs-2026-09-14/packs.json --tier far
//   node scripts/fetch-packs.mjs file:///C:/.../dist/packs.json --tier far --pack rocketbox-f01
//
// 팩은 저장소에 없다. 소비처(spacemaker)의 node_modules 를 열어 보면 기준 팩
// 하나뿐이라, **진짜 사람을 하나도 못 세운다.** 이 스크립트가 그 구멍을 메운다.
//
// ## 층을 고를 수 있다
//
// 도시 스케일 화면은 먼 몸만 쓴다 — 팩 열둘에 2.1MB 다. 같은 것을 통째로
// 받으면 257MB 다. 무엇이 얼마인지는 목록(packs.json)이 말한다.
//
// ## 해시를 본다
//
// 받다 끊긴 GLB 는 열 때 터지는 것이 아니라 **이상한 자세로 열린다.** 그래서
// 받자마자 목록의 해시와 견주고, 다르면 그 파일을 안 쓴다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TIERS, manifestProblems, MIN_CLIPS, missingClips, bytesFor, fileUrl } from '../src/lib/dist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
  else pos.push(argv[i]);
}
const src = pos[0];
if (!src) {
  console.error('쓰임: node scripts/fetch-packs.mjs <목록 주소> [--tier far|near|all|sheet] [--pack id,id] [--to packs]');
  console.error(`층: ${Object.keys(TIERS).join(' · ')}`);
  process.exit(2);
}
const tier = flags.tier || 'all';
if (!TIERS[tier]) { console.error(`모르는 층 '${tier}' — ${Object.keys(TIERS).join(' · ')}`); process.exit(2); }
const only = flags.pack ? new Set(flags.pack.split(',')) : null;
// **층만 받으면 사람이 안 움직인다.** 클립은 쓰는 쪽이 고른다 — 안 고르면
// 가장 적은 묶음(서기·걷기)을 받는다. 'all' 이면 전부, 'none' 이면 안 받는다.
const clipArg = flags.clips === undefined ? MIN_CLIPS
  : flags.clips === 'all' ? 'all'
    : flags.clips === 'none' ? []
      : flags.clips.split(',');
const to = path.resolve(flags.to || path.join(ROOT, 'packs'));

const base = new URL(src.includes('://') ? src : pathToFileURL(path.resolve(src)).href);
const get = async (rel) => {
  const u = new URL(rel, base);
  if (u.protocol === 'file:') return fs.readFileSync(fileURLToPath(u));
  const res = await fetch(u);
  if (!res.ok) throw new Error(`${u} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

const manifest = JSON.parse((await get('packs.json')).toString('utf8'));
const probs = manifestProblems(manifest);
if (probs.length) {
  console.error(`목록이 말이 안 된다 (${probs.length}군데):`);
  for (const p of probs.slice(0, 5)) console.error(`  ${p.key}: ${p.why}`);
  process.exit(1);
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const match = TIERS[tier].match;
const kb = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`);

let got = 0;
let bytes = 0;
let skipped = 0;
let broken = 0;
for (const p of manifest.packs) {
  if (only && !only.has(p.packId)) continue;
  const chosen = clipArg === 'all' ? null : new Set(clipArg);
  const gone = missingClips(p, clipArg);
  if (gone.length) console.error(`  ! ${p.packId}: 이 팩에 없는 클립을 달라고 했다 — ${gone.join(' · ')}`);
  const want = p.files.filter((f) => {
    if (f.path.startsWith('clips/')) {
      if (clipArg === 'all') return true;
      return chosen.has(f.path.slice(6).replace(/\.glb$/, ''));
    }
    return match(f.path);
  });
  for (const f of want) {
    const dst = path.join(to, p.packId, f.path);
    // 이미 있고 해시가 같으면 다시 안 받는다.
    if (fs.existsSync(dst) && sha(fs.readFileSync(dst)) === f.sha256) { skipped++; continue; }
    // 주소는 목록이 말하는 배치로 만든다 — 저장하는 자리는 안 달라진다.
    const buf = await get(fileUrl(manifest, p.packId, f.path));
    if (sha(buf) !== f.sha256) {
      console.error(`  ✗ ${p.packId}/${f.path} — 받은 것이 목록과 다르다 (받다 끊기면 이상한 자세로 열린다)`);
      broken++;
      continue;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, buf);
    got++;
    bytes += buf.length;
  }
  console.log(`  ${p.packId.padEnd(24)} ${want.length}개 · ${kb(want.reduce((s, f) => s + f.bytes, 0))}`
    + (clipArg === 'all' ? ' (클립 전부)' : ` (클립 ${chosen.size}개)`));
}

const planned = manifest.packs
  .filter((p) => !only || only.has(p.packId))
  .reduce((s, p) => s + bytesFor(p, { tier, clips: clipArg }), 0);
console.log(
  `${tier} 층 + 클립 ${clipArg === 'all' ? '전부' : clipArg.length + '개'} = ${kb(planned)} · `
  + `받음 ${got}개 ${kb(bytes)} · 이미 있던 것 ${skipped}개`
  + (broken ? ` · **깨진 것 ${broken}개**` : '')
  + ` → ${path.relative(ROOT, to) || to}`,
);
process.exit(broken ? 1 : 0);
