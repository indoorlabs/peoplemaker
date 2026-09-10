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

/**
 * 브라우저 실측 — **GPU 까지 포함한 값**.
 *
 * 위(MEASURED)는 Node 에서 잰 CPU 몫이다. 화면에 세우면 드로우콜과 정점
 * 스키닝이 더해지는데, 그것은 브라우저에서만 잴 수 있다 (demo/main.js 의
 * `__renderBench` — rAF 를 안 쓰고 동기 루프 + gl.finish 로 잰다. 창이
 * 가려지면 브라우저가 rAF 를 1Hz 로 묶어서 재기가 아예 안 되기 때문이다).
 *
 *   사람  뼈   총 뼈   드로우콜   ms/프레임
 *    200  11   2,200      201       2.76
 *    100  65   6,500      101       7.33
 *    800  11   8,800      801      18.89
 *    200  65  13,000      201      17.09
 *
 * **벽이 둘이다.** 800명×뼈11(드로우콜 801)과 200명×뼈65(드로우콜 201)가
 * 거의 같은 비용이다 — 앞은 드로우콜이, 뒤는 뼈가 벽이다. Node 에서는 뼈만
 * 보였는데, 화면에서는 사람 수 자체가 드로우콜로 값을 매긴다.
 *
 * 그래서 LOD 리그(뼈 줄이기)만으로는 모자라고, **드로우콜을 줄이는 단계**가
 * 있어야 한다 — TIERS.impostor 가 pending 인 이유가 이것이다.
 *
 * **주의: 이 몸은 정점이 520개다.** 진짜 캐릭터는 5,000~15,000이므로 정점
 * 스키닝 몫은 여기서 훨씬 작게 잡혀 있다. 드로우콜과 뼈 몫은 구조적이라
 * 그대로지만, 삼각형 몫은 진짜 메시로 다시 재야 한다.
 */
export const BROWSER_MEASURED = {
  date: '2026-09-10',
  machine: 'AMD Ryzen 7 8845HS · Radeon 780M',
  runtime: 'Chromium (Playwright) · three r186 · pixelRatio 1',
  method: 'demo/main.js __renderBench — 동기 루프 120프레임 + gl.finish, vsync·합성 제외',
  bodyVertices: 520,
  points: [
    { people: 200, bones: 11, drawCalls: 201, ms: 2.76 },
    { people: 100, bones: 65, drawCalls: 101, ms: 7.33 },
    { people: 800, bones: 11, drawCalls: 801, ms: 18.89 },
    { people: 200, bones: 65, drawCalls: 201, ms: 17.09 },
  ],
  note: '몸 정점 520개짜리다. 진짜 캐릭터(5,000~15,000)면 삼각형 몫이 커진다 — 다시 재야 한다.',
};

/**
 * 스킨드와 인스턴싱을 **같은 자로** 견준 값.
 *
 * ── 재는 자를 두 번 고쳤다 ──────────────────────────────────────
 *
 * 1. rAF 로 재려 하니 "브라우저가 탭을 묶었다" 가 나왔다 (창이 가려지면
 *    1Hz 로 내려간다). 그래서 동기 루프 + gl.finish 로 바꿨다.
 * 2. 그랬더니 5,000명·삼각형 390만이 **0.127ms** 로 읽혔다. 초당 30조
 *    삼각형이라는 뜻이라, 그 수는 그럴 리가 없다는 것으로 스스로를 반증한다.
 *    브라우저에서 gl.finish 는 명령을 GPU 프로세스로 보내는 데서 끝나고
 *    그린 것이 끝나기를 기다리지 않는다. WebGL2 의 타이머 질의
 *    (EXT_disjoint_timer_query_webgl2)로 다시 쟀다.
 *
 * 같은 구성(200명 · 뼈 65 · 몸 정점 1,560 · 삼각형 156,000):
 *
 *   방식        드로우콜   CPU ms   GPU ms
 *   skinned         201     16.94    16.79
 *   instanced         2      0.04     0.84
 *
 * **CPU 458배 · GPU 20배.** 사람마다 드로우콜을 두는 것이 벽이었다는 뜻이다.
 * 5,000명까지 올려도 CPU 0.12 · GPU 2.62ms 다 (삼각형 390만).
 */
export const INSTANCED_MEASURED = {
  date: '2026-09-10',
  machine: 'AMD Radeon 780M (ANGLE D3D11)',
  method: 'demo/main.js __gpuBench — EXT_disjoint_timer_query_webgl2, 60프레임',
  bodyVertices: 1560,
  points: [
    { mode: 'skinned', people: 200, bones: 65, drawCalls: 201, cpuMs: 16.94, gpuMs: 16.79 },
    { mode: 'instanced', people: 200, bones: 65, drawCalls: 2, cpuMs: 0.04, gpuMs: 0.84 },
    { mode: 'instanced', people: 5000, bones: 65, drawCalls: 2, cpuMs: 0.12, gpuMs: 2.62 },
  ],
};

/**
 * P1 의 끝나는 조건에 대한 답 — **지금 구조로는 아슬아슬하다.**
 *
 * "사람 200명이 60fps" 는 뼈 65개 리그에서 17.1ms 다 (58fps). 그런데 그것은
 * 몸이 정점 520개일 때이고, 진짜 캐릭터를 쓰면 넘는다. 사람마다 드로우콜
 * 하나인 구조를 그대로 두고는 못 넘는다는 뜻이다.
 */
