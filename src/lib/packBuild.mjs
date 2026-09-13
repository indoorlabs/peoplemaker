// 클립에서 값을 **잰다**.
//
// 계약이 요구하는 것 중 넷은 사람이 적으면 안 되는 값이다:
//
//   durationS          길이
//   rootMotion         제자리인가 이동하는가
//   speedMps           이동한다면 얼마나 빠른가
//   travelHeadingRad   **어느 쪽으로** 나아가는가
//   contacts           발이 언제 땅에 닿는가
//
// 손으로 적으면 파일과 어긋나고, 어긋나도 아무도 모른다 — 걷는 그림은
// 맞는데 도착 시각이 틀리는 식이다. 그래서 이 파일이 GLB 를 열어 재고,
// 사람이 적는 것은 **잴 수 없는 것**(이름·라이선스·출처·태그)뿐이다.
//
// 재는 방법을 값과 함께 남긴다 (`measuredBy`). 방법이 바뀌면 값도 바뀌므로,
// 나중에 수가 달라 보일 때 무엇이 달라졌는지 짚을 자리가 있어야 한다.

import { skinnedMeshOf, skinPoints } from './bodyMesh.mjs';
import { bakeClip } from './poseBake.mjs';
import {
  animationDurationS, sampleAnimation, nodeWorldPos, parentMap, findNode,
} from './gltf.mjs';

/** 재는 간격 (Hz). 발이 닿는 순간을 놓치지 않을 만큼. */
export const SAMPLE_HZ = 60;

/**
 * 이보다 느리면 제자리로 본다 (m/s).
 *
 * 처음에는 **거리**로 갈랐다(5cm 이상 움직이면 이동). 그랬더니 앉기 클립이
 * 이동으로 나왔다 — 앉을 때 엉덩이가 앞뒤로 10cm 쯤 옮겨 가기 때문이다.
 * 거리는 클립 길이를 모르므로, 2.4초 동안의 10cm 와 0.1초 동안의 10cm 를
 * 같게 본다.
 *
 * 속도로 가르면 그 둘이 갈린다. 0.15m/s 는 어떤 걸음보다도 느리다 —
 * 느린 보행이 0.8m/s 대다.
 */
export const TRAVEL_MIN_MPS = 0.15;

/** 발이 이보다 낮으면 땅에 닿은 것으로 본다 (m). */
export const PLANT_MAX_Y_M = 0.06;

/**
 * 이만큼 **머물러야** 디딤이다 (s).
 *
 * 문턱을 한 번 지나는 것만으로 세면, 휘두르는 발이 도중에 한 번 내려왔다
 * 올라가는 골짜기가 걸음으로 세어진다. Rocketbox 의 걷는 클립이 그랬다 —
 * 한 주기(1.17s)에 발마다 한 번이어야 할 접촉이 4회·3회로 나왔다.
 *
 * 문턱 아래 머문 시간을 재 보니 둘이 깨끗이 갈렸다:
 *
 *   가짜 골짜기   0.025 · 0.092 · 0.108 · 0.133 s
 *   진짜 디딤     0.675 · 0.717 · 0.733 · 0.758 s  (Rocketbox)
 *                 0.742 · 0.892 s                    (기준 팩)
 *
 * 0.2s 는 가장 긴 가짜의 1.5배, 가장 짧은 진짜의 3분의 1 이하다. 뛰는
 * 클립이 들어오면 디딤이 짧아지므로 그때 다시 잰다.
 */
export const PLANT_MIN_DWELL_S = 0.2;

/**
 * 발 높이 곡선에서 **디딤 사건**을 찾는다 — 순수 함수라 따로 검사한다.
 *
 * 한 주기가 돌아 이어진다고 보고 감아서 센다: 끝에서 시작한 디딤이 처음으로
 * 이어지면 한 번이다. 늘 땅에 있는 발(서 있기)은 사건이 없다 — 맞출 순간이
 * 없기 때문이다.
 *
 * @param ys        발 높이 (m), 고르게 뽑은 표본. 마지막은 처음과 같은 시각이 아니다
 * @param durationS 한 주기의 길이
 * @returns [atS] — 디딤이 시작된 시각들
 */
