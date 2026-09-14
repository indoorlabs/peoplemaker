// Unitree G1 팩을 굽는다 — URDF + STL → 몸 하나 + 함수 생성 클립.
//
//   node scripts/make-g1-pack.mjs <g1_description 폴더>
//
// 만드는 일은 src/lib/urdfRig.mjs 가 한다 (순수 층). 여기서는 파일을 읽어
// 넘기고, 결과를 packs/unitree-g1/ 에 쓰고, 사람이 적는 것(이름·라이선스·출처)
// 을 sources.json 으로 남긴다. 그 다음 먼 층을 굽고 build-pack 이 잰다.
//
// ## 살을 줄인다
//
// URDF 의 시각 메시 35개는 CAD 에서 나온 것이라 **39만 삼각형**이다 — Rocketbox
// 사람(8천)의 50배. 그대로 넣으면 로봇 하나가 사람 쉰 명 값이다. 링크마다
// 같은 비율로 줄여 전체를 사람 하나 값 언저리(TARGET_TRIS)에 둔다. 얼마에서
// 얼마로 줄였는지는 sources.json 의 note 에 남는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  parseURDF, parseSTL, robotRig, withSoles, transformPart, bboxOf, buildRobotGLB,
  ROBOT_CLIPS, G1, standingRootY, legLengthM,
} from '../src/lib/urdfRig.mjs';
import { parseGLB } from '../src/lib/gltf.mjs';
import { bodyOnly, motionOnly, extractAnimation, encodeGLB } from '../src/lib/gltfWrite.mjs';
import { simplifyMesh } from '../src/lib/meshLod.mjs';
import { bakeInto } from './build-far.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = 'unitree-g1';
const URDF_FILE = 'g1_29dof_rev_1_0.urdf';
/** 전체 삼각형 목표 — Rocketbox 여자 01 의 몸(8,064)과 같은 자리수. */
const TARGET_TRIS = 12000;

const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, URDF_FILE))) {
  console.error(`쓰임: node scripts/make-g1-pack.mjs <g1_description 폴더>  (${URDF_FILE} 가 있어야 한다)`);
  process.exit(2);
}
const out = path.join(ROOT, 'packs', PACK);
fs.mkdirSync(path.join(out, 'clips'), { recursive: true });

