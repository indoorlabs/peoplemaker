// **활동** — "회의하기 · 방으로 가기 · 대피하기" 를 동작으로 옮긴다.
//
// ## 경계를 먼저 긋는다
//
// 이 저장소는 배치·동선·활동 스케줄을 안 한다 (README 의 경계). 그러면
// "회의하기" 는 누구 일인가?
//
//   **어디서 · 언제 · 누구와**   공간을 아는 쪽 (spacemaker · urbanspace)
//   **그래서 몸이 무엇을 하는가** 여기
//
// 회의를 하려면 사람이 걸어가 앉고, 말하고, 듣고, 서류를 보고, 일어선다.
// 그 **차례와 규칙**은 공간을 몰라도 정해진다 — 그것이 이 파일이다. 어느
// 회의실인지, 몇 시인지, 누가 발표자인지는 여기서 안 정한다.
//
// 그래서 활동은 **자리(x, z)를 하나도 안 만든다.** 내는 것은 셋뿐이다:
//
//   1. 지금 이 사람이 틀 클립 (그리고 언제 바뀌는지)
//   2. 이 활동이 **공간에게 요구하는 것** — 앉을 자리의 높이 같은 것.
//      그 값은 지어내지 않고 **팩에서 잰 것**을 그대로 넘긴다 (clip.seat).
//   3. 이 팩으로 그 활동을 **할 수 없으면 무엇이 없는지** — 뛰는 클립이
//      없는 팩에게 대피를 시키면 걷는 대피가 되는데, 그것은 거짓이다.
//
// ## 왜 상태 기계인가
//
// "회의하기" 를 클립 목록으로 주면 쓰는 쪽이 순서를 지어낸다 — 앉기 전에
// 말하거나, 일어서지 않고 걸어 나간다. 상태와 넘어감으로 두면 **말이 되는
// 차례만** 나온다. 넘어갈 곳이 없는 상태(막다른 길)는 게이트가 막는다.
//
// 이 파일에는 three.js 도 DOM 도 없다. 값과 규칙만 있다.

/**
 * 클립 **역할** — 활동은 클립 id 를 직접 대지 않는다.
 *
 * 팩마다 클립 이름이 조금씩 다를 수 있고(여자 01 에는 전화 통화가 원래
 * 없었다), 한 역할에 여러 후보가 있을 수 있다. 활동은 역할로 말하고,
 * 팩을 받아 **그 팩에 있는 것**으로 푼다.
 */
export const ROLES = {
  stand: ['idle'],
  walk: ['walk-forward'],
  walkFast: ['walk-fast', 'walk-forward'],
  run: ['run'],
  sit: ['sit'],
  sitDesk: ['sit-table', 'sit'],
  talk: ['talk'],
  listen: ['listen'],
  papers: ['documents'],
  work: ['work-table'],
  drink: ['drink'],
  phone: ['phone-call', 'phone'],
  lookAround: ['look-around'],
  door: ['door-open'],
  knock: ['door-knock'],
  stretch: ['stretch'],
  clap: ['clap'],
  crouch: ['crouch'],
};

/**
 * 상태 하나.
 *
 *   role   ROLES 의 키
 *   forS   이 상태에 머무는 시간 (초). 'clip' 이면 클립 한 바퀴
 *   next   [[상태 id, 무게], …] — 무게로 고른다. 비면 활동이 끝난다
 *   needs  이 상태가 공간에게 요구하는 것 ('seat' · 'door' · 'desk')
 */

/**
 * 활동 표.
 *
 * **여기 있는 것은 몸의 문법뿐이다.** 회의실이 어디인지, 몇 명인지, 언제
 * 시작하는지는 공간 쪽이 정해서 `startActivity` 에 넘긴다.
 */
