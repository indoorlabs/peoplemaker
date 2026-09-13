// check:cast — 배역이 **없는 사람을 지어내지 않는가.**
//
// 배역의 실패는 화면에 안 나타난다. 양로원에 노인 팩이 없으면 그 자리에
// 청년이 서는데, 멀리서 보면 그냥 사람들이고 아무도 못 알아챈다. 그러고
// 나서 나오는 "노인 시설 피난 시간" 은 거짓이다. 뛰는 클립이 없는 팩에
// 대피를 안 주는 것(check-activity)과 같은 종류의 거짓말이라, 같은 방식으로
// 막는다 — **없으면 없다고 수로 말한다.**
//
// 그래서 묻는 것:
//   1. 몫을 정수로 나눌 때 합이 시킨 수와 **정확히** 같은가 · 늘 같은가
//   2. 조건의 **오타**를 던지는가 (ageband → 아무나 다 맞는다)
//   3. 없는 역할을 조용히 채우는가 — 안 채우고, 몇 명이 비는지 말하는가
//   4. 대신 채운 것이 `coverage` 에 **안 섞이는가**
//   5. 적힌 사람(person)과 잰 몸(bodyDims)이 어긋나면 잡는가
//   6. 계약이 person 의 낱말을 지키는가 (한 자리씩 일부러 깨서 본다)
//
// 프로필은 여기서 **시험용으로 지어 쓴다.** 배포하는 값이 아니므로 출처
// 규약에 걸리지 않는다 — 진짜 프로필(profiles/*.json)은 O3 에서 출처와 함께
// 들어온다.

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import {
  planCast, validateProfile, matchesWant, splitInt, castReport, WANT_KEYS,
} from '../src/lib/cast.mjs';
import { validateCatalog, personProblems, AGE_BANDS } from '../src/lib/motionPack.mjs';

/** 시험용 프로필 — 배포값이 아니다. */
const SCHOOL = {
  id: 'school-test',
  composition: [
    { role: 'student', share: 0.9, want: { ageBand: 'youth' } },
    { role: 'staff', share: 0.1, want: { ageBand: 'adult', attire: 'business' } },
  ],
};
const SCHOOL_SUB = {
  id: 'school-test-sub',
  composition: [
    {
      role: 'student',
      share: 0.9,
      want: { ageBand: 'youth' },
      substitute: { want: { ageBand: 'child' }, why: '청소년 팩이 없어 초등 몸으로 대신한다 — 키가 30cm 다르다' },
    },
    { role: 'staff', share: 0.1, want: { ageBand: 'adult', attire: 'business' } },
  ],
};
const NURSING = {
  id: 'nursing-home-test',
  composition: [
    { role: 'resident', share: 0.7, want: { ageBand: 'older-adult' } },
    { role: 'wheelchair', share: 0.12, want: { mobility: 'wheelchair' } },
    { role: 'carer', share: 0.18, want: { ageBand: 'adult' } },
  ],
};
const OFFICE = {
  id: 'office-test',
  composition: [{ role: 'worker', share: 1, want: { ageBand: 'adult' } }],
};

