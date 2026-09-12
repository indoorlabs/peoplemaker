// 먼 군중이 **전부 같은 사람**이었다 — 팩 여럿을 한 화면에.
//
// ## 왜 하나로 안 되는가
//
// 먼 단계는 InstancedMesh 하나다. 인스턴스들은 **같은 기하**를 나눠 쓰고,
// 그것이 드로우콜을 하나로 줄인 방법 자체다. 그래서 몸이 둘이면 인스턴스
// 하나에 몸을 골라 넣을 길이 없다 — 몸마다 군중을 따로 둔다.
//
//   드로우콜 = 팩 수 (사람 수와는 여전히 무관하다)
//
// 몸 둘을 한 기하에 이어 붙이고 안 쓰는 쪽을 찌그러뜨리는 길도 있지만, 그러면
// **모든 사람이 모든 몸의 정점 값을 치른다.** 사람 5,000명에 몸 둘이면 정점이
// 두 배다. 드로우콜 하나를 아끼자고 삼각형을 두 배로 그리는 셈이라 안 한다.
//
// ## 여기서 하는 일
//
// 사람 번호 i 를 (어느 몸, 그 몸의 몇 번째)로 옮겨 주고, 나머지는 그대로
// 넘긴다. 쓰는 쪽은 몸이 몇이든 `place(i, …)` · `update(dt)` 하나로 본다.
//
// **누구를 어느 몸으로 할지는 쓰는 쪽이 정한다** (`kindOf`). 안 주면 고르게
// 섞는다. 성비나 연령 분포는 공간을 아는 쪽이 아는 것이고, 이 저장소는
// 그것을 지어내지 않는다 — 기본값은 "고르게" 이고 그 말만 한다.
//
// three 는 여기서도 **주입받는다.**

import { createInstancedCrowd } from './instancedCrowd.mjs';

/**
 * 몸 여러 벌로 먼 군중 하나.
 *
 * @param THREE  three 모듈 (주입)
 * @param kinds  [{ id, geometry, atlas, color? }] — 팩마다 하나
 * @param count  사람 수 (전부 합쳐서)
 * @param kindOf (i) => 몸 번호. 안 주면 고르게 섞는다 (i % kinds.length)
 */
export function createMixedCrowd({ THREE, kinds, count, kindOf }) {
  if (!Array.isArray(kinds) || !kinds.length) throw new Error('몸이 하나도 없다');
  if (!(count >= 0)) throw new Error('사람 수가 없다');
  for (const [k, kind] of kinds.entries()) {
    if (!kind?.geometry || !kind?.atlas) throw new Error(`${kind?.id ?? k} 에 살이나 아틀라스가 없다`);
  }

  const pick = kindOf || ((i) => i % kinds.length);

  // 사람 번호 → (몸, 그 몸에서의 번호). **먼저 다 세어 두고** 군중을 만든다 —
  // InstancedMesh 는 만들 때 칸 수를 정하므로, 나중에 늘릴 수 없다.
  const kindIndex = new Int32Array(count);
  const slotIndex = new Int32Array(count);
  const counts = new Array(kinds.length).fill(0);
  for (let i = 0; i < count; i++) {
    const k = pick(i);
    if (!(k >= 0 && k < kinds.length)) throw new Error(`${i}번 사람에게 없는 몸 ${k} 를 줬다`);
    kindIndex[i] = k;
    slotIndex[i] = counts[k]++;
  }

  const crowds = kinds.map((kind, k) => (counts[k]
    ? createInstancedCrowd({ THREE, geometry: kind.geometry, atlas: kind.atlas, count: counts[k], color: kind.color })
    : null));

  /**
   * 모든 몸이 다 갖고 있는 클립.
   *
   * 몸마다 클립이 다르면 같은 `clipId` 로 세워도 어떤 사람만 다른 짓을 한다
   * (아틀라스에 없는 클립은 첫 클립으로 물러선다). 그래서 **공통인 것**을
   * 세어 두고, 없는 클립을 시키면 그때 말한다.
   */
  const clipSets = kinds.map((kind) => new Set((kind.atlas.clips || []).map((c) => c.id)));
  const commonClips = [...(clipSets[0] || [])].filter((id) => clipSets.every((s) => s.has(id)));

  const route = (i) => {
    if (!(i >= 0 && i < count)) throw new Error(`${i}번 사람은 없다 (0~${count - 1})`);
    return { crowd: crowds[kindIndex[i]], slot: slotIndex[i], k: kindIndex[i] };
  };

  function place(i, opts) {
    const { crowd, slot, k } = route(i);
    if (opts?.clipId && !clipSets[k].has(opts.clipId)) {
      throw new Error(`${kinds[k].id ?? k} 에 ${opts.clipId} 가 없다 — 몸마다 다른 자세로 서는 것을 조용히 넘기지 않는다`);
    }
    crowd.place(slot, opts);
  }

  function moveTo(i, opts) {
    const { crowd, slot } = route(i);
    crowd.moveTo(slot, opts);
  }

  function setSpeed(i, timeScale) {
    const { crowd, slot } = route(i);
    crowd.setSpeed(slot, timeScale);
  }

  function update(dtS) {
    for (const c of crowds) if (c) c.update(dtS);
  }

  function rowOf(i) {
    const { crowd, slot } = route(i);
    return crowd.rowOf(slot);
  }

  function dispose() {
    for (const c of crowds) if (c) c.dispose();
  }

  return {
    /** scene 에 넣을 메시들 — 몸마다 하나 */
    meshes: crowds.filter(Boolean).map((c) => c.mesh),
    /** 몸마다 몇 명인가 */
    counts,
    /** 이 사람은 어느 몸인가 */
    kindOfPerson: (i) => kindIndex[i],
    commonClips,
    drawCalls: crowds.filter(Boolean).length,
    place, moveTo, setSpeed, update, rowOf, dispose,
  };
}
