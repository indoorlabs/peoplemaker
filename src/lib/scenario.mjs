// **시나리오** — "학교 화재 대피" 를 돌리기 전에 **이게 되는지** 묻는다.
//
// 이 파일이 하는 일은 계산이 아니라 **거절**이다. 지금까지 쌓은 층(배역 ·
// 일과 · 활동 · 클립 · 재실자 값)마다 "없으면 없다고 말한다" 를 지켜 왔는데,
// 그 말들이 다섯 군데에 흩어져 있어서 쓰는 쪽이 다 물어보지 않으면 못 듣는다.
// 여기서 한 번에 묻고 **한 장으로** 낸다.
//
// ## 시나리오는 cue 의 대본이다
//
// 시각도, 방도, 자리도 없다. 있는 것은 "이 신호를 받으면 누가 무엇으로
// 갈아타는가" 뿐이다:
//
//   { on: 'cue:alarm', who: 'all', switchTo: 'evacuate' }
//
// 언제 경보가 울리는지, 어느 계단이 막혔는지는 공간 쪽이 안다.
//
// ## `who` 에 방 이름을 못 쓴다
//
// 계획 초안에는 `who: 'group:east-wing'` 이 있었다 — **그것은 건물의 사실
// 이지 사람의 사실이 아니다.** 동쪽 부속동이 어디인지 이 저장소는 모르고,
// 알기 시작하면 spacemaker 를 두 벌 만들게 된다. 그래서 `who` 는 `'all'`
// 이거나 `'role:학생'` 처럼 **프로필의 역할**만 가리킨다. 건물의 일부만
// 갈아태우려면 쓰는 쪽이 사람 번호를 골라 넘기면 된다.
//
// ## 거짓 답을 내느니 못 낸다고 한다
//
// 계단 클립이 0개인 채로 피난 시간을 내면 그 수는 거짓이다 — 계단이 피난
// 시간의 지배 구간이기 때문이다. preflight 는 그 자리에 **시간 대신 이유**를
// 놓는다.
//
// 이 파일에는 three.js 도 DOM 도 없다. 값과 규칙만 있다.

import { ACTIVITIES, planActivity } from './activity.mjs';
import { ROUTINES, planRoutine, clockLike } from './routine.mjs';
import { planCast } from './cast.mjs';
import { profileProblems } from './profile.mjs';
import { OCCUPANT_VALUES, occupantValue } from './occupancy.mjs';

/**
 * 시나리오 표.
 *
 * **여기 있는 것은 대본뿐이다.** 어느 건물인지, 몇 시인지, 몇 명인지는
 * 부르는 쪽이 넘긴다.
 */
export const SCENARIOS = {
  'school-normal': {
    ko: '학교 · 평상시', en: 'School, normal day',
    profile: 'school-kr',
    note: '아무 일도 안 일어난다. 일과가 그대로 돈다 — 배역과 일과가 맞물리는지 보는 기준선이다.',
    acts: [],
  },

  'school-fire-drill': {
    ko: '학교 · 화재 대피 훈련', en: 'School, fire drill',
    profile: 'school-kr',
    note: '경보가 울리면 전원이 대피로 갈아탄다. 계단 클립이 없으면 피난 시간은 못 낸다.',
    acts: [
      { on: 'cue:alarm', who: 'all', switchTo: 'evacuate', note: '경보. 언제 울릴지는 공간 쪽이 정한다' },
    ],
  },

  'nursing-fire-drill': {
    ko: '요양시설 · 화재 대피 훈련', en: 'Nursing home, fire drill',
    profile: 'nursing-home-kr',
    // 요양시설은 **직원과 입소자가 다르게 움직인다.** 직원이 먼저 움직여
    // 입소자를 돕는데, 그 '돕는다' 는 두 사람이 붙는 동작이라 지금 계약으로는
    // 못 만든다 (2인 상호작용의 경계가 아직 안 정해졌다).
    note: '입소자와 요양보호사가 다르게 움직인다. 부축은 2인 동작이라 지금 계약으로 못 한다.',
    acts: [
      { on: 'cue:alarm', who: 'role:carer', switchTo: 'goToRoom', note: '직원이 먼저 입소자에게 간다' },
      { on: 'cue:ready', who: 'role:resident', switchTo: 'evacuate', note: '도움을 받아 나간다 — 부축 동작은 아직 없다' },
    ],
  },

  'office-normal': {
    ko: '사무실 · 평상시', en: 'Office, normal day',
    profile: null,          // 프로필 없이 팩만으로 — 일과만 본다
    routine: 'officeDay',
    note: '프로필 없이 일과만 돌린다. 지금 이 저장소로 온전히 되는 유일한 시나리오다.',
    acts: [],
  },
};

