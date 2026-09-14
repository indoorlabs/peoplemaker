// URDF 로봇 → 리그 · 몸 · 함수 생성 클립 — **순수 층**.
//
// 파일을 읽지 않는다 (STL 바이트는 부르는 쪽이 넘긴다 — scripts/make-g1-pack.mjs).
// 여기 있는 것은 "URDF 가 말하는 관절 사슬을 glTF 뼈대로 옮기고, 그 관절을
// 함수로 움직여 GLB 를 만드는" 일뿐이다. 기준 팩(fixtureRig.mjs)과 같은 자리에
// 같은 이유로 있다: **정답을 아는 클립**이라야 재는 쪽이 그것을 되찾는지 볼 수
// 있다.
//
// ## 왜 사람 동작을 옮기지 않는가
//
// Rocketbox 는 사람의 모션 캡처다. 그것을 로봇 관절에 씌우면 관절 한계가 달라
// 무릎이 안 꺾이는 데를 꺾고, 그림은 그럴듯한데 **거짓**이 된다. 그래서
// 걷기·서기·손 뻗기를 관절 함수로 만든다 (docs/plan-humanoid-ko.md §4).
// 그림이 아니라 발자국이다 — 발이 언제 닿고 손이 어디까지 가는지는 재서 적힌다.
//
// ## 축
//
// URDF 는 x 앞 · y 왼 · z 위, glTF 는 y 위. 이 저장소의 사람들은 -Z 나 +Z 를
// 보고 있고 어느 쪽인지는 팩이 **재서**(forwardRad) 갖는다. 그래서 오른손
// 좌표계를 지키는 가장 단순한 치환을 쓴다: (x, y, z) → (y, z, x). 로봇은 +Z 를
// 보게 되고, 걷는 클립을 재면 forwardRad 가 0 으로 나온다.

import { encodeGLB } from './gltfWrite.mjs';

/** URDF (x 앞 · y 왼 · z 위) → glTF (x 왼 · y 위 · z 앞). 행렬식 +1 인 치환이다. */
export const toGltf = ([x, y, z]) => [y, z, x];

// ── URDF 읽기 ─────────────────────────────────────────────────────

const nums = (s) => s.trim().split(/\s+/).map(Number);
const attrOf = (tag, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};
const originOf = (block) => {
  const o = /<origin\s+([^>]*?)\/?>/.exec(block);
  return {
    xyz: o && attrOf(o[1], 'xyz') ? nums(attrOf(o[1], 'xyz')) : [0, 0, 0],
    rpy: o && attrOf(o[1], 'rpy') ? nums(attrOf(o[1], 'rpy')) : [0, 0, 0],
  };
};

/**
 * URDF 글을 읽는다 — 링크와 관절만. 의존성 없이 정규식으로 읽는다.
 *
 * `<joint name="…" type="fixed" dont_collapse="true">` 처럼 속성이 더 붙은
 * 것도 읽는다 — 처음에 `type="…">` 로 끝나는 것만 잡아서 고무손 둘이 빠졌다.
 */
export function parseURDF(text) {
  const links = [];
  for (const m of text.matchAll(/<link\s+name="([^"]+)"\s*(?:\/>|>([\s\S]*?)<\/link>)/g)) {
    const [, name, body = ''] = m;
    const visuals = [];
    for (const v of body.matchAll(/<visual>([\s\S]*?)<\/visual>/g)) {
      const mesh = /<mesh\s+([^>]*?)\/?>/.exec(v[1]);
      if (!mesh) continue;
      const scale = attrOf(mesh[1], 'scale');
      visuals.push({ file: attrOf(mesh[1], 'filename'), scale: scale ? nums(scale) : [1, 1, 1], ...originOf(v[1]) });
    }
    const mass = /<mass\s+value="([^"]+)"/.exec(body);
    links.push({ name, visuals, massKg: mass ? +mass[1] : 0 });
  }
  const joints = [];
  for (const m of text.matchAll(/<joint\s+([^>]*)>([\s\S]*?)<\/joint>/g)) {
    const [, head, body] = m;
    const axis = /<axis\s+xyz="([^"]+)"/.exec(body);
    const limit = /<limit\s+([^>]*?)\/?>/.exec(body);
    joints.push({
      name: attrOf(head, 'name'),
      type: attrOf(head, 'type'),
      parent: /<parent\s+link="([^"]+)"/.exec(body)?.[1],
      child: /<child\s+link="([^"]+)"/.exec(body)?.[1],
      ...originOf(body),
      axis: axis ? nums(axis[1]) : null,
      limit: limit ? { lower: +attrOf(limit[1], 'lower'), upper: +attrOf(limit[1], 'upper') } : null,
    });
  }
  return { links, joints };
}

