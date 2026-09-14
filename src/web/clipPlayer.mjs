// 팩을 화면에 세우는 얇은 어댑터.
//
// **three.js 를 import 하지 않는다 — 받는다.** 소비처(spacemaker)가 이미
// three 를 쓰고 있고, 이 저장소가 제 판을 끌어오면 한 페이지에 three 가 두
// 벌 뜬다 (인스턴스 검사가 조용히 실패하는 그 부류다). 그래서 주입받는다.
//
// 이 파일이 하는 일은 셋뿐이다:
//   1. 팩의 GLB 를 사람 하나로 복제한다 (스킨 메시는 그냥 clone 하면 안 된다)
//   2. 클립을 재생 속도와 함께 튼다 — 무엇을 얼마로 틀지는 lib/packRuntime 이 정한다
//   3. 지금 발이 어디쯤인지 물어볼 자리를 준다 (계단·문턱에 맞출 때 쓴다)
//
// 배치·경로·활동 스케줄은 **여기서 안 한다** (README 의 경계).

import { pickWalkClip, contactsAt, durationAt, crossFadeS } from '../lib/packRuntime.mjs';

/**
 * 뿌리 뼈의 **꼬리 이름** — three 안에서 찾을 때 쓴다.
 *
 * packBuild 의 ROOT_NODES 와 왜 다른가: 그쪽은 파일에 적힌 이름
 * (`mixamorig:Hips`)을 보고, 여기는 three 가 콜론을 지운 뒤의 이름
 * (`mixamorigHips`)을 본다. 끝으로 맞추면 둘 다 걸린다.
 */
const ROOT_TAIL = { mixamo: /Hips$/, vrm: /hips$/, biped: /^Bip01$/ };

/**
 * 재생기 하나.
 *
 * @param THREE        three 모듈 (주입)
 * @param SkeletonUtils three/examples/jsm/utils/SkeletonUtils.js (주입)
 * @param catalog      팩의 catalog.json
 * @param gltfOf       (clipId) => GLTF  이미 읽어 둔 것을 준다
 */