/** 이 시나리오가 갈아타는 활동들. */
function switchTargets(scenario) {
  return [...new Set((scenario.acts || []).map((a) => a.switchTo).filter(Boolean))];
}

/** 시나리오 대본이 말이 되는가 — `[{ key, why }]`. */
export function scenarioProblems(scenario, { profiles = null } = {}) {
  const out = [];
  const bad = (key, why) => out.push({ key, why });
  if (!scenario || typeof scenario !== 'object') return [{ key: 'shape', why: '시나리오가 값이 아니다' }];
  if (!scenario.ko || !scenario.en) bad('name', '이름이 두 언어로 없다');

  const prof = scenario.profile ? profiles?.[scenario.profile] : null;
  if (scenario.profile && profiles && !prof) bad('profile', `'${scenario.profile}' 라는 프로필이 없다`);

  const routineId = scenario.routine || prof?.routine;
  if (!routineId) bad('routine', '어느 일과를 도는지가 없다 (프로필에도 시나리오에도)');
  else if (!ROUTINES[routineId]) bad('routine/unknown', `'${routineId}' 라는 일과가 없다`);

  const roles = new Set((prof?.composition || []).map((c) => c.role));
  for (const [i, a] of (scenario.acts || []).entries()) {
    const at = `acts[${i}]`;
    if (!a.on || !/^cue:/.test(a.on)) {
      bad(`${at}/on`, `언제 일어나는지가 '${a.on}' 다 — 'cue:이름' 이어야 한다 (시각은 공간 쪽이 안다)`);
    }
    if (!a.switchTo) bad(`${at}/switchTo`, '무엇으로 갈아타는지가 없다');
    else if (!ACTIVITIES[a.switchTo]) bad(`${at}/switchTo/unknown`, `'${a.switchTo}' 는 아는 활동이 아니다`);

    if (a.who === undefined) bad(`${at}/who`, '누가 갈아타는지가 없다');
    else if (a.who !== 'all') {
      const m = /^role:(.+)$/.exec(a.who);
      if (!m) {
        bad(`${at}/who/shape`, `'${a.who}' — who 는 'all' 이거나 'role:역할' 이다. 방·구역 이름은 건물의 사실이라 여기 못 쓴다`);
      } else if (prof && !roles.has(m[1])) {
        bad(`${at}/who/role`, `프로필에 '${m[1]}' 이라는 역할이 없다`);
      }
    }
  }

  // 시계가 섞이면 막는다 — 일과·프로필과 같은 규칙이다.
  for (const f of clockLike(scenario, scenario.id || '')) {
    bad('clock', `시각이 들어왔다: ${f.where} = ${f.what} — 시간표는 공간 쪽이다`);
  }
  return out;
}

/**
 * **돌리기 전에 이게 되는가** — 한 장으로 낸다.
 *
 * @param scenario SCENARIOS 의 값
 * @param profiles { id: 프로필 } (없으면 프로필 검사를 건너뛴다)
 * @param packs    카탈로그 배열
 * @param count    세울 사람 수 (비율을 아는 프로필일 때)
 * @param counts   역할마다 인원 (비율을 못 구한 프로필일 때)
 * @param budgetMs 한 프레임 예산 (기본 4ms)
 * @param measuredFor 팩을 잰 표를 찾는 함수 (crowdBudget.measuredFor) — 없으면 예산을 안 낸다
 * @param planCrowdMeasured 예산 계산기 — 없으면 예산을 안 낸다
 */
