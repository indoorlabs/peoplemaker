// 멀리 있는 사람에게 정점 5,000개는 없어도 된다 — 살을 줄인다.
//
// ## 왜 지금인가
//
// 드로우콜은 이미 하나로 줄였다 (poseBake + instancedCrowd). 그러고 나서
// Rocketbox 몸으로 다시 재니 **벽이 옮겨 갔다** — 사람 수가 아니라 몸의
// 정점 수다 (lib/crowdBudget.mjs 의 PACK_MEASURED.rocketbox.instanced):
//
//   먼 단계 · 정점 4,883 · 드로우콜 2      200명 1.46ms · 1,000명 4.81ms
//
// 4ms 예산에 823명이다. 사람이 걸어 다니는 도시를 세우기에는 모자란다.
// 드로우콜이 2 인데 4.81ms 라면 남은 것은 정점·삼각형 몫뿐이고, 그 몫은
// **살을 줄이는 것 말고 줄일 방법이 없다.**
//
// ## 무엇을 하는가
//
// 이차오차(QEM, Garland-Heckbert 1997)로 모서리를 접는다. 뼈대·동작은
// 그대로다 — 줄이는 것은 살뿐이라, 같은 구운 아틀라스를 그대로 쓴다.
//
// ## 반쪽 접기만 한다 (지어내지 않는다)
//
// 제대로 된 QEM 은 접은 자리의 **새 점**을 이차식을 풀어 찾는다. 그 점이
// 더 곱지만, 여기서는 안 쓴다 — 새 점에는 스킨 가중치가 없기 때문이다.
// 지어내려면 두 점의 가중치를 섞어야 하고, 뼈가 다른 두 점을 섞으면 (어깨와
// 팔) 그 정점이 어느 쪽도 아닌 데로 끌려간다. 멀리서도 그건 보인다.
//
// 그래서 **둘 중 하나를 남긴다**: i 를 j 로 접거나 j 를 i 로 접거나, 싼 쪽.
// 남은 점의 위치·법선·가중치를 그대로 쓴다. 값을 만들어 내지 않는다.
//
// 이 파일에는 three.js 도 DOM 도 없다. 배열과 수뿐이다.

/**
 * 같은 자리의 정점을 하나로 잇는다.
 *
 * **이것을 먼저 하지 않으면 줄일 것이 거의 없다.** GLB 의 정점은 UV 와
 * 법선이 갈리는 자리마다 쪼개져 있다. 쪼개진 채로 모서리를 접으면 살이
 * 솔기를 따라 갈라진 채 남는다 — 접을 모서리가 거기에 없기 때문이다.
 *
 * 먼 단계는 UV 를 안 쓴다 (한 색으로 칠한다). 그래서 잇는 대가가 없다.
 *
 * 법선은 **더해서 정규화**하고, 스킨 가중치는 뼈별로 더한 뒤 상위 넷만
 * 남겨 다시 정규화한다. 같은 자리의 정점은 대개 가중치가 같아서 이 셈이
 * 아무것도 안 바꾸지만, 몸 조각과 머리 조각이 맞닿는 자리는 다를 수 있다.
 *
 * @param mesh { position, normal?, skinIndex?, skinWeight?, index }
 * @param toleranceM 이 거리 안이면 같은 자리로 본다 (기본 0.01mm)
 */