// ── STL 읽기 ──────────────────────────────────────────────────────

/**
 * STL → { position, normal, index } (면마다 꼭짓점 셋 — 안 잇는다).
 *
 * 이진과 글자 둘 다 읽는다. 법선은 파일의 면 법선을 꼭짓점 셋에 그대로 준다 —
 * 법선이 없으면 three 의 기본 재료가 까맣게 그린다 (기준 팩에서 겪었다).
 */
export function parseSTL(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = new TextDecoder().decode(u8.subarray(0, Math.min(300, u8.length)));
  if (/^\s*solid/.test(head) && /facet/.test(head)) {
    const text = new TextDecoder().decode(u8);
    const pos = [];
    const nrm = [];
    let n = [0, 0, 0];
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t.startsWith('facet normal')) n = nums(t.slice(12));
      else if (t.startsWith('vertex')) { pos.push(...nums(t.slice(6))); nrm.push(...n); }
    }
    return { position: Float32Array.from(pos), normal: Float32Array.from(nrm), index: Uint32Array.from(pos.map((_, i) => i).slice(0, pos.length / 3)) };
  }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const count = dv.getUint32(80, true);
  const pos = new Float32Array(count * 9);
  const nrm = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    const o = 84 + i * 50;
    const nx = dv.getFloat32(o, true), ny = dv.getFloat32(o + 4, true), nz = dv.getFloat32(o + 8, true);
    for (let v = 0; v < 3; v++) {
      const p = o + 12 + v * 12;
      pos.set([dv.getFloat32(p, true), dv.getFloat32(p + 4, true), dv.getFloat32(p + 8, true)], i * 9 + v * 3);
      nrm.set([nx, ny, nz], i * 9 + v * 3);
    }
  }
  const index = new Uint32Array(count * 3);
  for (let i = 0; i < index.length; i++) index[i] = i;
  return { position: pos, normal: nrm, index };
}

// ── 사원수 (glTF 규약 [x, y, z, w]) ────────────────────────────────

export const qAxis = (axis, rad) => {
  const s = Math.sin(rad / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(rad / 2)];
};
export function qMul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
export function qRotate(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}
/** URDF 의 rpy(고정축 X→Y→Z) → glTF 축의 사원수. 이 저장소의 G1 은 전부 0 이다. */
export function qFromRpy([r, p, y]) {
  // 각 축을 glTF 축으로 옮긴 뒤 같은 차례로 곱한다: Rz(y)·Ry(p)·Rx(r) (고정축).
  const qx = qAxis(toGltf([1, 0, 0]), r);
  const qy = qAxis(toGltf([0, 1, 0]), p);
  const qz = qAxis(toGltf([0, 0, 1]), y);
  return qMul(qz, qMul(qy, qx));
}
const Q_ID = [0, 0, 0, 1];

// ── 리그 ─────────────────────────────────────────────────────────

/**
 * URDF → 뼈대. 뿌리 링크부터 깊이 우선으로 번호를 매긴다 (부모가 늘 앞에 온다).
 *
 * 노드 이름 = **링크 이름**. glTF 노드는 링크의 좌표계이고, 관절은 그 노드의
 * 회전이다 (URDF 에서 자식 링크의 좌표계는 관절 좌표계와 같다).
 *
 * @returns { nodes: [{ name, parent, t, q, axis, type, limit, joint }], idx: Map }
 */
export function robotRig(urdf, { root = 'pelvis' } = {}) {
  const byChild = new Map(urdf.joints.map((j) => [j.child, j]));
  const kids = new Map();
  for (const j of urdf.joints) {
    if (!kids.has(j.parent)) kids.set(j.parent, []);
    kids.get(j.parent).push(j);
  }
  const nodes = [];
  const idx = new Map();
  const visit = (link, parent) => {
    const j = byChild.get(link);
    const i = nodes.length;
    idx.set(link, i);
    nodes.push({
      name: link,
      parent,
      t: parent == null ? [0, 0, 0] : toGltf(j.xyz),
      q: parent == null ? Q_ID : qFromRpy(j.rpy),
      axis: j?.axis ? toGltf(j.axis) : null,
      type: parent == null ? 'root' : j.type,
      limit: j?.limit || null,
      joint: j?.name || null,
    });
    for (const c of kids.get(link) || []) visit(c.child, i);
  };
  visit(root, null);
  return { nodes, idx };
}

