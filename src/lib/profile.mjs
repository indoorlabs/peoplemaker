// **용도 프로필** — "학교" · "양로원" 이 무엇을 뜻하는가.
//
// 공간 종류가 정해지면 그 안에 **누가 어떤 비율로** 있는지가 따라 정해진다.
// 그것은 건물의 사실이 아니라 **사람에 관한 통계**라, 사이즈코리아 치수를
// 여기 둔 것과 같은 기준으로 이 저장소가 갖는다.
//
// ## 비율을 손으로 적지 않는다
//
// "학생 93%" 를 적으면 그 수가 어디서 왔는지 곧 아무도 모르게 된다. 그래서
// 프로필은 **비(比)만 적고 비율은 우리가 계산한다**:
//
//   mix.weights = { student: 12.1, teacher: 1 }   ← 발표된 수 그대로
//   → student 0.9237 · teacher 0.0763             ← 여기서 나온다
//
// 12.1 은 2025년 교육기본통계의 "교원 1인당 학생 수(초등학교)" 다. 적히는
// 것은 그 수 하나이고, 백분율은 저장 안 한다 — 저장하면 둘이 갈린다.
//
// ## 못 구한 것은 pending 으로 남긴다
//
// 인체치수와 같다. 요양시설의 직원 배치 기준은 법령(노인복지법 시행규칙
// 별표 4)에 있는데 국가법령정보센터가 이 기계에서 안 열린다. 검색 요약에
// 수가 보이지만 그것은 2차 자료다 — 그래서 안 적고 pending 으로 둔다.
// 그동안 쓰는 쪽은 **인원을 직접 주면 된다** (planCast 의 counts) — 어차피
// "이 건물에 몇 명" 은 공간 쪽이 아는 것이다.
//
// 이 파일에는 three.js 도 DOM 도 fs 도 없다. 값과 규칙만 있다 — 프로필
// 파일을 읽는 것은 부르는 쪽이다.

/**
 * 아는 출처.
 *
 * `checked` 는 **이 기계에서 실제로 열어 본 날**이다. 값이 아니라 확인이
 * 오래된 것도 문제가 되므로 함께 적는다.
 */
export const PROFILE_SOURCES = {
  kess2025: {
    ko: '2025년 교육기본통계 (교육부 · 한국교육개발원)',
    en: 'Korean Educational Statistics 2025 (MOE · KEDI)',
    published: '2025-08-28',
    url: 'https://www.kedi.re.kr/khome/main/announce/selectBroadAnnounceForm.do?selectTp=0&board_sq_no=3&article_sq_no=36108',
    checked: '2026-09-13',
  },
};

/** 프로필이 쓸 수 있는 역할 잣대 — cast.mjs 의 WANT_KEYS 와 같은 것을 본다. */

/**
 * 이 프로필의 **비율** — 비에서 계산한다. 못 구한 프로필이면 null.
 *
 * @returns [{ role, share }] 또는 null
 */
export function profileShares(profile) {
  const mix = profile?.mix;
  if (!mix || mix.pending || !mix.weights) return null;
  const roles = (profile.composition || []).map((c) => c.role);
  const w = roles.map((r) => mix.weights[r]);
  if (w.some((v) => !(v > 0))) return null;
  const sum = w.reduce((s, v) => s + v, 0);
  return roles.map((r, i) => ({ role: r, share: w[i] / sum }));
}

/**
 * 프로필이 말이 되는가 — `[{ key, why }]` 로 낸다 (없으면 빈 배열).
 *
 * 게이트가 한 자리씩 일부러 망가뜨려 보므로 **어긋난 자리마다 다른 key** 를
 * 낸다 (person 검사와 같은 규약).
 */
