// **일과** — "학교" · "양로원" 같은 공간 종류를 활동의 차례로 옮긴다.
//
// ## 층이 하나 더 쌓인다
//
//   클립    walk-forward · sit · talk          팩이 갖고, 잰 값이 붙는다
//   활동    meeting · goToRoom · evacuate      클립의 차례 (activity.mjs)
//   일과    officeDay · schoolDay              **활동의 차례** (여기)
//
// 활동이 클립에 대해 한 일을 일과가 활동에 대해 그대로 한다. 회의가 "앉기
// 다음에 말하기" 를 아는 것처럼, 일과는 "수업 다음에 복도" 를 안다.
//
// ## 안 갖는 것 넷 — 이것이 없으면 spacemaker 를 두 벌 만드는 일이 된다
//
//   1. **자리(x, z)** 를 안 만든다 — 활동 층과 같다
//   2. **절대 시각**을 안 갖는다. "9시 수업 시작" 은 공간 쪽이 준다. 여기서
//      낼 수 있는 것은 "이 다음에 올 수 있는 활동" 과 "얼마 동안" 뿐이다.
//      → `clockLike()` 가 시:분을 찾아내고, 게이트가 그것을 막는다
//   3. **방 이름**을 안 갖는다. `needs: 'seat'` 까지가 여기다
//   4. **못 하는 것을 조용히 대신하지 않는다.** 먹는 클립이 없으면 식사가
//      못 하는 것이고, 그러면 그 일과도 못 하는 것이다 — 마시기로 바꿔
//      치우지 않는다
//
// 그래서 일과의 상태는 대개 `until-cue` 다. 수업이 45분인 것은 학교가
// 정하지 몸이 정하지 않는다.
//
// 이 파일에는 three.js 도 DOM 도 없다. 값과 규칙만 있다.

import { ACTIVITIES, planActivity, startActivity } from './activity.mjs';

/**
 * 상태 하나.
 *
 *   activity  ACTIVITIES 의 키
 *   part      그 활동 안에서 맡는 것 (없으면 첫 번째)
 *   forS      'activity'  안쪽 활동이 끝날 때까지 (goToRoom 처럼 끝이 있는 것)
 *             'until-cue' 쓰는 쪽이 알려 줄 때까지 (수업·근무처럼 끝을 공간이 안다)
 *             수(초)      그만큼
 *   next      [[상태 id, 무게], …] — 비면 하루가 끝난다
 */

/**
 * 일과 표.
 *
 * **몇 시인지도, 어느 방인지도 여기 없다.** 있는 것은 차례와 규칙뿐이다.
 */
export const ROUTINES = {
  officeDay: {
    ko: '사무실 하루', en: 'Office day',
    note: '와서 자리에 앉아 일하다 가끔 회의에 간다. 끝은 공간 쪽이 알린다.',
    parts: {
      worker: {
        start: 'arrive',
        states: {
          arrive: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['desk', 1]] },
          desk: { activity: 'deskWork', part: 'worker', forS: 'until-cue', next: [['toMeeting', 1], ['desk', 2], ['leave', 1]] },
          toMeeting: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['meeting', 1]] },
          meeting: { activity: 'meeting', part: 'listener', forS: 'until-cue', next: [['back', 1]] },
          back: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['desk', 1]] },
          leave: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [] },
        },
      },
      host: {
        start: 'arrive',
        states: {
          arrive: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['desk', 1]] },
          desk: { activity: 'deskWork', part: 'worker', forS: 'until-cue', next: [['toMeeting', 1], ['leave', 1]] },
          toMeeting: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['meeting', 1]] },
          meeting: { activity: 'meeting', part: 'speaker', forS: 'until-cue', next: [['desk', 1]] },
          leave: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [] },
        },
      },
    },
  },

  schoolDay: {
    ko: '학교 하루', en: 'School day',
    // **지금 이 일과는 못 돈다** — 급식에 먹는 클립이 없다. 그것을 숨기지
    // 않는 것이 이 층의 요점이다: 마시기로 바꿔 놓으면 화면은 멀쩡하고
    // "급식실 재실 시간" 만 거짓이 된다.
    note: '수업 ⇄ 복도 ⇄ 급식. 급식은 먹는 클립이 없어 지금 못 한다.',
    parts: {
      student: {
        start: 'inClass',
        states: {
          inClass: { activity: 'lesson', part: 'student', forS: 'until-cue', next: [['corridor', 3], ['toLunch', 1]] },
          corridor: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['inClass', 1]] },
          toLunch: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['lunchLine', 1]] },
          lunchLine: { activity: 'queue', part: 'waiter', forS: 'until-cue', next: [['lunch', 1]] },
          lunch: { activity: 'meal', part: 'diner', forS: 'until-cue', next: [['corridor', 1]] },
        },
      },
      teacher: {
        start: 'inClass',
        states: {
          inClass: { activity: 'lesson', part: 'teacher', forS: 'until-cue', next: [['corridor', 1]] },
          corridor: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['inClass', 2], ['office', 1]] },
          office: { activity: 'deskWork', part: 'worker', forS: 'until-cue', next: [['corridor', 1]] },
        },
      },
    },
  },

  nursingDay: {
    ko: '요양시설 하루', en: 'Nursing home day',
    // 재실자는 하루의 대부분을 거실에서 보낸다. 이 일과도 식사에서 막힌다.
    note: '거실에서 쉬다 방으로 간다. 식사는 먹는 클립이 없어 지금 못 한다.',
    parts: {
      resident: {
        start: 'lounge',
        states: {
          lounge: { activity: 'rest', part: 'resident', forS: 'until-cue', next: [['toRoom', 1], ['toDining', 1], ['lounge', 2]] },
          toRoom: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['inRoom', 1]] },
          inRoom: { activity: 'rest', part: 'resident', forS: 'until-cue', next: [['toLounge', 1]] },
          toLounge: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['lounge', 1]] },
          toDining: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['dining', 1]] },
          dining: { activity: 'meal', part: 'diner', forS: 'until-cue', next: [['toLounge', 1]] },
        },
      },
      carer: {
        start: 'round',
        states: {
          round: { activity: 'goToRoom', part: 'walker', forS: 'activity', next: [['withResident', 1], ['desk', 1]] },
          withResident: { activity: 'rest', part: 'resident', forS: 'until-cue', next: [['round', 1]] },
          desk: { activity: 'deskWork', part: 'worker', forS: 'until-cue', next: [['round', 1]] },
        },
      },
    },
  },
};

