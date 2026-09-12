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
  next: '진짜 몸으로 다시 쟀고(PACK_MEASURED.rocketbox · 정점 4,883), 정점이 벽이라 살을 줄였다 — 4ms 에 823명이 3,623명이 됐다 (instancedLod). 다음 벽은 값이 아니라 그림이다: 먼 단계는 한 색으로 칠한다',
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

// ── 진짜 몸으로 잰 한 프레임 ─────────────────────────────────────

/**
 * 팩별 브라우저 실측 — **진짜 몸으로 잰 한 프레임 시간**.
 *
 * 위의 모형(뼈 수 × 뼈당 시간)은 Node 에서 뼈 행렬 갱신만 잰 값이다. Rocketbox
 * 몸(정점 5,438 · 메시 3 · 뼈 80)을 화면에 세워 보니 **13~15배 모자랐다** —
 * 75명을 모형은 0.73ms 로 보는데 실제는 10.81ms 다. 드로우콜 제출과 메시마다
 * 뼈 행렬을 올리는 몫이 통째로 빠져 있고, 사람 하나가 메시 셋(몸·머리·
 * 머리카락)이라 드로우콜도 셋이다.
 *
 * 그래서 진짜 몸이 있는 팩은 **잰 표로** 값을 낸다. 표는 기계에 매이므로
 * 언제·어디서·어떻게 쟀는지를 함께 둔다 (인체치수와 같은 규약).
 */