export function weldMesh(mesh, { toleranceM = 1e-5 } = {}) {
  const pos = mesh.position;
  const nIn = pos.length / 3;
  const idx = mesh.index;
  if (!idx) throw new Error('인덱스가 없는 기하는 못 줄인다');
  const hasSkin = !!(mesh.skinIndex && mesh.skinWeight);

  const key = new Map();
  const remap = new Int32Array(nIn);
  const q = 1 / toleranceM;
  const outPos = [];
  const normAcc = [];
  const skinAcc = [];     // 대표 정점마다 Map(뼈 → 가중치 합)

  for (let v = 0; v < nIn; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const k = Math.round(x * q) + ',' + Math.round(y * q) + ',' + Math.round(z * q);
    let to = key.get(k);
    if (to === undefined) {
      to = outPos.length / 3;
      key.set(k, to);
      outPos.push(x, y, z);
      normAcc.push(0, 0, 0);
      if (hasSkin) skinAcc.push(new Map());
    }
    remap[v] = to;
    if (mesh.normal) {
      normAcc[to * 3] += mesh.normal[v * 3];
      normAcc[to * 3 + 1] += mesh.normal[v * 3 + 1];
      normAcc[to * 3 + 2] += mesh.normal[v * 3 + 2];
    }
    if (hasSkin) {
      const m = skinAcc[to];
      for (let c = 0; c < 4; c++) {
        const w = mesh.skinWeight[v * 4 + c];
        if (!(w > 0)) continue;
        const b = mesh.skinIndex[v * 4 + c];
        m.set(b, (m.get(b) || 0) + w);
      }
    }
  }

  const nOut = outPos.length / 3;
  const position = Float32Array.from(outPos);
  const normal = new Float32Array(nOut * 3);
  for (let v = 0; v < nOut; v++) {
    const x = normAcc[v * 3], y = normAcc[v * 3 + 1], z = normAcc[v * 3 + 2];
    const len = Math.hypot(x, y, z);
    if (len > 1e-9) { normal[v * 3] = x / len; normal[v * 3 + 1] = y / len; normal[v * 3 + 2] = z / len; }
    else normal[v * 3 + 1] = 1;
  }

  let skinIndex = null;
  let skinWeight = null;
  if (hasSkin) {
    skinIndex = new Uint16Array(nOut * 4);
    skinWeight = new Float32Array(nOut * 4);
    for (let v = 0; v < nOut; v++) {
      const top = [...skinAcc[v].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top.reduce((s, e) => s + e[1], 0) || 1;
      for (let c = 0; c < top.length; c++) {
        skinIndex[v * 4 + c] = top[c][0];
        skinWeight[v * 4 + c] = top[c][1] / sum;
      }
    }
  }

  // 삼각형을 옮겨 담으면서 **찌부러진 것**을 버린다 — 두 꼭지가 같아진
  // 삼각형은 넓이가 0 이라 법선이 없고, 그대로 두면 이차식이 NaN 이 된다.
  const tri = [];
  let degenerate = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const a = remap[idx[f]], b = remap[idx[f + 1]], c = remap[idx[f + 2]];
    if (a === b || b === c || a === c) { degenerate++; continue; }
    tri.push(a, b, c);
  }

  return {
    position, normal, skinIndex, skinWeight,
    index: Uint32Array.from(tri),
    stats: { before: nIn, after: nOut, merged: nIn - nOut, degenerate },
  };
}

// ── 이차식 (대칭 4×4 을 10개로) ──────────────────────────────────
// [xx, xy, xz, xw, yy, yz, yw, zz, zw, ww]

function addPlane(q, at, a, b, c, d, w) {
  q[at] += w * a * a; q[at + 1] += w * a * b; q[at + 2] += w * a * c; q[at + 3] += w * a * d;
  q[at + 4] += w * b * b; q[at + 5] += w * b * c; q[at + 6] += w * b * d;
  q[at + 7] += w * c * c; q[at + 8] += w * c * d;
  q[at + 9] += w * d * d;
}

function quadricError(q, at, x, y, z) {
  return q[at] * x * x + 2 * q[at + 1] * x * y + 2 * q[at + 2] * x * z + 2 * q[at + 3] * x
    + q[at + 4] * y * y + 2 * q[at + 5] * y * z + 2 * q[at + 6] * y
    + q[at + 7] * z * z + 2 * q[at + 8] * z
    + q[at + 9];
}

function faceNormal(pos, a, b, c) {
  const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
  const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
  const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

/** 가장 작은 것이 먼저 나오는 힙. 낡은 항목은 안 지우고 **꺼낼 때 버린다**. */
function makeHeap() {
  const a = [];
  const up = (i) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].cost <= a[i].cost) break;
      const t = a[p]; a[p] = a[i]; a[i] = t;
      i = p;
    }
  };
  const down = (i) => {
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let s = i;
      if (l < a.length && a[l].cost < a[s].cost) s = l;
      if (r < a.length && a[r].cost < a[s].cost) s = r;
      if (s === i) break;
      const t = a[s]; a[s] = a[i]; a[i] = t;
      i = s;
    }
  };
  return {
    get size() { return a.length; },
    push(e) { a.push(e); up(a.length - 1); },
    pop() {
      const top = a[0];
      const last = a.pop();
      if (a.length) { a[0] = last; down(0); }
      return top;
    },
  };
}

