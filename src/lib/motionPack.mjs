// Motion Asset Pack — 이 저장소의 **유일한 외부 표면**.
//
// spacemaker 와 urbanspace 가 보는 것은 이 계약뿐이다. 계약이 지켜지는 한
// 안에서 몸 모델을 바꾸든(SMPL-X → Anny) 생성기를 바꾸든(HY-Motion → 다음
// 것) 소비하는 쪽은 안 바뀐다. 그 갈아 끼우기가 이 저장소가 따로 있는
// 이유다 (docs/plan-peoplemaker-ko.md §1).
//
// 이 파일은 three.js 도 PyTorch 도 DOM 도 import 하지 않는다. 값과 규칙만
// 있고, 그래서 게이트가 브라우저 없이 검사한다.

/**
 * 스켈레톤 규약.
 *
 * **팩 하나에 한 벌만 쓴다.** 두 벌이 섞이면 리타게팅이 조용히 깨지는데,
 * 화면에서는 "왜 이 클립만 팔이 이상하지" 로 보인다 — 원인을 찾는 데
 * 며칠이 든다.
 *
 * SMPL-X 토폴로지를 규약으로 삼지 않는 이유: 상업 사용에 서브라이선스가
 * 필요하고(2026-02 Epic 의 Meshcapade 인수로 조건이 불확실), 규약으로
 * 삼는 순간 그 불확실성이 계약에 박힌다. mixamo 본 이름과 VRM 은 도구가
 * 널리 지원하고 라이선스가 걸리지 않는다.
 */
export const SKELETONS = {
  mixamo: 'Mixamo 본 이름 규약 (mixamorig:Hips …) — Blender·three.js·Unreal 이 그대로 읽는다',
  vrm: 'VRM 휴머노이드 본 매핑 — 아바타 교체가 가장 쉽다',
  biped: '3ds Max Biped 본 이름 규약 (Bip01 · Bip02 … — 번호는 장면마다 매겨진다) — Microsoft Rocketbox(MIT) 가 쓴다',
};

/**
 * 루트 모션 정책.
 *
 *   in-place  제자리 — 이동은 쓰는 쪽이 정한다 (경로 따라가기)
 *   travel    클립 자체가 이동한다 — 그러면 **속도를 함께 적어야 한다**
 *
 * travel 인데 속도가 없으면 쓰는 쪽이 속도를 지어낸다. 그 순간 보행 시뮬이
 * 거짓이 된다 — 걷는 그림은 맞는데 도착 시각이 틀리고, 아무도 그것을 못 본다.
 */
export const ROOT_MOTIONS = ['in-place', 'travel'];

/** 접촉 부위 — 공간에 맞출 때 쓰는 기준점. */
export const CONTACT_PARTS = ['foot-l', 'foot-r', 'hip', 'hand-l', 'hand-r', 'back'];

/** 접촉의 종류. */
export const CONTACT_KINDS = ['plant', 'sit', 'touch', 'release'];

/**
 * 이 팩의 사람이 **누구인가** — 배역을 짜는 데 쓴다.
 *
 * ## 이것은 잰 값이 아니라 **적은 값**이다
 *
 * `bodyDims` 는 살을 재서 낸 것이라 출처가 `measured-from-pack` 이다. 이쪽은
 * 사람이 적는다 — 살을 재서 "이 사람은 청소년이다" 를 알아낼 방법이 없기
 * 때문이다 (키 1.7m 인 열일곱 살과 스물일곱 살은 같은 살이다). 손이 닿는
 * 자리에서 **무엇에 닿는지는 사람이 적고 언제 어디까지 뻗는지는 우리가
 * 잰다** 로 나눈 것과 같은 규약이고, 그래서 출처를 `declared-*` 로 둔다.
 *
 * ## 왜 계약에 있어야 하는가
 *
 * "양로원 재실자 100명" 을 받았을 때 누구를 어느 팩에 세울지 답하려면 팩이
 * 제가 누구인지 말할 수 있어야 한다. 지금까지는 `packId` 문자열
 * (`rocketbox-c01`)로 **짐작**할 수밖에 없었는데, 짐작은 이 저장소가 안
 * 하기로 한 것이다.
 *
 * 사람이 아닌 팩(검사용 합성 팩)에는 **안 적는다.** 없으면 배역이 그 팩을
 * 안 쓰고, 안 썼다고 말한다 — 1.55m 짜리 픽스처를 '어른' 이라고 적으면
 * 그 순간 지어낸 값이 하나 는다.
 */
