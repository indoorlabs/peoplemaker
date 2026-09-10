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
