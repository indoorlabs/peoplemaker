// check:occupancy — 재실자 값에 **출처가 있는가**, 그리고 서로 말이 되는가.
//
// 이 값들은 인체치수보다 위험하다. 키를 3cm 틀리면 문이 조금 좁아지지만,
// 계단 속도를 0.44 대신 1.2 로 쓰면 **피난 시간이 3분의 1이 되고** 그 수로
// "이 건물은 안전하다" 는 결론이 나온다. 그래서 값마다 누구를·무엇을·어떤
// 조건에서 잰 것인지를 함께 두고, 게이트가 그것을 지킨다.
//
// 수로 묻는 것:
//   1. 값마다 출처·모집단·통계량·단위가 있는가
//   2. 출처가 **무엇을 잰 것인지**와 **한계**를 적고 있는가 (훈련이지 화재가
//      아니다)
//   3. 값들이 서로 말이 되는가 — 노인이 전체보다 느린가, 중앙값이 최소·최대
//      사이인가, 도움을 더 받을수록 느린가
//   4. 없는 값을 0 이나 어림값으로 주지 않는가
//   5. **우리 클립 속도가 여기 새어 들어오지 않았는가** (1.21 · 0.80)
//   6. 못 채운 것이 몇 개이고 무엇이 필요한가

import { runGate } from './gate-lib.mjs';
import {
  OCCUPANT_VALUES, OCCUPANT_SOURCES, occupantValue, pendingOccupantValues, allOccupantValues,
} from '../src/lib/occupancy.mjs';

const UNITS = ['m/s', 's', 'persons/m2'];
const STATS = ['mean', 'median', 'min', 'max'];

