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
    // 평균 키는 보도자료로 확인됐다. 세부 항목의 백분위는 포털에서 받아야
    // 한다 — 그것이 P0 의 남은 일이다.
    note: '세부 백분위는 포털 내려받기 필요',
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
  // ── 확인된 것 ──────────────────────────────────────────────
  stature: {
    ko: '키', en: 'Stature',
    values: [
      // 제8차 조사 평균. 성인 전체 평균이며 연령대별이 아니다 —
      // percentile 을 50 이 아니라 'mean' 으로 적는 이유가 그것이다.
      { valueMm: 1725, population: 'kr-male-adult', percentile: 'mean', source: 'sizekorea8' },
      { valueMm: 1596, population: 'kr-female-adult', percentile: 'mean', source: 'sizekorea8' },
    ],
  },

  // ── 아직 못 채운 것 ────────────────────────────────────────
  //
  // 지우지 않는다. 무엇이 없는지가 보여야 다음에 무엇을 받아 올지 정해진다.
  eyeHeight: {
    ko: '눈높이', en: 'Eye height',
    pending: '사이즈코리아 포털에서 성별·연령대별 백분위를 받아야 한다. 키에서 비율로 만들지 말 것',
    usedBy: ['시야 검토', '창 높이', '사이니지 높이'],
  },
  shoulderBreadth: {
    ko: '어깨너비', en: 'Shoulder (biacromial) breadth',
    pending: '사이즈코리아 포털. 통행 폭 검토는 95 백분위를 써야 한다',
    usedBy: ['복도 유효폭', '보도 통행 폭', '군중 밀도'],
  },
  sittingHeight: {
    ko: '앉은키', en: 'Sitting height',
    pending: '사이즈코리아 포털',
    usedBy: ['책상·의자 검토', '앉은 시야'],
  },
  bodyDepth: {
    ko: '몸통 두께', en: 'Body depth',
    pending: '사이즈코리아 포털. 군중 밀도(m²/인)의 바닥이 되는 값',
    usedBy: ['군중 밀도', '대기 공간'],
  },
  eyeHeightSitting: {
    ko: '앉은 눈높이', en: 'Eye height, sitting',
    pending: '사이즈코리아 포털',
    usedBy: ['앉은 시야', '회의실 검토'],
  },
};

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
