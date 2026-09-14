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
//   createMixedCrowd      먼 사람 여러 몸 — 드로우콜은 팩 수
//   planActivity·startActivity  회의·대피 같은 **활동**을 동작 차례로 (자리는 안 정한다)
//
// three 는 **주입받는다**. 소비처가 이미 three 를 쓰고 있고, 이 저장소가 제
// 판을 끌어오면 한 페이지에 두 벌이 뜬다.

import { validateCatalog } from '../lib/motionPack.mjs';
import { parseGLB } from '../lib/gltf.mjs';
import { bakeClip, bakeAtlas } from '../lib/poseBake.mjs';
import { simplifyMesh } from '../lib/meshLod.mjs';
import { colorsFromUV } from '../lib/vertexColor.mjs';

export { createClipPlayer } from './clipPlayer.mjs';
export { createInstancedCrowd } from './instancedCrowd.mjs';
export { createMixedCrowd } from './mixedCrowd.mjs';
export { pickWalkClip, contactsAt, durationAt, strideS, TIME_SCALE_MAX, crossFadeS, CROSSFADE_MAX_S } from '../lib/packRuntime.mjs';
export { ACTIVITIES, planActivity, startActivity, clipForRole } from '../lib/activity.mjs';
// 배역 — 프로필과 팩 묶음을 받아 사람 번호를 팩에 붙인다 (lib/cast.mjs).
export { planCast, castReport } from '../lib/cast.mjs';
// 일과 — 활동의 차례. 시각도 방도 안 갖는다 (lib/routine.mjs).
export { ROUTINES, planRoutine, startRoutine } from '../lib/routine.mjs';
// 시나리오 preflight — 돌리기 전에 이게 되는지 한 장으로 (lib/scenario.mjs).
export { SCENARIOS, planScenario, scenarioReport } from '../lib/scenario.mjs';
// 용도 프로필 — "학교" 가 무엇을 뜻하는가. 비율은 저장 안 하고 비에서 계산한다.
export { profileShares, profileProblems, pendingProfiles, PROFILE_SOURCES } from '../lib/profile.mjs';
import { attachAnimation } from '../lib/gltfWrite.mjs';
// 클립 파일이 없을 때 **무엇이 딸려 오는지**를 말하려고 쓴다 (수를 여기 또 적지 않는다).
import { SHIP_FILES, MIN_CLIPS } from '../lib/dist.mjs';

export {
  planCrowd, affordable, frameCostMs, TIERS,
  measuredFor, planCrowdMeasured,
} from '../lib/crowdBudget.mjs';
export { dimensionMm, pendingDimensions, DIMENSIONS } from '../lib/anthropometry.mjs';
// 재실자 값 — 계단 속도·지연 시간. 미국 소방훈련 관찰값이다 (lib/occupancy.mjs).
export { occupantValue, pendingOccupantValues, OCCUPANT_VALUES, OCCUPANT_SOURCES } from '../lib/occupancy.mjs';
export { validateCatalog, LICENSES, packRedistributable, commercialClips } from '../lib/motionPack.mjs';
// 표기 의무 — 이 팩을 쓰면 무엇을 적어야 하는가 (lib/attribution.mjs).
export { attributionsFor, attributionTally, attributionNeeds } from '../lib/attribution.mjs';

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
 * **먼 사람만 세울 거라면 `body: 'far'`** — 팩이 구워 둔 줄인 몸(텍스처 없음,
 * 색은 정점에)을 대신 받는다. Rocketbox 여자 01 에서 4,238KB 대신 95KB 다.
 * 가까운 사람에게는 안 쓴다 (살이 4분의 1이고 텍스처가 없다).
 *
 * 먼 몸은 **단계가 여럿**이다 (0.25 · 0.1). `farRatio` 로 고르면 그 이하로
 * 가장 가까운 단계를 받는다 — 안 주면 가장 덜 줄인 것이다.
 *
 * @param clips        처음에 받을 클립 id 배열, 또는 (catalog) => 배열. 안 주면 전부
 * @param body         'full'(기본) 또는 'far'
 * @param farRatio     먼 몸의 단계 (0.25 · 0.1 …) — 안 주면 첫 단계
 * @returns { catalog, body, far, gltfOf, has, load, bufferOf, docOf }
 */
