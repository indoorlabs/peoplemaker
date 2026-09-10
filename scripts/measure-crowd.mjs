// 사람 하나가 프레임마다 얼마나 드는가 — 재는 도구.
//
//   node scripts/measure-crowd.mjs [최대인원]
//
// **재는 것은 CPU 쪽이다.** 스킨 애니메이션의 비용은 둘로 갈린다:
//
//   CPU   뼈 행렬 갱신 (AnimationMixer + Skeleton.update) — 사람 수에 비례
//   GPU   드로우콜과 정점 스키닝 — 인스턴싱·LOD 로 줄인다
//
// 여기서는 CPU 만 잰다. GPU 는 브라우저에서 재야 하고, 그것은 spacemaker
// 안에서 잴 값이다 (P1 의 끝나는 조건이 거기 있는 이유다).
//
// Node 에서 재는 값이 브라우저와 같지는 않다. 다만 같은 V8 이고, 이 수의
// 쓰임은 "몇 명부터 CPU 가 벽이 되는가" 의 자릿수를 잡는 것이다.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClipPlayer } from '../src/web/clipPlayer.mjs';
import { buildGLB, FIXTURES } from './make-fixture-pack.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.join(ROOT, 'packs', 'ref-synthetic');

const THREE = await import('three');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const SkeletonUtils = await import('three/examples/jsm/utils/SkeletonUtils.js');

const catalog = JSON.parse(fs.readFileSync(path.join(PACK, 'catalog.json'), 'utf8'));
const loader = new GLTFLoader();

/**
 * 뼈 수를 정해 리그 하나를 메모리에서 만든다.
 *
 * 파일로 굽지 않는 이유: 뼈 수는 **재려고 흔드는 값**이지 팩의 내용이 아니다.
 * 팩에 65개짜리 클립을 넣어 두면 그것이 계약의 일부처럼 보인다.
 */
export async function rigOf(bones) {
  const glb = buildGLB({ ...FIXTURES.find((f) => f.id === 'walk-forward'), bones });
  const ab = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  const gltf = await new Promise((res, rej) => loader.parse(ab, '', res, rej));
  let n = 0;
  gltf.scene.traverse((o) => { if (o.isBone) n++; });
  gltf.userData.boneCount = n;
  return gltf;
}

/**
 * 사람 N 명을 세우고 한 프레임을 갱신하는 데 드는 시간.
 *
 * **스켈레톤 갱신까지 센다.** mixer.update 만 재면 뼈 행렬을 안 만든 값이라
 * 실제보다 훨씬 싸게 나온다 — 화면에 세우면 그 일이 반드시 일어난다.
 */
export function measureFrameMs(n, { frames = 120, gltf } = {}) {
  const one = { ...catalog, clips: [catalog.clips.find((c) => c.id === 'walk-forward')] };
  const player = createClipPlayer({ THREE, SkeletonUtils, catalog: one, gltfOf: () => gltf });
  const meshes = [];
  for (let i = 0; i < n; i++) {
    const p = player.spawn({ clipId: 'walk-forward', position: [i % 20, 0, Math.floor(i / 20)] });
    // 같은 위상으로 두면 안 된다 — 캐시가 유리하게 편든다.
    p.mixer.update(Math.random() * p.clip.durationS);
    p.root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  }
  const dt = 1 / 60;
  const step = () => {
    player.update(dt);
    for (const m of meshes) {
      m.updateMatrixWorld(true);
      m.skeleton.update();
    }
  };
  for (let i = 0; i < 20; i++) step();          // 데우기
  // **재기 전에 치운다.**
  //
  // 안 치우면 앞 회차가 남긴 쓰레기를 이번 회차의 프레임 시간으로 센다.
  // 실제로 그렇게 읽혔다 — 1인당 비용이 400명 1.6µs 에서 1,000명 5.2µs 로
  // 늘어, 마치 사람이 많을수록 한 사람이 비싸지는 것처럼 보였다. 사람이
  // 비싸진 것이 아니라 GC 를 함께 잰 것이다. (urbanspace 에서 힙을 잘못
  // 읽었던 것과 같은 부류다.)
  //
  //   node --expose-gc scripts/measure-crowd.mjs
  if (typeof global.gc === 'function') global.gc();
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) step();
  const ms = (performance.now() - t0) / frames;
  return { n, msPerFrame: ms, usPerPerson: (ms * 1000) / Math.max(1, n) };
}

// **직접 돌릴 때만 잰다.**
//
// 게이트가 이 파일에서 재는 함수를 가져다 쓴다. 가져오는 것만으로 격자
// 전체가 돌면, 게이트를 한 번 돌릴 때마다 쓸데없이 1분이 가고 출력이
// 뒤섞인다 — 픽스처 생성기에서 이미 밟은 함정이라 같은 방식으로 막는다.
const runDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirect) {

const bonesList = (process.argv[2] || '11,33,65').split(',').map(Number);
const peopleList = (process.argv[3] || '100,200,400,800').split(',').map(Number);
const gcNote = typeof global.gc === 'function' ? 'GC 강제함' : '**GC 를 못 치웠다 — node --expose-gc 로 다시 잴 것**';

console.log(`
${os.cpus()[0]?.model?.trim()} · node ${process.version} · ${gcNote}
`);
console.log('   뼈    인원   프레임(ms)  1인당(µs)  뼈 하나당(ns)');
const rows = [];
for (const bones of bonesList) {
  const gltf = await rigOf(bones);
  const bc = gltf.userData.boneCount;
  for (const n of peopleList) {
    const r = measureFrameMs(n, { gltf, frames: 150 });
    const perBoneNs = (r.msPerFrame * 1e6) / (n * bc);
    rows.push({ bones: bc, n, ...r, perBoneNs });
    console.log(`  ${String(bc).padStart(3)}  ${String(n).padStart(6)}  ${r.msPerFrame.toFixed(3).padStart(10)}  ${r.usPerPerson.toFixed(2).padStart(9)}  ${perBoneNs.toFixed(0).padStart(12)}`);
  }
}

// 뼈 하나당 비용이 인원에 따라 얼마나 커지는가 — 캐시를 벗어나는 자리가 있으면
// 이 수가 커진다. 선형이면 어디서 재도 같은 값이어야 한다.
const small = rows.filter((r) => r.n <= 200);
const big = rows.filter((r) => r.n >= 400);
const avg = (a) => (a.length ? a.reduce((s, r) => s + r.perBoneNs, 0) / a.length : null);
// 한쪽이 비면 견줄 것이 없다 — NaN 을 수인 척 찍지 않는다.
if (avg(small) != null && avg(big) != null) {
  console.log(`
  뼈 하나당: 200명 이하 ${avg(small).toFixed(0)}ns · 400명 이상 ${avg(big).toFixed(0)}ns (${(avg(big) / avg(small)).toFixed(1)}배)`);
} else {
  console.log(`
  뼈 하나당 ${(avg(small) ?? avg(big)).toFixed(0)}ns — 문턱을 보려면 400명 이상도 재야 한다`);
}
const budgetMs = 4;
const worst = rows[rows.length - 1];
console.log(`  CPU ${budgetMs}ms 예산 · 뼈 ${worst.bones}개 리그 기준 약 ${Math.floor((budgetMs * 1000) / worst.usPerPerson).toLocaleString()}명`);
console.log('  (Node 에서 잰 값이다. GPU 몫은 브라우저에서 — spacemaker 안에서 재야 한다)');

}
