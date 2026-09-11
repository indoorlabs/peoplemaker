// 동작을 다른 몸으로 옮긴다 (retarget).
//
// 동작 데이터는 몸마다 따로다. Rocketbox 여자에게는 통화 동작이 없고 남자에게는
// 있다. Mixamo·CMU·생성 모델이 내놓는 동작은 뼈 이름도, 뼈 길이도, 쉬는 자세
// (T·A)도, 앞도 우리 몸과 다르다. 이 파일이 그 차이를 메운다.
//
// **세계 좌표에서 뼈의 방향을 옮긴다.** 국소 회전을 그대로 베끼면 쉬는 자세가
// 다른 순간 팔이 45° 씩 틀어진다 (Rocketbox 는 A 자세, Mixamo 는 T 자세).
//
//   D  = 원본 뼈가 쉬는 자세에서 지금까지 돈 양 (세계)
//   A  = 대상 뼈의 쉬는 방향을 원본 뼈의 쉬는 방향으로 돌리는 최소 회전
//   G  = 두 몸의 앞을 맞추는 수직축 회전
//   대상 세계 회전 = D · A · (대상 쉬는 세계 회전)
//
// 그러면 대상 뼈가 가리키는 방향이 원본 뼈가 가리키는 방향과 같아진다 —
// 이것이 게이트(check-retarget)가 묻는 것이다.
//
// 뼈 길이는 대상 것을 지킨다 (회전만 옮긴다). 몸 전체의 이동만 엉덩이 높이
// 비로 줄이거나 늘린다 — 다리가 짧은 몸이 같은 보폭으로 가면 발이 미끄러진다.
// 그래서 원본이 **뼈 자리까지** 움직이면(Rocketbox 는 척추 관절이 1cm 남짓
// 오르내린다) 그 몫은 버려진다. 골반→척추가 6~8° 쯤 덜 꺾이는 정도다.
//
// three 를 쓰지 않는다. 팩을 만드는 쪽(Node)에서 돈다.

import { sampleAnimation, animationDurationS, parentMap, nodeWorldMatrix, multiplyMat4 } from './gltf.mjs';

// ── 뼈 이름 ──────────────────────────────────────────────────────

/**
 * 공통 뼈 — [이름, 주 사슬의 다음 뼈].
 *
 * "다음 뼈" 는 방향을 잴 때 겨누는 곳이다. 한쪽 몸에 없으면 사슬을 따라 더
 * 내려간다 (척추가 셋인 몸과 하나인 몸 사이에서 척추는 목·머리를 겨눈다).
 */
const CANON = [
  ['hips', 'spine'], ['spine', 'spine1'], ['spine1', 'spine2'], ['spine2', 'neck'], ['neck', 'head'], ['head', null],
  ['lShoulder', 'lUpperArm'], ['lUpperArm', 'lForearm'], ['lForearm', 'lHand'], ['lHand', null],
  ['rShoulder', 'rUpperArm'], ['rUpperArm', 'rForearm'], ['rForearm', 'rHand'], ['rHand', null],
  ['lUpLeg', 'lLeg'], ['lLeg', 'lFoot'], ['lFoot', 'lToe'], ['lToe', null],
  ['rUpLeg', 'rLeg'], ['rLeg', 'rFoot'], ['rFoot', 'rToe'], ['rToe', null],
];
const NEXT = new Map(CANON);

/** 규약마다 공통 뼈의 이름 — 접두어(mixamorig: · Bip01 )는 떼고 견준다. */
export const BONE_NAMES = {
  mixamo: {
    hips: 'Hips', spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head',
    lShoulder: 'LeftShoulder', lUpperArm: 'LeftArm', lForearm: 'LeftForeArm', lHand: 'LeftHand',
    rShoulder: 'RightShoulder', rUpperArm: 'RightArm', rForearm: 'RightForeArm', rHand: 'RightHand',
    lUpLeg: 'LeftUpLeg', lLeg: 'LeftLeg', lFoot: 'LeftFoot', lToe: 'LeftToeBase',
    rUpLeg: 'RightUpLeg', rLeg: 'RightLeg', rFoot: 'RightFoot', rToe: 'RightToeBase',
  },
  biped: {
    hips: 'Pelvis', spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head',
    lShoulder: 'L Clavicle', lUpperArm: 'L UpperArm', lForearm: 'L Forearm', lHand: 'L Hand',
    rShoulder: 'R Clavicle', rUpperArm: 'R UpperArm', rForearm: 'R Forearm', rHand: 'R Hand',
    lUpLeg: 'L Thigh', lLeg: 'L Calf', lFoot: 'L Foot', lToe: 'L Toe0',
    rUpLeg: 'R Thigh', rLeg: 'R Calf', rFoot: 'R Foot', rToe: 'R Toe0',
  },
};
const BARE = {
  mixamo: (n) => n.replace(/^.*:/, ''),
  biped: (n) => n.replace(/^Bip\d\d\s+/, ''),
};
/** 몸 전체의 이동을 싣는 노드 — build-pack 이 루트 모션을 여기서 잰다 (ROOT_NODES 와 같다). */
const CARRIER = {
  mixamo: null,               // 엉덩이가 곧 싣는 노드
  biped: /^Bip\d\d$/,
};

