// **밖에서 보는 문 하나.**
//
// spacemaker 와 urbanspace 는 이 파일만 import 한다. 안쪽 파일을 직접
// 가져가기 시작하면 "계약이 유일한 외부 표면" 이 말뿐이 되고, 내부를 고칠
// 때마다 남의 저장소가 깨진다.
//
// 여기 있는 것은 셋이다:
//   loadPack       팩을 받아 **계약으로 검사한 뒤** 쓸 수 있게 준다
//   createClipPlayer  가까운 사람 — 사람마다 스킨 메시
//   createInstancedCrowd  먼 사람 — 구운 자세, 드로우콜 하나
//
// three 는 **주입받는다**. 소비처가 이미 three 를 쓰고 있고, 이 저장소가 제
// 판을 끌어오면 한 페이지에 두 벌이 뜬다.

import { validateCatalog } from '../lib/motionPack.mjs';
import { parseGLB } from '../lib/gltf.mjs';
import { bakeClip, bakeAtlas } from '../lib/poseBake.mjs';

export { createClipPlayer } from './clipPlayer.mjs';
export { createInstancedCrowd } from './instancedCrowd.mjs';
export { pickWalkClip, contactsAt, durationAt, strideS, TIME_SCALE_MAX } from '../lib/packRuntime.mjs';
import { attachAnimation } from '../lib/gltfWrite.mjs';

export {
  planCrowd, affordable, frameCostMs, TIERS,
  measuredFor, planCrowdMeasured,
} from '../lib/crowdBudget.mjs';
export { dimensionMm, pendingDimensions, DIMENSIONS } from '../lib/anthropometry.mjs';
export { validateCatalog, LICENSES, packRedistributable, commercialClips } from '../lib/motionPack.mjs';

/**
 * 팩을 받아 온다.
 *
 * **경계에서 크게 실패한다.** 계약을 어긴 팩은 여기서 던진다 — 렌더 루프
 * 깊은 데서 조용히 이상해지는 것보다, 받는 자리에서 무엇이 틀렸는지 말하고
 * 멈추는 것이 낫다.
 *
 * **몸 하나 + 동작들** 로 나뉜 팩(catalog.body)이면 몸을 한 번만 받고, 동작은
 * 뼈 움직임만 받는다. 동작마다 몸을 통째로 담던 예전 팩도 그대로 읽는다.
 *
 * 동작은 **필요한 것만** 받을 수 있다 (clips). 나머지는 pack.load([...]) 로
 * 나중에 — 서기·걷기만 쓰는 화면이 통화·박수까지 받을 까닭이 없다.
 *
 * @param url          팩 폴더 주소 (끝에 / 없이)
 * @param GLTFLoader   three/addons/loaders/GLTFLoader.js 의 클래스
 * @param fetchImpl    기본은 전역 fetch
 * @param clips        처음에 받을 클립 id 배열, 또는 (catalog) => 배열. 안 주면 전부
 * @returns { catalog, body, gltfOf, has, load, bufferOf, docOf }
 */
