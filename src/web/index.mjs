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
export { planCrowd, affordable, frameCostMs, TIERS } from '../lib/crowdBudget.mjs';
export { dimensionMm, pendingDimensions, DIMENSIONS } from '../lib/anthropometry.mjs';
export { validateCatalog, LICENSES, packRedistributable, commercialClips } from '../lib/motionPack.mjs';

/**
 * 팩을 받아 온다.
 *
 * **경계에서 크게 실패한다.** 계약을 어긴 팩은 여기서 던진다 — 렌더 루프
 * 깊은 데서 조용히 이상해지는 것보다, 받는 자리에서 무엇이 틀렸는지 말하고
 * 멈추는 것이 낫다.
 *
 * @param url          팩 폴더 주소 (끝에 / 없이)
 * @param GLTFLoader   three/addons/loaders/GLTFLoader.js 의 클래스
 * @param fetchImpl    기본은 전역 fetch
 * @returns { catalog, gltfOf, bufferOf }
 */
export async function loadPack({ url, GLTFLoader, fetchImpl = globalThis.fetch }) {
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
  const gltfs = new Map();
  const buffers = new Map();
  for (const clip of catalog.clips) {
    const r = await fetchImpl(`${url}/clips/${clip.id}.glb`);
    if (!r.ok) throw new Error(`${clip.id}.glb 를 못 받았다 (HTTP ${r.status})`);
    const buf = await r.arrayBuffer();
    buffers.set(clip.id, buf);
    // parseAsync 가 없는 판도 있어서 콜백으로 감싼다.
    gltfs.set(clip.id, await new Promise((ok, no) => loader.parse(buf, '', ok, no)));
  }

  return {
    catalog,
    gltfOf: (id) => gltfs.get(id),
    // 굽는 쪽은 three 가 읽은 것이 아니라 **원본 바이트**를 본다 — 우리
    // 리더로 읽어야 FK 가 같은 수를 낸다 (게이트가 그 둘을 견줘 왔다).
    bufferOf: (id) => buffers.get(id),
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
    const buf = pack.bufferOf(id);
    if (!buf) throw new Error(`${id} 의 원본이 없다`);
    return { id, baked: bakeClip(parseGLB(new Uint8Array(buf))) };
  });
  const atlas = bakeAtlas(entries);
  // **앞을 같이 들려 보낸다.** 인스턴싱 쪽은 카탈로그를 안 보고 아틀라스만
  // 받으므로, 여기서 안 넘기면 먼 사람만 반대로 선다 — 가까운 사람과 먼
  // 사람이 서로 다른 쪽을 보는 화면이 된다.
  atlas.forwardRad = pack.catalog.forwardRad ?? null;
  return atlas;
}

/** 이 팩의 기하 하나 — 인스턴싱에 넘길 살. */
export function geometryOf(pack, clipId) {
  const gltf = pack.gltfOf(clipId || pack.catalog.clips[0].id);
  let geom = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !geom) geom = o.geometry; });
  if (!geom) throw new Error('스킨 메시가 없다');
  return geom;
}
