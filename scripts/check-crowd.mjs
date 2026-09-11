// check:crowd — 예산 모델이 실제와 같은 방향으로 움직이는가.
//
// **절대값을 검사하지 않는다.** 뼈 하나당 몇 ns 인지는 기계가 정하므로, 다른
// 컴퓨터에서 돌리면 그 수는 달라진다. 그것을 게이트에 박으면 남의 기계에서
// 빨간불이 뜨고, 그러면 게이트가 꺼진다.
//
// 대신 **관계**를 본다. 관계는 기계가 바뀌어도 같다:
//
//   · 뼈가 늘면 비싸진다
//   · 사람이 늘면 비싸진다
//   · 총 뼈가 문턱을 넘으면 뼈 하나당 비용이 뛴다  ← 이것이 이 모델의 요점
//   · 예산을 두 배로 주면 사람이 는다
//
// 마지막으로 **지금 이 기계에서 다시 재서** 그 관계가 여전한지 확인한다.
// 모델이 실측에서 떨어지면 여기서 걸린다.

import { runGate } from './gate-lib.mjs';
import {
  TIERS, MEASURED, BROWSER_MEASURED, INSTANCED_MEASURED, INSTANCED_MS_PER_PERSON, P1_VERDICT,
  KNEE_TOTAL_BONES, boneCostNs, frameCostMs, affordable, planCrowd,
  PACK_MEASURED, measuredFor, frameMsAt, planCrowdMeasured,
} from '../src/lib/crowdBudget.mjs';

