// check:mix — 몸을 섞어 세울 때 **사람이 뒤바뀌지 않는가.**
//
// 먼 군중은 몸마다 InstancedMesh 하나다. 그래서 사람 번호 i 는 (어느 몸, 그
// 몸의 몇 번째)로 옮겨진다. 그 옮김이 틀리면 **A 를 세우라 했는데 B 가 선다** —
// 화면에는 사람이 제 수만큼 서 있으므로, 두 몸이 비슷하게 생겼으면 아무도
// 못 알아챈다. 자리를 옮기라 한 사람 대신 남이 움직이는 식이다.
//
// 그래서 수로 묻는다:
//   1. 몸마다 몇 명인가 — 합이 시킨 수인가, 기본은 고르게인가
//   2. i 번 사람을 놓으면 **그 몸의 그 칸**이 움직이는가 (남은 안 움직인다)
//   3. 옮기기(moveTo)가 재생 시각을 안 건드리는가 — 한 몸일 때와 같은 약속
//   4. 없는 클립·없는 사람·빈 몸을 **말하고 막는가**
//   5. 잰 표가 값 노릇을 하는가 (섞으면 드로우콜이 늘고, 예산이 그것을 안다)
//
// 두 몸은 기준 팩 하나에서 만든다 — 하나는 살 그대로, 하나는 줄인 살.
// 정점 수가 달라서 어느 쪽에 놓였는지 수로 갈린다.

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import { PACK_MEASURED, planCrowdMeasured, frameMsAt } from '../src/lib/crowdBudget.mjs';

const PACK = path.join(ROOT, 'packs', 'ref-synthetic');