/** 뼈 이름으로 규약을 알아낸다 — 모르면 null. */
export function detectSkeleton(names) {
  if (names.some((n) => /^Bip\d\d /.test(n))) return 'biped';
  const bare = new Set(names.map(BARE.mixamo));
  if (bare.has('Hips') && bare.has('LeftUpLeg')) return 'mixamo';
  return null;
}

// ── 사원수 · 행렬 (glTF 규약: [x, y, z, w], 열 우선) ─────────────

const qn = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
function qmul(a, b) {
  return [
    a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
    a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
    a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-9 ? scale(a, 1 / l) : null; };
function qrot(q, v) {
  const u = [q[0], q[1], q[2]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[3])), cross(u, t));
}
/** a 를 b 로 돌리는 최소 회전 (둘 다 단위 벡터). */
function qFromUnit(a, b) {
  let r = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + 1;
  let q;
  if (r < 1e-6) {
    r = 0;
    q = Math.abs(a[0]) > Math.abs(a[2]) ? [-a[1], a[0], 0, r] : [0, -a[2], a[1], r];
  } else q = [...cross(a, b), r];
  return qn(q);
}
const qYaw = (rad) => [0, Math.sin(rad / 2), 0, Math.cos(rad / 2)];

/** 행렬의 회전 — 크기를 걷어 내고 읽는다 (Mixamo 는 뼈대 위에 0.01 이 걸려 온다). */
export function rotOf(m) {
  const sx = Math.hypot(m[0], m[1], m[2]) || 1;
  const sy = Math.hypot(m[4], m[5], m[6]) || 1;
  const sz = Math.hypot(m[8], m[9], m[10]) || 1;
  const r00 = m[0] / sx, r10 = m[1] / sx, r20 = m[2] / sx;
  const r01 = m[4] / sy, r11 = m[5] / sy, r21 = m[6] / sy;
  const r02 = m[8] / sz, r12 = m[9] / sz, r22 = m[10] / sz;
  const tr = r00 + r11 + r22;
  let q;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = [(r21 - r12) * s, (r02 - r20) * s, (r10 - r01) * s, 0.25 / s];
  } else if (r00 > r11 && r00 > r22) {
    const s = 2 * Math.sqrt(1 + r00 - r11 - r22);
    q = [0.25 * s, (r01 + r10) / s, (r02 + r20) / s, (r21 - r12) / s];
  } else if (r11 > r22) {
    const s = 2 * Math.sqrt(1 + r11 - r00 - r22);
    q = [(r01 + r10) / s, 0.25 * s, (r12 + r21) / s, (r02 - r20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + r22 - r00 - r11);
    q = [(r02 + r20) / s, (r12 + r21) / s, 0.25 * s, (r10 - r01) / s];
  }
  return qn(q);
}
const posOf = (m) => [m[12], m[13], m[14]];
function trs(t, r, s) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
/** 점 하나를 이 변환의 **안쪽** 좌표로 (아핀 역변환). */
function toLocal(m, p) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const v = sub(p, posOf(m));
  return [
    ((e * i - f * h) * v[0] + (c * h - b * i) * v[1] + (b * f - c * e) * v[2]) / det,
    ((f * g - d * i) * v[0] + (a * i - c * g) * v[1] + (c * d - a * f) * v[2]) / det,
    ((d * h - e * g) * v[0] + (b * g - a * h) * v[1] + (a * e - b * d) * v[2]) / det,
  ];
}
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const EMPTY = new Map();

