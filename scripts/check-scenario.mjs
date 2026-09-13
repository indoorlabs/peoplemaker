// check:scenario — preflight 가 **못 하는 것을 빠짐없이 모으는가.**
//
// 이 층은 계산이 아니라 **거절**이다. 지금까지 층마다 "없으면 없다고 말한다"
// 를 지켜 왔는데, 그 말이 다섯 군데(배역·일과·활동·클립·재실자 값)에 흩어져
// 있다. preflight 가 하나라도 빠뜨리면 쓰는 쪽은 "된다" 는 답을 받고 돌린다 —
// 그것이 이 층에서 가능한 유일한 거짓말이다.
//
// 그래서 수로 묻는다:
//   1. 대본이 말이 되는가 — cue 가 아닌 시각, 없는 활동, **방 이름을 쓴 who**
//   2. 층마다의 "없다" 가 **전부 올라오는가** (한 층씩 망가뜨려 보고 센다)
//   3. 계단 클립이 0개인데 피난 시간을 내주지 않는가
//   4. 되는 시나리오와 안 되는 시나리오가 적어 둔 것과 같은가
//   5. 공간에게 올리는 값이 **잰 값 그대로**인가 (여기서 새로 만들지 않는가)

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import { SCENARIOS, planScenario, scenarioProblems, scenarioReport } from '../src/lib/scenario.mjs';
import { measuredFor, planCrowdMeasured } from '../src/lib/crowdBudget.mjs';

/**
 * 지금 이 저장소로 **어느 시나리오가 되는가** — 적어 두고 바뀌면 말한다.
 *
 *   true     된다
 *   숫자     막힌 곳이 이만큼 (그것이 사실이다)
 */
const CAN = {
  'office-normal': true,
  'school-normal': 1,        // 급식에 먹는 클립이 없다
  'school-fire-drill': 2,    // + 계단 클립이 없어 피난 시간을 못 낸다
  'nursing-fire-drill': 3,   // + 노인 팩이 0개라 입소자를 못 채운다
};

const COUNTS = { 'nursing-home-kr': { resident: 70, carer: 30 } };