export const ACTIVITIES = {
  meeting: {
    ko: '회의', en: 'Meeting',
    note: '앉아서 말하고 듣는다. 말하는 사람과 듣는 사람의 차례가 다르다 — 역할로 나눈다.',
    // 한 활동 안에서 사람마다 맡는 것이 다르다.
    parts: {
      speaker: {
        start: 'sit-down',
        states: {
          'sit-down': { role: 'sit', forS: 2, next: [['talk', 1]], needs: 'seat' },
          talk: { role: 'talk', forS: 'clip', next: [['listen', 2], ['papers', 1]], needs: 'seat' },
          listen: { role: 'listen', forS: 'clip', next: [['talk', 2], ['papers', 1]], needs: 'seat' },
          papers: { role: 'papers', forS: 'clip', next: [['talk', 1], ['listen', 1]], needs: 'seat' },
        },
      },
      listener: {
        start: 'sit-down',
        states: {
          'sit-down': { role: 'sit', forS: 2, next: [['listen', 1]], needs: 'seat' },
          listen: { role: 'listen', forS: 'clip', next: [['listen', 3], ['papers', 1], ['talk', 1]], needs: 'seat' },
          papers: { role: 'papers', forS: 'clip', next: [['listen', 2]], needs: 'seat' },
          talk: { role: 'talk', forS: 'clip', next: [['listen', 3]], needs: 'seat' },
        },
      },
    },
  },

  deskWork: {
    ko: '책상에서 일하기', en: 'Desk work',
    note: '사무실 재실자의 기본. 가끔 마시고 기지개를 켠다.',
    parts: {
      worker: {
        start: 'sit-down',
        states: {
          'sit-down': { role: 'sitDesk', forS: 2, next: [['work', 1]], needs: 'desk' },
          work: { role: 'work', forS: 'clip', next: [['work', 4], ['papers', 2], ['drink', 1], ['stretch', 1], ['phone', 1]], needs: 'desk' },
          papers: { role: 'papers', forS: 'clip', next: [['work', 1]], needs: 'desk' },
          drink: { role: 'drink', forS: 'clip', next: [['work', 1]], needs: 'desk' },
          stretch: { role: 'stretch', forS: 'clip', next: [['work', 1]], needs: 'desk' },
          phone: { role: 'phone', forS: 'clip', next: [['work', 1]], needs: 'desk' },
        },
      },
    },
  },

  goToRoom: {
    ko: '방으로 가기', en: 'Go to a room',
    // **길은 여기서 안 낸다.** 어디로 갈지·어느 문을 쓸지는 공간 쪽이 정하고,
    // 여기서는 "걷다가 문 앞에서 문을 열고 들어가 둘러본다" 는 차례만 준다.
    // 쓰는 쪽이 도착을 알려 주면(arrive) 다음 상태로 넘어간다.
    note: '길은 공간 쪽이 낸다. 여기는 걷기 → 문 → 둘러보기 차례만 준다.',
    parts: {
      walker: {
        start: 'walk',
        states: {
          walk: { role: 'walk', forS: 'until-cue', next: [['at-door', 1]] },
          'at-door': { role: 'door', forS: 'clip', next: [['enter', 1]], needs: 'door' },
          enter: { role: 'walk', forS: 'until-cue', next: [['arrived', 1]] },
          arrived: { role: 'lookAround', forS: 'clip', next: [['stand', 1]] },
          stand: { role: 'stand', forS: 'clip', next: [] },
        },
      },
    },
  },

  evacuate: {
    ko: '대피', en: 'Evacuate',
    // 대피는 **뛰는 것**이다. 뛰는 클립이 없는 팩에 이 활동을 시키면 걷는
    // 대피가 되는데, 그러면 피난 시간이 거짓이 된다 — 그래서 없으면 못
    // 한다고 말한다 (planActivity 의 missing).
    note: '뛰는 클립이 없으면 못 한다 — 걷는 대피는 피난 시간을 거짓으로 만든다.',
    parts: {
      evacuee: {
        start: 'alert',
        states: {
          alert: { role: 'lookAround', forS: 1.5, next: [['stand-up', 1]] },
          'stand-up': { role: 'stand', forS: 1, next: [['run', 1]] },
          run: { role: 'run', forS: 'until-cue', next: [['at-door', 2], ['queue', 1]] },
          queue: { role: 'stand', forS: 'until-cue', next: [['run', 1], ['at-door', 1]] },
          'at-door': { role: 'door', forS: 'clip', next: [['out', 1]], needs: 'door' },
          out: { role: 'run', forS: 'until-cue', next: [] },
        },
      },
    },
  },
};

/** 이 팩에서 이 역할을 맡을 클립 — 없으면 null. */
export function clipForRole(catalog, role) {
  const want = ROLES[role];
  if (!want) return null;
  const have = new Set((catalog?.clips || []).map((c) => c.id));
  return want.find((id) => have.has(id)) || null;
}

/**
 * 이 팩으로 이 활동을 할 수 있는가 — **없으면 무엇이 없는지 말한다.**
 *
 * 공간 쪽은 이 값을 보고 "이 사람에게 대피를 시킬 수 있는가" 를 안다.
 * 또 활동이 공간에게 요구하는 것(앉을 자리·문·책상)과, 앉을 자리의 **높이**를
 * 함께 낸다 — 그 높이는 지어낸 값이 아니라 그 팩의 sit 클립에서 잰 값이다.
 *
 * @returns { ok, parts, clips, needs, seat, missing }
 */