export const AGE_BANDS = {
  child: '어린이 — 초등 또래',
  youth: '청소년 — 중·고 또래',
  adult: '어른',
  'older-adult': '노인',
};

/** 성별. 모르면 적지 말고 unspecified — 몸으로 판정하지 않는다. */
export const SEXES = ['male', 'female', 'unspecified'];

/**
 * 이동 방식.
 *
 * `walk` 가 아닌 몸은 **디딤(plant) 규칙이 그대로 안 맞는다** — 접촉이 발이
 * 아니라 바퀴이거나 지팡이 끝이다. 그런 팩이 들어오면 재는 쪽을 손봐야
 * 하고, 지금은 그런 팩이 0개다 (게이트가 그 0 을 센다).
 */
export const MOBILITIES = {
  walk: '제 발로 걷는다',
  cane: '지팡이',
  walker: '보행보조기',
  wheelchair: '휠체어',
};

/** 옷차림 — 배역이 "교복 입은 학생" 을 고를 수 있게. */
export const ATTIRES = ['casual', 'business', 'uniform', 'care-worker'];

/**
 * 이 값을 **누가 적었는가**. 잰 값(`measured-from-pack`)과 절대 안 섞인다.
 */
export const PERSON_SOURCES = [
  'declared-by-import',  // 수입 스크립트의 PRESETS 에 적혀 있었다
  'declared-by-hand',    // 사람이 sources.json 에 직접 적었다
];

/** 손에 들 수 있는 것 — 적는 값이다 (살을 봐서 알 수 없다). */
export const HELD_THINGS = ['bag', 'trolley', 'umbrella', 'newspaper', 'document', 'cup', 'phone'];

/** 어느 손으로 드는가. */
export const HELD_HANDS = ['left', 'right', 'both'];

/**
 * 양손으로 잡았다면 두 손 사이가 이만큼 넘게 흔들리면 안 된다 (m).
 *
 * **이 값은 증명이 아니라 반증이다.** "양손으로 잡으면 두 손 사이가 안
 * 흔들린다" 로 가르려 했는데, 재 보니 카트(양손 0.111)와 뛰기(빈손 0.111)가
 * 똑같았다 — 이 값으로 양손인지 **가릴 수는 없다.** 다만 한 손이 따로 노는
 * 동작은 확실히 더 흔들리므로, 그 사이에 문턱을 둔다.
 *
 * 팩 여덟을 재서 골랐다:
 *
 * ```
 *   양손이라 적은 것     신문 0.015~0.020 · 카트 0.098~0.145   ← 가장 큰 것 0.145
 *   한 손이 따로 노는 것  서류 0.254~0.340 · 마시기 0.309~0.395
 *                       손 흔들기 0.577~0.735                 ← 가장 작은 것 0.254
 * ```
 *
 * 처음에 여자 01 하나만 보고 0.12 로 뒀더니 **남자 팩 넷의 빌드가 멈췄다**
 * (남자 카트가 0.145 로 더 흔들린다). 한 팩으로 문턱을 정하면 그렇게 된다.
 */
export const BOTH_HANDS_SPREAD_MAX = 0.20;

/**
 * 적힌 사람 정보가 말이 되는가 — `[{ key, why }]` 로 낸다 (없으면 빈 배열).
 *
 * 어긋난 자리마다 **다른 key** 를 내는 것이 중요하다. 게이트가 한 군데씩
 * 일부러 망가뜨려 보는데, 전부 같은 이름으로 실패하면 "무엇을 깨도 걸린다"
 * 가 되어 정작 어느 검사가 살아 있는지 모르게 된다.
 */
export function personProblems(person) {
  const out = [];
  const bad = (key, why) => out.push({ key, why });
  if (!person || typeof person !== 'object') return [{ key: 'shape', why: '사람 정보가 값이 아니다' }];
  if (!PERSON_SOURCES.includes(person.source)) {
    bad('source', `출처가 '${person.source}' 다 — 적은 값이므로 ${PERSON_SOURCES.join(' 또는 ')} 여야 한다 (잰 값과 안 섞는다)`);
  }
  if (!AGE_BANDS[person.ageBand]) bad('ageBand', `나이대가 '${person.ageBand}' 다 (${Object.keys(AGE_BANDS).join(' · ')})`);
  if (!SEXES.includes(person.sex)) bad('sex', `성별이 '${person.sex}' 다 (${SEXES.join(' · ')})`);
  if (!MOBILITIES[person.mobility]) bad('mobility', `이동 방식이 '${person.mobility}' 다 (${Object.keys(MOBILITIES).join(' · ')})`);
  if (!ATTIRES.includes(person.attire)) bad('attire', `옷차림이 '${person.attire}' 다 (${ATTIRES.join(' · ')})`);
  return out;
}