export const PACK_MEASURED = {
  rocketbox: {
    date: '2026-09-11',
    machine: 'AMD Ryzen 7 8845HS · Radeon 780M (ANGLE D3D11)',
    runtime: 'Chromium (Playwright) · three r186 · WebGLRenderer',
    method: 'demo/index.html?pack=rocketbox-f01&mode=skinned · __gpuBench(60) — 한 번 돌려 준비하고 두 번째 값을 쓴다. 사람 수마다 페이지를 새로 연다',
    body: { pack: 'rocketbox-f01', verts: 5438, meshesPerPerson: 3, bones: 80 },
    note: 'CPU 와 GPU 가 거의 같게 나온다 — 동기 루프라 GPU 가 밀리면 CPU 도 기다린다. 둘을 가르지 않고 한 프레임 시간으로 쓴다. rocketbox-m01(정점 4,697)은 이 몸보다 가볍다.',
    points: [
      { people: 25, drawCalls: 76, totalBones: 2000, frameMs: 3.65 },
      { people: 50, drawCalls: 151, totalBones: 4000, frameMs: 6.37 },
      { people: 75, drawCalls: 226, totalBones: 6000, frameMs: 10.81 },
      { people: 100, drawCalls: 301, totalBones: 8000, frameMs: 17.82 },
    ],
    // 같은 날·같은 기계에서 기준 팩(합성 리그)을 다시 쟀다. 모형이 틀린 것인지
    // 기계가 다른 것인지를 가르려고 둔다 — 기준 팩은 여전히 싸고(100명 1.5ms),
    // 비싼 것은 이 몸이다. 값은 CPU·GPU 중 큰 쪽.
    baseline: {
      pack: 'ref-synthetic', verts: 264, bones: 11,
      points: [
        { people: 50, drawCalls: 51, frameMs: 1.017 },
        { people: 100, drawCalls: 101, frameMs: 1.543 },
      ],
    },
    // 먼 단계(구운 자세 + InstancedMesh) — **같은 몸으로** 쟀다. 드로우콜은
    // 사람 수와 상관없이 2 이고, 값은 거의 GPU 몫이다 (CPU 0.04~0.05ms).
    // 살은 몸·머리만이다: 속눈썹·머리카락 카드는 한 색 셰이더가 판째로
    // 칠하므로 뺐다 (web/index.mjs 의 geometryOf). 옛 표(정점 1,560)의
    // 사람당 0.00055ms 보다 7~8배 무겁다.
    instanced: {
      verts: 4883,
      points: [
        { people: 200, drawCalls: 2, frameMs: 1.461 },
        { people: 500, drawCalls: 2, frameMs: 2.519 },
        { people: 1000, drawCalls: 2, frameMs: 4.811 },
      ],
    },
    // **살을 줄인 먼 단계** — 같은 몸을 삼각형 4분의 1로 접었다 (lib/meshLod.mjs).
    //
    // 위 표에서 드로우콜은 이미 2 인데 1,000명이 4.81ms 였다. 드로우콜이
    // 아니라면 남은 것은 정점·삼각형 몫이고, 그것은 살을 줄이는 것 말고
    // 줄일 길이 없다. 줄여서 다시 쟀다 (2026-09-12, 같은 기계):
    //
    //   사람    삼각형      안 줄임    줄임(0.25)
    //    200    40만/200만    1.46       0.95
    //   1000   201만/806만    4.81       1.46
    //   5000  1008만/4032만   —          5.32
    //
    // **4ms 예산이 823명에서 3,623명으로 늘었다.** 뼈와 가중치는 안 건드리므로
    // 구운 아틀라스는 그대로다 — 굽는 쪽은 아무것도 안 바뀐다.
    //
    // 대가는 살이 원래에서 벗어나는 거리다. 벗어남은 기계와 무관한 **이 살의
    // 성질**이라, 게이트가 매번 다시 재서 이 수와 견준다 (check-lod).
    instancedLod: {
      ratio: 0.25,
      verts: 1030,
      triangles: 2016,
      from: { verts: 4883, triangles: 8064 },
      // 원래 정점에서 줄인 살의 면까지 (키 1.6m 인 몸에서)
      deviation: { maxMm: 17.3, meanMm: 1.62 },
      // 브라우저에서 줄이는 데 드는 시간 — 받는 쪽이 첫 화면에서 한 번 치른다
      buildMs: 74,
      points: [
        { people: 200, drawCalls: 2, frameMs: 0.951 },
        { people: 500, drawCalls: 2, frameMs: 1.159 },
        { people: 1000, drawCalls: 2, frameMs: 1.461 },
        { people: 2000, drawCalls: 2, frameMs: 2.441 },
        { people: 5000, drawCalls: 2, frameMs: 5.323 },
      ],
      // 더 줄이면 더 싸다 — 삼각형에 거의 곧게 붙는다. 5,000명이 10분의 1
      // (삼각형 806 · 정점 425)에서 2.462ms 였다. 벗어남은 최대 44.9mm ·
      // 평균 5.25mm 로 커진다. 단계를 하나 더 둘 자리가 여기다.
      tenth: { ratio: 0.1, verts: 425, triangles: 806, people: 5000, frameMs: 2.462 },
    },
  },
};

/** 이 팩은 어느 실측 표를 쓰는가 — 없으면 null (그러면 뼈로 세는 모형으로 돌아간다). */
export function measuredFor(packId) {
  if (typeof packId !== 'string') return null;
  if (packId.startsWith('rocketbox-')) return PACK_MEASURED.rocketbox;
  return null;
}

/**
 * 잰 점들을 이어 N 명의 한 프레임 시간을 낸다 (ms).
 *
 * 점 사이는 곧게 잇는다. 첫 점 아래는 원점과 잇는다 — 고정 비용(약 1ms)을
 * 사람 수에 나눠 싣는 셈이라 작은 N 을 조금 비싸게 본다. 마지막 점 위는
 * 마지막 마디의 기울기로 늘이는데, 곡선이 점점 가팔라지므로 **낮게** 볼 수
 * 있다 — 그래서 그 영역에 들어가면 extrapolated 로 알린다.
 */
