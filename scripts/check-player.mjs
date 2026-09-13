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
import { crossFadeS, CROSSFADE_MAX_S } from '../src/lib/packRuntime.mjs';
import { createClipPlayer } from '../src/web/clipPlayer.mjs';
import { pickWalkClip, walkClips, contactsAt, durationAt, strideS, TIME_SCALE_MAX } from '../src/lib/packRuntime.mjs';
import { PLANT_MAX_Y_M, angleDiff } from '../src/lib/packBuild.mjs';

const PACK = path.join(ROOT, 'packs', 'ref-synthetic');

runGate('check-player', async (g) => {
  let n = 0;

  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const SkeletonUtils = await import('three/examples/jsm/utils/SkeletonUtils.js');

  const catalog = JSON.parse(fs.readFileSync(path.join(PACK, 'catalog.json'), 'utf8'));
  const gltfs = new Map();

  // ── 1. three 가 읽는가 ──
  //
  // 앱이 쓰는 문(loadPack)으로 받는다. 팩이 몸 + 동작으로 나뉜 뒤로는 클립
  // 파일 하나만 읽으면 살이 없다 — 앱과 다른 길로 읽으면 앱이 못 보는 것을 본다.
  const { loadPack } = await import('../src/web/index.mjs');
  const fileFetch = async (u) => {
    const f = path.join(PACK, u.replace(/^pack:\/\/ref-synthetic\//, ''));
    if (!fs.existsSync(f)) return { ok: false, status: 404 };
    const b = fs.readFileSync(f);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    return { ok: true, status: 200, json: async () => JSON.parse(b.toString('utf8')), arrayBuffer: async () => ab };
  };
  let pack = null;
  try { pack = await loadPack({ url: 'pack://ref-synthetic', GLTFLoader, fetchImpl: fileFetch }); }
  catch (e) { g.setupFail(`팩을 못 받았다 — ${e.message}`); return n; }
  for (const clip of catalog.clips) {
    n++;
    const gltf = pack.gltfOf(clip.id);
    if (!gltf) { g.fail(`load/${clip.id}`, 'three 가 못 읽었다'); continue; }
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
      // **갈아 끼우기는 이제 즉시가 아니다.** 섞어 넘기기가 들어오면서 앞
      // 클립이 0.25초 동안 옅어지며 남는다 — 그 동안 발이 아직 걷는다.
      // 이 검사는 "옛 액션이 **계속** 도는가" 를 보는 것이므로, 섞기가 끝난
      // 뒤부터 재야 한다. (안 고쳤더니 선 사람의 발 폭이 0.002 → 0.007m 로
      // 늘어 견줄 자와 안 갈렸다.)
      n++;
      if (!(q.fadeS > 0)) g.fail('playClip/fade', `갈아 끼웠는데 섞는 시간이 ${q.fadeS} 다`);
      for (let t = 0; t < q.fadeS + 0.05; t += 1 / 60) player.update(1 / 60);
      n++;
      if (q.fading) g.fail('playClip/fade-end', '섞기가 끝날 때가 지났는데 앞 액션이 남아 있다');
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

  // ── 8. **살이 사람 모양인가** ──
  //
  // 여기까지의 검사는 전부 뼈만 봤다. 뼈가 맞아도 살이 딴 데 붙어 있으면
  // 화면에는 사람이 아니라 무더기가 나온다 — 실제로 그랬다. 살을 원점에
  // 만들고 역바인드로 뼈 위치를 빼고 있어서, 바인드 자세에서 모든 상자가
  // 원점으로 되돌아왔다 (높이 0.34m 짜리 더미). 게이트가 전부 통과하는
  // 동안 화면만 틀렸고, 두 렌더러에서 똑같이 그래서 렌더러를 한참 의심했다.
  //
  // 그래서 **스키닝을 먹인 꼭짓점**을 직접 잰다. three 의 getVertexPosition
  // 이 셰이더와 같은 셈을 CPU 에서 해 준다.
  {
    const p = player.spawn({ clipId: 'idle' });
    player.update(0);
    let mesh = null;
    p.root.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    n++;
    if (!mesh) g.fail('shape/mesh', '스킨 메시가 없다');
    else {
      const posed = (person, skin) => {
        person.root.updateWorldMatrix(true, true);
        skin.skeleton.update();
        const v = new THREE.Vector3();
        const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
        const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        const count = skin.geometry.attributes.position.count;
        for (let i = 0; i < count; i++) {
          skin.getVertexPosition(i, v);
          skin.localToWorld(v);
          lo.min(v); hi.max(v);
        }
        return { lo, hi, h: hi.y - lo.y, w: Math.max(hi.x - lo.x, hi.z - lo.z) };
      };
      const b = posed(p, mesh);
      n++;
      // 사람 키. 리그는 1.7m 대로 만들었다 — 0.34m 짜리 더미는 여기서 걸린다.
      if (!(b.h > 1.4 && b.h < 2.1)) {
        g.fail('shape/height', `살의 키가 ${b.h.toFixed(2)}m 다 — 1.4~2.1m 여야 한다 (살이 뼈를 안 따라간다)`);
      }
      n++;
      // 발이 땅에 있어야 한다. 통째로 떠 있거나 묻혀 있으면 잡는다.
      if (Math.abs(b.lo.y) > 0.15) {
        g.fail('shape/ground', `살의 밑이 ${b.lo.y.toFixed(2)}m 다 — 발은 0 근처여야 한다`);
      }
      n++;
      // 서 있는 사람은 넓이보다 키가 크다. 무더기는 이 검사에서도 걸린다.
      if (!(b.h > b.w)) {
        g.fail('shape/upright', `키 ${b.h.toFixed(2)}m 가 폭 ${b.w.toFixed(2)}m 보다 작다 — 서 있는 모양이 아니다`);
      }
      n++;
      // **자세가 바뀌면 살도 움직여야 한다.** 안 그러면 위 셋은 바인드
      // 자세만 보고 통과한다 (스키닝을 통째로 꺼도 모른다).
      const q = player.spawn({ clipId: 'walk-forward', inPlace: true });
      let qMesh = null;
      q.root.traverse((o) => { if (o.isSkinnedMesh && !qMesh) qMesh = o; });
      q.mixer.update(0);
      // **여러 번 재서 폭을 본다.** 처음엔 0s 와 0.6s 두 번만 봤는데, 그것이
      // 걸음 주기의 정확히 절반이라 다리가 뒤바뀌어 경계가 **똑같이** 나왔다.
      // 맞는 코드에 대고 틀렸다고 하는 검사였다.
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 8; i++) {
        const bb = posed(q, qMesh);
        lo = Math.min(lo, bb.lo.z);
        hi = Math.max(hi, bb.lo.z);
        q.mixer.update(1.2 / 8);
      }
      const moved = hi - lo;
      if (moved < 0.05) {
        g.fail('shape/static', `한 주기 동안 살의 경계가 ${moved.toFixed(3)}m 밖에 안 바뀐다 — 스키닝이 안 먹는다`);
      }
      console.log(`  [재생] 살: 키 ${b.h.toFixed(2)}m · 폭 ${b.w.toFixed(2)}m · 발 ${b.lo.y.toFixed(2)}m`);
    }
  }

  console.log(`  [재생] three ${THREE.REVISION} · 클립 ${gltfs.size}개를 읽고 사람 ${player.people.length}명을 세웠다`);
  // ── 다친 걸음이 기본으로 뽑히지 않는가 ──
  //
  // 비상 동작을 받고 나서 소비처 시험에서 드러났다: "1.1m/s 로 걸어" 라고
  // 했는데 walk-injured(1.145m/s)가 뽑혔다 — 속도로만 고르니 가장 가까웠다.
  // 속도는 맞지만 **그림이 거짓**이다. 멀쩡한 재실자가 전부 절뚝인다.
  {
    const all = catalog.clips.filter((c) => c.rootMotion === 'travel');
    n++;
    // 기준 팩에는 다친 걸음이 없으므로 **있는 것처럼 꾸며서** 본다.
    const hurt = { ...all[0], id: 'walk-hurt', tags: [...(all[0].tags || []), 'distress'] };
    const cat2 = { ...catalog, clips: [...catalog.clips, hurt] };
    const pickN = pickWalkClip(cat2, all[0].speedMps);
    if (pickN?.clipId === 'walk-hurt') {
      g.fail('walk/distress', '다친 걸음이 기본으로 뽑힌다 — 멀쩡한 사람이 절뚝인다');
    }
    n++;
    // 달라고 하면 그것만 나와야 한다.
    const pickH = pickWalkClip(cat2, all[0].speedMps, { distress: true });
    if (pickH?.clipId !== 'walk-hurt') g.fail('walk/distress-ask', `다친 걸음을 달라 했는데 ${pickH?.clipId} 가 나온다`);
    n++;
    // 없는 팩에 달라고 하면 **없다고 해야 한다** (아무거나 주면 안 된다).
    if (pickWalkClip(catalog, 1.1, { distress: true }) !== null) {
      g.fail('walk/distress-none', '다친 걸음이 없는 팩인데 뭔가를 준다');
    }
    n++;
    if (walkClips(cat2).some((c) => (c.tags || []).includes('distress'))) {
      g.fail('walk/pool', '기본 걸음 목록에 다친 걸음이 섞여 있다');
    }
    n++;
    if (walkClips(cat2, { distress: true }).length !== 1) {
      g.fail('walk/pool-distress', `다친 걸음 목록이 ${walkClips(cat2, { distress: true }).length}개다`);
    }
    console.log(`  [재생] 걸음 고르기: 기본 ${walkClips(cat2).length}개 · 다친 걸음 ${walkClips(cat2, { distress: true }).length}개 (달라고 해야 나온다)`);
  }

  // ── 섞어 넘기기 ──
  //
  // 활동이 클립을 갈아탈 때 툭 끊기던 것을 섞는다. **그런데 섞으면 발이
  // 미끄러진다** — 두 클립의 발이 서로 다른 자리에 있는 동안 살이 그 사이
  // 어딘가에 있게 되기 때문이다. 공짜가 아니므로 **둘 다 잰다**: 안 섞으면
  // 자세가 얼마나 튀는가, 섞으면 발이 얼마나 미끄러지는가.
  {
    const cat = catalog;
    const two = ['idle', 'walk-forward'].filter((id) => cat.clips.some((c) => c.id === id));
    n++;
    if (two.length < 2) { g.setupFail('섞기를 볼 클립 둘이 없다'); return n; }

    // 규칙부터 — 같은 클립이면 0, 짧은 클립이면 짧게, 이동끼리는 더 짧게.
    const byId = new Map(cat.clips.map((c) => [c.id, c]));
    const idle = byId.get('idle');
    const walk = byId.get('walk-forward');
    n++;
    if (crossFadeS(idle, idle) !== 0) g.fail('fade/same', '같은 클립인데 섞는다');
    n++;
    if (crossFadeS(null, walk) !== 0) g.fail('fade/first', '처음 세우는 것인데 섞는다');
    n++;
    if (!(crossFadeS(idle, walk) > 0 && crossFadeS(idle, walk) <= CROSSFADE_MAX_S)) {
      g.fail('fade/range', `섞는 시간이 ${crossFadeS(idle, walk)}s 다 (0 ~ ${CROSSFADE_MAX_S})`);
    }
    n++;
    // **짧은 클립을 통째로 뭉개지 않는가** — 0.3s 짜리를 0.25s 섞으면 안 보인다.
    const tiny = { id: 'tiny', durationS: 0.3, rootMotion: 'in-place' };
    if (!(crossFadeS(idle, tiny) <= 0.1 + 1e-9)) g.fail('fade/short', `0.3s 클립에 ${crossFadeS(idle, tiny)}s 를 섞는다`);
    n++;
    // 이동끼리는 더 짧게 — 발이 땅에 있는 동안 섞으면 미끄러짐이 바로 보인다.
    const run = byId.get('run') || { id: 'run', durationS: 5, rootMotion: 'travel' };
    const w2 = { ...walk, durationS: 5, rootMotion: 'travel' };
    if (!(crossFadeS(w2, { ...run, durationS: 5, rootMotion: 'travel' }) < crossFadeS(idle, walk))) {
      g.fail('fade/travel', '이동 클립끼리를 제자리 클립과 같은 길이로 섞는다');
    }

    // ── 자세가 튀는가 / 발이 미끄러지는가 ──
    // 발 뼈를 **이름으로 찾는다** — 계약의 contacts[].part 는 'foot-l' 같은
    // 부위 이름이지 뼈 이름이 아니다. 처음에 그 둘을 헷갈려 게이트가
    // "발 뼈(foot-r)를 못 찾는다" 로 멈췄다.
    let foot = null;
    player.spawn({ clipId: two[0] }).root.traverse((o) => {
      if (!foot && o.isBone && /foot/i.test(o.name) && !/toe/i.test(o.name)) foot = o.name;
    });
    n++;
    if (!foot) { g.setupFail('발 뼈를 못 찾는다'); return n; }
    const jumpOf = (fadeS) => {
      const p2 = player.spawn({ clipId: two[0], position: [0, 0, 0] });
      for (let t = 0; t < 1; t += 1 / 60) player.update(1 / 60);
      const before = player.boneWorld(p2, foot)?.clone();
      player.playClip(p2, two[1], { fadeS });
      player.update(1 / 60);
      const after = player.boneWorld(p2, foot)?.clone();
      if (!before || !after) return null;
      // 한 프레임에 발이 얼마나 옮겨 갔는가 — 안 섞으면 그것이 '튐' 이다.
      const jump = before.distanceTo(after);
      // 섞는 동안 발이 얼마나 더 가는가 — 그것이 '미끄러짐' 이다.
      let slide = 0;
      let prev = after.clone();
      const steps = Math.max(1, Math.round((fadeS || 0) * 60));
      for (let i = 0; i < steps; i++) {
        player.update(1 / 60);
        const now = player.boneWorld(p2, foot);
        slide += prev.distanceTo(now);
        prev = now.clone();
      }
      return { jump, slide };
    };

    const hard = jumpOf(0);
    const soft = jumpOf(crossFadeS(idle, walk));
    n++;
    if (!hard || !soft) { g.setupFail(`발 뼈(${foot})를 못 찾는다`); return n; }
    n++;
    // **섞으면 첫 프레임의 튐이 줄어야 한다.** 그게 섞는 이유다.
    if (!(soft.jump < hard.jump)) {
      g.fail('fade/jump', `안 섞으면 ${(hard.jump * 1000).toFixed(1)}mm · 섞으면 ${(soft.jump * 1000).toFixed(1)}mm 튄다 — 안 줄었다`);
    }
    n++;
    // 그리고 **대가가 있어야 한다** — 공짜면 뭔가 안 하고 있는 것이다.
    if (!(soft.slide > 0)) g.fail('fade/slide', '섞는데 발이 하나도 안 움직인다 — 섞이지 않고 있다');
    console.log(
      `  [재생] 섞어 넘기기: 안 섞으면 발이 한 프레임에 ${(hard.jump * 1000).toFixed(1)}mm 튄다`
      + ` · ${crossFadeS(idle, walk)}s 섞으면 ${(soft.jump * 1000).toFixed(1)}mm 로 줄고 그 동안 ${(soft.slide * 1000).toFixed(1)}mm 미끄러진다`,
    );
    n++;
    // 섞기가 끝나면 앞 액션을 놓는가 — 안 놓으면 사람마다 액션이 쌓인다.
    const p3 = player.spawn({ clipId: two[0], position: [0, 0, 0] });
    player.playClip(p3, two[1]);
    for (let t = 0; t < 1; t += 1 / 60) player.update(1 / 60);
    if (p3.fading) g.fail('fade/leak', '섞기가 1초 뒤에도 안 끝났다 — 앞 액션이 쌓인다');
  }

  return n;
});
