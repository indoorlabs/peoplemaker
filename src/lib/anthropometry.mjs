// 인체치수 — 사람이 공간에 대해 아는 것.
//
// 문이 넓은가, 복도에서 비켜설 수 있는가, 앉으면 눈이 어디에 오는가. 이것은
// **모션이 아니라 치수**이고, 공간을 검토하는 쪽(spacemaker)이 바로 쓴다.
//
// ## 지어내지 않는다
//
// 눈높이를 "키 × 0.93" 으로 만들지 않는다. 그것은 값이 아니라 짐작이고, 한
// 번 들어가면 어디서 왔는지 아무도 모르게 된다 — 나중에 그 수로 시야를
// 검토하고 "창 높이가 맞다" 는 결론까지 나온다.
//
// 그래서 치수마다 **출처·연도·모집단·백분위**를 함께 적는다. 아직 못 채운
// 것은 지우지 않고 `pending` 으로 남긴다. 게이트가 그 수를 세므로, 비어
// 있다는 사실이 저장소 안에 수로 남는다.
//
// 이 파일은 three.js 도 DOM 도 import 하지 않는다.

/** 출처 목록. 치수는 이 키만 가리킬 수 있다 — 오타로 새 출처가 생기지 않게. */
export const SOURCES = {
  sizekorea8: {
    ko: '제8차 한국인 인체치수조사 (사이즈코리아)',
    org: '국가기술표준원',
    years: '2020~2023',
    url: 'https://sizekorea.kr',
    // **어떻게 받았는지를 적어 둔다.** 값만 있고 받은 길이 없으면 다음
    // 사람이 다시 물을 수가 없다 — 포털이 열려 있을 때 받아 둔 값이라
    // 더 그렇다 (이 기계에서 오래 안 열렸다).
    api: {
      method: 'POST',
      url: 'https://sizekorea.kr/human-meas-search/human-data-search/meas-item',
      form: 'measItemCds(항목 코드) · measDegree=8 · gender=M|F · agePeriod=20-69',
      fetched: '2026-09-13',
    },
    // **20~69세만 잰 조사다.** 7~12·13~18세를 물으면 0명이 나온다
    // (2026-09-13 확인). 어린이 치수는 여기 없다.
    ages: '20~69세',
  },
};

/**
 * 치수 하나.
 *
 *   valueMm     값 (mm — 단위를 섞지 않는다)
 *   source      SOURCES 의 키
 *   population  누구를 잰 것인가 (예: 'kr-male-20s')
 *   percentile  50 = 중앙값. 통행 폭 검토는 95, 손 닿는 높이는 5 를 쓴다
 *
 * pending 인 항목은 valueMm 없이 `pending: '무엇이 필요한가'` 만 갖는다.
 */