export function profileProblems(profile, { routines = null } = {}) {
  const out = [];
  const bad = (key, why) => out.push({ key, why });
  if (!profile || typeof profile !== 'object') return [{ key: 'shape', why: '프로필이 값이 아니다' }];
  if (!profile.id) bad('id', '이름이 없다');
  if (!profile.ko || !profile.en) bad('name', '이름이 두 언어로 없다');

  const comp = profile.composition;
  if (!Array.isArray(comp) || !comp.length) {
    bad('composition', '구성이 비었다');
    return out;
  }
  const roles = new Set();
  for (const c of comp) {
    if (!c.role) { bad('role', '역할 이름이 없는 줄이 있다'); continue; }
    if (roles.has(c.role)) bad('role/dup', `역할 '${c.role}' 이 두 번 적혔다`);
    roles.add(c.role);
    if (!c.want || typeof c.want !== 'object') bad(`want/${c.role}`, `${c.role} 이 누구를 찾는지가 없다`);
    // **비율을 역할에 손으로 적지 않는다** — 비(mix)에서 나와야 한다.
    if (c.share !== undefined) {
      bad(`share/${c.role}`, `${c.role} 에 비율이 손으로 적혀 있다 (${c.share}) — 비(mix)에서 계산되어야 한다`);
    }
  }

  const mix = profile.mix;
  if (!mix || typeof mix !== 'object') {
    bad('mix', '사람이 어떤 비로 섞이는지가 없다');
  } else if (mix.pending) {
    // 못 구한 것은 **무엇이 필요한지**가 적혀 있어야 한다.
    if (typeof mix.pending !== 'string' || mix.pending.length < 10) {
      bad('mix/pending', '못 구했다면서 무엇이 필요한지를 안 적었다');
    }
    if (mix.weights) bad('mix/both', '못 구했다면서 비를 적어 두었다 — 둘 중 하나다');
  } else {
    if (!PROFILE_SOURCES[mix.source]) {
      bad('mix/source', `출처가 '${mix.source}' 다 — 아는 출처가 아니다 (${Object.keys(PROFILE_SOURCES).join(' · ')})`);
    }
    if (!mix.what) bad('mix/what', '그 비가 무엇을 잰 수인지가 없다');
    const w = mix.weights;
    if (!w || typeof w !== 'object') bad('mix/weights', '비가 없다');
    else {
      for (const r of roles) if (!(w[r] > 0)) bad('mix/weights/role', `역할 '${r}' 의 비가 ${w[r]} 다`);
      for (const k of Object.keys(w)) if (!roles.has(k)) bad('mix/weights/stray', `구성에 없는 역할 '${k}' 의 비가 적혀 있다`);

      // **적힌 수가 출처 문장 안에 있어야 한다.**
      //
      // 이것이 없으면 비를 12.1 에서 9.0 으로 바꿔도 아무 데도 안 걸린다 —
      // 비율은 비에서 계산되니 늘 앞뒤가 맞고, 배역도 그냥 다르게 나뉜다.
      // 게이트를 일부러 깨 보다가 그렇게 뚫렸다. 그래서 저장된 수를 그 수를
      // **인용한 문장**에 묶는다: what 에 12.1 이 없으면 막는다.
      //
      // 1 은 뺀다 — "1인당" 의 그 1 이라 문장에 숫자로 안 나온다.
      if (mix.what) {
        for (const [r, v] of Object.entries(w)) {
          if (v === 1) continue;
          if (!String(mix.what).includes(String(v))) {
            bad('mix/what-number', `'${r}' 의 비 ${v} 가 출처 문장에 없다 — what: "${mix.what}"`);
          }
        }
      }
    }
  }

  // 일과와 이어지는가 — 적어 놓고 없는 일과·없는 역할을 가리키면 안 된다.
  if (profile.routine) {
    if (routines && !routines[profile.routine]) {
      bad('routine', `'${profile.routine}' 라는 일과가 없다`);
    } else if (routines) {
      const parts = routines[profile.routine].parts;
      for (const c of comp) {
        if (c.routinePart && !parts[c.routinePart]) {
          bad(`routine/${c.role}`, `${profile.routine} 에 '${c.routinePart}' 라는 역할이 없다`);
        }
      }
    }
  }
  return out;
}

/**
 * 아직 못 구한 것 — **수를 세려고** 낸다.
 *
 * `pendingDimensions()` 와 같은 규약이다. 빈 자리가 조용히 남지 않게, 게이트가
 * 이 수를 찍는다.
 */
export function pendingProfiles(profiles) {
  return Object.values(profiles || {})
    .filter((p) => p?.mix?.pending)
    .map((p) => ({ id: p.id, need: p.mix.pending }));
}
