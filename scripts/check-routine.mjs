// check:routine — 하루가 **말이 되는 활동 차례**로 풀리는가, 그리고 이 층이
// 금을 넘지 않는가.
//
// 일과는 이 저장소가 **spacemaker 를 두 벌 만들기 시작하는 자리**다. "수업
// 45분" 을 여기 한 줄 적는 순간 시간표가 생기고, 그러면 건물 쪽과 사람 쪽에
// 같은 표가 두 벌 생겨 한쪽만 고쳐진다. 사람이 지키게 두면 언젠가 새므로
// 값으로 찾아낸다.
//
// 그래서 수로 묻는다:
//   1. 표가 상태 기계인가 — 모르는 활동·못 닿는 상태·없는 상태로 넘어감
//   2. **시계가 없는가** — 09:00 도, 'hour' 라는 키도 (일부러 넣어 보고 본다)
//   3. 이 팩으로 도는가 — 되는 것과 안 되는 것이 적어 둔 것과 같은가
//   4. 못 도는 일과를 **조용히 시작하는가** (식사가 안 되면 학교 하루도 안 된다)
//   5. 두 층의 알림이 갈라져 있는가 — 활동에게 알린 것이 일과를 넘기지 않는가
//   6. until-cue 는 혼자 안 끝나는가 · forS:'activity' 는 끝나면 넘어가는가
//   7. 같은 씨면 같은 하루인가
//   8. 공간에게 달라는 것이 활동에서 그대로 올라오는가 (잰 값 그대로)

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import { ROUTINES, planRoutine, startRoutine, clockLike } from '../src/lib/routine.mjs';
import { ACTIVITIES, planActivity } from '../src/lib/activity.mjs';

const packOf = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'packs', id, 'catalog.json'), 'utf8'));

/**
 * 이 팩(여자 01)으로 **어느 하루가 돌고 어느 하루가 안 도는가.**
 *
 * check-activity 의 CAN 과 같은 규약이다 — 못 도는 것이 결함이 아니라
 * 사실일 때가 있고(먹는 클립이 0개다), 그 사실이 바뀌면 게이트가 말한다.
 *
 *   true     돈다
 *   '활동'   그 활동을 못 해서 안 돈다
 */
const CAN = {
  officeDay: true,
  schoolDay: 'meal',
  nursingDay: 'meal',
};

