// 팩을 내보낸다 — **무엇이 얼마인지 말하는 목록과 함께.**
//
//   node scripts/build-dist.mjs [나갈 곳]      (기본 dist/)
//
// ## 왜 필요한가
//
// 팩은 **저장소에 없다.** `.gitignore` 가 `packs/rocketbox-*/` 를 통째로
// 무시한다 (클립이 무겁고 재배포가 금지된 것도 있을 수 있어서). 그래서
// `npm i github:indoorlabs/peoplemaker` 로 받은 쪽에는 기준 팩 하나만 간다 —
// spacemaker 의 node_modules 를 열어 보니 정말 그랬다. **소비처는 진짜 사람을
// 하나도 못 세운다.**
//
// 팩 12개를 통째로 보내면 257MB 다. 그런데 쓰는 쪽이 다 받을 이유가 없다:
//
//   먼 사람만 세우는 화면    카탈로그 + 먼 몸 = 팩당 177KB
//   가까운 사람까지          + 몸 4.2MB
//   동작 전부                + 클립 18MB      ← 여기가 무겁다
//
// `loadPack` 은 이미 **파일마다 따로** 받는다 (`clips:` 로 고를 수 있다).
// 그러니 압축해 묶을 이유가 없고, 정적 호스트에 그대로 올린 뒤 **무엇이
// 얼마인지 적은 목록**만 있으면 된다. 그것이 `packs.json` 이다.
//
// 이 스크립트는 아무 데도 올리지 않는다. 올리는 것은 사람이 정한다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { distManifest, bytesFor, MIN_CLIPS } from '../src/lib/dist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

/** 팩 하나의 파일 목록 — 재배포에 쓸 것만. sources.json 은 뺀다(빌드용이다). */
function filesOf(dir) {
  const out2 = [];
  const walk = (rel) => {
    for (const name of fs.readdirSync(path.join(dir, rel || '.'))) {
      const r = rel ? `${rel}/${name}` : name;
      const full = path.join(dir, r);
      if (fs.statSync(full).isDirectory()) { walk(r); continue; }
      if (r === 'sources.json') continue;      // 사람이 적는 것 — 굽는 쪽에만 있으면 된다
      out2.push(r);
    }
  };
  walk('');
  return out2.sort();
}

const packs = [];
for (const id of fs.readdirSync(path.join(ROOT, 'packs'))) {
  const dir = path.join(ROOT, 'packs', id);
  if (!fs.existsSync(path.join(dir, 'catalog.json'))) continue;
  const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
  const files = filesOf(dir).map((rel) => {
    const buf = fs.readFileSync(path.join(dir, rel));
    return { path: rel, bytes: buf.length, sha256: sha(buf) };
  });
  packs.push({ catalog, files });

  // 파일을 그대로 옮긴다 — 묶지도 압축하지도 않는다 (받는 쪽이 골라 받는다).
  for (const f of files) {
    const dst = path.join(out, 'packs', id, f.path);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(dir, f.path), dst);
  }
}
if (!packs.length) { console.error('내보낼 팩이 없다'); process.exit(1); }

const manifest = distManifest(packs, { builtAt: new Date().toISOString().slice(0, 10) });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'packs.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// 표기 의무도 함께 나간다 — 팩만 가고 고지가 안 가면 쓰는 쪽이 못 적는다.
for (const f of ['ATTRIBUTIONS.md']) {
  if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(out, f));
}
if (fs.existsSync(path.join(ROOT, 'licenses'))) {
  fs.mkdirSync(path.join(out, 'licenses'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'licenses'))) {
    fs.copyFileSync(path.join(ROOT, 'licenses', f), path.join(out, 'licenses', f));
  }
}

const kb = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`);
console.log(`${path.relative(ROOT, out)}/ · 팩 ${manifest.packs.length} · 파일 ${manifest.totalFiles} · ${kb(manifest.totalBytes)}`);
for (const t of Object.keys(manifest.tiers)) {
  console.log(`  ${t.padEnd(10)} 팩 하나 ${kb(manifest.tiers[t].perPackBytes)} · 열둘 ${kb(manifest.tiers[t].allBytes)} — ${manifest.tiers[t].what}`);
}

// **층만 받으면 사람이 안 움직인다** — 클립을 골라야 한다. 가장 적은 묶음이
// 얼마인지 함께 찍는다 (받는 쪽이 계산을 다시 안 하게).
const people = manifest.packs.filter((r) => r.person);
const minAll = people.reduce((s, r) => s + bytesFor(r, { tier: 'far', clips: MIN_CLIPS }), 0);
const withRun = people.reduce((s, r) => s + bytesFor(r, { tier: 'far', clips: [...MIN_CLIPS, 'run'] }), 0);
console.log(`  먼 몸 + ${MIN_CLIPS.join('·')}  사람 ${people.length}명에 ${kb(minAll)} — 이만큼이면 군중이 선다`);
console.log(`  거기에 뛰기까지            사람 ${people.length}명에 ${kb(withRun)} — 대피가 된다`);
console.log(`  ${path.relative(ROOT, out)}/packs.json 이 무엇이 얼마인지 말한다 (올리는 것은 사람이 정한다)`);