/** 파일을 주소처럼 읽는 fetch — 브라우저 없이 문을 열어 보려고. */
const fileFetch = async (u) => {
  const f = path.join(PACK, u.replace(/^pack:\/\/ref-synthetic\//, ''));
  if (!fs.existsSync(f)) return { ok: false, status: 404 };
  const b = fs.readFileSync(f);
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(b.toString('utf8')),
    arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  };
};

runGate('check-mix', async (g) => {
  let n = 0;

  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const api = await import('../src/web/index.mjs');

  let pack = null;
  try { pack = await api.loadPack({ url: 'pack://ref-synthetic', GLTFLoader, fetchImpl: fileFetch }); }
  catch (e) { g.setupFail(`팩을 못 받았다 — ${e.message}`); return n; }

  const atlas = api.bakeFromPack(pack, ['walk-forward', 'idle']);
  const big = api.geometryOf(pack);
  const small = api.geometryOf(pack, { lod: 0.5 });
  const kinds = [
    { id: 'big', geometry: big, atlas },
    { id: 'small', geometry: small, atlas },
  ];
  n++;
  if (!(small.getAttribute('position').count < big.getAttribute('position').count)) {
    g.setupFail('두 몸의 정점 수가 같아 어느 쪽에 놓였는지 못 가른다');
    return n;
  }

  // ── 1. 나누기 ──
  {
    const crowd = api.createMixedCrowd({ THREE, kinds, count: 7 });
    n++;
    if (crowd.counts.reduce((s, c) => s + c, 0) !== 7) {
      g.fail('split/total', `몸마다 ${crowd.counts.join('+')} = ${crowd.counts.reduce((s, c) => s + c, 0)}명인데 7명을 시켰다`);
    }
    n++;
    // 기본은 고르게 — 7명이면 4·3 이다.
    if (crowd.counts.join() !== '4,3') g.fail('split/even', `고르게 나누면 4,3 인데 ${crowd.counts.join()} 다`);
    n++;
    if (crowd.meshes.length !== 2) g.fail('split/meshes', `메시가 ${crowd.meshes.length}개다 — 몸마다 하나여야`);
    n++;
    if (crowd.drawCalls !== 2) g.fail('split/draws', `드로우콜을 ${crowd.drawCalls} 라고 한다 — 몸이 둘이면 둘이다`);
    n++;
    for (let i = 0; i < 7; i++) {
      if (crowd.kindOfPerson(i) !== i % 2) { g.fail('split/who', `${i}번이 ${crowd.kindOfPerson(i)}번 몸이다`); break; }
    }
    n++;
    // 한쪽이 0명이면 그 메시는 아예 안 만든다 — 빈 InstancedMesh 는 드로우콜만 쓴다.
    const oneSided = api.createMixedCrowd({ THREE, kinds, count: 3, kindOf: () => 0 });
    if (oneSided.meshes.length !== 1 || oneSided.counts.join() !== '3,0') {
      g.fail('split/empty', `한쪽만 쓰는데 메시가 ${oneSided.meshes.length}개 · ${oneSided.counts.join()}`);
    }
    n++;
    // 쓰는 쪽이 정한 나눔을 그대로 따르는가.
    const custom = api.createMixedCrowd({ THREE, kinds, count: 10, kindOf: (i) => (i < 7 ? 0 : 1) });
    if (custom.counts.join() !== '7,3') g.fail('split/custom', `시킨 대로 안 나눈다 (${custom.counts.join()})`);
    crowd.dispose();
    oneSided.dispose();
    custom.dispose();
  }

  // ── 2. 놓으면 그 몸의 그 칸이 움직이는가 ──
  {
    const crowd = api.createMixedCrowd({ THREE, kinds, count: 6 });
    const at = (mesh, slot) => {
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(slot, m);
      const p = new THREE.Vector3();
      m.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
      return p;
    };
    // 3번 사람 = 둘째 몸(1)의 둘째 칸(1). 거기에만 자리가 들어가야 한다.
    crowd.place(3, { position: [5, 0, -7], headingRad: 0, clipId: 'walk-forward' });
    n++;
    const got = at(crowd.meshes[1], 1);
    if (Math.abs(got.x - 5) > 1e-5 || Math.abs(got.z + 7) > 1e-5) {
      g.fail('place/where', `3번을 (5,-7)에 놓았는데 둘째 몸 둘째 칸이 (${got.x.toFixed(2)},${got.z.toFixed(2)}) 다`);
    }
    n++;
    // 첫째 몸은 아무도 안 건드려야 한다.
    const other = at(crowd.meshes[0], 1);
    if (Math.hypot(other.x - 5, other.z + 7) < 1e-5) {
      g.fail('place/leak', '3번을 놓았는데 다른 몸의 사람도 같이 움직였다');
    }
    n++;
    // 사람마다 제 재생 시각을 갖는가 — 시각을 다르게 줬으면 줄이 달라야 한다.
    crowd.place(0, { position: [0, 0, 0], clipId: 'walk-forward', timeOffsetS: 0 });
    crowd.place(2, { position: [1, 0, 0], clipId: 'walk-forward', timeOffsetS: 0.4 });
    crowd.update(0);
    if (Math.abs(crowd.rowOf(0) - crowd.rowOf(2)) < 1e-6) {
      g.fail('place/phase', '시작 시각을 다르게 줬는데 둘이 같은 줄을 본다');
    }
    n++;
    // 시간을 흘리면 **두 몸 다** 나아가는가 — 한쪽만 update 하면 반이 얼어붙는다.
    const before = [crowd.rowOf(0), crowd.rowOf(3)];
    crowd.update(0.2);
    if (!(crowd.rowOf(0) !== before[0] && crowd.rowOf(3) !== before[1])) {
      g.fail('update/all', `시간을 흘렸는데 ${crowd.rowOf(0) === before[0] ? '첫째' : '둘째'} 몸이 멈춰 있다`);
    }
    n++;
    // **옮기기는 재생 시각을 안 건드린다** — 한 몸일 때와 같은 약속이다.
    // (place 로 옮기면 매 프레임 첫 자세로 돌아가 다리가 떨린다.)
    //
    // **옮긴 뒤 update 를 한 번 더 돌리고 본다.** rowOf 는 update 가 적어 둔
    // 값을 읽으므로, 안 돌리고 보면 되감겼어도 옛 값이 그대로 읽힌다 —
    // 처음에 그렇게 써서, 일부러 되감아 보아도 게이트가 통과했다.
    crowd.update(0.17);
    const row = crowd.rowOf(3);
    crowd.moveTo(3, { position: [9, 0, 9] });
    crowd.update(0);
    if (Math.abs(crowd.rowOf(3) - row) > 1e-9) {
      g.fail('move/time', `자리만 옮겼는데 재생 시각이 ${row.toFixed(3)} → ${crowd.rowOf(3).toFixed(3)} 로 달라졌다`);
    }
    n++;
    const moved = at(crowd.meshes[1], 1);
    if (Math.abs(moved.x - 9) > 1e-5) g.fail('move/where', `옮겼는데 자리가 ${moved.x.toFixed(2)} 다`);
    n++;
    // 속도만 바꾸기 — 느리게 준 사람이 덜 나아간다.
    crowd.place(1, { position: [0, 0, 0], clipId: 'walk-forward' });
    crowd.place(5, { position: [0, 0, 0], clipId: 'walk-forward' });
    crowd.setSpeed(5, 0.25);
    const r0 = [crowd.rowOf(1), crowd.rowOf(5)];
    crowd.update(0.3);
    const d1 = crowd.rowOf(1) - r0[0];
    const d5 = crowd.rowOf(5) - r0[1];
    if (!(d5 < d1 - 1e-9)) g.fail('speed/one', `속도를 4분의 1로 준 사람이 ${d5.toFixed(3)} · 그대로인 사람이 ${d1.toFixed(3)} 만큼 갔다`);
    crowd.dispose();
  }

  // ── 3. 말하고 막는가 ──
  {
    const crowd = api.createMixedCrowd({ THREE, kinds, count: 4 });
    n++;
    try {
      crowd.place(9, { position: [0, 0, 0] });
      g.fail('guard/index', '없는 사람을 놓아 준다');
    } catch { /* 던지는 것이 맞다 */ }
    n++;
    try {
      crowd.place(0, { position: [0, 0, 0], clipId: '없는클립' });
      g.fail('guard/clip', '아틀라스에 없는 클립을 받아 준다 — 그 사람만 다른 자세로 선다');
    } catch { /* 던지는 것이 맞다 */ }
    n++;
    // 두 몸이 다 가진 클립만 공통이라고 해야 한다.
    if (crowd.commonClips.join() !== atlas.clips.map((c) => c.id).join()) {
      g.fail('guard/common', `공통 클립이 ${crowd.commonClips.join()} 다 — 아틀라스에는 ${atlas.clips.map((c) => c.id).join()}`);
    }
    crowd.dispose();
    n++;
    try {
      api.createMixedCrowd({ THREE, kinds: [], count: 3 });
      g.fail('guard/nokinds', '몸이 없는데 세워 준다');
    } catch { /* 맞다 */ }
    n++;
    try {
      api.createMixedCrowd({ THREE, kinds: [{ id: 'x' }], count: 3 });
      g.fail('guard/nogeom', '살도 아틀라스도 없는 몸을 받아 준다');
    } catch { /* 맞다 */ }
    n++;
    try {
      api.createMixedCrowd({ THREE, kinds, count: 4, kindOf: () => 5 });
      g.fail('guard/badkind', '없는 몸 번호를 받아 준다');
    } catch { /* 맞다 */ }
  }

  // ── 4. 잰 표 ──
  {
    const t = PACK_MEASURED.rocketbox;
    const mixed = t.instancedLod.mixed;
    n++;
    if (!mixed?.points?.length || mixed.points.length < 3) {
      g.fail('table/points', '섞어 잰 점이 셋도 안 된다');
    } else {
      n++;
      for (let i = 1; i < mixed.points.length; i++) {
        if (!(mixed.points[i].frameMs > mixed.points[i - 1].frameMs)) {
          g.fail('table/monotonic', `${mixed.points[i].people}명이 앞보다 안 비싸다`);
        }
      }
      n++;
      if (!mixed.points.every((p) => p.drawCalls > t.instancedLod.points[0].drawCalls)) {
        g.fail('table/draws', '섞었는데 드로우콜이 안 늘었다 — 몸마다 하나씩 늘어야 한다');
      }
      n++;
      if (!(mixed.kinds?.length >= 2)) g.fail('table/kinds', '어떤 몸들을 섞어 쟀는지가 없다');
    }
    n++;
    // 섞어도 예산 안 사람 수가 크게 안 줄어야 한다 — 그것이 이 길을 고른 까닭이다.
    const one = planCrowdMeasured(5000, 4, t, ['full', 'instancedLod']);
    const two = planCrowdMeasured(5000, 4, t, ['full', 'instancedLod'], { kinds: 2 });
    const stood = (p) => p.mix.reduce((s, m) => s + m.count, 0);
    if (!(stood(two) > stood(one) * 0.8)) {
      g.fail('plan/mixed-cost', `몸을 둘로 섞으니 ${stood(two)}명 — 하나일 때 ${stood(one)}명의 80% 도 안 된다`);
    }
    n++;
    if (two.ms > 4 + 1e-9) g.fail('plan/mixed-budget', `예산 4ms 인데 ${two.ms}ms 를 쓴다`);
    n++;
    if (two.kinds !== 2 || two.mixedMeasured !== true) {
      g.fail('plan/mixed-says', '섞어 세운다고 했는데 결과가 그 말을 안 한다');
    }
    n++;
    // 섞어 잰 표가 없는 팩이면 **없다고 말해야** 한다 — 한 몸 표를 슬쩍 쓰지 않는다.
    const bare = { ...t, instancedLod: { ...t.instancedLod, mixed: null } };
    if (planCrowdMeasured(500, 4, bare, ['full', 'instancedLod'], { kinds: 3 }).mixedMeasured !== false) {
      g.fail('plan/mixed-honest', '섞어 잰 표가 없는데 있는 척한다');
    }
    n++;
    // 셈이 표를 따라가는가.
    for (const p of mixed.points) {
      if (Math.abs(frameMsAt(mixed.points, p.people).ms - p.frameMs) > 1e-6) {
        g.fail('table/at-point', `${p.people}명을 표와 다르게 센다`);
      }
    }
    console.log(`  [섞기] 4ms · 5,000명 요청 → 한 몸 ${stood(one)}명(드로우콜 1) · 두 몸 ${stood(two)}명(드로우콜 2)`);
  }

  return n;
});
