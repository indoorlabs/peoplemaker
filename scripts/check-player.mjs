// check:player — 우리가 잰 값이 **렌더러 안에서도** 맞는가.
//
// 여기까지 오는 동안 값은 전부 우리 코드가 재고 우리 코드가 검사했다. 그
// 왕복은 닫혀 있다 — 내 리더가 읽고 내 리더가 확인한다. **내가 쓴 GLB 를
// three.js 가 못 읽어도 게이트는 통과한다.** 그 구멍을 여기서 막는다.
//
// 다섯을 본다:
//   1. three 가 우리 GLB 를 읽는가
//   2. 계약의 길이와 three 의 길이가 같은가
//   3. 이동 클립이 정말 그 속도로 나아가는가 (three 의 스켈레톤으로)
//   4. 우리가 잰 발 접촉 시각에 **three 기준으로도** 발이 땅에 있는가
//   5. 사람을 여럿 세우면 서로 다르게 움직이는가 (스킨 복제의 첫 함정)

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import { createClipPlayer } from '../src/web/clipPlayer.mjs';
import { pickWalkClip, contactsAt, durationAt, strideS, TIME_SCALE_MAX } from '../src/lib/packRuntime.mjs';
import { PLANT_MAX_Y_M } from '../src/lib/packBuild.mjs';

const PACK = path.join(ROOT, 'packs', 'ref-synthetic');