// ── 몸 읽기 ──────────────────────────────────────────────────────

/** 몸 하나를 옮기기에 쓸 모양으로 — 규약·공통 뼈·싣는 노드·쉬는 자세. */
export function describeBody(doc, skeleton) {
  const nodes = doc.json.nodes || [];
  const names = nodes.map((n) => n.name || '');
  const sk = skeleton || detectSkeleton(names);
  if (!sk || !BONE_NAMES[sk]) throw new Error(`뼈 규약을 모른다 — 이름: ${names.slice(0, 6).join(', ')} …`);
  const parent = parentMap(doc);
  const canon = new Map();
  const bare = BARE[sk];
  for (const [key, want] of Object.entries(BONE_NAMES[sk])) {
    const i = names.findIndex((n) => bare(n) === want && (sk !== 'biped' || /^Bip\d\d /.test(n)));
    if (i >= 0) canon.set(key, i);
  }
  if (!canon.has('hips')) throw new Error(`${sk}: 엉덩이 뼈(${BONE_NAMES[sk].hips})가 없다`);
  const c = CARRIER[sk] ? names.findIndex((n) => CARRIER[sk].test(n)) : canon.get('hips');
  const carrier = c >= 0 ? c : canon.get('hips');
  // 위에서 아래로 — 부모를 먼저 푼다.
  const roots = doc.json.scenes?.[doc.json.scene || 0]?.nodes
    || nodes.map((_, i) => i).filter((i) => !parent.has(i));
  const order = [];
  const walk = (i) => { order.push(i); for (const ch of nodes[i].children || []) walk(ch); };
  roots.forEach(walk);
  const restWorld = nodes.map((_, i) => nodeWorldMatrix(doc, i, EMPTY, parent));
  const joints = new Set(doc.json.skins?.[0]?.joints || []);
  return { doc, sk, names, parent, canon, carrier, order, restWorld, joints };
}

/** 쉬는 자세의 앞 — 왼쪽 허벅지에서 오른쪽 허벅지로 가는 방향과 위의 외적. */
export function facingRad(body) {
  const l = body.canon.get('lUpLeg');
  const r = body.canon.get('rUpLeg');
  if (l == null || r == null) return 0;
  const left = sub(posOf(body.restWorld[l]), posOf(body.restWorld[r]));
  const fwd = cross([left[0], 0, left[2]], [0, 1, 0]);
  return Math.atan2(fwd[0], fwd[2]);
}

// ── 옮기기 ───────────────────────────────────────────────────────

/**
 * 원본 문서의 애니메이션을 대상 몸으로 옮긴다.
 *
 * @param source    parseGLB 결과 — 애니메이션이 든 몸
 * @param target    parseGLB 결과 — 옮겨 받을 몸 (애니메이션은 안 본다)
 * @returns {{ times: Float32Array, channels: {node:number, path:string, values:Float32Array}[], pairs: Map, report: object }}
 */
