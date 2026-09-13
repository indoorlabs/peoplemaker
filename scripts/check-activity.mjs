// check:activity — 상위 명령("회의하기")이 **말이 되는 동작 차례**로 풀리는가.
//
// 이 층은 조용히 거짓말하기 쉽다. 뛰는 클립이 없는 팩에게 대피를 시키면
// 걷는 대피가 나오고, 그러면 피난 시간이 거짓이 된다 — 화면에는 사람들이
// 문으로 몰려가는 그림이 멀쩡하게 나온다.
//
// 그래서 수로 묻는다:
//   1. 표가 상태 기계인가 — 없는 상태로 넘어가지 않는가, 못 닿는 상태가
//      없는가, 막다른 길이 있는가(끝나는 활동) 또는 도는가(이어지는 활동)
//   2. 팩으로 풀리는가 — 낸 클립이 그 팩에 정말 있는가
//   3. **없으면 없다고 하는가** — 뛰기를 뺀 팩에 대피를 시켜 본다
//   4. 차례가 표를 따르는가 — 선언한 모서리로만 넘어가는가
//   5. 씨가 같으면 같은 차례, 다르면 다른 차례인가
//   6. 길이는 공간 쪽이 안다 — until-cue 상태가 혼자 안 끝나는가
//   7. 앉을 자리 높이가 **잰 값**인가 (지어낸 값이 아니라 팩의 seat)

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import { ACTIVITIES, ROLES, planActivity, startActivity, clipForRole } from '../src/lib/activity.mjs';

const packOf = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'packs', id, 'catalog.json'), 'utf8'));

/**
 * 이 팩(여자 01)으로 **무엇이 되고 무엇이 안 되는가.**
 *
 * 처음에는 "활동은 전부 돼야 한다" 로 두었는데, 식사를 넣는 순간 게이트가
 * 막았다 — 그런데 그것은 결함이 아니라 **사실**이다 (먹는 클립이 0개다).
 * 그렇다고 식사를 마시기로 풀면 "급식실 재실 시간" 자리에 물 마시는 사람이
 * 들어앉는다. 그래서 되는 것과 안 되는 것을 **적어 두고**, 둘 중 어느 쪽이
 * 바뀌어도 게이트가 말하게 한다.
 *
 *   true      이 팩으로 된다
 *   '역할'    그 역할의 클립이 없어서 못 한다
 */
const CAN = {
  meeting: true,
  deskWork: true,
  lesson: true,
  rest: true,
  queue: true,
  goToRoom: true,
  evacuate: true,
  meal: 'eat',
  // 비상시 — 있는 것으로 되는 것과, 자산이 없어 못 하는 것.
  shelter: true,
  injuredEvacuate: true,
};