/**
 * 순운동학 — 관절 각(라디안, 링크 이름 → 각)과 뿌리 이동으로 노드마다
 * 세계 위치·회전을 낸다. 게이트가 **glTF 를 안 거치고** 카탈로그의 잰 값과
 * 견줄 때 쓴다 (같은 코드로 두 번 재면 같은 실수를 두 번 한다).
 */
export function fk(rig, angles = {}, rootT = [0, 0, 0]) {
  const pos = [];
  const rot = [];
  rig.nodes.forEach((n, i) => {
    const local = n.axis && angles[n.name] ? qMul(n.q, qAxis(n.axis, angles[n.name])) : n.q;
    if (n.parent == null) { pos[i] = [...rootT]; rot[i] = local; return; }
    const pr = rot[n.parent];
    const pp = pos[n.parent];
    const d = qRotate(pr, n.t);
    pos[i] = [pp[0] + d[0], pp[1] + d[1], pp[2] + d[2]];
    rot[i] = qMul(pr, local);
  });
  return { pos, rot };
}

/**
 * 발바닥 노드를 더한다 — **발목이 아니라 발바닥이다.** Biped 에서 겪은 것과
 * 같다: 발목 뼈는 땅에서 몇 cm 떠 있어 접촉 문턱을 못 넘는다. 발목 링크의
 * 살에서 가장 낮은 점을 재서 그 자리에 노드를 둔다.
 *
 * @param soleOf (linkName) => [x, y, z] 발목 링크 좌표계에서의 발바닥 점 (glTF 축)
 */
export function withSoles(rig, ankles, soleOf) {
  for (const [ankle, name] of ankles) {
    const p = rig.idx.get(ankle);
    if (p == null) throw new Error(`발목 링크 ${ankle} 가 리그에 없다`);
    const i = rig.nodes.length;
    rig.nodes.push({ name, parent: p, t: soleOf(ankle), q: Q_ID, axis: null, type: 'fixed', limit: null, joint: null });
    rig.idx.set(name, i);
  }
  return rig;
}

// ── 클립 정의 — 관절 함수 ──────────────────────────────────────────
//
// 값을 여기서 정하고, 재는 쪽이 되찾아야 한다 (기준 팩과 같은 규약).

/**
 * 걷는 속도는 **빌린 값**이다. Unitree 의 데이터시트(unitree.com/g1)는 이
 * 기계에서 열리지 않았다 (2026-09-14). 기준 팩의 1.35 m/s(한국 성인 평균
 * 보행속도대)를 그대로 쓰고, 로봇의 값이 오면 여기 하나만 바꾼다 — 걸음 폭은
 * 속도와 주기에서 계산되므로 따라온다.
 */
export const ROBOT_CLIPS = [
  { id: 'idle', durationS: 4.0, speedMps: 0, kind: 'idle' },
  { id: 'walk-forward', durationS: 0.8, speedMps: 1.35, cycles: 1, kind: 'walk' },
  { id: 'reach', durationS: 2.4, speedMps: 0, kind: 'reach' },
];

/** G1 의 관절 이름 — 링크 이름으로 부른다 (노드 = 링크). */
export const G1 = {
  root: 'pelvis',
  hip: { L: 'left_hip_pitch_link', R: 'right_hip_pitch_link' },
  knee: { L: 'left_knee_link', R: 'right_knee_link' },
  ankle: { L: 'left_ankle_pitch_link', R: 'right_ankle_pitch_link' },
  ankleRoll: { L: 'left_ankle_roll_link', R: 'right_ankle_roll_link' },
  sole: { L: 'left_sole', R: 'right_sole' },
  shoulder: { L: 'left_shoulder_pitch_link', R: 'right_shoulder_pitch_link' },
  shoulderRoll: { L: 'left_shoulder_roll_link', R: 'right_shoulder_roll_link' },
  elbow: { L: 'left_elbow_link', R: 'right_elbow_link' },
  hand: { L: 'left_wrist_yaw_link', R: 'right_wrist_yaw_link' },
  waist: 'torso_link',
  eye: 'd435_link',
};

const smooth = (s) => { const c = Math.min(1, Math.max(0, s)); return c * c * (3 - 2 * c); };