/**
 * 이 값 어딘가에 **시계가 들어 있는가** — `[{ where, what }]` 로 낸다.
 *
 * 일과가 시각을 갖기 시작하면 이 저장소가 시간표를 갖게 되고, 그러면
 * spacemaker 와 두 벌이 되어 한쪽만 고쳐진다. 사람이 지키게 두면 언젠가
 * 새는 자리라, 값으로 찾아낸다.
 *
 * 잡는 것: `09:00` 같은 문자열, `hour`·`startTime`·`clock` 같은 키 이름.
 */
const CLOCK_KEYS = /^(at|hour|hours|minute|minutes|time|times|startTime|endTime|clock|schedule|oclock)$/i;
const CLOCK_TEXT = /\b([01]?\d|2[0-3]):[0-5]\d\b|\d+\s*시\s*\d*\s*분?/;

export function clockLike(value, where = '') {
  const out = [];
  const walk = (v, path) => {
    if (typeof v === 'string') {
      if (CLOCK_TEXT.test(v)) out.push({ where: path, what: v });
      return;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (CLOCK_KEYS.test(k)) out.push({ where: `${path}.${k}`, what: `키 이름 '${k}'` });
        walk(x, `${path}.${k}`);
      }
    }
  };
  walk(value, where);
  return out;
}

/**
 * 이 팩으로 이 일과를 **돌 수 있는가** — 없으면 무엇이 없는지 말한다.
 *
 * 활동 층의 `planActivity` 를 상태마다 불러 모은다. 한 활동이라도 못 하면
 * 그 일과는 못 하는 것이다 — 그 활동만 건너뛰고 도는 길은 안 낸다 (급식을
 * 빼고 도는 학교 하루는 학교 하루가 아니다).
 *
 * @returns { ok, routine, parts, activities, clips, needs, seat, door, missing }
 */
export function planRoutine(catalog, routineId) {
  const rt = ROUTINES[routineId];
  if (!rt) throw new Error(`모르는 일과: ${routineId}`);

  const parts = {};
  const activities = new Set();
  const clips = new Set();
  const needs = new Set();
  const missing = [];
  let seat = null;
  let door = null;

  for (const [partId, part] of Object.entries(rt.parts)) {
    const states = {};
    for (const [stateId, st] of Object.entries(part.states)) {
      activities.add(st.activity);
      const plan = planActivity(catalog, st.activity);
      states[stateId] = { activity: st.activity, part: st.part, ok: plan.ok };
      for (const c of plan.clips) clips.add(c);
      for (const nd of plan.needs) needs.add(nd);
      if (!seat && plan.seat) seat = plan.seat;
      if (!door && plan.door) door = plan.door;
      for (const m of plan.missing) {
        missing.push({ part: partId, state: stateId, activity: st.activity, role: m.role, need: m.need, want: m.want });
      }
    }
    parts[partId] = { start: part.start, states };
  }

  return {
    ok: missing.length === 0,
    routine: routineId,
    parts,
    activities: [...activities],
    clips: [...clips],
    needs: [...needs],
    seat,
    door,
    missing,
  };
}