export async function loadPack({ url, GLTFLoader, fetchImpl = globalThis.fetch, clips: wanted }) {
  if (!url) throw new Error('팩 주소가 필요하다');
  if (!GLTFLoader) throw new Error('GLTFLoader 를 주입해야 한다');

  const res = await fetchImpl(`${url}/catalog.json`);
  if (!res.ok) throw new Error(`${url}/catalog.json 을 못 받았다 (HTTP ${res.status})`);
  const catalog = await res.json();

  const errs = validateCatalog(catalog);
  if (errs.length) {
    throw new Error(`${url}: 계약 위반 ${errs.length}건 — ${errs.slice(0, 3).map((e) => `${e.id}(${e.msg})`).join(' · ')}`);
  }

  const loader = new GLTFLoader();
  // parseAsync 가 없는 판도 있어서 콜백으로 감싼다.
  const parse = (buf) => new Promise((ok, no) => loader.parse(buf, '', ok, no));
  const get = async (rel) => {
    const r = await fetchImpl(`${url}/${rel}`);
    if (!r.ok) throw new Error(`${rel} 를 못 받았다 (HTTP ${r.status})`);
    return r.arrayBuffer();
  };

  // 나뉜 팩이면 몸을 먼저 — 모든 동작이 이 몸 하나를 복제해 쓴다 (텍스처도 한 벌).
  const split = typeof catalog.body === 'string';
  const bodyBuf = split ? await get(catalog.body) : null;
  const body = split ? await parse(bodyBuf) : null;
  let bodyDoc = null;

  const known = new Set(catalog.clips.map((c) => c.id));
  const gltfs = new Map();
  const buffers = new Map();
  const pending = new Map();
  /** 이 클립들을 받는다 — 받은 것·받는 중인 것은 다시 안 받는다. 한꺼번에 받는다. */
  const load = (ids) => Promise.all(ids.map((id) => {
    if (!known.has(id)) return Promise.reject(new Error(`카탈로그에 ${id} 가 없다`));
    if (gltfs.has(id)) return null;
    if (!pending.has(id)) {
      pending.set(id, (async () => {
        const buf = await get(`clips/${id}.glb`);
        const g = await parse(buf);
        buffers.set(id, buf);
        gltfs.set(id, split ? { scene: body.scene, animations: g.animations } : g);
      })().finally(() => pending.delete(id)));
    }
    return pending.get(id);
  })).then(() => undefined);

  const first = typeof wanted === 'function' ? wanted(catalog) : wanted;
  await load(first ?? [...known]);

  return {
    catalog,
    /** 나뉜 팩의 몸 (three 가 읽은 것) — 예전 팩이면 null */
    body,
    gltfOf: (id) => gltfs.get(id),
    has: (id) => gltfs.has(id),
    load,
    // 굽는 쪽은 three 가 읽은 것이 아니라 **원본 바이트**를 본다 — 우리
    // 리더로 읽어야 FK 가 같은 수를 낸다 (게이트가 그 둘을 견줘 왔다).
    bufferOf: (id) => buffers.get(id),
    /** 굽기용 문서 — 나뉜 팩이면 몸과 동작을 이름으로 이어 붙인 것 */
    docOf: (id) => {
      const buf = buffers.get(id);
      if (!buf) return null;
      const doc = parseGLB(new Uint8Array(buf));
      if (!split) return doc;
      bodyDoc = bodyDoc || parseGLB(new Uint8Array(bodyBuf));
      return attachAnimation(bodyDoc, doc);
    },
  };
}

/**
 * 팩에서 바로 자세를 굽는다.
 *
 * 데모는 픽스처를 메모리에서 만들어 구웠는데, 실제로는 **팩의 GLB** 를 구워야
 * 한다. 그 길이 없으면 인스턴싱은 픽스처 전용 기능으로 남는다.
 *
 * @param pack    loadPack 의 결과
 * @param clipIds 구울 클립 — 안 주면 제자리 클립 전부
 */
export function bakeFromPack(pack, clipIds) {
  const ids = clipIds?.length
    ? clipIds
    // 이동하는 클립은 굽을 때 이동이 빠지므로 제자리와 같아진다. 기본으로는
    // 걷는 클립도 넣는다 — 멀리 있는 사람도 걸어야 하기 때문이다.
    : pack.catalog.clips.map((c) => c.id);
  const entries = ids.map((id) => {
    // 나뉜 팩은 몸(스킨·역바인드)과 동작이 따로라 docOf 가 둘을 잇는다.
    const doc = pack.docOf ? pack.docOf(id)
      : (pack.bufferOf(id) ? parseGLB(new Uint8Array(pack.bufferOf(id))) : null);
    if (!doc) throw new Error(`${id} 의 원본이 없다 — 받지 않은 클립이면 pack.load(['${id}']) 를 먼저`);
    return { id, baked: bakeClip(doc) };
  });
  const atlas = bakeAtlas(entries);
  // **앞을 같이 들려 보낸다.** 인스턴싱 쪽은 카탈로그를 안 보고 아틀라스만
  // 받으므로, 여기서 안 넘기면 먼 사람만 반대로 선다 — 가까운 사람과 먼
  // 사람이 서로 다른 쪽을 보는 화면이 된다.
  atlas.forwardRad = pack.catalog.forwardRad ?? null;
  return atlas;
}

