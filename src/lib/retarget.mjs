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
import { appendAnimation } from './gltfWrite.mjs';

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

/**
 * 두 리그의 **크기 비** — 쉬는 자세의 뼈 길이로 잰다.
 *
 * 엉덩이 높이로 재면 안 된다. 동작 파일마다 쉬는 자세가 다르기 때문이다 —
 * 의자에 앉은 동작은 **쉬는 자세부터 앉아 있어서** 엉덩이가 제자리의 66%
 * 에 있다. 그것을 크기로 읽으면 "이 몸은 1.5배 크다" 가 되고, 그 비로 옮겨
 * 붙이면 사람이 **선 키로 떠오른다** (엉덩이 92cm · 발끝 32cm — 실제로
 * 그렇게 나왔다).
 *
 * **규약 지도로 짝짓는다.** 이름을 그대로 견주던 때에는 규약이 다른 두 리그
 * (mixamo ↔ biped)에서 우연히 겹치는 이름(Spine·Neck·Head)만 잡혀 비가
 * 0.48 로 나왔다 — 다리도 팔도 안 본 값이다. 공통 뼈 사슬의 **마디 길이**를
 * 견주고 가운데 값을 쓴다.
 *
 * @returns { median, matched } — 짝지은 마디가 없으면 median 은 null
 */
export function restBoneScale(source, target, { sourceSkeleton, targetSkeleton } = {}) {
  let S; let T;
  try {
    S = describeBody(source, sourceSkeleton);
    T = describeBody(target, targetSkeleton);
  } catch {
    return { median: null, matched: 0 };
  }
  const segLen = (B, a, b) => {
    const ia = B.canon.get(a); const ib = B.canon.get(b);
    if (ia == null || ib == null) return null;
    const pa = posOf(B.restWorld[ia]); const pb = posOf(B.restWorld[ib]);
    const d = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    return d > 1e-3 ? d : null;
  };
  const ratios = [];
  for (const [a, b] of CANON) {
    if (!b) continue;
    const ls = segLen(S, a, b);
    const lt = segLen(T, a, b);
    if (ls && lt) ratios.push(lt / ls);
  }
  if (!ratios.length) return { median: null, matched: 0 };
  ratios.sort((x, y) => x - y);
  return { median: ratios[Math.floor(ratios.length / 2)], matched: ratios.length };
}

/**
 * 두 리그의 **쉬는 자세**가 얼마나 다른가 (rad, 가운데 값).
 *
 * 접붙이기(graft)는 클립의 트랙을 그대로 옮겨 심는 것이라, **트랙이 안
 * 건드리는 뼈**는 몸의 쉬는 자세로 남는다. 두 파일의 쉬는 자세가 같으면
 * 그래도 되지만, 의자 동작처럼 **쉬는 자세부터 앉아 있는** 파일에서는
 * 안 건드린 뼈만 선 자세로 남아 섞인다 — 엉덩이는 앉았는데 발이 12cm
 * 아래로 내려간 사람이 나왔다.
 *
 * 그래서 이 값이 크면 옮겨 붙인다. 옮기기는 짝지은 뼈 **전부**의 세계
 * 회전을 다시 쓰므로 쉬는 자세가 달라도 된다.
 */
