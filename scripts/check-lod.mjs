// check:lod — 살을 줄여도 **사람 모양이고, 뼈를 따라가는가.**
//
// 줄이기는 조용히 망가지는 부류의 일이다. 정점 수는 줄었는데 살이 뒤집히거나,
// 손가락이 손목에 붙거나, 가중치가 섞여 팔이 몸통을 따라간다 — 화면에서는
// "멀리 있는 사람이 좀 이상한데" 로만 보이고, 멀리 있으니까 아무도 안 본다.
//
// 그래서 수로 묻는다:
//   1. 아는 모양(평면·구)에서 아는 답이 나오는가
//   2. 줄인 살의 점이 **원래 점 중 하나인가** — 지어내지 않는다는 규약
//   3. 위상이 성한가 (찌부러짐·고아 점·구멍)
//   4. 스킨이 성한가 (합이 1, 뼈 번호, 무게 있는 뼈가 사라지지 않았다)
//   5. 진짜 몸에서 벗어남이 기록한 수와 같은가 — **자세를 취한 채로도**
//   6. 잰 표가 값 노릇을 하는가 (줄인 먼 단계가 안 줄인 것보다 싸다)
//
// 로켓박스 팩은 저장소에 없다 (.gitignore). 없으면 5번을 건너뛰고 **건너뛴
// 것을 말한다** — 조용히 통과하지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import { weldMesh, simplifyMesh, surfaceDeviation } from '../src/lib/meshLod.mjs';
import { parseGLB, readAccessor } from '../src/lib/gltf.mjs';
import { bakeClip } from '../src/lib/poseBake.mjs';
import { attachAnimation } from '../src/lib/gltfWrite.mjs';
import { PACK_MEASURED, planCrowdMeasured, frameMsAt } from '../src/lib/crowdBudget.mjs';

// ── 아는 모양 ────────────────────────────────────────────────────

/** 평면 격자 — 줄여도 **평평해야** 한다 (벗어남 0). */
function gridMesh(n) {
  const pos = [], idx = [];
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) pos.push(x / n, 0, y / n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = y * (n + 1) + x;
      idx.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
    }
  }
  return withSkin(pos, idx);
}

