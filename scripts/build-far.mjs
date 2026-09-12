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
import { skinnedMeshOf, imagesOf } from './read-mesh.mjs';
import { decodePNG } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 먼 몸을 얼마로 줄일 것인가 — 잰 값은 lib/crowdBudget.mjs 의 instancedLod 에 있다. */
export const FAR_RATIO = 0.25;

/**
 * 몸 GLB 바이트 → 먼 몸 GLB 바이트 + 무엇을 얼마로 줄였는지.
 *
 * @returns { glb, facts }
 */
export function bakeFarBody(bodyBytes, ratio = FAR_RATIO) {
  const doc = parseGLB(bodyBytes);
  const full = skinnedMeshOf(doc, { imageOf: imagesOf(doc, decodePNG) });
  const small = simplifyMesh(full, { ratio });
  return {
    glb: encodeGLB(farBody(doc, small)),
    facts: {
      file: 'body-far.glb',
      ratio,
      vertices: small.stats.verticesAfter,
      triangles: small.stats.trianglesAfter,
      from: { vertices: small.stats.verticesBefore, triangles: small.stats.trianglesBefore },
    },
  };
}

/** 팩 하나에 구워 넣고 sources.json 에 적는다 — 굽기는 build-pack 이 다시 돈다. */
export function bakeInto(packId, ratio = FAR_RATIO) {
  const dir = path.join(ROOT, 'packs', packId);
  const bodyFile = path.join(dir, 'body.glb');
  if (!fs.existsSync(bodyFile)) return { skipped: '몸(body.glb)이 없는 팩이다' };
  const before = fs.statSync(bodyFile).size;
  const { glb, facts } = bakeFarBody(fs.readFileSync(bodyFile), ratio);
  fs.writeFileSync(path.join(dir, facts.file), glb);

  const sp = path.join(dir, 'sources.json');
  const sources = JSON.parse(fs.readFileSync(sp, 'utf8'));
  sources.bodyFar = facts;
  fs.writeFileSync(sp, JSON.stringify(sources, null, 2) + '\n');
  return { before, after: glb.byteLength, facts };
}

// 윈도우에서는 file://C:/… 와 file:///C:/… 가 달라서 문자열로 견주면 안 된다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [arg, ratioArg] = process.argv.slice(2);
  const ratio = ratioArg ? Number(ratioArg) : FAR_RATIO;
  const packs = arg === '--all'
    ? fs.readdirSync(path.join(ROOT, 'packs')).filter((d) => fs.existsSync(path.join(ROOT, 'packs', d, 'sources.json')))
    : [arg];
  if (!arg) { console.error('쓰임: node scripts/build-far.mjs <packId> [비율] · --all'); process.exit(2); }
  for (const p of packs) {
    const r = bakeInto(p, ratio);
    if (r.skipped) { console.log(`${p}: ${r.skipped}`); continue; }
    console.log(`${p}: 정점 ${r.facts.from.vertices}→${r.facts.vertices} · 삼각형 ${r.facts.from.triangles}→${r.facts.triangles}`
      + ` · ${Math.round(r.before / 1024)}KB → ${Math.round(r.after / 1024)}KB (${(r.after / r.before * 100).toFixed(1)}%)`);
    const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-pack.mjs'), p], { encoding: 'utf8' });
    if (b.status !== 0) { console.error(b.stdout, b.stderr); process.exit(b.status ?? 1); }
  }
}