export function planScenario(scenario, {
  profiles = null, packs = [], count = null, counts = null,
  budgetMs = 4, measuredFor = null, planCrowdMeasured = null,
} = {}) {
  const problems = scenarioProblems(scenario, { profiles });

  // **같은 원인을 팩 수만큼 세지 않는다.** 먹는 클립이 없는 것은 하나의
  // 사실인데, 팩마다 한 줄씩 적으면 막힌 곳이 8건으로 부풀어 어느 것이 서로
  // 다른 문제인지 안 보인다. 원인으로 묶고 **영향받는 팩을 함께** 단다.
  const blockerMap = new Map();
  const note = (what, why, packId = null) => {
    const key = `${what}|${why}`;
    const cur = blockerMap.get(key);
    if (cur) { if (packId && !cur.packs.includes(packId)) cur.packs.push(packId); return; }
    blockerMap.set(key, { what, why, packs: packId ? [packId] : [] });
  };
  for (const p of problems) note(`대본/${p.key}`, p.why);

  const profile = scenario.profile ? profiles?.[scenario.profile] : null;
  if (profile) {
    for (const p of profileProblems(profile, { routines: ROUTINES })) note(`프로필/${p.key}`, p.why);
  }

  // ── 배역 ──
  let cast = null;
  if (profile) {
    try {
      cast = planCast(profile, { packs, ...(counts ? { counts } : { count: count ?? 100 }) });
    } catch (e) {
      note('배역', e.message);
    }
    if (cast && !cast.ok) {
      for (const m of cast.missing) note(`배역/${m.role}`, `${m.n}명 — ${m.why}`);
    }
  }

  // ── 일과 ──
  const routineId = scenario.routine || profile?.routine;
  const perPack = [];
  for (const c of packs) {
    const cat = c?.catalog || c;
    if (!cat?.clips) continue;
    // 배역이 쓰는 팩만 본다 — 안 쓰는 팩이 못 한다고 해서 시나리오가 막히면 안 된다.
    if (cast && !cast.assigned.some((a) => a.packId === cat.packId)) continue;
    if (!cast && !cat.person) continue;
    const row = { packId: cat.packId, routine: null, acts: [] };
    if (routineId && ROUTINES[routineId]) {
      const rp = planRoutine(cat, routineId);
      row.routine = { ok: rp.ok, missing: rp.missing, needs: rp.needs, seat: rp.seat, door: rp.door };
      if (!rp.ok) {
        for (const m of [...new Map(rp.missing.map((x) => [`${x.activity}/${x.role || x.need}`, x])).values()]) {
          note(`일과/${m.activity}`, `${m.role || m.need} 클립이 없다`, cat.packId);
        }
      }
    }
    for (const target of switchTargets(scenario)) {
      if (!ACTIVITIES[target]) continue;
      const ap = planActivity(cat, target);
      row.acts.push({ activity: target, ok: ap.ok, missing: ap.missing });
      if (!ap.ok) {
        note(`시나리오/${target}`, `${ap.missing.map((m) => m.role || m.need).join(' · ')} 클립이 없다`, cat.packId);
      }
    }
    perPack.push(row);
  }

  // ── 공간에게 달라는 것 ── (잰 값 그대로 올린다)
  const needs = new Set();
  let seat = null;
  let door = null;
  const dims = [];
  for (const c of packs) {
    const cat = c?.catalog || c;
    if (!cat) continue;
    if (cast && !cast.assigned.some((a) => a.packId === cat.packId)) continue;
    const row = perPack.find((r) => r.packId === cat.packId);
    for (const nd of row?.routine?.needs || []) needs.add(nd);
    if (!seat && row?.routine?.seat) seat = row.routine.seat;
    if (!door && row?.routine?.door) door = row.routine.door;
    if (cat.bodyDims) dims.push({ packId: cat.packId, ...cat.bodyDims });
  }

  // ── 대피가 들어 있으면 쓸 수 있는 재실자 값을 함께 낸다 ──
  //
  // **시간을 계산하지 않는다.** 계단 클립이 0개이므로 여기서 나오는 어떤
  // 수도 거짓이다. 대신 "쓸 값은 이것이고, 못 내는 까닭은 저것" 을 적는다.
  let evacuation = null;
  if (switchTargets(scenario).includes('evacuate')) {
    const stairClips = packs.reduce((s, c) => {
      const cat = c?.catalog || c;
      return s + (cat?.clips || []).filter((x) => (x.tags || []).includes('stair')).length;
    }, 0);
    const older = /nursing|older/.test(scenario.profile || '') || /nursing/.test(routineId || '');
    evacuation = {
      stairClips,
      canTimeStairs: stairClips > 0,
      why: stairClips > 0 ? null : '계단 클립이 0개다 — 계단이 피난 시간의 지배 구간이라, 없으면 시간을 낼 수 없다',
      speed: {
        population: older ? 'us-older-adult-housing' : 'us-drill-all',
        stairSpeedMps: occupantValue('stairSpeedMps', { population: older ? 'us-older-adult-housing' : 'us-drill-all' }),
        preObservationDelayS: occupantValue('preObservationDelayS', { population: older ? 'us-assisted-living-building10' : 'us-drill-all' }),
        source: 'nistTN1839',
        caveat: '미국 소방훈련 관찰값이다 (진짜 화재가 아니다)',
      },
      // 평지 속도와 대응 시간이 아직 없다는 사실도 함께 올린다.
      pending: Object.entries(OCCUPANT_VALUES).filter(([, d]) => d.pending).map(([k]) => k),
    };
    if (!evacuation.canTimeStairs) note('피난 시간', evacuation.why);
  }

  // ── 예산 ──
  let budget = null;
  // 배역이 있으면 그 인원으로, 없으면(프로필 없는 시나리오) 부르는 쪽이 준
  // 수로 센다 — 예산은 프로필과 상관없이 쓰는 쪽이 알아야 하는 값이다.
  const wantPeople = cast?.filled || count || null;
  if (measuredFor && planCrowdMeasured && wantPeople) {
    const ids = cast
      ? cast.assigned.map((a) => a.packId)
      : packs.map((c) => (c?.catalog || c)?.packId).filter(Boolean);
    const table = ids.map((id) => measuredFor(id)).find(Boolean);
    if (table) {
      const plan = planCrowdMeasured(wantPeople, budgetMs, table, ['full', 'instancedLod', 'instancedLodTenth'], { kinds: ids.length });
      budget = { want: wantPeople, budgetMs, kinds: ids.length, plan };
    } else {
      budget = { want: wantPeople, budgetMs, kinds: ids.length, plan: null, why: '이 팩들을 잰 표가 없다 — 뼈 수로 세면 13~15배 싸게 본다' };
    }
  }

  return {
    id: scenario.id || null,
    ko: scenario.ko,
    ok: blockerMap.size === 0,
    profile: scenario.profile || null,
    routine: routineId || null,
    activities: switchTargets(scenario),
    cast,
    perPack,
    needs: [...needs],
    seat,
    door,
    bodyDims: dims,
    evacuation,
    budget,
    blockers: [...blockerMap.values()],
  };
}

