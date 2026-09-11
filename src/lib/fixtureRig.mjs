// 기준 리그와 합성 클립 — **순수 층**.
//
// 파일을 쓰지 않는다 (그것은 scripts/make-fixture-pack.mjs 의 일이다). 여기
// 있는 것은 "뼈 몇 개짜리 사람이 이렇게 움직이는 GLB" 를 메모리에서 만드는
// 함수뿐이고, 그래서 **브라우저에서도 돈다** — 데모가 뼈 수를 흔들어 가며
// 재려면 그래야 한다.
//
// 왜 합성인가. Mixamo 클립은 계정으로 받아야 하고 재배포가 금지된다. 그러면
// 저장소에 실물이 하나도 없고, 계약과 측정 도구는 "돌려 본 적 없는 코드" 로
// 남는다. 함수가 만든 클립은 라이선스가 안 걸리고, 무엇보다 **정답을 안다** —
// 속도 1.35 로 만들었으면 재서 1.35 가 나와야 한다.
//
// 사람의 모션 캡처가 아니다. 뼈 이름만 Mixamo 규약을 따른다 — 나중에 진짜
// Mixamo 클립이 들어올 때 **같은 경로**가 이미 검사돼 있게 하려는 것이다.

// ── 리그 ─────────────────────────────────────────────────────────
//
// 부모로부터의 상대 위치 (m). Y 위, -Z 앞 (glTF 규약).
const RIG = [
  { name: 'mixamorig:Hips', t: [0, 0.95, 0], parent: null },
  { name: 'mixamorig:Spine', t: [0, 0.25, 0], parent: 'mixamorig:Hips' },
  { name: 'mixamorig:Head', t: [0, 0.35, 0], parent: 'mixamorig:Spine' },
  { name: 'mixamorig:LeftArm', t: [0.18, 0.22, 0], parent: 'mixamorig:Spine' },
  { name: 'mixamorig:RightArm', t: [-0.18, 0.22, 0], parent: 'mixamorig:Spine' },
  { name: 'mixamorig:LeftUpLeg', t: [0.09, -0.05, 0], parent: 'mixamorig:Hips' },
  { name: 'mixamorig:LeftLeg', t: [0, -0.42, 0], parent: 'mixamorig:LeftUpLeg' },
  { name: 'mixamorig:LeftFoot', t: [0, -0.42, 0], parent: 'mixamorig:LeftLeg' },
  { name: 'mixamorig:RightUpLeg', t: [-0.09, -0.05, 0], parent: 'mixamorig:Hips' },
  { name: 'mixamorig:RightLeg', t: [0, -0.42, 0], parent: 'mixamorig:RightUpLeg' },
  { name: 'mixamorig:RightFoot', t: [0, -0.42, 0], parent: 'mixamorig:RightLeg' },
];

/**
 * 뼈 수를 늘린 리그.
 *
 * 기준 리그는 뼈 11개인데 **진짜 Mixamo 리그는 65개**다 (손가락 30개가 그
 * 대부분이다). 사람 하나의 CPU 비용은 뼈 수에 비례하므로, 11개로 잰 값을
 * 그대로 쓰면 실제보다 여섯 배 싸게 본다.
 *
 * 늘리는 뼈는 손끝에 사슬로 단다 — 애니메이션 채널은 안 붙는다. 갱신 비용은
 * 채널이 아니라 **뼈 수**가 정하기 때문이다 (Skeleton.update 는 모든 뼈의
 * 행렬을 만든다).
 */
export function rigWith(boneCount) {
  const rig = RIG.map((b) => ({ ...b }));
  let parent = 'mixamorig:LeftArm';
  let i = 0;
  while (rig.length < boneCount) {
    const name = `mixamorig:Extra${i}`;
    rig.push({ name, t: [0, -0.03, 0], parent });
    parent = i % 3 === 2 ? (i % 6 === 5 ? 'mixamorig:LeftArm' : 'mixamorig:RightArm') : name;
    i++;
  }
  return rig;
}

const idxOf = (name, rig = RIG) => rig.findIndex((b) => b.name === name);

/** x 축 회전 사원수 — 다리를 앞뒤로 흔드는 데만 쓴다. */
const quatX = (rad) => [Math.sin(rad / 2), 0, 0, Math.cos(rad / 2)];