export function plantEvents(ys, durationS, maxY = PLANT_MAX_Y_M, minDwellS = PLANT_MIN_DWELL_S) {
  const n = ys.length;
  if (!n) return [];
  const low = ys.map((y) => y <= maxY);
  const firstHigh = low.indexOf(false);
  if (firstHigh < 0) return [];                     // 늘 땅에 있다
  const dt = durationS / n;
  const out = [];
  // 들린 표본에서 출발해 한 바퀴 돈다 — 디딤이 끝을 넘어 이어져도 쪼개지지 않게.
  let k = firstHigh;
  for (let seen = 0; seen < n;) {
    if (!low[k % n]) { k++; seen++; continue; }
    const start = k % n;
    let len = 0;
    while (low[k % n] && seen < n) { len++; k++; seen++; }
    if (len * dt >= minDwellS) out.push(+(start * dt).toFixed(3));
  }
  return out.sort((a, b) => a - b);
}

/**
 * 스켈레톤 규약마다 발 뼈 이름.
 *
 * 이름으로 찾는 것이 규약을 하나로 묶는 이유다 — 팩에 두 벌이 섞이면 여기서
 * 한쪽을 못 찾고, 그 클립만 접촉이 비어 나온다.
 */
export const FOOT_NODES = {
  mixamo: { 'foot-l': /(^|:)LeftFoot$/, 'foot-r': /(^|:)RightFoot$/ },
  vrm: { 'foot-l': /^leftFoot$/, 'foot-r': /^rightFoot$/ },
  // **발목이 아니라 발끝이다.** Biped 의 Foot 뼈는 발목에 있어서 디딘 발에서도
  // 땅에서 0.1m 쯤 떠 있다 — 문턱(PLANT_MAX_Y_M)을 한 번도 안 넘으니 접촉이
  // 0회로 나오고, 그러면 걷는 클립이 걷는 클립으로 안 잡힌다 (Rocketbox 를
  // 재 보고 알았다: 바인드 자세에서 Foot 0.10m · Toe0 0.002m).
  // 번호(Bip01 · Bip02)는 3ds Max 가 **장면마다** 매긴다 — 어른 몸은 Bip01,
  // 어린이 몸은 Bip02 다. 같은 규약이므로 번호는 안 본다 (retarget.mjs 는
  // 처음부터 그렇게 하고 있었다).
  biped: { 'foot-l': /^Bip\d\d L Toe0$/, 'foot-r': /^Bip\d\d R Toe0$/ },
};

/**
 * 규약마다 **엉덩이 뼈** — 앉은 높이를 재는 기준.
 *
 * 뿌리(ROOT_NODES)와 다르다. Biped 는 몸 전체가 Bip01 에 매달려 있고 이동이
 * 거기 실리는데, 앉은 높이는 **골반**의 높이다.
 */
export const HIP_NODES = {
  mixamo: /(^|:)Hips$/,
  vrm: /^hips$/,
  biped: /^Bip\d\d Pelvis$/,
};

/** 엉덩이가 쉬는 자세의 이 비율 아래로 내려가 머물면 앉은 것이다. */
export const SEATED_HIP_RATIO_MAX = 0.8;

/** 앉았다고 하려면 그 높이에 이만큼(클립의 비율)은 머물러야 한다. */
export const SEAT_DWELL_MIN = 0.2;

/**
 * 앉았다고 하려면 발이 엉덩이보다 이만큼은 앞에 있어야 한다 (m).
 *
 * 엉덩이가 낮다는 것만으로는 앉은 것이 아니다 — **쪼그린 사람**도 낮다.
 * 가르는 것은 다리 모양이다. 재 보니 (Rocketbox 여자 01):
 *
 *   앉기      발이 엉덩이 앞으로 0.554m · 책상에 앉기 0.566m
 *   쪼그리기  0.075m
 *   서기·걷기 0.088 ~ 0.107m
 *
 * 쪼그린 사람을 앉았다고 하면 공간 쪽이 거기에 의자를 놓는다.
 */
export const SEAT_FEET_FORWARD_MIN = 0.25;

/**
 * 규약마다 **손 뼈** — 무언가에 닿는 순간을 재는 기준.
 */