/** preflight 를 **사람이 읽는 한 장**으로. */
export function scenarioReport(r) {
  const L = [];
  L.push(`${r.ko} · 프로필 ${r.profile || '(없음)'} · 일과 ${r.routine || '(없음)'} — ${r.ok ? '된다' : `막힌 곳 ${r.blockers.length}`}`);
  if (r.cast) {
    const roles = r.cast.roles.map((x) => `${x.role} ${x.n}`).join(' · ');
    L.push(`  배역     ${r.cast.count}명 중 ${r.cast.filled}명 · 정확 ${(r.cast.coverage * 100).toFixed(0)}%  (${roles})`);
  }
  if (r.activities.length) L.push(`  갈아탐   ${r.activities.join(' · ')}`);
  if (r.needs.length) {
    const bits = [r.needs.join(' · ')];
    if (r.seat) bits.push(`앉을 자리 ${r.seat.hipHeightM}m`);
    if (r.door) bits.push(`손잡이 ${r.door.heightM}m`);
    L.push(`  공간에게 ${bits.join(' · ')}`);
  }
  if (r.bodyDims.length) {
    const w = Math.max(...r.bodyDims.map((d) => d.maxWidthM ?? d.widthM));
    const eyes = r.bodyDims.map((d) => d.eyeHeightM).filter(Boolean);
    L.push(`  몸       가장 넓은 폭 ${w}m · 눈높이 ${eyes.length ? `${Math.min(...eyes)}~${Math.max(...eyes)}m` : '없음'}`);
  }
  if (r.evacuation) {
    L.push(`  피난     계단 클립 ${r.evacuation.stairClips}개 — ${r.evacuation.canTimeStairs ? '시간을 낼 수 있다' : '시간을 낼 수 없다'}`);
    L.push(`           쓸 값: 계단 ${r.evacuation.speed.stairSpeedMps}m/s · 지연 ${r.evacuation.speed.preObservationDelayS}s (${r.evacuation.speed.population})`);
  }
  if (r.budget) {
    const p = r.budget.plan;
    L.push(`  예산     ${r.budget.want}명 · 몸 ${r.budget.kinds}가지 · ${r.budget.budgetMs}ms — ${p ? `${p.ms}ms (${(p.mix || []).map((m) => `${m.tier} ${m.count}`).join(' + ')})` : r.budget.why}`);
  }
  for (const b of r.blockers) {
    L.push(`  ✗ ${b.what} — ${b.why}${b.packs.length ? ` (팩 ${b.packs.length}개)` : ''}`);
  }
  return L.join('\n');
}