/** 반지름 1 구 — 줄여도 남은 점은 여전히 반지름 1 이어야 한다. */
function sphereMesh(lat, lon) {
  const pos = [], idx = [];
  for (let i = 0; i <= lat; i++) {
    const th = (i * Math.PI) / lat;
    for (let j = 0; j <= lon; j++) {
      const ph = (j * 2 * Math.PI) / lon;
      pos.push(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j;
      const b = a + lon + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return withSkin(pos, idx);
}

/**
 * 뼈를 두 개 붙인다 — 높이로 갈라서, 가중치가 섞이면 티가 나게.
 *
 * 법선은 **삼각형에서 잰다.** 손으로 +Y 를 적어 넣었더니 감긴 쪽과 어긋나서,
 * 뒤집힘 검사가 멀쩡한 살을 통째로 뒤집혔다고 했다 — 견주는 두 값이 같은
 * 감김에서 나와야 그 검사가 뜻이 있다.
 */
function withSkin(pos, idx) {
  const n = pos.length / 3;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const nor = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const t = Math.min(1, Math.max(0, pos[v * 3 + 1]));
    si[v * 4] = 0; si[v * 4 + 1] = 1;
    sw[v * 4] = 1 - t; sw[v * 4 + 1] = t;
  }
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fn = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nor[v * 3 + k] += fn[k];
  }
  for (let v = 0; v < n; v++) {
    const len = Math.hypot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
    if (len > 1e-12) for (let k = 0; k < 3; k++) nor[v * 3 + k] /= len;
  }
  return { position: Float32Array.from(pos), normal: nor, skinIndex: si, skinWeight: sw, index: Uint32Array.from(idx) };
}

/** GLB 의 스킨 메시 조각들을 하나로 — web 의 geometryOf 와 같은 규칙 (알파 조각은 뺀다). */
function skinnedMeshOf(doc) {
  const j = doc.json;
  const parts = [];
  for (const mesh of j.meshes || []) {
    for (const p of mesh.primitives || []) {
      if (p.attributes.JOINTS_0 === undefined) continue;
      const mat = j.materials?.[p.material];
      const cutout = !!mat && (mat.alphaMode === 'BLEND' || mat.alphaMode === 'MASK');
      parts.push({ p, cutout });
    }
  }
  const use = parts.some((x) => !x.cutout) ? parts.filter((x) => !x.cutout) : parts;
  const pos = [], nor = [], si = [], sw = [], idx = [];
  let base = 0;
  for (const { p } of use) {
    const P = readAccessor(doc, p.attributes.POSITION);
    const N = p.attributes.NORMAL !== undefined ? readAccessor(doc, p.attributes.NORMAL) : null;
    const J = readAccessor(doc, p.attributes.JOINTS_0);
    const W = readAccessor(doc, p.attributes.WEIGHTS_0);
    const I = readAccessor(doc, p.indices);
    const count = P.length / 3;
    for (let i = 0; i < count * 3; i++) { pos.push(P[i]); nor.push(N ? N[i] : 0); }
    for (let i = 0; i < count * 4; i++) { si.push(J[i]); sw.push(W[i]); }
    for (let i = 0; i < I.length; i++) idx.push(I[i] + base);
    base += count;
  }
  return {
    position: Float32Array.from(pos), normal: Float32Array.from(nor),
    skinIndex: Uint16Array.from(si), skinWeight: Float32Array.from(sw),
    index: Uint32Array.from(idx),
  };
}

/** 구운 한 프레임의 뼈 행렬로 살에 자세를 입힌다 — 셰이더가 하는 셈과 같다. */
function skinPoints(mesh, baked, frame) {
  const out = new Float32Array(mesh.position.length);
  const at = frame * baked.bones * 16;
  for (let v = 0; v < mesh.position.length / 3; v++) {
    const x = mesh.position[v * 3], y = mesh.position[v * 3 + 1], z = mesh.position[v * 3 + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let c = 0; c < 4; c++) {
      const w = mesh.skinWeight[v * 4 + c];
      if (!(w > 0)) continue;
      const m = at + mesh.skinIndex[v * 4 + c] * 16;
      ox += w * (baked.data[m] * x + baked.data[m + 4] * y + baked.data[m + 8] * z + baked.data[m + 12]);
      oy += w * (baked.data[m + 1] * x + baked.data[m + 5] * y + baked.data[m + 9] * z + baked.data[m + 13]);
      oz += w * (baked.data[m + 2] * x + baked.data[m + 6] * y + baked.data[m + 10] * z + baked.data[m + 14]);
    }
    out[v * 3] = ox; out[v * 3 + 1] = oy; out[v * 3 + 2] = oz;
  }
  return out;
}

const boxOf = (P) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) {
    for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], P[i + c]); hi[c] = Math.max(hi[c], P[i + c]); }
  }
  return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
};

/**
 * 모서리로 본 위상.
 *
 * `open` 삼각형 하나만 붙은 모서리 — 늘었으면 살에 구멍이 생긴 것이다.
 * `nonManifold` 셋 넘게 붙은 모서리 — 살이 제 안으로 접힌 자리다. 접기가
 * 연결 조건을 안 보면 여기가 늘어난다.
 */
function edgeStats(mesh) {
  const count = new Map();
  const k = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  for (let f = 0; f < mesh.index.length; f += 3) {
    const a = mesh.index[f], b = mesh.index[f + 1], c = mesh.index[f + 2];
    for (const e of [[a, b], [b, c], [c, a]]) count.set(k(e[0], e[1]), (count.get(k(e[0], e[1])) || 0) + 1);
  }
  let open = 0, nonManifold = 0;
  for (const v of count.values()) {
    if (v === 1) open++;
    else if (v > 2) nonManifold++;
  }
  return { open, nonManifold };
}