export function retargetClip(source, target, { fps = 30, animIndex = 0, sourceSkeleton, targetSkeleton } = {}) {
  const S = describeBody(source, sourceSkeleton);
  const T = describeBody(target, targetSkeleton);
  const same = S.sk === T.sk;

  // 짝 — 같은 규약이면 이름이 같은 뼈 전부(손가락·얼굴까지), 다르면 공통 뼈만.
  const pair = new Map();   // 대상 노드 → 원본 노드
  if (same) {
    const byName = new Map(S.names.map((n, i) => [n, i]));
    for (const i of T.order) {
      if (!T.joints.has(i) && i !== T.carrier) continue;
      const j = byName.get(T.names[i]);
      if (j != null) pair.set(i, j);
    }
  } else {
    for (const [key, ti] of T.canon) {
      const si = S.canon.get(key);
      if (si != null) pair.set(ti, si);
    }
  }
  if (!pair.size) throw new Error('두 몸 사이에 짝지을 뼈가 없다');

  // 앞과 크기
  const yaw = facingRad(T) - facingRad(S);
  const G = qYaw(yaw);
  const GC = qconj(G);
  const hipsS = posOf(S.restWorld[S.canon.get('hips')]);
  const hipsT = posOf(T.restWorld[T.canon.get('hips')]);
  const k = hipsS[1] > 1e-6 ? hipsT[1] / hipsS[1] : 1;

  // 겨누는 곳 — 대상 노드 → [대상 겨눔, 원본 겨눔]
  const canonOfT = new Map([...T.canon].map(([key, i]) => [i, key]));
  // 공통 뼈는 **주 사슬**을 겨눈다 — 같은 규약이어도. 첫 자식을 겨누던 때에는
  // Rocketbox 골반이 허벅지를 겨눠서, 남자 → 여자에서 골반→척추 방향이 8° 틀어졌다
  // (몸 모양이 달라 두 방향을 한꺼번에 맞출 수는 없다 — 사슬 쪽을 고른다).
  const aimOf = (ti) => {
    let key = NEXT.get(canonOfT.get(ti));
    while (key) {
      if (T.canon.has(key) && S.canon.has(key)) return [T.canon.get(key), S.canon.get(key)];
      key = NEXT.get(key);
    }
    if (same) {
      for (const c of target.json.nodes[ti].children || []) if (pair.has(c)) return [c, pair.get(c)];
    }
    return null;
  };
  // A — 쉬는 방향 맞춤. 겨눌 곳이 없는 뼈(손·머리)는 가장 가까운 짝지은 조상의 것을 쓴다.
  const A = new Map();
  for (const ti of T.order) {
    if (!pair.has(ti)) continue;
    const si = pair.get(ti);
    const aim = aimOf(ti);
    let a = null;
    if (aim) {
      const dt = norm(sub(posOf(T.restWorld[aim[0]]), posOf(T.restWorld[ti])));
      const ds = norm(qrot(G, sub(posOf(S.restWorld[aim[1]]), posOf(S.restWorld[si]))));
      if (dt && ds) a = qFromUnit(dt, ds);
    }
    if (!a) {
      let p = T.parent.get(ti);
      while (p != null && !A.has(p)) p = T.parent.get(p);
      a = p != null ? A.get(p) : [0, 0, 0, 1];
    }
    A.set(ti, a);
  }
  const restRotS = new Map([...pair.values()].map((si) => [si, rotOf(S.restWorld[si])]));
  const restRotT = new Map([...pair.keys()].map((ti) => [ti, rotOf(T.restWorld[ti])]));

  // 싣는 노드에서 엉덩이까지의 쉬는 거리 (싣는 노드 좌표에서)
  const H = T.canon.get('hips');
  const C = T.carrier;
  const offC = C === H ? [0, 0, 0]
    : qrot(qconj(rotOf(T.restWorld[C])), sub(hipsT, posOf(T.restWorld[C])));

  // 시각
  const durationS = animationDurationS(source, animIndex);
  const n = Math.max(2, Math.round(durationS * fps) + 1);
  const times = new Float32Array(n);
  for (let f = 0; f < n; f++) times[f] = Math.min(durationS, f / fps);
  times[n - 1] = durationS;

  const rotNodes = [...pair.keys()];
  const out = new Map(rotNodes.map((ti) => [ti, new Float32Array(n * 4)]));
  const carrierT = new Float32Array(n * 3);
  const prev = new Map();

  for (let f = 0; f < n; f++) {
    const sampled = sampleAnimation(source, animIndex, times[f]);
    const worldS = (si) => nodeWorldMatrix(source, si, sampled, S.parent);
    // 원본 엉덩이 → 대상 엉덩이 자리
    const hs = posOf(worldS(S.canon.get('hips')));
    const PH = add(hipsT, scale(qrot(G, sub(hs, hipsS)), k));
    // 짝지은 뼈의 대상 세계 회전
    const want = new Map();
    for (const [ti, si] of pair) {
      const D = qmul(qmul(G, qmul(rotOf(worldS(si)), qconj(restRotS.get(si)))), GC);
      want.set(ti, qn(qmul(qmul(D, A.get(ti)), restRotT.get(ti))));
    }
    // 위에서 아래로 풀어 국소 값으로
    const W = new Array(target.json.nodes.length);
    for (const ti of T.order) {
      const node = target.json.nodes[ti];
      const p = T.parent.get(ti);
      const PW = p == null ? IDENT : W[p];
      const pr = rotOf(PW);
      let r = node.rotation || [0, 0, 0, 1];
      let t = node.translation || [0, 0, 0];
      const s = node.scale || [1, 1, 1];
      if (want.has(ti)) r = qn(qmul(qconj(pr), want.get(ti)));
      if (ti === C) {
        const cr = want.has(ti) ? want.get(ti) : qmul(pr, r);
        t = toLocal(PW, sub(PH, qrot(cr, offC)));
        carrierT.set(t, f * 3);
      }
      W[ti] = multiplyMat4(PW, trs(t, r, s));
      if (out.has(ti)) {
        // 부호를 이어 준다 — q 와 -q 는 같은 회전이지만 사이를 섞으면 한 바퀴 돈다.
        const pq = prev.get(ti);
        const q = pq && (r[0] * pq[0] + r[1] * pq[1] + r[2] * pq[2] + r[3] * pq[3]) < 0 ? r.map((v) => -v) : r;
        prev.set(ti, q);
        out.get(ti).set(q, f * 4);
      }
    }
  }

  const channels = rotNodes.map((ti) => ({ node: ti, path: 'rotation', values: out.get(ti) }));
  channels.push({ node: C, path: 'translation', values: carrierT });
  return {
    times,
    channels,
    pairs: pair,
    report: {
      sourceSkeleton: S.sk, targetSkeleton: T.sk, mode: same ? 'same-names' : 'canonical',
      pairs: pair.size, hipScale: +k.toFixed(4), facingDeg: +((yaw * 180) / Math.PI).toFixed(1),
      durationS, frames: n,
    },
  };
}