export const HAND_NODES = {
  mixamo: { 'hand-l': /(^|:)LeftHand$/, 'hand-r': /(^|:)RightHand$/ },
  vrm: { 'hand-l': /^leftHand$/, 'hand-r': /^rightHand$/ },
  biped: { 'hand-l': /^Bip\d\d L Hand$/, 'hand-r': /^Bip\d\d R Hand$/ },
};

/**
 * 뻗은 손이 **제 최고치의 이만큼** 위에 있으면 닿아 있는 것으로 본다.
 *
 * 클립마다 팔 길이도 하는 일도 다르므로, 고정된 거리로는 못 가른다. 그
 * 클립 **자신의 최고치**에 견준다 — 손이 가장 멀리 간 자리가 닿은 자리다.
 */
export const REACH_PEAK_FRACTION = 0.9;

/** 그 자리에 이만큼은 머물러야 닿은 것으로 센다 (s). */
export const REACH_MIN_DWELL_S = 0.1;

/** 규약마다 뿌리 뼈 — 이동을 재는 기준. */
export const ROOT_NODES = {
  mixamo: /(^|:)Hips$/,
  vrm: /^hips$/,
  // Biped 는 몸 전체가 Bip01(또는 Bip02 …)에 매달려 있고 이동도 거기 실린다
  // (Pelvis 는 그 아이다). 걷는 클립 하나를 재 보니 1.167s 에 1.412m 갔다.
  biped: /^Bip\d\d$/,
};

const matchNode = (doc, re) => {
  const i = (doc.json.nodes || []).findIndex((n) => re.test(n.name || ''));
  return i < 0 ? null : i;
};

/**
 * 뻗은 손이 **닿아 있는 구간**.
 *
 * 발의 디딤과 같은 규약이다 — "닿아 있는 상태" 가 아니라 **닿는 사건**을
 * 찾는다. 다만 발은 땅이라는 고정된 높이가 있고 손은 없다. 그래서 그
 * 클립 **자신의 최고치**에 견준다.
 *
 * 손이 앞으로 나간 정도(forward)를 받아, 최고치의 REACH_PEAK_FRACTION 를
 * 넘어서 머무는 구간을 낸다.
 *
 * @returns [{ atS, releaseS, peakAtS, peakM }] — 없으면 빈 배열
 */
export function reachEvents(forward, durationS, { peakFraction = REACH_PEAK_FRACTION, minDwellS = REACH_MIN_DWELL_S } = {}) {
  const n = forward.length;
  if (n < 3 || !(durationS > 0)) return [];
  const peak = Math.max(...forward);
  if (!(peak > 0)) return [];
  const line = peak * peakFraction;
  const tOf = (i) => (durationS * i) / n;
  const out = [];
  let start = -1;
  for (let i = 0; i < n; i++) {
    const over = forward[i] >= line;
    if (over && start < 0) start = i;
    if ((!over || i === n - 1) && start >= 0) {
      const end = over ? i : i - 1;
      if (tOf(end + 1) - tOf(start) >= minDwellS) {
        let pi = start;
        for (let k = start; k <= end; k++) if (forward[k] > forward[pi]) pi = k;
        out.push({
          atS: +tOf(start).toFixed(3),
          releaseS: +tOf(end + 1).toFixed(3),
          peakAtS: +tOf(pi).toFixed(3),
          peakM: +forward[pi].toFixed(3),
        });
      }
      start = -1;
    }
  }
  return out;
}

/** 사람이 적을 수 없는 값 — sources.json 에 있으면 그것은 두 벌이다. */
export const MEASURED_FIELDS = ['durationS', 'rootMotion', 'speedMps', 'travelHeadingRad', 'contacts', 'seat', 'reach'];

