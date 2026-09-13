// 재실자 값 — 사람이 **어떻게 움직이는가**.
//
// 인체치수(anthropometry.mjs)가 "몸이 얼마나 큰가" 라면 이쪽은 "그 몸이 얼마나
// 빨리 가고 언제 움직이기 시작하는가" 다. 피난 시간은 거의 이 두 값으로
// 정해진다.
//
// ## 우리 클립에서 잰 속도를 여기 쓰지 않는다
//
// 팩의 걷기는 1.21m/s(어른) · 0.80m/s(어린이)로 재어져 있다. 그것은
// **그 애니메이션의 속도**이지 모집단 값이 아니다 — Rocketbox 애니메이터가
// 만든 걸음이다. `bodyDims`(잰 몸 하나)와 사이즈코리아(모집단)를 갈라 둔 것과
// 정확히 같은 함정이고, 섞으면 "재실자 보행속도" 자리에 한 애니메이션이
// 들어앉는다.
//
// ## 여기 있는 값은 **미국 소방훈련 관찰값**이다
//
// 한국 값이 아니다. 그리고 **진짜 화재가 아니라 훈련**이다 — 훈련은 대개
// 예고돼 있고, 사람들은 죽지 않는다는 것을 안다. 그 사실을 값마다 적어 둔다.
// 한국 값이 생기면 그때 나란히 둔다.
//
// ## 이 값이 왜 여기 있는가 (urbanspace 가 아니라)
//
// urbanspace 가 보행·교통을 한다. 그런데 "계단에서 노인이 0.28m/s 로
// 내려간다" 는 **사람의 성질**이지 길의 성질이 아니다 — 사이즈코리아를 여기
// 둔 것과 같은 기준이다. 길의 폭·경사가 속도를 어떻게 바꾸는지는 저쪽이다.
//
// 이 파일에는 three.js 도 DOM 도 없다. 값과 규칙만 있다.

/** 아는 출처. 값은 이 키만 가리킬 수 있다 — 오타로 새 출처가 생기지 않게. */
export const OCCUPANT_SOURCES = {
  nistTN1839: {
    ko: 'NIST Technical Note 1839 — 건물 피난 중 계단에서의 이동',
    en: 'NIST TN 1839 — Movement on Stairs During Building Evacuations',
    org: 'NIST (미국 국립표준기술연구소)',
    authors: 'Kuligowski, Peacock, Reneke, Wiess, Hagwood, Overholt, Elkin, Averill, Ronchi, Hoskins, Spearpoint',
    published: '2015-01',
    doi: '10.6028/NIST.TN.1839',
    url: 'https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1839.pdf',
    // **무엇을 잰 것인가** — 이것을 안 적으면 훈련값이 화재값으로 읽힌다.
    what: '건물 14곳(사무실 11 · 주거 3, 6~62층)의 **소방훈련** 피난 관찰. 개별 측정 22,000건 이상',
    caveat: '미국 값이고 **진짜 화재가 아니라 훈련**이다. 훈련은 대개 예고돼 있고 사람들이 위험을 안 느낀다 — 한국 값이 생기면 나란히 둔다',
    fetched: '2026-09-13',
  },
};

/**
 * 값 하나.
 *
 *   value       수
 *   unit        단위 ('m/s' · 's' · 'persons/m2')
 *   population  누구를 잰 것인가
 *   stat        'mean' · 'median' · 'min' · 'max'
 *   plusMinus   문서가 적은 ± 값 (있으면)
 *   spread      그 ± 가 무엇인지 — 문서 표기를 그대로 옮긴다
 *   n           표본 수 (없으면 생략)
 *   source      OCCUPANT_SOURCES 의 키
 *
 * pending 인 항목은 values 없이 `pending: '무엇이 필요한가'` 만 갖는다.
 */