export const DIMENSIONS = {
  // ── 받은 것 (2026-09-13, 포털에서) ─────────────────────────
  //
  // 값은 **포털이 준 그대로**다 — 반올림하지 않았다. 평균·5·50·95 백분위를
  // 함께 두는 까닭은 쓰임이 다르기 때문이다: 통행 폭은 95, 손이 닿는 높이는
  // 5 를 쓴다. 평균 하나만 두면 쓰는 쪽이 반쪽에게 모자란 문을 낸다.
  //
  // 표본 수(n)도 값의 일부다. 4,295명과 40명은 같은 95 백분위가 아니다.

  stature: {
    ko: '키', en: 'Stature',
    // 포털의 측정 항목 — 이 코드로 다시 물으면 같은 수가 나온다.
    item: { ko: '키', cd: 'S-STa-H-[FL01-HD01]-DM' },
    usedBy: ['문 높이', '천장 높이'],
    values: [
      { valueMm: 1731.91, population: 'kr-male-20-69', percentile: 'mean', n: 4295, source: 'sizekorea8' },
      { valueMm: 1628, population: 'kr-male-20-69', percentile: 5, n: 4295, source: 'sizekorea8' },
      { valueMm: 1733, population: 'kr-male-20-69', percentile: 50, n: 4295, source: 'sizekorea8' },
      { valueMm: 1832.14, population: 'kr-male-20-69', percentile: 95, n: 4295, source: 'sizekorea8' },
      { valueMm: 1603.67, population: 'kr-female-20-69', percentile: 'mean', n: 5285, source: 'sizekorea8' },
      { valueMm: 1516, population: 'kr-female-20-69', percentile: 5, n: 5285, source: 'sizekorea8' },
      { valueMm: 1602.1, population: 'kr-female-20-69', percentile: 50, n: 5285, source: 'sizekorea8' },
      { valueMm: 1697, population: 'kr-female-20-69', percentile: 95, n: 5285, source: 'sizekorea8' },
    ],
  },

  eyeHeight: {
    ko: '눈높이', en: 'Eye height',
    // 포털의 측정 항목 — 이 코드로 다시 물으면 같은 수가 나온다.
    item: { ko: '눈높이', cd: 'S-STa-H-[FL01-EY04]-DM' },
    usedBy: ['시야 검토', '창 높이', '사이니지 높이'],
    values: [
      { valueMm: 1606.2, population: 'kr-male-20-69', percentile: 'mean', n: 4295, source: 'sizekorea8' },
      { valueMm: 1507.24, population: 'kr-male-20-69', percentile: 5, n: 4295, source: 'sizekorea8' },
      { valueMm: 1606.4, population: 'kr-male-20-69', percentile: 50, n: 4295, source: 'sizekorea8' },
      { valueMm: 1702.74, population: 'kr-male-20-69', percentile: 95, n: 4295, source: 'sizekorea8' },
      { valueMm: 1483.98, population: 'kr-female-20-69', percentile: 'mean', n: 5285, source: 'sizekorea8' },
      { valueMm: 1400.03, population: 'kr-female-20-69', percentile: 5, n: 5285, source: 'sizekorea8' },
      { valueMm: 1483.1, population: 'kr-female-20-69', percentile: 50, n: 5285, source: 'sizekorea8' },
      { valueMm: 1572, population: 'kr-female-20-69', percentile: 95, n: 5285, source: 'sizekorea8' },
    ],
  },

  shoulderBreadth: {
    ko: '어깨사이길이', en: 'Shoulder (biacromial) breadth',
    // 포털의 측정 항목 — 이 코드로 다시 물으면 같은 수가 나온다.
    item: { ko: '어깨사이길이', cd: 'S-STa-S-[SD01L~SD01R]-DM' },
    usedBy: ['복도 유효폭', '보도 통행 폭', '군중 밀도'],
    values: [
      { valueMm: 446.68, population: 'kr-male-20-69', percentile: 'mean', n: 4295, source: 'sizekorea8' },
      { valueMm: 406.08, population: 'kr-male-20-69', percentile: 5, n: 4295, source: 'sizekorea8' },
      { valueMm: 446.8, population: 'kr-male-20-69', percentile: 50, n: 4295, source: 'sizekorea8' },
      { valueMm: 488, population: 'kr-male-20-69', percentile: 95, n: 4295, source: 'sizekorea8' },
      { valueMm: 400.53, population: 'kr-female-20-69', percentile: 'mean', n: 5285, source: 'sizekorea8' },
      { valueMm: 365, population: 'kr-female-20-69', percentile: 5, n: 5285, source: 'sizekorea8' },
      { valueMm: 398, population: 'kr-female-20-69', percentile: 50, n: 5285, source: 'sizekorea8' },
      { valueMm: 436.07, population: 'kr-female-20-69', percentile: 95, n: 5285, source: 'sizekorea8' },
    ],
  },

  sittingHeight: {
    ko: '앉은키', en: 'Sitting height',
    // 포털의 측정 항목 — 이 코드로 다시 물으면 같은 수가 나온다.
    item: { ko: '앉은키', cd: 'S-SIb-H-[FL02-HD01]-DM' },
    usedBy: ['책상·의자 검토', '앉은 시야'],
    values: [
      { valueMm: 934.73, population: 'kr-male-20-69', percentile: 'mean', n: 4295, source: 'sizekorea8' },
      { valueMm: 882, population: 'kr-male-20-69', percentile: 5, n: 4295, source: 'sizekorea8' },
      { valueMm: 935, population: 'kr-male-20-69', percentile: 50, n: 4295, source: 'sizekorea8' },
      { valueMm: 986, population: 'kr-male-20-69', percentile: 95, n: 4295, source: 'sizekorea8' },
      { valueMm: 875.79, population: 'kr-female-20-69', percentile: 'mean', n: 5285, source: 'sizekorea8' },
      { valueMm: 827, population: 'kr-female-20-69', percentile: 5, n: 5285, source: 'sizekorea8' },
      { valueMm: 875.4, population: 'kr-female-20-69', percentile: 50, n: 5285, source: 'sizekorea8' },
      { valueMm: 926, population: 'kr-female-20-69', percentile: 95, n: 5285, source: 'sizekorea8' },
    ],
  },

  bodyDepth: {
    ko: '가슴두께', en: 'Chest depth',
    // 포털의 측정 항목 — 이 코드로 다시 물으면 같은 수가 나온다.
    item: { ko: '가슴두께', cd: 'S-STa-D-[CH03]-DM' },
    usedBy: ['군중 밀도', '대기 공간'],
    values: [
      { valueMm: 232.51, population: 'kr-male-20-69', percentile: 'mean', n: 4295, source: 'sizekorea8' },
      { valueMm: 199.96, population: 'kr-male-20-69', percentile: 5, n: 4295, source: 'sizekorea8' },
      { valueMm: 231.5, population: 'kr-male-20-69', percentile: 50, n: 4295, source: 'sizekorea8' },
      { valueMm: 268, population: 'kr-male-20-69', percentile: 95, n: 4295, source: 'sizekorea8' },
      { valueMm: 207.41, population: 'kr-female-20-69', percentile: 'mean', n: 5285, source: 'sizekorea8' },
      { valueMm: 171.26, population: 'kr-female-20-69', percentile: 5, n: 5285, source: 'sizekorea8' },
      { valueMm: 205.8, population: 'kr-female-20-69', percentile: 50, n: 5285, source: 'sizekorea8' },
      { valueMm: 250.47, population: 'kr-female-20-69', percentile: 95, n: 5285, source: 'sizekorea8' },
    ],
  },

  eyeHeightSitting: {
    ko: '앉은눈높이', en: 'Eye height, sitting',
    // 포털의 측정 항목 — 이 코드로 다시 물으면 같은 수가 나온다.
    item: { ko: '앉은눈높이', cd: 'S-SIb-H-[FL02-EY04]-DM' },
    usedBy: ['앉은 시야', '회의실 검토'],
    values: [
      { valueMm: 807.65, population: 'kr-male-20-69', percentile: 'mean', n: 4295, source: 'sizekorea8' },
      { valueMm: 757, population: 'kr-male-20-69', percentile: 5, n: 4295, source: 'sizekorea8' },
      { valueMm: 808, population: 'kr-male-20-69', percentile: 50, n: 4295, source: 'sizekorea8' },
      { valueMm: 858, population: 'kr-male-20-69', percentile: 95, n: 4295, source: 'sizekorea8' },
      { valueMm: 755.03, population: 'kr-female-20-69', percentile: 'mean', n: 5285, source: 'sizekorea8' },
      { valueMm: 709.13, population: 'kr-female-20-69', percentile: 5, n: 5285, source: 'sizekorea8' },
      { valueMm: 755, population: 'kr-female-20-69', percentile: 50, n: 5285, source: 'sizekorea8' },
      { valueMm: 802, population: 'kr-female-20-69', percentile: 95, n: 5285, source: 'sizekorea8' },
    ],
  },

  // ── 아직 못 채운 것 ────────────────────────────────────────
  //
  // 다섯이 채워지면서 **더 좁은 두 구멍**이 드러났다. 지우지 않는다 —
  // 무엇이 없는지가 보여야 다음에 무엇을 받아 올지 정해진다.

  childBodyDims: {
    ko: '어린이·청소년 치수 (7~18세)', en: 'Child and adolescent dimensions',
    pending: '제8차 조사는 20~69세만 잰다 — 포털에 7-12·13-18세를 물으면 0명이 나온다 (2026-09-13 확인). 학교 프로필이 어린이 팩을 세우므로 이 값이 필요하다. 제6차·제7차나 다른 조사에서 받아야 한다',
    usedBy: ['학교 프로필', '어린이 눈높이', '어린이 통행 폭'],
  },

  buttockFlesh: {
    ko: '앉았을 때 엉덩이 살 두께', en: 'Buttock flesh thickness, sitting',
    // 팩의 seat 은 **엉덩이 뼈** 높이다 (어른 0.591~0.610m). 의자 **면**은
    // 그보다 살 두께만큼 아래인데, 그 항목이 사이즈코리아에 없다 — 앉은키·
    // 앉은눈높이·앉은엉덩이배두께는 있지만 이것은 아니다.
    pending: '사이즈코리아 제8차 측정 항목에 없다 (2026-09-13 확인). 팩의 seat.hipHeightM 은 엉덩이 뼈 높이라, 의자 면의 높이를 내려면 이 값이 필요하다 — 다른 출처가 필요하다',
    usedBy: ['의자 면 높이'],
  },
};