const edgeKey = (i, j) => (i < j ? i + ':' + j : j + ':' + i);

/**
 * 모서리를 접어 삼각형을 줄인다.
 *
 * @param mesh   { position, normal?, skinIndex?, skinWeight?, index }
 * @param ratio  남길 삼각형 비율 (0.25 = 4분의 1)
 * @param targetTriangles 비율 대신 개수로
 * @param boundaryWeight 테두리를 붙잡는 힘. 눈·입 구멍과 조각의 가장자리가
 *        여기서 뭉개지면 멀리서도 얼굴에 구멍이 커진 것으로 보인다
 * @param flipCosMin 접은 뒤 삼각형이 이만큼도 같은 쪽을 안 보면 그 접기는 버린다
 * @param weld   같은 자리의 정점을 먼저 잇는가 (기본 그렇다)
 */
export function simplifyMesh(mesh, {
  ratio, targetTriangles, boundaryWeight = 1000, flipCosMin = 0.2, weld = true, toleranceM = 1e-5,
} = {}) {
  const src = weld ? weldMesh(mesh, { toleranceM }) : mesh;
  const pos = Float32Array.from(src.position);
  const idx = Int32Array.from(src.index);
  const nV = pos.length / 3;
  const nF = idx.length / 3;
  const want = Math.max(1, Math.floor(targetTriangles ?? nF * (ratio ?? 0.25)));

  const q = new Float64Array(nV * 10);
  const alive = new Uint8Array(nV).fill(1);
  const faceAlive = new Uint8Array(nF).fill(1);
  const version = new Int32Array(nV);
  const vFaces = Array.from({ length: nV }, () => []);

  // 1) 삼각형마다 평면을 넓이로 무게 달아 세 꼭지에 더한다.
  for (let f = 0; f < nF; f++) {
    const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
    vFaces[a].push(f); vFaces[b].push(f); vFaces[c].push(f);
    const n = faceNormal(pos, a, b, c);
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-12) { faceAlive[f] = 0; continue; }
    const area = len / 2;
    const ux = n[0] / len, uy = n[1] / len, uz = n[2] / len;
    const d = -(ux * pos[a * 3] + uy * pos[a * 3 + 1] + uz * pos[a * 3 + 2]);
    addPlane(q, a * 10, ux, uy, uz, d, area);
    addPlane(q, b * 10, ux, uy, uz, d, area);
    addPlane(q, c * 10, ux, uy, uz, d, area);
  }

  // 2) 테두리 — 삼각형 하나만 붙은 모서리. 그 모서리를 지나고 면에 **수직인**
  //    평면을 무겁게 더한다. 안 그러면 조각이 잘린 자리부터 오그라든다.
  const edgeFaces = new Map();
  for (let f = 0; f < nF; f++) {
    if (!faceAlive[f]) continue;
    const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
    for (const e of [[a, b], [b, c], [c, a]]) {
      const k = edgeKey(e[0], e[1]);
      const got = edgeFaces.get(k);
      if (got) got.push(f); else edgeFaces.set(k, [f]);
    }
  }
  let boundaryEdges = 0;
  for (const [k, fs] of edgeFaces) {
    if (fs.length !== 1) continue;
    boundaryEdges++;
    const parts = k.split(':');
    const i = +parts[0], j = +parts[1];
    const f = fs[0];
    const n = faceNormal(pos, idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]);
    const ex = pos[j * 3] - pos[i * 3], ey = pos[j * 3 + 1] - pos[i * 3 + 1], ez = pos[j * 3 + 2] - pos[i * 3 + 2];
    // 모서리 방향 × 면 법선 = 모서리를 지나며 면에 수직인 평면의 법선
    let bx = ey * n[2] - ez * n[1], by = ez * n[0] - ex * n[2], bz = ex * n[1] - ey * n[0];
    const bl = Math.hypot(bx, by, bz);
    if (bl < 1e-12) continue;
    bx /= bl; by /= bl; bz /= bl;
    const d = -(bx * pos[i * 3] + by * pos[i * 3 + 1] + bz * pos[i * 3 + 2]);
    const w = boundaryWeight * (Math.hypot(ex, ey, ez) || 1e-6);
    addPlane(q, i * 10, bx, by, bz, d, w);
    addPlane(q, j * 10, bx, by, bz, d, w);
  }

  // 3) 후보 모서리를 힙에 담는다.
  const heap = makeHeap();
  const costOf = (i, j) => {
    // i 를 j 로 접으면 남는 점은 j 다 — 이차식은 둘을 더한 것으로 재고,
    // 재는 자리는 **남는 점**이다.
    const toJ = quadricError(q, i * 10, pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2])
      + quadricError(q, j * 10, pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]);
    const toI = quadricError(q, j * 10, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
      + quadricError(q, i * 10, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    // 음수는 수치 오차다 (이차식은 0 이상이어야 한다). 0 으로 눌러 둔다.
    return toJ <= toI
      ? { from: i, to: j, cost: Math.max(0, toJ) }
      : { from: j, to: i, cost: Math.max(0, toI) };
  };
  const pushEdge = (i, j) => {
    const c = costOf(i, j);
    heap.push({ from: c.from, to: c.to, cost: c.cost, i, j, vi: version[i], vj: version[j] });
  };
  for (const k of edgeFaces.keys()) {
    const parts = k.split(':');
    pushEdge(+parts[0], +parts[1]);
  }

  // 죽은 삼각형이 쌓이면 걷어 낸다 — 안 그러면 이웃을 찾는 값이 점점 비싸진다.
  const liveFaces = (v) => {
    const fs = vFaces[v];
    if (fs.length > 8) {
      const live = fs.filter((f) => faceAlive[f]);
      if (live.length * 2 < fs.length) { vFaces[v] = live; return live; }
    }
    return fs;
  };
  const neighbors = (v) => {
    const out = new Set();
    for (const f of liveFaces(v)) {
      if (!faceAlive[f]) continue;
      for (let c = 0; c < 3; c++) { const u = idx[f * 3 + c]; if (u !== v) out.add(u); }
    }
    return out;
  };
  const facesOnEdge = (i, j) => (edgeFaces.get(edgeKey(i, j)) || []).filter((f) => {
    if (!faceAlive[f]) return false;
    const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
    return (a === i || b === i || c === i) && (a === j || b === j || c === j);
  });

  let faces = 0;
  for (let f = 0; f < nF; f++) if (faceAlive[f]) faces++;
  let collapses = 0, rejectedFlip = 0, rejectedLink = 0, maxCost = 0;

  while (faces > want && heap.size) {
    const e = heap.pop();
    if (!alive[e.i] || !alive[e.j]) continue;
    if (e.vi !== version[e.i] || e.vj !== version[e.j]) continue;   // 낡은 값

    const from = e.from, to = e.to;

    // **연결 조건** — 두 점이 함께 가진 이웃이 그 모서리에 붙은 삼각형
    // 수보다 많으면, 접는 순간 살이 제 안으로 접힌다 (겉보기엔 멀쩡한데
    // 구멍이 생긴다). 위상을 깨는 접기는 안 한다.
    const onEdge = facesOnEdge(from, to).length;
    if (!onEdge) { rejectedLink++; continue; }
    const nTo = neighbors(to);
    let shared = 0;
    for (const v of neighbors(from)) if (nTo.has(v)) shared++;
    if (shared !== onEdge) { rejectedLink++; continue; }

    // **뒤집히는가** — 접은 뒤 삼각형이 반대쪽을 보면 살이 뒤집힌다.
    let flips = false;
    const touched = [];
    for (const f of liveFaces(from)) {
      if (!faceAlive[f]) continue;
      const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
      if (a === to || b === to || c === to) { touched.push({ f, dies: true }); continue; }
      const before = faceNormal(pos, a, b, c);
      const bl = Math.hypot(before[0], before[1], before[2]);
      const na = a === from ? to : a, nb = b === from ? to : b, nc = c === from ? to : c;
      const after = faceNormal(pos, na, nb, nc);
      const al = Math.hypot(after[0], after[1], after[2]);
      if (bl < 1e-12 || al < 1e-14) { flips = true; break; }
      const cos = (before[0] * after[0] + before[1] * after[1] + before[2] * after[2]) / (bl * al);
      if (cos < flipCosMin) { flips = true; break; }
      touched.push({ f, dies: false });
    }
    if (flips) { rejectedFlip++; continue; }

    // 접는다.
    for (const t of touched) {
      if (t.dies) { faceAlive[t.f] = 0; faces--; continue; }
      for (let c = 0; c < 3; c++) if (idx[t.f * 3 + c] === from) idx[t.f * 3 + c] = to;
      vFaces[to].push(t.f);
    }
    alive[from] = 0;
    for (let c = 0; c < 10; c++) q[to * 10 + c] += q[from * 10 + c];
    version[to]++;
    collapses++;
    if (e.cost > maxCost) maxCost = e.cost;

    // 남은 점 둘레의 모서리를 다시 담는다. 모서리→삼각형 표도 이어 붙인다 —
    // 연결 조건이 이 표를 보기 때문이다.
    for (const v of neighbors(to)) {
      const k = edgeKey(to, v);
      const cur = (edgeFaces.get(k) || []).filter((f) => faceAlive[f]);
      for (const f of (edgeFaces.get(edgeKey(from, v)) || [])) {
        if (faceAlive[f] && !cur.includes(f)) cur.push(f);
      }
      edgeFaces.set(k, cur);
      pushEdge(to, v);
    }
  }

  // 4) 살아남은 것만 옮겨 담는다.
  const remap = new Int32Array(nV).fill(-1);
  let at = 0;
  for (let v = 0; v < nV; v++) if (alive[v]) remap[v] = at++;
  const out = {
    position: new Float32Array(at * 3),
    normal: new Float32Array(at * 3),
    skinIndex: src.skinIndex ? new Uint16Array(at * 4) : null,
    skinWeight: src.skinWeight ? new Float32Array(at * 4) : null,
  };
  for (let v = 0; v < nV; v++) {
    if (!alive[v]) continue;
    const o = remap[v];
    for (let c = 0; c < 3; c++) out.position[o * 3 + c] = pos[v * 3 + c];
    if (out.skinIndex) {
      for (let c = 0; c < 4; c++) {
        out.skinIndex[o * 4 + c] = src.skinIndex[v * 4 + c];
        out.skinWeight[o * 4 + c] = src.skinWeight[v * 4 + c];
      }
    }
  }
  const tri = [];
  for (let f = 0; f < nF; f++) {
    if (!faceAlive[f]) continue;
    tri.push(remap[idx[f * 3]], remap[idx[f * 3 + 1]], remap[idx[f * 3 + 2]]);
  }
  out.index = Uint32Array.from(tri);

  // 법선은 **다시 잰다.** 남은 점의 옛 법선을 그대로 쓰면 이웃이 사라진
  // 만큼 어긋난 채로 남아, 멀리 있는 사람이 얼룩덜룩해진다.
  for (let f = 0; f < out.index.length; f += 3) {
    const a = out.index[f], b = out.index[f + 1], c = out.index[f + 2];
    const n = faceNormal(out.position, a, b, c);
    for (const v of [a, b, c]) {
      out.normal[v * 3] += n[0]; out.normal[v * 3 + 1] += n[1]; out.normal[v * 3 + 2] += n[2];
    }
  }
  for (let v = 0; v < at; v++) {
    const len = Math.hypot(out.normal[v * 3], out.normal[v * 3 + 1], out.normal[v * 3 + 2]);
    if (len > 1e-12) for (let c = 0; c < 3; c++) out.normal[v * 3 + c] /= len;
    else out.normal[v * 3 + 1] = 1;
  }

  out.stats = {
    verticesBefore: src.stats?.before ?? nV,
    verticesWelded: nV,
    verticesAfter: at,
    trianglesBefore: nF,
    trianglesAfter: out.index.length / 3,
    collapses, rejectedFlip, rejectedLink, boundaryEdges,
    maxQuadricError: +maxCost.toExponential(2),
  };
  return out;
}