export const P1_VERDICT = {
  target: '200명 60fps',
  measured: 'skinned 200명 = CPU 16.9 · GPU 16.8ms (60fps 를 겨우 못 넘는다) / instanced 200명 = CPU 0.04 · GPU 0.84ms',
  verdict: '드로우콜을 하나로 줄이면 넘는다. 5,000명까지도 GPU 2.6ms 다 — 이제 벽은 사람 수가 아니라 몸의 정점 수다',
  next: '진짜 캐릭터(정점 5,000~15,000)로 다시 재야 한다. 지금 몸은 1,560이다',
};

export const INSTANCED_MS_PER_PERSON = 0.00055;

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
  // **구운 자세로 한 번에 그리는 단계.** 만들었다 (src/web/instancedCrowd.mjs).
  //
  // 뼈는 그대로 65개인데 드로우콜이 사람 수와 무관하게 하나다. 그래서 위
  // 단계들과 셈이 다르다 — 뼈로 세면 안 되고, 사람당 실측값으로 센다.
  instanced: {
    ko: '멀리 — 구운 자세, 드로우콜 하나',
    bones: 65,
    bonesSource: 'synthetic',
    sharedDraw: true,
    drawCallsPerPerson: 0,
    note: '구운 클립만 틀 수 있고 섞어 넘기기가 없다. 가까운 사람에게는 안 쓴다.',
  },
};

/**
 * 인스턴싱 단계의 사람 하나당 비용 (ms) — **실측**.
 *
 * 5,000명에서 CPU 0.117 + GPU 2.616 = 2.733ms 였다 (몸 정점 1,560).
 * 사람당 0.00055ms 다. 뼈로 세는 위 단계와 자릿수가 다르다 — 그래서 표를
 * 따로 둔다.
 */

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
  // **공유 드로우 단계는 셈이 다르다.** 뼈로 세면 안 된다 — 인스턴싱은
  // 사람이 늘어도 드로우콜이 안 늘고, 뼈 행렬도 사람마다 다시 안 만든다
  // (구워 둔 것을 셰이더가 읽는다). 그래서 사람당 실측값으로 센다.
  const shared = mix.filter((m) => TIERS[m.tier]?.sharedDraw);
  const skinned = mix.filter((m) => !TIERS[m.tier]?.sharedDraw);
  const totalBones = skinned.reduce((s, m) => s + (TIERS[m.tier]?.bones || 0) * m.count, 0);
  const ns = boneCostNs(totalBones);
  const sharedMs = shared.reduce((s, m) => s + m.count * INSTANCED_MS_PER_PERSON, 0);
  return {
    totalBones,
    boneNs: ns,
    sharedPeople: shared.reduce((s, m) => s + m.count, 0),
    ms: +((totalBones * ns) / 1e6 + sharedMs).toFixed(3),
  };
}

/**
 * CPU 예산 안에 몇 명을 세울 수 있는가.
 *
 * **문턱을 넘는지를 함께 본다.** 넘은 채로 답을 내면 실제로는 3배 느린 수를
 * "가능하다" 고 말하게 된다 — 그것이 예산이 거짓말하는 방식이다.
 */
export function affordable(tier, cpuBudgetMs) {
  const spec = TIERS[tier];
  if (!spec) return null;
  if (spec.sharedDraw) {
    // 실측값으로 나눈다. 문턱이 없다 — 뼈가 아니라 정점과 드로우콜이 비용이고,
    // 드로우콜은 사람 수와 무관하기 때문이다.
    const people = Math.floor(cpuBudgetMs / INSTANCED_MS_PER_PERSON);
    return { tier, people, bones: spec.bones, cpuMs: +(people * INSTANCED_MS_PER_PERSON).toFixed(3), overKnee: false, shared: true };
  }
  const bones = spec.bones;
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
 * **먼저 다 담고, 남는 예산으로 올린다.**
 *
 * 처음에는 좋은 단계부터 예산이 찰 때까지 채웠다. 그랬더니 5,000명을
 * 요청하면 173명만 좋은 단계로 세우고 **4,812명을 버렸다** — 싼 단계가
 * 있는데도. 사람을 버리는 것보다 거칠게 세우는 것이 낫다.
 *
 * 그래서 순서를 뒤집었다: 가장 싼 단계로 전부 담아 보고(그래도 넘치면 그때는
 * 버린다), 남는 예산으로 가까운 사람부터 좋은 단계로 올린다.
 *
 * @param want     세우고 싶은 사람 수
 * @param budgetMs 예산
 * @param order    좋은 단계부터
 */
export function planCrowd(want, budgetMs, order = ['full', 'simple', 'coarse']) {
  const tiers = order.filter((t) => TIERS[t]);
  if (!tiers.length) return { mix: [], totalBones: 0, ms: 0, dropped: want };
  const cheapest = tiers[tiers.length - 1];

  // 1) 가장 싼 단계로 담을 수 있는 만큼.
  const room = affordable(cheapest, budgetMs);
  const held = Math.min(want, room?.people ?? 0);
  const counts = Object.fromEntries(tiers.map((t) => [t, 0]));
  counts[cheapest] = held;

  // 2) 남는 예산으로 좋은 단계부터 올린다. 한 명씩 올려 보고 예산을 넘으면
  //    거기서 멈춘다 — 자릿수를 맞추는 일이라 한 명씩으로 충분하다.
  for (const tier of tiers) {
    if (tier === cheapest) break;
    while (counts[cheapest] > 0) {
      const trial = { ...counts, [tier]: counts[tier] + 1, [cheapest]: counts[cheapest] - 1 };
      const mix = tiers.map((t) => ({ tier: t, count: trial[t] }));
      if (frameCostMs(mix).ms > budgetMs) break;
      counts[tier]++;
      counts[cheapest]--;
    }
  }

  const mix = tiers.map((t) => ({ tier: t, count: counts[t] })).filter((m) => m.count);
  const cost = frameCostMs(mix);
  return { mix, ...cost, dropped: want - held };
}