// ── 1. URDF → 리그 ──
const urdfText = fs.readFileSync(path.join(src, URDF_FILE), 'utf8');
const urdf = parseURDF(urdfText);
const rig = robotRig(urdf, { root: G1.root });
const linkOf = new Map(urdf.links.map((l) => [l.name, l]));
const meshOf = (file) => parseSTL(fs.readFileSync(path.join(src, file.replace(/^package:\/\/g1_description\//, ''))));

// 발바닥 — 발목 살의 가장 낮은 점 (링크 좌표계, glTF 축).
const soleOf = (ankle) => {
  const v = linkOf.get(ankle).visuals[0];
  const { lo, hi } = bboxOf(transformPart(meshOf(v.file), v).position);
  return [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2];
};
withSoles(rig, [[G1.ankleRoll.L, G1.sole.L], [G1.ankleRoll.R, G1.sole.R]], soleOf);

// ── 2. 살 — 링크마다 읽어 줄인다 ──
const raws = [];
let trisBefore = 0;
for (const [i, n] of rig.nodes.entries()) {
  for (const v of linkOf.get(n.name)?.visuals || []) {
    const part = transformPart(meshOf(v.file), v);
    raws.push({ node: i, name: n.name, part });
    trisBefore += part.index.length / 3;
  }
}
const ratio = TARGET_TRIS / trisBefore;
/** 이은 꼭짓점의 법선 — 줄인 뒤에는 면마다 따로 있던 법선이 없다. */
const vertexNormals = (position, index) => {
  const nrm = new Float32Array(position.length);
  for (let f = 0; f < index.length; f += 3) {
    const a = index[f] * 3, b = index[f + 1] * 3, c = index[f + 2] * 3;
    const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { nrm[k] += nx; nrm[k + 1] += ny; nrm[k + 2] += nz; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
  return nrm;
};
const parts = [];
let trisAfter = 0;
for (const { node, name, part } of raws) {
  const tris = part.index.length / 3;
  const small = simplifyMesh(part, { targetTriangles: Math.max(60, Math.round(tris * ratio)) });
  const index = Uint32Array.from(small.index);
  const position = Float32Array.from(small.position);
  parts.push({ node, position, normal: vertexNormals(position, index), index });
  trisAfter += index.length / 3;
  console.log(`  ${name.padEnd(28)} ${String(tris).padStart(6)} → ${String(index.length / 3).padStart(5)} 삼각형`);
}
console.log(`  살 ${raws.length}조각 · ${trisBefore} → ${trisAfter} 삼각형 (×${ratio.toFixed(3)})`);
console.log(`  선 자세: 골반 높이 ${standingRootY(rig).toFixed(3)}m · 엉덩이→발바닥 ${legLengthM(rig).toFixed(3)}m`);

// ── 3. 몸 하나 + 클립들 ──
let bodyDoc = null;
for (const spec of ROBOT_CLIPS) {
  const glb = buildRobotGLB(rig, parts, spec);
  const doc = parseGLB(glb);
  if (!bodyDoc) {
    bodyDoc = doc;
    const bodyGlb = encodeGLB(bodyOnly(doc));
    fs.writeFileSync(path.join(out, 'body.glb'), bodyGlb);
    console.log(`  body.glb  ${(bodyGlb.byteLength / 1024).toFixed(1)}KB`);
  }
  const { doc: motion, missing } = motionOnly(bodyDoc, extractAnimation(doc));
  if (missing.length) throw new Error(`${spec.id}: 몸에 없는 뼈 ${missing.join(', ')}`);
  const clipGlb = encodeGLB(motion);
  fs.writeFileSync(path.join(out, 'clips', `${spec.id}.glb`), clipGlb);
  console.log(`  clips/${spec.id}.glb  ${(clipGlb.byteLength / 1024).toFixed(1)}KB${spec.speedMps ? `  (만든 속도 ${spec.speedMps} m/s)` : ''}`);
}

// 몸의 원문 — 게이트가 glTF 없이 이것으로 순운동학을 돌려 잰 값과 견준다.
fs.copyFileSync(path.join(src, URDF_FILE), path.join(out, URDF_FILE));

// ── 4. 사람이 적는 것 ──
const NAMES = {
  idle: { ko: '서 있기 (G1)', en: 'Idle (G1)' },
  'walk-forward': { ko: '앞으로 걷기 (G1)', en: 'Walk forward (G1)' },
  reach: { ko: '오른손 뻗기 (G1)', en: 'Reach with the right hand (G1)' },
  'walk-carry': { ko: '들고 걷기 (G1)', en: 'Walk carrying (G1)' },
};
// 들고 걷기는 **무엇을 드는지**를 사람이 적는다 (살을 봐서 알 수 없다). 집는 물체를
// 대표해 낱말표의 'cup' 으로 둔다 — FetchMan 이 집던 것도 그릇·양초 같은 손 안의
// 물건이다. 손이 어디 있는지는 build-pack 이 잰다 (grip).
const HOLDS = { 'walk-carry': { what: 'cup', hand: 'right' } };
const sources = {
  packId: PACK,
  version: '0.1.0',
  skeleton: 'urdf',
  note: `Unitree G1 — unitree_ros/robots/g1_description 의 ${URDF_FILE} (BSD-3-Clause, Copyright (c) 2016-2022 HangZhou YuShu TECHNOLOGY CO.,LTD.). 시각 STL ${raws.length}개를 ${trisBefore} → ${trisAfter} 삼각형으로 줄여 스킨 하나로 접붙였다. 동작은 모션 캡처가 아니라 관절 함수다 — 사람 클립을 로봇에 씌우지 않는다. 걷는 속도 1.35m/s 는 기준 팩에서 빌린 값이고, Unitree 의 값이 오면 lib/urdfRig.mjs 의 ROBOT_CLIPS 하나만 바꾼다.`,
  bodySource: {
    tool: 'unitreerobotics/unitree_ros',
    license: 'BSD-3-Clause',
    file: URDF_FILE,
    meshes: raws.length,
  },
  origins: [{
    tool: 'unitreerobotics/unitree_ros',
    license: 'BSD-3-Clause',
    ko: 'Unitree Robotics — G1 description',
    en: 'Unitree Robotics — G1 description',
    url: 'https://github.com/unitreerobotics/unitree_ros',
    noticeFile: 'licenses/unitree-robotics.LICENSE.md',
    noticeUrl: 'https://raw.githubusercontent.com/unitreerobotics/unitree_ros/master/LICENSE',
    checked: '2026-09-14',
  }],
  clips: ROBOT_CLIPS.map((c) => ({
    id: c.id,
    name: NAMES[c.id],
    license: 'CC0-1.0',
    source: { tool: 'peoplemaker/make-g1-pack', synthetic: true },
    tags: [c.kind],
    ...(HOLDS[c.id] ? { holds: HOLDS[c.id] } : {}),
  })),
};
fs.writeFileSync(path.join(out, 'sources.json'), `${JSON.stringify(sources, null, 2)}\n`);

// ── 5. 먼 층 → 재기 ──
const far = bakeInto(PACK);
if (far?.skipped) console.log(`  먼 층: ${far.skipped}`);
const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-pack.mjs'), PACK], { stdio: 'inherit' });
process.exit(b.status ?? 1);
