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
import { PLANT_MAX_Y_M, angleDiff } from '../src/lib/packBuild.mjs';

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

  // ── 7. 시킨 쪽으로 **실제로** 가는가 ──
  //
  // 이 게이트의 새 요점이다. 앞서 여기서 한 번 지나갔다: 리그의 앞이 -Z 인데
  // 쓰는 쪽은 +Z 로 알고 있었고, 그래서 사람들이 시킨 것의 **정반대**로
  // 걸었다. 걷는 그림은 멀쩡하니 화면만 봐서는 한참 못 알아챈다.
  //
  // "각도를 넣으면 그 각도가 저장되는가" 를 물으면 안 된다 — 그것은 보정을
  // 지워도 통과한다. 몸이 **간 방향**을 재서 시킨 각도와 견준다.
  {
    const fwd = catalog.forwardRad;
    n++;
    if (typeof fwd !== 'number') g.fail('face/forward', '팩이 앞을 안 갖고 있다 — 다시 구워야 한다');

    for (const deg of [0, 90, 180, 270]) {
      const want = (deg * Math.PI) / 180;
      const p = player.spawn({ clipId: 'walk-forward', headingRad: want });
      const v0 = new THREE.Vector3();
      const v1 = new THREE.Vector3();
      player.update(0);
      player.boneWorld(p, 'mixamorig:Hips', v0);
      p.mixer.update(0.5);
      player.boneWorld(p, 'mixamorig:Hips', v1);
      const dx = v1.x - v0.x;
      const dz = v1.z - v0.z;
      const moved = Math.hypot(dx, dz);
      n++;
      if (moved < 0.1) { g.fail(`face/${deg}/still`, '반 초 동안 안 움직였다 — 방향을 잴 수가 없다'); continue; }
      const got = Math.atan2(dx, dz);
      const diff = angleDiff(got, want);   // ±π 를 넘어가는 자리를 접는다 (270° 와 -90° 는 같다)
      n++;
      if (diff > 0.09) {   // 5°
        g.fail(`face/${deg}`,
          `${deg}° 로 걸으라 했는데 ${((got * 180) / Math.PI).toFixed(1)}° 로 갔다 (${moved.toFixed(2)}m) — 리그의 앞 보정이 빠졌다`);
      }
    }

    // 제자리 모드: **걷는데 안 나아간다.**
    //
    // 경로를 따라 걷게 하는 쪽이 쓰는 모드다. 여기서 안 멈추면 클립도 옮기고
    // 쓰는 쪽도 옮겨서 두 번 간다.
    const ip = player.spawn({ clipId: 'walk-forward', headingRad: 0, inPlace: true });
    const a0 = player.boneWorld(ip, 'mixamorig:Hips', new THREE.Vector3());
    const f0 = player.boneWorld(ip, 'mixamorig:LeftFoot', new THREE.Vector3());
    ip.mixer.update(0.6);
    const a1 = player.boneWorld(ip, 'mixamorig:Hips', new THREE.Vector3());
    const f1 = player.boneWorld(ip, 'mixamorig:LeftFoot', new THREE.Vector3());
    n++;
    const drift = Math.hypot(a1.x - a0.x, a1.z - a0.z);
    if (drift > 0.05) g.fail('inplace/drift', `제자리로 달랬는데 0.6s 에 ${drift.toFixed(3)}m 갔다`);
    n++;
    // 그런데 **다리는 움직여야** 한다. 트랙을 통째로 지우면 이 검사가 잡는다.
    if (Math.abs(f1.y - f0.y) < 1e-3) {
      g.fail('inplace/frozen', '제자리로 만들었더니 발도 안 움직인다 — 자세 트랙까지 지웠다');
    }
    n++;
    // 제자리로 안 달라면 여전히 나아가야 한다 (기본값이 조용히 바뀌지 않게).
    const tr = player.spawn({ clipId: 'walk-forward', headingRad: 0 });
    const t0 = player.boneWorld(tr, 'mixamorig:Hips', new THREE.Vector3());
    tr.mixer.update(0.6);
    const t1 = player.boneWorld(tr, 'mixamorig:Hips', new THREE.Vector3());
    if (Math.hypot(t1.x - t0.x, t1.z - t0.z) < 0.5) {
      g.fail('inplace/default', '기본값인데 안 나아간다 — 제자리가 기본이 되어 버렸다');
    }
    // 클립 갈아 끼우기 — 멈춘 사람을 세워 두는 길.
    {
      const q = player.spawn({ clipId: 'walk-forward', inPlace: true });
      n++;
      if (q.clipId !== 'walk-forward') g.fail('playClip/spawn', '세울 때 클립이 안 맞는다');
      player.playClip(q, 'idle');
      n++;
      if (q.clipId !== 'idle') g.fail('playClip/switch', '클립을 안 바꾼다');
      // 발이 얼마나 오르내리는가 — **여러 번 재서 폭을 본다.**
      // 두 시점만 견주면 우연히 같은 높이를 잡는다. 실제로 그래서 이
      // 검사가 돌연변이를 놓쳤다.
      const footSwing = (person, seconds = 0.6, steps = 8) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < steps; i++) {
          person.mixer.update(seconds / steps);
          const y = player.boneWorld(person, 'mixamorig:LeftFoot', new THREE.Vector3()).y;
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
        return hi - lo;
      };
      n++;
      const idleSwing = footSwing(q);
      if (idleSwing > 0.03) {
        g.fail('playClip/still-walking', `서 있는 클립으로 바꿨는데 발이 ${idleSwing.toFixed(3)}m 오르내린다 — 옛 액션이 계속 돈다`);
      }
      n++;
      // 견줄 자 — 걷는 사람은 확실히 움직인다. 이게 없으면 위 검사가 "발이
      // 원래 안 움직인다" 로도 통과한다.
      const walker = player.spawn({ clipId: 'walk-forward', inPlace: true });
      const walkSwing = footSwing(walker);
      if (!(walkSwing > idleSwing * 3 + 0.03)) {
        g.fail('playClip/no-contrast', `걷는 사람의 발 폭 ${walkSwing.toFixed(3)}m 가 선 사람 ${idleSwing.toFixed(3)}m 와 안 갈린다`);
      }
      n++;
      // 같은 클립을 다시 주면 **재생 위치가 그대로여야** 한다. 프레임마다
      // 부르는 자리라, 여기서 되감기면 사람이 첫 자세에서 떤다.
      q.mixer.update(0.37);
      const tBefore = q.action.time;
      const actionBefore = q.action;
      player.playClip(q, 'idle');
      if (q.action !== actionBefore || Math.abs(q.action.time - tBefore) > 1e-6) {
        g.fail('playClip/noop', `같은 클립인데 다시 갈아 끼운다 (재생 위치 ${tBefore.toFixed(3)} → ${q.action.time.toFixed(3)})`);
      }
    }

    console.log(`  [재생] 팩의 앞 ${((fwd * 180) / Math.PI).toFixed(0)}° · 네 방향으로 걸려 보고 실제 간 방향을 쟀다`);
  }

  console.log(`  [재생] three ${THREE.REVISION} · 클립 ${gltfs.size}개를 읽고 사람 ${player.people.length}명을 세웠다`);
  return n;
});