runGate('check-cast', (g) => {
  let n = 0;

  // 진짜 팩을 읽는다 — 배역은 팩이 제가 누구인지 말할 때만 돌아간다.
  const cats = [];
  for (const p of fs.readdirSync(path.join(ROOT, 'packs'))) {
    const f = path.join(ROOT, 'packs', p, 'catalog.json');
    if (fs.existsSync(f)) cats.push(JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  if (cats.length < 3) { g.setupFail(`팩이 ${cats.length}개다 — 배역을 볼 수 없다`); return n; }

  // ── 1. 몫 나누기 ──
  {
    for (const total of [0, 1, 7, 100, 999]) {
      n++;
      const got = splitInt([0.9, 0.1], total);
      if (got.reduce((s, v) => s + v, 0) !== total) {
        g.fail(`split/${total}`, `${total}명을 나눴는데 합이 ${got.reduce((s, v) => s + v, 0)} 다 (${got.join('+')})`);
      }
    }
    n++;
    // 셋으로 나눌 때가 반올림이 깨지는 자리다 — 1/3 셋을 10명에 붙이면 3+3+3=9.
    const three = splitInt([1, 1, 1], 10);
    if (three.reduce((s, v) => s + v, 0) !== 10) g.fail('split/three', `10명을 셋으로 나눴는데 ${three.join('+')} 다`);
    n++;
    // **넘치는 쪽도 봐야 한다.** 반올림으로 나누면 1,1,1 을 5명에 붙일 때
    // 2+2+2=6 이 된다 — 모자라는 경우만 보면 반올림 구현이 그대로 통과한다.
    const over = splitInt([1, 1, 1], 5);
    if (over.reduce((s, v) => s + v, 0) !== 5) g.fail('split/over', `5명을 셋으로 나눴는데 ${over.join('+')} 다 (합 ${over.reduce((s, v) => s + v, 0)})`);
    n++;
    const over2 = splitInt([1, 1], 5);
    if (over2.reduce((s, v) => s + v, 0) !== 5) g.fail('split/over2', `5명을 둘로 나눴는데 ${over2.join('+')} 다`);
    n++;
    if (splitInt([1, 1, 1], 10).join() !== three.join()) g.fail('split/stable', '같은 것을 두 번 나눴는데 다르게 나온다');
    n++;
    if (splitInt([0], 5).join() !== '0') g.fail('split/zero', '무게가 0인데 사람을 넣는다');
  }

  // ── 2. 조건의 오타를 던지는가 ──
  {
    const person = { ageBand: 'child', sex: 'male', mobility: 'walk', attire: 'casual' };
    n++;
    if (!matchesWant(person, { ageBand: 'child' })) g.fail('want/hit', '맞는 사람을 안 맞다고 한다');
    n++;
    if (matchesWant(person, { ageBand: 'adult' })) g.fail('want/miss', '안 맞는 사람을 맞다고 한다');
    n++;
    // **적힌 것만 본다** — 성별을 안 적었으면 성별을 안 가린다.
    if (!matchesWant(person, {})) g.fail('want/empty', '아무 조건도 없는데 안 맞다고 한다');
    n++;
    // **무엇이라 던지는지까지 본다.** 그냥 try/catch 로 두었더니, 검사를
    // 빼도 `ALLOWED['ageband'].includes` 가 TypeError 로 던져서 게이트가
    // 그대로 통과했다 — 검사가 아니라 우연이 막고 있었던 것이다.
    try {
      matchesWant(person, { ageband: 'child' });
      g.fail('want/typo', "키 오타('ageband')를 받아 준다 — 조건이 없는 것과 같아져 아무나 다 맞는다");
    } catch (e) {
      if (!/모르는 키/.test(e.message)) g.fail('want/typo-why', `키 오타를 ${e.constructor.name}(${e.message}) 로 던진다 — 검사가 아니라 우연이다`);
    }
    n++;
    try {
      matchesWant(person, { ageBand: 'teenager' });
      g.fail('want/unknown', "모르는 값('teenager')을 받아 준다 — 영영 0명이 되고 아무도 왜인지 모른다");
    } catch (e) {
      if (!/아는 값이 아니다/.test(e.message)) g.fail('want/unknown-why', `모르는 값을 ${e.message} 로 던진다`);
    }
    n++;
    if (matchesWant(null, { ageBand: 'child' })) g.fail('want/nobody', 'person 이 없는 팩을 사람으로 센다');
  }

  // ── 3. 프로필 검사 ──
  {
    n++;
    try { validateProfile(SCHOOL); } catch (e) { g.fail('profile/ok', `멀쩡한 프로필을 막는다 — ${e.message}`); }
    const broken = [
      ['비율의 합이 1이 아니다', { id: 'x', composition: [{ role: 'a', share: 0.5, want: {} }] }],
      ['역할이 두 번', { id: 'x', composition: [{ role: 'a', share: 0.5, want: {} }, { role: 'a', share: 0.5, want: {} }] }],
      ['비율이 0', { id: 'x', composition: [{ role: 'a', share: 0, want: {} }, { role: 'b', share: 1, want: {} }] }],
      ['구성이 비었다', { id: 'x', composition: [] }],
      ['왜인지 없는 대신 채우기', {
        id: 'x',
        composition: [{ role: 'a', share: 1, want: { ageBand: 'youth' }, substitute: { want: { ageBand: 'child' } } }],
      }],
    ];
    for (const [what, prof] of broken) {
      n++;
      let threw = false;
      try { validateProfile(prof); } catch { threw = true; }
      if (!threw) g.fail(`profile/${what}`, `${what} 인 프로필을 받아 준다`);
    }
  }

  // ── 4. 없는 역할을 조용히 채우는가 ──
  {
    const cast = planCast(NURSING, { packs: cats, count: 100 });
    n++;
    if (cast.ok) g.fail('nursing/ok', '노인·휠체어 팩이 0개인데 양로원 배역이 다 됐다고 한다');
    n++;
    // 70(노인) + 12(휠체어) 가 비고 18(요양보호사)만 찬다.
    if (cast.filled !== 18) g.fail('nursing/filled', `100명 중 ${cast.filled}명을 채웠다 — 어른만 되므로 18명이어야`);
    n++;
    if (Math.abs(cast.coverage - 0.18) > 1e-6) g.fail('nursing/coverage', `coverage 가 ${cast.coverage} 다 (0.18 이어야)`);
    n++;
    const lost = cast.missing.reduce((s, m) => s + m.n, 0);
    if (lost !== 82) g.fail('nursing/missing', `못 채운 수를 ${lost} 라고 한다 (82 여야)`);
    n++;
    if (cast.missing.length !== 2) g.fail('nursing/why', `없는 것을 ${cast.missing.length}가지로 말한다 (노인·휠체어 둘이어야)`);
    n++;
    // **빈 번호를 물으면 막는다** — null 을 돌려주면 쓰는 쪽이 그 자리에
    // 아무나 세우고, 그러면 82명이 조용히 어른이 된다.
    try {
      cast.kindOf(50);
      g.fail('nursing/kindOf', '못 채운 번호에 팩을 돌려준다');
    } catch { /* 맞다 */ }
    n++;
    if (cast.kindOf(0) == null) g.fail('nursing/kindOf0', '채운 번호인데 팩이 없다');
    n++;
    const sum = cast.assigned.reduce((s, a) => s + a.n, 0);
    if (sum !== cast.filled) g.fail('nursing/sum', `팩마다 나눈 합이 ${sum} 인데 채운 수는 ${cast.filled} 다`);

    console.log(`  [배역] ${castReport(cast).split('\n')[0]}`);
    for (const m of cast.missing) console.log(`         ✗ ${m.role} ${m.n}명 — ${m.why}`);
  }

  // ── 5. 대신 채운 것이 coverage 에 섞이는가 ──
  {
    const strict = planCast(SCHOOL, { packs: cats, count: 200 });
    const sub = planCast(SCHOOL_SUB, { packs: cats, count: 200 });
    n++;
    if (strict.filled !== 20) g.fail('school/strict', `청소년 팩이 0개인데 ${strict.filled}명을 채웠다 (교직원 20명만이어야)`);
    n++;
    if (sub.filled !== 200) g.fail('school/sub', `대신 채우기를 적었는데 ${sub.filled}명만 찼다`);
    n++;
    // **여기가 요점이다**: 다 세웠어도 "정확히 맞은" 비율은 0.1 이다.
    if (Math.abs(sub.coverage - 0.1) > 1e-6) {
      g.fail('school/coverage', `대신 채운 180명이 coverage 에 섞였다 (${sub.coverage}) — 0.1 이어야`);
    }
    n++;
    if (Math.abs(sub.coverageWithSubstitutes - 1) > 1e-6) {
      g.fail('school/withsub', `대신 채운 것까지 세면 1 이어야 하는데 ${sub.coverageWithSubstitutes} 다`);
    }
    n++;
    const why = sub.roles.find((r) => r.role === 'student')?.why;
    if (!why) g.fail('school/why', '대신 채우고도 왜인지를 안 남긴다');
    n++;
    // 대신 채운 몸이 **정말 어린이인가** — 아무나 끌어다 쓰면 안 된다.
    const used = new Set(sub.roles.find((r) => r.role === 'student').packs.map((p) => p.packId));
    const notChild = [...used].filter((id) => cats.find((c) => c.packId === id)?.person?.ageBand !== 'child');
    if (notChild.length) g.fail('school/subwho', `어린이로 대신한다더니 ${notChild.join(' · ')} 를 썼다`);
    console.log(`  [배역] 학교 200명: 그냥이면 ${strict.filled}명 · 초등 몸으로 대신하면 ${sub.filled}명 (정확 ${(sub.coverage * 100).toFixed(0)}%)`);
  }

  // ── 6. 섞어 세우기와 이어지는가 ──
  {
    // **어른 팩이 몇 개인지 박아 두지 않는다.** 사람을 더 받으면 그 수가
    // 바뀌는데, 박아 두면 자산이 늘 때마다 게이트가 거짓으로 걸린다. 세어서
    // 쓰고, 대신 **관계**를 본다 (다 쓰는가 · 고르게 나누는가 · 번갈아 붙는가).
    const adults = cats.filter((c) => c.person?.ageBand === 'adult').length;
    const want = adults * 10;
    const cast = planCast(OFFICE, { packs: cats, count: want });
    n++;
    if (cast.filled !== want) g.fail('office/filled', `어른 팩이 ${adults}개인데 ${cast.filled}명만 찼다 (${want}명을 시켰다)`);
    n++;
    if (cast.assigned.length !== adults) g.fail('office/kinds', `팩을 ${cast.assigned.length}개 쓴다 (어른 ${adults}개를 다 써야)`);
    n++;
    if (!cast.assigned.every((a) => a.n === 10)) g.fail('office/even', `고르게 안 나눈다: ${cast.assigned.map((a) => a.n).join()}`);
    n++;
    // **앞에서부터 잘라 써도 한 사람만 나오지 않는가.** 가까운 몇 명만 스킨드로
    // 세우는 화면이 그렇게 쓴다 — 몰아 주면 그 몇 명이 전부 같은 얼굴이다.
    const firstN = new Set([...Array(adults).keys()].map((i) => cast.kindOf(i)));
    if (firstN.size !== adults) g.fail('office/interleave', `앞 ${adults}명이 ${firstN.size}가지 몸이다 — 팩을 번갈아 붙여야 한다`);
    n++;
    const again = planCast(OFFICE, { packs: cats, count: want });
    const same = [...Array(want).keys()].every((i) => again.kindOf(i) === cast.kindOf(i));
    if (!same) g.fail('office/stable', '같은 프로필을 두 번 짰는데 사람이 바뀐다 — 건물을 고친 효과를 못 잰다');
    console.log(`  [배역] 사무실 60명: ${cast.assigned.map((a) => `${a.packId.replace('rocketbox-', '')}×${a.n}`).join(' · ')}`);
  }

  // ── 7. 적힌 사람과 잰 몸이 어긋나는가 ──
  //
  // **절대 키로 안 본다.** "어린이는 1.5m 아래" 같은 수는 모집단 통계이고
  // 출처가 필요하다. 여기서 보는 것은 관계다 — 어린이라고 적힌 팩의 키가
  // 어른이라고 적힌 팩들의 **중앙값**보다 작은가. 개별 비교로 하면 작은 어른과
  // 큰 아이에서 거짓으로 걸린다.
  //
  // 노인은 이 규칙에서 뺀다 — 나이가 들면 키가 준다는 것 자체가 출처가
  // 필요한 값이라, 지금은 규칙을 안 만든다.
  {
    const heightOf = (c) => c.bodyDims?.heightM;
    const median = (xs) => {
      const s = [...xs].sort((a, b) => a - b);
      return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };
    const check = (list) => {
      const adults = list.filter((c) => c.person?.ageBand === 'adult').map(heightOf).filter((h) => h > 0);
      if (adults.length < 2) return null;
      const mid = median(adults);
      const bad = list.filter((c) => c.person?.ageBand === 'child' && heightOf(c) >= mid);
      return { mid, bad };
    };
    const real = check(cats);
    n++;
    if (!real) g.setupFail('어른으로 적힌 팩이 둘 미만이라 키 관계를 못 본다');
    else {
      if (real.bad.length) {
        g.fail('dims/child', `어린이로 적혔는데 어른 중앙값 ${real.mid}m 보다 큰 팩: ${real.bad.map((c) => `${c.packId} ${heightOf(c)}m`).join(' · ')}`);
      }
      n++;
      // **일부러 깨 본다** — 어린이 팩을 어른이라고 적으면 잡히는가.
      const lied = cats.map((c) => (c.packId === 'rocketbox-c01'
        ? { ...c, person: { ...c.person, ageBand: 'adult' } }
        : c));
      const after = check(lied);
      // c01(1.431m)이 어른 무리에 들어가면 중앙값이 내려간다. 그것만으로는
      // 안 걸릴 수 있으므로, 반대로 어른을 어린이라고 적어 본다.
      const lied2 = cats.map((c) => (c.packId === 'rocketbox-m01'
        ? { ...c, person: { ...c.person, ageBand: 'child' } }
        : c));
      if (!check(lied2)?.bad.length) {
        g.fail('dims/shake', '어른(1.81m)을 어린이라고 적었는데 안 걸린다 — 이 검사는 아무것도 안 보고 있다');
      }
      n++;
      if (after && after.mid >= real.mid) g.fail('dims/shake2', '어린이를 어른 무리에 넣었는데 중앙값이 안 내려간다');
      console.log(`  [배역] 적힌 것과 잰 것: 어른 중앙값 ${real.mid}m · 어린이 ${cats.filter((c) => c.person?.ageBand === 'child').map(heightOf).join(' · ')}m`);
    }
  }

  // ── 8. 계약이 person 의 낱말을 지키는가 ──
  {
    const base = cats.find((c) => c.person);
    n++;
    if (!base) { g.setupFail('person 이 적힌 팩이 없다'); return n; }
    n++;
    if (validateCatalog(base).length) {
      g.fail('contract/ok', `멀쩡한 팩이 계약에 걸린다: ${validateCatalog(base).map((x) => x.id).join(' · ')}`);
    }
    const breaks = [
      ['출처를 잰 값으로', { source: 'measured-from-pack' }, 'catalog/person/source'],
      ['모르는 나이대', { ageBand: 'teenager' }, 'catalog/person/ageBand'],
      ['모르는 성별', { sex: 'm' }, 'catalog/person/sex'],
      ['모르는 이동 방식', { mobility: 'flying' }, 'catalog/person/mobility'],
      ['모르는 옷차림', { attire: 'spacesuit' }, 'catalog/person/attire'],
    ];
    for (const [what, patch, wantId] of breaks) {
      n++;
      const bad = { ...base, person: { ...base.person, ...patch } };
      const ids = validateCatalog(bad).map((x) => x.id);
      if (!ids.includes(wantId)) g.fail(`contract/${what}`, `${what} 로 적었는데 ${wantId} 로 안 잡는다 (잡은 것: ${ids.join(' · ') || '없음'})`);
    }
    n++;
    if (personProblems(base.person).length) g.fail('contract/problems', '멀쩡한 사람인데 문제라고 한다');
    n++;
    if (!personProblems(null).length) g.fail('contract/null', '사람 정보가 없는데 괜찮다고 한다');
  }

  // ── 9. 지금 없는 것을 수로 말한다 ──
  {
    const byBand = {};
    for (const b of Object.keys(AGE_BANDS)) byBand[b] = cats.filter((c) => c.person?.ageBand === b).length;
    const wheel = cats.filter((c) => c.person?.mobility && c.person.mobility !== 'walk').length;
    const nobody = cats.filter((c) => !c.person).length;
    n++;
    // 이 수가 바뀌면(노인 팩이 들어오면) 게이트가 말해 준다 — 계획의 O6 이다.
    if (byBand.adult < 2) g.fail('have/adult', `어른 팩이 ${byBand.adult}개다`);
    console.log(
      `  [배역] 팩 ${cats.length}개 — ${Object.entries(byBand).map(([k, v]) => `${k} ${v}`).join(' · ')}`
      + ` · 걷지 않는 몸 ${wheel} · 사람 아님 ${nobody}`,
    );
    n++;
    if (WANT_KEYS.length !== 4) g.fail('have/keys', `고를 수 있는 잣대가 ${WANT_KEYS.length}가지다`);
  }

  return n;
});
