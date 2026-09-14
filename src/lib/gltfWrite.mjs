// glTF 를 쓰는 쪽 — gltf.mjs 는 읽기만 한다.
//
// 팩을 **몸 하나 + 동작들**로 나누는 데 쓴다. 예전 팩은 동작마다 몸 전체
// (메시·텍스처 4.4MB)를 통째로 담아서, 동작 9개짜리 사람이 46MB 였다 — 그중
// 동작은 6.5MB 뿐이었다. 나누면 몸은 한 번, 동작은 뼈 움직임만 받는다.
//
//   bodyOnly(doc)              애니메이션을 뺀 몸 — 안 쓰는 바이트까지 걷는다
//   motionOnly(skeleton, anim) 뼈대(노드)와 애니메이션만 든 GLB
//   attachAnimation(body, m)   몸 + 동작을 다시 한 문서로 (굽기·재기용)
//
// 짝은 **노드 이름**으로 맞춘다. three 도 트랙을 노드 이름으로 붙이므로,
// 여기서 이름이 맞으면 화면에서도 맞는다.

import { readAccessor } from './gltf.mjs';

const u8 = (b) => (b ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(0));
const clone = (o) => JSON.parse(JSON.stringify(o));
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** bin 뒤에 값을 붙여 가는 쓰개. */
function makeWriter(json, base) {
  if ((json.buffers || []).length > 1) throw new Error('버퍼가 둘 이상인 glTF 는 다루지 않는다');
  const chunks = [base];
  let offset = base.byteLength;
  json.bufferViews = json.bufferViews || [];
  json.accessors = json.accessors || [];
  const pad = () => {
    const r = (4 - (offset % 4)) % 4;
    if (r) { chunks.push(new Uint8Array(r)); offset += r; }
  };
  return {
    /**
     * @param componentType glTF 의 componentType — 기본은 float(5126).
     *        뼈 번호(5123)와 인덱스(5123·5125)는 정수라 따로 준다. 실수로
     *        쓰면 three 가 읽다가 뼈를 엉뚱하게 집는다.
     */
    put(arr, type, extra, componentType = 5126) {
      pad();
      const bytes = u8(arr);
      chunks.push(bytes);
      json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
      offset += bytes.byteLength;
      json.accessors.push({
        bufferView: json.bufferViews.length - 1, componentType,
        count: arr.length / COMPONENTS[type], type, ...(extra || {}),
      });
      return json.accessors.length - 1;
    },
    finish() {
      pad();
      const bin = new Uint8Array(offset);
      let at = 0;
      for (const c of chunks) { bin.set(c, at); at += c.byteLength; }
      json.buffers = [{ byteLength: bin.byteLength }];
      return { json, bin };
    },
  };
}

/**
 * 애니메이션 하나를 풀어 낸다 — 노드 **이름**을 함께 싣는다.
 * @returns {{ name, channels: {node, nodeName, path, interpolation, times, values}[] }}
 */
export function extractAnimation(doc, animIndex = 0) {
  const a = doc.json.animations?.[animIndex];
  if (!a) throw new Error('애니메이션이 없다');
  return {
    name: a.name || 'clip',
    channels: a.channels.map((ch) => {
      const s = a.samplers[ch.sampler];
      // 정규화된 정수도 읽는다 — readAccessor 가 규약대로 실수로 풀어 준다
      // (회전을 int16 로 적기 시작하면서 열었다).
      return {
        node: ch.target.node,
        nodeName: doc.json.nodes[ch.target.node]?.name,
        path: ch.target.path,
        interpolation: s.interpolation || 'LINEAR',
        times: Float32Array.from(readAccessor(doc, s.input)),
        values: Float32Array.from(readAccessor(doc, s.output)),
      };
    }),
  };
}

const sameArray = (a, b) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * 문서에 애니메이션 하나를 얹는다 — 있던 애니메이션은 **버린다**(바이트는
 * 남는다; 걷으려면 compact). 채널의 node 는 이 문서의 노드 색인이다.
 * 시각 배열이 같은 채널끼리는 입력 접근자를 나눠 쓴다.
 */
