// 클립에서 값을 **잰다**.
//
// 계약이 요구하는 것 중 넷은 사람이 적으면 안 되는 값이다:
//
//   durationS   길이
//   rootMotion  제자리인가 이동하는가
//   speedMps    이동한다면 얼마나 빠른가
//   contacts    발이 언제 땅에 닿는가
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
 * 스켈레톤 규약마다 발 뼈 이름.
 *
 * 이름으로 찾는 것이 규약을 하나로 묶는 이유다 — 팩에 두 벌이 섞이면 여기서
 * 한쪽을 못 찾고, 그 클립만 접촉이 비어 나온다.
 */
export const FOOT_NODES = {
  mixamo: { 'foot-l': /(^|:)LeftFoot$/, 'foot-r': /(^|:)RightFoot$/ },
  vrm: { 'foot-l': /^leftFoot$/, 'foot-r': /^rightFoot$/ },
};

/** 규약마다 뿌리 뼈 — 이동을 재는 기준. */
export const ROOT_NODES = {
  mixamo: /(^|:)Hips$/,
  vrm: /^hips$/,
};

const matchNode = (doc, re) => {
  const i = (doc.json.nodes || []).findIndex((n) => re.test(n.name || ''));
  return i < 0 ? null : i;
};

/** 사람이 적을 수 없는 값 — sources.json 에 있으면 그것은 두 벌이다. */
export const MEASURED_FIELDS = ['durationS', 'rootMotion', 'speedMps', 'contacts'];

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
  const travelM = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);   // 수평만 — 오르내림은 이동이 아니다
  const mps = travelM / durationS;
  if (mps >= TRAVEL_MIN_MPS) {
    clip.rootMotion = 'travel';
    clip.speedMps = +mps.toFixed(3);
  } else {
    clip.rootMotion = 'in-place';
  }
  notes.push(`이동 ${travelM.toFixed(3)}m / ${durationS}s = ${mps.toFixed(3)}m/s`);

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
    const ys = [];
    for (let i = 0; i <= steps; i++) {
      const t = (durationS * i) / steps;
      ys.push(nodeWorldPos(doc, idx, at(t), parent)[1]);
    }
    for (let i = 1; i < ys.length; i++) {
      if (!(ys[i - 1] > PLANT_MAX_Y_M && ys[i] <= PLANT_MAX_Y_M)) continue;   // 내려오며 지나는 순간만
      const atS = +((durationS * i) / steps).toFixed(3);
      // 문턱 근처에서 떨면 한 걸음이 여러 번으로 세어진다 — 앞 접촉과
      // 0.2s 안이면 한 번으로 본다 (사람의 한 걸음이 0.5s 대다).
      const last = contacts.filter((c) => c.part === part).pop();
      if (last && atS - last.atS < 0.2) continue;
      contacts.push({ atS, part, kind: 'plant' });
    }
  }
  contacts.sort((a, b) => a.atS - b.atS);
  clip.contacts = contacts;

  clip.measuredBy = `peoplemaker/packBuild ${SAMPLE_HZ}Hz · travel≥${TRAVEL_MIN_MPS}m/s · plant≤${PLANT_MAX_Y_M}m`;
  return { clip, notes };
}

/**
 * 잰 것과 적은 것을 합쳐 카탈로그로.
 *
 * 순서를 고정한다 — 팩을 다시 구울 때마다 순서가 바뀌면 diff 가 통째로
 * 바뀌어서 무엇이 달라졌는지 안 보인다.
 */
export function buildCatalog({ packId, version, skeleton, clips }) {
  return {
    packId,
    version,
    skeleton,
    builtBy: 'peoplemaker/build-pack',
    clips: [...clips].sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}