export async function loadPack({
  url, GLTFLoader, fetchImpl = globalThis.fetch, clips: wanted, body: which = 'full', farRatio,
}) {
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
  //
  // 먼 사람용 몸을 달라고 했는데 팩에 없으면 **말하고 멈춘다.** 조용히 큰
  // 몸을 주면 받는 쪽은 95KB 를 기대하고 4MB 를 받는다.
  const far = which === 'far';
  const levels = Array.isArray(catalog.bodyFar) ? catalog.bodyFar : [];
  if (far && !levels.length) {
    throw new Error(`${url}: 먼 사람용 몸(bodyFar)이 없는 팩이다 — 다시 구워야 한다`);
  }
  // 물어본 비율 **이하로 가장 가까운** 단계. 안 주면 가장 덜 줄인 것.
  const level = far
    ? (farRatio ? [...levels].filter((l) => l.ratio <= farRatio + 1e-9).pop() || levels[levels.length - 1] : levels[0])
    : null;
  if (far && farRatio && !levels.some((l) => Math.abs(l.ratio - farRatio) < 1e-9)) {
    // 없는 단계를 달라고 하면 **더 거친 쪽**으로 간다 — 그 사실이 pack.farLevel 에 남는다.
  }
  const split = typeof catalog.body === 'string';
  const bodyFile = far ? level.file : catalog.body;
  const bodyBuf = split ? await get(bodyFile) : null;
  let body = null;
  if (split) {
    try {
      body = await parse(bodyBuf);
    } catch (e) {
      // **텍스처가 있는 몸은 브라우저가 있어야 읽힌다.** three 의 GLTFLoader 가
      // 그림을 `self.createImageBitmap` 으로 푸는데, Node 에는 `self` 가 없다.
      // 그냥 두면 "self is not defined" 만 나와서 쓰는 쪽이 원인을 못 찾는다 —
      // 소비처 시험(scripts/smoke-consumer.mjs)을 쓰다 밟았고, 게이트는 텍스처
      // 없는 기준 팩만 열어 봐서 여태 몰랐다.
      //
      // 먼 몸(body: 'far')에는 텍스처가 없으므로 Node 에서도 열린다.
      if (/(^|[^a-z])self([^a-z]|$)|createImageBitmap|ImageBitmap|document is not/.test(String(e?.message))) {
        throw new Error(
          `${url}/${bodyFile}: 텍스처가 있는 몸은 브라우저에서만 읽힌다 `
          + `(three 의 GLTFLoader 가 self.createImageBitmap 을 쓴다). `
          + `브라우저 밖이면 body: 'far' 로 받을 것 — 먼 몸에는 텍스처가 없다. `
          + `원래 오류: ${e.message}`,
        );
      }
      throw e;
    }
  }
  let bodyDoc = null;

  const known = new Set(catalog.clips.map((c) => c.id));

  /**
   * 클립 파일 하나를 받는다 — **없으면 무엇을 하면 되는지 말한다.**
   *
   * 카탈로그는 그 사람이 할 줄 아는 동작을 **전부** 적는다(31~34개). 그런데
   * 파일은 사본마다 다르다 — 저장소에 딸려 오는 사본에는 셋뿐이다
   * (`SHIP_FILES`: idle · walk-forward · run). 그래서 "카탈로그에서 걷는 것을
   * 전부 골라 달라" 는 흔한 쓰임이 **404 로 터진다.**
   *
   * spacemaker 가 그렇게 부른다 — `travel || idle` 로 여덟을 골라서 다섯이
   * 없다. 그냥 두면 `clips/run-injured.glb 를 못 받았다 (HTTP 404)` 만 나와서,
   * 받는 쪽은 팩이 깨진 줄 안다. 깨진 것이 아니라 **이 사본이 일부**다.
   */
  const getClip = async (id) => {
    const r = await fetchImpl(`${url}/clips/${id}.glb`);
    if (r.ok) return r.arrayBuffer();
    if (r.status !== 404) throw new Error(`clips/${id}.glb 를 못 받았다 (HTTP ${r.status})`);
    throw new Error(
      `${url}/clips/${id}.glb 가 없다 (HTTP 404). 카탈로그는 클립 ${catalog.clips.length}개를 `
      + `적지만 **이 사본에 파일이 다 있는 것은 아니다** — 저장소에 딸려 오는 사본은 `
      + `${SHIP_FILES.filter((f) => f.startsWith('clips/')).map((f) => f.slice(6, -4)).join(' · ')} 뿐이다. `
      + `있는 것만 달라고 하거나(clips: ['${MIN_CLIPS.join("', '")}']), 나머지를 먼저 받을 것 `
      + `(node scripts/fetch-packs.mjs <목록 주소> --clips ${id},…).`,
    );
  };

  const gltfs = new Map();
  const buffers = new Map();
  const pending = new Map();
  /** 이 클립들을 받는다 — 받은 것·받는 중인 것은 다시 안 받는다. 한꺼번에 받는다. */
  const load = (ids) => Promise.all(ids.map((id) => {
    if (!known.has(id)) return Promise.reject(new Error(`카탈로그에 ${id} 가 없다`));
    if (gltfs.has(id)) return null;
    if (!pending.has(id)) {
      pending.set(id, (async () => {
        const buf = await getClip(id);
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
    /** 먼 사람용 몸을 받았는가 — 그렇다면 줄이기·색 굽기가 이미 끝나 있다. */
    far,
    /** 받은 먼 몸의 단계 (없으면 null) — 무엇을 얼마로 줄인 것인지. */
    farLevel: level,
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
 *
 * **먼 사람에게는 살을 줄여 준다** — `{ lod: 0.25 }` 면 삼각형을 4분의 1로
 * 접는다 (lib/meshLod.mjs). 뼈와 가중치는 그대로라 **같은 아틀라스를 그대로
 * 쓴다** — 굽는 쪽은 아무것도 안 바뀐다.
 *
 * **색도 구워 준다** — `{ color: true }` 면 팩의 baseColorTexture 를 UV 로
 * 찍어 정점마다 색 하나를 둔다 (lib/vertexColor.mjs). 안 주면 먼 사람들이
 * 다 같은 회색이다. 텍스처가 없는 팩은 baseColorFactor 를 쓴다.
 *
 * 색은 **줄이기 전에** 찍는다 — 줄인 뒤에는 UV 가 솔기에서 이미 뭉개져 있다.
 *
 * @param opts 클립 id (예전 모양) 또는 { clipId, lod, color, lodStats }
 */
export function geometryOf(pack, opts) {
  const { clipId, lod, color, lodStats } = typeof opts === 'string' || opts == null ? { clipId: opts } : opts;
  // 먼 사람용 몸은 **이미 줄여서 색까지 구워 둔 것**이다. 여기서 또 줄이면
  // 삼각형이 4분의 1의 4분의 1이 되고, 색은 찍을 텍스처가 없다.
  const prebaked = !!pack.far;
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
    parts.push({ geom: o.geometry, cutout, material: mat });
  });
  if (!parts.length) throw new Error('스킨 메시가 없다');
  const solid = parts.filter((p) => !p.cutout);
  const use = solid.length ? solid : parts;
  const geoms = use.map((p) => p.geom);
  const colors = color && !prebaked ? use.map((p) => bakedColorsFor(p, color)) : null;
  // 색을 구우면 조각이 하나여도 새 기하를 만든다 — 팩의 기하는 가까운 사람이
  // 쓰고 있는 것이라, 거기에 속성을 붙이면 남의 것을 건드리는 셈이다.
  const merged = geoms.length === 1 && !colors ? geoms[0] : mergeSkinned(geoms, colors);
  if (prebaked) {
    if (lodStats) Object.assign(lodStats, { prebaked: true, ...(pack.farLevel || {}) });
    return merged;
  }
  if (!(lod > 0) || lod >= 1) return merged;
  return simplifiedGeometry(merged, lod, lodStats);
}

/** 푼 화소를 그림마다 한 번만 — 1024×1024 하나가 4MB 다. */
const pixelCache = new WeakMap();

/**
 * 조각 하나의 정점 색 — baseColorTexture 를 UV 로 찍는다.
 *
 * 텍스처가 없거나 UV 가 없으면 **baseColorFactor** 로 채운다 (합성 기준 팩이
 * 그렇다). 둘 다 없으면 흰색이다 — 그럴듯한 살색을 지어내지 않는다.
 *
 * `color` 에 `{ width, height, data }` 를 직접 줄 수도 있다. 브라우저 밖
 * (게이트)에서는 그림을 풀 길이 없어서 낸 문이다.
 */
function bakedColorsFor(part, color) {
  const geom = part.geom;
  const count = geom.getAttribute('position').count;
  const mat = part.material;
  // three 는 baseColorFactor 를 작업 색공간(선형)으로 갖고 있다. 우리 셰이더는
  // 색 관리를 안 거치고 그대로 화면에 쓰므로 **sRGB 로 되돌려** 받는다 —
  // 안 그러면 먼 사람만 어둡다.
  let factor = [1, 1, 1];
  if (mat && mat.color) {
    factor = [mat.color.r, mat.color.g, mat.color.b];
    if (typeof mat.color.getRGB === 'function') {
      try {
        const t = { r: 1, g: 1, b: 1 };
        mat.color.getRGB(t, 'srgb');
        factor = [t.r, t.g, t.b];
      } catch { /* 색공간을 모르는 판이면 있는 값 그대로 */ }
    }
  }

  const given = color && typeof color === 'object' ? color : null;
  const uvAttr = geom.getAttribute('uv');
  const image = given || (uvAttr ? imagePixels(mat && mat.map ? mat.map.image : null) : null);
  if (!image || !uvAttr) return colorsFromUV(null, null, factor, { count });

  const uv = new Float32Array(uvAttr.count * 2);
  for (let i = 0; i < uvAttr.count; i++) {
    uv[i * 2] = uvAttr.getX(i);
    uv[i * 2 + 1] = uvAttr.getY(i);
  }
  return colorsFromUV(uv, image, factor);
}

/**
 * 그림을 화소로 — 여기가 이 저장소에서 **DOM 을 쓰는 유일한 자리**다.
 *
 * three 가 이미 푼 그림(ImageBitmap)을 캔버스에 그려 되읽는다. 캔버스가 없는
 * 판(Node)에서는 null 을 내고 부르는 쪽이 factor 로 물러선다 — 조용히 회색을
 * 칠하지 않는다.
 */
function imagePixels(image) {
  if (!image) return null;
  const got = pixelCache.get(image);
  if (got !== undefined) return got;
  let out = null;
  try {
    const w = image.width, h = image.height;
    let canvas = null;
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(w, h);
    else if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
    }
    if (canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      out = ctx.getImageData(0, 0, w, h);
    }
  } catch { out = null; }
  pixelCache.set(image, out);
  return out;
}

/**
 * 기하를 줄여 새 기하로 — three 는 주입받으므로 **원래 기하에서 틀을 빌린다**.
 *
 * 줄이는 셈 자체는 순수 층에 있다 (lib/meshLod.mjs). 여기서 하는 일은 three 의
 * 속성에서 배열을 꺼내고 돌려 담는 것뿐이다.
 */
function simplifiedGeometry(geom, ratio, stats) {
  const read = (name, size) => {
    const a = geom.getAttribute(name);
    if (!a) return null;
    const out = name === 'skinIndex' ? new Uint16Array(a.count * size) : new Float32Array(a.count * size);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) out[i * size + c] = a.getComponent(i, c);
    return out;
  };
  const index = new Uint32Array(geom.index ? geom.index.count : geom.getAttribute('position').count);
  if (geom.index) for (let i = 0; i < geom.index.count; i++) index[i] = geom.index.getX(i);
  else for (let i = 0; i < index.length; i++) index[i] = i;

  const small = simplifyMesh({
    position: read('position', 3),
    normal: read('normal', 3),
    color: read('color', 3),
    skinIndex: read('skinIndex', 4),
    skinWeight: read('skinWeight', 4),
    index,
  }, { ratio });
  if (stats) Object.assign(stats, small.stats);

  const out = new geom.constructor();
  const Attr = plainAttributeClass([geom]);
  out.setAttribute('position', new Attr(small.position, 3));
  out.setAttribute('normal', new Attr(small.normal, 3));
  if (small.color) out.setAttribute('color', new Attr(small.color, 3));
  out.setAttribute('skinIndex', new Attr(small.skinIndex, 4));
  out.setAttribute('skinWeight', new Attr(small.skinWeight, 4));
  out.setIndex(new Attr(small.index, 1));
  out.computeBoundingSphere?.();
  return out;
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

/**
 * 스킨 기하 여럿을 하나로 — 인스턴싱 셰이더가 읽는 속성만 잇는다.
 *
 * @param colors 조각마다 정점 색 (Float32Array) — 없으면 색을 안 담는다
 */
function mergeSkinned(geoms, colors = null) {
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
  if (colors) {
    // 색은 three 의 속성이 아니라 우리가 만든 배열이라 따로 잇는다.
    const arr = new Float32Array(total * 3);
    let at = 0;
    for (const c of colors) { arr.set(c, at); at += c.length; }
    out.setAttribute('color', new Attr(arr, 3));
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