/**
 * 손이 무언가에 닿는 순간과 **그때 손이 있는 자리**.
 *
 * 팩의 **앞**(forwardRad)을 알아야 잴 수 있어서 클립을 다 잰 뒤에 부른다
 * (build-pack 의 두 번째 판). 앞은 이동 클립에서 재는 값이라, 그 전에는
 * 어느 쪽이 앞인지 모른다.
 *
 * **무엇에 닿는지는 안 정한다.** 손이 앞으로 나간 것만으로는 문을 잡았는지
 * 알 수 없다 — 재 보니 책상에 기대기(0.48m)와 손 흔들기(0.41m)가 문 열기
 * (0.36m)보다 멀리 갔다. 그 동작이 무엇인지는 **사람이 적고**(tags 의
 * 'reach'), 언제 어디까지 뻗는지는 **우리가 잰다**. 그 자리가 곧 손잡이를
 * 둘 높이다 — 어른 1.07m · 어린이 0.87m 로 나왔다.
 *
 * @returns { part, atS, releaseS, forwardM, heightM } 또는 null
 */
export function deriveReach(doc, { skeleton = 'mixamo', forwardRad = 0, sampleHz = SAMPLE_HZ } = {}) {
  const durationS = animationDurationS(doc, 0);
  if (!(durationS > 0)) return null;
  const parent = parentMap(doc);
  const hipIdx = matchNode(doc, HIP_NODES[skeleton] || HIP_NODES.mixamo);
  if (hipIdx == null) return null;
  const dir = [Math.sin(forwardRad), 0, Math.cos(forwardRad)];
  const steps = Math.max(4, Math.round(durationS * sampleHz));
  const at = (t) => sampleAnimation(doc, 0, t);

  let best = null;
  for (const [part, re] of Object.entries(HAND_NODES[skeleton] || HAND_NODES.mixamo)) {
    const idx = matchNode(doc, re);
    if (idx == null) continue;
    const forward = [];
    const height = [];
    for (let i = 0; i < steps; i++) {
      const sampled = at((durationS * i) / steps);
      const hip = nodeWorldPos(doc, hipIdx, sampled, parent);
      const hand = nodeWorldPos(doc, idx, sampled, parent);
      forward.push((hand[0] - hip[0]) * dir[0] + (hand[2] - hip[2]) * dir[2]);
      height.push(hand[1]);
    }
    for (const ev of reachEvents(forward, durationS)) {
      if (best && ev.peakM <= best.forwardM) continue;
      const pi = Math.min(forward.length - 1, Math.round((ev.peakAtS / durationS) * steps));
      best = {
        part,
        atS: ev.atS,
        releaseS: ev.releaseS,
        forwardM: ev.peakM,
        heightM: +height[pi].toFixed(3),
      };
    }
  }
  return best;
}

/**
 * 잰 클립에 **손이 닿는 자리**를 얹는다 (두 번째 판).
 *
 * 굽는 쪽(build-pack)과 게이트가 **같은 함수**를 불러야 한다. 처음에 굽는
 * 쪽에만 두었더니, 게이트가 "지금 재는 값" 을 두 번째 판 없이 내서 구운
 * 팩이 전부 낡았다고 나왔다 — 같은 일을 두 군데 적으면 늘 이렇게 갈린다.
 *
 * @param clip deriveClip 이 낸 클립 (그대로 고쳐서 돌려준다)
 * @param decl sources.json 의 선언 — tags 에 'reach' 가 있을 때만 잰다
 */
export function applyReach(clip, doc, decl, { skeleton = 'mixamo', forwardRad } = {}) {
  if (!(decl.tags || []).includes('reach')) return clip;
  if (typeof forwardRad !== 'number') return clip;
  const reach = deriveReach(doc, { skeleton, forwardRad });
  if (!reach) return clip;
  clip.reach = reach;
  clip.contacts = [...clip.contacts,
    { atS: reach.atS, part: reach.part, kind: 'touch' },
    { atS: reach.releaseS, part: reach.part, kind: 'release' },
  ].sort((a, b) => a.atS - b.atS);
  return clip;
}

/** 규약마다 **눈 뼈** — 눈높이를 재는 기준. 없는 리그도 있다. */
export const EYE_NODES = {
  biped: /^Bip\d\d [LR] ?Eye$/,
  mixamo: /(^|:)(LeftEye|RightEye)$/,
  vrm: /^(leftEye|rightEye)$/,
};

