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
  biped: { 'foot-l': /^Bip01 L Toe0$/, 'foot-r': /^Bip01 R Toe0$/ },
};

/** 규약마다 뿌리 뼈 — 이동을 재는 기준. */
export const ROOT_NODES = {
  mixamo: /(^|:)Hips$/,
  vrm: /^hips$/,
  // Biped 는 몸 전체가 Bip01 에 매달려 있고 이동도 거기 실린다 (Pelvis 는
  // 그 아이다). 걷는 클립 하나를 재 보니 Bip01 이 1.167s 에 1.412m 갔다.
  biped: /^Bip01$/,
};

const matchNode = (doc, re) => {
  const i = (doc.json.nodes || []).findIndex((n) => re.test(n.name || ''));
  return i < 0 ? null : i;
};

/** 사람이 적을 수 없는 값 — sources.json 에 있으면 그것은 두 벌이다. */
export const MEASURED_FIELDS = ['durationS', 'rootMotion', 'speedMps', 'travelHeadingRad', 'contacts'];

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

  clip.measuredBy = `peoplemaker/packBuild ${SAMPLE_HZ}Hz · travel≥${TRAVEL_MIN_MPS}m/s · plant≤${PLANT_MAX_Y_M}m for ≥${PLANT_MIN_DWELL_S}s`;
  return { clip, notes };
}

/**
 * 잰 것과 적은 것을 합쳐 카탈로그로.
 *
 * 순서를 고정한다 — 팩을 다시 구울 때마다 순서가 바뀌면 diff 가 통째로
 * 바뀌어서 무엇이 달라졌는지 안 보인다.
 */
export function buildCatalog({ packId, version, skeleton, clips, body }) {
  return {
    packId,
    version,
    skeleton,
    // 몸이 따로인 팩 — 클립은 뼈 움직임만 든다 (lib/gltfWrite.mjs)
    ...(body ? { body } : {}),
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