export function appendAnimation(doc, anim) {
  const json = clone(doc.json);
  const w = makeWriter(json, u8(doc.bin));
  const inputs = [];
  const samplers = [];
  const channels = [];
  for (const ch of anim.channels) {
    let input = inputs.find((x) => sameArray(x.times, ch.times))?.acc;
    if (input == null) {
      input = w.put(ch.times, 'SCALAR', { min: [ch.times[0]], max: [ch.times[ch.times.length - 1]] });
      inputs.push({ times: ch.times, acc: input });
    }
    const keys = ch.times.length * (ch.interpolation === 'CUBICSPLINE' ? 3 : 1);
    const per = ch.values.length / keys;
    const type = per === 4 ? 'VEC4' : per === 3 ? 'VEC3' : 'SCALAR';
    // **Int16Array 로 주면 정규화된 정수로 적는다** (회전 8.7MB → 4.4MB).
    // 실수로 적을 것과 섞이지 않게, 무엇으로 적는지는 값의 꼴이 정한다.
    const quant = ch.values instanceof Int16Array;
    const output = quant
      ? w.put(ch.values, type, { normalized: true }, 5122)
      : w.put(ch.values, type);
    samplers.push({ input, output, interpolation: ch.interpolation || 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node: ch.node, path: ch.path } });
  }
  json.animations = channels.length ? [{ name: anim.name || 'clip', samplers, channels }] : [];
  if (!json.animations.length) delete json.animations;
  return w.finish();
}

/**
 * 안 쓰는 접근자·버퍼뷰를 걷어 bin 을 새로 짠다.
 * 쓰는 것: 메시(속성·색인·모프), 스킨의 역바인드, 애니메이션, 그림.
 */
export function compact({ json: j0, bin }) {
  const json = clone(j0);
  const used = new Set();
  for (const m of json.meshes || []) {
    for (const p of m.primitives || []) {
      for (const v of Object.values(p.attributes || {})) used.add(v);
      if (p.indices != null) used.add(p.indices);
      for (const t of p.targets || []) for (const v of Object.values(t)) used.add(v);
    }
  }
  for (const s of json.skins || []) if (s.inverseBindMatrices != null) used.add(s.inverseBindMatrices);
  for (const a of json.animations || []) for (const s of a.samplers) { used.add(s.input); used.add(s.output); }

  const accMap = new Map();
  const accessors = [];
  for (const i of [...used].sort((a, b) => a - b)) {
    const acc = json.accessors[i];
    if (acc.sparse) throw new Error('성긴 접근자는 다루지 않는다');
    accMap.set(i, accessors.length);
    accessors.push(acc);
  }
  const views = new Set();
  for (const a of accessors) if (a.bufferView != null) views.add(a.bufferView);
  for (const im of json.images || []) if (im.bufferView != null) views.add(im.bufferView);

  const src = u8(bin);
  const bvMap = new Map();
  const bufferViews = [];
  const parts = [];
  let off = 0;
  for (const i of [...views].sort((a, b) => a - b)) {
    const bv = json.bufferViews[i];
    const r = (4 - (off % 4)) % 4;
    if (r) { parts.push(new Uint8Array(r)); off += r; }
    const start = bv.byteOffset || 0;
    parts.push(src.subarray(start, start + bv.byteLength));
    bvMap.set(i, bufferViews.length);
    bufferViews.push({ ...bv, buffer: 0, byteOffset: off });
    off += bv.byteLength;
  }
  const r = (4 - (off % 4)) % 4;
  if (r) { parts.push(new Uint8Array(r)); off += r; }

  for (const a of accessors) if (a.bufferView != null) a.bufferView = bvMap.get(a.bufferView);
  for (const im of json.images || []) if (im.bufferView != null) im.bufferView = bvMap.get(im.bufferView);
  for (const m of json.meshes || []) {
    for (const p of m.primitives || []) {
      for (const k of Object.keys(p.attributes || {})) p.attributes[k] = accMap.get(p.attributes[k]);
      if (p.indices != null) p.indices = accMap.get(p.indices);
      for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = accMap.get(t[k]);
    }
  }
  for (const s of json.skins || []) if (s.inverseBindMatrices != null) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
  for (const a of json.animations || []) for (const s of a.samplers) { s.input = accMap.get(s.input); s.output = accMap.get(s.output); }
  json.accessors = accessors;
  json.bufferViews = bufferViews;

  const out = new Uint8Array(off);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  json.buffers = [{ byteLength: off }];
  return { json, bin: out };
}

