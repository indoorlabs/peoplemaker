// 사람 여럿을 세울 때 무엇이 벽인가.
//
// urbanspace 에서 배운 것을 그대로 가져온다: **세우기 전에 얼마 드는지를 수로
// 두고, 게이트가 그 수를 지킨다.** 거기서는 엔티티 예산이었고 여기서는 뼈다.
//
// ## 벽은 사람 수가 아니라 총 뼈 수다
//
// 2026-09-10 에 쟀다 (scripts/measure-crowd.mjs). 프레임마다 드는 시간은
// 사람 수에 비례하지 않는다 — **사람 × 뼈**가 어느 선을 넘으면 뼈 하나당
// 비용이 3배로 뛴다:
//
//   뼈  인원   총 뼈    뼈 하나당
//   65   100    6,500      77ns
//   33   200    6,600      91ns
//   11   400    4,400     172ns
//   33   400   13,200     306ns
//   65   400   26,000     391ns
//   11   800    8,800     534ns
//
// 총 뼈가 8,000 언저리를 넘으면 값이 뛴다. 작업 집합이 캐시를 벗어나는
// 자리이고, 그래서 **뼈를 줄이는 것이 사람을 줄이는 것만큼 효과가 있다**.
// 이것이 LOD 리그를 두는 이유다 — 멀리 있는 사람에게 손가락 30개는 없어도 된다.
//
// 이 파일에는 three.js 도 DOM 도 없다. 값과 규칙만 있다.

/**
 * 실측 기록.
 *
 * 인체치수와 같은 규약이다 — **누가 언제 어떻게 잰 값인지 없이는 값이
 * 아니다.** 기계가 바뀌면 절대값은 달라지므로, 게이트는 이 수를 그대로
 * 검사하지 않고 **관계**(뼈가 늘면 비싸진다, 문턱을 넘으면 뛴다)를 본다.
 */
export const MEASURED = {
  date: '2026-09-10',
  machine: 'AMD Ryzen 7 8845HS',
  runtime: 'node v22.14.0 (--expose-gc)',
  method: 'scripts/measure-crowd.mjs — AnimationMixer.update + updateMatrixWorld + Skeleton.update, 150프레임',
  note: 'Node 에서 잰 CPU 몫이다. GPU(드로우콜·정점 스키닝)는 브라우저에서 재야 하고, 그것은 spacemaker 안에서 잴 값이다.',
  boneNs: { belowKnee: 121, aboveKnee: 355 },
  kneeTotalBones: 8000,
};

/** 이 수를 넘으면 뼈 하나당 비용이 뛴다 (사람 × 뼈). */
export const KNEE_TOTAL_BONES = MEASURED.kneeTotalBones;

/**
 * 리그 단계.
 *
 * `bones` 는 **재서 채워야 하는 값**이다. 지금 65 는 합성 리그로 잰 것이고,
 * 진짜 Mixamo 파일의 뼈 수는 파일을 받아 세어야 한다 — 손가락을 포함해
 * 60~70개라고 알려져 있지만, 이 저장소는 알려진 것을 값으로 안 쓴다.
 */
export const TIERS = {
  full: {
    ko: '가까이 — 손가락까지',
    bones: 65,
    bonesSource: 'synthetic',   // TODO: 진짜 Mixamo 파일로 확인
    drawCallsPerPerson: 1,
  },
  simple: {
    ko: '중간 — 손가락 없음',
    bones: 33,
    bonesSource: 'synthetic',
    drawCallsPerPerson: 1,
  },
  coarse: {
    ko: '멀리 — 몸통과 팔다리만',
    bones: 11,
    bonesSource: 'synthetic',
    drawCallsPerPerson: 1,
  },
  // 아직 없는 단계. 뼈를 아예 안 쓰는 길이고, 그때 이 표의 셈이 달라진다.
  impostor: {
    ko: '아주 멀리 — 뼈 없이 판때기',
    bones: 0,
    pending: 'VAT(자세를 텍스처로 구움) 또는 빌보드. 만들면 여기 값을 채운다',
    drawCallsPerPerson: 0,
  },
};

/** 이 구성의 뼈 하나당 비용 (ns) — 문턱을 넘었는가로 갈린다. */
export function boneCostNs(totalBones) {
  return totalBones > KNEE_TOTAL_BONES ? MEASURED.boneNs.aboveKnee : MEASURED.boneNs.belowKnee;
}

/**
 * 이 구성이 프레임마다 쓰는 CPU (ms).
 *
 * @param mix [{ tier, count }]
 */
export function frameCostMs(mix) {
  const totalBones = mix.reduce((s, m) => s + (TIERS[m.tier]?.bones || 0) * m.count, 0);
  const ns = boneCostNs(totalBones);
  return { totalBones, boneNs: ns, ms: +((totalBones * ns) / 1e6).toFixed(3) };
}

/**
 * CPU 예산 안에 몇 명을 세울 수 있는가.
 *
 * **문턱을 넘는지를 함께 본다.** 넘은 채로 답을 내면 실제로는 3배 느린 수를
 * "가능하다" 고 말하게 된다 — 그것이 예산이 거짓말하는 방식이다.
 */
export function affordable(tier, cpuBudgetMs) {
  const bones = TIERS[tier]?.bones;
  if (!bones) return null;
  const guess = (n) => (n * bones * boneCostNs(n * bones)) / 1e6;
  // 문턱 아래에서 몇 명인지 먼저 보고, 그 답이 문턱을 넘으면 넘은 값으로 다시 센다.
  let n = Math.floor((cpuBudgetMs * 1e6) / (bones * MEASURED.boneNs.belowKnee));
  if (n * bones > KNEE_TOTAL_BONES) {
    n = Math.floor((cpuBudgetMs * 1e6) / (bones * MEASURED.boneNs.aboveKnee));
  }
  return { tier, people: Math.max(0, n), bones, cpuMs: +guess(n).toFixed(3), overKnee: n * bones > KNEE_TOTAL_BONES };
}

/**
 * 거리에 따라 단계를 나눠 예산을 맞춘다.
 *
 * 배치는 이 저장소의 일이 아니지만(README 의 경계), **얼마나 감당되는가**는
 * 팩을 만드는 쪽이 답해야 한다 — 소비처가 "몇 명까지 되나" 를 물을 자리가
 * 여기밖에 없다.
 *
 * @param want   세우고 싶은 사람 수
 * @param budgetMs CPU 예산
 * @returns { mix, ms, dropped } 가까운 사람부터 좋은 단계를 준다
 */
export function planCrowd(want, budgetMs, order = ['full', 'simple', 'coarse']) {
  const mix = order.map((tier) => ({ tier, count: 0 }));
  let left = want;
  for (const slot of mix) {
    const bones = TIERS[slot.tier].bones;
    if (!bones) continue;
    while (left > 0) {
      const trial = mix.map((m) => (m === slot ? { ...m, count: m.count + 1 } : m));
      if (frameCostMs(trial).ms > budgetMs) break;
      slot.count++;
      left--;
    }
    if (!left) break;
  }
  const cost = frameCostMs(mix);
  return { mix: mix.filter((m) => m.count), ...cost, dropped: left };
}
