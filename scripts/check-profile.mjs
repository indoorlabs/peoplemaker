// check:profile — "학교" · "양로원" 이 뜻하는 비율에 **출처가 있는가.**
//
// 이 파일들은 인체치수와 같은 부류다 — 사람에 관한 통계이고, 손으로 베낀
// 수가 하나 들어가면 어디서 왔는지 곧 아무도 모르게 된다. 다른 점은 하나:
// 여기서는 **비율을 아예 저장하지 않는다.** 발표된 비(교원 1인당 학생 수
// 12.1)만 적고 백분율은 계산한다 — 저장하면 둘이 갈린다.
//
// 그래서 수로 묻는다:
//   1. 프로필이 말이 되는가 — 이름·구성·역할, 파일 이름과 id 가 같은가
//   2. **비율이 손으로 적혀 있지 않은가** (일부러 적어 보고 본다)
//   3. 출처가 아는 것인가 · 못 구한 것은 무엇이 필요한지 적혀 있는가
//   4. **비를 흔들면 비율이 따라 움직이는가** (값 하나가 맞는지보다 이것이다)
//   5. 못 구한 프로필로 비율을 쓰려 하면 막는가 · 인원을 주면 되는가
//   6. 일과·역할과 정말 이어지는가
//   7. 시계가 없는가
//   8. 지금 팩으로 배역이 얼마나 차는가 (수가 바뀌면 말한다)

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import { PROFILE_SOURCES, profileShares, profileProblems, pendingProfiles } from '../src/lib/profile.mjs';
import { planCast, castReport } from '../src/lib/cast.mjs';
import { ROUTINES, clockLike } from '../src/lib/routine.mjs';

/**
 * 지금 팩으로 **얼마나 차는가** — 적어 두고 바뀌면 말한다.
 *
 * check-activity·check-routine 의 CAN 과 같은 규약이다. 0.3 이 나쁜 수가
 * 아니라 **사실**이고(노인 팩이 0개다), 늘어도 줄어도 게이트가 알려 준다.
 */
const COVERAGE = {
  'school-kr': 1,
  'nursing-home-kr': 0.3,
};

/** 비율을 못 구한 프로필은 인원을 직접 준다 — 그때 쓸 수. */
const COUNTS = {
  'nursing-home-kr': { resident: 70, carer: 30 },
};