export function frameMsAt(points, people) {
  const pts = [...(points || [])].sort((a, b) => a.people - b.people);
  if (!(people > 0) || !pts.length) return { ms: 0, extrapolated: false };
  if (people <= pts[0].people) {
    return { ms: +((pts[0].frameMs * people) / pts[0].people).toFixed(3), extrapolated: false };
  }
  for (let i = 1; i < pts.length; i++) {
    if (people <= pts[i].people) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (people - a.people) / (b.people - a.people);
      return { ms: +(a.frameMs + t * (b.frameMs - a.frameMs)).toFixed(3), extrapolated: false };
    }
  }
  const b = pts[pts.length - 1];
  const a = pts[pts.length - 2] || { people: 0, frameMs: 0 };
  const slope = (b.frameMs - a.frameMs) / (b.people - a.people);
  return { ms: +(b.frameMs + slope * (people - b.people)).toFixed(3), extrapolated: true };
}

/**
 * 잰 표로 몇 명을 어느 단계로 세울지 — planCrowd 와 같은 모양으로 돌려준다.
 *
 * planCrowd 와 같은 차례를 따른다: **먼저 아무도 안 버리고**(모두 먼 단계로
 * 들어가는가), 남는 예산으로 가까운 사람을 스킨으로 올린다. 먼 단계를 못
 * 쓰면(WebGPU, 또는 표에 먼 단계가 없으면) 스킨으로만 채우고 나머지는 버린다.
 *
 * 두 단계의 값은 **더한다.** 각 표에 들어 있는 고정 비용(빈 장면의 약 0.6ms)이
 * 두 번 세어져 조금 비싸게 보는데, 싸게 보는 것보다 낫다.
 *
 * 먼 단계는 **살을 줄인 것**(instancedLod)과 안 줄인 것(instanced) 둘이다.
 * 둘 다 쓸 수 있다고 하면 줄인 쪽을 쓴다 — 같은 예산에 사람이 네 배다.
 * 줄이는 쪽을 안 쓰는 화면(가까이서 보는 소수)은 tiers 에서 빼면 된다.
 *
 * @param tiers 쓸 수 있는 단계 — ['full'] · ['full', 'instanced'] · ['full', 'instancedLod']
 */
export function planCrowdMeasured(want, budgetMs, table, tiers = ['full']) {
  const full = table?.points || [];
  const farTier = tiers.includes('instancedLod') && table?.instancedLod ? 'instancedLod'
    : tiers.includes('instanced') && table?.instanced ? 'instanced'
      : null;
  const inst = farTier ? table[farTier].points || null : null;
  const fullAt = (k) => frameMsAt(full, k);
  const instAt = (k) => frameMsAt(inst, k);
  const out = (nFull, nInst) => {
    const a = fullAt(nFull);
    const b = inst ? instAt(nInst) : { ms: 0, extrapolated: false };
    const mix = [];
    if (nFull) mix.push({ tier: 'full', count: nFull });
    if (nInst) mix.push({ tier: farTier, count: nInst });
    return {
      mix,
      ms: +(a.ms + b.ms).toFixed(3),
      dropped: Math.max(0, want - nFull - nInst),
      extrapolated: a.extrapolated || b.extrapolated,
      measuredBy: table?.body?.pack || null,
    };
  };

  if (!inst) {
    let n = 0;
    while (n < want && fullAt(n + 1).ms <= budgetMs) n++;
    return out(n, 0);
  }
  // 1. 모두 먼 단계로 들어가는가 — 안 들어가면 들어가는 만큼만.
  let base = 0;
  while (base < want && instAt(base + 1).ms <= budgetMs) base++;
  if (base < want) return out(0, base);
  // 2. 남는 예산으로 가까운 사람을 올린다. 스킨 값만으로 예산을 넘으면 더 볼 것이 없다.
  let best = 0;
  for (let k = 1; k <= want; k++) {
    const f = fullAt(k).ms;
    if (f > budgetMs) break;
    if (f + instAt(want - k).ms <= budgetMs) best = k;
  }
  return out(best, want - best);
}
