// 팩을 **고르는** 쪽 — 순수 로직.
//
// 쓰는 쪽(spacemaker · urbanspace)이 아는 것은 "이 사람은 1.1m/s 로 걷는다"
// 이고, 팩이 가진 것은 "1.35m/s 로 걷는 클립" 이다. 그 사이를 잇는 것이
// 여기다: 어느 클립을 쓰고 재생 속도를 얼마로 할지.
//
// three.js 없이 정해진다 — 그래서 게이트가 브라우저 없이 검사한다. 어댑터
// (src/web/clipPlayer.mjs)는 여기서 나온 답을 믿고 앉히기만 한다.

/**
 * 재생 속도를 얼마나 늘리고 줄여도 되는가.
 *
 * 걷는 클립을 두 배로 돌리면 보폭은 그대로인데 다리만 빨라진다 — 사람이
 * 보면 "종종걸음" 이 아니라 **필름을 빨리 감은 것**으로 보인다. 그래서
 * 가까운 클립을 먼저 고르고, 그래도 남는 차이만 재생 속도로 메운다.
 *
 * ±25% 는 보폭 변화가 눈에 띄기 시작하는 대략의 자리다. 이 값은 **눈으로
 * 정한 것**이고, 재서 바꿔야 한다면 그때 이 주석을 고친다.
 */
export const TIME_SCALE_MAX = 1.25;
export const TIME_SCALE_MIN = 1 / TIME_SCALE_MAX;

/** 걷는 클립 — 이동하고, 발 접촉이 있는 것. */
export function walkClips(catalog) {
  return (catalog?.clips || []).filter(
    (c) => c.rootMotion === 'travel' && c.speedMps > 0 && (c.contacts || []).some((x) => x.kind === 'plant'),
  );
}

/** 제자리 클립 — 경로를 쓰는 쪽이 직접 옮길 때 쓴다. */
export function inPlaceClips(catalog) {
  return (catalog?.clips || []).filter((c) => c.rootMotion === 'in-place');
}

/**
 * 이 속도로 걸으려면 어느 클립을 얼마로 돌릴 것인가.
 *
 * @returns { clipId, timeScale, effectiveMps, exact } 또는 null
 *   exact  재생 속도를 안 건드리고 되는가
 *
 * 못 맞추는 경우(팩에 느린 클립이 없는데 아주 느리게 걸어야 하는 등)에도
 * **가장 가까운 것**을 돌려주되 `timeScale` 이 한계에 걸렸다고 알린다 —
 * null 을 주면 쓰는 쪽이 사람을 아예 안 세우게 되고, 그것은 더 나쁘다.
 */
export function pickWalkClip(catalog, desiredMps) {
  const clips = walkClips(catalog);
  if (!clips.length || !(desiredMps > 0)) return null;
  // 필요한 재생 속도가 1 에 가장 가까운 클립. 로그 거리로 재야 0.5배와
  // 2배가 같은 만큼 멀다 — 선형으로 재면 느린 쪽만 골라진다.
  let best = null;
  for (const c of clips) {
    const raw = desiredMps / c.speedMps;
    const dist = Math.abs(Math.log(raw));
    if (!best || dist < best.dist) best = { c, raw, dist };
  }
  const clamped = Math.min(TIME_SCALE_MAX, Math.max(TIME_SCALE_MIN, best.raw));
  return {
    clipId: best.c.id,
    timeScale: +clamped.toFixed(4),
    effectiveMps: +(best.c.speedMps * clamped).toFixed(3),
    exact: Math.abs(best.raw - clamped) < 1e-9,
    clamped: Math.abs(best.raw - clamped) >= 1e-9,
  };
}

/**
 * 이 클립을 재생 속도 s 로 돌릴 때의 발 접촉 시각.
 *
 * 접촉을 왜 옮겨야 하는가: 계단·문턱에 발을 맞추려면 **언제** 닿는지를
 * 알아야 하는데, 재생 속도를 바꾸면 그 시각이 함께 바뀐다. 원본 시각을
 * 그대로 쓰면 빨리 걷는 사람의 발이 늦게 닿는다.
 */
export function contactsAt(clip, timeScale = 1) {
  if (!(timeScale > 0)) return [];
  return (clip.contacts || []).map((c) => ({ ...c, atS: +(c.atS / timeScale).toFixed(4) }));
}

/** 재생 속도를 반영한 실제 길이 (s). */
export function durationAt(clip, timeScale = 1) {
  if (!(timeScale > 0)) return 0;
  return +(clip.durationS / timeScale).toFixed(4);
}

/**
 * 걸음 주기 — 접촉과 접촉 사이 (s).
 *
 * 보행 시뮬이 쓰는 값이다. 한 발이 두 번 닿는 사이가 한 주기이고, 좌우가
 * 번갈아 닿으므로 접촉 간격은 그 절반이다.
 */
export function strideS(clip, timeScale = 1) {
  const cs = contactsAt(clip, timeScale).filter((c) => c.kind === 'plant');
  if (cs.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < cs.length; i++) sum += cs[i].atS - cs[i - 1].atS;
  return +((sum / (cs.length - 1)) * 2).toFixed(4);
}
