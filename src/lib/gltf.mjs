// glTF/GLB 읽기 — 필요한 만큼만.
//
// 왜 라이브러리를 안 쓰는가: 이 층은 **순수 층**이라 three.js 를 import 하지
// 않는다 (three 를 끌어오면 게이트가 브라우저를 필요로 하게 된다). 그리고
// 여기서 필요한 것은 GLB 컨테이너와 애니메이션 샘플러뿐이다 — 재질도
// 텍스처도 안 본다.
//
// 이 파일이 하는 일은 하나다: **클립에서 값을 잰다.** 길이·이동 속도·발
// 접촉을 사람이 손으로 적지 않게 하는 것이 계약의 요점이기 때문이다
// (docs/plan-peoplemaker-ko.md §2).

const MAGIC = 0x46546c67;   // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const COMPONENT = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
};

const COMPONENTS_PER = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/**
 * GLB 를 연다.
 *
 * @param buf Uint8Array | ArrayBuffer
 * @returns { json, bin }  bin 은 Uint8Array 또는 null
 */
export function parseGLB(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < 12) throw new Error('GLB 가 너무 짧다');
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('GLB 마법수가 아니다');
  const version = dv.getUint32(4, true);
  if (version !== 2) throw new Error(`GLB 판이 ${version} 이다 — 2 만 읽는다`);
  const total = dv.getUint32(8, true);
  if (total !== u8.byteLength) {
    // 길이가 안 맞으면 자른 파일이다. 조용히 읽으면 뒤쪽 접근자가 쓰레기를 준다.
    throw new Error(`머리말 길이 ${total} 와 실제 ${u8.byteLength} 가 다르다`);
  }

  let off = 12;
  let json = null;
  let bin = null;
  while (off + 8 <= u8.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > u8.byteLength) throw new Error('덩어리가 파일 밖으로 나간다');
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(u8.subarray(start, start + len)));
    else if (type === CHUNK_BIN) bin = u8.subarray(start, start + len);
    off = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error('JSON 덩어리가 없다');
  return { json, bin };
}

/** 접근자 하나를 배열로. 값이 아니라 **파일에 적힌 것**을 그대로 돌려준다. */
export function readAccessor({ json, bin }, index) {
  const acc = json.accessors?.[index];
  if (!acc) throw new Error(`접근자 ${index} 가 없다`);
  const comp = COMPONENT[acc.componentType];
  if (!comp) throw new Error(`모르는 componentType ${acc.componentType}`);
  const per = COMPONENTS_PER[acc.type];
  if (!per) throw new Error(`모르는 type ${acc.type}`);
  const bv = json.bufferViews?.[acc.bufferView];
  if (!bv) throw new Error(`접근자 ${index} 에 bufferView 가 없다 — 성긴 접근자는 안 읽는다`);
  if (!bin) throw new Error('BIN 덩어리가 없다');

  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const count = acc.count * per;
  const stride = bv.byteStride;
  const out = new comp.array(count);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const get = (o) => {
    switch (acc.componentType) {
      case 5120: return dv.getInt8(o);
      case 5121: return dv.getUint8(o);
      case 5122: return dv.getInt16(o, true);
      case 5123: return dv.getUint16(o, true);
      case 5125: return dv.getUint32(o, true);
      default: return dv.getFloat32(o, true);
    }
  };
  for (let i = 0; i < acc.count; i++) {
    const rowOff = base + (stride ? i * stride : i * per * comp.size);
    for (let c = 0; c < per; c++) out[i * per + c] = get(rowOff + c * comp.size);
  }
  return out;
}

// ── 애니메이션을 시각으로 ────────────────────────────────────────

/** 이 애니메이션의 길이 (s) — 모든 샘플러 입력의 최대. */
export function animationDurationS(doc, animIndex = 0) {
  const anim = doc.json.animations?.[animIndex];
  if (!anim) return 0;
  let max = 0;
  for (const s of anim.samplers) {
    const t = readAccessor(doc, s.input);
    if (t.length) max = Math.max(max, t[t.length - 1]);
  }
  return max;
}

const lerp = (a, b, t) => a + (b - a) * t;