/**
 * 라이선스 — **클립마다** 적는다.
 *
 * 팩 전체에 한 줄로 뭉뚱그리면, 나중에 한 출처가 문제가 됐을 때 어느 클립을
 * 빼야 하는지 아무도 모른다. spacemaker 의 DAWA 가 CC-BY 자산을
 * ATTRIBUTIONS.md 에 따로 적는 것과 같은 이유이고, 여기서는 그것을 손이
 * 아니라 계약이 강제한다.
 *
 * `commercial` 이 이 필드의 요점이다 — 쓸 수 있는지를 사람이 기억하지 않게 한다.
 */
export const LICENSES = {
  'CC0-1.0': { commercial: true, attribution: false },
  'CC-BY-4.0': { commercial: true, attribution: true },
  'CC-BY-SA-4.0': { commercial: true, attribution: true, shareAlike: true },
  'CC-BY-NC-4.0': { commercial: false, attribution: true },
  'Apache-2.0': { commercial: true, attribution: true },
  'MIT': { commercial: true, attribution: true },
  // Tencent Hunyuan Community — HY-Motion 1.0 이 이것이다. 상업 사용을
  // 허용하되 조건이 붙는다(사용자 수 상한 등). 조건이 있다는 사실을 값으로
  // 남긴다.
  'Tencent-Hunyuan-Community': { commercial: true, attribution: true, conditions: true },
  // Mixamo — Adobe 계정으로 무료 사용. 오픈소스 라이선스가 **아니다**.
  // 재배포가 금지되므로 팩을 공개할 때 이 클립은 빠져야 한다.
  'Adobe-Mixamo': { commercial: true, attribution: false, redistributable: false },
  // 출처가 사람의 실측(모션 캡처)인 경우. 개인정보가 섞일 수 있다.
  'internal-capture': { commercial: true, attribution: false, personalData: true },
};

/** 팩이 공개 배포 가능한가 — 재배포 금지 클립이 하나라도 있으면 안 된다. */
export function packRedistributable(catalog) {
  const clips = catalog?.clips || [];
  if (!clips.length) return false;
  return clips.every((c) => LICENSES[c.license]?.redistributable !== false);
}

/** 상업 사용 가능한 클립만. */
export function commercialClips(catalog) {
  return (catalog?.clips || []).filter((c) => LICENSES[c.license]?.commercial === true);
}

/**
 * 카탈로그를 검사한다.
 *
 * **던지지 않고 결함 목록을 돌려준다.** 게이트가 이것을 그대로 세고, 파이프
 * 라인은 내보내기 전에 부른다 — 같은 함수 하나가 두 자리를 지킨다.
 *
 * @returns [{ id, msg }] — 비어 있으면 통과
 */