// ── 클립 정의 ────────────────────────────────────────────────────
//
// 값을 여기서 정하고, 재는 쪽이 그 값을 **되찾아야** 한다. 게이트가 그
// 왕복을 검사한다 — 만든 속도와 잰 속도가 다르면 둘 중 하나가 틀렸다.
export const FIXTURES = [
  {
    id: 'walk-forward',
    durationS: 1.2,
    speedMps: 1.35,      // 한국 성인 평균 보행속도대. 이 값이 정답이다.
    cycles: 1,           // 한 클립에 한 걸음 주기 (발 접촉 2회)
    kind: 'walk',
  },
  {
    id: 'walk-inplace',
    durationS: 1.2,
    speedMps: 0,         // 제자리 — 경로를 따라가는 소비처가 쓴다
    cycles: 1,
    kind: 'walk',
  },
  {
    id: 'walk-fast',
    durationS: 1.0,
    speedMps: 1.9,       // 흔들어 보는 값 — 재는 쪽이 따라와야 한다
    cycles: 1,
    kind: 'walk',
  },
  {
    id: 'idle',
    durationS: 4.0,
    speedMps: 0,
    cycles: 0,
    kind: 'idle',
  },
  {
    id: 'sit-down',
    durationS: 2.4,
    speedMps: 0,
    cycles: 0,
    kind: 'sit',
  },
];

/** 클립 하나의 키프레임을 낸다. */
function keyframes(spec) {
  const fps = 30;
  const n = Math.round(spec.durationS * fps);
  const times = [];
  for (let i = 0; i <= n; i++) times.push(+(spec.durationS * (i / n)).toFixed(4));

  const hips = { translation: [], rotation: [] };
  const legs = {
    'mixamorig:LeftUpLeg': [], 'mixamorig:LeftLeg': [],
    'mixamorig:RightUpLeg': [], 'mixamorig:RightLeg': [],
  };

  for (const t of times) {
    const u = t / spec.durationS;               // 0..1
    const ph = 2 * Math.PI * spec.cycles * u;   // 걸음 위상

    if (spec.kind === 'walk') {
      // 앞으로 나아가는 거리 = 속도 × 시간. **이것이 되찾아야 할 값이다.**
      //
      // 어느 쪽으로 가는지도 흔들 수 있어야 한다 — 안 그러면 "방향을 잰다"
      // 는 게이트가 항상 같은 답(-Z)만 보고 통과한다. 기본값 π 는 -Z 라,
      // 지금까지 구운 클립과 한 바이트도 다르지 않다.
      const h = spec.travelRad ?? Math.PI;
      const d = spec.speedMps * t;
      // sin(π) 는 0 이 아니라 1.2e-16 이다. 그대로 두면 구운 GLB 의 바이트가
      // 바뀌어, 아무것도 안 고친 판에서도 diff 가 뜬다.
      const snap = (v) => (Math.abs(v) < 1e-9 ? 0 : v);
      const x = snap(d * Math.sin(h));
      const z = snap(d * Math.cos(h));
      // **엉덩이 높이가 발이 땅에 닿는지를 정한다.** 다리 사슬이
      // 0.05+0.42+0.42 = 0.89m 라, 0.95 에 두면 다리를 곧게 펴도 발이 6cm
      // 떠 있다 — 그 높이로 만든 첫 판에서 걸음의 접촉이 0회로 나왔다.
      // 0.90 으로 낮추면 곧게 편 다리의 발이 1cm 에 닿는다.
      const bob = 0.02 * Math.cos(2 * ph);      // 걸을 때 위아래
      hips.translation.push([x, 0.90 + bob, z]);
      hips.rotation.push([0, 0, 0, 1]);
      // 넓적다리는 서로 반대 위상, 종아리는 접힌다
      legs['mixamorig:LeftUpLeg'].push(quatX(0.5 * Math.sin(ph)));
      legs['mixamorig:RightUpLeg'].push(quatX(0.5 * Math.sin(ph + Math.PI)));
      legs['mixamorig:LeftLeg'].push(quatX(-0.5 * Math.max(0, Math.sin(ph - 0.6))));
      legs['mixamorig:RightLeg'].push(quatX(-0.5 * Math.max(0, Math.sin(ph + Math.PI - 0.6))));
    } else if (spec.kind === 'idle') {
      hips.translation.push([0, 0.90 + 0.008 * Math.sin(2 * Math.PI * u), 0]);
      hips.rotation.push(quatX(0.01 * Math.sin(2 * Math.PI * u)));
      for (const k of Object.keys(legs)) legs[k].push([0, 0, 0, 1]);
    } else {
      // 앉기 — 엉덩이가 내려가고 넓적다리가 접힌다. 0.75 지점에서 앉는다.
      const s = Math.min(1, u / 0.75);
      const ease = s * s * (3 - 2 * s);
      hips.translation.push([0, 0.90 - 0.5 * ease, 0.1 * ease]);
      hips.rotation.push(quatX(0.15 * ease));
      legs['mixamorig:LeftUpLeg'].push(quatX(-1.4 * ease));
      legs['mixamorig:RightUpLeg'].push(quatX(-1.4 * ease));
      legs['mixamorig:LeftLeg'].push(quatX(1.4 * ease));
      legs['mixamorig:RightLeg'].push(quatX(1.4 * ease));
    }
  }
  return { times, hips, legs };
}