runGate('check-profile', (g) => {
  let n = 0;

  const dir = path.join(ROOT, 'profiles');
  if (!fs.existsSync(dir)) { g.setupFail('profiles/ 가 없다'); return n; }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (!files.length) { g.setupFail('프로필이 하나도 없다'); return n; }

  const profiles = {};
  for (const f of files) {
    n++;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { g.fail(`read/${f}`, `못 읽었다 — ${e.message}`); continue; }
    n++;
    if (j.id !== f.replace(/\.json$/, '')) g.fail(`id/${f}`, `파일 이름과 id('${j.id}')가 다르다 — 찾을 때 어긋난다`);
    n++;
    if (profiles[j.id]) g.fail(`id/dup/${j.id}`, '같은 id 가 둘이다');
    profiles[j.id] = j;
  }

  const cats = [];
  for (const p of fs.readdirSync(path.join(ROOT, 'packs'))) {
    const f = path.join(ROOT, 'packs', p, 'catalog.json');
    if (fs.existsSync(f)) cats.push(JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  if (cats.length < 3) { g.setupFail(`팩이 ${cats.length}개다`); return n; }

  // ── 1·6. 프로필이 말이 되는가 ──
  for (const [id, p] of Object.entries(profiles)) {
    n++;
    const probs = profileProblems(p, { routines: ROUTINES });
    if (probs.length) g.fail(`ok/${id}`, probs.map((x) => `${x.key}: ${x.why}`).join(' · '));
  }

  // ── 2·3. 일부러 깨서 본다 ──
  {
    const base = profiles['school-kr'];
    n++;
    if (!base) { g.setupFail('school-kr 프로필이 없다'); return n; }
    const breaks = [
      ['비율을 역할에 손으로 적기', (p) => { p.composition[0].share = 0.9; }, 'share/student'],
      ['모르는 출처', (p) => { p.mix.source = '어디선가'; }, 'mix/source'],
      ['비가 무엇인지 안 적기', (p) => { delete p.mix.what; }, 'mix/what'],
      ['구성에 없는 역할의 비', (p) => { p.mix.weights.janitor = 2; }, 'mix/weights/stray'],
      ['역할의 비가 빠짐', (p) => { delete p.mix.weights.teacher; }, 'mix/weights/role'],
      ['출처 문장에 없는 수', (p) => { p.mix.weights.student = 9.0; }, 'mix/what-number'],
      ['없는 일과를 가리킴', (p) => { p.routine = 'marsDay'; }, 'routine'],
      ['일과에 없는 역할을 가리킴', (p) => { p.composition[0].routinePart = 'janitor'; }, 'routine/student'],
      ['이름이 한 언어뿐', (p) => { delete p.en; }, 'name'],
      ['찾는 사람이 없음', (p) => { delete p.composition[1].want; }, 'want/teacher'],
    ];
    for (const [what, patch, wantKey] of breaks) {
      n++;
      const bad = JSON.parse(JSON.stringify(base));
      patch(bad);
      const keys = profileProblems(bad, { routines: ROUTINES }).map((x) => x.key);
      if (!keys.includes(wantKey)) g.fail(`break/${what}`, `${what} 했는데 '${wantKey}' 로 안 잡는다 (잡은 것: ${keys.join(' · ') || '없음'})`);
    }
    // 못 구했다면서 비를 적어 둔 것 — 둘 중 하나여야 한다.
    n++;
    const both = JSON.parse(JSON.stringify(base));
    both.mix.pending = '못 구했다';
    if (!profileProblems(both, { routines: ROUTINES }).some((x) => x.key === 'mix/both')) {
      g.fail('break/both', '못 구했다면서 비를 적어 둔 프로필을 받아 준다');
    }
  }

  // ── 4. 비를 흔들면 비율이 따라 움직이는가 ──
  {
    const base = profiles['school-kr'];
    const shares = profileShares(base);
    n++;
    if (!shares) { g.fail('mix/none', 'school-kr 의 비율이 안 나온다'); }
    else {
      n++;
      const sum = shares.reduce((s, x) => s + x.share, 0);
      if (Math.abs(sum - 1) > 1e-9) g.fail('mix/sum', `비율의 합이 ${sum} 다`);
      n++;
      // 발표된 수(12.1)에서 정말 나오는가 — 손으로 적은 백분율과 견주지 않고,
      // **비에서 다시 계산해** 견준다.
      const w = base.mix.weights;
      const want = w.student / (w.student + w.teacher);
      const got = shares.find((x) => x.role === 'student').share;
      if (Math.abs(got - want) > 1e-12) g.fail('mix/derive', `학생 비율이 ${got} 인데 비에서는 ${want} 다`);
      n++;
      // **흔든다** — 교원 1인당 학생이 두 배면 학생 비율이 올라야 한다.
      const shaken = JSON.parse(JSON.stringify(base));
      shaken.mix.weights.student = w.student * 2;
      const after = profileShares(shaken).find((x) => x.role === 'student').share;
      if (!(after > got)) g.fail('mix/shake', `비를 두 배로 했는데 학생 비율이 ${got} → ${after} 다`);
      n++;
      // 그리고 **여전히 1** 이어야 한다 (계산이지 저장이 아니다).
      if (Math.abs(profileShares(shaken).reduce((s, x) => s + x.share, 0) - 1) > 1e-9) {
        g.fail('mix/shake-sum', '흔든 뒤 비율의 합이 1 이 아니다');
      }
      console.log(`  [프로필] school-kr: 교원 1인당 학생 ${w.student} → 학생 ${(got * 100).toFixed(2)}% · 교원 ${((1 - got) * 100).toFixed(2)}% (저장 안 하고 계산한다)`);
    }
    // 출처가 확인된 날과 주소를 갖고 있는가 — 값보다 확인이 먼저 낡는다.
    for (const [key, src] of Object.entries(PROFILE_SOURCES)) {
      n++;
      if (!src.url || !/^https:/.test(src.url)) g.fail(`source/${key}/url`, `주소가 ${src.url} 다`);
      n++;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(src.checked || '')) g.fail(`source/${key}/checked`, `확인한 날이 ${src.checked} 다`);
      n++;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(src.published || '')) g.fail(`source/${key}/published`, `발표일이 ${src.published} 다`);
    }
  }

  // ── 5. 못 구한 것 ──
  {
    const pend = pendingProfiles(profiles);
    n++;
    // 수를 센다 — 빈 자리가 조용히 남지 않게. (지금은 1건이다.)
    for (const x of pend) {
      if (!x.need || x.need.length < 20) g.fail(`pending/${x.id}`, '무엇이 필요한지가 너무 짧다');
    }
    n++;
    const nh = profiles['nursing-home-kr'];
    if (!nh) g.setupFail('nursing-home-kr 프로필이 없다');
    else {
      if (profileShares(nh) !== null) g.fail('pending/shares', '못 구했다는 프로필에서 비율이 나온다');
      n++;
      // **비율로 쓰려 하면 막는다** — 지어낸 비율로 양로원을 채우면 안 된다.
      let threw = false;
      try { planCast(nh, { packs: cats, count: 100 }); } catch { threw = true; }
      if (!threw) g.fail('pending/count', '비율을 못 구한 프로필로 인원을 나눠 준다');
      n++;
      // 인원을 직접 주면 된다 — "이 시설에 몇 명" 은 공간 쪽이 안다.
      const cast = planCast(nh, { packs: cats, counts: COUNTS['nursing-home-kr'] });
      if (cast.count !== 100) g.fail('pending/counts', `인원을 70+30 으로 줬는데 ${cast.count}명이라 한다`);
    }
    console.log(`  [프로필] 못 구한 것 ${pend.length}건: ${pend.map((x) => x.id).join(' · ') || '없음'}`);
  }

  // ── 7. 시계가 없는가 ──
  {
    n++;
    const found = clockLike(profiles, 'profiles');
    if (found.length) {
      g.fail('clock', `프로필에 시각이 들어왔다: ${found.map((f) => `${f.where} = ${f.what}`).join(' · ')} — 시간표는 공간 쪽이다`);
    }
    n++;
    // 일부러 넣어 본다.
    if (!clockLike({ p: { note: '08:40 등교' } }).length) g.fail('clock/shake', '프로필에 넣은 시각을 안 잡는다');
  }

  // ── 8. 지금 팩으로 얼마나 차는가 ──
  for (const [id, p] of Object.entries(profiles)) {
    n++;
    const want = COVERAGE[id];
    if (want === undefined) { g.fail(`cover/${id}/undeclared`, '새 프로필인데 얼마나 차는지가 COVERAGE 에 안 적혀 있다'); continue; }
    const cast = COUNTS[id]
      ? planCast(p, { packs: cats, counts: COUNTS[id] })
      : planCast(p, { packs: cats, count: 530 });
    n++;
    if (Math.abs(cast.coverage - want) > 0.005) {
      g.fail(`cover/${id}`, `배역이 ${cast.coverage} 만큼 찬다 — 적어 둔 것은 ${want} 다 (팩이 늘었으면 COVERAGE 를 고칠 것)`);
    }
    n++;
    // 못 채운 자리가 있으면 **왜인지**가 있어야 한다.
    for (const m of cast.missing) {
      if (!m.why) g.fail(`cover/${id}/why`, `${m.role} 을 못 채웠는데 왜인지가 없다`);
    }
    console.log(`  [프로필] ${castReport(cast).split('\n')[0]}`);
  }

  return n;
});