/** 두 사원수 사이 — 최단호. 부호를 안 맞추면 걷다가 한 번씩 홱 돈다. */
function slerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (dot < 0) { bb = [-b[0], -b[1], -b[2], -b[3]]; dot = -dot; }
  if (dot > 0.9995) {
    const o = [lerp(a[0], bb[0], t), lerp(a[1], bb[1], t), lerp(a[2], bb[2], t), lerp(a[3], bb[3], t)];
    const n = Math.hypot(...o) || 1;
    return o.map((v) => v / n);
  }
  const th0 = Math.acos(dot);
  const th = th0 * t;
  const s0 = Math.sin(th0 - th) / Math.sin(th0);
  const s1 = Math.sin(th) / Math.sin(th0);
  return [a[0] * s0 + bb[0] * s1, a[1] * s0 + bb[1] * s1, a[2] * s0 + bb[2] * s1, a[3] * s0 + bb[3] * s1];
}

/**
 * 애니메이션을 시각 t 에서 풀어 노드마다의 TRS 로.
 *
 * STEP·CUBICSPLINE 은 안 읽는다 — 이 저장소가 내보내는 팩은 LINEAR 다.
 * 모르는 보간을 조용히 LINEAR 로 읽으면 잰 값이 파일과 달라진다.
 */
export function sampleAnimation(doc, animIndex, timeS) {
  const anim = doc.json.animations?.[animIndex];
  const out = new Map();
  if (!anim) return out;
  for (const ch of anim.channels) {
    const s = anim.samplers[ch.sampler];
    if (s.interpolation && s.interpolation !== 'LINEAR') {
      throw new Error(`보간이 ${s.interpolation} 이다 — LINEAR 만 읽는다`);
    }
    const t = readAccessor(doc, s.input);
    const v = readAccessor(doc, s.output);
    const per = ch.target.path === 'rotation' ? 4 : 3;
    if (!t.length) continue;

    let i = 0;
    while (i < t.length - 1 && t[i + 1] < timeS) i++;
    const t0 = t[i];
    const t1 = t[Math.min(i + 1, t.length - 1)];
    const f = t1 > t0 ? Math.min(1, Math.max(0, (timeS - t0) / (t1 - t0))) : 0;
    const a = Array.from(v.slice(i * per, i * per + per));
    const b = Array.from(v.slice(Math.min(i + 1, t.length - 1) * per, Math.min(i + 1, t.length - 1) * per + per));

    const val = ch.target.path === 'rotation'
      ? slerp(a, b, f)
      : a.map((x, k) => lerp(x, b[k], f));

    const node = ch.target.node;
    if (!out.has(node)) out.set(node, {});
    out.get(node)[ch.target.path] = val;
  }
  return out;
}

// ── 행렬 (열 우선, glTF 규약) ────────────────────────────────────

function trsMatrix(t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = v;
    }
  }
  return o;
}

/** 부모 사슬 — 노드마다 한 번만 만든다. */
export function parentMap(doc) {
  const parent = new Map();
  (doc.json.nodes || []).forEach((n, i) => {
    for (const c of n.children || []) parent.set(c, i);
  });
  return parent;
}

/**
 * 시각 t 에서 이 노드의 세계 좌표.
 *
 * 발이 언제 땅에 닿는지를 재려면 이것이 있어야 한다 — 뼈의 국소 회전만
 * 봐서는 발이 어디 있는지 모른다.
 */
export function nodeWorldPos(doc, nodeIndex, sampled, parent) {
  let m = null;
  let cur = nodeIndex;
  const guard = new Set();
  while (cur != null) {
    if (guard.has(cur)) throw new Error('노드 사슬에 고리가 있다');
    guard.add(cur);
    const n = doc.json.nodes[cur];
    const s = sampled.get(cur) || {};
    const local = trsMatrix(
      s.translation || n.translation || [0, 0, 0],
      s.rotation || n.rotation || [0, 0, 0, 1],
      s.scale || n.scale || [1, 1, 1],
    );
    m = m ? mul(local, m) : local;
    cur = parent.get(cur);
  }
  return m ? [m[12], m[13], m[14]] : [0, 0, 0];
}

/** 이름으로 노드 찾기 — 없으면 null (0 을 돌려주지 않는다: 0 은 유효한 색인이다). */
export function findNode(doc, name) {
  const i = (doc.json.nodes || []).findIndex((n) => n.name === name);
  return i < 0 ? null : i;
}