/**
 * 서 있을 때 뿌리(골반)가 땅에서 얼마나 높은가 — 발바닥이 y = 0 에 닿도록.
 * 재서 정한다: 관절 각 0 으로 FK 를 돌려 발바닥 노드의 y 를 본다.
 */
export function standingRootY(rig) {
  const { pos } = fk(rig, {}, [0, 0, 0]);
  const soles = [G1.sole.L, G1.sole.R].map((n) => pos[rig.idx.get(n)][1]);
  return -Math.min(...soles);
}

/** 엉덩이 관절에서 발바닥까지의 세로 거리 (m) — 걸음 폭을 속도에서 계산할 때 쓴다. */
export function legLengthM(rig) {
  const { pos } = fk(rig, {}, [0, 0, 0]);
  return pos[rig.idx.get(G1.hip.L)][1] - pos[rig.idx.get(G1.sole.L)][1];
}

/**
 * 시각 t 의 관절 각과 뿌리 이동.
 *
 * ## 걷기
 * 엉덩이 pitch 는 사인, 무릎은 앞으로 흔드는 동안만 접힌다(발을 든다), 발목은
 * 엉덩이+무릎을 되감아 발바닥을 땅과 나란히 둔다. 팔은 반대쪽 다리와 함께.
 * 엉덩이 진폭 A 는 **속도에서 계산한다**: 한 주기에 두 걸음, 한 걸음 ≈ 2·L·sin A.
 * 그래서 속도를 바꾸면 걸음 폭이 따라오고, 재는 쪽은 뿌리 이동으로 속도를 되찾는다.
 *
 * URDF 의 부호: y 축 양의 회전은 앞으로 뻗은 것을 아래로 돌린다 — 다리가 앞으로
 * 나가려면 엉덩이 pitch 가 **음수**, 무릎이 접히려면 **양수**다 (URDF 한계도
 * 무릎을 [-0.087, 2.88] 로 두고 있다).
 */
export function poseAt(spec, t, rig) {
  const a = {};
  const u = t / spec.durationS;
  const y0 = standingRootY(rig);
  let root = [0, y0, 0];
  if (spec.kind === 'walk') {
    const L = legLengthM(rig);
    const stride = spec.speedMps * spec.durationS / (2 * (spec.cycles || 1));   // 한 걸음 (m)
    const A = Math.asin(Math.min(0.95, stride / (2 * L)));
    const K = 0.9;
    const S = 0.35;
    const ph = 2 * Math.PI * (spec.cycles || 1) * u;
    const hipL = -A * Math.sin(ph), hipR = -A * Math.sin(ph + Math.PI);
    const kneeL = K * Math.max(0, Math.cos(ph)), kneeR = K * Math.max(0, Math.cos(ph + Math.PI));
    a[G1.hip.L] = hipL; a[G1.hip.R] = hipR;
    a[G1.knee.L] = kneeL; a[G1.knee.R] = kneeR;
    // 발목은 엉덩이만 되감는다 (디딘 발이 땅과 나란히). 무릎까지 다 되감았더니
    // 접는 동안 발목이 -0.985rad 가 되어 URDF 한계 -0.873 을 넘었다 — 게이트가
    // 잡았다. 공중의 발은 나란할 필요가 없으니 무릎은 반만 되감는다.
    a[G1.ankle.L] = -(hipL + 0.5 * kneeL); a[G1.ankle.R] = -(hipR + 0.5 * kneeR);
    a[G1.shoulder.L] = S * Math.sin(ph); a[G1.shoulder.R] = -S * Math.sin(ph);
    a[G1.elbow.L] = 0.25; a[G1.elbow.R] = 0.25;
    // 뿌리: 앞(+Z)으로 속도 × 시간. 위아래는 걸음마다 조금 (재는 쪽이 넘기는 흔들림).
    root = [0, y0 + 0.01 * Math.cos(2 * ph), spec.speedMps * t];
  } else if (spec.kind === 'idle') {
    a[G1.waist] = 0.01 * Math.sin(2 * Math.PI * u);
    a[G1.elbow.L] = 0.25; a[G1.elbow.R] = 0.25;
  } else if (spec.kind === 'reach') {
    // 올린다(0~1.0s) · 든다(1.0~1.6s) · 내린다(1.6~2.4s). 오른팔.
    const e = t < 1.0 ? smooth(t / 1.0) : t < 1.6 ? 1 : 1 - smooth((t - 1.6) / 0.8);
    a[G1.shoulder.R] = -1.3 * e;
    a[G1.shoulderRoll.R] = -0.15 * e;
    a[G1.elbow.R] = 0.4 * (1 - e) + 0.1;
    a[G1.elbow.L] = 0.25;
    a[G1.waist] = 0.12 * e;
  }
  return { angles: a, root };
}