/** 애니메이션을 뺀 몸 — 버린 애니메이션의 바이트까지 걷는다. */
export function bodyOnly(doc) {
  const json = clone(doc.json);
  delete json.animations;
  return compact({ json, bin: doc.bin });
}

/** 이름 → 색인. 같은 이름이 둘이면 짝을 잘못 지을 수 있어 던진다. */
function nameIndex(doc) {
  const m = new Map();
  (doc.json.nodes || []).forEach((n, i) => {
    if (!n.name) return;
    if (m.has(n.name)) throw new Error(`노드 이름 '${n.name}' 이 둘이다 — 이름으로 짝지을 수 없다`);
    m.set(n.name, i);
  });
  return m;
}

function remap(anim, byName) {
  const channels = [];
  const missing = new Set();
  for (const ch of anim.channels) {
    const i = byName.get(ch.nodeName);
    if (i == null) { missing.add(ch.nodeName); continue; }
    channels.push({ ...ch, node: i });
  }
  return { channels, missing: [...missing] };
}

/**
 * 뼈대와 애니메이션만 든 GLB — 메시·스킨·재질·그림은 없다.
 *
 * 노드는 뼈대 문서의 것을 그대로(이름·쉬는 자세·위계) 두고 메시·스킨만
 * 떼어 낸다. 재는 쪽(build-pack)이 발 높이·루트 이동을 FK 로 재려면 쉬는
 * 자세가 있어야 하기 때문이다.
 *
 * @returns {{ doc: {json, bin}, missing: string[] }} missing — 뼈대에 없어 버린 노드 이름
 */
export function motionOnly(skeletonDoc, anim) {
  const src = skeletonDoc.json;
  const nodes = (src.nodes || []).map((n) => {
    const o = {};
    for (const k of ['name', 'translation', 'rotation', 'scale', 'matrix', 'children']) if (n[k] !== undefined) o[k] = clone(n[k]);
    return o;
  });
  const json = {
    asset: { version: '2.0', generator: 'peoplemaker/gltfWrite' },
    scene: src.scene ?? 0,
    scenes: clone(src.scenes || [{ nodes: nodes.map((_, i) => i) }]),
    nodes,
  };
  const { channels, missing } = remap(anim, nameIndex({ json }));
  return { doc: appendAnimation({ json, bin: new Uint8Array(0) }, { name: anim.name, channels }), missing };
}

/**
 * 몸 + 동작 → 한 문서. 굽기(bakeClip)가 스킨·역바인드와 애니메이션을 한
 * 문서에서 읽기 때문에 있다.
 */
export function attachAnimation(bodyDoc, motionDoc, animIndex = 0) {
  const anim = extractAnimation(motionDoc, animIndex);
  const { channels, missing } = remap(anim, nameIndex(bodyDoc));
  if (missing.length) throw new Error(`몸에 없는 뼈를 움직이는 동작이다 — ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ' …' : ''}`);
  return appendAnimation(bodyDoc, { name: anim.name, channels });
}