export function planActivity(catalog, activityId) {
  const act = ACTIVITIES[activityId];
  if (!act) throw new Error(`모르는 활동: ${activityId}`);
  const byClip = new Map((catalog?.clips || []).map((c) => [c.id, c]));
  const parts = {};
  const clips = new Set();
  const needs = new Set();
  const missing = [];

  for (const [partId, part] of Object.entries(act.parts)) {
    const resolved = {};
    for (const [stateId, st] of Object.entries(part.states)) {
      const clip = clipForRole(catalog, st.role);
      if (!clip) missing.push({ part: partId, state: stateId, role: st.role, want: ROLES[st.role] });
      else { resolved[stateId] = clip; clips.add(clip); }
      if (st.needs) needs.add(st.needs);
    }
    parts[partId] = { start: part.start, clipOf: resolved };
  }

  // 앉을 자리의 높이 — 재서 적어 둔 값을 그대로 넘긴다.
  let seat = null;
  if (needs.has('seat') || needs.has('desk')) {
    const seatClip = [...clips].map((id) => byClip.get(id)).find((c) => c?.seat);
    seat = seatClip ? { clipId: seatClip.id, ...seatClip.seat } : null;
    if (!seat) missing.push({ need: 'seat', why: '앉는 클립에 잰 값(seat)이 없다' });
  }

  // 손잡이를 둘 자리 — 문을 쓰는 활동이면 손이 닿는 높이를 함께 넘긴다.
  // 어른 1.07m · 어린이 0.87m 로 나왔다. 공간 쪽이 그 높이의 문을 고른다.
  let door = null;
  if (needs.has('door')) {
    const doorClip = [...clips].map((id) => byClip.get(id)).find((c) => c?.reach);
    door = doorClip ? { clipId: doorClip.id, ...doorClip.reach } : null;
    if (!door) missing.push({ need: 'door', why: '문 클립에 손이 닿는 자리(reach)가 없다' });
  }

  return {
    ok: missing.length === 0,
    activity: activityId,
    parts,
    clips: [...clips],
    needs: [...needs],
    seat,
    door,
    missing,
  };
}

/** 0~1 을 내는 작은 난수 — 씨를 주면 늘 같은 차례가 나온다 (게이트가 흔들 수 있게). */
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
 * 사람 하나에게 활동을 시킨다.
 *
 * **자리는 안 만든다.** 내는 것은 "지금 이 클립" 과 "언제 바뀌는가" 뿐이고,
 * 어디에 세울지는 부르는 쪽이 정한다.
 *
 * `forS: 'until-cue'` 인 상태는 **쓰는 쪽이 알려 줄 때까지** 안 끝난다 —
 * 걷기가 그렇다. 길이 얼마나 먼지는 공간 쪽만 안다. `cue()` 로 알린다.
 *
 * @param catalog 팩의 카탈로그
 * @param activityId ACTIVITIES 의 키
 * @param part 역할 (없으면 첫 번째)
 * @param seed 난수 씨 — 같은 씨면 같은 차례
 */
export function startActivity(catalog, activityId, { part, seed = 1 } = {}) {
  const plan = planActivity(catalog, activityId);
  const act = ACTIVITIES[activityId];
  const partId = part || Object.keys(act.parts)[0];
  const spec = act.parts[partId];
  if (!spec) throw new Error(`${activityId}: ${partId} 라는 역할이 없다`);
  if (!plan.ok) {
    const what = plan.missing.map((m) => m.role || m.need).join(' · ');
    throw new Error(`${activityId}: 이 팩으로는 못 한다 — 없는 것: ${what}`);
  }

  const rand = rng(seed);
  const durationOf = (clipId) => (catalog.clips.find((c) => c.id === clipId)?.durationS ?? 1);
  let stateId = spec.start;
  let timeS = 0;
  let changed = true;

  const enter = (id) => { stateId = id; timeS = 0; changed = true; };
  const stay = () => {
    const st = spec.states[stateId];
    if (st.forS === 'clip') return durationOf(plan.parts[partId].clipOf[stateId]);
    if (st.forS === 'until-cue') return Infinity;
    return st.forS;
  };
  const pickNext = () => {
    const nexts = spec.states[stateId].next || [];
    if (!nexts.length) return null;
    const total = nexts.reduce((s, [, w]) => s + w, 0);
    let r = rand() * total;
    for (const [to, w] of nexts) { r -= w; if (r <= 0) return to; }
    return nexts[nexts.length - 1][0];
  };

  return {
    plan,
    part: partId,
    get state() { return stateId; },
    get clipId() { return plan.parts[partId].clipOf[stateId]; },
    /** 이 상태가 공간에게 요구하는 것 — 없으면 null */
    get needs() { return spec.states[stateId].needs || null; },
    /** 방금 클립이 바뀌었는가 — 쓰는 쪽이 이때만 다시 세우면 된다. */
    get justChanged() { return changed; },
    /** 활동이 끝났는가 (넘어갈 곳이 없는 상태) */
    get done() { return !(spec.states[stateId].next || []).length; },
    /** 쓰는 쪽이 "도착했다 · 문 앞이다" 를 알린다 — until-cue 상태를 끝낸다. */
    cue() {
      if (stay() !== Infinity) return false;
      const to = pickNext();
      if (to) enter(to);
      return !!to;
    },
    /** 시간을 흘린다. 클립이 바뀌면 true. */
    update(dtS) {
      changed = false;
      timeS += dtS;
      let guard = 0;
      while (timeS >= stay() && !this.done && guard++ < 8) {
        const to = pickNext();
        if (!to) break;
        const over = timeS - stay();
        enter(to);
        timeS = Math.max(0, over);
      }
      return changed;
    },
  };
}