// ── GLB 쓰기 ─────────────────────────────────────────────────────

class Bin {
  constructor() { this.parts = []; this.len = 0; }
  add(typed) {
    // 4바이트 정렬 — 안 맞추면 뷰어가 접근자를 못 읽는다.
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

export function buildGLB(spec) {
  const RIG_ = spec.bones ? rigWith(spec.bones) : RIG;
  const { times, hips, legs } = keyframes(spec);
  const json = {
    asset: { version: '2.0', generator: 'peoplemaker/make-fixture-pack' },
    scene: 0, scenes: [{ nodes: [] }],
    nodes: [], meshes: [], skins: [], animations: [],
    accessors: [], bufferViews: [], buffers: [],
  };
  const bin = new Bin();
  const acc = (typed, type, componentType, extra = {}) => {
    const { off, len } = bin.add(typed);
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: len, ...(extra.target ? { target: extra.target } : {}) });
    const per = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    json.accessors.push({
      bufferView: json.bufferViews.length - 1, componentType, count: typed.length / per, type,
      ...(extra.minmax ? minmax(typed, per) : {}),
    });
    return json.accessors.length - 1;
  };
  const minmax = (typed, per) => {
    const min = new Array(per).fill(Infinity);
    const max = new Array(per).fill(-Infinity);
    for (let i = 0; i < typed.length; i += per) {
      for (let c = 0; c < per; c++) {
        min[c] = Math.min(min[c], typed[i + c]);
        max[c] = Math.max(max[c], typed[i + c]);
      }
    }
    return { min, max };
  };

  // 뼈 노드
  for (const b of RIG_) json.nodes.push({ name: b.name, translation: b.t });
  RIG_.forEach((b, i) => {
    if (b.parent == null) return;
    const p = idxOf(b.parent, RIG_);
    (json.nodes[p].children ||= []).push(i);
  });