/**
 * **이 몸의 치수** — 살을 재서 낸다.
 *
 * 사이즈코리아(lib/anthropometry.mjs)와 **다른 값**이다. 저쪽은 모집단
 * 통계이고 이쪽은 **이 몸 하나**를 잰 것이다. 둘을 섞으면 "한국 남자 평균
 * 어깨너비" 자리에 Rocketbox 남자 01 의 어깨가 들어앉는다 — 그래서 출처를
 * `measured-from-pack` 으로 못 박는다.
 *
 * 공간 쪽이 바로 쓰는 값이다: 복도 유효폭은 **폭**이고, 창·사이니지 높이는
 * **눈높이**이며, 군중 밀도의 바닥은 **폭 × 두께**다.
 *
 * 자세에 따라 달라지므로 **어느 클립에서** 쟀는지 함께 적는다. 걷는 클립의
 * 폭도 따로 잰다 — 다만 **걷는다고 늘 넓어지지는 않는다.** 재 보니 남자 01 은
 * 선 자세가 더 넓었다 (0.586 vs 0.573m — 팔이 몸에서 떨어져 있다). 복도를
 * 검토하는 쪽은 둘 중 큰 쪽을 쓴다 (maxWidthM).
 *
 * @param bodyDoc 몸 문서
 * @param posed   [{ id, doc }] — 몸에 동작을 **붙인** 문서들
 */
export function deriveBodyDims(bodyDoc, posed, { skeleton = 'mixamo' } = {}) {
  const mesh = skinnedMeshOf(bodyDoc);
  if (!mesh.position.length || !posed?.length) return null;
  const still = posed.find((c) => c.id === 'idle') || posed[0];

  const sizeOf = (points) => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < points.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        if (points[i + c] < lo[c]) lo[c] = points[i + c];
        if (points[i + c] > hi[c]) hi[c] = points[i + c];
      }
    }
    return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  };

  const size = sizeOf(skinPoints(mesh, bakeClip(still.doc), 0));

  // 걸을 때 차지하는 폭 — 팔이 흔들려 선 자세보다 넓다.
  let walkWidthM = null;
  const walk = posed.find((c) => c.id === 'walk-forward');
  if (walk) {
    const wb = bakeClip(walk.doc);
    let widest = 0;
    for (let f = 0; f < wb.frames; f += Math.max(1, Math.floor(wb.frames / 8))) {
      widest = Math.max(widest, sizeOf(skinPoints(mesh, wb, f))[0]);
    }
    walkWidthM = +widest.toFixed(3);
  }

  // 눈높이 — 눈 뼈가 있는 리그만. 없으면 안 적는다 (짐작하지 않는다).
  const parent = parentMap(still.doc);
  const eyeIdx = matchNode(still.doc, EYE_NODES[skeleton] || EYE_NODES.mixamo);
  const eyeHeightM = eyeIdx == null ? null
    : +nodeWorldPos(still.doc, eyeIdx, sampleAnimation(still.doc, 0, 0), parent)[1].toFixed(3);

  return {
    source: 'measured-from-pack',
    pose: still.id,
    heightM: +size[1].toFixed(3),
    widthM: +size[0].toFixed(3),
    depthM: +size[2].toFixed(3),
    ...(eyeHeightM != null ? { eyeHeightM } : {}),
    ...(walkWidthM != null ? { walkWidthM } : {}),
    // 복도 검토가 바로 쓰는 값 — 선 자세와 걸을 때 중 큰 쪽.
    maxWidthM: +Math.max(size[0], walkWidthM ?? 0).toFixed(3),
  };
}

/**
 * 이동 클립들의 진행 방향이 이만큼 넘게 갈리면 팩의 앞을 못 정한다 (rad).
 *
 * 같은 리그의 앞걸음 클립들은 같은 쪽으로 간다 — 안 그러면 리그가 섞여
 * 있거나, 옆걸음(strafe)이 섞인 것이다. 둘 다 사람이 봐야 하는 일이라
 * 조용히 평균 내지 않고 멈춘다. 15° 는 손으로 만든 클립의 흔들림은
 * 넘기고 90° 옆걸음은 못 넘는 자리다.
 */
export const FORWARD_AGREE_RAD = (15 * Math.PI) / 180;