runGate('check-crowd', async (g) => {
  let n = 0;

  // ── 1. 실측 기록에 출처가 있는가 ──
  for (const f of ['date', 'machine', 'runtime', 'method']) {
    n++;
    if (!MEASURED[f]) g.fail(`measured/${f}`, `실측 기록에 ${f} 가 없다 — 언제 어디서 잰 값인지 없으면 값이 아니다`);
  }
  n++;
  if (!(MEASURED.boneNs.aboveKnee > MEASURED.boneNs.belowKnee)) {
    g.fail('measured/knee', '문턱 위가 아래보다 싸다고 적혀 있다');
  }

  // ── 1-2. 브라우저 실측 ──
  //
  // Node 에서 잰 것은 CPU 몫뿐이다. 화면의 값은 따로 재야 하고, 그 값에도
  // 출처가 있어야 한다. 그리고 **몸 정점 수**가 함께 적혀야 한다 — 정점이
  // 520개인 몸으로 잰 값을 진짜 캐릭터에 그대로 쓰면 안 되기 때문이다.
  {
    for (const f of ['date', 'machine', 'runtime', 'method', 'bodyVertices']) {
      n++;
      if (!BROWSER_MEASURED[f]) g.fail(`browser/${f}`, `브라우저 실측에 ${f} 가 없다`);
    }
    n++;
    if ((BROWSER_MEASURED.points || []).length < 3) {
      g.fail('browser/points', '점이 셋도 안 된다 — 벽이 무엇인지 갈릴 수가 없다');
    }
    n++;
    // **벽이 둘이라는 것**이 이 표의 주장이다. 드로우콜이 4배인 점과
    // 뼈가 6배인 점이 비슷한 값이어야 그 주장이 선다.
    const byCalls = BROWSER_MEASURED.points.find((p) => p.drawCalls >= 800);
    const byBones = BROWSER_MEASURED.points.find((p) => p.bones >= 65 && p.people >= 200);
    if (byCalls && byBones) {
      const ratio = byCalls.ms / byBones.ms;
      if (ratio < 0.5 || ratio > 2) {
        g.fail('browser/two-walls',
          `드로우콜이 벽인 점(${byCalls.ms}ms)과 뼈가 벽인 점(${byBones.ms}ms)이 ${ratio.toFixed(1)}배 차이다 — 둘 중 하나만 벽이라는 뜻이라 표의 설명이 틀렸다`);
      }
    } else g.fail('browser/two-walls', '두 벽을 견줄 점이 표에 없다');
    n++;
    // 사람이 늘면 비싸진다 — 같은 뼈 수에서.
    const same = BROWSER_MEASURED.points.filter((p) => p.bones === 11).sort((a, b) => a.people - b.people);
    if (same.length >= 2 && !(same[same.length - 1].ms > same[0].ms)) {
      g.fail('browser/people', '사람이 늘었는데 안 비싸졌다');
    }
    n++;
    if (!P1_VERDICT.measured || !P1_VERDICT.verdict) {
      g.fail('browser/verdict', 'P1 의 끝나는 조건에 대한 답이 적혀 있지 않다');
    }
  }

  // ── 1-3. 인스턴싱 실측 ──
  //
  // 드로우콜을 하나로 줄이는 단계다. 이 표가 주장하는 것은 "사람마다
  // 드로우콜을 두는 것이 벽이었다" 이고, 그것이 수로 서 있어야 한다.
  {
    for (const f of ['date', 'machine', 'method', 'bodyVertices']) {
      n++;
      if (!INSTANCED_MEASURED[f]) g.fail(`inst/${f}`, `인스턴싱 실측에 ${f} 가 없다`);
    }
    const pts = INSTANCED_MEASURED.points || [];
    const skinned = pts.find((p) => p.mode === 'skinned' && p.people === 200);
    const inst = pts.find((p) => p.mode === 'instanced' && p.people === 200);
    n++;
    if (!skinned || !inst) g.fail('inst/pair', '같은 구성을 두 방식으로 잰 점이 없다 — 견줄 수가 없다');
    else {
      n++;
      // **드로우콜이 줄었는가.** 이것이 이 단계의 존재 이유다.
      if (!(inst.drawCalls < skinned.drawCalls / 10)) {
        g.fail('inst/draws', `드로우콜이 ${skinned.drawCalls} → ${inst.drawCalls} 다 — 한 자리로 줄어야 한다`);
      }
      n++;
      if (!(inst.cpuMs < skinned.cpuMs / 10)) {
        g.fail('inst/cpu', `CPU 가 ${skinned.cpuMs} → ${inst.cpuMs} 다 — 자릿수가 안 바뀌면 바꾼 뜻이 없다`);
      }
      n++;
      // 그림은 같아야 한다 — 삼각형 수가 다르면 다른 것을 그린 것이다.
      if (skinned.bones !== inst.bones) g.fail('inst/same', '두 방식이 다른 리그로 재어졌다');
    }
    n++;
    // 사람당 값이 실측과 맞는가. 표를 고치면 이 수도 따라와야 한다.
    const big = pts.find((p) => p.mode === 'instanced' && p.people >= 1000);
    if (big) {
      const perPerson = (big.cpuMs + big.gpuMs) / big.people;
      if (Math.abs(perPerson - INSTANCED_MS_PER_PERSON) > INSTANCED_MS_PER_PERSON * 0.5) {
        g.fail('inst/per-person',
          `사람당 ${INSTANCED_MS_PER_PERSON}ms 라고 적었는데 실측은 ${perPerson.toFixed(5)}ms 다`);
      }
    } else g.fail('inst/per-person', '사람당 값을 확인할 큰 점이 없다');
    n++;
    if (!TIERS.instanced?.sharedDraw) g.fail('inst/tier', '인스턴싱 단계가 공유 드로우로 안 적혀 있다');
    n++;
    // **공짜가 아니다.**
    //
    // 공유 드로우를 셈에서 빼도록 코드를 깨 봤더니 게이트가 통과했다 —
    // 인스턴싱 사람이 뼈로도 안 세어지고 사람당 값으로도 안 세어져서, 비용이
    // **0** 이 됐기 때문이다. 예산이 0 인 층은 예산에 없는 층과 같다.
    const many = frameCostMs([{ tier: 'instanced', count: 5000 }]);
    const want = 5000 * INSTANCED_MS_PER_PERSON;
    if (Math.abs(many.ms - want) > want * 0.5) {
      g.fail('inst/not-free',
        `인스턴싱 5,000명을 ${many.ms}ms 로 센다 — 사람당 실측(${INSTANCED_MS_PER_PERSON}ms)이면 ${want.toFixed(2)}ms 여야 한다`);
    }
  }

  // ── 2. 단계 선언이 말이 되는가 ──
  {
    const withBones = Object.entries(TIERS).filter(([, t]) => t.bones > 0);
    n++;
    if (withBones.length < 2) g.setupFail('뼈가 있는 단계가 둘도 안 된다');
    n++;
    // 단계가 내려갈수록 뼈가 줄어야 한다 — 안 그러면 LOD 가 아니다.
    const order = ['full', 'simple', 'coarse'];
    for (let i = 1; i < order.length; i++) {
      if (!(TIERS[order[i]].bones < TIERS[order[i - 1]].bones)) {
        g.fail('tier/order', `${order[i]} 가 ${order[i - 1]} 보다 뼈가 적지 않다`);
      }
    }
    n++;
    // 아직 안 만든 단계는 그렇다고 적혀 있어야 한다.
    for (const [key, t] of Object.entries(TIERS)) {
      if (!t.bones && !t.pending) g.fail(`tier/${key}`, '뼈가 0인데 왜 그런지가 안 적혀 있다');
    }
    n++;
    // 뼈 수의 출처. 지금은 합성 리그로 잰 값이고, 그 사실이 남아 있어야 한다.
    for (const [key, t] of Object.entries(TIERS)) {
      if (t.bones > 0 && !t.bonesSource) g.fail(`tier/${key}/source`, '뼈 수를 어디서 얻었는지가 없다');
    }
  }

  // ── 3. 모델이 입력을 따라가는가 ──
  {
    n++;
    if (!(boneCostNs(KNEE_TOTAL_BONES + 1) > boneCostNs(KNEE_TOTAL_BONES - 1))) {
      g.fail('model/knee', '문턱을 넘어도 뼈 하나당 비용이 그대로다');
    }
    n++;
    const a = frameCostMs([{ tier: 'coarse', count: 100 }]);
    const b = frameCostMs([{ tier: 'full', count: 100 }]);
    if (!(b.ms > a.ms)) g.fail('model/bones', `뼈 ${TIERS.full.bones}개가 ${TIERS.coarse.bones}개보다 안 비싸다`);
    n++;
    const c = frameCostMs([{ tier: 'coarse', count: 200 }]);
    if (!(c.ms > a.ms)) g.fail('model/people', '사람이 두 배인데 안 비싸다');
    n++;
    // 같은 총 뼈 수면 비슷해야 한다 — 그것이 이 모델의 주장이다.
    const x = frameCostMs([{ tier: 'full', count: 100 }]);      // 6,500
    const y = frameCostMs([{ tier: 'coarse', count: 590 }]);    // 6,490
    if (Math.abs(x.ms - y.ms) > Math.max(x.ms, y.ms) * 0.05) {
      g.fail('model/total-bones', `총 뼈가 비슷한데 값이 ${x.ms} 대 ${y.ms} 로 갈린다`);
    }
  }

  // ── 4. 예산이 예산 노릇을 하는가 ──
  {
    n++;
    const four = affordable('full', 4);
    const eight = affordable('full', 8);
    if (!(eight.people > four.people)) g.fail('afford/budget', '예산을 두 배로 줘도 사람이 안 는다');
    n++;
    if (!(affordable('coarse', 4).people > affordable('full', 4).people)) {
      g.fail('afford/tier', '뼈가 적은 단계인데 더 못 세운다');
    }
    n++;
    // 문턱을 넘었으면 넘었다고 말해야 한다. 조용히 아래쪽 값으로 세면
    // 예산이 3배 낙관한다.
    const big = affordable('coarse', 20);
    // **이름표가 아니라 수를 본다.**
    //
    // 처음에는 `overKnee` 가 맞게 붙었는지만 봤다. 그런데 문턱을 아예 안 보게
    // 코드를 바꿔도 그 이름표는 제 값과 여전히 맞아떨어진다 — 같은 n 으로
    // 둘 다 계산하기 때문이다. 일부러 그렇게 깨 봤는데 게이트가 통과했다.
    //
    // 예산이 지켜야 하는 것은 이름표가 아니라 **답이 예산 안이라는 것**이다.
    if (big.cpuMs > 20 + 1e-9) {
      g.fail('afford/over', `예산 20ms 인데 답이 ${big.cpuMs}ms 를 쓴다 — 문턱 위 값으로 다시 안 셌다`);
    }
    n++;
    if (big.overKnee !== (big.people * big.bones > KNEE_TOTAL_BONES)) {
      g.fail('afford/knee', '문턱을 넘었는지를 잘못 말한다');
    }
    n++;
    if (affordable('impostor', 4) !== null) g.fail('afford/pending', '아직 없는 단계로 사람 수를 답한다');
  }

  // ── 5. 나눠 담기 ──
  {
    n++;
    const plan = planCrowd(300, 4);
    if (plan.dropped + plan.mix.reduce((s, m) => s + m.count, 0) !== 300) {
      g.fail('plan/count', '세운 사람과 못 세운 사람의 합이 요청과 다르다');
    }
    n++;
    if (plan.ms > 4) g.fail('plan/budget', `예산 4ms 인데 계획이 ${plan.ms}ms 다`);
    n++;
    // **가까운 단계부터 준다** — 뒤집히면 발밑 사람이 뭉개진다.
    //
    // 처음에는 "섞였을 때 앞이 더 좋은 단계인가" 만 봤다. 그런데 순서를
    // 뒤집으면 거친 단계 하나로 다 채워져서 섞이지 않고, 그러면 그 검사가
    // 아예 안 돈다 — 깨 놓고도 통과했다. 넉넉한 예산에서 **무엇이 먼저
    // 오는가**를 보면 순서가 드러난다.
    const rich0 = planCrowd(300, 40);
    if (rich0.mix[0]?.tier !== 'full') {
      g.fail('plan/order', `예산이 넉넉한데 ${rich0.mix[0]?.tier} 부터 채운다 — 가까운 사람이 뭉개진다`);
    }
    n++;
    for (let i = 1; i < plan.mix.length; i++) {
      if (TIERS[plan.mix[i].tier].bones > TIERS[plan.mix[i - 1].tier].bones) {
        g.fail('plan/order-mix', '섞인 계획의 순서가 뒤집혀 있다');
      }
    }
    n++;
    const rich = planCrowd(300, 40);
    if (!(rich.dropped <= plan.dropped)) g.fail('plan/more-budget', '예산이 열 배인데 못 세운 사람이 안 준다');
    n++;
    // **싼 단계가 있으면 사람을 안 버린다.**
    //
    // 좋은 단계부터 채우던 때에는 5,000명 요청에 173명만 세우고 4,812명을
    // 버렸다 — 인스턴싱으로는 다 세울 수 있는데도. 사람을 버리는 것보다
    // 거칠게 세우는 것이 낫다.
    const many = planCrowd(5000, 4, ['full', 'simple', 'instanced']);
    if (many.dropped > 0) {
      g.fail('plan/drop-first', `싼 단계가 있는데 ${many.dropped}명을 버린다`);
    }
    n++;
    if (!many.mix.some((m) => m.tier === 'full')) {
      g.fail('plan/upgrade', '남는 예산이 있는데 아무도 좋은 단계로 안 올린다');
    }
    console.log(`  [군중] CPU 4ms · 300명 요청 → ${plan.mix.map((m) => `${m.tier} ${m.count}`).join(' · ')} · 못 세움 ${plan.dropped} (${plan.ms}ms)`);
  }

  // ── 5-2. 진짜 몸으로 잰 표 ──
  //
  // 뼈로 세는 모형이 Rocketbox 몸을 13~15배 싸게 봤다. 그래서 진짜 몸이 있는
  // 팩은 잰 표로 값을 낸다. 여기서는 그 표가 **값 노릇**을 하는지 본다 —
  // 출처가 있는가, 기준 팩보다 정말 무거운가, 그리고 셈이 표를 **따라가는가**.
  {
    for (const [key, t] of Object.entries(PACK_MEASURED)) {
      for (const f of ['date', 'machine', 'runtime', 'method']) {
        n++;
        if (!t[f]) g.fail(`packcost/${key}/${f}`, `잰 표에 ${f} 가 없다 — 어디서 잰 값인지 없으면 값이 아니다`);
      }
      n++;
      if (!(t.body?.verts > 0 && t.body?.bones > 0 && t.body?.meshesPerPerson > 0)) {
        g.fail(`packcost/${key}/body`, '어떤 몸으로 쟀는지(정점·뼈·메시)가 없다');
      }
      const pts = [...(t.points || [])].sort((a, b) => a.people - b.people);
      n++;
      if (pts.length < 3) g.fail(`packcost/${key}/points`, '점이 셋도 안 된다 — 곡선이 휘는지를 못 본다');
      n++;
      for (let i = 1; i < pts.length; i++) {
        if (!(pts[i].frameMs > pts[i - 1].frameMs)) {
          g.fail(`packcost/${key}/monotonic`, `${pts[i].people}명이 ${pts[i - 1].people}명보다 안 비싸다`);
        }
      }
      // **몸이 비싼 것인가, 기계가 다른 것인가.** 같은 날 같은 기계에서 기준
      // 팩을 쟀고, 같은 사람 수에서 몇 배인지를 본다. 세 배도 안 되면 이 표를
      // 따로 둘 까닭이 없다 — 모형을 고치면 된다.
      n++;
      const base = t.baseline?.points || [];
      const pairs = base.map((b) => [b, pts.find((p) => p.people === b.people)]).filter(([, p]) => p);
      if (!pairs.length) g.fail(`packcost/${key}/baseline`, '같은 기계·같은 사람 수의 기준 팩 값이 없다');
      for (const [b, p] of pairs) {
        if (!(p.frameMs > b.frameMs * 3)) {
          g.fail(`packcost/${key}/heavier`, `${b.people}명에서 이 몸(${p.frameMs}ms)이 기준 팩(${b.frameMs}ms)의 세 배도 안 된다`);
        }
      }
    }

    // 셈이 표를 따라가는가.
    const t = PACK_MEASURED.rocketbox;
    const pts = [...t.points].sort((a, b) => a.people - b.people);
    n++;
    for (const p of pts) {
      const got = frameMsAt(pts, p.people).ms;
      if (Math.abs(got - p.frameMs) > 1e-6) g.fail('packcost/at-point', `${p.people}명을 ${got}ms 로 센다 — 표에는 ${p.frameMs}ms`);
    }
    n++;
    {
      const [a, b] = pts;
      const mid = frameMsAt(pts, (a.people + b.people) / 2).ms;
      if (Math.abs(mid - (a.frameMs + b.frameMs) / 2) > 1e-3) g.fail('packcost/between', `두 점 사이를 ${mid}ms 로 센다`);
    }
    n++;
    // **표를 바꾸면 답이 바뀌어야 한다.** 범위 안에 드는지만 보면 표를
    // 안 읽는 셈도 통과한다.
    {
      const heavy = pts.map((p) => ({ ...p, frameMs: p.frameMs * 2 }));
      const k = pts[1].people;
      if (!(frameMsAt(heavy, k).ms > frameMsAt(pts, k).ms * 1.9)) g.fail('packcost/track', '표의 값을 두 배로 해도 셈이 안 따라온다');
      const lo = planCrowdMeasured(200, 8, t);
      const hi = planCrowdMeasured(200, 8, { ...t, points: heavy });
      if (!(hi.mix[0]?.count < lo.mix[0]?.count)) g.fail('packcost/plan-track', '몸이 두 배로 무거운데 같은 수를 세운다');
    }
    n++;
    {
      const first = pts[0];
      const half = frameMsAt(pts, first.people / 2).ms;
      if (!(half > 0 && half < first.frameMs)) g.fail('packcost/below', `첫 점 아래를 ${half}ms 로 센다`);
    }
    n++;
    {
      const last = pts[pts.length - 1];
      const inside = frameMsAt(pts, last.people);
      const past = frameMsAt(pts, last.people * 1.5);
      if (inside.extrapolated || !past.extrapolated) g.fail('packcost/extrapolated', '잰 범위 밖인지를 잘못 말한다');
      if (!(past.ms > last.frameMs)) g.fail('packcost/extrapolated-grows', '잰 범위 밖에서 안 비싸진다');
    }
    // 예산이 예산 노릇을 하는가 — 넘지 않고, **빠듯하게** 채운다.
    // 빠듯함을 안 보면 늘 0명을 세우는 셈도 "예산 안" 이라 통과한다.
    let prev = -1;
    for (const b of [2, 4, 8, 16]) {
      n++;
      const plan = planCrowdMeasured(200, b, t);
      const cnt = plan.mix[0]?.count || 0;
      if (plan.ms > b + 1e-9) g.fail(`packcost/budget/${b}`, `예산 ${b}ms 인데 ${plan.ms}ms 를 쓴다`);
      if (cnt < 200 && !(frameMsAt(pts, cnt + 1).ms > b)) g.fail(`packcost/tight/${b}`, `예산 ${b}ms 에 ${cnt}명 — 한 명 더 들어가는데 안 세운다`);
      if (cnt + plan.dropped !== 200) g.fail(`packcost/count/${b}`, '세운 사람과 못 세운 사람의 합이 요청과 다르다');
      if (!(cnt > prev)) g.fail(`packcost/more/${b}`, '예산을 늘렸는데 사람이 안 는다');
      prev = cnt;
    }
    n++;
    if (measuredFor('rocketbox-f01') !== t || measuredFor('rocketbox-m01') !== t) g.fail('packcost/which', 'Rocketbox 팩이 잰 표를 안 쓴다');
    n++;
    if (measuredFor('ref-synthetic') !== null) g.fail('packcost/which-ref', '기준 팩에 남의 표를 쓴다');
    // ── 먼 단계를 섞을 때 ──
    //
    // planCrowd 와 같은 약속을 지키는가: 싼 단계가 있으면 사람을 안 버리고,
    // 남는 예산으로 가까운 사람을 올리고, 예산을 넘지 않는다.
    {
      const TI = ['full', 'instanced'];
      const ip = [...(t.instanced?.points || [])].sort((a, b) => a.people - b.people);
      n++;
      if (ip.length < 3) g.fail('packcost/inst-points', `먼 단계 점이 ${ip.length}개다 — 셋은 있어야 곧은지 휘는지 본다`);
      n++;
      for (let i = 1; i < ip.length; i++) {
        if (!(ip[i].frameMs > ip[i - 1].frameMs)) g.fail('packcost/inst-monotonic', `먼 단계 ${ip[i].people}명이 ${ip[i - 1].people}명보다 안 비싸다`);
      }
      n++;
      if (!(t.instanced?.verts > 0)) g.fail('packcost/inst-verts', '먼 단계를 어떤 살로 쟀는지가 없다');
      n++;
      // 옛 표(가벼운 몸)의 사람당 값을 그대로 쓰면 안 되는 까닭이 수로 서 있어야 한다.
      if (ip.length >= 2) {
        const per = (ip[ip.length - 1].frameMs - ip[0].frameMs) / (ip[ip.length - 1].people - ip[0].people);
        if (!(per > INSTANCED_MS_PER_PERSON * 3)) {
          g.fail('packcost/inst-heavier', `이 몸의 먼 단계 사람당 ${per.toFixed(5)}ms 가 옛 값(${INSTANCED_MS_PER_PERSON})의 세 배도 안 된다 — 따로 잴 까닭이 없다`);
        }
      }
      const iAt = (pts2, k) => frameMsAt(pts2, k).ms;
      n++;
      const a = planCrowdMeasured(200, 4, t, TI);
      const aFull = a.mix.find((m) => m.tier === 'full')?.count || 0;
      if (a.dropped) g.fail('packcost/inst-nodrop', `모두 먼 단계로 들어가는데 ${a.dropped}명을 버린다`);
      if (!aFull) g.fail('packcost/inst-upgrade', '남는 예산이 있는데 아무도 스킨으로 안 올린다');
      if (a.ms > 4 + 1e-9) g.fail('packcost/inst-budget', `예산 4ms 인데 ${a.ms}ms 를 쓴다`);
      if (a.mix.length === 2 && a.mix[0].tier !== 'full') g.fail('packcost/inst-order', '가까운 단계가 앞에 안 온다');
      n++;
      // 빠듯한가 — 한 명 더 올리면 넘쳐야 한다.
      if (aFull < 200 && !(iAt(pts, aFull + 1) + iAt(ip, 200 - aFull - 1) > 4)) {
        g.fail('packcost/inst-tight', `${aFull}명에서 멈췄는데 한 명 더 올려도 예산 안이다`);
      }
      n++;
      const big = planCrowdMeasured(5000, 4, t, TI);
      const bigInst = big.mix.find((m) => m.tier === 'instanced')?.count || 0;
      if (big.mix.some((m) => m.tier === 'full')) g.fail('packcost/inst-crowded', '다 못 세우는데 비싼 단계에 예산을 쓴다');
      if (big.ms > 4 + 1e-9 || !(iAt(ip, bigInst + 1) > 4)) g.fail('packcost/inst-fill', `먼 단계로 ${bigInst}명 — 예산을 넘거나 덜 채웠다`);
      n++;
      if (planCrowdMeasured(200, 4, t).mix.some((m) => m.tier === 'instanced')) g.fail('packcost/inst-blocked', '먼 단계를 막았는데 쓴다');
      n++;
      const heavyI = { ...t, instanced: { ...t.instanced, points: ip.map((q) => ({ ...q, frameMs: q.frameMs * 2 })) } };
      const aH = planCrowdMeasured(200, 4, heavyI, TI).mix.find((m) => m.tier === 'full')?.count || 0;
      const bigH = planCrowdMeasured(5000, 4, heavyI, TI);
      if (!(aH < aFull) || !(bigH.dropped > big.dropped)) g.fail('packcost/inst-track', '먼 단계 표를 두 배로 해도 계획이 안 바뀐다');
      console.log(`  [군중] Rocketbox · 4ms · 200명 → 스킨 ${aFull} · 먼 ${200 - aFull} (${a.ms}ms) · 5,000명 → 먼 ${bigInst} · 못 세움 ${big.dropped}`);
    }

    const p4 = planCrowdMeasured(200, 4, t);
    console.log(`  [군중] Rocketbox 몸(정점 ${t.body.verts}·뼈 ${t.body.bones}) · 4ms → ${p4.mix[0]?.count || 0}명 (${p4.ms}ms) · 뼈 모형은 같은 수를 ${frameCostMs([{ tier: 'full', count: p4.mix[0]?.count || 0 }]).ms}ms 로 봤다`);
  }

  // ── 6. 지금 이 기계에서 다시 재도 관계가 같은가 ──
  //
  // 모델이 실측에서 떨어지는 것을 잡는 자리다. 값이 아니라 **방향**을 본다.
  {
    const { measureFrameMs, rigOf } = await import('./measure-crowd.mjs');
    if (typeof measureFrameMs !== 'function' || typeof rigOf !== 'function') {
      g.setupFail('재는 도구를 가져오지 못했다');
      return n;
    }
    const small = await rigOf(11);
    const big = await rigOf(65);
    const at = (gltf, people) => measureFrameMs(people, { gltf, frames: 60 }).msPerFrame;

    n++;
    const c11 = at(small, 100);
    const c65 = at(big, 100);
    if (!(c65 > c11)) g.fail('remeasure/bones', `뼈 65개(${c65.toFixed(3)}ms)가 11개(${c11.toFixed(3)}ms)보다 안 비싸다`);

    n++;
    const p100 = at(small, 100);
    const p400 = at(small, 400);
    if (!(p400 > p100)) g.fail('remeasure/people', '사람이 네 배인데 안 비싸다');

    n++;
    // **문턱이 실제로 있는가.** 총 뼈가 문턱 아래일 때와 위일 때 뼈 하나당
    // 비용을 견준다. 모델이 주장하는 것이 이것이고, 아니면 모델이 틀렸다.
    const nsPerBone = (ms, people, bones) => (ms * 1e6) / (people * bones);
    const under = nsPerBone(at(big, 100), 100, 65);      // 6,500
    const over = nsPerBone(at(small, 800), 800, 11);     // 8,800
    if (!(over > under)) {
      g.fail('remeasure/knee',
        `문턱 위(${over.toFixed(0)}ns/뼈)가 아래(${under.toFixed(0)}ns/뼈)보다 안 비싸다 — 모델의 주장이 이 기계에서 안 맞는다`);
    } else {
      console.log(`  [군중] 다시 재기: 문턱 아래 ${under.toFixed(0)}ns/뼈 · 위 ${over.toFixed(0)}ns/뼈 (${(over / under).toFixed(1)}배)`);
    }
  }

  return n;
});