runGate('check-activity', (g) => {
  let n = 0;

  // ── 1. 표가 상태 기계인가 ──
  for (const [id, act] of Object.entries(ACTIVITIES)) {
    n++;
    if (!act.ko || !act.en) g.fail(`table/${id}/name`, '이름이 두 언어로 없다');
    n++;
    if (!act.parts || !Object.keys(act.parts).length) { g.fail(`table/${id}/parts`, '역할이 없다'); continue; }

    for (const [partId, part] of Object.entries(act.parts)) {
      const tag = `${id}/${partId}`;
      n++;
      if (!part.states?.[part.start]) { g.fail(`table/${tag}/start`, `첫 상태 '${part.start}' 가 표에 없다`); continue; }

      for (const [stateId, st] of Object.entries(part.states)) {
        n++;
        if (!ROLES[st.role]) g.fail(`table/${tag}/${stateId}/role`, `'${st.role}' 는 아는 역할이 아니다`);
        n++;
        if (!(st.forS === 'clip' || st.forS === 'until-cue' || st.forS > 0)) {
          g.fail(`table/${tag}/${stateId}/forS`, `머무는 시간이 ${st.forS} 다`);
        }
        n++;
        for (const [to, w] of st.next || []) {
          if (!part.states[to]) g.fail(`table/${tag}/${stateId}/next`, `없는 상태 '${to}' 로 넘어간다`);
          if (!(w > 0)) g.fail(`table/${tag}/${stateId}/weight`, `'${to}' 로 가는 무게가 ${w} 다`);
        }
        n++;
        if (st.needs && !['seat', 'door', 'desk'].includes(st.needs)) {
          g.fail(`table/${tag}/${stateId}/needs`, `'${st.needs}' 는 공간에게 뭘 달라는 것인지 모르겠다`);
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

  // ── 2·7. 팩으로 풀리는가 ──
  const cat = packOf('rocketbox-f01');
  const have = new Set(cat.clips.map((c) => c.id));
  for (const id of Object.keys(ACTIVITIES)) {
    n++;
    const plan = planActivity(cat, id);
    const want = CAN[id];
    if (want === undefined) {
      g.fail(`pack/${id}/undeclared`, '새 활동인데 되는지 안 되는지가 CAN 에 안 적혀 있다');
      continue;
    }
    if (want === true && !plan.ok) {
      g.fail(`pack/${id}`, `되던 활동이 안 된다 — 없는 것: ${plan.missing.map((m) => m.role || m.need).join(', ')}`);
      continue;
    }
    if (want !== true) {
      // 못 하는 활동 — **왜 못 하는지가 적어 둔 것과 같아야** 한다.
      n++;
      if (plan.ok) {
        g.fail(`pack/${id}/now-ok`, `'${want}' 가 없어 못 하던 활동이 이제 된다 — 클립이 들어왔으면 CAN 을 고칠 것`);
      } else if (!plan.missing.some((m) => m.role === want)) {
        g.fail(`pack/${id}/why`, `'${want}' 때문에 못 한다고 적혀 있는데 실제로는 ${plan.missing.map((m) => m.role || m.need).join(', ')} 가 없다`);
      }
      continue;
    }
    n++;
    const stray = plan.clips.filter((c) => !have.has(c));
    if (stray.length) g.fail(`pack/${id}/clips`, `팩에 없는 클립을 낸다: ${stray.join(', ')}`);
    n++;
    // 앉는 활동이면 **잰 값**이 따라와야 한다 — 공간 쪽이 의자를 고르는 값이다.
    if (plan.needs.includes('seat') || plan.needs.includes('desk')) {
      const sit = cat.clips.find((c) => c.id === plan.seat?.clipId);
      if (!plan.seat || plan.seat.hipHeightM !== sit?.seat?.hipHeightM) {
        g.fail(`pack/${id}/seat`, '앉을 자리 높이가 팩에서 잰 값과 다르다');
      }
    }
  }

  // ── 3. 없으면 없다고 하는가 ──
  {
    n++;
    const noRun = { ...cat, clips: cat.clips.filter((c) => c.id !== 'run') };
    const plan = planActivity(noRun, 'evacuate');
    if (plan.ok) {
      g.fail('missing/evacuate', '뛰는 클립이 없는데 대피할 수 있다고 한다 — 걷는 대피는 피난 시간을 거짓으로 만든다');
    } else {
      n++;
      if (!plan.missing.some((m) => m.role === 'run')) {
        g.fail('missing/evacuate/what', `무엇이 없는지를 안 말한다 (${JSON.stringify(plan.missing)})`);
      }
    }
    n++;
    let threw = false;
    try { startActivity(noRun, 'evacuate'); } catch { threw = true; }
    if (!threw) g.fail('missing/evacuate/throw', '못 하는 활동을 조용히 시작한다');
    n++;
    // 앉는 클립이 없으면 회의도 못 한다.
    const noSit = { ...cat, clips: cat.clips.filter((c) => !c.id.startsWith('sit')) };
    if (planActivity(noSit, 'meeting').ok) g.fail('missing/meeting', '앉을 클립이 없는데 회의를 할 수 있다고 한다');
    n++;
    // 역할 후보가 여럿이면 **있는 것**으로 푼다 (전화 통화가 없으면 휴대폰).
    const noCall = { ...cat, clips: cat.clips.filter((c) => c.id !== 'phone-call') };
    if (clipForRole(noCall, 'phone') !== 'phone') g.fail('role/fallback', '뒤 후보로 안 물러선다');
  }

  // ── 4·5. 차례가 표를 따르는가 ──
  {
    const runOne = (seed, steps = 400) => {
      const a = startActivity(cat, 'meeting', { part: 'listener', seed });
      const seq = [{ state: a.state, clip: a.clipId }];
      for (let i = 0; i < steps; i++) if (a.update(0.5)) seq.push({ state: a.state, clip: a.clipId });
      return seq;
    };
    const seq = runOne(7);
    n++;
    if (seq.length < 5) g.fail('step/moves', `200초 동안 상태가 ${seq.length}번밖에 안 바뀐다`);
    n++;
    const spec = ACTIVITIES.meeting.parts.listener.states;
    let bad = 0;
    for (let i = 1; i < seq.length; i++) {
      const edges = (spec[seq[i - 1].state].next || []).map(([to]) => to);
      if (!edges.includes(seq[i].state)) bad++;
    }
    if (bad) g.fail('step/edges', `선언하지 않은 넘어감이 ${bad}번 있다`);
    n++;
    const again = runOne(7);
    if (JSON.stringify(again) !== JSON.stringify(seq)) g.fail('step/seed', '같은 씨인데 다른 차례가 나온다');
    n++;
    const other = runOne(99);
    if (JSON.stringify(other) === JSON.stringify(seq)) g.fail('step/seed-diff', '씨를 바꿔도 같은 차례다');
    n++;
    // 클립이 바뀔 때만 justChanged 여야 한다 — 쓰는 쪽이 그때만 다시 세운다.
    const a = startActivity(cat, 'meeting', { seed: 3 });
    let changes = 0;
    for (let i = 0; i < 200; i++) if (a.update(0.5)) changes++;
    if (!(changes > 0 && changes < 200)) g.fail('step/changed', `100초에 ${changes}번 바뀌었다고 한다`);
    console.log(`  [활동] 회의(듣는 사람) 200초에 ${seq.length}번 바뀐다: ${seq.slice(0, 6).map((s) => s.clip).join(' → ')} …`);
  }

  // ── 6. 길이는 공간 쪽이 안다 ──
  {
    const a = startActivity(cat, 'goToRoom', { seed: 1 });
    n++;
    if (a.state !== 'walk') g.fail('cue/start', `걷기로 시작해야 하는데 ${a.state} 다`);
    n++;
    for (let i = 0; i < 2000; i++) a.update(0.5);   // 1000초를 흘려도
    if (a.state !== 'walk') g.fail('cue/forever', `알려 주지도 않았는데 ${a.state} 로 넘어갔다 — 길 길이를 여기서 지어낸 것이다`);
    n++;
    if (!a.cue()) g.fail('cue/ignored', '도착을 알렸는데 안 받는다');
    n++;
    if (a.state !== 'at-door') g.fail('cue/next', `알린 뒤 ${a.state} 다`);
    n++;
    if (a.needs !== 'door') g.fail('cue/needs', `문 앞인데 공간에게 ${a.needs} 를 달라고 한다`);
    // 끝까지 가면 끝난다 — 끝나는 활동이 안 끝나면 쓰는 쪽이 영영 붙잡고 있다.
    n++;
    let guard = 0;
    while (!a.done && guard++ < 200) { a.update(1); a.cue(); }
    if (!a.done) g.fail('cue/end', '방으로 가기가 안 끝난다');
    console.log(`  [활동] 방으로 가기: 알려 줄 때까지 걷다가 ${guard}걸음에 끝났다 (길 길이는 공간 쪽이 안다)`);
  }

  // ── 팩마다 무엇을 할 수 있는가 ──
  {
    const dir = path.join(ROOT, 'packs');
    const packs = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'catalog.json')));
    const rows = [];
    for (const p of packs) {
      const c = packOf(p);
      const can = Object.keys(ACTIVITIES).filter((id) => planActivity(c, id).ok);
      rows.push(`${p} ${can.length}/${Object.keys(ACTIVITIES).length}`);
      n++;
      // 기준 팩(합성)은 못 하는 것이 **맞다** — 그것도 수로 남는다.
      if (p === 'ref-synthetic' && can.length) {
        g.fail('pack/ref-synthetic', `합성 기준 팩에 회의·대피 클립이 없는데 ${can.join(',')} 를 할 수 있다고 한다`);
      }
    }
    console.log(`  [활동] 팩마다 할 수 있는 활동: ${rows.join(' · ')}`);
  }

  return n;
});