runGate('check-occupancy', (g) => {
  let n = 0;

  // ── 1. 값마다 출처가 있는가 ──
  for (const v of allOccupantValues()) {
    const tag = `${v.key}/${v.population}/${v.stat}`;
    n++;
    if (!OCCUPANT_SOURCES[v.source]) g.fail(`value/${tag}/source`, `출처가 '${v.source}' 다 — 아는 출처가 아니다`);
    n++;
    if (!v.population) g.fail(`value/${tag}/population`, '누구를 잰 것인지가 없다');
    n++;
    if (!STATS.includes(v.stat)) g.fail(`value/${tag}/stat`, `통계량이 '${v.stat}' 다 (${STATS.join(' · ')})`);
    n++;
    if (!UNITS.includes(v.unit)) g.fail(`value/${tag}/unit`, `단위가 '${v.unit}' 다 — 단위를 섞지 않는다`);
    n++;
    if (!(v.value > 0)) g.fail(`value/${tag}/value`, `값이 ${v.value} 다`);
    n++;
    // ± 를 적었으면 **그게 무엇인지**도 적어야 한다. 표준편차와 표준오차는
    // n=5244 에서 76배 다르다 — 이름 없이 두면 읽는 쪽이 고른다.
    if (v.plusMinus !== undefined && !v.spread) {
      g.fail(`value/${tag}/spread`, `±${v.plusMinus} 를 적었는데 그것이 표준편차인지 표준오차인지가 없다`);
    }
  }

  // ── 2. 출처가 무엇을 잰 것인지 적고 있는가 ──
  for (const [key, s] of Object.entries(OCCUPANT_SOURCES)) {
    n++;
    if (!s.url || !/^https:/.test(s.url)) g.fail(`source/${key}/url`, `주소가 ${s.url} 다`);
    n++;
    if (!s.published) g.fail(`source/${key}/published`, '언제 나온 것인지가 없다');
    n++;
    if (!s.what) g.fail(`source/${key}/what`, '무엇을 잰 것인지가 없다 — 표본을 모르면 값을 못 쓴다');
    n++;
    // **한계를 적는 것이 이 파일의 요점이다.** 훈련값을 화재값으로 읽으면
    // 대응 시간이 통째로 빠진다.
    if (!s.caveat) g.fail(`source/${key}/caveat`, '이 값을 어디까지 믿을 수 있는지가 없다');
  }

  // ── 3. 값들이 서로 말이 되는가 ──
  {
    const speed = (pop, stat = 'mean') => occupantValue('stairSpeedMps', { population: pop, stat });
    const all = speed('us-drill-all');
    n++;
    if (!(all > 0)) { g.setupFail('전체 계단 속도가 없다'); }
    else {
      // 노인 주거가 전체보다 느려야 한다 — 반대면 모집단을 섞어 적은 것이다.
      for (const pop of ['us-older-adult-housing', 'us-assisted-by-staff', 'us-assisted-by-firefighter', 'us-stair-travel-device']) {
        n++;
        const v = speed(pop);
        if (v == null) { g.fail(`rel/${pop}/none`, '값이 없다'); continue; }
        if (!(v < all)) g.fail(`rel/${pop}`, `${pop} 이 ${v}m/s 로 전체 평균 ${all}m/s 보다 느리지 않다`);
      }
      n++;
      // 도움을 더 받을수록 느리다 — 장애 없는 노인 > 노인 주거 전체 > 직원
      // 도움 > 소방대원 도움.
      const order = ['us-older-adult-no-disability', 'us-older-adult-housing', 'us-assisted-by-staff', 'us-assisted-by-firefighter']
        .map((p) => speed(p));
      for (let i = 1; i < order.length; i++) {
        if (!(order[i] < order[i - 1])) {
          g.fail('rel/assist-order', `도움을 더 받는 쪽이 더 빠르다: ${order.join(' → ')}`);
          break;
        }
      }
      n++;
      const lo = speed('us-drill-all', 'min');
      const hi = speed('us-drill-all', 'max');
      const med = speed('us-drill-all', 'median');
      if (!(lo < med && med < hi && lo < all && all < hi)) {
        g.fail('rel/range', `최소 ${lo} · 평균 ${all} · 중앙 ${med} · 최대 ${hi} 가 차례가 아니다`);
      }
    }

    // 지연 시간: 거동이 불편한 쪽이 더 오래 걸린다.
    const delay = (pop, stat = 'mean') => occupantValue('preObservationDelayS', { population: pop, stat });
    n++;
    const dAll = delay('us-drill-all');
    const dImp = delay('us-mobility-impaired-stairwell');
    const dAssisted = delay('us-assisted-living-building10');
    if (!(dAll < dImp && dImp < dAssisted)) {
      g.fail('rel/delay-order', `전체 ${dAll}s · 거동 불편 ${dImp}s · 노인시설 ${dAssisted}s 가 차례가 아니다`);
    }
    n++;
    if (!(delay('us-drill-all', 'median') < dAll)) {
      g.fail('rel/delay-skew', '지연 시간은 오른쪽으로 치우친 분포라 중앙값이 평균보다 작아야 한다');
    }

    console.log(`  [재실자] 계단 속도: 전체 ${all}m/s · 노인 주거 ${speed('us-older-adult-housing')} · 소방대원 도움 ${speed('us-assisted-by-firefighter')} · 이송 장비 ${speed('us-stair-travel-device')}`);
    console.log(`  [재실자] 관찰 전 지연: 전체 ${dAll}s · 거동 불편 ${dImp}s · 노인생활지원시설 한 곳 ${dAssisted}s (전체의 ${(dAssisted / dAll).toFixed(1)}배)`);
  }

  // ── 4. 없는 값을 주지 않는가 ──
  {
    n++;
    if (occupantValue('walkSpeedMps', { population: 'us-drill-all' }) !== null) {
      g.fail('missing/walk', '평지 보행속도가 없는데 값을 돌려준다 — 어림값이 들어온 것이다');
    }
    n++;
    if (occupantValue('preMovementTimeS', { population: 'us-drill-all' }) !== null) {
      g.fail('missing/premove', '대응 시간이 없는데 값을 돌려준다');
    }
    n++;
    if (occupantValue('없는값', {}) !== null) g.fail('missing/unknown', '없는 이름인데 값을 돌려준다');
    n++;
    if (occupantValue('stairSpeedMps', { population: 'kr-drill-all' }) !== null) {
      g.fail('missing/kr', '한국 값이 없는데 미국 값을 돌려준다');
    }
    n++;
    // 통계량을 안 맞히면 주면 안 된다 — 95 백분위를 물었는데 평균을 주면
    // 계단 폭이 모자란다.
    if (occupantValue('stairSpeedMps', { population: 'us-drill-all', stat: 'p95' }) !== null) {
      g.fail('missing/stat', '없는 통계량을 물었는데 다른 값을 돌려준다');
    }
  }

  // ── 5. 우리 클립 속도가 새어 들어오지 않았는가 ──
  //
  // 팩의 걷기는 1.21m/s(어른) · 0.80m/s(어린이)다. 그 수가 여기 있으면
  // 한 애니메이션이 모집단 값 자리에 들어앉은 것이다. 자릿수까지 같은 값이
  // 우연히 들어올 수는 있으므로, **출처가 팩이 아닌지**를 함께 본다.
  {
    const ANIM = [1.21, 0.8, 1.35, 1.62];
    for (const v of allOccupantValues()) {
      n++;
      if (v.unit === 'm/s' && ANIM.includes(v.value)) {
        g.fail(`anim/${v.key}/${v.population}`, `${v.value}m/s 는 우리 클립에서 잰 속도와 같다 — 애니메이션 값이 모집단 자리에 들어왔는지 봐야 한다`);
      }
    }
    n++;
    const bad = allOccupantValues().filter((v) => /pack|measured-from-pack|peoplemaker/.test(String(v.source)));
    if (bad.length) g.fail('anim/source', `팩에서 잰 값을 모집단 값으로 적었다: ${bad.map((v) => v.key).join(' · ')}`);
  }

  // ── 6. 못 채운 것 ──
  const pending = pendingOccupantValues();
  for (const p of pending) {
    n++;
    if (!p.need || p.need.length < 20) g.fail(`pending/${p.key}`, '무엇이 필요한지가 안 적혀 있다');
    n++;
    if (!p.usedBy.length) g.fail(`pending/${p.key}/usedBy`, '어디에 쓰일 값인지가 안 적혀 있다');
  }
  n++;
  // **두 지연 시간을 하나로 합치면 안 된다.** 관찰 전 지연에는 계단까지 가는
  // 시간이 섞여 있어서, 대응 시간으로 쓰면 피난 시간을 두 번 센다.
  if (!OCCUPANT_VALUES.preMovementTimeS?.pending) {
    g.fail('pending/premove-filled', '대응 시간이 채워졌다 — 관찰 전 지연으로 채운 것이라면 피난 시간을 두 번 세게 된다');
  }

  console.log(`  [재실자] 값이 있는 것 ${allOccupantValues().length}개 · 못 채운 것 ${pending.length}개 (${pending.map((p) => p.key).join(' · ')})`);
  console.log(`  [재실자] 출처: ${OCCUPANT_SOURCES.nistTN1839.ko} · ${OCCUPANT_SOURCES.nistTN1839.published} · ${OCCUPANT_SOURCES.nistTN1839.what}`);

  return n;
});
