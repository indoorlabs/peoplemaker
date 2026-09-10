// 자세를 텍스처로 굽는다 — 드로우콜을 사람 수만큼에서 하나로.
//
// ## 왜
//
// 브라우저에서 재 보니 벽이 둘이었다 (lib/crowdBudget.mjs 의 BROWSER_MEASURED):
// 총 뼈 수와 **드로우콜**. 800명×뼈11(드로우콜 801)이 200명×뼈65(드로우콜
// 201)와 거의 같은 값이었다 — 사람 수 자체가 드로우콜로 값을 매긴다.
//
// 사람마다 스킨 메시를 하나씩 두면 드로우콜이 사람 수만큼이다. 대신 자세를
// **미리 구워** 텍스처에 넣고 InstancedMesh 하나로 그리면 드로우콜이 하나다.
// 그 대가는 자유도다: 구운 클립만 틀 수 있고, 섞어 넘기기(cross-fade)도 없다.
// 그래서 가까운 사람에게는 안 쓴다 — 멀리 있는 사람에게 쓴다.
//
// ## 왜 정점이 아니라 뼈 행렬을 굽는가
//
// 정점을 굽는 방식(VAT)은 텍스처가 **정점 수 × 프레임**이다. 진짜 캐릭터가
// 정점 10,000이고 36프레임이면 100만 개가 넘는다. 뼈 행렬은 **뼈 × 프레임**
// 이라 65×36 = 2,340개다 — 400배 작다. 살이 두꺼워져도 안 커진다.
//
// 이 파일은 three.js 도 DOM 도 import 하지 않는다. 굽는 것은 수뿐이고,
// 텍스처로 만드는 일은 어댑터가 한다 (src/web/instancedCrowd.mjs).

import {
  readAccessor, sampleAnimation, nodeWorldMatrix, parentMap, multiplyMat4, animationDurationS,
} from './gltf.mjs';

/**
 * 몇 프레임으로 구울 것인가.
 *
 * 30fps 로 구우면 1.2초짜리 걸음이 36프레임이다. 그보다 촘촘히 구워도 눈에
 * 안 띄고, 성기게 구우면 발이 미끄러진다 — 재생할 때 프레임 사이를 선형으로
 * 섞기 때문이다.
 */
export const BAKE_FPS = 30;

/**
 * 클립 하나의 자세를 굽는다.
 *
 * 뼈마다 **스키닝 행렬**(세계 변환 × 역바인드)을 낸다. 이것이 셰이더가
 * 정점에 그대로 곱하는 값이라, 굽는 쪽과 그리는 쪽 사이에 계산이 남지 않는다.
 *
 * @returns {
 *   frames, bones, fps, durationS,
 *   data: Float32Array,   // [프레임][뼈][16], 열 우선
 *   jointNodes: number[], // 뼈 순서 (skin.joints 그대로)
 * }
 */
