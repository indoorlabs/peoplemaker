// 소비처에서 정말 돌아가는가 — **저쪽의 three 로** 문을 열어 본다.
//
//   node scripts/smoke-consumer.mjs [three 가 설치된 곳]
//   node scripts/smoke-consumer.mjs ../spacemaker/node_modules/three
//
// 이 저장소는 계약이 전부인데, 게이트는 늘 **우리 three** 로만 검사한다
// (devDependency). 소비처는 제 판을 쓰고 — spacemaker 는 0.183, 우리는
// 0.186 이다. three 는 판이 바뀔 때 API 가 조용히 바뀌는 라이브러리라,
// "우리 기계에서는 되는데" 가 생기는 자리가 바로 여기다.
//
// 그래서 **주입받는 판을 바꿔** 같은 길을 걸어 본다: 팩을 받고 · 사람을
// 세우고 · 클립을 갈아타고 · 군중을 굽고 · 시나리오를 미리 본다.
//
// 이것은 게이트가 아니다 (남의 저장소가 있어야 돌아간다). 사람이 부르는
// 시험이고, 무엇이 됐는지 수로 찍는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
const threeDir = arg
  ? path.resolve(arg)
  : path.join(ROOT, 'node_modules', 'three');

if (!fs.existsSync(path.join(threeDir, 'package.json'))) {
  console.error(`three 가 ${threeDir} 에 없다`);
  process.exit(2);
}
const pkg = JSON.parse(fs.readFileSync(path.join(threeDir, 'package.json'), 'utf8'));
const imp = (rel) => import(pathToFileURL(path.join(threeDir, rel)).href);

const say = [];
let bad = 0;
const ok = (what, detail) => { say.push(`  ✓ ${what.padEnd(28)} ${detail}`); };
const no = (what, why) => { bad++; say.push(`  ✗ ${what.padEnd(28)} ${why}`); };

const THREE = await imp('build/three.module.js').catch(() => imp('src/Three.js'));
const { GLTFLoader } = await imp('examples/jsm/loaders/GLTFLoader.js');
const { clone: skClone } = await imp('examples/jsm/utils/SkeletonUtils.js').then((m) => ({ clone: m.clone }));
const SkeletonUtils = { clone: skClone };
const api = await import('../src/web/index.mjs');

console.log(`소비처 시험 — three ${pkg.version} (${path.relative(ROOT, threeDir)})`);

