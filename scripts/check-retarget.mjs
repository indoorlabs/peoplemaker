// check:retarget — 옮긴 동작이 원본과 **같은 방향을 가리키는가**.
//
// 옮기기가 틀리면 화면에서는 "팔이 좀 이상하다" 로만 보인다. 그래서 수로 묻는다:
//
//   · 같은 몸으로 옮기면 모든 뼈가 제자리여야 한다 (틀이 멀쩡한가)
//   · 이름·국소 축·비율·쉬는 자세·앞이 전부 다른 몸으로 옮겨도, 짝지은 뼈가
//     가리키는 방향은 원본(앞 보정 후)과 같아야 한다
//   · 몸 전체의 이동은 엉덩이 높이 비만큼 줄거나 늘어야 한다
//   · 갔다가 돌아오면 원래대로여야 한다
//
// 두 번째 몸은 여기서 만든다 (Rocketbox 팩은 저장소에 없다). 일부러 까다롭게:
// 뼈마다 국소 축이 제멋대로이고(국소 회전을 베끼면 바로 틀린다), 싣는 노드
// (Bip01)와 엉덩이가 따로이고, 다리를 벌리고 팔을 내린 A 자세이고, -Z 를 본다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGate, fullPacks, HOW_TO_GET_PACKS } from './gate-lib.mjs';
import { buildGLB, FIXTURES } from '../src/lib/fixtureRig.mjs';
import { parseGLB, sampleAnimation, animationDurationS, parentMap, nodeWorldMatrix } from '../src/lib/gltf.mjs';
import {
  retargetClip, withAnimation, describeBody, facingRad, detectSkeleton,
} from '../src/lib/retarget.mjs';
import { encodeGLB } from '../src/lib/gltfWrite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── 두 번째 몸: 합성 Biped ──
const qn = (q) => { const l = Math.hypot(...q); return q.map((v) => v / l); };
const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
const qmul = (a, b) => [
  a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
  a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
  a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qrot = (q, v) => {
  const u = [q[0], q[1], q[2]];
  const c = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const t = c(u, v).map((x) => x * 2);
  const ut = c(u, t);
  return [v[0] + q[3] * t[0] + ut[0], v[1] + q[3] * t[1] + ut[1], v[2] + q[3] * t[2] + ut[2]];
};

/** [이름, 부모, 쉬는 세계 위치] — 왼쪽이 -X (= -Z 를 본다), 다리를 벌리고 팔을 내렸다. */
const BIPED = [
  // 싣는 노드는 **바닥에** — 엉덩이와 떨어져 있어야 그 사이 거리를 셈하는지가
  // 드러난다. 같은 자리에 두던 때에는 그 셈을 빼도 통과했다.
  ['Bip01', null, [0, 0, 0]],
  ['Bip01 Pelvis', 'Bip01', [0, 1.1, 0]],
  ['Bip01 Spine', 'Bip01 Pelvis', [0, 1.22, 0]],
  ['Bip01 Spine1', 'Bip01 Spine', [0, 1.36, 0]],
  ['Bip01 Spine2', 'Bip01 Spine1', [0, 1.48, 0]],
  ['Bip01 Neck', 'Bip01 Spine2', [0, 1.6, 0]],
  ['Bip01 Head', 'Bip01 Neck', [0, 1.7, 0]],
  ['Bip01 L Clavicle', 'Bip01 Neck', [-0.04, 1.56, 0]],
  ['Bip01 L UpperArm', 'Bip01 L Clavicle', [-0.19, 1.55, 0]],
  ['Bip01 L Forearm', 'Bip01 L UpperArm', [-0.4, 1.34, 0]],
  ['Bip01 L Hand', 'Bip01 L Forearm', [-0.58, 1.15, 0]],
  ['Bip01 R Clavicle', 'Bip01 Neck', [0.04, 1.56, 0]],
  ['Bip01 R UpperArm', 'Bip01 R Clavicle', [0.19, 1.55, 0]],
  ['Bip01 R Forearm', 'Bip01 R UpperArm', [0.4, 1.34, 0]],
  ['Bip01 R Hand', 'Bip01 R Forearm', [0.58, 1.15, 0]],
  ['Bip01 L Thigh', 'Bip01 Pelvis', [-0.1, 1.1, 0]],
  ['Bip01 L Calf', 'Bip01 L Thigh', [-0.16, 0.6, 0.02]],
  ['Bip01 L Foot', 'Bip01 L Calf', [-0.2, 0.1, 0]],
  ['Bip01 L Toe0', 'Bip01 L Foot', [-0.2, 0.02, -0.13]],
  ['Bip01 R Thigh', 'Bip01 Pelvis', [0.1, 1.1, 0]],
  ['Bip01 R Calf', 'Bip01 R Thigh', [0.16, 0.6, 0.02]],
  ['Bip01 R Foot', 'Bip01 R Calf', [0.2, 0.1, 0]],
  ['Bip01 R Toe0', 'Bip01 R Foot', [0.2, 0.02, -0.13]],
];
function syntheticBiped() {
  const nodes = [{ name: 'RootNode', children: [] }];
  const world = new Map([['RootNode', { r: [0, 0, 0, 1], p: [0, 0, 0] }]]);
  BIPED.forEach(([name, parent], i) => {
    // 뼈마다 다른 국소 축 — 결정적으로 흩는다.
    const a = (i * 2.399) % (2 * Math.PI);
    const r = qn([Math.sin(a) * 0.6, Math.cos(a * 1.3) * 0.5, Math.sin(a * 0.7) * 0.4, 0.8]);
    world.set(name, { r, p: BIPED[i][2] });
    const pw = world.get(parent || 'RootNode');
    const local = {
      name,
      rotation: qmul(qconj(pw.r), r),
      translation: qrot(qconj(pw.r), [BIPED[i][2][0] - pw.p[0], BIPED[i][2][1] - pw.p[1], BIPED[i][2][2] - pw.p[2]]),
      children: [],
    };
    nodes.push(local);
  });
  const idx = new Map(nodes.map((n, i) => [n.name, i]));
  for (const [name, parent] of BIPED) nodes[idx.get(parent || 'RootNode')].children.push(idx.get(name));
  return {
    json: {
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes,
      skins: [{ joints: BIPED.map(([n]) => idx.get(n)) }],
    },
    bin: new Uint8Array(0),
  };
}

// ── 재는 도구 ──
const docOf = (u8) => parseGLB(u8);
const fixtureDoc = (id) => docOf(buildGLB(FIXTURES.find((f) => f.id === id)));
/** 결과를 얹은 문서의 시각 t 세계 행렬 */
function worldAt(doc, t) {
  const par = parentMap(doc);
  const sampled = sampleAnimation(doc, 0, t);
  return (i) => nodeWorldMatrix(doc, i, sampled, par);
}
const pos = (m) => [m[12], m[13], m[14]];
const dir = (a, b) => {
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const angleDeg = (a, b) => (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
const yawVec = (rad, v) => [v[0] * Math.cos(rad) + v[2] * Math.sin(rad), v[1], -v[0] * Math.sin(rad) + v[2] * Math.cos(rad)];

/** 짝지은 공통 뼈 중 겨눔이 양쪽에 다 있는 것 — [대상뼈, 대상겨눔, 원본뼈, 원본겨눔] */
function aimPairs(S, T) {
  const NEXT = {
    hips: 'spine', spine: 'spine1', spine1: 'spine2', spine2: 'neck', neck: 'head',
    lUpperArm: 'lForearm', lForearm: 'lHand', rUpperArm: 'rForearm', rForearm: 'rHand',
    lUpLeg: 'lLeg', lLeg: 'lFoot', lFoot: 'lToe', rUpLeg: 'rLeg', rLeg: 'rFoot', rFoot: 'rToe',
  };
  const out = [];
  for (const [key] of T.canon) {
    if (!S.canon.has(key)) continue;
    let k = NEXT[key];
    while (k && !(T.canon.has(k) && S.canon.has(k))) k = NEXT[k];
    if (k) out.push([key, T.canon.get(key), T.canon.get(k), S.canon.get(key), S.canon.get(k)]);
  }
  return out;
}

runGate('check-retarget', async (g) => {
  let n = 0;

  // 저장소에는 팩의 **먼 층만** 들어 있다 — 새로 받은 쪽에는 이 게이트가 볼
  // 것이 없다. 터지지 말고 **건너뛰되 수로 말한다** (gate-lib 의 skip).
  if (!fullPacks().length) {
    g.skip(`진짜 몸으로 옮겨 보는 게이트라 몸이 있어야 한다 — ${HOW_TO_GET_PACKS}`);
    return n;
  }

  // ── 1. 규약 알아보기 ──
  n++;
  if (detectSkeleton(['Bip01', 'Bip01 Pelvis']) !== 'biped') g.fail('detect/biped', 'Bip01 을 Biped 로 못 알아본다');
  n++;
  if (detectSkeleton(['mixamorig:Hips', 'mixamorig:LeftUpLeg']) !== 'mixamo') g.fail('detect/mixamo', 'mixamorig: 를 Mixamo 로 못 알아본다');
  n++;
  if (detectSkeleton(['Hips', 'LeftUpLeg']) !== 'mixamo') g.fail('detect/mixamo-bare', '접두어 없는 Mixamo 이름을 못 알아본다');

  const walk = fixtureDoc('walk-forward');
  const biped = syntheticBiped();
  const dur = animationDurationS(walk, 0);
  const probe = [0, 0.13, 0.37, 0.61, 0.89].map((f) => f * dur);

  // ── 2. 같은 몸으로 — 모든 뼈가 제자리 ──
  {
    const res = retargetClip(walk, walk);
    const out = withAnimation(walk, res);
    let worst = 0;
    for (const t of probe) {
      const a = worldAt(walk, t);
      const b = worldAt(out, t);
      for (const j of walk.json.skins[0].joints) {
        const d = Math.hypot(...pos(a(j)).map((v, k) => v - pos(b(j))[k]));
        worst = Math.max(worst, d);
      }
    }
    n++;
    if (worst > 1e-4) g.fail('self/positions', `같은 몸으로 옮겼는데 뼈가 ${(worst * 1000).toFixed(2)}mm 까지 어긋난다`);
  }

  // ── 3. 전혀 다른 몸으로 — 방향이 같은가 ──
  const S = describeBody(walk);
  const T = describeBody(biped);
  const yaw = facingRad(T) - facingRad(S);
  const res = retargetClip(walk, biped);
  const out = withAnimation(biped, res);
  {
    n++;
    if (Math.abs(Math.abs(yaw) - Math.PI) > 0.01) g.setupFail(`합성 Biped 가 원본의 반대를 봐야 하는데 ${(yaw * 180 / Math.PI).toFixed(1)}° 다`);
    const pairs = aimPairs(S, T);
    n++;
    if (pairs.length < 6) g.setupFail(`겨눔이 양쪽에 있는 뼈가 ${pairs.length}개뿐이다`);
    let worst = 0;
    let where = '';
    for (const t of probe) {
      const a = worldAt(walk, t);
      const b = worldAt(out, t);
      for (const [key, tb, ta, sb, sa] of pairs) {
        const want = yawVec(yaw, dir(pos(a(sb)), pos(a(sa))));
        const got = dir(pos(b(tb)), pos(b(ta)));
        const e = angleDeg(want, got);
        if (e > worst) { worst = e; where = `${key} @${t.toFixed(2)}s`; }
      }
    }
    n++;
    if (worst > 1) g.fail('cross/directions', `뼈 방향이 원본과 ${worst.toFixed(1)}° 까지 다르다 (${where}) — 쉬는 자세·앞·국소 축 중 하나를 못 맞췄다`);
    console.log(`  [옮김] mixamo(뼈 11) → 합성 biped(뼈 ${BIPED.length}) · 짝 ${res.report.pairs} · 앞 ${res.report.facingDeg}° · 엉덩이 비 ${res.report.hipScale} · 방향 오차 최대 ${worst.toFixed(3)}°`);

    // 몸 전체의 이동
    n++;
    const a0 = worldAt(walk, 0); const a1 = worldAt(walk, dur);
    const b0 = worldAt(out, 0); const b1 = worldAt(out, dur);
    const hs = S.canon.get('hips'); const ht = T.canon.get('hips');
    const ds = pos(a1(hs)).map((v, k) => v - pos(a0(hs))[k]);
    const dt = pos(b1(ht)).map((v, k) => v - pos(b0(ht))[k]);
    // **쓰는 값은 뼈 길이 비다** (report.scale). 엉덩이 높이 비로 재던 때,
    // 쉬는 자세가 앉아 있는 파일에서 1.51배가 나와 사람이 떠올랐다.
    const k = res.report.scale;
    const want = yawVec(yaw, ds).map((v) => v * k);
    const err = Math.hypot(...want.map((v, i) => v - dt[i]));
    if (!(Math.hypot(...ds) > 0.5)) g.setupFail('원본 걷기가 거의 안 움직인다 — 이동을 볼 수 없다');
    if (err > 0.002) g.fail('cross/travel', `엉덩이가 ${Math.hypot(...dt).toFixed(3)}m 갔다 — 원본 ${Math.hypot(...ds).toFixed(3)}m × 비 ${k} = ${Math.hypot(...want).toFixed(3)}m 여야 (오차 ${(err * 1000).toFixed(1)}mm)`);
    n++;
    if (Math.abs(res.report.hipScale - 1.1 / 0.95) > 0.01) {
      g.fail('cross/hip-scale', `엉덩이 높이 비가 ${res.report.hipScale} 다 (${(1.1 / 0.95).toFixed(4)} 여야)`);
    }
    n++;
    // 선 자세인 두 리그에서는 **뼈 길이 비와 엉덩이 높이 비가 엇비슷해야**
    // 한다. 아주 다르면 둘 중 하나를 잘못 재고 있는 것이다. (앉은 자세인
    // 파일에서는 갈라지는 것이 맞고, 그때 쓰는 것이 뼈 길이 쪽이다.)
    if (!(k > 0) || Math.abs(k - res.report.hipScale) > 0.1) {
      g.fail('cross/scale-agree', `뼈 길이 비 ${k} 와 엉덩이 높이 비 ${res.report.hipScale} 가 너무 다르다`);
    }

    // 엉덩이 **자리** — 이동량만 보면 늘 같은 만큼 어긋난 것은 안 보인다.
    n++;
    {
      let worstP = 0;
      for (const t of probe) {
        const a = worldAt(walk, t); const b = worldAt(out, t);
        // 가로는 쉬는 자세에서의 변위로, **세로는 바닥에서** — 그래야 쉬는
        // 자세가 곧 그 동작인 클립(앉기)도 제자리에 앉는다.
        const d = pos(a(hs)).map((v, i) => v - pos(S.restWorld[hs])[i]);
        const yv = yawVec(yaw, d);
        const w = [
          pos(T.restWorld[ht])[0] + yv[0] * k,
          pos(a(hs))[1] * k,
          pos(T.restWorld[ht])[2] + yv[2] * k,
        ];
        worstP = Math.max(worstP, Math.hypot(...w.map((v, i) => v - pos(b(ht))[i])));
      }
      if (worstP > 0.002) g.fail('cross/hips-place', `엉덩이 자리가 ${(worstP * 1000).toFixed(1)}mm 어긋난다 — 싣는 노드에서 엉덩이까지의 거리를 안 셌다`);
    }

    // ── 쉬는 자세가 **이미 앉아 있는** 원본 ──
    //
    // Rocketbox 의 의자 동작이 그렇다: 파일의 쉬는 자세부터 앉아 있어서
    // 엉덩이가 제자리의 66% 에 있다. 그 높이를 크기로 읽으면 1.51배가 되고,
    // 그 비로 옮기면 앉은 사람이 **선 키로 떠오른다** (재 보니 엉덩이 92cm ·
    // 발끝 32cm). 세로를 바닥에서 재고 크기를 뼈 길이로 재면 제자리에 앉는다.
    {
      const seated = parseGLB(buildGLB(FIXTURES.find((f) => f.kind === 'sit')));
      const hipsIdx = seated.json.nodes.findIndex((x) => /Hips$/.test(x.name || ''));
      const dur2 = animationDurationS(seated, 0);
      const endPos = pos(worldAt(seated, dur2)(hipsIdx));
      // 쉬는 자세를 **앉은 자세로** 바꿔 놓는다 — 원본 파일이 그런 모양이다.
      seated.json.nodes[hipsIdx].translation = [endPos[0], endPos[1], endPos[2]];

      const r2 = retargetClip(seated, syntheticBiped(), { targetSkeleton: 'biped' });
      const out2 = parseGLB(encodeGLB(withAnimation(syntheticBiped(), r2, 'sit')));
      const T2 = describeBody(out2);
      const ht2 = T2.canon.get('hips');
      const gotY = pos(worldAt(out2, dur2)(ht2))[1];
      const wantY = endPos[1] * r2.report.scale;
      n++;
      if (Math.abs(gotY - wantY) > 0.02) {
        g.fail('seated/place',
          `쉬는 자세가 앉아 있는 원본을 옮겼더니 엉덩이가 ${(gotY * 100).toFixed(0)}cm 다 — `
          + `${(endPos[1] * 100).toFixed(0)}cm × ${r2.report.scale} = ${(wantY * 100).toFixed(0)}cm 여야 한다`);
      }
      n++;
      // 대상의 **선 엉덩이 높이**로 돌아가 있으면 그것이 바로 그 버그다.
      const standY = pos(T2.restWorld[ht2])[1];
      if (Math.abs(gotY - standY) < 0.05) {
        g.fail('seated/floating', `앉은 동작인데 엉덩이가 선 자세(${(standY * 100).toFixed(0)}cm)에 있다 — 사람이 공중에 앉는다`);
      }
      // 엉덩이 비(2.75)와 크기 비(1.20)가 한참 다른 원본이라는 것을 같이
      // 적는다 — 둘이 같아지면 이 검사는 뜻을 잃는다. 무엇을 잡는 검사인지가
      // 이 수에 있다.
      console.log(`  [옮김] 쉬는 자세가 앉아 있는 원본: 엉덩이 비 ${r2.report.hipScale} · 크기 비 ${r2.report.scale} → ${(gotY * 100).toFixed(0)}cm 에 앉았다 (선 자세는 ${(standY * 100).toFixed(0)}cm)`);
    }

    // 이동은 싣는 노드(Bip01)에 실려야 한다 — build-pack 이 루트 모션을 거기서 잰다.
    n++;
    const carrier = T.names.indexOf('Bip01');
    const tr = res.channels.find((c) => c.path === 'translation');
    if (!tr || tr.node !== carrier) g.fail('cross/carrier', `이동이 ${tr ? T.names[tr.node] : '어디에도 안'} 실렸다 — Bip01 이어야 루트 모션으로 잰다`);

    // 부호 이어짐
    n++;
    let flips = 0;
    for (const c of res.channels.filter((x) => x.path === 'rotation')) {
      for (let f = 1; f < res.times.length; f++) {
        let d = 0;
        for (let q = 0; q < 4; q++) d += c.values[(f - 1) * 4 + q] * c.values[f * 4 + q];
        if (d < 0) flips++;
      }
    }
    if (flips) g.fail('cross/sign', `회전 사원수 부호가 ${flips}번 뒤집힌다 — 사이를 섞으면 뼈가 한 바퀴 돈다`);
  }

  // ── 3-2. 반 바퀴 넘게 도는 뼈 ──
  //
  // 사원수는 180° 를 넘는 순간 부호가 뒤집힌 꼴로 읽힌다. 걷기로는 그런 순간이
  // 안 나와서 부호 이어짐을 빼도 통과했다 — 한 바퀴 도는 골반을 따로 만든다.
  {
    const nF = 31;
    const times = new Float32Array(nF).map((_, i) => i / 30);
    const pel = T.names.indexOf('Bip01 Pelvis');
    const baseR = biped.json.nodes[pel].rotation;
    const spin = new Float32Array(nF * 4);
    for (let i = 0; i < nF; i++) {
      const th = (i / (nF - 1)) * 2 * Math.PI;
      spin.set(qmul([0, Math.sin(th / 2), 0, Math.cos(th / 2)], baseR), i * 4);
    }
    const spun = withAnimation(biped, { times, channels: [{ node: pel, path: 'rotation', values: spin }] });
    const res2 = retargetClip(spun, walk);
    const hipsCh = res2.channels.find((c) => c.path === 'rotation' && c.node === S.canon.get('hips'));
    n++;
    const mid = hipsCh ? Math.abs(hipsCh.values[0] * hipsCh.values[15 * 4] + hipsCh.values[1] * hipsCh.values[15 * 4 + 1]
      + hipsCh.values[2] * hipsCh.values[15 * 4 + 2] + hipsCh.values[3] * hipsCh.values[15 * 4 + 3]) : 1;
    if (!hipsCh || mid > 0.1) g.setupFail('도는 골반이 옮긴 쪽에서 안 돈다 — 부호 검사를 할 수 없다');
    let flips = 0;
    for (const c of res2.channels.filter((x) => x.path === 'rotation')) {
      for (let f = 1; f < nF; f++) {
        let d = 0;
        for (let q = 0; q < 4; q++) d += c.values[(f - 1) * 4 + q] * c.values[f * 4 + q];
        if (d < 0) flips++;
      }
    }
    n++;
    if (flips) g.fail('spin/sign', `한 바퀴 도는 골반을 옮겼더니 사원수 부호가 ${flips}번 뒤집힌다 — 사이를 섞으면 거꾸로 돈다`);
  }

  // ── 4. 갔다가 돌아오기 ──
  {
    const back = withAnimation(walk, retargetClip(out, walk));
    const pairs = aimPairs(S, S);
    let worst = 0;
    let worstPos = 0;
    for (const t of probe) {
      const a = worldAt(walk, t);
      const b = worldAt(back, t);
      for (const [, tb, ta] of pairs) worst = Math.max(worst, angleDeg(dir(pos(a(tb)), pos(a(ta))), dir(pos(b(tb)), pos(b(ta)))));
      const h = S.canon.get('hips');
      worstPos = Math.max(worstPos, Math.hypot(...pos(a(h)).map((v, k) => v - pos(b(h))[k])));
    }
    n++;
    if (worst > 1) g.fail('roundtrip/directions', `mixamo → biped → mixamo 뒤 뼈 방향이 ${worst.toFixed(2)}° 다르다`);
    n++;
    if (worstPos > 0.002) g.fail('roundtrip/hips', `돌아온 엉덩이가 ${(worstPos * 1000).toFixed(1)}mm 어긋난다`);
  }

  // ── 5. GLB 로 썼다 읽어도 같은가 ──
  {
    const bytes = encodeGLB(withAnimation(walk, retargetClip(walk, walk)));
    let back = null;
    try { back = parseGLB(bytes); } catch (e) { g.fail('glb/parse', `쓴 GLB 를 못 읽는다 — ${e.message}`); }
    if (back) {
      n++;
      const a = worldAt(walk, probe[2]);
      const b = worldAt(back, probe[2]);
      const j = walk.json.skins[0].joints[7];
      const d = Math.hypot(...pos(a(j)).map((v, k) => v - pos(b(j))[k]));
      if (d > 1e-4) g.fail('glb/roundtrip', `GLB 로 쓰고 읽었더니 뼈가 ${(d * 1000).toFixed(2)}mm 옮겨졌다`);
      n++;
      if ((back.json.images || []).length !== (walk.json.images || []).length) g.fail('glb/images', '몸의 그림을 잃었다');
    }
  }

  // ── 6. 진짜 몸 (있을 때만) ──
  //
  // Rocketbox 팩은 저장소에 없다 (import-rocketbox 로 만든다). 있으면 남자 01 의
  // 걷기를 여자 01 에게 옮겨 방향을 본다 — 같은 규약·다른 비율의 실제 경우.
  {
    const m = path.join(ROOT, 'packs', 'rocketbox-m01', 'clips', 'walk-forward.glb');
    // **몸이 있어야 한다.** 나뉜 팩의 클립에는 스킨이 없어서, 몸 대신 클립을
    // 집으면 뼈 없는 문서로 옮기게 되고 방향이 68° 어긋난 것처럼 나온다.
    // 새로 받은 쪽에는 걷기 클립만 있고 몸이 없어서 실제로 그렇게 됐다.
    const fBody = path.join(ROOT, 'packs', 'rocketbox-f01', 'body.glb');
    const f = fs.existsSync(fBody) ? fBody : null;
    if (fs.existsSync(m) && f) {
      const src = docOf(new Uint8Array(fs.readFileSync(m)));
      const dst = docOf(new Uint8Array(fs.readFileSync(f)));
      const r = retargetClip(src, dst);
      const o = withAnimation(dst, r);
      const SS = describeBody(src); const TT = describeBody(dst);
      const d2 = animationDurationS(src, 0);
      // **원본의 뼈 이동은 옮기지 않는다.** Rocketbox 동작은 척추 관절 자리까지
      // 조금씩 움직인다 (골반→척추 12cm 중 1cm 남짓). 옮기기는 대상 몸의 뼈
      // 길이를 지키므로 그 몫은 버린다. 그래서 견줄 원본도 그 몫을 걷어 낸
      // 것이어야 한다 — 걷지 않고 견주면 골반만 6~8° 로 나오고, 그것은 옮기기의
      // 오차가 아니라 버린 몫의 크기다. 버린 몫은 따로 적는다.
      const carrierS = SS.carrier;
      const bare = JSON.parse(JSON.stringify(src.json));
      bare.animations[0].channels = bare.animations[0].channels
        .filter((c) => c.target.path !== 'translation' || c.target.node === carrierS);
      const srcRot = { json: bare, bin: src.bin };
      let worst = 0; let where = ''; let dropped = 0;
      for (const t of [0.1, 0.4, 0.7].map((x) => x * d2)) {
        const a = worldAt(srcRot, t); const b = worldAt(o, t); const full = worldAt(src, t);
        for (const [key, tb, ta, sb, sa] of aimPairs(SS, TT)) {
          const e = angleDeg(dir(pos(a(sb)), pos(a(sa))), dir(pos(b(tb)), pos(b(ta))));
          if (e > worst) { worst = e; where = key; }
          dropped = Math.max(dropped, angleDeg(dir(pos(a(sb)), pos(a(sa))), dir(pos(full(sb)), pos(full(sa)))));
        }
      }
      n++;
      if (worst > 1) g.fail('real/directions', `남자 → 여자 걷기에서 ${where} 방향이 ${worst.toFixed(1)}° 다르다`);
      console.log(`  [옮김] 실제: rocketbox-m01 걷기 → f01 · 짝 ${r.report.pairs} · 엉덩이 비 ${r.report.hipScale} · 방향 오차 최대 ${worst.toFixed(3)}° · 버린 뼈 이동 몫 최대 ${dropped.toFixed(1)}°`);
    } else {
      console.log(`  [옮김] 진짜 몸이 없어 6번은 건너뛴다 — ${HOW_TO_GET_PACKS}`);
    }
  }

  return n;
});