export function validateCatalog(catalog, { clipFiles = null, packFiles = null } = {}) {
  const out = [];
  const fail = (id, msg) => out.push({ id, msg });

  if (!catalog || typeof catalog !== 'object') {
    fail('catalog/none', '카탈로그가 객체가 아니다');
    return out;
  }
  if (!catalog.packId) fail('catalog/packId', '팩 이름이 없다');
  if (!catalog.version) fail('catalog/version', '판 번호가 없다 — 소비처가 무엇을 받았는지 못 적는다');
  if (!SKELETONS[catalog.skeleton]) {
    fail('catalog/skeleton', `스켈레톤 규약이 '${catalog.skeleton}' 이다 — ${Object.keys(SKELETONS).join(' 또는 ')} 여야 한다`);
  }

  // **언제 · 어느 커밋으로 구운 사본인가.** 없어도 된다 — 이것이 생기기 전에
  // 구운 팩이 소비처에서 돌고 있고, 그것을 거부하면 그 화면이 통째로 막힌다.
  // 다만 **적혀 있으면 읽을 수 있는 꼴**이어야 한다. 아무 글이나 들어가면
  // 사본이 낡았는지 가리는 데 못 쓴다.
  if (catalog.builtAt !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(catalog.builtAt)) {
    fail('catalog/builtAt', `구운 날짜가 '${catalog.builtAt}' 다 — YYYY-MM-DD 여야 한다`);
  }
  if (catalog.builtFrom !== undefined && !/^[0-9a-f]{7,40}(-dirty)?$/.test(catalog.builtFrom)) {
    fail('catalog/builtFrom', `구운 커밋이 '${catalog.builtFrom}' 다 — git 해시여야 한다`);
  }

  // 몸이 따로인 팩. 이름만 적고 파일이 없으면 받는 쪽이 살 없는 동작만 쥔다.
  // 먼 사람용 몸 — **단계 목록**이다 (덜 줄인 것부터). 있으면 무엇을 얼마로
  // 줄였는지가 함께 있어야 한다. 그 수가 없으면 소비처는 "이것이 진짜 그
  // 사람인가" 를 알 길이 없다.
  if (catalog.bodyFar !== undefined) {
    if (!Array.isArray(catalog.bodyFar) || !catalog.bodyFar.length) {
      fail('catalog/bodyFar', '먼 몸이 단계 목록이 아니다');
    } else {
      let prev = Infinity;
      const seen = new Set();
      for (const [i, f] of catalog.bodyFar.entries()) {
        const tag = `catalog/bodyFar/${i}`;
        if (typeof f?.file !== 'string' || !/^[\w.-]+\.glb$/.test(f.file)) {
          fail(`${tag}/file`, `먼 몸 파일 이름이 '${f?.file}' 다`);
        } else if (packFiles && !packFiles.includes(f.file)) {
          fail(`${tag}/missing`, `${f.file} 가 없다`);
        } else if (seen.has(f.file)) {
          fail(`${tag}/dup`, `${f.file} 가 두 번 있다`);
        } else seen.add(f.file);
        if (!(f?.ratio > 0 && f.ratio <= 1)) fail(`${tag}/ratio`, `줄인 비율이 ${f?.ratio} 다`);
        else if (!(f.ratio < prev)) {
          fail(`${tag}/order`, `단계가 덜 줄인 것부터가 아니다 (${prev} 다음에 ${f.ratio})`);
        } else prev = f.ratio;
        if (!(f?.vertices > 0) || !(f?.triangles > 0)) {
          fail(`${tag}/size`, `정점 ${f?.vertices} · 삼각형 ${f?.triangles} 다`);
        } else if (f.from && !(f.vertices < f.from.vertices)) {
          fail(`${tag}/smaller`, `줄였다면서 정점이 ${f.from.vertices} → ${f.vertices} 다`);
        }
      }
    }
  }

  // **이 팩의 사람이 누구인가** — 적는 값이다. 없어도 되지만(사람이 아닌
  // 픽스처 팩), 있으면 아는 낱말이어야 한다. 배역이 이것으로 고른다.
  if (catalog.person !== undefined) {
    for (const { key, why } of personProblems(catalog.person)) {
      fail(`catalog/person/${key}`, why);
    }
  }

  // **출처 선언** — 표기가 필요한 라이선스의 클립이 어디서 왔는가.
  //
  // 고지문을 여기 글로 적지 않고 `licenses/` 의 파일을 가리킨다. MIT 는
  // "위 저작권 고지를 **그대로** 포함하라" 고 하는데, 옮겨 적으면 갈린다 —
  // 실제로 팩의 note 에 "Copyright (c) Microsoft Corporation" 이라고 적혀
  // 있었고 원문은 "Copyright (c) 2020 Microsoft" 였다 (2026-09-13 확인).
  //
  // 표기가 정말 다 채워졌는지는 lib/attribution.mjs 가 본다 (여기서 부르면
  // 순환 import 가 된다 — 그 파일이 LICENSES 를 쓴다).
  if (catalog.origins !== undefined) {
    if (!Array.isArray(catalog.origins)) fail('catalog/origins', '출처 선언이 배열이 아니다');
    else {
      for (const o of catalog.origins) {
        const at = `catalog/origins/${o?.tool || '?'}`;
        if (!o?.tool) fail(`${at}/tool`, '어느 도구·저장소에서 온 것인지가 없다');
        if (!LICENSES[o?.license]) fail(`${at}/license`, `라이선스가 '${o?.license}' 다`);
        if (!o?.ko || !o?.en) fail(`${at}/name`, '이름이 두 언어로 없다');
        if (!o?.url || !/^https:/.test(o.url)) fail(`${at}/url`, `주소가 '${o?.url}' 다`);
        if (!o?.noticeFile || !String(o.noticeFile).startsWith('licenses/')) {
          fail(`${at}/notice`, `고지문 파일이 '${o?.noticeFile}' 다 — licenses/… 를 가리켜야 한다`);
        }
        if (o?.notice || o?.text) fail(`${at}/inline`, '고지문을 글로 옮겨 적어 두었다 — 파일을 가리킬 것');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(o?.checked || '')) fail(`${at}/checked`, `원문을 확인한 날이 '${o?.checked}' 다`);
      }
    }
  }

  // **장비를 다루는 클립** — 무엇을 들고 있는가(적는 값)와 손이 어디에
  // 있는가(잰 값).
  //
  // 무엇을 들었는지는 살을 봐서 알 수 없다 — 카트인지 유모차인지는 사람이
  // 적는다. 두 손 사이 거리는 **증명은 못 하고 반증만 한다**: 카트(양손)와
  // 뛰기(빈손)가 똑같이 0.111m 흔들려서 양손인지 가릴 수가 없다. 다만 크게
  // 흔들리면 양손일 수 **없다** (서류 보기 0.34 · 마시기 0.31 은 한 손이
  // 따로 논다). 그래서 "양손" 이라 적혔는데 문턱을 넘으면 막는다.
  for (const c of catalog.clips || []) {
    if (c.holds !== undefined) {
      const hd = c.holds;
      if (!hd || typeof hd !== 'object') {
        fail(`clip/${c.id}/holds`, '드는 것이 값이 아니다');
      } else {
        if (!HELD_THINGS.includes(hd.what)) {
          fail(`clip/${c.id}/holds/what`, `'${hd.what}' 는 아는 것이 아니다 (${HELD_THINGS.join(' · ')})`);
        }
        if (!HELD_HANDS.includes(hd.hand)) {
          fail(`clip/${c.id}/holds/hand`, `어느 손인지가 '${hd.hand}' 다 (${HELD_HANDS.join(' · ')})`);
        }
      }
    }
    if (c.grip === undefined) continue;
    const gr = c.grip;
    if (!gr || typeof gr !== 'object') { fail(`clip/${c.id}/grip`, '잡은 자리가 값이 아니다'); continue; }
    if (!c.holds) fail(`clip/${c.id}/grip/why`, '무엇을 드는지 안 적었는데 잡은 자리만 재어져 있다');
    if (!gr.bones || !gr.bones['hand-l'] || !gr.bones['hand-r']) {
      fail(`clip/${c.id}/grip/bones`, '붙일 뼈 이름이 없다 — 쓰는 쪽이 물건을 못 맨다');
    }
    if (!(gr.spanM > 0)) fail(`clip/${c.id}/grip/span`, `두 손 사이가 ${gr.spanM}m 다`);
    if (!(gr.spanSpreadM >= 0)) fail(`clip/${c.id}/grip/spread`, `두 손 사이가 흔들리는 폭이 ${gr.spanSpreadM}m 다`);
    if (!(gr.heightM > 0)) fail(`clip/${c.id}/grip/height`, `손 높이가 ${gr.heightM}m 다`);
    if (c.holds && c.holds.hand === 'both' && gr.spanSpreadM > BOTH_HANDS_SPREAD_MAX) {
      fail(`clip/${c.id}/grip/both`, `양손으로 잡는다는데 두 손 사이가 ${gr.spanSpreadM}m 흔들린다 (${BOTH_HANDS_SPREAD_MAX}m 넘음)`);
    }
  }

  // **섬네일** — 클립이 무슨 동작인지 보이는 그림 하나. 그린 그림이 아니라
  // 구운 자세에 살을 붙여 **잰** 그림이다 (lib/thumbnail.mjs). 있으면 팩 안의
  // 파일을 가리켜야 하고, 없는 파일을 가리키면 받는 쪽이 빈 칸을 본다.
  for (const c of catalog.clips || []) {
    if (c.thumb === undefined) continue;
    if (typeof c.thumb !== 'string' || !c.thumb.startsWith('thumbs/') || !c.thumb.endsWith('.svg')) {
      fail(`clip/${c.id}/thumb`, `섬네일이 '${c.thumb}' 다 — thumbs/<id>.svg 여야 한다`);
    } else if (c.thumb !== `thumbs/${c.id}.svg`) {
      fail(`clip/${c.id}/thumb/name`, `섬네일 이름이 '${c.thumb}' 인데 클립은 '${c.id}' 다 — 엉뚱한 그림을 보게 된다`);
    } else if (packFiles && !packFiles.includes(c.thumb)) {
      fail(`clip/${c.id}/thumb/file`, `${c.thumb} 가 팩에 없다`);
    }
  }

  // 이 몸을 잰 치수 — 있으면 말이 되어야 하고, **출처가 그렇게 적혀** 있어야
  // 한다. 사이즈코리아 통계와 섞이면 "한국 남자 평균" 자리에 이 몸 하나가
  // 들어앉는다.
  if (catalog.bodyDims !== undefined) {
    const d = catalog.bodyDims;
    if (!d || typeof d !== 'object') fail('catalog/bodyDims', '몸 치수가 값이 아니다');
    else {
      if (d.source !== 'measured-from-pack') {
        fail('catalog/bodyDims/source', `출처가 '${d.source}' 다 — 이 값은 이 몸을 잰 것이지 모집단 통계가 아니다`);
      }
      if (!(d.heightM > 0.3 && d.heightM < 3)) fail('catalog/bodyDims/height', `키가 ${d.heightM}m 다`);
      if (!(d.widthM > 0)) fail('catalog/bodyDims/width', `폭이 ${d.widthM}m 다`);
      if (!(d.depthM > 0)) fail('catalog/bodyDims/depth', `두께가 ${d.depthM}m 다`);
      if (d.heightM > 0 && !(d.widthM < d.heightM)) {
        fail('catalog/bodyDims/shape', `폭 ${d.widthM}m 가 키 ${d.heightM}m 보다 좁지 않다 — 서 있는 사람이 아니다`);
      }
      if (d.eyeHeightM !== undefined && !(d.eyeHeightM > 0 && d.eyeHeightM < d.heightM)) {
        fail('catalog/bodyDims/eye', `눈높이가 ${d.eyeHeightM}m 다 (키 ${d.heightM}m)`);
      }
      // **걷는다고 늘 넓어지지는 않는다.** 처음에 "걸을 때가 더 넓다" 를
      // 계약으로 박았다가 남자 팩 넷이 걸렸다 — 선 자세에서 팔이 몸에서
      // 떨어져 있어 그쪽이 더 넓다 (0.586 vs 0.573m). 둘 다 잰 값이고,
      // 복도를 검토하는 쪽은 **큰 쪽**을 쓴다.
      if (d.walkWidthM !== undefined && !(d.walkWidthM > 0)) {
        fail('catalog/bodyDims/walk', `걸을 때 폭이 ${d.walkWidthM}m 다`);
      }
      if (!d.pose) fail('catalog/bodyDims/pose', '어느 자세에서 잰 값인지가 없다');
    }
  }

  if (catalog.body !== undefined) {
    if (typeof catalog.body !== 'string' || !/^[\w.-]+\.glb$/.test(catalog.body)) {
      fail('catalog/body', `몸 파일 이름이 '${catalog.body}' 다 — 팩 폴더 안의 .glb 여야 한다`);
    } else if (packFiles && !packFiles.includes(catalog.body)) {
      fail('catalog/body-file', `${catalog.body} 가 없다`);
    }
  }

  const clips = catalog.clips;
  if (!Array.isArray(clips)) { fail('catalog/clips', '클립 목록이 배열이 아니다'); return out; }
  if (!clips.length) fail('catalog/empty', '클립이 하나도 없다');

  const seen = new Set();
  for (const c of clips) {
    const at = c?.id || '(이름 없음)';
    if (!c?.id) { fail('clip/id', '클립에 id 가 없다'); continue; }
    if (seen.has(c.id)) fail(`clip/${c.id}/dup`, '같은 id 가 둘 이상이다');
    seen.add(c.id);

    // 이름 — 사람이 고르는 목록에 뜬다. 두 언어를 요구하는 것은 소비처가
    // 4개 로케일을 쓰기 때문이다(spacemaker i18n).
    if (!c.name?.ko || !c.name?.en) fail(`clip/${c.id}/name`, '이름이 ko·en 둘 다 있어야 한다');

    if (!(c.durationS > 0)) fail(`clip/${c.id}/duration`, `길이가 ${c.durationS} 다`);

    if (!ROOT_MOTIONS.includes(c.rootMotion)) {
      fail(`clip/${c.id}/rootMotion`, `루트 모션이 '${c.rootMotion}' 이다 — ${ROOT_MOTIONS.join('|')} 여야 한다`);
    }
    // **여기가 계약의 핵심 중 하나다.** travel 인데 속도가 없으면 쓰는 쪽이
    // 지어낸다 — 걷는 그림은 맞는데 도착 시각이 틀린다.
    if (c.rootMotion === 'travel' && !(c.speedMps > 0)) {
      fail(`clip/${c.id}/speed`, '이동하는 클립인데 속도(speedMps)가 없다 — 쓰는 쪽이 속도를 지어내게 된다');
    }
    if (c.rootMotion === 'in-place' && c.speedMps) {
      fail(`clip/${c.id}/speed-inplace`, '제자리 클립에 이동 속도가 적혀 있다 — 둘 중 하나가 거짓이다');
    }
    // 속도만 있고 **방향**이 없으면 쓰는 쪽이 "앞은 +Z 겠지" 하고 짐작한다.
    // 짐작이 틀리면 사람들이 전부 뒤로 걷는데, 걷는 그림은 멀쩡해서 한참
    // 못 알아챈다 — 실제로 그렇게 한 번 지나갔다.
    if (c.rootMotion === 'travel' && typeof c.travelHeadingRad !== 'number') {
      fail(`clip/${c.id}/travelHeading`, '이동하는 클립인데 진행 방향(travelHeadingRad)이 없다');
    }
    if (c.rootMotion === 'in-place' && c.travelHeadingRad !== undefined) {
      fail(`clip/${c.id}/travelHeading-inplace`, '제자리 클립에 진행 방향이 적혀 있다 — 둘 중 하나가 거짓이다');
    }

    // 라이선스 — 팩 전체가 아니라 클립마다.
    if (!c.license) fail(`clip/${c.id}/license`, '라이선스가 없다');
    else if (!LICENSES[c.license]) fail(`clip/${c.id}/license-unknown`, `'${c.license}' 는 아는 라이선스가 아니다 — 표에 먼저 넣을 것`);
    if (!c.source?.tool) fail(`clip/${c.id}/source`, '무엇으로 만들었는지가 없다 (source.tool)');

    // 접촉 이벤트 — 가구·문에 맞출 때 쓰는 값이다.
    for (const [i, ev] of (c.contacts || []).entries()) {
      const tag = `clip/${c.id}/contact${i}`;
      if (!CONTACT_PARTS.includes(ev?.part)) fail(`${tag}/part`, `접촉 부위가 '${ev?.part}' 다`);
      if (!CONTACT_KINDS.includes(ev?.kind)) fail(`${tag}/kind`, `접촉 종류가 '${ev?.kind}' 다`);
      if (!(ev?.atS >= 0)) fail(`${tag}/at`, `시각이 ${ev?.atS} 다`);
      else if (c.durationS > 0 && ev.atS > c.durationS) {
        fail(`${tag}/range`, `시각 ${ev.atS}s 가 길이 ${c.durationS}s 를 넘는다 — 가구에 안 앉고 허공에 앉는다`);
      }
    }

    // 앉은 값 — 있으면 말이 되어야 한다. 앉으면 엉덩이가 **쉬는 자세보다
    // 낮다**. 1 을 넘는 값이 들어오면 재는 쪽이 뒤집힌 것이고, 그대로 두면
    // 공간 쪽이 천장에 의자를 놓는다.
    if (c.seat) {
      const tag = `clip/${c.id}/seat`;
      if (!(c.seat.hipHeightM > 0)) fail(`${tag}/height`, `앉은 엉덩이 높이가 ${c.seat.hipHeightM} 다`);
      if (!(c.seat.hipRatio > 0 && c.seat.hipRatio < 1)) {
        fail(`${tag}/ratio`, `앉은 높이가 쉬는 자세의 ${c.seat.hipRatio} 배다 — 앉으면 낮아져야 한다`);
      }
      if (typeof c.seat.groundOffsetM !== 'number') {
        fail(`${tag}/ground`, '이 클립의 바닥(groundOffsetM)이 없다 — 놓는 쪽이 발을 어디에 둘지 모른다');
      }
      // 앉으면 발이 엉덩이 앞으로 나간다. 안 나가 있으면 쪼그린 것이고,
      // 거기에 의자를 놓으면 안 된다.
      if (!(c.seat.feetForwardM > 0)) {
        fail(`${tag}/feet`, `발이 엉덩이 앞으로 ${c.seat.feetForwardM} 나가 있다 — 앉은 자세가 아니다`);
      }
    }

    // 손이 닿는 자리 — 있으면 말이 되어야 한다. 이 값으로 공간 쪽이 손잡이를
    // 놓는다. 높이가 0 이거나 닿기 전에 떼면 그 자리는 문이 아니다.
    if (c.reach) {
      const tag = `clip/${c.id}/reach`;
      if (!CONTACT_PARTS.includes(c.reach.part)) fail(`${tag}/part`, `닿는 부위가 '${c.reach.part}' 다`);
      if (!(c.reach.heightM > 0)) fail(`${tag}/height`, `손 높이가 ${c.reach.heightM} 다`);
      if (!(c.reach.forwardM > 0)) fail(`${tag}/forward`, `앞으로 ${c.reach.forwardM} 나갔다고 한다`);
      if (!(c.reach.releaseS > c.reach.atS)) {
        fail(`${tag}/order`, `${c.reach.atS}s 에 닿아 ${c.reach.releaseS}s 에 뗀다 — 떼는 것이 먼저다`);
      }
      if (c.durationS > 0 && c.reach.releaseS > c.durationS + 1e-6) {
        fail(`${tag}/range`, `떼는 시각 ${c.reach.releaseS}s 가 길이 ${c.durationS}s 를 넘는다`);
      }
    }

    // 파일이 실제로 있는가. 목록을 받은 경우에만 본다 — 순수 층은 파일을
    // 읽지 않는다.
    if (clipFiles && !clipFiles.includes(`${c.id}.glb`)) {
      fail(`clip/${c.id}/file`, `clips/${c.id}.glb 가 없다`);
    }
  }

  // 이동 클립이 있으면 팩의 **앞**이 있어야 한다. 어댑터가 이 값으로
  // 회전을 보정하는데, 없으면 보정을 건너뛰고 리그의 사정이 그대로 화면에
  // 나온다.
  if (clips.some((c) => c?.rootMotion === 'travel') && typeof catalog.forwardRad !== 'number') {
    fail('catalog/forwardRad', '이동 클립이 있는데 팩의 앞(forwardRad)이 없다 — 다시 구워야 한다');
  }

  // 카탈로그에 없는 파일이 폴더에 있으면, 그것은 아무도 모르는 자산이다.
  if (clipFiles) {
    for (const f of clipFiles) {
      const id = f.replace(/\.glb$/, '');
      if (!seen.has(id)) fail(`file/${id}/orphan`, `clips/${f} 가 카탈로그에 없다`);
    }
  }

  return out;
}

