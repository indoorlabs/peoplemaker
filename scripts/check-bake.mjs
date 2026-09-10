// check:bake — 구운 자세가 three 의 스키닝과 같은가.
//
// 이 검사가 없으면 인스턴싱은 **화면을 보고 고치는 일**이 된다. 살이 뒤틀려도
// "원래 이렇게 생겼나" 로 보이고, 행렬 순서 하나 바뀐 것을 찾는 데 하루가 든다.
//
// 그래서 굽는 쪽(우리 FK)과 그리는 쪽(three 의 Skeleton)을 **같은 시각에서
// 견준다.** 스키닝 행렬이 같으면 화면도 같다 — 셰이더는 그 행렬을 곱하기만
// 하기 때문이다.

import { runGate } from './gate-lib.mjs';
import { parseGLB } from '../src/lib/gltf.mjs';
import { bakeClip, bakeAtlas, textureSize, bakedBytes, rowAt, BAKE_FPS } from '../src/lib/poseBake.mjs';
import { buildGLB, FIXTURES } from '../src/lib/fixtureRig.mjs';

const walk = FIXTURES.find((f) => f.id === 'walk-forward');
const inPlace = FIXTURES.find((f) => f.id === 'walk-inplace');

runGate('check-bake', async (g) => {
  let n = 0;

  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

  const glb = buildGLB(walk);
  const doc = parseGLB(glb);
  const baked = bakeClip(doc);

  // ── 1. 구운 것의 모양 ──
  n++;
  if (baked.bones !== 11) g.fail('bake/bones', `뼈가 ${baked.bones}개다 — 리그가 11개다`);
  n++;
  if (Math.abs(baked.frames - (walk.durationS * BAKE_FPS + 1)) > 1) {
    g.fail('bake/frames', `${walk.durationS}s 를 ${BAKE_FPS}fps 로 구우면 ${Math.round(walk.durationS * BAKE_FPS) + 1}프레임인데 ${baked.frames} 다`);
  }
  n++;
  const size = textureSize(baked);
  if (size.width !== baked.bones * 4) g.fail('bake/width', '행렬 하나가 텍셀 넷이 아니다');
  n++;
  if (bakedBytes(baked) !== baked.frames * baked.bones * 64) g.fail('bake/bytes', '메모리 셈이 안 맞는다');

  // ── 2. **three 의 스키닝 행렬과 같은가** ──
  //
  // 이 게이트의 요점. GLTFLoader 로 읽어 같은 시각의 자세를 만들고, three 가
  // Skeleton.update 로 낸 boneMatrices 와 우리가 구운 값을 견준다.
  {
    // **제자리 클립으로 견준다.** 이동하는 클립은 굽는 쪽이 이동을 빼고
    // three 는 안 빼므로, 그대로 견주면 걸음 거리만큼 갈린다 — 그 갈림은
    // 오류가 아니라 설계다 (아래 3번에서 따로 본다).
    const inGlb = buildGLB(inPlace);
    const ab = inGlb.buffer.slice(inGlb.byteOffset, inGlb.byteOffset + inGlb.byteLength);
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
    const bakedInPlace = bakeClip(parseGLB(inGlb));
    let mesh = null;
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    if (!mesh) { g.setupFail('스킨 메시를 못 찾았다'); return n; }

    const mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(gltf.animations[0]).play();

    // 프레임 몇 군데를 골라 본다. 처음·중간·끝이 서로 다른 부류다 —
    // 끝은 되돌아 이어 붙이는 자리라 가장 자주 틀린다.
    const picks = [0, Math.floor(bakedInPlace.frames / 3), Math.floor(bakedInPlace.frames / 2), bakedInPlace.frames - 1];
    for (const f of picks) {
      const t = (bakedInPlace.durationS * f) / (bakedInPlace.frames - 1);
      mixer.setTime(0);
      mixer.setTime(t);
      gltf.scene.updateMatrixWorld(true);
      mesh.skeleton.update();

      // three 의 boneMatrices 는 **메시의 세계 변환을 뺀** 값이 아니다 —
      // bindMatrixInverse 를 곱해 둔 값이라 우리 것과 기준이 다를 수 있다.
      // 여기서는 메시가 원점에 있고 바인드 행렬이 단위행렬이라 같아야 한다.
      let worst = 0;
      let worstBone = -1;
      for (let b = 0; b < bakedInPlace.bones; b++) {
        for (let k = 0; k < 16; k++) {
          const ours = bakedInPlace.data[(f * bakedInPlace.bones + b) * 16 + k];
          const theirs = mesh.skeleton.boneMatrices[b * 16 + k];
          const d = Math.abs(ours - theirs);
          if (d > worst) { worst = d; worstBone = b; }
        }
      }
      n++;
      if (worst > 1e-3) {
        g.fail(`bake/match/${f}`,
          `프레임 ${f}(${t.toFixed(3)}s) 에서 뼈 ${worstBone} 의 행렬이 ${worst.toFixed(5)} 만큼 다르다 — 구운 자세로 그리면 살이 뒤틀린다`);
      }
    }
    console.log(`  [굽기] three 의 스키닝 행렬과 ${picks.length}개 프레임에서 견줬다 (뼈 ${baked.bones} · ${baked.frames}프레임)`);
  }

  // ── 2-2. 이동을 빼는가 ──
  //
  // 게이트가 이 설계를 먼저 밟았다 (위 주석 참조). 여기서 지키는 것 둘:
  // 뺀 뒤에는 **한 바퀴가 이음매 없이 돌아야** 하고, 뺀 거리가 그 클립의
  // 걸음 거리와 같아야 한다.
  {
    const first = (b, i) => b.data[i];
    const last = (b, i) => b.data[(b.frames - 1) * b.bones * 16 + i];
    const gap = (b) => {
      let w = 0;
      for (let i = 0; i < b.bones * 16; i++) w = Math.max(w, Math.abs(first(b, i) - last(b, i)));
      return w;
    };
    n++;
    if (gap(baked) > 1e-4) {
      g.fail('strip/loop', `이동을 뺐는데 첫 프레임과 끝 프레임이 ${gap(baked).toFixed(4)} 다르다 — 한 바퀴마다 튄다`);
    }
    n++;
    const kept = bakeClip(doc, { stripRootMotion: false });
    const want = walk.speedMps * walk.durationS;
    if (Math.abs(gap(kept) - want) > 0.05) {
      g.fail('strip/kept', `안 뺐을 때 첫·끝 차이가 ${gap(kept).toFixed(3)} 다 — 걸음 거리 ${want.toFixed(2)}m 여야`);
    }
    n++;
    if (Math.abs(baked.strippedM - want) > 0.05) {
      g.fail('strip/report', `뺀 거리를 ${baked.strippedM} 라고 하는데 걸음 거리는 ${want.toFixed(2)} 다`);
    }
    n++;
    // 제자리 클립에서는 뺄 것이 없다 — 있다고 하면 자세를 흔든 것이다.
    const ip = bakeClip(parseGLB(buildGLB(inPlace)));
    if (ip.strippedM > 0.02) g.fail('strip/inplace', `제자리 클립인데 ${ip.strippedM}m 를 뺐다`);
  }

  // ── 3. 굽는 값이 입력을 따라가는가 ──
  {
    n++;
    const dense = bakeClip(doc, { fps: BAKE_FPS * 2 });
    if (!(dense.frames > baked.frames)) g.fail('bake/fps', 'fps 를 두 배로 했는데 프레임이 안 는다');
    n++;
    // 촘촘히 구워도 **같은 시각의 자세는 같아야** 한다. 다르면 시각을 잘못
    // 셈한 것이다 (frames 로 나누는가 frames-1 로 나누는가에서 틀린다).
    let worst = 0;
    for (let b = 0; b < baked.bones; b++) {
      for (let k = 0; k < 16; k++) {
        const a = baked.data[((baked.frames - 1) * baked.bones + b) * 16 + k];
        const c = dense.data[((dense.frames - 1) * dense.bones + b) * 16 + k];
        worst = Math.max(worst, Math.abs(a - c));
      }
    }
    if (worst > 1e-4) g.fail('bake/last-frame', `마지막 프레임이 fps 에 따라 ${worst.toFixed(5)} 만큼 달라진다 — 되돌아 이을 때 발이 튄다`);
    n++;
    const longer = bakeClip(parseGLB(buildGLB({ ...walk, durationS: walk.durationS * 2 })));
    if (!(longer.frames > baked.frames)) g.fail('bake/duration', '클립이 길어졌는데 프레임이 안 는다');
  }

  // ── 4. 아틀라스 ──
  {
    const a = bakeClip(parseGLB(buildGLB(FIXTURES.find((f) => f.id === 'idle'))));
    n++;
    const atlas = bakeAtlas([{ id: 'walk', baked }, { id: 'idle', baked: a }]);
    if (atlas.height !== baked.frames + a.frames) g.fail('atlas/height', '이어 붙인 높이가 안 맞는다');
    n++;
    if (atlas.clips[1].row !== baked.frames) g.fail('atlas/row', '둘째 클립의 시작 줄이 틀렸다');
    n++;
    // 이어 붙인 뒤에도 첫 클립의 값이 그대로여야 한다 — 덮어쓰면 걸음이
    // 다른 클립의 자세로 바뀐다.
    let same = true;
    for (let i = 0; i < baked.data.length; i += 97) {
      if (Math.abs(atlas.data[i] - baked.data[i]) > 1e-6) { same = false; break; }
    }
    if (!same) g.fail('atlas/overwrite', '이어 붙이면서 앞 클립을 덮어썼다');
    n++;
    // 뼈 수가 다른 클립은 한 아틀라스에 못 넣는다 — 넣으면 줄이 어긋난다.
    let threw = false;
    try {
      bakeAtlas([{ id: 'a', baked }, { id: 'b', baked: bakeClip(parseGLB(buildGLB({ ...walk, bones: 33 }))) }]);
    } catch { threw = true; }
    if (!threw) g.fail('atlas/bones', '뼈 수가 다른 클립을 한 아틀라스에 넣는다');
  }

  // ── 5. 시각 → 줄 ──
  {
    const clip = { id: 'walk', row: 10, frames: 37, durationS: 1.2 };
    n++;
    if (rowAt(clip, 0) !== 10) g.fail('row/start', '0초가 첫 줄이 아니다');
    n++;
    if (Math.abs(rowAt(clip, 1.2) - 10) > 1e-6) g.fail('row/wrap', '한 바퀴 돌면 처음으로 안 돌아온다');
    n++;
    if (Math.abs(rowAt(clip, 0.6) - (10 + 18)) > 0.01) g.fail('row/mid', '한가운데가 가운데 줄이 아니다');
    n++;
    if (Math.abs(rowAt(clip, 2.4) - rowAt(clip, 0)) > 1e-6) g.fail('row/loop', '두 바퀴 뒤가 처음과 다르다');
  }

  return n;
});