// ── 결과를 몸에 싣기 ─────────────────────────────────────────────

/**
 * 대상 몸 문서에 옮긴 애니메이션을 얹어 새 문서로 — 원래 애니메이션은 버린다.
 *
 * 텍스처·메시는 그대로 두고 bin 뒤에 새 값만 붙인다. 결과는 encodeGLB 로 쓴다.
 * (버려진 애니메이션의 바이트는 bin 에 남는다 — 크기를 줄이는 일은 여기서 안 한다.)
 */
export function withAnimation(target, result, name = 'clip') {
  const json = JSON.parse(JSON.stringify(target.json));
  const base = target.bin ? new Uint8Array(target.bin.buffer, target.bin.byteOffset, target.bin.byteLength) : new Uint8Array(0);
  const chunks = [base];
  let offset = base.byteLength;
  const pad = () => { const r = (4 - (offset % 4)) % 4; if (r) { chunks.push(new Uint8Array(r)); offset += r; } };
  json.buffers = json.buffers?.length ? json.buffers : [{ byteLength: 0 }];
  json.bufferViews = json.bufferViews || [];
  json.accessors = json.accessors || [];
  const put = (arr, type, minmax) => {
    pad();
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push(bytes);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
    offset += bytes.byteLength;
    const per = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    const acc = { bufferView: json.bufferViews.length - 1, componentType: 5126, count: arr.length / per, type };
    if (minmax) Object.assign(acc, minmax);
    json.accessors.push(acc);
    return json.accessors.length - 1;
  };
  const input = put(result.times, 'SCALAR', { min: [result.times[0]], max: [result.times[result.times.length - 1]] });
  const anim = { name, samplers: [], channels: [] };
  for (const ch of result.channels) {
    const output = put(ch.values, ch.path === 'rotation' ? 'VEC4' : 'VEC3');
    anim.samplers.push({ input, output, interpolation: 'LINEAR' });
    anim.channels.push({ sampler: anim.samplers.length - 1, target: { node: ch.node, path: ch.path } });
  }
  json.animations = [anim];
  pad();
  const bin = new Uint8Array(offset);
  let at = 0;
  for (const c of chunks) { bin.set(c, at); at += c.byteLength; }
  json.buffers[0].byteLength = bin.byteLength;
  delete json.buffers[0].uri;
  return { json, bin };
}

/** 문서를 GLB 바이트로. */
export function encodeGLB({ json, bin }) {
  const enc = new TextEncoder();
  let js = enc.encode(JSON.stringify(json));
  const jsPad = (4 - (js.byteLength % 4)) % 4;
  if (jsPad) { const p = new Uint8Array(js.byteLength + jsPad).fill(0x20); p.set(js); js = p; }
  const binLen = bin ? bin.byteLength : 0;
  const total = 12 + 8 + js.byteLength + (binLen ? 8 + binLen : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.byteLength, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(js, 20);
  if (binLen) {
    const o = 20 + js.byteLength;
    dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true);
    out.set(bin, o + 8);
  }
  return out;
}