runGate('check-scenario', (g) => {
  let n = 0;

  const packs = [];
  for (const p of fs.readdirSync(path.join(ROOT, 'packs'))) {
    const f = path.join(ROOT, 'packs', p, 'catalog.json');
    if (fs.existsSync(f)) packs.push(JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  const profiles = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'profiles'))) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles', f), 'utf8'));
    profiles[j.id] = j;
  }
  if (!packs.length || !Object.keys(profiles).length) { g.setupFail('팩이나 프로필이 없다'); return n; }

  const run = (id) => {
    const sc = { id, ...SCENARIOS[id] };
    const counts = COUNTS[sc.profile];
    return planScenario(sc, {
      profiles, packs, budgetMs: 4, measuredFor, planCrowdMeasured,
      ...(counts ? { counts } : { count: 530 }),
    });
  };

  // ── 1. 대본이 말이 되는가 ──
  for (const [id, sc] of Object.entries(SCENARIOS)) {
    n++;
    const probs = scenarioProblems({ id, ...sc }, { profiles });
    if (probs.length) g.fail(`table/${id}`, probs.map((p) => `${p.key}: ${p.why}`).join(' · '));
  }
  {
    const base = { id: 'x', ...SCENARIOS['school-fire-drill'] };
    const breaks = [
      ['시각을 적기', (s) => { s.acts[0].on = '09:00'; }, 'acts[0]/on'],
      ['없는 활동', (s) => { s.acts[0].switchTo = 'teleport'; }, 'acts[0]/switchTo/unknown'],
      ['방 이름을 who 에', (s) => { s.acts[0].who = 'group:east-wing'; }, 'acts[0]/who/shape'],
      ['프로필에 없는 역할', (s) => { s.acts[0].who = 'role:janitor'; }, 'acts[0]/who/role'],
      ['누가 갈아타는지 없음', (s) => { delete s.acts[0].who; }, 'acts[0]/who'],
      ['없는 프로필', (s) => { s.profile = '없는프로필'; }, 'profile'],
      ['이름이 한 언어', (s) => { delete s.en; }, 'name'],
      ['note 에 시각', (s) => { s.note = '09:00 에 경보가 울린다'; }, 'clock'],
    ];
    for (const [what, patch, wantKey] of breaks) {
      n++;
      const bad = JSON.parse(JSON.stringify(base));
      patch(bad);
      const keys = scenarioProblems(bad, { profiles }).map((p) => p.key);
      if (!keys.includes(wantKey)) g.fail(`break/${what}`, `${what} 했는데 '${wantKey}' 로 안 잡는다 (잡은 것: ${keys.join(' · ') || '없음'})`);
    }
  }

  // ── 2. 층마다의 "없다" 가 전부 올라오는가 ──
  //
  // **여기가 이 게이트의 요점이다.** 한 층씩 망가뜨려 보고, preflight 가
  // 그만큼 더 막힌다고 말하는지 본다. 안 늘면 그 층의 "없다" 가 새는 것이다.
  {
    const base = run('school-fire-drill');
    n++;
    if (base.ok) g.fail('layer/base', '학교 대피가 막힌 데 없이 된다고 한다 — 계단 클립이 0개다');
    const before = base.blockers.length;

    const noRun = packs.map((c) => (c.person?.ageBand === 'child'
      ? { ...c, clips: c.clips.filter((x) => x.id !== 'run') } : c));
    n++;
    const afterRun = planScenario({ id: 'x', ...SCENARIOS['school-fire-drill'] }, { profiles, packs: noRun, count: 530 });
    if (!(afterRun.blockers.length > before)) {
      g.fail('layer/clip', `뛰는 클립을 뺐는데 막힌 곳이 ${before} → ${afterRun.blockers.length} 다 — 클립 층의 '없다' 가 안 올라온다`);
    }

    n++;
    // 배역 층 — 어린이 팩을 빼면 학생을 못 채운다.
    const noChild = packs.filter((c) => c.person?.ageBand !== 'child');
    const afterCast = planScenario({ id: 'x', ...SCENARIOS['school-fire-drill'] }, { profiles, packs: noChild, count: 530 });
    if (!afterCast.blockers.some((b) => /배역/.test(b.what))) {
      g.fail('layer/cast', "어린이 팩을 뺐는데 배역이 막혔다고 안 한다");
    }

    n++;
    // 프로필 층 — 출처를 지우면 막혀야 한다.
    const badProf = { ...profiles, 'school-kr': { ...profiles['school-kr'], mix: { ...profiles['school-kr'].mix, source: '어디선가' } } };
    const afterProf = planScenario({ id: 'x', ...SCENARIOS['school-fire-drill'] }, { profiles: badProf, packs, count: 530 });
    if (!afterProf.blockers.some((b) => /프로필/.test(b.what))) {
      g.fail('layer/profile', '프로필 출처를 지웠는데 막혔다고 안 한다');
    }

    n++;
    // 대본 층.
    const badScript = { id: 'x', ...SCENARIOS['school-fire-drill'], acts: [{ on: '09:00', who: 'all', switchTo: 'evacuate' }] };
    const afterScript = planScenario(badScript, { profiles, packs, count: 530 });
    if (!afterScript.blockers.some((b) => /대본/.test(b.what))) {
      g.fail('layer/script', '대본에 시각을 넣었는데 막혔다고 안 한다');
    }
  }

  // ── 3. 계단 클립이 0개인데 시간을 내주지 않는가 ──
  {
    const r = run('school-fire-drill');
    n++;
    if (!r.evacuation) g.fail('evac/none', '대피 시나리오인데 피난 항목이 없다');
    else {
      n++;
      if (r.evacuation.stairClips !== 0) g.fail('evac/stairs', `계단 클립이 ${r.evacuation.stairClips}개라고 한다 — 지금 팩에는 없다 (생겼으면 이 검사를 고칠 것)`);
      n++;
      if (r.evacuation.canTimeStairs) g.fail('evac/time', '계단 클립이 0개인데 시간을 낼 수 있다고 한다');
      n++;
      if (!r.evacuation.why) g.fail('evac/why', '못 낸다면서 까닭을 안 적는다');
      n++;
      // 쓸 값은 **출처가 있는 값**이어야 한다.
      if (!(r.evacuation.speed.stairSpeedMps > 0) || r.evacuation.speed.source !== 'nistTN1839') {
        g.fail('evac/speed', `쓸 계단 속도가 ${r.evacuation.speed.stairSpeedMps} · 출처 ${r.evacuation.speed.source} 다`);
      }
      n++;
      if (!r.evacuation.speed.caveat) g.fail('evac/caveat', '값의 한계를 안 올린다');
    }
    // 요양시설이면 **다른 모집단**을 써야 한다 — 전체 평균으로 세면 7배 빠르다.
    const nh = run('nursing-fire-drill');
    n++;
    if (nh.evacuation?.speed.population !== 'us-older-adult-housing') {
      g.fail('evac/population', `요양시설인데 '${nh.evacuation?.speed.population}' 값을 쓴다`);
    }
    n++;
    if (!(nh.evacuation?.speed.preObservationDelayS > r.evacuation.speed.preObservationDelayS)) {
      g.fail('evac/delay', `요양시설 지연 ${nh.evacuation?.speed.preObservationDelayS}s 가 학교 ${r.evacuation.speed.preObservationDelayS}s 보다 길지 않다`);
    }
    console.log(`  [시나리오] 요양시설은 계단 ${nh.evacuation.speed.stairSpeedMps}m/s · 지연 ${nh.evacuation.speed.preObservationDelayS}s · 학교는 ${r.evacuation.speed.stairSpeedMps}m/s · ${r.evacuation.speed.preObservationDelayS}s`);
  }

  // ── 4. 되는 것과 안 되는 것이 적어 둔 것과 같은가 ──
  for (const id of Object.keys(SCENARIOS)) {
    n++;
    const want = CAN[id];
    if (want === undefined) { g.fail(`can/${id}/undeclared`, '새 시나리오인데 되는지가 CAN 에 안 적혀 있다'); continue; }
    const r = run(id);
    n++;
    if (want === true) {
      if (!r.ok) g.fail(`can/${id}`, `되던 시나리오가 막혔다: ${r.blockers.map((b) => b.what).join(' · ')}`);
    } else if (r.blockers.length !== want) {
      g.fail(`can/${id}`, `막힌 곳이 ${r.blockers.length} 인데 적어 둔 것은 ${want} 다: ${r.blockers.map((b) => b.what).join(' · ')}`);
    }
  }

  // ── 5. 공간에게 올리는 값이 잰 값 그대로인가 ──
  {
    const r = run('office-normal');
    n++;
    if (!r.ok) g.fail('office/ok', `사무실 평상시가 막혔다: ${r.blockers.map((b) => b.what).join(' · ')}`);
    n++;
    if (r.seat) {
      const cat = packs.find((c) => (c.clips || []).some((x) => x.id === r.seat.clipId && x.seat));
      const clip = cat?.clips.find((x) => x.id === r.seat.clipId);
      if (clip?.seat?.hipHeightM !== r.seat.hipHeightM) g.fail('office/seat', '앉을 자리 높이가 팩에서 잰 값과 다르다');
    }
    n++;
    if (!r.needs.length) g.fail('office/needs', '사무실 하루인데 공간에게 아무것도 안 달라고 한다');
    n++;
    if (!r.budget?.plan) g.fail('office/budget', '예산을 안 낸다');
    console.log(`  [시나리오] ${scenarioReport(r).split('\n').slice(0, 5).join('\n  ')}`);
  }

  for (const id of Object.keys(SCENARIOS)) {
    const r = run(id);
    console.log(`  [시나리오] ${id.padEnd(20)} ${r.ok ? '된다' : `막힌 곳 ${r.blockers.length}`}`);
  }

  return n;
});