/**
 * 줄인 살이 원래 살에서 얼마나 벗어났는가 (m).
 *
 * **정점끼리 견주면 안 된다** — 줄인 쪽의 점은 원래 점의 부분집합이라 거리가
 * 늘 0 이다. 원래 **점에서 줄인 살의 면까지**를 잰다. 이것이 멀리서 볼 때
 * 실루엣이 얼마나 달라지는지에 가장 가까운 수다.
 *
 * 삼각형을 격자에 담아 가까운 칸만 본다 — 안 그러면 점 5천 × 면 5천이다.
 */
export function surfaceDeviation(mesh, points) {
  const idx = mesh.index;
  const P = mesh.position;
  const nF = idx.length / 3;
  if (!nF) throw new Error('견줄 면이 없다');

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    if (P[i] < minX) minX = P[i]; if (P[i] > maxX) maxX = P[i];
    if (P[i + 1] < minY) minY = P[i + 1]; if (P[i + 1] > maxY) maxY = P[i + 1];
    if (P[i + 2] < minZ) minZ = P[i + 2]; if (P[i + 2] > maxZ) maxZ = P[i + 2];
  }
  const cells = 24;
  const cell = (Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1) / cells;
  const bucket = new Map();
  const key = (a, b, c) => a + ',' + b + ',' + c;
  const cellOf = (x, y, z) => [
    Math.floor((x - minX) / cell), Math.floor((y - minY) / cell), Math.floor((z - minZ) / cell),
  ];
  for (let f = 0; f < nF; f++) {
    const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
    const lo = cellOf(
      Math.min(P[a * 3], P[b * 3], P[c * 3]),
      Math.min(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]),
      Math.min(P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2]));
    const hi = cellOf(
      Math.max(P[a * 3], P[b * 3], P[c * 3]),
      Math.max(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]),
      Math.max(P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2]));
    for (let x = lo[0]; x <= hi[0]; x++) {
      for (let y = lo[1]; y <= hi[1]; y++) {
        for (let z = lo[2]; z <= hi[2]; z++) {
          const k = key(x, y, z);
          const got = bucket.get(k);
          if (got) got.push(f); else bucket.set(k, [f]);
        }
      }
    }
  }

  let max = 0, sum = 0, count = 0;
  for (let p = 0; p < points.length; p += 3) {
    const x = points[p], y = points[p + 1], z = points[p + 2];
    const c0 = cellOf(x, y, z);
    let best = Infinity;
    // 가까운 칸부터 넓혀 간다 — 이미 찾은 거리가 이 껍질의 안쪽 거리보다
    // 가까우면 더 볼 것이 없다.
    for (let r = 0; r <= cells + 1; r++) {
      if (best < (r - 1) * cell) break;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            const fs = bucket.get(key(c0[0] + dx, c0[1] + dy, c0[2] + dz));
            if (!fs) continue;
            for (const f of fs) {
              const d = pointTriangleDistance(x, y, z, P, idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]);
              if (d < best) best = d;
            }
          }
        }
      }
    }
    if (!Number.isFinite(best)) continue;
    if (best > max) max = best;
    sum += best;
    count++;
  }
  return { maxM: max, meanM: count ? sum / count : 0, points: count };
}

/** 점에서 삼각형까지의 거리 (Ericson, Real-Time Collision Detection). */
function pointTriangleDistance(px, py, pz, P, ia, ib, ic) {
  const ax = P[ia * 3], ay = P[ia * 3 + 1], az = P[ia * 3 + 2];
  const bx = P[ib * 3], by = P[ib * 3 + 1], bz = P[ib * 3 + 2];
  const cx = P[ic * 3], cy = P[ic * 3 + 1], cz = P[ic * 3 + 2];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return Math.hypot(apx, apy, apz);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bpx, bpy, bpz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(apx - v * abx, apy - v * aby, apz - v * abz);
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cpx, cpy, cpz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(apx - w * acx, apy - w * acy, apz - w * acz);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return Math.hypot(bpx - w * (cx - bx), bpy - w * (cy - by), bpz - w * (cz - bz));
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return Math.hypot(apx - (v * abx + w * acx), apy - (v * aby + w * acy), apz - (v * abz + w * acz));
}