/**
 * 뒤집힌 삼각형 수.
 *
 * 줄인 삼각형의 법선을 **원래 살의 법선**과 견준다 (줄인 쪽의 법선은 줄인
 * 삼각형에서 다시 잰 것이라, 제 것과 견주면 뒤집혀도 앞뒤가 맞아떨어진다).
 * 자리로 이어 붙인다 — 남은 점은 원래 점 그대로이기 때문이다.
 */
function flippedFaces(out, welded) {
  const key = (P, i) => `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`;
  const normalAt = new Map();
  for (let v = 0; v < welded.position.length / 3; v++) {
    normalAt.set(key(welded.position, v), [welded.normal[v * 3], welded.normal[v * 3 + 1], welded.normal[v * 3 + 2]]);
  }
  let flipped = 0, unmatched = 0;
  for (let f = 0; f < out.index.length; f += 3) {
    const ns = [];
    for (let c = 0; c < 3; c++) {
      const got = normalAt.get(key(out.position, out.index[f + c]));
      if (got) ns.push(got);
    }
    if (ns.length < 3) { unmatched++; continue; }
    const a = out.index[f], b = out.index[f + 1], c2 = out.index[f + 2];
    const P = out.position;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c2 * 3] - P[a * 3], vy = P[c2 * 3 + 1] - P[a * 3 + 1], vz = P[c2 * 3 + 2] - P[a * 3 + 2];
    const fn = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const avg = [0, 1, 2].map((i) => (ns[0][i] + ns[1][i] + ns[2][i]) / 3);
    if (fn[0] * avg[0] + fn[1] * avg[1] + fn[2] * avg[2] <= 0) flipped++;
  }
  return { flipped, unmatched };
}

