// check:anthropometry — 치수에 출처가 있는가, 그리고 없는 것이 몇 개인가.
//
// 이 게이트가 지키는 것은 "정확한 값" 이 아니라 **값의 출처**다. 눈높이를
// 키에서 비율로 만들어 넣으면 그 수로 창 높이를 검토하고 "맞다" 는 결론까지
// 나온다 — 어디서 왔는지 아무도 모르는 채로.
//
// 아직 못 채운 치수는 실패가 아니다. 다만 **몇 개인지 말한다** — 그 수가
// 줄어드는 것이 P0 의 진척이다.

import { runGate } from './gate-lib.mjs';
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
  }

  // ── 2. 출처 선언이 말이 되는가 ──
  for (const [key, s] of Object.entries(SOURCES)) {
    n++;
    if (!s.url) g.fail(`source/${key}/url`, '출처에 주소가 없다 — 다음 사람이 못 찾는다');
    n++;
    if (!s.years) g.fail(`source/${key}/years`, '언제 잰 것인지가 없다 — 인체치수는 20년에 6cm 가 변한다');
  }

  // ── 3. 값들이 서로 말이 되는가 ──
  //
  // 지금은 키뿐이라 비교가 적다. 앉은키·눈높이가 들어오면 여기서 "앉은키 <
  // 키", "눈높이 < 키" 가 자동으로 검사된다 — 값이 늘 때 검사도 함께 는다.
  {
    n++;
    const m = dimensionMm('stature', { population: 'kr-male-adult' });
    const f = dimensionMm('stature', { population: 'kr-female-adult' });
    if (!(m > 0) || !(f > 0)) g.fail('rel/stature', '남녀 평균 키가 둘 다 있어야 한다');
    else if (!(m > f)) g.fail('rel/stature-order', `남 ${m} · 여 ${f} — 조사 결과와 순서가 다르다`);

    const smaller = [['sittingHeight', 'stature'], ['eyeHeight', 'stature'], ['eyeHeightSitting', 'sittingHeight']];
    for (const [a, b] of smaller) {
      for (const pop of ['kr-male-adult', 'kr-female-adult']) {
        const av = dimensionMm(a, { population: pop });
        const bv = dimensionMm(b, { population: pop });
        if (av == null || bv == null) continue;   // 아직 없는 것은 아래에서 센다
        n++;
        if (!(av < bv)) g.fail(`rel/${a}-${b}/${pop}`, `${a} ${av} 가 ${b} ${bv} 보다 작지 않다`);
      }
    }
  }

  // ── 4. 없는 값을 0 으로 돌려주지 않는가 ──
  //
  // 이것이 이 파일에서 가장 위험한 실수다. 없는 치수를 0 으로 주면 문 폭
  // 검토가 "0mm 어깨너비" 로 통과한다.
  {
    n++;
    if (dimensionMm('eyeHeight', { population: 'kr-male-adult' }) !== null) {
      g.fail('missing/zero', '아직 없는 치수인데 값을 돌려준다');
    }
    n++;
    if (dimensionMm('없는치수', { population: 'kr-male-adult' }) !== null) {
      g.fail('missing/unknown', '없는 이름인데 값을 돌려준다');
    }
    n++;
    // 백분위를 안 맞히면 값을 주면 안 된다 — 95 를 물었는데 평균을 주면
    // 통행 폭이 절반 인원에게 모자란다.
    if (dimensionMm('stature', { population: 'kr-male-adult', percentile: 95 }) !== null) {
      g.fail('missing/percentile', '95 백분위를 물었는데 평균을 돌려준다');
    }
  }

  // ── 5. 못 채운 것이 몇 개이고, 무엇에 쓰이는가 ──
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
  console.log(`  [치수] 다음 할 일: ${SOURCES.sizekorea8.url} 에서 성별·연령대별 백분위 받기`);

  return n;
});