/**
 * 이 팩의 살 — 인스턴싱에 넘길 기하 **하나**.
 *
 * 몸이 여러 조각이면 합친다. Rocketbox 는 메시 하나에 몸·머리·속눈썹 세
 * 조각이 들어 있고, three 는 그것을 스킨 메시 셋으로 읽는다. 첫 조각만
 * 가져가던 때에는 먼 사람이 **머리 없이** 걸었다 (정점 5,438 중 2,962).
 *
 * 알파로 오려 내는 조각(속눈썹·머리카락 카드)은 뺀다. 인스턴싱 셰이더는
 * 한 색으로 칠하므로, 넣으면 얇은 판이 머리 둘레에 통째로 칠해진다.
 * 조각들은 한 skin 을 나눠 쓰므로 뼈 번호가 그대로 맞는다.
 */
export function geometryOf(pack, clipId) {
  // 나뉜 팩은 몸이 따로 있다. 예전 팩은 받아 둔 클립 아무것이나 — 동작을
  // 필요한 것만 받으므로 첫 클립이 없을 수 있다.
  const gltf = clipId ? pack.gltfOf(clipId)
    : (pack.body || pack.gltfOf(pack.catalog.clips.find((c) => pack.gltfOf(c.id))?.id));
  if (!gltf) throw new Error('살을 가져올 몸이 없다 — 받은 클립이 하나도 없다');
  const parts = [];
  gltf.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const cutout = !!mat && (mat.transparent || mat.alphaTest > 0);
    parts.push({ geom: o.geometry, cutout });
  });
  if (!parts.length) throw new Error('스킨 메시가 없다');
  const solid = parts.filter((p) => !p.cutout).map((p) => p.geom);
  const use = solid.length ? solid : parts.map((p) => p.geom);
  return use.length === 1 ? use[0] : mergeSkinned(use);
}

/**
 * three 의 BufferAttribute 클래스를 찾는다 — three 는 주입받으므로 import 할 수 없다.
 *
 * 속성의 constructor 를 그대로 쓰면 안 된다. gltf-transform 이 쓴 GLB 는 정점
 * 속성이 **끼워 넣어져**(interleaved) 있어서 그 constructor 가
 * InterleavedBufferAttribute 이고, 거기에 배열을 주면 속이 빈 속성이 된다 —
 * 매 프레임 "byteLength of undefined" 로 무너졌다. 끼워 넣지 않은 속성
 * (Float32BufferAttribute 따위)에서 부모를 거슬러 올라가 BufferAttribute 에 닿는다.
 */
function plainAttributeClass(geoms) {
  for (const g of geoms) {
    for (const a of [g.index, ...Object.values(g.attributes)]) {
      if (!a || a.isInterleavedBufferAttribute || !a.isBufferAttribute) continue;
      let C = a.constructor;
      for (;;) {
        const up = Object.getPrototypeOf(C);
        if (!up || typeof up.prototype?.setXYZ !== 'function') break;
        C = up;
      }
      return C;
    }
  }
  throw new Error('끼워 넣지 않은 속성이 하나도 없어 합칠 틀을 못 찾았다');
}

/** 스킨 기하 여럿을 하나로 — 인스턴싱 셰이더가 읽는 속성만 잇는다. */
function mergeSkinned(geoms) {
  const first = geoms[0];
  const names = ['position', 'normal', 'skinIndex', 'skinWeight']
    .filter((k) => geoms.every((g) => g.getAttribute(k)));
  for (const k of ['position', 'skinIndex', 'skinWeight']) {
    if (!names.includes(k)) throw new Error(`조각 하나에 ${k} 가 없어 합칠 수 없다`);
  }
  const out = new first.constructor();
  const Attr = plainAttributeClass(geoms);
  let total = 0;
  for (const g of geoms) total += g.getAttribute('position').count;
  for (const k of names) {
    const size = first.getAttribute(k).itemSize;
    // 뼈 번호는 조각마다 Uint8·Uint16 이 섞일 수 있어 넓은 쪽으로 담는다.
    const arr = k === 'skinIndex' ? new Uint16Array(total * size) : new Float32Array(total * size);
    let at = 0;
    for (const g of geoms) {
      const a = g.getAttribute(k);
      for (let i = 0; i < a.count; i++) {
        for (let c = 0; c < size; c++) arr[at++] = a.getComponent(i, c);
      }
    }
    out.setAttribute(k, new Attr(arr, size));
  }
  const index = [];
  let base = 0;
  for (const g of geoms) {
    const n = g.getAttribute('position').count;
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(g.index.getX(i) + base);
    else for (let i = 0; i < n; i++) index.push(i + base);
    base += n;
  }
  out.setIndex(index);
  out.computeBoundingSphere?.();
  return out;
}