runGate('check-lod', (g) => {
  let n = 0;

  // ── 1. 아는 모양에서 아는 답 ──
  {
    const grid = gridMesh(12);          // 288 삼각형, 평면
    const small = simplifyMesh(grid, { ratio: 0.2 });
    n++;
    if (!(small.stats.trianglesAfter <= 288 * 0.25)) {
      g.fail('grid/reduce', `평면을 20% 로 줄이라 했는데 삼각형이 ${small.stats.trianglesAfter}개 남았다`);
    }
    n++;
    // 평면을 줄이면 오차가 0 이어야 한다 — 모든 점이 같은 평면 위에 있으므로.
    const dev = surfaceDeviation(small, grid.position);
    if (!(dev.maxM < 1e-6)) g.fail('grid/flat', `평면을 줄였는데 ${(dev.maxM * 1000).toFixed(3)}mm 벗어난다`);
    n++;
    // 테두리는 지켜야 한다 — 네 귀퉁이가 잘리면 판이 작아진다.
    const a = boxOf(grid.position), b = boxOf(small.position);
    for (let c = 0; c < 3; c++) {
      if (Math.abs(a.size[c] - b.size[c]) > 1e-6) {
        g.fail('grid/extent', `줄인 뒤 크기가 ${a.size[c].toFixed(4)} → ${b.size[c].toFixed(4)} 로 달라졌다`);
      }
    }

    const sphere = sphereMesh(16, 24);
    const half = simplifyMesh(sphere, { ratio: 0.25 });
    const sdev = surfaceDeviation(half, sphere.position);
    n++;
    if (!(half.stats.trianglesAfter <= sphere.index.length / 3 * 0.3)) {
      g.fail('sphere/reduce', `구를 25% 로 줄이라 했는데 ${half.stats.trianglesAfter}개 남았다`);
    }
    n++;
    // 반지름 1 인 구를 4분의 1로 줄였다. 줄인 살은 구 **안쪽**에 들어가므로
    // (남은 점이 전부 구면 위라 삼각형이 현이다) 벗어남은 가장 큰 삼각형의
    // 활꼴 높이다. 반지름의 8% 를 넘으면 실루엣이 각진 것으로 보인다.
    if (!(sdev.maxM < 0.08)) g.fail('sphere/deviation', `구가 ${(sdev.maxM * 1000).toFixed(1)}mm 벗어난다 — 반지름 1m 에서`);
    n++;
    // 지름이 지켜지는가 — 실루엣이 통째로 오그라들면 멀리서도 작아 보인다.
    const sBox = boxOf(half.position);
    if (!(sBox.size[1] > 2 * 0.97)) g.fail('sphere/shrink', `지름 2 인 구가 ${sBox.size[1].toFixed(3)} 으로 오그라들었다`);
    n++;
    // **더 줄이면 더 벗어나는가.** 값 하나보다 이 관계가 오래 간다 — 기계도
    // 몸도 안 타는 성질이고, 줄이는 셈이 망가지면 여기서 먼저 뒤집힌다.
    let prevDev = 0;
    const curve = [];
    for (const r of [0.75, 0.5, 0.25, 0.1]) {
      const d = surfaceDeviation(simplifyMesh(sphere, { ratio: r }), sphere.position).maxM;
      curve.push(`${r}:${(d * 1000).toFixed(0)}mm`);
      if (!(d > prevDev)) g.fail('sphere/monotonic', `${r} 로 줄인 것이 그 앞보다 안 벗어난다 (${curve.join(' · ')})`);
      prevDev = d;
    }
    n++;
    // **점을 지어내지 않는다** — 남은 점은 전부 여전히 반지름 1 이다.
    let worstR = 0;
    for (let v = 0; v < half.position.length; v += 3) {
      const r = Math.hypot(half.position[v], half.position[v + 1], half.position[v + 2]);
      worstR = Math.max(worstR, Math.abs(r - 1));
    }
    if (!(worstR < 1e-6)) g.fail('sphere/onsurface', `줄인 점이 구면에서 ${worstR.toExponential(1)} 벗어나 있다 — 새 점을 지어냈다`);
    console.log(`  [줄이기] 평면 288→${small.stats.trianglesAfter} 벗어남 ${(dev.maxM * 1000).toFixed(4)}mm · 구(반지름 1m) ${curve.join(' · ')}`);

    // ── 2. 위상과 스킨이 성한가 ──
    for (const [name, src, out] of [['grid', grid, small], ['sphere', sphere, half]]) {
      n++;
      const nv = out.position.length / 3;
      let bad = 0, degen = 0;
      const seen = new Uint8Array(nv);
      for (let f = 0; f < out.index.length; f += 3) {
        const a2 = out.index[f], b2 = out.index[f + 1], c2 = out.index[f + 2];
        if (a2 >= nv || b2 >= nv || c2 >= nv || a2 < 0) bad++;
        if (a2 === b2 || b2 === c2 || a2 === c2) degen++;
        seen[a2] = seen[b2] = seen[c2] = 1;
      }
      if (bad) g.fail(`${name}/index`, `인덱스 ${bad}개가 정점 밖을 가리킨다`);
      n++;
      if (degen) g.fail(`${name}/degenerate`, `찌부러진 삼각형이 ${degen}개 남았다`);
      n++;
      let orphan = 0;
      for (let v = 0; v < nv; v++) if (!seen[v]) orphan++;
      if (orphan) g.fail(`${name}/orphan`, `어느 삼각형도 안 쓰는 점이 ${orphan}개다`);
      const w0 = weldMesh(src);
      const e0 = edgeStats(w0), e1 = edgeStats(out);
      n++;
      if (e1.open > e0.open) g.fail(`${name}/holes`, `테두리가 ${e0.open} → ${e1.open} 로 늘었다 — 구멍이 생겼다`);
      n++;
      // **살이 제 안으로 접혔는가** — 연결 조건을 안 보면 여기가 늘어난다.
      if (e1.nonManifold > e0.nonManifold) {
        g.fail(`${name}/nonmanifold`, `모서리 하나에 삼각형이 셋 넘게 붙은 자리가 ${e0.nonManifold} → ${e1.nonManifold} 로 늘었다`);
      }
      n++;
      // **뒤집힌 삼각형** — 있으면 살이 안팎으로 뒤집혀 검게 그려진다.
      const flip = flippedFaces(out, w0);
      if (flip.flipped) g.fail(`${name}/flipped`, `삼각형 ${flip.flipped}개가 원래 살의 반대쪽을 본다`);
      n++;
      let worstW = 0, badBone = 0;
      for (let v = 0; v < nv; v++) {
        let sum = 0;
        for (let c = 0; c < 4; c++) {
          const w = out.skinWeight[v * 4 + c];
          if (!(w >= 0) || !Number.isFinite(w)) badBone++;
          sum += w;
        }
        worstW = Math.max(worstW, Math.abs(sum - 1));
      }
      if (!(worstW < 1e-5)) g.fail(`${name}/weights`, `가중치 합이 1 에서 ${worstW.toExponential(1)} 벗어난다`);
      n++;
      if (badBone) g.fail(`${name}/weight-nan`, `가중치에 수가 아닌 것이 ${badBone}개 있다`);
    }

    // ── 3. 같은 입력에 같은 출력인가 ──
    n++;
    const again = simplifyMesh(sphere, { ratio: 0.25 });
    const same = again.position.length === half.position.length
      && again.position.every((v, i) => v === half.position[i])
      && again.index.length === half.index.length
      && again.index.every((v, i) => v === half.index[i]);
    if (!same) g.fail('deterministic', '같은 살을 두 번 줄였는데 다른 것이 나왔다 — 기준선이 뜻을 잃는다');
  }

  // ── 4. 잇기(weld) 자체 ──
  {
    n++;
    try {
      weldMesh({ position: new Float32Array(9), index: null });
      g.fail('weld/noindex', '인덱스 없는 기하를 받아 준다 — 조용히 이상한 것이 나온다');
    } catch { /* 던지는 것이 맞다 */ }

    // 같은 자리를 세 번 적은 삼각형 두 장. 이으면 점이 4개, 삼각형은 그대로.
    const dup = withSkin(
      [0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1],
      [0, 1, 2, 3, 4, 5],
    );
    const w = weldMesh(dup);
    n++;
    if (w.stats.after !== 4) g.fail('weld/merge', `점 6개를 이어 4개가 되어야 하는데 ${w.stats.after}개다`);
    n++;
    if (w.index.length / 3 !== 2) g.fail('weld/faces', `삼각형이 2개여야 하는데 ${w.index.length / 3}개다`);
    n++;
    // 이은 점은 **원래 자리** 그대로여야 한다 (평균 내지 않는다).
    let moved = 0;
    for (let v = 0; v < w.position.length; v += 3) {
      const hit = [];
      for (let u = 0; u < dup.position.length; u += 3) {
        if (Math.hypot(w.position[v] - dup.position[u], w.position[v + 1] - dup.position[u + 1],
          w.position[v + 2] - dup.position[u + 2]) < 1e-9) hit.push(u);
      }
      if (!hit.length) moved++;
    }
    if (moved) g.fail('weld/moved', `이은 점 ${moved}개가 원래 없던 자리에 있다`);
  }

  // ── 4-2. 살을 제 안으로 붙이지 않는가 (연결 조건) ──
  //
  // u 와 v 가 이웃 셋(a·b·w)을 함께 갖는데 모서리 uv 에 붙은 삼각형은 둘뿐인
  // 모양이다. 여기서 uv 를 접으면 서로 안 붙어 있던 두 자리가 한 점이 된다 —
  // 삼각형 수는 맞는데 살이 저 자신에 붙는다. 조건을 보는 쪽은 정점 4개로,
  // 안 보는 쪽은 3개로 같은 삼각형 둘을 만든다.
  {
    const pos = [0, 0, 0, 1, 0, 0, 0.5, 0, 1, 0.5, 0, -1, 0.5, 1, 0];   // u v a b w
    const pinch = withSkin(pos, [0, 1, 2, 1, 0, 3, 4, 0, 2, 4, 1, 3]);
    const out = simplifyMesh(pinch, { targetTriangles: 2, weld: false });
    n++;
    if (out.stats.trianglesAfter !== 2) g.fail('pinch/target', `삼각형 2개를 시켰는데 ${out.stats.trianglesAfter}개다`);
    n++;
    if (out.stats.verticesAfter < 4) {
      g.fail('pinch/fused', `삼각형 둘을 정점 ${out.stats.verticesAfter}개로 만들었다 — 안 붙어 있던 자리를 붙였다`);
    }
    n++;
    if (!out.stats.rejectedLink) g.fail('pinch/checked', '연결 조건을 어기는 모양인데 아무 접기도 안 막았다');
  }

  // ── 5. 진짜 몸 ──
  //
  // 로켓박스 팩은 저장소에 없다 (라이선스·크기). 있으면 재고, 없으면 말한다.
  const packDir = path.join(ROOT, 'packs', 'rocketbox-f01');
  const bodyFile = path.join(packDir, 'body.glb');
  const rec = PACK_MEASURED.rocketbox.instancedLod;
  if (!fs.existsSync(bodyFile)) {
    console.log('  [줄이기] 로켓박스 팩이 없어 진짜 몸 검사는 건너뛰었다 (scripts/import-rocketbox.mjs 로 만든다)');
  } else {
    const body = skinnedMeshOf(parseGLB(fs.readFileSync(bodyFile)));
    const lod = simplifyMesh(body, { ratio: rec.ratio });
    n++;
    if (lod.stats.verticesBefore !== rec.from.verts || lod.stats.trianglesBefore !== rec.from.triangles) {
      g.fail('body/source', `표는 정점 ${rec.from.verts}·삼각형 ${rec.from.triangles} 인데 몸은 ${lod.stats.verticesBefore}·${lod.stats.trianglesBefore} 다`);
    }
    n++;
    if (lod.stats.trianglesAfter !== rec.triangles || lod.stats.verticesAfter !== rec.verts) {
      g.fail('body/size', `표는 정점 ${rec.verts}·삼각형 ${rec.triangles} 인데 ${lod.stats.verticesAfter}·${lod.stats.trianglesAfter} 가 나왔다`);
    }

    // 쉬는 자세에서 벗어남 — 기록한 수와 견준다. 기계와 무관한 값이라
    // 그대로 견줄 수 있다 (시간과 달리).
    const dev = surfaceDeviation(lod, body.position);
    n++;
    if (dev.maxM * 1000 > rec.deviation.maxMm * 1.05) {
      g.fail('body/deviation', `벗어남 최대 ${(dev.maxM * 1000).toFixed(1)}mm — 기록은 ${rec.deviation.maxMm}mm`);
    }
    n++;
    if (dev.meanM * 1000 > rec.deviation.meanMm * 1.05) {
      g.fail('body/deviation-mean', `벗어남 평균 ${(dev.meanM * 1000).toFixed(2)}mm — 기록은 ${rec.deviation.meanMm}mm`);
    }

    // 위상 — 진짜 몸에도 같은 것을 묻는다. 원본에 이미 있는 흠(로켓박스 몸은
    // 조각이 셋이라 테두리가 있다)보다 **늘지 않았는가**로 본다.
    const wBody = weldMesh(body);
    const be0 = edgeStats(wBody), be1 = edgeStats(lod);
    n++;
    if (be1.open > be0.open) g.fail('body/holes', `테두리가 ${be0.open} → ${be1.open} 로 늘었다`);
    n++;
    if (be1.nonManifold > be0.nonManifold) {
      g.fail('body/nonmanifold', `제 안으로 접힌 모서리가 ${be0.nonManifold} → ${be1.nonManifold} 로 늘었다`);
    }
    // 뒤집힘은 **진짜 몸에는 안 묻는다.** 겨드랑이·사타구니처럼 살이 접힌
    // 자리와 눈꺼풀처럼 얇은 겹에서는, 면 하나가 주름을 가로지르는 것과
    // 뒤집힌 것을 법선만으로 못 가른다 (그 자리의 원래 법선이 서로
    // 반대쪽을 보고 있다). 재 보니 2,016개 중 70개가 그런 자리였고, 그것을
    // 결함으로 세면 게이트가 늘 빨간 채로 있게 된다. 뒤집힘은 주름이 없는
    // 모양(구·평면)에서 묻는다 — 거기서는 답이 하나뿐이다.

    // 키·폭·깊이 — 사람 모양이 남았는가. check-player 가 살을 재는 것과 같은 규약.
    const a = boxOf(body.position), b = boxOf(lod.position);
    for (const [i, what] of [[0, '폭'], [1, '키'], [2, '깊이']]) {
      n++;
      const drop = (a.size[i] - b.size[i]) / a.size[i];
      if (drop > 0.01) g.fail(`body/extent-${what}`, `${what}가 ${(drop * 100).toFixed(1)}% 줄었다 (${a.size[i].toFixed(3)} → ${b.size[i].toFixed(3)})`);
    }

    // **무게 있는 뼈가 사라지지 않았는가.** 어떤 뼈에 매인 점이 모두 접히면
    // 그 뼈는 살을 못 움직인다 — 팔이 통째로 안 따라오는 식이다.
    const share = (m) => {
      const byBone = new Map();
      let total = 0;
      for (let v = 0; v < m.position.length / 3; v++) {
        for (let c = 0; c < 4; c++) {
          const w = m.skinWeight[v * 4 + c];
          if (!(w > 0)) continue;
          byBone.set(m.skinIndex[v * 4 + c], (byBone.get(m.skinIndex[v * 4 + c]) || 0) + w);
          total += w;
        }
      }
      return { byBone, total };
    };
    const s0 = share(body), s1 = share(lod);
    n++;
    const lost = [...s0.byBone.entries()].filter(([bone, w]) => w / s0.total > 0.005 && !(s1.byBone.get(bone) > 0));
    if (lost.length) g.fail('body/bone-lost', `살을 0.5% 넘게 쥐고 있던 뼈 ${lost.length}개가 줄이는 동안 사라졌다 (${lost.map((x) => x[0]).join(',')})`);

    // **자세를 취한 채로도 벗어남이 비슷한가.**
    //
    // 쉬는 자세만 보면 가중치가 뒤섞인 것을 못 잡는다 — 뼈가 안 움직이면
    // 가중치가 무엇이든 같은 자리이기 때문이다. 클립 한가운데의 자세로
    // 양쪽을 움직여 놓고 다시 잰다.
    const clipFile = path.join(packDir, 'clips', 'walk-forward.glb');
    if (!fs.existsSync(clipFile)) {
      g.setupFail('몸은 있는데 walk-forward 클립이 없다 — 자세를 취한 검사를 못 한다');
    } else {
      const doc = attachAnimation(parseGLB(fs.readFileSync(bodyFile)), parseGLB(fs.readFileSync(clipFile)));
      const baked = bakeClip(doc);
      const frame = Math.floor(baked.frames / 2);
      const posedBody = skinPoints(body, baked, frame);
      const posedLod = { ...lod, position: skinPoints(lod, baked, frame) };
      const pdev = surfaceDeviation(posedLod, posedBody);
      n++;
      // 자세를 취하면 살이 늘어나는 자리가 있어 조금 커진다. 두 배까지는
      // 본 값이고, 그보다 커지면 가중치가 섞였다는 뜻이다.
      if (!(pdev.maxM < rec.deviation.maxMm / 1000 * 2)) {
        g.fail('body/posed', `자세를 취하니 ${(pdev.maxM * 1000).toFixed(1)}mm 벗어난다 — 쉬는 자세는 ${(dev.maxM * 1000).toFixed(1)}mm 였다`);
      }
      console.log(`  [줄이기] Rocketbox 몸: 삼각형 ${lod.stats.trianglesBefore}→${lod.stats.trianglesAfter} · 정점 ${lod.stats.verticesBefore}→${lod.stats.verticesAfter}`);
      console.log(`  [줄이기] 벗어남 쉴 때 최대 ${(dev.maxM * 1000).toFixed(1)}mm·평균 ${(dev.meanM * 1000).toFixed(2)}mm · 걸을 때 최대 ${(pdev.maxM * 1000).toFixed(1)}mm`);
    }
  }

  // ── 6. 잰 표가 값 노릇을 하는가 ──
  {
    n++;
    for (const f of ['ratio', 'verts', 'triangles', 'buildMs']) {
      if (!(rec[f] > 0)) g.fail(`table/${f}`, `줄인 먼 단계 표에 ${f} 가 없다`);
    }
    n++;
    if (!(rec.deviation?.maxMm > 0 && rec.deviation?.meanMm > 0)) {
      g.fail('table/deviation', '벗어남이 없다 — 싸진 값만 적고 대가를 안 적으면 표가 거짓말한다');
    }
    const pts = [...rec.points].sort((a, b) => a.people - b.people);
    n++;
    if (pts.length < 3) g.fail('table/points', `점이 ${pts.length}개다 — 셋은 있어야 곧은지 휘는지 본다`);
    n++;
    for (let i = 1; i < pts.length; i++) {
      if (!(pts[i].frameMs > pts[i - 1].frameMs)) {
        g.fail('table/monotonic', `${pts[i].people}명이 ${pts[i - 1].people}명보다 안 비싸다`);
      }
    }
    n++;
    // 줄인 단계가 안 줄인 단계보다 **정말 싼가** — 아니면 줄일 까닭이 없다.
    const full = PACK_MEASURED.rocketbox.instanced.points;
    for (const p of full) {
      const cheap = frameMsAt(pts, p.people).ms;
      if (!(cheap < p.frameMs)) {
        g.fail('table/cheaper', `${p.people}명에서 줄인 살(${cheap}ms)이 안 줄인 살(${p.frameMs}ms)보다 안 싸다`);
      }
    }
    n++;
    if (!(rec.verts < rec.from.verts && rec.triangles < rec.from.triangles)) {
      g.fail('table/smaller', '줄였다면서 정점·삼각형이 안 줄었다');
    }

    // 계획이 줄인 단계를 쓰는가 — 같은 예산에 사람이 더 선다.
    const t = PACK_MEASURED.rocketbox;
    n++;
    const plain = planCrowdMeasured(5000, 4, t, ['full', 'instanced']);
    const small = planCrowdMeasured(5000, 4, t, ['full', 'instancedLod']);
    const stood = (p) => p.mix.reduce((s, m) => s + m.count, 0);
    if (!(stood(small) > stood(plain))) {
      g.fail('plan/lod-more', `줄인 살로도 ${stood(small)}명뿐이다 — 안 줄였을 때가 ${stood(plain)}명`);
    }
    n++;
    if (small.ms > 4 + 1e-9) g.fail('plan/lod-budget', `예산 4ms 인데 ${small.ms}ms 를 쓴다`);
    n++;
    if (!small.mix.some((m) => m.tier === 'instancedLod')) g.fail('plan/lod-tier', '줄인 단계를 쓰라고 했는데 안 쓴다');
    n++;
    // 둘 다 줄 수 있다고 하면 싼 쪽(줄인 살)을 고른다.
    if (!planCrowdMeasured(5000, 4, t, ['full', 'instanced', 'instancedLod']).mix.some((m) => m.tier === 'instancedLod')) {
      g.fail('plan/lod-prefer', '둘 다 쓸 수 있는데 비싼 쪽을 고른다');
    }
    n++;
    // 안 준 단계는 안 쓴다.
    if (planCrowdMeasured(200, 4, t, ['full']).mix.some((m) => m.tier !== 'full')) {
      g.fail('plan/lod-blocked', '먼 단계를 막았는데 쓴다');
    }
    console.log(`  [줄이기] 4ms · 5,000명 요청 → 안 줄임 ${stood(plain)}명 · 줄임 ${stood(small)}명 (${small.ms}ms)`);
  }

  return n;
});
