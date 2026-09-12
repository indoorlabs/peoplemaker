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

  // 몸이 따로인 팩. 이름만 적고 파일이 없으면 받는 쪽이 살 없는 동작만 쥔다.
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