/**
 * **팩이 잰 치수와 섞지 않는다.**
 *
 * 카탈로그의 `bodyDims` 는 그 팩의 **몸 하나**를 잰 값이다 (출처가
 * `measured-from-pack` 이다). 여기 DIMENSIONS 는 **모집단 통계**다. 둘은
 * 쓰임이 다르다:
 *
 *   "이 사람이 이 문을 지나가는가"      → 팩의 bodyDims (그 몸의 폭)
 *   "한국 성인 95%가 지나가는 문인가"   → 여기 (통계의 95 백분위)
 *
 * 섞으면 Rocketbox 남자 01 의 어깨가 "한국 남자 평균" 자리에 들어앉는다.
 */

/** 이 치수의 값 하나 — 없으면 null. 없는 것을 0 으로 돌려주지 않는다. */
export function dimensionMm(key, { population, percentile = 'mean' } = {}) {
  const d = DIMENSIONS[key];
  if (!d || !Array.isArray(d.values)) return null;
  const hit = d.values.find(
    (v) => (!population || v.population === population) && String(v.percentile) === String(percentile),
  );
  return hit ? hit.valueMm : null;
}

/** 아직 출처를 못 채운 치수. 게이트가 이 수를 센다. */
export function pendingDimensions() {
  return Object.entries(DIMENSIONS)
    .filter(([, d]) => d.pending)
    .map(([key, d]) => ({ key, need: d.pending, usedBy: d.usedBy || [] }));
}

/** 값이 있는 치수 전부 — 출처 검사용. */
export function allValues() {
  const out = [];
  for (const [key, d] of Object.entries(DIMENSIONS)) {
    for (const v of d.values || []) out.push({ key, ...v });
  }
  return out;
}