export const OCCUPANT_VALUES = {
  stairSpeedMps: {
    ko: '계단 내려가는 속도', en: 'Stair descent speed',
    usedBy: ['피난 시간', '계단 폭 검토', '요양시설 피난'],
    note: '피난 시간의 지배 구간이다. 우리 팩에는 계단 클립이 0개라, 이 값을 쓰려면 클립부터 있어야 한다.',
    values: [
      { value: 0.44, unit: 'm/s', population: 'us-drill-all', stat: 'mean', plusMinus: 0.19, spread: '문서 표에 Std. Error 로 적혀 있다', n: 5244, source: 'nistTN1839' },
      { value: 0.47, unit: 'm/s', population: 'us-drill-all', stat: 'median', n: 5244, source: 'nistTN1839' },
      { value: 0.07, unit: 'm/s', population: 'us-drill-all', stat: 'min', n: 5244, source: 'nistTN1839' },
      { value: 1.71, unit: 'm/s', population: 'us-drill-all', stat: 'max', n: 5244, source: 'nistTN1839' },

      // **노인 주거 두 곳**(13층 주거 · 6층 노인생활지원시설)에서 따로 쟀다.
      // 전체 평균의 64% 다 — 요양시설 피난을 전체 평균으로 세면 거짓이 된다.
      { value: 0.28, unit: 'm/s', population: 'us-older-adult-housing', stat: 'mean', plusMinus: 0.17, spread: '문서 표기', source: 'nistTN1839' },
      { value: 0.35, unit: 'm/s', population: 'us-older-adult-no-disability', stat: 'mean', plusMinus: 0.17, spread: '문서 표기', source: 'nistTN1839' },
      { value: 0.24, unit: 'm/s', population: 'us-assisted-by-staff', stat: 'mean', plusMinus: 0.13, spread: '문서 표기', source: 'nistTN1839' },
      { value: 0.14, unit: 'm/s', population: 'us-assisted-by-firefighter', stat: 'mean', plusMinus: 0.05, spread: '문서 표기', source: 'nistTN1839' },
      // 계단 이송 장비 — 휠체어를 쓰는 사람이 계단을 내려가는 방법이다.
      { value: 0.20, unit: 'm/s', population: 'us-stair-travel-device', stat: 'mean', plusMinus: 0.04, spread: '문서 표기', n: 34, source: 'nistTN1839' },
    ],
  },

  preObservationDelayS: {
    ko: '관찰 전 지연 시간', en: 'Pre-observation delay time',
    usedBy: ['피난 시간', '경보 뒤 대응'],
    // **이름을 문서 그대로 쓴다.** 흔히 말하는 "대응 시간(pre-movement time)"
    // 이 아니다 — 경보부터 **계단 카메라에 잡힐 때까지**라서, 자리에서
    // 일어나는 시간에 더해 복도를 걸어 계단까지 가는 시간이 들어 있다.
    // 이것을 대응 시간으로 읽으면 피난 시간을 두 번 세게 된다.
    note: '경보부터 계단 카메라에 잡힐 때까지다. 자리에서 일어나는 시간 + 계단까지 가는 시간이 함께 들어 있다 — 흔히 말하는 대응 시간(pre-movement)이 아니다.',
    values: [
      { value: 230, unit: 's', population: 'us-drill-all', stat: 'mean', plusMinus: 53, spread: '문서 표에 Std. Error 로 적혀 있다', n: 5249, source: 'nistTN1839' },
      { value: 170, unit: 's', population: 'us-drill-all', stat: 'median', n: 5249, source: 'nistTN1839' },
      { value: 850, unit: 's', population: 'us-mobility-impaired-stairwell', stat: 'mean', plusMinus: 430, spread: '문서 표기', source: 'nistTN1839' },
      // 노인생활지원시설 한 곳(6층)이 1,660초다 — 전체 평균의 **7.2배**.
      // 소방대원이 계단 이송 장비를 놓고 태우는 시간이 들어 있다.
      { value: 1660, unit: 's', population: 'us-assisted-living-building10', stat: 'mean', source: 'nistTN1839' },
    ],
  },

  peakDensityPerM2: {
    ko: '계단에서의 최대 밀도', en: 'Peak density on stairs',
    usedBy: ['계단 폭 검토', '군중 밀도'],
    values: [
      { value: 1.87, unit: 'persons/m2', population: 'us-drill-all', stat: 'mean', plusMinus: 0.16, spread: '문서 표에 Std. Error 로 적혀 있다', n: 21303, source: 'nistTN1839' },
      { value: 2.04, unit: 'persons/m2', population: 'us-drill-all', stat: 'median', n: 21303, source: 'nistTN1839' },
    ],
  },

  // ── 아직 못 채운 것 ────────────────────────────────────────
  walkSpeedMps: {
    ko: '평지 보행속도', en: 'Level walking speed',
    pending: 'NIST TN 1839 는 계단만 잰다. 평지 값은 SFPE Handbook / BS PD 7974-6 / Weidmann 1993 에 있는데 앞의 둘은 유료 규격이고 ETH 저장소는 이 기계에서 429 가 돌아온다 (2026-09-13 확인). 우리 클립에서 잰 1.21m/s(어른)·0.80m/s(어린이)는 그 애니메이션의 속도이지 모집단 값이 아니므로 쓰지 않는다',
    usedBy: ['복도 통행 시간', '보행 시뮬레이션'],
  },

  preMovementTimeS: {
    ko: '대응 시간 (경보 → 움직이기 시작)', en: 'Pre-movement (response) time',
    // preObservationDelayS 와 **다른 값이다.** 저쪽에는 계단까지 가는 시간이
    // 섞여 있다. 둘을 같은 것으로 쓰면 피난 시간을 두 번 센다.
    pending: '경보부터 자리에서 일어날 때까지만 잰 값이 필요하다. NIST TN 1839 의 preObservationDelayS 에는 계단까지 가는 시간이 섞여 있어 쓸 수 없다. 용도별 값은 BS PD 7974-6 에 있는데 유료 규격이다',
    usedBy: ['피난 시간', '용도별 시나리오'],
  },
};

/**
 * 값 하나 — 없으면 null. **없는 것을 0 으로 돌려주지 않는다.**
 *
 * 없는 보행속도를 0 으로 주면 피난 시간이 무한이 되고, 어림값으로 주면
 * 조용히 거짓이 된다.
 */
export function occupantValue(key, { population, stat = 'mean' } = {}) {
  const d = OCCUPANT_VALUES[key];
  if (!d || !Array.isArray(d.values)) return null;
  const hit = d.values.find((v) => (!population || v.population === population) && v.stat === stat);
  return hit ? hit.value : null;
}

/** 아직 못 채운 값. 게이트가 이 수를 센다. */
export function pendingOccupantValues() {
  return Object.entries(OCCUPANT_VALUES)
    .filter(([, d]) => d.pending)
    .map(([key, d]) => ({ key, need: d.pending, usedBy: d.usedBy || [] }));
}

/** 값이 있는 것 전부 — 출처 검사용. */
export function allOccupantValues() {
  const out = [];
  for (const [key, d] of Object.entries(OCCUPANT_VALUES)) {
    for (const v of d.values || []) out.push({ key, ...v });
  }
  return out;
}