/** 문서를 GLB 바이트로. */
/**
 * **먼 사람용 몸** — 줄인 살 + 구운 색, 텍스처 없음.
 *
 * 지금까지는 소비처가 몸 4.2MB(그중 3.7MB 가 텍스처)를 받아, 브라우저에서
 * 130ms 를 들여 매번 줄이고 색을 찍었다. 먼 사람만 세우는 화면(도시 스케일)은
 * 그 텍스처를 한 번도 안 쓴다.
 *
 * 그래서 **구울 때 한 번** 만들어 팩에 넣는다. 받는 쪽은 이것만 받으면 된다.
 *
 * 뼈대·skin·역바인드는 몸의 것을 그대로 쓴다 — 그래야 같은 동작 파일과 같은
 * 구운 아틀라스가 그대로 맞는다. 재료는 텍스처 없는 흰색 하나이고, 색은
 * 정점에 들어 있다 (COLOR_0).
 *
 * @param doc  몸 문서 (parseGLB 결과)
 * @param mesh 줄인 살 — { position, normal, color, skinIndex, skinWeight, index }
 */
export function farBody(doc, mesh) {
  const src = doc.json;
  const skinIdx = (src.nodes || []).findIndex((n) => n.skin != null && n.mesh != null);
  if (skinIdx < 0) throw new Error('스킨 메시를 단 노드가 없다');
  const srcSkin = src.skins[src.nodes[skinIdx].skin];
  if (srcSkin.inverseBindMatrices == null) throw new Error('역바인드 행렬이 없다 — 살이 뒤틀린다');
  const ibm = readAccessor(doc, srcSkin.inverseBindMatrices);

  const nodes = clone(src.nodes).map((n, i) => {
    const out = { ...n };
    // 살을 단 노드는 하나만 남긴다 — 나머지 조각(속눈썹·머리카락)은 이미
    // 줄이는 쪽에서 뺐다.
    if (i === skinIdx) { out.mesh = 0; out.skin = 0; } else { delete out.mesh; delete out.skin; }
    return out;
  });

  const n = mesh.position.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.position.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      if (mesh.position[i + c] < min[c]) min[c] = mesh.position[i + c];
      if (mesh.position[i + c] > max[c]) max[c] = mesh.position[i + c];
    }
  }

  const json = {
    asset: { version: '2.0', generator: 'peoplemaker/farBody' },
    scene: src.scene ?? 0,
    scenes: clone(src.scenes || [{ nodes: [0] }]),
    nodes,
    materials: [{
      name: 'far',
      // 색은 정점에 있다. baseColorFactor 는 흰색이라 그대로 곱해진다.
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 },
    }],
  };
  const w = makeWriter(json, new Uint8Array(0));
  const short = n <= 65535;
  const attributes = {
    POSITION: w.put(mesh.position, 'VEC3', { min, max }),
    NORMAL: w.put(mesh.normal, 'VEC3'),
    JOINTS_0: w.put(Uint16Array.from(mesh.skinIndex), 'VEC4', {}, 5123),
    WEIGHTS_0: w.put(mesh.skinWeight, 'VEC4'),
  };
  if (mesh.color) attributes.COLOR_0 = w.put(mesh.color, 'VEC3');
  const indices = short
    ? w.put(Uint16Array.from(mesh.index), 'SCALAR', {}, 5123)
    : w.put(Uint32Array.from(mesh.index), 'SCALAR', {}, 5125);
  json.meshes = [{ name: 'far', primitives: [{ attributes, indices, material: 0 }] }];
  json.skins = [{
    joints: srcSkin.joints.slice(),
    ...(srcSkin.skeleton != null ? { skeleton: srcSkin.skeleton } : {}),
    inverseBindMatrices: w.put(Float32Array.from(ibm), 'MAT4'),
  }];
  return w.finish();
}

export function encodeGLB({ json, bin }) {
  const enc = new TextEncoder();
  let js = enc.encode(JSON.stringify(json));
  const jsPad = (4 - (js.byteLength % 4)) % 4;
  if (jsPad) { const p = new Uint8Array(js.byteLength + jsPad).fill(0x20); p.set(js); js = p; }
  const b = u8(bin);
  const binLen = b.byteLength;
  const total = 12 + 8 + js.byteLength + (binLen ? 8 + binLen : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.byteLength, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(js, 20);
  if (binLen) {
    const o = 20 + js.byteLength;
    dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true);
    out.set(b, o + 8);
  }
  return out;
}