/** 두 방향 사이의 각 (rad) — ±π 를 넘어가는 자리를 접는다. */
export function angleDiff(a, b) {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

/**
 * 클립 하나를 잰다.
 *
 * @param doc   parseGLB 결과
 * @param decl  사람이 적은 것 { id, name, license, source, tags }
 * @param opts  { skeleton }
 * @returns { clip, notes }  notes 는 잰 방법과 못 잰 이유
 */
export function deriveClip(doc, decl, { skeleton = 'mixamo' } = {}) {
  const notes = [];
  const clip = { ...decl };

  // 사람이 잰 값을 적었으면 그 자리에서 막는다. 조용히 덮으면 "내가 적은
  // 값이 왜 안 들어갔지" 가 되고, 조용히 두면 파일과 어긋난다.
  const handWritten = MEASURED_FIELDS.filter((f) => decl[f] !== undefined);
  if (handWritten.length) {
    throw new Error(`${decl.id}: ${handWritten.join('·')} 은(는) 재는 값이다 — sources.json 에 적지 말 것`);
  }

  const anims = doc.json.animations || [];
  if (anims.length !== 1) {
    throw new Error(`${decl.id}: 애니메이션이 ${anims.length}개다 — 클립 하나에 하나여야 한다`);
  }

  const durationS = +animationDurationS(doc, 0).toFixed(4);
  if (!(durationS > 0)) throw new Error(`${decl.id}: 길이가 0 이다`);
  clip.durationS = durationS;

  const parent = parentMap(doc);
  const rootIdx = matchNode(doc, ROOT_NODES[skeleton]) ?? findNode(doc, 'Hips');
  if (rootIdx == null) throw new Error(`${decl.id}: 뿌리 뼈를 못 찾았다 (${skeleton} 규약)`);

  // ── 이동 ──
  //
  // 뿌리의 **세계 좌표**를 처음과 끝에서 본다. 국소 translation 만 보면
  // 부모가 움직이는 리그에서 틀린다.
  const at = (t) => sampleAnimation(doc, 0, t);
  const p0 = nodeWorldPos(doc, rootIdx, at(0), parent);
  const p1 = nodeWorldPos(doc, rootIdx, at(durationS), parent);
  const dx = p1[0] - p0[0];
  const dz = p1[2] - p0[2];
  const travelM = Math.hypot(dx, dz);   // 수평만 — 오르내림은 이동이 아니다
  const mps = travelM / durationS;
  if (mps >= TRAVEL_MIN_MPS) {
    clip.rootMotion = 'travel';
    clip.speedMps = +mps.toFixed(3);
    // **어느 쪽으로 가는가.** 0 = +Z, 시계 반대. 이것을 안 재면 쓰는 쪽이
    // "앞은 +Z 겠지" 하고 짐작하게 되고, 그 짐작이 틀리면 사람들이 전부
    // 뒤로 걷는다 — 화면에서는 걷고 있으니 한참 못 알아챈다.
    clip.travelHeadingRad = +Math.atan2(dx, dz).toFixed(4);
  } else {
    clip.rootMotion = 'in-place';
  }
  notes.push(`이동 ${travelM.toFixed(3)}m / ${durationS}s = ${mps.toFixed(3)}m/s`
    + (clip.travelHeadingRad !== undefined ? ` · 방향 ${((clip.travelHeadingRad * 180) / Math.PI).toFixed(1)}°` : ''));

  // ── 발 접촉 ──
  //
  // **닿는 순간**은 발 높이가 문턱을 위에서 아래로 지나는 때다.
  //
  // 처음에는 "문턱 아래의 골" 로 찾았다. 그랬더니 가만히 선 클립에서 접촉이
  // 2회 나왔다 — 발이 내내 땅에 있고 몸이 조금 흔들리니, 그 흔들림의 골이
  // 접촉으로 잡힌 것이다. 그런데 발이 내내 땅에 있으면 맞출 순간이 없다.
  // 접촉은 "닿아 있는 상태" 가 아니라 **닿는 사건**이다.
  const contacts = [];
  const footMap = FOOT_NODES[skeleton] || {};
  const steps = Math.max(2, Math.round(durationS * SAMPLE_HZ));
  for (const [part, re] of Object.entries(footMap)) {
    const idx = matchNode(doc, re);
    if (idx == null) { notes.push(`${part} 뼈 없음`); continue; }
    // 한 주기를 고르게 뽑는다 — 끝 표본(= 처음과 같은 자세)은 안 넣는다.
    // 넣으면 주기를 감아 셀 때 같은 순간이 두 번 들어간다.
    const ys = [];
    for (let i = 0; i < steps; i++) {
      const t = (durationS * i) / steps;
      ys.push(nodeWorldPos(doc, idx, at(t), parent)[1]);
    }
    for (const atS of plantEvents(ys, durationS)) contacts.push({ atS, part, kind: 'plant' });
  }
  contacts.sort((a, b) => a.atS - b.atS);
  clip.contacts = contacts;

  // ── 앉기 ──
  //
  // 계약은 처음부터 "접촉 이벤트는 앉기·문 열기를 공간에 맞출 때 쓴다" 고
  // 적어 두었는데, 정작 **앉은 높이**를 재지 않았다. 앉은 사람을 공간에
  // 놓으려면 그 사람이 **어느 높이의 자리**를 필요로 하는지 알아야 한다.
  //
  // 엉덩이가 쉬는 자세보다 한참 내려와 **머물면** 앉은 것으로 본다. 내려간
  // 순간만 보면 쪼그리는 동작도 앉기가 된다.
  //
  // 함께 적는 `groundOffsetM` 은 그 클립에서 발이 가장 낮게 간 높이다.
  // Rocketbox 의 의자 동작은 발끝이 -0.12m 까지 내려간다 — 그 클립의 바닥이
  // 우리 y=0 이 아니라는 뜻이고, 놓는 쪽이 그만큼 올려야 한다. 안 적어 두면
  // 발이 바닥에 박힌 사람이 된다.
  const hipIdx = matchNode(doc, HIP_NODES[skeleton] || HIP_NODES.mixamo);
  if (hipIdx != null) {
    const restY = nodeWorldPos(doc, hipIdx, new Map(), parent)[1];
    const hipYs = [];
    for (let i = 0; i < steps; i++) hipYs.push(nodeWorldPos(doc, hipIdx, at((durationS * i) / steps), parent)[1]);
    const sorted = [...hipYs].sort((a, b) => a - b);
    const low = sorted[Math.floor(sorted.length * 0.1)];
    const dwell = hipYs.filter((y) => Math.abs(y - low) <= 0.02).length / hipYs.length;
    const ratio = restY > 0.2 ? low / restY : null;
    if (ratio != null && ratio < SEATED_HIP_RATIO_MAX && dwell >= SEAT_DWELL_MIN) {
      // 발이 가장 낮게 간 곳과, **엉덩이 앞으로 얼마나 나가 있는지**.
      // 앞으로 나간 정도는 **낮게 머무는 동안만** 본다 — 서 있다가 앉는
      // 클립은 앞쪽 절반이 선 자세라, 클립 전체로 평균 내면 묽어진다.
      const feet = Object.values(footMap).map((re) => matchNode(doc, re)).filter((i) => i != null);
      let ground = 0;
      let forwardSum = 0;
      let forwardN = 0;
      for (let i = 0; i < steps; i++) {
        const sampled = at((durationS * i) / steps);
        const hip = nodeWorldPos(doc, hipIdx, sampled, parent);
        let fx = 0; let fz = 0;
        for (const fi of feet) {
          const p = nodeWorldPos(doc, fi, sampled, parent);
          ground = Math.min(ground, p[1]);
          fx += p[0] / feet.length;
          fz += p[2] / feet.length;
        }
        if (feet.length && Math.abs(hip[1] - low) <= 0.02) {
          forwardSum += Math.hypot(fx - hip[0], fz - hip[2]);
          forwardN++;
        }
      }
      const forward = forwardN ? forwardSum / forwardN : 0;
      // **쪼그린 사람은 앉은 것이 아니다.** 엉덩이만 보면 둘이 같다.
      if (forward >= SEAT_FEET_FORWARD_MIN) {
        clip.seat = {
          hipHeightM: +low.toFixed(3),
          hipRatio: +ratio.toFixed(3),
          feetForwardM: +forward.toFixed(3),
          groundOffsetM: +ground.toFixed(3),
          dwell: +dwell.toFixed(2),
        };
      } else {
        notes.push(`엉덩이는 ${low.toFixed(2)}m 로 낮지만 발이 ${forward.toFixed(2)}m 앞이라 앉은 것으로 안 센다`);
      }
    }
  }

  clip.measuredBy = `peoplemaker/packBuild ${SAMPLE_HZ}Hz · travel≥${TRAVEL_MIN_MPS}m/s · plant≤${PLANT_MAX_Y_M}m for ≥${PLANT_MIN_DWELL_S}s · seat<${SEATED_HIP_RATIO_MAX}×rest`;
  return { clip, notes };
}

/**
 * 잰 것과 적은 것을 합쳐 카탈로그로.
 *
 * 순서를 고정한다 — 팩을 다시 구울 때마다 순서가 바뀌면 diff 가 통째로
 * 바뀌어서 무엇이 달라졌는지 안 보인다.
 */
export function buildCatalog({ packId, version, skeleton, clips, body, bodyFar, bodyDims, person, origins }) {
  return {
    packId,
    version,
    skeleton,
    // 몸이 따로인 팩 — 클립은 뼈 움직임만 든다 (lib/gltfWrite.mjs)
    ...(body ? { body } : {}),
    // **먼 사람용 몸** — 줄인 살 + 구운 색, 텍스처 없음. 도시 스케일 화면은
    // 이것만 받으면 된다 (4.2MB → 95KB). 무엇을 얼마로 줄였는지가 함께 남는다.
    ...(bodyFar ? { bodyFar } : {}),
    // **이 몸을 잰 치수** — 사이즈코리아 통계와 다른 값이다 (출처가 그렇게 적힌다).
    ...(bodyDims ? { bodyDims } : {}),
    // **이 팩의 사람이 누구인가** — 잰 값이 아니라 sources.json 에 적힌 값이다
    // (출처가 `declared-*`). 배역(lib/cast.mjs)이 이것으로 고른다. 사람이
    // 아닌 팩(검사용 합성 팩)에는 없다.
    ...(person ? { person } : {}),
    // **표기 의무의 뿌리** — 이 팩의 자산이 어디서 왔는가. 고지문은 글로
    // 안 적고 licenses/ 의 파일을 가리킨다 (lib/attribution.mjs).
    ...(origins?.length ? { origins } : {}),
    forwardRad: packForwardRad(clips),
    builtBy: 'peoplemaker/build-pack',
    clips: [...clips].sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}

/**
 * 이 팩의 **앞이 어디인가** (rad, 0 = +Z).
 *
 * 리그마다 앞이 다르다 — 이 저장소의 기준 팩은 -Z 를 보고 있고, Mixamo
 * 파일도 대개 그렇다. 쓰는 쪽은 "이 사람을 북쪽으로 걷게 해" 라고 말하지
 * 리그의 사정을 알 이유가 없으므로, 그 차이를 **재서** 카탈로그에 적고
 * 어댑터가 흡수한다.
 *
 * 이동 클립이 없으면 잴 수가 없다 — 그때는 null 이고, 어댑터는 회전을
 * 안 건드린다 (짐작한 0 을 넣으면 틀렸을 때 말이 없다).
 */
export function packForwardRad(clips) {
  const travels = clips.filter((c) => c.rootMotion === 'travel' && typeof c.travelHeadingRad === 'number');
  if (!travels.length) return null;
  const base = travels[0].travelHeadingRad;
  for (const c of travels) {
    if (angleDiff(c.travelHeadingRad, base) > FORWARD_AGREE_RAD) {
      throw new Error(
        `이동 클립의 진행 방향이 갈린다 — ${travels[0].id} 는 ${((base * 180) / Math.PI).toFixed(1)}°, `
        + `${c.id} 는 ${((c.travelHeadingRad * 180) / Math.PI).toFixed(1)}°. `
        + '리그가 섞였거나 옆걸음 클립이 들어온 것이다 — 사람이 봐야 한다',
      );
    }
  }
  return +base.toFixed(4);
}