/**
 * 나뉜 팩의 **파일 내용**이 약속대로인가 — 몸에는 살이, 동작에는 뼈 움직임만.
 *
 * 동작 파일에 몸이 다시 들어가면 나눈 뜻이 없어진다 (사람 하나가 46MB 로
 * 돌아간다). 동작이 몸에 없는 뼈를 움직이면 three 는 그 트랙을 조용히 버린다 —
 * 그 사람은 서서 굳는다. 둘 다 화면으로는 늦게 알게 되므로 여기서 잡는다.
 *
 * @param body   parseGLB 결과
 * @param clips  [{ id, doc }] — parseGLB 결과
 * @returns [{ id, msg }]
 */
export function validateSplitFiles(body, clips) {
  const out = [];
  const fail = (id, msg) => out.push({ id, msg });
  const j = body?.json || {};
  if (!(j.meshes || []).length) fail('body/mesh', '몸에 메시가 없다');
  if (!(j.skins || []).length) fail('body/skin', '몸에 스킨이 없다 — 뼈를 움직여도 살이 안 따라온다');
  if ((j.animations || []).length) fail('body/animation', '몸에 애니메이션이 들어 있다 — 동작은 clips/ 에 둔다');
  const names = new Set((j.nodes || []).map((n) => n.name).filter(Boolean));
  for (const { id, doc } of clips) {
    const c = doc?.json || {};
    if ((c.meshes || []).length) fail(`clip/${id}/mesh`, '동작 파일에 메시가 있다 — 몸이 다시 들어갔다');
    if ((c.images || []).length) fail(`clip/${id}/image`, '동작 파일에 그림이 있다');
    if ((c.skins || []).length) fail(`clip/${id}/skin`, '동작 파일에 스킨이 있다');
    const anim = (c.animations || [])[0];
    if (!anim || !anim.channels?.length) { fail(`clip/${id}/animation`, '동작 파일에 애니메이션이 없다'); continue; }
    const missing = new Set();
    for (const ch of anim.channels) {
      const nm = c.nodes?.[ch.target.node]?.name;
      if (!nm || !names.has(nm)) missing.add(nm || `#${ch.target.node}`);
    }
    if (missing.size) {
      fail(`clip/${id}/names`, `몸에 없는 뼈 ${missing.size}개를 움직인다 (${[...missing].slice(0, 3).join(', ')}) — three 가 그 트랙을 버린다`);
    }
  }
  return out;
}
