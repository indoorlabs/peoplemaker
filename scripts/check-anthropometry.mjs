// check:anthropometry — 치수에 출처가 있는가, 그리고 없는 것이 몇 개인가.
//
// 이 게이트가 지키는 것은 "정확한 값" 이 아니라 **값의 출처**다. 눈높이를
// 키에서 비율로 만들어 넣으면 그 수로 창 높이를 검토하고 "맞다" 는 결론까지
// 나온다 — 어디서 왔는지 아무도 모르는 채로.
//
// 아직 못 채운 치수는 실패가 아니다. 다만 **몇 개인지 말한다** — 그 수가
// 줄어드는 것이 P0 의 진척이다.

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import {
  DIMENSIONS, SOURCES, dimensionMm, pendingDimensions, allValues,
} from '../src/lib/anthropometry.mjs';

runGate('check-anthropometry', (g) => {
  let n = 0;

  // ── 1. 값마다 출처가 있는가 ──
  for (const v of allValues()) {
    n++;
    if (!v.source) { g.fail(`value/${v.key}/${v.population}/source`, '출처가 없다'); continue; }
    n++;
    if (!SOURCES[v.source]) {
      g.fail(`value/${v.key}/${v.population}/source-unknown`, `'${v.source}' 는 SOURCES 에 없다 — 오타로 새 출처가 생기지 않게`);
    }
    n++;
    if (!v.population) g.fail(`value/${v.key}/population`, '누구를 잰 것인지가 없다');
    n++;
    if (v.percentile == null) g.fail(`value/${v.key}/${v.population}/percentile`, '백분위가 없다 — 평균이면 mean 이라고 적을 것');
    n++;
    // 단위를 섞지 않는다. mm 로 적기로 했으므로 사람 치수는 mm 자릿수여야 한다.
    if (!(v.valueMm > 100 && v.valueMm < 2500)) {
      g.fail(`value/${v.key}/${v.population}/unit`, `${v.valueMm} — mm 로 적는 규약인데 자릿수가 아니다`);
    }
    n++;
    // **표본 수도 값의 일부다.** 4,295명과 40명은 같은 95 백분위가 아니다.
    if (!(v.n > 0)) g.fail(`value/${v.key}/${v.population}/${v.percentile}/n`, `표본 수가 ${v.n} 다`);
  }

  // 값이 있는 치수는 **어느 항목을 물어서 받은 것인지**를 갖고 있어야 한다.
  // 그것이 없으면 다음 사람이 같은 수를 다시 받을 수가 없다.
  for (const [key, d] of Object.entries(DIMENSIONS)) {
    if (!d.values) continue;
    n++;
    if (!d.item?.cd || !d.item?.ko) g.fail(`item/${key}`, '포털의 측정 항목(이름·코드)이 안 적혀 있다');
  }

  // ── 2. 출처 선언이 말이 되는가 ──
  for (const [key, s] of Object.entries(SOURCES)) {
    n++;
    if (!s.url) g.fail(`source/${key}/url`, '출처에 주소가 없다 — 다음 사람이 못 찾는다');
    n++;
    if (!s.years) g.fail(`source/${key}/years`, '언제 잰 것인지가 없다 — 인체치수는 20년에 6cm 가 변한다');
    n++;
    // **누구를 잰 조사인지**가 있어야 한다. 20~69세만 잰 조사를 "한국인" 으로
    // 읽으면 어린이 치수가 조용히 어른 값이 된다.
    if (!s.ages) g.fail(`source/${key}/ages`, '누구를 잰 조사인지(나이 범위)가 없다');
    n++;
    // 어떻게 받았는지 — 값만 있고 받은 길이 없으면 다시 물을 수가 없다.
    if (!s.api?.url || !s.api?.fetched) g.fail(`source/${key}/api`, '어떻게 받았는지가 안 적혀 있다');
  }

  // ── 3. 값들이 서로 말이 되는가 ──
  //
  // 다섯 치수가 들어오면서 여기가 진짜 검사가 됐다. 값 하나가 맞는지가
  // 아니라 **몸으로서 말이 되는가**를 본다 — 앉은키가 키보다 크면 어딘가
  // 항목을 잘못 물은 것이고, 그것은 한 줄 바꿔치기로 생긴다.
  const POPS = ['kr-male-20-69', 'kr-female-20-69'];
  const PCTS = ['mean', 5, 50, 95];
  {
    for (const pct of PCTS) {
      n++;
      const m = dimensionMm('stature', { population: POPS[0], percentile: pct });
      const f = dimensionMm('stature', { population: POPS[1], percentile: pct });
      if (!(m > 0) || !(f > 0)) g.fail(`rel/stature/${pct}`, '남녀 키가 둘 다 있어야 한다');
      else if (!(m > f)) g.fail(`rel/stature-order/${pct}`, `남 ${m} · 여 ${f} — 조사 결과와 순서가 다르다`);
    }

    // 작아야 하는 것이 정말 작은가.
    const smaller = [
      ['sittingHeight', 'stature'],
      ['eyeHeight', 'stature'],
      ['eyeHeightSitting', 'sittingHeight'],
      ['shoulderBreadth', 'stature'],
      ['bodyDepth', 'shoulderBreadth'],
    ];
    for (const [a, b] of smaller) {
      for (const pop of POPS) {
        for (const pct of PCTS) {
          const av = dimensionMm(a, { population: pop, percentile: pct });
          const bv = dimensionMm(b, { population: pop, percentile: pct });
          if (av == null || bv == null) continue;   // 아직 없는 것은 아래에서 센다
          n++;
          if (!(av < bv)) g.fail(`rel/${a}-${b}/${pop}/${pct}`, `${a} ${av} 가 ${b} ${bv} 보다 작지 않다`);
        }
      }
    }

    // **백분위가 커지면 값도 커져야 한다.** 열을 밀려 읽으면(p5 자리에 p95 를
    // 넣으면) 위의 관계 검사는 다 통과하는데 이것만 걸린다.
    for (const key of Object.keys(DIMENSIONS)) {
      if (!DIMENSIONS[key].values) continue;
      for (const pop of POPS) {
        const v5 = dimensionMm(key, { population: pop, percentile: 5 });
        const v50 = dimensionMm(key, { population: pop, percentile: 50 });
        const v95 = dimensionMm(key, { population: pop, percentile: 95 });
        if (v5 == null || v50 == null || v95 == null) continue;
        n++;
        if (!(v5 < v50 && v50 < v95)) g.fail(`rel/${key}/${pop}/percentile-order`, `5·50·95 가 ${v5} · ${v50} · ${v95} 다`);
        n++;
        // 평균과 중앙값은 몸 치수에서 서로 가깝다 — 5% 넘게 벌어지면
        // 두 값이 다른 모집단에서 온 것이다.
        const mean = dimensionMm(key, { population: pop, percentile: 'mean' });
        if (mean != null && Math.abs(mean - v50) > v50 * 0.05) {
          g.fail(`rel/${key}/${pop}/mean-median`, `평균 ${mean} 과 중앙값 ${v50} 이 5% 넘게 벌어진다 — 다른 모집단이 섞였다`);
        }
      }
    }

    // **표본 수가 값마다 같은가** — 한 항목 안에서 n 이 다르면 두 번에 나눠
    // 받다가 조사 차수가 섞인 것이다.
    for (const key of Object.keys(DIMENSIONS)) {
      const vs = (DIMENSIONS[key].values || []);
      for (const pop of POPS) {
        const ns = [...new Set(vs.filter((v) => v.population === pop).map((v) => v.n))];
        if (!ns.length) continue;
        n++;
        if (ns.length !== 1) g.fail(`rel/${key}/${pop}/n`, `표본 수가 ${ns.join(' · ')} 로 갈린다`);
      }
    }
  }

  // ── 4. 없는 값을 0 으로 돌려주지 않는가 ──
  //
  // 이것이 이 파일에서 가장 위험한 실수다. 없는 치수를 0 으로 주면 문 폭
  // 검토가 "0mm 어깨너비" 로 통과한다.
  {
    n++;
    // **어린이를 물으면 없다고 해야 한다.** 제8차는 20~69세만 잰 조사라,
    // 여기서 어른 값이 나오면 학교 검토가 어른 눈높이로 통과한다.
    if (dimensionMm('eyeHeight', { population: 'kr-child' }) !== null) {
      g.fail('missing/child', '어린이 눈높이가 없는데 값을 돌려준다 — 어른 값이 새어 나온다');
    }
    n++;
    if (dimensionMm('buttockFlesh', { population: 'kr-male-20-69' }) !== null) {
      g.fail('missing/zero', '아직 없는 치수인데 값을 돌려준다');
    }
    n++;
    if (dimensionMm('없는치수', { population: 'kr-male-20-69' }) !== null) {
      g.fail('missing/unknown', '없는 이름인데 값을 돌려준다');
    }
    n++;
    // 백분위를 안 맞히면 값을 주면 안 된다 — 99 를 물었는데 95 를 주면
    // 통행 폭이 모자란다.
    if (dimensionMm('stature', { population: 'kr-male-20-69', percentile: 99 }) !== null) {
      g.fail('missing/percentile', '99 백분위를 물었는데 다른 값을 돌려준다');
    }
    n++;
    // 옛 이름으로 물어도 안 나와야 한다 — 모집단 이름이 20~69세로 바뀌었다.
    if (dimensionMm('stature', { population: 'kr-male-adult' }) !== null) {
      g.fail('missing/oldpop', "옛 모집단 이름('kr-male-adult')에 값을 돌려준다");
    }
  }

  // ── 5. 팩의 몸이 이 모집단의 어디쯤인가 ──
  //
  // 값이 들어오면서 **처음으로 견줄 수 있게 됐다.** 팩의 bodyDims 는 그 몸
  // 하나를 잰 값이고 여기 DIMENSIONS 는 모집단 통계라, 둘을 섞으면 안 된다는
  // 것이 이 파일의 규약이다 — 그런데 **어느 쪽에 서 있는지 말하는 것**은
  // 섞는 것이 아니라 아는 것이다.
  //
  // 이것은 실패가 아니다. Rocketbox 는 서양 아바타라 한국인 분포 밖에 있을
  // 수 있고, 그것이 결함은 아니다. 다만 **모르고 쓰면** 한국 학교 복도를
  // 서양 사람으로 검토하게 된다. 그래서 적어 두고, 바뀌면 말한다.
  const OUTSIDE = {
    'rocketbox-business-f01': 'above',      // 1.732m
    'rocketbox-f01': 'above',               // 1.741m
    'rocketbox-f02': 'above',               // 1.732m
    'rocketbox-medical-f01': 'above',       // 1.737m
    'rocketbox-security-f01': 'above',      // 1.737m
    'rocketbox-business-m01': 'inside',     // 1.801m
    'rocketbox-m01': 'inside',              // 1.810m
    'rocketbox-m02': 'inside',              // 1.806m
    'rocketbox-medical-m01': 'inside',      // 1.801m
    'rocketbox-security-m01': 'inside',     // 1.824m
  };
  {
    const POP_OF = { male: 'kr-male-20-69', female: 'kr-female-20-69' };
    const lines = [];
    for (const id of fs.readdirSync(path.join(ROOT, 'packs'))) {
      const f = path.join(ROOT, 'packs', id, 'catalog.json');
      if (!fs.existsSync(f)) continue;
      const c = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!c.person || !c.bodyDims) continue;
      const pop = POP_OF[c.person.sex];
      if (!pop || c.person.ageBand !== 'adult') continue;   // 어린이 모집단은 아직 없다
      const p5 = dimensionMm('stature', { population: pop, percentile: 5 }) / 1000;
      const p95 = dimensionMm('stature', { population: pop, percentile: 95 }) / 1000;
      const h = c.bodyDims.heightM;
      const where = h < p5 ? 'below' : h > p95 ? 'above' : 'inside';
      n++;
      const want = OUTSIDE[id];
      if (want === undefined) g.fail(`pop/${id}/undeclared`, '새 팩인데 모집단의 어디쯤인지가 안 적혀 있다');
      else if (where !== want) {
        g.fail(`pop/${id}`, `키 ${h}m 가 ${pop} 의 ${where} 다 — 적어 둔 것은 ${want} (p5 ${p5.toFixed(3)} ~ p95 ${p95.toFixed(3)})`);
      }
      lines.push(`${id.replace('rocketbox-', '')} ${h}m ${where === 'inside' ? '안' : '밖▲'}`);
    }
    console.log(`  [치수] 팩의 키가 한국 20~69세 분포에서: ${lines.join(' · ')}`);
    console.log('  [치수] 여자 팩 셋은 한국 여자 95 백분위(1.697m)보다 크다 — 서양 아바타다. 결함이 아니라 알고 써야 할 사실이다.');
  }

  // ── 6. 못 채운 것이 몇 개이고, 무엇에 쓰이는가 ──
  const pending = pendingDimensions();
  n++;
  for (const p of pending) {
    if (!p.need) g.fail(`pending/${p.key}`, '무엇이 필요한지가 안 적혀 있다');
    if (!p.usedBy.length) g.fail(`pending/${p.key}/usedBy`, '어디에 쓰일 값인지가 안 적혀 있다 — 그러면 받아 올 이유도 못 정한다');
  }
  n++;
  if (Object.keys(DIMENSIONS).length < 3) g.setupFail('치수가 너무 적다 — 표를 잘못 읽었다');

  const have = allValues().length;
  console.log(`  [치수] 값이 있는 것 ${have}개 · 출처를 못 채운 치수 ${pending.length}개 (${pending.map((p) => p.key).join(' · ')})`);
  for (const p of pending) console.log(`  [치수] 없는 것: ${p.key} — ${p.need.slice(0, 60)}…`);
  console.log(`  [치수] ${SOURCES.sizekorea8.ko} · ${SOURCES.sizekorea8.ages} · ${SOURCES.sizekorea8.api.fetched} 에 받음`);

  return n;
});