// 팩을 파일에서 받는다 (브라우저 없이).
const PACK = process.env.SMOKE_PACK || 'rocketbox-f01';
const dir = path.join(ROOT, 'packs', PACK);
const fileFetch = async (u) => {
  const f = path.join(dir, u.replace(`pack://${PACK}/`, '').replace(`pack://${PACK}`, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return { ok: false, status: 404 };
  const b = fs.readFileSync(f);
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(b.toString('utf8')),
    arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  };
};

// ── 1. 팩을 받는다 ──
//
// **몸째는 브라우저가 있어야 열린다.** three 의 GLTFLoader 가 그림을
// `self.createImageBitmap` 으로 푸는데 Node 에는 `self` 가 없다 — 이 시험을
// 쓰다 밟았다. 게이트는 텍스처 없는 기준 팩만 열어 봐서 여태 몰랐다.
// 먼 몸에는 텍스처가 없으므로 브라우저 밖에서도 열린다.
let pack = null;
try {
  await api.loadPack({ url: `pack://${PACK}`, GLTFLoader, fetchImpl: fileFetch });
  ok('몸째 받기', '브라우저 밖에서도 열린다 (three 가 그림을 풀 수 있다)');
} catch (e) {
  const browserOnly = /브라우저에서만 읽힌다/.test(e.message);
  say.push(`  · ${'몸째 받기'.padEnd(28)} ${browserOnly ? '브라우저가 필요하다 (먼 몸으로 간다) — 말이 되는 오류를 낸다' : `말이 안 되는 오류: ${e.message}`}`);
  if (!browserOnly) bad++;
}
try {
  pack = await api.loadPack({ url: `pack://${PACK}`, GLTFLoader, fetchImpl: fileFetch, body: 'far' });
  ok('먼 몸으로 받기', `${pack.catalog.packId} · 클립 ${pack.catalog.clips.length} · ${pack.farLevel.file} 정점 ${pack.farLevel.vertices}`);
} catch (e) {
  no('먼 몸으로 받기', e.message);
}

if (pack) {
  // ── 2. 가까운 사람 — 세우고, 걷고, 클립을 갈아탄다 ──
  try {
    const player = api.createClipPlayer({ THREE, SkeletonUtils, catalog: pack.catalog, gltfOf: pack.gltfOf });
    const p = player.spawn({ clipId: 'idle', position: [0, 0, 0], headingRad: 0 });
    const pick = player.walkAt(p, 1.1);
    player.update(0.1);
    const before = player.boneWorld(p, 'Bip01 Head') || player.boneWorld(p, 'mixamorig:Head');
    player.playClip(p, 'walk-forward');
    const fade = p.fadeS;
    for (let t = 0; t < 0.4; t += 1 / 60) player.update(1 / 60);
    ok('사람 세우기·걷기', `${pick ? `${pick.clipId} ×${pick.timeScale.toFixed(2)} → ${pick.effectiveMps?.toFixed(2) ?? '?'}m/s` : '걷기 못 고름'} · 섞기 ${fade}s · 머리 ${before ? '찾음' : '못 찾음'}`);
  } catch (e) {
    no('사람 세우기·걷기', e.message);
  }

  // ── 3. 먼 군중 — 굽고 세운다 ──
  try {
    const atlas = api.bakeFromPack(pack, ['walk-forward', 'idle']);
    const geom = api.geometryOf(pack);   // 먼 몸은 이미 줄이고 색까지 구워져 있다
    const crowd = api.createInstancedCrowd({ THREE, geometry: geom, atlas, count: 200 });
    crowd.place(0, { position: [1, 0, 2], headingRad: 0, clipId: 'walk-forward' });
    crowd.update(0.05);
    ok('먼 군중', `정점 ${geom.getAttribute('position').count} · 드로우콜 ${crowd.drawCalls} · 아틀라스 ${atlas.clips.length}클립`);
    crowd.dispose();
  } catch (e) {
    no('먼 군중', e.message);
  }

  // ── 4. 섞어 세우기 ──
  try {
    const atlas = api.bakeFromPack(pack, ['walk-forward', 'idle']);
    const kinds = [
      { id: 'a', geometry: api.geometryOf(pack), atlas },
      { id: 'b', geometry: api.geometryOf(pack, { lod: 0.5 }), atlas },
    ];
    const mixed = api.createMixedCrowd({ THREE, kinds, count: 10 });
    mixed.place(3, { position: [0, 0, 0], clipId: 'idle' });
    mixed.update(0.05);
    ok('몸 섞어 세우기', `${mixed.counts.join('+')} · 드로우콜 ${mixed.drawCalls}`);
    mixed.dispose();
  } catch (e) {
    no('몸 섞어 세우기', e.message);
  }
}

// ── 5. 순수 층 — three 없이 쓰는 문 ──
try {
  const catalogs = fs.readdirSync(path.join(ROOT, 'packs'))
    .map((id) => path.join(ROOT, 'packs', id, 'catalog.json'))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const profiles = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'profiles'))) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles', f), 'utf8'));
    profiles[j.id] = j;
  }
  const r = api.planScenario({ id: 'school-fire-drill', ...api.SCENARIOS['school-fire-drill'] }, {
    profiles, packs: catalogs, count: 530,
  });
  ok('시나리오 미리보기', `${r.ko} — ${r.ok ? '된다' : `막힌 곳 ${r.blockers.length}`} · 배역 ${r.cast?.filled}/${r.cast?.count}`);
  const tally = api.attributionTally(catalogs);
  ok('표기 의무', `클립 ${tally.total} 중 ${tally.needing}개가 표기 필요`);
} catch (e) {
  no('순수 층', e.message);
}

// ── 6. 문에 있어야 할 것이 다 있는가 ──
{
  const missing = ['loadPack', 'createClipPlayer', 'createInstancedCrowd', 'createMixedCrowd',
    'planCast', 'planRoutine', 'planScenario', 'attributionsFor', 'crossFadeS']
    .filter((k) => api[k] === undefined);
  if (missing.length) no('문', `없는 것: ${missing.join(' · ')}`);
  else ok('문', `${Object.keys(api).length}개를 내보낸다`);
}

console.log(say.join('\n'));
console.log(bad ? `\n✗ ${bad}가지가 안 된다 (three ${pkg.version})` : `\n전부 된다 (three ${pkg.version})`);
process.exit(bad ? 1 : 0);