/** 0~1 을 내는 작은 난수 — 활동 층과 같은 것을 쓴다 (같은 씨 = 같은 하루). */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * 사람 하나에게 하루를 시킨다.
 *
 * 안쪽 활동을 직접 갖고 돌린다 — 쓰는 쪽은 `clipId` 하나만 보면 된다.
 *
 * **알림이 둘이다.** 층이 둘이니 끝나는 것도 둘이다:
 *
 *   `r.activity.cue()`  안쪽 활동에게 — "문 앞에 닿았다"
 *   `r.cue()`           일과에게 — "수업이 끝났다"
 *
 * 섞어 쓰면 걷는 사람이 영영 안 도착하거나, 수업이 한 클립 만에 끝난다.
 *
 * @param part 맡는 것 (없으면 첫 번째)
 * @param seed 난수 씨 — 같은 씨면 같은 하루
 */
export function startRoutine(catalog, routineId, { part, seed = 1 } = {}) {
  const plan = planRoutine(catalog, routineId);
  const rt = ROUTINES[routineId];
  const partId = part || Object.keys(rt.parts)[0];
  const spec = rt.parts[partId];
  if (!spec) throw new Error(`${routineId}: ${partId} 라는 역할이 없다`);
  if (!plan.ok) {
    const what = [...new Set(plan.missing.map((m) => `${m.activity}(${m.role || m.need})`))].join(' · ');
    throw new Error(`${routineId}: 이 팩으로는 못 돈다 — 못 하는 활동: ${what}`);
  }

  const rand = rng(seed);
  let stateId = spec.start;
  let timeS = 0;
  let changed = true;
  let act = null;

  const enter = (id) => {
    stateId = id;
    timeS = 0;
    changed = true;
    const st = spec.states[id];
    // 활동마다 새 씨를 뽑는다 — 일과의 씨 하나에서 나오므로 하루 전체가
    // 재현된다 (건물을 고친 효과를 보려면 같은 사람이 같이 움직여야 한다).
    act = startActivity(catalog, st.activity, { part: st.part, seed: Math.floor(rand() * 0x7fffffff) || 1 });
  };
  enter(stateId);

  const pickNext = () => {
    const nexts = spec.states[stateId].next || [];
    if (!nexts.length) return null;
    const total = nexts.reduce((s, [, w]) => s + w, 0);
    let r = rand() * total;
    for (const [to, w] of nexts) { r -= w; if (r <= 0) return to; }
    return nexts[nexts.length - 1][0];
  };

  const step = () => {
    const to = pickNext();
    if (!to) return false;
    enter(to);
    return true;
  };

  return {
    plan,
    part: partId,
    get state() { return stateId; },
    /** 지금 도는 활동 — `cue()` 로 도착을 알릴 때 이것을 쓴다. */
    get activity() { return act; },
    get activityId() { return spec.states[stateId].activity; },
    /** 지금 틀 클립 — 쓰는 쪽이 보는 것은 이것 하나다. */
    get clipId() { return act.clipId; },
    /** 지금 공간에게 요구하는 것 ('seat' · 'door' · 'desk') — 없으면 null */
    get needs() { return act.needs; },
    /** 방금 클립이 바뀌었는가 (일과가 넘어갔든 활동 안에서 바뀌었든) */
    get justChanged() { return changed; },
    /** 하루가 끝났는가 */
    get done() { return !(spec.states[stateId].next || []).length && act.done; },
    /**
     * 일과에게 알린다 — "수업이 끝났다". 안쪽 활동에게 알리는 것은
     * `r.activity.cue()` 다.
     */
    cue() {
      if (spec.states[stateId].forS !== 'until-cue') return false;
      return step();
    },
    /** 시간을 흘린다. 클립이 바뀌면 true. */
    update(dtS) {
      changed = false;
      const before = act.clipId;
      act.update(dtS);
      timeS += dtS;

      const st = spec.states[stateId];
      if (st.forS === 'activity') {
        if (act.done) step();
      } else if (typeof st.forS === 'number' && timeS >= st.forS) {
        step();
      }
      // 'until-cue' 는 혼자 안 끝난다 — 길이는 공간 쪽만 안다.

      if (act.clipId !== before) changed = true;
      return changed;
    },
  };
}