runGate('check-player', async (g) => {
  let n = 0;

  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const SkeletonUtils = await import('three/examples/jsm/utils/SkeletonUtils.js');

  const catalog = JSON.parse(fs.readFileSync(path.join(PACK, 'catalog.json'), 'utf8'));
  const loader = new GLTFLoader();
  const gltfs = new Map();

  // ── 1. three 가 읽는가 ──
  for (const clip of catalog.clips) {
    const file = path.join(PACK, 'clips', `${clip.id}.glb`);
    n++;
    if (!fs.existsSync(file)) { g.fail(`load/${clip.id}/missing`, 'GLB 가 없다'); continue; }
    const buf = fs.readFileSync(file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    let gltf = null;
    let err = null;
    await new Promise((res) => loader.parse(ab, '', (r) => { gltf = r; res(); }, (e) => { err = e; res(); }));
    if (!gltf) { g.fail(`load/${clip.id}`, `three 가 못 읽었다 — ${err?.message || err}`); continue; }
    gltfs.set(clip.id, gltf);

    n++;
    if (gltf.animations.length !== 1) g.fail(`load/${clip.id}/anims`, `애니메이션이 ${gltf.animations.length}개다`);
    n++;
    // 계약이 말하는 길이와 three 가 읽은 길이가 다르면, 둘 중 하나가 거짓이다.
    const d = gltf.animations[0]?.duration ?? 0;
    if (Math.abs(d - clip.durationS) > 0.01) {
      g.fail(`load/${clip.id}/duration`, `계약 ${clip.durationS}s · three ${d.toFixed(3)}s`);
    }
    n++;
    let skinned = 0;
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
    if (!skinned) g.fail(`load/${clip.id}/skin`, '스킨 메시가 없다 — 뼈만 있는 파일이면 화면에 아무것도 안 뜬다');
  }
  if (gltfs.size !== catalog.clips.length) { g.setupFail('클립을 다 못 읽어 아래를 못 본다'); return n; }

  const player = createClipPlayer({
    THREE, SkeletonUtils, catalog, gltfOf: (id) => gltfs.get(id),
  });

  // ── 2. 이동 클립이 그 속도로 나아가는가 ──
  //
  // 우리 FK 로 잰 값을 three 의 스켈레톤으로 다시 잰다. 둘이 다르면 한쪽이
  // 틀렸고, 그때까지는 어느 쪽인지 알 수 없다 — 그래서 재는 자를 두 개 둔다.
  {
    const walk = catalog.clips.find((c) => c.id === 'walk-forward');
    const p = player.spawn({ clipId: walk.id });
    // **파일에 적힌 이름으로 찾는다.** three 가 콜론을 지우는 것은 재생기가
    // 흡수해야 할 일이지, 쓰는 쪽이 알아야 할 일이 아니다.
    const hips = player.resolveBone(p, 'mixamorig:Hips');
    n++;
    if (!hips) { g.fail('walk/hips', 'three 쪽에서 엉덩이 뼈를 못 찾았다'); }
    else {
      const v0 = new THREE.Vector3();
      const v1 = new THREE.Vector3();
      player.update(0);
      hips.getWorldPosition(v0);
      const dt = 0.5;
      player.update(dt);
      hips.getWorldPosition(v1);
      const moved = Math.hypot(v1.x - v0.x, v1.z - v0.z);
      const want = walk.speedMps * dt;
      n++;
      if (Math.abs(moved - want) > want * 0.08) {
        g.fail('walk/speed', `계약은 ${walk.speedMps}m/s 인데 three 안에서 ${dt}s 에 ${moved.toFixed(3)}m 갔다 (${want.toFixed(3)}m 여야)`);
      }
    }
  }

  // ── 3. 잰 접촉 시각에 발이 땅에 있는가 ──
  //
  // **이 검사가 이 게이트의 요점이다.** 접촉 시각은 우리 FK 가 낸 값이고,
  // 그것을 쓰는 것은 three 안의 뼈다. 두 좌표계가 어긋나면 계단에 발을
  // 맞췄는데 화면에서는 공중에 뜬다.
  {
    const walk = catalog.clips.find((c) => c.id === 'walk-forward');
    const p2 = player.spawn({ clipId: walk.id });
    for (const c of walk.contacts) {
      n++;
      // 접촉 시각으로 감는다. 새 사람에게 한 번에 그 시각으로 보낸다.
      p2.action.time = 0;
      p2.mixer.update(0);
      p2.mixer.update(c.atS);
      const boneName = c.part === 'foot-l' ? 'mixamorig:LeftFoot' : 'mixamorig:RightFoot';
      const w = player.boneWorld(p2, boneName);
      if (!w) { g.fail(`contact/${c.part}/bone`, `${boneName} 을 three 쪽에서 못 찾았다`); continue; }
      // 우리가 "닿는다" 고 한 문턱과 같은 자를 쓴다. 여유를 1cm 준다 —
      // 샘플 간격(1/60s)만큼 시각이 어긋날 수 있다.
      if (w.y > PLANT_MAX_Y_M + 0.01) {
        g.fail(`contact/${c.part}/${c.atS}`,
          `우리가 잰 접촉 ${c.atS}s 에 three 기준 발 높이가 ${w.y.toFixed(3)}m 다 — 두 좌표계가 어긋난다`);
      }
    }
  }

  // ── 4. 여럿을 세우면 서로 다르게 움직이는가 ──
  //
  // 스킨 메시를 그냥 clone 하면 뼈가 원본을 가리켜서, 열 명이 한 몸처럼
  // 움직인다. 화면에서는 "왜 다 똑같이 걷지" 로 보이고 원인을 찾기 어렵다.
  {
    const a = player.spawn({ clipId: 'walk-forward' });
    const b = player.spawn({ clipId: 'walk-forward' });
    a.mixer.update(0.3);          // 위상을 어긋나게
    b.mixer.update(0.9);
    const va = player.boneWorld(a, 'mixamorig:LeftFoot', new THREE.Vector3());
    const vb = player.boneWorld(b, 'mixamorig:LeftFoot', new THREE.Vector3());
    n++;
    if (!va || !vb) g.fail('clone/bone', '복제한 사람의 뼈를 못 찾았다');
    else if (Math.abs(va.y - vb.y) < 1e-4) {
      g.fail('clone/shared', '두 사람의 발 높이가 같다 — 뼈가 함께 움직인다');
    }

    // **살이 가리키는 뼈**를 본다.
    //
    // 위 검사만으로는 모자랐다. 그냥 `clone(true)` 해도 **이름으로 찾은 뼈**는
    // 각자 복제되어 따로 움직이므로 발 높이가 갈린다 — 그런데 정작 스킨
    // 메시의 skeleton 은 여전히 **원본 뼈**를 가리킨다. 화면에서는 열 명이
    // 한 몸처럼 움직이는데, 게이트는 통과한다. 일부러 SkeletonUtils 를 빼
    // 보고서 알았다.
    const meshOf = (p) => { let m = null; p.root.traverse((o) => { if (o.isSkinnedMesh && !m) m = o; }); return m; };
    const under = (root, obj) => { let c = obj; while (c) { if (c === root) return true; c = c.parent; } return false; };
    for (const [who, p] of [['a', a], ['b', b]]) {
      n++;
      const mesh = meshOf(p);
      if (!mesh?.skeleton?.bones?.length) { g.fail(`clone/${who}/skeleton`, '스킨 메시나 스켈레톤이 없다'); continue; }
      const outside = mesh.skeleton.bones.filter((bone) => !under(p.root, bone)).length;
      if (outside) {
        g.fail(`clone/${who}/bones`,
          `스켈레톤의 뼈 ${outside}/${mesh.skeleton.bones.length} 개가 이 사람 밖을 가리킨다 — 살이 남의 뼈를 따라간다 (SkeletonUtils.clone 이 필요하다)`);
      }
    }
  }

  // ── 5. 속도를 주면 클립과 재생 속도를 고르는가 ──
  {
    const cases = [
      [1.35, 'walk-forward', 1],       // 딱 맞는 클립이 있다
      [1.9, 'walk-fast', 1],           // 다른 클립이 더 가깝다
      [1.6, null, null],               // 사이 — 무엇이든 고르되 한계 안이어야
      [0.4, null, null],               // 아주 느림 — 한계에 걸린다
    ];
    for (const [mps, wantClip, wantScale] of cases) {
      n++;
      const pick = pickWalkClip(catalog, mps);
      if (!pick) { g.fail(`pick/${mps}/none`, '고르지 못한다'); continue; }
      if (wantClip && pick.clipId !== wantClip) {
        g.fail(`pick/${mps}/clip`, `${mps}m/s 에 ${pick.clipId} 를 골랐다 — ${wantClip} 가 더 가깝다`);
      }
      if (wantScale && Math.abs(pick.timeScale - wantScale) > 0.01) {
        g.fail(`pick/${mps}/scale`, `재생 속도가 ${pick.timeScale} 다 — ${wantScale} 여야`);
      }
      n++;
      if (pick.timeScale > TIME_SCALE_MAX + 1e-9 || pick.timeScale < 1 / TIME_SCALE_MAX - 1e-9) {
        g.fail(`pick/${mps}/limit`, `재생 속도 ${pick.timeScale} 가 한계 밖이다 — 필름을 빨리 감은 것처럼 보인다`);
      }
    }
    n++;
    // 아주 느린 걸음은 한계에 걸린다는 것을 **말해야** 한다. 조용히 맞춘
    // 척하면 쓰는 쪽이 도착 시각을 그 값으로 계산한다.
    const slow = pickWalkClip(catalog, 0.4);
    if (!slow?.clamped) g.fail('pick/clamped', '한계에 걸렸는데 그렇다고 안 알린다');
    n++;
    if (Math.abs(slow.effectiveMps - 1.35 / TIME_SCALE_MAX) > 0.02) {
      g.fail('pick/effective', `한계에 걸렸을 때 실제 속도가 ${slow.effectiveMps} 로 안 나온다`);
    }
  }

  // ── 6. 재생 속도가 접촉과 길이를 함께 옮기는가 ──
  {
    const walk = catalog.clips.find((c) => c.id === 'walk-forward');
    n++;
    const half = contactsAt(walk, 0.5);
    if (Math.abs(half[0].atS - walk.contacts[0].atS * 2) > 0.01) {
      g.fail('scale/contacts', '재생 속도를 절반으로 했는데 접촉 시각이 두 배가 안 된다');
    }
    n++;
    if (Math.abs(durationAt(walk, 0.5) - walk.durationS * 2) > 0.01) {
      g.fail('scale/duration', '재생 속도를 절반으로 했는데 길이가 두 배가 안 된다');
    }
    n++;
    const s1 = strideS(walk, 1);
    const s2 = strideS(walk, 2);
    if (!s1) g.fail('stride/none', '걸음 주기가 안 나온다');
    else if (Math.abs(s2 - s1 / 2) > 0.01) g.fail('stride/scale', `두 배로 돌렸는데 주기가 ${s1} → ${s2} 다`);
    else console.log(`  [재생] 걸음 주기 ${s1}s · 1.35m/s → 보폭 ${(1.35 * s1).toFixed(2)}m`);
  }

  console.log(`  [재생] three ${THREE.REVISION} · 클립 ${gltfs.size}개를 읽고 사람 ${player.people.length}명을 세웠다`);
  return n;
});