export function createClipPlayer({ THREE, SkeletonUtils, catalog, gltfOf }) {
  if (!THREE?.AnimationMixer) throw new Error('THREE 를 주입해야 한다');
  if (!catalog?.clips?.length) throw new Error('빈 카탈로그로는 아무도 못 세운다');
  const byId = new Map(catalog.clips.map((c) => [c.id, c]));

  const people = [];

  /**
   * 사람 하나를 세운다.
   *
   * 스킨 메시는 `Object3D.clone()` 으로 복제하면 **뼈가 원본을 가리킨다** —
   * 여럿을 세우면 전부 같은 자세로 움직인다. SkeletonUtils.clone 이 뼈까지
   * 복제한다. 이것을 모르고 하루를 쓰는 것이 이 층의 첫 함정이다.
   */
  function spawn({ clipId, position = [0, 0, 0], headingRad = 0, inPlace = false }) {
    const clip = byId.get(clipId);
    if (!clip) throw new Error(`카탈로그에 ${clipId} 가 없다`);
    const gltf = gltfOf(clipId);
    if (!gltf) throw new Error(`${clipId} 의 GLB 가 없다 — 받지 않은 클립이면 pack.load(['${clipId}']) 를 먼저`);

    const root = SkeletonUtils ? SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true);
    root.position.set(position[0], position[1], position[2]);
    root.rotation.y = yawFor(headingRad);

    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(playableClip(gltf, inPlace));
    action.play();

    const person = { root, mixer, action, clip, timeScale: 1, clipId, inPlace, headingRad };
    people.push(person);
    return person;
  }

  /**
   * 세계에서 이쪽을 보게 하려면 몸을 얼마나 돌려야 하는가.
   *
   * 리그의 앞이 어디인지는 **팩이 재서 갖고 있다** (catalog.forwardRad).
   * 이 기준 팩은 -Z 를 본다. 그것을 빼 주지 않으면 "북쪽으로 걸어" 가
   * 남쪽으로 걷는 것이 되고, 화면에서는 멀쩡히 걷고 있어서 한참 못 본다.
   *
   * 못 잰 팩(이동 클립이 없는 팩)은 null 이다 — 그때는 안 건드린다.
   */
  function yawFor(headingRad) {
    const f = catalog.forwardRad;
    return typeof f === 'number' ? headingRad - f : headingRad;
  }

  /**
   * 틀 클립 — 제자리로 달라면 뿌리의 이동 트랙을 뺀다.
   *
   * 경로를 따라 걷게 할 때 필요하다. 클립이 제 힘으로 나아가는데 쓰는 쪽도
   * 옮기면 **두 번 간다**. 반대로 그냥 두면 사람이 경로를 벗어나 흘러간다
   * (지금 spacemaker 가 그 상태였다 — 1.2m/s 로 떠내려가고 있었다).
   *
   * 원본 AnimationClip 은 건드리지 않는다. 같은 GLB 를 다른 사람이 쓰고
   * 있고, 트랙을 지우면 그 사람들까지 제자리가 된다.
   */
  function playableClip(gltf, inPlace) {
    const src = gltf.animations[0];
    if (!inPlace) return src;
    const tail = ROOT_TAIL[catalog.skeleton] || ROOT_TAIL.mixamo;
    const tracks = src.tracks.filter((t) => {
      const [node, prop] = t.name.split('.');
      return !(prop === 'position' && tail.test(node));
    });
    if (tracks.length === src.tracks.length) return src;   // 뺄 것이 없었다
    return new THREE.AnimationClip(`${src.name}__inplace`, src.duration, tracks);
  }

  /**
   * 이 사람이 트는 클립을 바꾼다.
   *
   * 멈춘 사람을 세워 두려면 필요하다 — 걷는 클립의 재생 속도를 0 으로
   * 만들면 **걷다 만 자세로 굳는다**. 서 있는 사람은 서 있는 클립을 틀어야
   * 한다. 같은 클립이면 아무것도 안 한다 (프레임마다 불러도 된다).
   */
  function playClip(person, clipId, { fadeS = null } = {}) {
    if (person.clipId === clipId) return person;
    const clip = byId.get(clipId);
    if (!clip) throw new Error(`카탈로그에 ${clipId} 가 없다`);
    const gltf = gltfOf(clipId);
    if (!gltf) throw new Error(`${clipId} 의 GLB 가 없다 — 받지 않은 클립이면 pack.load(['${clipId}']) 를 먼저`);

    // 얼마 동안 섞을지는 **순수 층이 정한다** (lib/packRuntime.mjs).
    const dur = fadeS == null ? crossFadeS(person.clip, clip) : Math.max(0, fadeS);
    const next = person.mixer.clipAction(playableClip(gltf, person.inPlace));
    const prev = person.action;

    if (dur > 0 && prev) {
      // **앞 클립을 아직 안 멈춘다.** 멈추면 섞을 것이 없다.
      next.reset();
      next.enabled = true;
      next.setEffectiveWeight(0);
      next.timeScale = person.timeScale;
      next.play();
      prev.crossFadeTo(next, dur, false);
      // 섞기가 끝나면 앞 클립을 놓아 준다 — 안 놓으면 사람마다 액션이
      // 쌓이고, 무게가 0 이어도 mixer 가 프레임마다 계산한다.
      person.fading = { action: prev, leftS: dur };
    } else {
      if (prev) prev.stop();
      next.reset();
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.timeScale = person.timeScale;
      next.play();
      person.fading = null;
    }

    person.action = next;
    person.clipId = clipId;
    person.clip = clip;
    person.fadeS = dur;
    return person;
  }

  /** 이 사람을 이 속도로 걷게 — 어느 클립을 얼마로 돌릴지는 순수 층이 정한다. */
  // holding: 무언가를 들었는가 — 들었으면 드는 클립만, 빈손이면 빈손 클립만 (lib/packRuntime.mjs).
  function walkAt(person, desiredMps, { distress = false, holding = false } = {}) {
    const pick = pickWalkClip(catalog, desiredMps, { distress, holding });
    if (!pick) return null;
    playClip(person, pick.clipId);
    person.timeScale = pick.timeScale;
    person.action.timeScale = pick.timeScale;
    return pick;
  }

  /** 시간을 흘린다. dt 는 **초**다 (three 의 기본과 같다). */
  function update(dtS) {
    for (const p of people) {
      p.mixer.update(dtS);
      if (!p.fading) continue;
      p.fading.leftS -= dtS;
      if (p.fading.leftS <= 0) {
        p.fading.action.stop();
        p.fading = null;
      }
    }
  }

  /** 지금 재생 위치 (s) — 재생 속도를 반영한 시각이다. */
  function timeOf(person) {
    return person.action.time;
  }

  /** 이 사람의 접촉 시각들 — 재생 속도를 반영한다. */
  function contactsOf(person) {
    return contactsAt(person.clip, person.timeScale);
  }

  /** 한 바퀴 도는 데 걸리는 시간 (s). */
  function cycleOf(person) {
    return durationAt(person.clip, person.timeScale);
  }

  /**
   * 뼈를 이름으로 찾는다 — **파일에 적힌 이름으로.**
   *
   * three 의 GLTFLoader 는 노드 이름에서 애니메이션 경로에 못 쓰는 글자를
   * 지운다. Mixamo 규약의 콜론이 그것이라, 파일의 `mixamorig:Hips` 가
   * three 안에서는 `mixamorigHips` 가 된다. 진짜 Mixamo 파일도 콜론을 쓰므로
   * 실제 팩에서 똑같이 터진다 — 게이트가 이 자리를 먼저 밟았다.
   *
   * 쓰는 쪽이 그 개명을 알 이유가 없다. 여기서 흡수한다.
   */
  function resolveBone(person, boneName) {
    return person.root.getObjectByName(boneName)
      || person.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(boneName))
      || null;
  }

  /** 뼈 하나의 지금 세계 좌표 — 계단·문턱에 맞출 때 쓴다. */
  function boneWorld(person, boneName, out) {
    const bone = resolveBone(person, boneName);
    if (!bone) return null;
    person.root.updateWorldMatrix(true, true);
    const v = out || new THREE.Vector3();
    return bone.getWorldPosition(v);
  }

  /**
   * 이 사람을 여기에, 이쪽을 보게 둔다.
   *
   * 경로를 따라 걷게 하는 쪽이 프레임마다 부른다. 리그의 앞 보정을 여기서
   * 하므로, 쓰는 쪽은 세계의 방향만 알면 된다.
   */
  function placeAt(person, position, headingRad) {
    if (position) person.root.position.set(position[0], position[1] || 0, position[2]);
    if (typeof headingRad === 'number') {
      person.headingRad = headingRad;
      person.root.rotation.y = yawFor(headingRad);
    }
  }

  return { spawn, walkAt, playClip, update, timeOf, contactsOf, cycleOf, boneWorld, resolveBone, placeAt, yawFor, people };
}