  // 살 — 뼈마다 상자 하나. 강체 스키닝(꼭짓점 하나가 뼈 하나에 100%)이라
  // 살가죽은 안 늘어나지만, **스킨 애니메이션 경로는 진짜**다.
  const pos = [];
  const nrm = [];
  const joints = [];
  const weights = [];
  const idxs = [];
  // 면마다 꼭짓점을 따로 둔다 — **법선을 주려면 그래야 한다.**
  //
  // 처음에는 꼭짓점 8개를 여섯 면이 나눠 썼다. 그러면 법선을 면마다 못 주고,
  // 법선이 없으면 three 의 기본 재료가 사람을 **까맣게** 그린다 (화면으로
  // 확인하다 알았다). 진짜 클립에는 법선이 다 있으므로, 없는 채로 두면
  // 인스턴싱 셰이더의 버그도 여기서 안 드러난다.
  const FACES = [
    { n: [0, 1, 0], v: [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]] },
    { n: [0, -1, 0], v: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] },
    { n: [0, 0, 1], v: [[-1, 0, 1], [1, 0, 1], [1, -1, 1], [-1, -1, 1]] },
    { n: [0, 0, -1], v: [[1, 0, -1], [-1, 0, -1], [-1, -1, -1], [1, -1, -1]] },
    { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, -1], [1, -1, -1], [1, -1, 1]] },
    { n: [-1, 0, 0], v: [[-1, 0, -1], [-1, 0, 1], [-1, -1, 1], [-1, -1, -1]] },
  ];
  RIG_.forEach((b, j) => {
    const w = b.name.includes('Hips') || b.name.includes('Spine') ? 0.11 : 0.05;
    const h = b.name.includes('Foot') ? 0.06 : 0.34;
    for (const face of FACES) {
      const base = pos.length / 3;
      for (const [sx, sy, sz] of face.v) {
        pos.push(sx * w, sy * h, sz * w * 0.7);
        nrm.push(face.n[0], face.n[1], face.n[2]);
        joints.push(j, 0, 0, 0);
        weights.push(1, 0, 0, 0);
      }
      idxs.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });

  // 역바인드 — 바인드 자세에서 뼈의 세계 변환의 역. 상대 위치를 누적한다.
  const world = RIG_.map((b) => {
    let t = [...b.t];
    let cur = b.parent;
    while (cur != null) {
      const p = RIG_[idxOf(cur, RIG_)];
      t = [t[0] + p.t[0], t[1] + p.t[1], t[2] + p.t[2]];
      cur = p.parent;
    }
    return t;
  });
  const ibm = new Float32Array(RIG_.length * 16);
  world.forEach((t, i) => {
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -t[0], -t[1], -t[2], 1];
    ibm.set(m, i * 16);
  });

  const aPos = acc(new Float32Array(pos), 'VEC3', 5126, { minmax: true, target: 34962 });
  const aNrm = acc(new Float32Array(nrm), 'VEC3', 5126, { target: 34962 });
  const aJoint = acc(new Uint8Array(joints), 'VEC4', 5121, { target: 34962 });
  const aWeight = acc(new Float32Array(weights), 'VEC4', 5126, { target: 34962 });
  const aIdx = acc(new Uint16Array(idxs), 'SCALAR', 5123, { target: 34963 });
  const aIbm = acc(ibm, 'MAT4', 5126);

  // **재질을 넣는다.**
  //
  // 안 넣으면 glTF 의 기본값이 쓰이는데, 그 기본값은 metallicFactor 1 이다 —
  // 환경맵이 없는 장면에서 완전 금속은 **까맣게** 그려진다. 법선을 넣고도
  // 사람이 검길래 찾아보고 알았다. 진짜 클립에는 재질이 있으므로, 없는 채로
  // 두면 픽스처만 이상하게 보이고 원인을 딴 데서 찾게 된다.
  json.materials = [{
    name: 'body',
    pbrMetallicRoughness: {
      baseColorFactor: [0.72, 0.75, 0.80, 1],
      metallicFactor: 0,
      roughnessFactor: 0.9,
    },
  }];

  json.meshes.push({
    name: 'body',
    primitives: [{
      attributes: { POSITION: aPos, NORMAL: aNrm, JOINTS_0: aJoint, WEIGHTS_0: aWeight },
      indices: aIdx,
      material: 0,
    }],
  });
  json.skins.push({ inverseBindMatrices: aIbm, joints: RIG_.map((_, i) => i), skeleton: 0 });
  json.nodes.push({ name: 'body', mesh: 0, skin: 0 });
  json.scenes[0].nodes = [0, json.nodes.length - 1];

  // 애니메이션
  const aTime = acc(new Float32Array(times), 'SCALAR', 5126, { minmax: true });
  const channels = [];
  const samplers = [];
  const push = (node, path, values, per) => {
    const a = acc(new Float32Array(values.flat()), per === 4 ? 'VEC4' : 'VEC3', 5126);
    samplers.push({ input: aTime, output: a, interpolation: 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node, path } });
  };
  push(idxOf('mixamorig:Hips', RIG_), 'translation', hips.translation, 3);
  push(idxOf('mixamorig:Hips', RIG_), 'rotation', hips.rotation, 4);
  for (const [name, vals] of Object.entries(legs)) push(idxOf(name, RIG_), 'rotation', vals, 4);
  json.animations.push({ name: spec.id, channels, samplers });

  const binData = bin.concat();
  json.buffers.push({ byteLength: binData.byteLength });

  // 컨테이너
  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jsonPad) {
    const p = new Uint8Array(jsonBytes.byteLength + jsonPad).fill(0x20);
    p.set(jsonBytes); jsonBytes = p;
  }
  const binPad = (4 - (binData.byteLength % 4)) % 4;
  const total = 12 + 8 + jsonBytes.byteLength + 8 + binData.byteLength + binPad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const binStart = 20 + jsonBytes.byteLength;
  dv.setUint32(binStart, binData.byteLength + binPad, true);
  dv.setUint32(binStart + 4, 0x004e4942, true);
  out.set(binData, binStart + 8);
  return out;
}
