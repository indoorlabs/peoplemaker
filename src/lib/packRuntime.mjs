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

/**
 * 걷는 클립 — 이동하고, 발 접촉이 있는 것.
 *
 * **다친 걸음은 기본에서 뺀다.** 비상 동작을 받고 나서 소비처 시험을 돌렸더니
 * "1.1m/s 로 걸어" 라고 했는데 `walk-injured`(1.145m/s)가 뽑혔다 — 속도로만
 * 고르니 가장 가까웠던 것이다. 속도는 맞지만 **그림이 거짓**이다: 멀쩡한
 * 재실자가 전부 절뚝인다.
 *
 * 다친 걸음이 필요하면 **달라고 해야 한다** (`distress: true`). 없으면 빈
 * 목록이고, 그러면 쓰는 쪽이 "이 팩에는 다친 걸음이 없다" 를 안다.
 */
export function walkClips(catalog, { distress = false, holding = false } = {}) {
  return (catalog?.clips || []).filter((c) => {
    if (!(c.rootMotion === 'travel' && c.speedMps > 0)) return false;
    if (!(c.contacts || []).some((x) => x.kind === 'plant')) return false;
    if ((c.tags || []).includes('distress') !== distress) return false;
    // **드는 클립도 같은 규칙이다.** 로봇 팩에 들고 걷기(walk-carry, 속도가
    // walk-forward 와 같다)가 들어오자 속도로만 고르면 둘이 동률이라 빈손인
    // 사람이 무언가를 든 채로 걸을 수 있었다. 들었는지는 쓰는 쪽이 안다
    // (spacemaker 의 laden) — 빈손이면 드는 클립을 안 고르고, 들었으면 드는
    // 클립만 고른다. 든 팩에 드는 클립이 없으면 빈 목록이고, 그러면 쓰는 쪽이
    // "이 팩은 든 채로 못 걷는다" 를 안다 (조용히 빈손으로 걷지 않는다).
    return !!c.holds === holding;
  });
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
export function pickWalkClip(catalog, desiredMps, { distress = false, holding = false } = {}) {
  // holding 을 걸러내기에만 넣고 여기서 안 넘겨서 게이트에 잡혔다 — 규칙과 고르기는 한 줄로 이어져야 한다.
  const clips = walkClips(catalog, { distress, holding });
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
/**
 * **섞어 넘기는 시간의 위 한계** (s).
 *
 * 활동이 클립을 갈아탈 때 지금까지는 툭 끊었다. 회의(앉아서 말하기⇄듣기)
 * 에서는 덜 보이지만 버티기·주저앉기처럼 느린 동작에서는 그대로 보인다.
 *
 * 그런데 **섞으면 발이 미끄러진다.** 두 클립의 발이 서로 다른 자리에 있는
 * 동안 살이 그 사이 어딘가에 있게 되기 때문이다. 길게 섞을수록 부드럽고
 * 길게 미끄러진다 — 공짜가 아니다. 그래서 위 한계를 두고, 그 대가를
 * 게이트가 잰다 (scripts/check-player.mjs).
 */
export const CROSSFADE_MAX_S = 0.25;

/**
 * 이 두 클립 사이를 **얼마 동안 섞을 것인가** (s).
 *
 * 짧은 쪽 클립의 3분의 1을 넘지 않는다 — 0.3초짜리 클립을 0.25초 동안
 * 섞으면 그 클립은 거의 안 보이고 앞뒤만 뭉갠다.
 *
 * 이동 클립끼리는 **더 짧게** 섞는다. 걷다가 뛰는 사이에는 발이 땅에 닿아
 * 있는 시간이 있어서, 그 동안 섞으면 미끄러짐이 바로 눈에 띈다.
 *
 * @param from 지금 클립 (카탈로그의 것) · null 이면 처음 세우는 것이라 0
 * @param to   갈아탈 클립
 */
export function crossFadeS(from, to, { max = CROSSFADE_MAX_S } = {}) {
  if (!from || !to) return 0;
  if (from.id === to.id) return 0;
  const shortest = Math.min(from.durationS || 0, to.durationS || 0);
  if (!(shortest > 0)) return 0;
  const travelBoth = from.rootMotion === 'travel' && to.rootMotion === 'travel';
  return +Math.min(max * (travelBoth ? 0.5 : 1), shortest / 3).toFixed(3);
}

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
