// 팩에 **먼 사람용 몸**을 굽는다 — 줄인 살 + 구운 색, 텍스처 없음.
//
//   node scripts/build-far.mjs <packId> [비율]
//   node scripts/build-far.mjs --all
//
// 도시 스케일 화면은 몸의 텍스처(3.7MB)를 한 번도 안 쓴다. 그런데 지금까지는
// 그것을 받아 브라우저에서 130ms 를 들여 매번 줄이고 색을 찍었다. 여기서
// 한 번 구워 팩에 넣으면 받는 쪽은 95KB 만 받는다 (여자 01: 4,238 → 95KB).
//
// 굽는 길은 **한 군데**다 — 새 사람을 받을 때는 import-rocketbox 가 이 파일의
// `bakeFarBody` 를 부르고, 이미 있는 팩은 이 스크립트로 굽는다. 같은 일을 두
// 군데 적으면 갈린다 (손이 닿는 자리를 두 번 적었다가 게이트가 팩을 전부
// 낡았다고 한 적이 있다).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseGLB } from '../src/lib/gltf.mjs';
import { farBody, encodeGLB } from '../src/lib/gltfWrite.mjs';
import { simplifyMesh } from '../src/lib/meshLod.mjs';
import { skinnedMeshOf, imagesOf } from '../src/lib/bodyMesh.mjs';
import { decodePNG } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 먼 몸의 **단계들** — 얼마로 줄이고 어떤 이름으로 둘 것인가.
 *
 * 잰 값은 lib/crowdBudget.mjs 의 instancedLod 에 있다: 4ms 예산에 0.25 는
 * 3,623명 · 0.1 은 8,327명이다. 0.25 짜리를 다시 줄여 쓰지 않는 까닭도
 * 거기 적혀 있다 — 두 번 줄이면 17% 더 벗어난다 (52.7 vs 44.9mm).
 */
export const FAR_LEVELS = [
  { file: 'body-far.glb', ratio: 0.25 },
  { file: 'body-far-10.glb', ratio: 0.1 },
];

/** 예전 이름 — 첫 단계의 비율. */
export const FAR_RATIO = FAR_LEVELS[0].ratio;

/**
 * 몸 GLB 바이트 → 먼 몸 GLB 바이트 + 무엇을 얼마로 줄였는지.
 *
 * @returns { glb, facts }
 */
export function bakeFarBody(bodyBytes, ratio = FAR_RATIO, file = 'body-far.glb') {
  const doc = parseGLB(bodyBytes);
  const full = skinnedMeshOf(doc, { imageOf: imagesOf(doc, decodePNG) });
  // **늘 원래 몸에서 줄인다.** 앞 단계를 다시 줄이면 더 벗어난다 (17%).
  const small = simplifyMesh(full, { ratio });
  return {
    glb: encodeGLB(farBody(doc, small)),
    facts: {
      file,
      ratio,
      vertices: small.stats.verticesAfter,
      triangles: small.stats.trianglesAfter,
      from: { vertices: small.stats.verticesBefore, triangles: small.stats.trianglesBefore },
    },
  };
}

/** 단계 전부를 굽는다 — { glb, facts } 배열. */
export function bakeFarLevels(bodyBytes, levels = FAR_LEVELS) {
  return levels.map((l) => bakeFarBody(bodyBytes, l.ratio, l.file));
}

/** 팩 하나에 구워 넣고 sources.json 에 적는다 — 굽기는 build-pack 이 다시 돈다. */
export function bakeInto(packId, levels = FAR_LEVELS) {
  const dir = path.join(ROOT, 'packs', packId);
  const bodyFile = path.join(dir, 'body.glb');
  if (!fs.existsSync(bodyFile)) return { skipped: '몸(body.glb)이 없는 팩이다' };
  const before = fs.statSync(bodyFile).size;
  const baked = bakeFarLevels(fs.readFileSync(bodyFile), levels);
  for (const { glb, facts } of baked) fs.writeFileSync(path.join(dir, facts.file), glb);

  const sp = path.join(dir, 'sources.json');
  const sources = JSON.parse(fs.readFileSync(sp, 'utf8'));
  sources.bodyFar = baked.map((b) => b.facts);
  fs.writeFileSync(sp, JSON.stringify(sources, null, 2) + '\n');
  return { before, levels: baked.map((b) => ({ ...b.facts, bytes: b.glb.byteLength })) };
}

// 윈도우에서는 file://C:/… 와 file:///C:/… 가 달라서 문자열로 견주면 안 된다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [arg, ratioArg] = process.argv.slice(2);
  const ratio = ratioArg ? Number(ratioArg) : null;
  const packs = arg === '--all'
    ? fs.readdirSync(path.join(ROOT, 'packs')).filter((d) => fs.existsSync(path.join(ROOT, 'packs', d, 'sources.json')))
    : [arg];
  if (!arg) { console.error('쓰임: node scripts/build-far.mjs <packId> [비율] · --all'); process.exit(2); }
  for (const p of packs) {
    const r = bakeInto(p, ratio ? FAR_LEVELS.map((l) => ({ ...l, ratio })) : FAR_LEVELS);
    if (r.skipped) { console.log(`${p}: ${r.skipped}`); continue; }
    console.log(`${p}: 몸 ${Math.round(r.before / 1024)}KB → `
      + r.levels.map((l) => `${l.file} 삼각형 ${l.from.triangles}→${l.triangles} ${Math.round(l.bytes / 1024)}KB`).join(' · '));
    const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-pack.mjs'), p], { encoding: 'utf8' });
    if (b.status !== 0) { console.error(b.stdout, b.stderr); process.exit(b.status ?? 1); }
  }
}