export function bakeClip(doc, { animIndex = 0, skinIndex = 0, fps = BAKE_FPS, stripRootMotion = true } = {}) {
  const skin = doc.json.skins?.[skinIndex];
  if (!skin) throw new Error(`skin ${skinIndex} 이 없다`);
  const joints = skin.joints;
  if (!joints?.length) throw new Error('skin 에 뼈가 없다');

  const durationS = animationDurationS(doc, animIndex);
  if (!(durationS > 0)) throw new Error('길이가 0 인 클립은 못 굽는다');

  // 역바인드 행렬. 없으면 단위행렬이라고 규약에 적혀 있지만, 그 경우는
  // 이 저장소가 내보내는 팩에 없다 — 조용히 단위행렬을 쓰면 살이 뒤틀린 채로
  // 그려지고 원인을 찾기 어렵다.
  if (skin.inverseBindMatrices == null) throw new Error('역바인드 행렬이 없다');
  const ibm = readAccessor(doc, skin.inverseBindMatrices);

  const frames = Math.max(2, Math.round(durationS * fps) + 1);
  const bones = joints.length;
  const data = new Float32Array(frames * bones * 16);
  const parent = parentMap(doc);

  // 뿌리의 수평 이동을 뺄 기준. 첫 프레임의 뿌리 위치다.
  const rootIdx = joints[0];
  const at0 = nodeWorldMatrix(doc, rootIdx, sampleAnimation(doc, animIndex, 0), parent);
  const base = [at0[12], at0[14]];

  let strippedM = 0;
  for (let f = 0; f < frames; f++) {
    // **마지막 프레임이 정확히 끝이어야 한다.** frames-1 로 나누지 않고
    // frames 로 나누면 마지막 프레임이 끝보다 조금 앞이라, 되돌아 이어 붙일 때
    // 발이 튄다.
    const t = (durationS * f) / (frames - 1);
    const sampled = sampleAnimation(doc, animIndex, t);

    // **이동은 굽지 않는다.**
    //
    // 게이트가 이것을 먼저 밟았다: 끝 프레임에서 three 와 1.62 만큼 갈렸는데,
    // 그 수는 정확히 이 클립의 걸음 거리(1.35m/s × 1.2s)였다. three 는 한
    // 바퀴에서 되감아 원점으로 돌아가고, 굽는 쪽은 끝 자세(1.62m 앞)를 굽고
    // 있었다.
    //
    // 어느 쪽이 옳은가 — **이동을 빼는 쪽**이다. 구운 자세로 여러 사람을
    // 그리면 사람마다 제 경로를 가는데, 이동까지 구워 넣으면 모두가 같은
    // 방향으로 끌려가고 한 바퀴마다 제자리로 튄다. 이동은 인스턴스의 변환이
    // 나르는 것이 맞다 (계약의 rootMotion 이 말하는 그것이다).
    const rootWorld = stripRootMotion ? nodeWorldMatrix(doc, rootIdx, sampled, parent) : null;
    const dx = rootWorld ? rootWorld[12] - base[0] : 0;
    const dz = rootWorld ? rootWorld[14] - base[1] : 0;
    if (rootWorld) strippedM = Math.max(strippedM, Math.hypot(dx, dz));

    for (let b = 0; b < bones; b++) {
      const world = nodeWorldMatrix(doc, joints[b], sampled, parent);
      const inv = Array.from(ibm.slice(b * 16, b * 16 + 16));
      const m = multiplyMat4(world, inv);       // 세계 × 역바인드 = 스키닝 행렬
      // 수평만 뺀다. 위아래(걸을 때의 출렁임)는 자세의 일부다.
      m[12] -= dx;
      m[14] -= dz;
      data.set(m, (f * bones + b) * 16);
    }
  }
  return {
    frames, bones, fps, durationS, data, jointNodes: joints.slice(),
    stripRootMotion, strippedM: +strippedM.toFixed(4),
  };
}

/**
 * 텍스처 크기.
 *
 * 행렬 하나가 텍셀 넷(RGBA float)이므로 가로가 뼈×4, 세로가 프레임이다.
 * 가로가 기계의 상한(보통 4,096~16,384)을 넘으면 못 만든다 — 뼈 1,024개가
 * 그 자리이고, 사람 리그로는 오지 않는다. 그래도 넘으면 말해 준다.
 */
export function textureSize(baked) {
  return { width: baked.bones * 4, height: baked.frames };
}

/** 굽는 데 드는 메모리 (바이트) — 반정밀도로 올리면 절반이다. */
export function bakedBytes(baked) {
  return baked.frames * baked.bones * 16 * 4;
}

/**
 * 여러 클립을 한 텍스처에 이어 붙인다.
 *
 * 클립마다 텍스처를 따로 두면 재료가 클립 수만큼 생기고, 그러면 드로우콜을
 * 줄인 뜻이 없다 — 재료가 다르면 배치가 갈라지기 때문이다.
 *
 * @returns { width, height, data, clips: [{ id, row, frames, durationS }] }
 */
export function bakeAtlas(entries) {
  if (!entries.length) throw new Error('구울 클립이 없다');
  const bones = entries[0].baked.bones;
  for (const e of entries) {
    if (e.baked.bones !== bones) {
      throw new Error(`${e.id}: 뼈가 ${e.baked.bones}개다 — 한 아틀라스의 클립은 뼈 수가 같아야 한다`);
    }
  }
  const height = entries.reduce((s, e) => s + e.baked.frames, 0);
  const width = bones * 4;
  const data = new Float32Array(width * 4 * height);
  const clips = [];
  let row = 0;
  for (const e of entries) {
    data.set(e.baked.data, row * bones * 16);
    clips.push({ id: e.id, row, frames: e.baked.frames, durationS: e.baked.durationS });
    row += e.baked.frames;
  }
  return { width, height, bones, data, clips };
}

/**
 * 시각 t 가 아틀라스의 어느 줄인가 (되돌아 이어 붙임).
 *
 * 재생하는 쪽이 셰이더에 넘길 값이라, 셰이더와 **같은 셈**을 여기서도 할 수
 * 있어야 한다 — 게이트가 둘을 견주려면 필요하다.
 */
export function rowAt(clip, timeS) {
  const span = clip.frames - 1;
  const u = clip.durationS > 0 ? (timeS % clip.durationS) / clip.durationS : 0;
  return clip.row + u * span;
}