export function restPoseDiffRad(source, target, { sourceSkeleton, targetSkeleton } = {}) {
  const rig = (doc, sk) => {
    const names = (doc.json.nodes || []).map((n) => n.name || '');
    const bare = BARE[sk || detectSkeleton(names)] || ((n) => n);
    const out = new Map();
    for (const [i, node] of (doc.json.nodes || []).entries()) {
      out.set(bare(names[i]), node.rotation || [0, 0, 0, 1]);
    }
    return out;
  };
  const S = rig(source, sourceSkeleton);
  const T = rig(target, targetSkeleton);
  const angles = [];
  for (const [name, q] of T) {
    const s = S.get(name);
    if (!s) continue;
    // 두 사원수 사이 각 — 부호는 같은 회전이므로 절댓값으로 본다.
    const dot = Math.abs(q[0] * s[0] + q[1] * s[1] + q[2] * s[2] + q[3] * s[3]);
    angles.push(2 * Math.acos(Math.min(1, dot)));
  }
  if (!angles.length) return { median: null, matched: 0 };
  angles.sort((a, b) => a - b);
  return { median: angles[Math.floor(angles.length / 2)], max: angles[angles.length - 1], matched: angles.length };
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
  //
  // **번호는 떼고 견준다.** 3ds Max 는 장면마다 바이페드에 번호를 매겨서,
  // 어른 몸은 Bip01 이고 어린이 몸은 Bip02 다. 이름을 그대로 견주면 같은
  // 규약인데도 짝이 0개가 되어 "짝지을 뼈가 없다" 로 멈춘다 (어린이를 받다
  // 밟았다). 한 몸 안에서는 접두어가 하나뿐이라 떼도 안 섞인다.
  const pair = new Map();   // 대상 노드 → 원본 노드
  if (same) {
    const bare = BARE[S.sk] || ((n) => n);
    const byName = new Map(S.names.map((n, i) => [bare(n), i]));
    for (const i of T.order) {
      if (!T.joints.has(i) && i !== T.carrier) continue;
      const j = byName.get(bare(T.names[i]));
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
  // **크기는 뼈 길이로 잰다.** 엉덩이 높이로 재던 때, 의자 동작에서 1.51배가
  // 나왔다 — 그 파일은 쉬는 자세부터 앉아 있어서 엉덩이가 낮다. 그 비로
  // 세로를 늘리니 앉은 사람이 **선 키로** 떠올랐다 (엉덩이 92cm · 발끝 32cm).
  const hipRatio = hipsS[1] > 1e-6 ? hipsT[1] / hipsS[1] : 1;
  const k = restBoneScale(source, target, { sourceSkeleton: S.sk, targetSkeleton: T.sk }).median ?? hipRatio;

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
    // 가로는 **쉬는 자세에서 얼마나 움직였는지**로, 세로는 **바닥에서**.
    //
    // 둘 다 변위로 옮기던 때에 의자 동작이 깨졌다. 그 클립은 쉬는 자세부터
    // 앉아 있어서 엉덩이 변위가 0 인데, 변위 0 을 "대상의 쉬는 자세" 로
    // 옮기면 **선 자세**가 된다 — 앉은 사람이 공중에 뜬 채로 발만 접힌다
    // (재 보니 엉덩이 92cm · 발끝 32cm 였다).
    const d = qrot(G, sub(hs, hipsS));
    const PH = [hipsT[0] + k * d[0], k * hs[1], hipsT[2] + k * d[2]];
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
      // scale 이 실제로 쓴 값(뼈 길이 비)이고, hipScale 은 견줘 보라고 같이 둔다.
      pairs: pair.size, scale: +k.toFixed(4), hipScale: +hipRatio.toFixed(4),
      facingDeg: +((yaw * 180) / Math.PI).toFixed(1),
      durationS, frames: n,
    },
  };
}

// ── 결과를 몸에 싣기 ─────────────────────────────────────────────

/** 옮긴 결과를 gltfWrite 의 애니메이션 꼴로 — 노드 이름을 함께 싣는다. */
export function animationOf(target, result, name = 'clip') {
  return {
    name,
    channels: result.channels.map((c) => ({
      node: c.node, nodeName: target.json.nodes[c.node]?.name, path: c.path,
      interpolation: 'LINEAR', times: result.times, values: c.values,
    })),
  };
}

/**
 * 대상 몸 문서에 옮긴 애니메이션을 얹어 새 문서로 — 원래 애니메이션은 버린다.
 * 나뉜 팩에 넣을 때는 gltfWrite 의 motionOnly(body, animationOf(...)) 를 쓴다.
 */
export function withAnimation(target, result, name = 'clip') {
  return appendAnimation(target, animationOf(target, result, name));
}