// ── GLB 쓰기 ───────────────────────────────────────────────────────

class Bin {
  constructor() { this.parts = []; this.len = 0; }
  add(typed) {
    const pad = (4 - (this.len % 4)) % 4;
    if (pad) { this.parts.push(new Uint8Array(pad)); this.len += pad; }
    const off = this.len;
    const u8 = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    this.parts.push(u8);
    this.len += u8.byteLength;
    return { off, len: u8.byteLength };
  }
  concat() {
    const out = new Uint8Array(this.len);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.byteLength; }
    return out;
  }
}

/**
 * 몸 + 클립 하나가 든 GLB.
 *
 * @param rig     robotRig(+withSoles) 결과
 * @param parts   [{ node, position, normal, index }] — 링크마다 살 (링크 좌표계, glTF 축)
 * @param spec    ROBOT_CLIPS 의 하나
 * @param fps     키프레임 수
 */
export function buildRobotGLB(rig, parts, spec, { fps = 30, generator = 'peoplemaker/make-g1-pack' } = {}) {
  const json = {
    asset: { version: '2.0', generator },
    scene: 0, scenes: [{ nodes: [] }],
    nodes: [], meshes: [], skins: [], animations: [], materials: [],
    accessors: [], bufferViews: [], buffers: [],
  };
  const bin = new Bin();
  const minmax = (typed, per) => {
    const min = new Array(per).fill(Infinity), max = new Array(per).fill(-Infinity);
    for (let i = 0; i < typed.length; i += per) for (let c = 0; c < per; c++) { min[c] = Math.min(min[c], typed[i + c]); max[c] = Math.max(max[c], typed[i + c]); }
    return { min, max };
  };
  const acc = (typed, type, componentType, extra = {}) => {
    const { off, len } = bin.add(typed);
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: len, ...(extra.target ? { target: extra.target } : {}) });
    const per = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, count: typed.length / per, type, ...(extra.minmax ? minmax(typed, per) : {}) });
    return json.accessors.length - 1;
  };

  // 뼈 노드 — 바인드 자세는 관절 각 0.
  const bind = fk(rig, {}, [0, standingRootY(rig), 0]);
  rig.nodes.forEach((n, i) => {
    const node = { name: n.name, translation: i === 0 ? bind.pos[0] : n.t };
    if (n.q.some((v, k) => v !== Q_ID[k])) node.rotation = n.q;
    json.nodes.push(node);
  });
  rig.nodes.forEach((n, i) => { if (n.parent != null) (json.nodes[n.parent].children ||= []).push(i); });

  // 살 — 링크마다 강체 스키닝(꼭짓점 하나가 뼈 하나에 100%). 바인드 자리에 놓는다.
  const pos = [], nrm = [], joints = [], weights = [], idxs = [];
  for (const part of parts) {
    const j = part.node;
    const wp = bind.pos[j], wq = bind.rot[j];
    const base = pos.length / 3;
    for (let i = 0; i < part.position.length; i += 3) {
      const p = qRotate(wq, [part.position[i], part.position[i + 1], part.position[i + 2]]);
      pos.push(wp[0] + p[0], wp[1] + p[1], wp[2] + p[2]);
      const nn = qRotate(wq, [part.normal[i], part.normal[i + 1], part.normal[i + 2]]);
      nrm.push(nn[0], nn[1], nn[2]);
      joints.push(j, 0, 0, 0);
      weights.push(1, 0, 0, 0);
    }
    for (let i = 0; i < part.index.length; i++) idxs.push(base + part.index[i]);
  }
  // 역바인드 — 바인드 세계 변환의 역. 회전이 있으면 그것도 되돌린다.
  const ibm = new Float32Array(rig.nodes.length * 16);
  rig.nodes.forEach((_, i) => {
    const [x, y, z, w] = bind.rot[i];
    // 회전 행렬 (열 우선) 의 전치 = 역회전
    const r = [
      1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
    ]; // 행 우선 R
    const p = bind.pos[i];
    // inv = [Rᵀ | -Rᵀp]
    const tx = -(r[0] * p[0] + r[3] * p[1] + r[6] * p[2]);
    const ty = -(r[1] * p[0] + r[4] * p[1] + r[7] * p[2]);
    const tz = -(r[2] * p[0] + r[5] * p[1] + r[8] * p[2]);
    ibm.set([r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, tx, ty, tz, 1], i * 16);
  });

  const aPos = acc(new Float32Array(pos), 'VEC3', 5126, { minmax: true, target: 34962 });
  const aNrm = acc(new Float32Array(nrm), 'VEC3', 5126, { target: 34962 });
  const aJoint = acc(new Uint16Array(joints), 'VEC4', 5123, { target: 34962 });
  const aWeight = acc(new Float32Array(weights), 'VEC4', 5126, { target: 34962 });
  const aIdx = acc(new Uint32Array(idxs), 'SCALAR', 5125, { target: 34963 });
  const aIbm = acc(ibm, 'MAT4', 5126);
  json.materials.push({ name: 'body', pbrMetallicRoughness: { baseColorFactor: [0.82, 0.83, 0.85, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } });
  json.meshes.push({ name: 'body', primitives: [{ attributes: { POSITION: aPos, NORMAL: aNrm, JOINTS_0: aJoint, WEIGHTS_0: aWeight }, indices: aIdx, material: 0 }] });
  json.skins.push({ inverseBindMatrices: aIbm, joints: rig.nodes.map((_, i) => i), skeleton: 0 });
  json.nodes.push({ name: 'body', mesh: 0, skin: 0 });
  json.scenes[0].nodes = [0, json.nodes.length - 1];

  // 애니메이션 — 뿌리 이동 + 움직이는 관절의 회전.
  const n = Math.round(spec.durationS * fps);
  const times = [];
  for (let i = 0; i <= n; i++) times.push(+(spec.durationS * (i / n)).toFixed(4));
  const rootT = [];
  const rots = new Map();
  for (const t of times) {
    const { angles, root } = poseAt(spec, t, rig);
    rootT.push(root.map((v) => (Math.abs(v) < 1e-9 ? 0 : v)));
    for (const [name, th] of Object.entries(angles)) {
      if (!rots.has(name)) rots.set(name, []);
      const node = rig.nodes[rig.idx.get(name)];
      if (!node?.axis) throw new Error(`${name} 는 회전 관절이 아니다`);
      rots.get(name).push(qMul(node.q, qAxis(node.axis, th)));
    }
  }
  const aTime = acc(new Float32Array(times), 'SCALAR', 5126, { minmax: true });
  const channels = [], samplers = [];
  const push = (node, path, values, per) => {
    const a = acc(new Float32Array(values.flat()), per === 4 ? 'VEC4' : 'VEC3', 5126);
    samplers.push({ input: aTime, output: a, interpolation: 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node, path } });
  };
  push(0, 'translation', rootT, 3);
  for (const [name, vals] of rots) push(rig.idx.get(name), 'rotation', vals, 4);
  json.animations.push({ name: spec.id, channels, samplers });

  const binData = bin.concat();
  json.buffers.push({ byteLength: binData.byteLength });
  return encodeGLB({ json, bin: binData });
}

/** 살 하나의 바운딩 상자 — 발바닥을 재는 데 쓴다. */
export function bboxOf(position) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], position[i + c]); hi[c] = Math.max(hi[c], position[i + c]); }
  return { lo, hi };
}

/** 살을 glTF 축으로 옮기고 시각 원점(xyz·rpy·scale)을 먹인다 — 링크 좌표계에 둔다. */
export function transformPart(mesh, visual) {
  const q = qFromRpy(visual.rpy);
  const o = toGltf(visual.xyz);
  const s = visual.scale;
  const position = new Float32Array(mesh.position.length);
  const normal = new Float32Array(mesh.normal.length);
  for (let i = 0; i < mesh.position.length; i += 3) {
    const v = toGltf([mesh.position[i] * s[0], mesh.position[i + 1] * s[1], mesh.position[i + 2] * s[2]]);
    const r = qRotate(q, v);
    position.set([r[0] + o[0], r[1] + o[1], r[2] + o[2]], i);
    const nn = qRotate(q, toGltf([mesh.normal[i], mesh.normal[i + 1], mesh.normal[i + 2]]));
    normal.set(nn, i);
  }
  return { position, normal, index: mesh.index };
}