runGate('check-routine', (g) => {
  let n = 0;
  const cat = packOf('rocketbox-f01');

  // ── 1. 표가 상태 기계인가 ──
  for (const [id, rt] of Object.entries(ROUTINES)) {
    n++;
    if (!rt.ko || !rt.en) g.fail(`table/${id}/name`, '이름이 두 언어로 없다');
    n++;
    if (!rt.parts || !Object.keys(rt.parts).length) { g.fail(`table/${id}/parts`, '역할이 없다'); continue; }

    for (const [partId, part] of Object.entries(rt.parts)) {
      const tag = `${id}/${partId}`;
      n++;
      if (!part.states?.[part.start]) { g.fail(`table/${tag}/start`, `첫 상태 '${part.start}' 가 표에 없다`); continue; }

      for (const [stateId, st] of Object.entries(part.states)) {
        n++;
        const act = ACTIVITIES[st.activity];
        if (!act) { g.fail(`table/${tag}/${stateId}/activity`, `'${st.activity}' 는 아는 활동이 아니다`); continue; }
        n++;
        if (st.part && !act.parts[st.part]) {
          g.fail(`table/${tag}/${stateId}/part`, `${st.activity} 에 '${st.part}' 라는 역할이 없다`);
        }
        n++;
        if (!(st.forS === 'activity' || st.forS === 'until-cue' || st.forS > 0)) {
          g.fail(`table/${tag}/${stateId}/forS`, `머무는 시간이 ${st.forS} 다`);
        }
        n++;
        // **끝이 있는 활동만 forS:'activity' 를 쓸 수 있다.** 회의는 안 끝나므로
        // 그렇게 적으면 그 상태에서 하루가 영영 안 넘어간다.
        if (st.forS === 'activity') {
          const ends = Object.values(act.parts).some((p) => Object.values(p.states).some((s) => !(s.next || []).length));
          if (!ends) g.fail(`table/${tag}/${stateId}/never`, `${st.activity} 는 안 끝나는 활동인데 끝나기를 기다린다 — 하루가 여기서 멈춘다`);
        }
        n++;
        for (const [to, w] of st.next || []) {
          if (!part.states[to]) g.fail(`table/${tag}/${stateId}/next`, `없는 상태 '${to}' 로 넘어간다`);
          if (!(w > 0)) g.fail(`table/${tag}/${stateId}/weight`, `'${to}' 로 가는 무게가 ${w} 다`);
        }
      }

      // 못 닿는 상태 — 적어 놓고 아무도 안 가는 상태는 표가 거짓말하는 자리다.
      n++;
      const seen = new Set([part.start]);
      const queue = [part.start];
      while (queue.length) {
        const cur = queue.pop();
        for (const [to] of part.states[cur].next || []) {
          if (!seen.has(to) && part.states[to]) { seen.add(to); queue.push(to); }
        }
      }
      const orphan = Object.keys(part.states).filter((s) => !seen.has(s));
      if (orphan.length) g.fail(`table/${tag}/unreachable`, `아무도 못 가는 상태: ${orphan.join(', ')}`);
    }
  }

  // ── 2. 시계가 없는가 ──
  {
    n++;
    const found = clockLike(ROUTINES, 'ROUTINES');
    if (found.length) {
      g.fail('clock/routines', `일과 표에 시각이 들어왔다: ${found.map((f) => `${f.where} = ${f.what}`).join(' · ')} — 시간표는 공간 쪽이다`);
    }
    n++;
    if (clockLike(ACTIVITIES, 'ACTIVITIES').length) g.fail('clock/activities', '활동 표에 시각이 들어왔다');
    // **일부러 넣어 본다** — 안 잡으면 위 두 검사는 아무것도 안 보는 것이다.
    const shakes = [
      ['글로 적은 시각', { a: { note: '09:00 에 시작한다' } }],
      ['한글로 적은 시각', { a: { note: '9시 30분에 모인다' } }],
      ["'hour' 라는 키", { a: { hour: 9 } }],
      ["'startTime' 이라는 키", { a: { startTime: 'morning' } }],
    ];
    for (const [what, obj] of shakes) {
      n++;
      if (!clockLike(obj).length) g.fail(`clock/shake/${what}`, `${what} 를 안 잡는다`);
    }
    n++;
    // 멀쩡한 값을 시계라고 하면 안 된다 — 초(forS)는 시각이 아니다.
    if (clockLike({ a: { forS: 45, note: '앉아서 45초' } }).length) {
      g.fail('clock/false', '초 단위 머무는 시간을 시각이라고 한다');
    }
    console.log(`  [일과] 시계 검사: 표에 ${found.length}건 · 일부러 넣은 ${shakes.length}가지를 전부 잡는다`);
  }

  // ── 3·4. 이 팩으로 도는가 ──
  for (const id of Object.keys(ROUTINES)) {
    n++;
    const plan = planRoutine(cat, id);
    const want = CAN[id];
    if (want === undefined) { g.fail(`pack/${id}/undeclared`, '새 일과인데 도는지 안 도는지가 CAN 에 안 적혀 있다'); continue; }
    if (want === true) {
      if (!plan.ok) {
        g.fail(`pack/${id}`, `돌던 하루가 안 돈다 — ${plan.missing.map((m) => `${m.activity}(${m.role || m.need})`).join(', ')}`);
        continue;
      }
      n++;
      const have = new Set(cat.clips.map((c) => c.id));
      const stray = plan.clips.filter((c) => !have.has(c));
      if (stray.length) g.fail(`pack/${id}/clips`, `팩에 없는 클립을 낸다: ${stray.join(', ')}`);
    } else {
      n++;
      if (plan.ok) {
        g.fail(`pack/${id}/now-ok`, `'${want}' 를 못 해서 안 돌던 하루가 이제 돈다 — 클립이 들어왔으면 CAN 을 고칠 것`);
      } else if (!plan.missing.some((m) => m.activity === want)) {
        g.fail(`pack/${id}/why`, `'${want}' 때문이라고 적혀 있는데 실제로는 ${plan.missing.map((m) => m.activity).join(', ')} 다`);
      }
      n++;
      // **조용히 시작하면 안 된다** — 급식을 뺀 학교 하루는 학교 하루가 아니다.
      let threw = false;
      try { startRoutine(cat, id); } catch { threw = true; }
      if (!threw) g.fail(`pack/${id}/throw`, '못 도는 하루를 조용히 시작한다');
    }
  }
  {
    const lines = Object.keys(ROUTINES).map((id) => {
      const p = planRoutine(cat, id);
      return `${id} ${p.ok ? 'ok' : '✗ ' + [...new Set(p.missing.map((m) => `${m.activity}(${m.role || m.need})`))].join(' ')}`;
    });
    console.log(`  [일과] 여자 01 로: ${lines.join(' · ')}`);
  }

  // ── 5·6. 두 층의 알림 ──
  {
    const r = startRoutine(cat, 'officeDay', { part: 'worker', seed: 3 });
    n++;
    if (r.state !== 'arrive') g.fail('cue/start', `첫 상태가 ${r.state} 다`);
    n++;
    if (r.activityId !== 'goToRoom') g.fail('cue/activity', `첫 활동이 ${r.activityId} 다`);

    // 안쪽 활동이 걷고 있다 — 알려 주지 않으면 하루가 안 넘어간다.
    for (let t = 0; t < 60; t += 0.1) r.update(0.1);
    n++;
    if (r.state !== 'arrive') g.fail('cue/forever', `60초를 흘렸는데 ${r.state} 로 넘어갔다 — 길 길이를 여기서 지어낸 것이다`);
    n++;
    if (r.activity.state !== 'walk') g.fail('cue/inner', `안쪽 활동이 ${r.activity.state} 다 (걷고 있어야)`);

    // **일과에게 알려도 안 넘어간다** — 이 상태는 활동이 끝나기를 기다린다.
    n++;
    if (r.cue()) g.fail('cue/wrong-layer', "forS:'activity' 상태인데 일과 알림을 받아 넘어간다");

    // 안쪽 활동에게 알리면 방으로 가기가 진행된다.
    n++;
    if (!r.activity.cue()) g.fail('cue/inner-ignored', '도착을 알렸는데 안쪽 활동이 안 받는다');
    let guard = 0;
    while (r.state === 'arrive' && guard++ < 2000) {
      r.update(0.1);
      if (r.activity.needs === null && !r.activity.done) r.activity.cue();
    }
    n++;
    if (r.state !== 'desk') g.fail('cue/activity-end', `방으로 가기가 끝났는데 ${r.state} 다 (desk 여야)`);
    n++;
    if (r.activityId !== 'deskWork') g.fail('cue/next-activity', `다음 활동이 ${r.activityId} 다`);

    // 이제는 반대다 — 근무는 안 끝나므로 **일과에게** 알려야 넘어간다.
    for (let t = 0; t < 120; t += 0.1) r.update(0.1);
    n++;
    if (r.state !== 'desk') g.fail('cue/desk-forever', `120초를 흘렸는데 ${r.state} 다 — 근무가 혼자 끝났다`);
    n++;
    const wasAct = r.activity;
    if (!r.cue()) g.fail('cue/routine', '일과에게 알렸는데 안 받는다');
    n++;
    // **상태 이름이 같을 수 있다** — 표에 desk → desk 가 적혀 있다 (자리에
    // 돌아와 계속 일한다). 그래서 "이름이 바뀌었나" 가 아니라 **활동이 새로
    // 시작됐나**를 본다. 처음에 이름으로 봤다가 멀쩡한 넘어감을 결함으로 쳤다.
    if (r.activity === wasAct) g.fail('cue/routine-stay', '알렸는데 활동이 그대로다 — 넘어가지 않았다');
    console.log(`  [일과] 사무실 하루: arrive → (도착 알림) → desk → (근무 끝 알림) → ${r.state}`);
  }

  // ── 7. 같은 씨면 같은 하루 ──
  {
    const run = (seed) => {
      const r = startRoutine(cat, 'officeDay', { part: 'worker', seed });
      const seq = [];
      let last = null;
      for (let t = 0; t < 600; t += 0.1) {
        r.update(0.1);
        if (r.activity.needs === null && !r.activity.done) r.activity.cue();
        // 근무·회의는 일과가 끝내 준다 — 여기서는 일정한 간격으로 알린다.
        if (Math.abs(t % 30) < 1e-9) r.cue();
        if (r.state !== last) { seq.push(r.state); last = r.state; }
      }
      return seq;
    };
    const a = run(11);
    n++;
    if (a.length < 4) g.fail('seed/moves', `600초에 상태가 ${a.length}번밖에 안 바뀐다`);
    n++;
    if (run(11).join() !== a.join()) g.fail('seed/same', '같은 씨인데 다른 하루가 나온다');
    n++;
    if (run(12).join() === a.join()) g.fail('seed/diff', '씨를 바꿔도 같은 하루다');
    n++;
    // 선언한 모서리로만 넘어가는가.
    const spec = ROUTINES.officeDay.parts.worker.states;
    let bad = 0;
    for (let i = 1; i < a.length; i++) {
      if (!(spec[a[i - 1]].next || []).some(([to]) => to === a[i])) bad++;
    }
    if (bad) g.fail('seed/edges', `선언하지 않은 넘어감이 ${bad}번 있다: ${a.join(' → ')}`);
    console.log(`  [일과] 씨 11 의 하루: ${a.slice(0, 7).join(' → ')}${a.length > 7 ? ' …' : ''}`);
  }

  // ── 8. 공간에게 달라는 것이 잰 값 그대로 올라오는가 ──
  {
    const plan = planRoutine(cat, 'officeDay');
    n++;
    for (const nd of ['seat', 'desk', 'door']) {
      if (!plan.needs.includes(nd)) g.fail('needs/missing', `사무실 하루가 '${nd}' 를 안 달라고 한다`);
    }
    n++;
    const sit = cat.clips.find((c) => c.id === plan.seat?.clipId);
    if (!plan.seat || plan.seat.hipHeightM !== sit?.seat?.hipHeightM) {
      g.fail('needs/seat', '앉을 자리 높이가 팩에서 잰 값과 다르다 — 일과가 값을 새로 만들었다');
    }
    n++;
    const doorClip = cat.clips.find((c) => c.id === plan.door?.clipId);
    if (!plan.door || plan.door.heightM !== doorClip?.reach?.heightM) {
      g.fail('needs/door', '손잡이 높이가 팩에서 잰 값과 다르다');
    }
    n++;
    // 활동 층이 내는 것과 같아야 한다 — 두 군데서 따로 만들면 갈린다.
    const fromAct = planActivity(cat, 'deskWork').seat;
    if (JSON.stringify(plan.seat) !== JSON.stringify(fromAct)) {
      g.fail('needs/same', '일과가 내는 앉을 자리가 활동이 내는 것과 다르다');
    }
    console.log(`  [일과] 사무실 하루가 공간에게: ${plan.needs.join(' · ')} · 앉을 자리 ${plan.seat.hipHeightM}m · 손잡이 ${plan.door.heightM}m`);
  }

  return n;
});
