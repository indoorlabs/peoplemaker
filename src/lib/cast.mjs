// **배역** — "양로원 재실자 100명" 을 받아 누구를 어느 팩에 세울지 정한다.
//
// ## 경계
//
// 이것도 자리를 안 만든다. 내는 것은 **사람 번호 → 팩** 하나이고, 그 사람을
// 어느 방 어느 자리에 놓을지는 공간을 아는 쪽이 정한다. 활동이 "지금 이
// 클립" 만 내고 자리를 안 만드는 것과 같은 규약이다.
//
// ## 왜 필요한가
//
// 한 팩은 한 사람이다. 그래서 먼 군중을 세울 때 `createMixedCrowd` 에 팩을
// 여럿 넘기는데, **누구를 몇 명씩 넣을지**를 지금까지는 쓰는 쪽이 손으로
// 정했다. 학교를 세우면 학생이 어른이 되고, 양로원을 세우면 노인이 청년이
// 되는데 화면에서는 그냥 사람들이 서 있어서 아무도 못 알아챈다.
//
// ## 이 파일의 규칙 하나
//
// **없는 사람을 조용히 딴 사람으로 채우지 않는다.** 노인 팩이 없는데 양로원
// 100명을 시키면 82명이 비고, 그 82 를 수로 말한다 (`missing`). 뛰는 클립이
// 없는 팩에 대피를 안 주는 것(activity.mjs)과 같은 이유다 — 조용히 대신
// 채우면 "노인 시설 피난 시간" 자리에 청년들이 들어앉는다.
//
// 대신 채우려면 **프로필이 그렇게 적고 왜인지도 적어야 한다** (`substitute`).
// 그러면 그 수가 `coverage` 와 따로 세어져, 보고에 남는다.
//
// 이 파일에는 three.js 도 DOM 도 없다. 값과 규칙만 있다.

import { AGE_BANDS, SEXES, MOBILITIES, ATTIRES } from './motionPack.mjs';

/** 배역이 고를 수 있는 잣대 — 프로필이 이것 말고 다른 키를 쓰면 던진다. */
export const WANT_KEYS = ['ageBand', 'sex', 'mobility', 'attire'];

const ALLOWED = {
  ageBand: Object.keys(AGE_BANDS),
  sex: SEXES,
  mobility: Object.keys(MOBILITIES),
  attire: ATTIRES,
};

/** 사람을 사람이 읽는 말로 — 보고에 쓴다. */
export function wantText(want) {
  const parts = WANT_KEYS.filter((k) => want[k] !== undefined).map((k) => `${k}=${want[k]}`);
  return parts.length ? parts.join(' · ') : '아무나';
}

/**
 * 이 팩이 이 조건에 맞는가.
 *
 * **want 에 적힌 것만 본다** — `{ ageBand: 'child' }` 는 성별을 안 가린다.
 * 모르는 키는 던진다: `{ ageband: 'child' }` 같은 오타가 조용히 통과하면
 * 조건이 없는 것과 같아져 **아무나 다 맞는다**.
 */
export function matchesWant(person, want) {
  if (!person) return false;
  for (const k of Object.keys(want)) {
    if (!WANT_KEYS.includes(k)) {
      throw new Error(`배역 조건에 모르는 키가 있다: '${k}' — 쓸 수 있는 것: ${WANT_KEYS.join(' · ')}`);
    }
    if (!ALLOWED[k].includes(want[k])) {
      throw new Error(`배역 조건 ${k}='${want[k]}' 는 아는 값이 아니다 (${ALLOWED[k].join(' · ')})`);
    }
    if (person[k] !== want[k]) return false;
  }
  return true;
}

/**
 * 몫을 **정수로** 나눈다 — 최대잉여법.
 *
 * 반올림해서 더하면 합이 시킨 수와 안 맞는다 (100명을 0.93·0.07 로 나누면
 * 93+7 이지만, 셋 이상이면 어긋난다). 합이 정확히 `total` 이 되게 하고,
 * 같은 입력이면 늘 같은 결과가 나오게 한다 — 건물을 고친 효과를 보려면
 * **같은 사람들**이 서 있어야 한다.
 */
export function splitInt(weights, total) {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!(sum > 0)) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * total);
  const base = exact.map(Math.floor);
  let left = total - base.reduce((s, v) => s + v, 0);
  // 남은 몫은 소수부가 큰 쪽부터. 같으면 앞선 것부터 — 그래야 결정적이다.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  for (const { i } of order) {
    if (left <= 0) break;
    base[i]++;
    left--;
  }
  return base;
}

/** 프로필이 말이 되는가 — 안 되면 **던진다** (조용히 고쳐 주지 않는다). */
export function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') throw new Error('프로필이 값이 아니다');
  const comp = profile.composition;
  if (!Array.isArray(comp) || !comp.length) throw new Error(`${profile.id}: composition 이 비었다`);
  const seen = new Set();
  let sum = 0;
  for (const c of comp) {
    if (!c.role) throw new Error(`${profile.id}: 역할 이름이 없는 줄이 있다`);
    if (seen.has(c.role)) throw new Error(`${profile.id}: 역할 '${c.role}' 이 두 번 적혔다`);
    seen.add(c.role);
    if (!(c.share > 0)) throw new Error(`${profile.id}: ${c.role} 의 비율이 ${c.share} 다`);
    sum += c.share;
    matchesWant({ ageBand: 'adult' }, c.want || {});   // 키·값 오타를 여기서 잡는다
    if (c.substitute) {
      if (!c.substitute.why) {
        throw new Error(
          `${profile.id}: ${c.role} 이 대신 채우기를 쓰는데 why 가 없다 — `
          + '조용히 딴 사람으로 채우면 보고에 안 남는다',
        );
      }
      matchesWant({ ageBand: 'adult' }, c.substitute.want || {});
    }
  }
  if (Math.abs(sum - 1) > 1e-6) throw new Error(`${profile.id}: 비율의 합이 ${sum.toFixed(4)} 다 (1 이어야)`);
  return true;
}

/**
 * 배역을 짠다.
 *
 * @param profile { id, composition: [{ role, share, want, substitute? }] }
 * @param packs   카탈로그 배열 (또는 `{ catalog }` 를 가진 것 — loadPack 의 결과)
 * @param count   세울 사람 수
 *
 * @returns {
 *   ok,                         빈 자리가 없는가
 *   count, filled,              시킨 수 · 실제로 채운 수
 *   coverage,                   **조건에 정확히 맞은** 비율 (대신 채운 것은 안 센다)
 *   coverageWithSubstitutes,    대신 채운 것까지 넣은 비율
 *   roles: [{ role, want, n, exact, substituted, packs: [{ packId, n }], why }],
 *   assigned: [{ packId, n }],  팩마다 몇 명 — createMixedCrowd 의 kinds 순서와 맞춘다
 *   kindOf(i),                  사람 번호 → packId (채운 만큼만 답한다)
 *   missing: [{ role, want, n, why }],
 * }
 */
export function planCast(profile, { packs, count }) {
  validateProfile(profile);
  if (!Number.isInteger(count) || count < 0) throw new Error(`세울 사람 수가 ${count} 다`);

  // 사람이 아닌 팩은 배역에 안 쓴다 — person 이 없으면 그 팩은 사람이라고
  // 말한 적이 없는 것이다 (검사용 합성 팩이 그렇다).
  const cats = (packs || []).map((p) => p?.catalog || p).filter(Boolean);
  const people = cats
    .filter((c) => c.person)
    .sort((a, b) => (a.packId < b.packId ? -1 : 1));   // 결정적인 차례

  const ns = splitInt(profile.composition.map((c) => c.share), count);
  const roles = [];
  const missing = [];
  const perPack = new Map();
  const order = [];   // 사람 번호 → packId

  profile.composition.forEach((c, ri) => {
    const want = c.want || {};
    const n = ns[ri];
    const hit = people.filter((p) => matchesWant(p.person, want));

    let used = hit;
    let substituted = 0;
    let why = null;
    if (!hit.length && c.substitute) {
      const sub = people.filter((p) => matchesWant(p.person, c.substitute.want || {}));
      if (sub.length) {
        used = sub;
        substituted = n;
        why = c.substitute.why;
      }
    }

    if (!used.length) {
      missing.push({
        role: c.role,
        want,
        n,
        why: `${wantText(want)} 인 팩이 0개다`
          + (c.substitute ? ` (대신 채우기로 적힌 ${wantText(c.substitute.want || {})} 도 0개)` : ''),
      });
      roles.push({ role: c.role, want, n, exact: 0, substituted: 0, packs: [], why: null });
      return;
    }

    const share = splitInt(used.map(() => 1), n);
    const packsOfRole = used
      .map((p, i) => ({ packId: p.packId, n: share[i] }))
      .filter((x) => x.n > 0);
    for (const x of packsOfRole) perPack.set(x.packId, (perPack.get(x.packId) || 0) + x.n);

    // 사람 번호는 **팩을 번갈아** 붙인다. 한 팩을 몰아 주면 군중을 앞에서부터
    // 잘라 쓸 때(가까운 몇 명만 스킨드로) 그 몇 명이 전부 같은 사람이 된다.
    const left = packsOfRole.map((x) => x.n);
    for (let placed = 0; placed < n; ) {
      let moved = false;
      for (let i = 0; i < packsOfRole.length && placed < n; i++) {
        if (left[i] <= 0) continue;
        left[i]--;
        order.push(packsOfRole[i].packId);
        placed++;
        moved = true;
      }
      if (!moved) break;   // 나눠 줄 몫이 다 떨어졌다
    }
    roles.push({
      role: c.role, want, n, exact: substituted ? 0 : n, substituted, why,
      packs: packsOfRole,
    });
  });

  const filled = order.length;
  const exactN = roles.reduce((s, r) => s + r.exact, 0);
  const subN = roles.reduce((s, r) => s + r.substituted, 0);

  return {
    profile: profile.id,
    ok: missing.length === 0,
    count,
    filled,
    coverage: count ? +(exactN / count).toFixed(4) : 1,
    coverageWithSubstitutes: count ? +((exactN + subN) / count).toFixed(4) : 1,
    roles,
    assigned: [...perPack.entries()].map(([packId, n]) => ({ packId, n })).sort((a, b) => (a.packId < b.packId ? -1 : 1)),
    /** 사람 번호 → 어느 팩. 못 채운 번호는 **말하고 막는다.** */
    kindOf(i) {
      if (!Number.isInteger(i) || i < 0 || i >= filled) {
        throw new Error(
          `${i}번 사람은 배역이 없다 — ${count}명 중 ${filled}명만 채웠다`
          + (missing.length ? ` (없는 것: ${missing.map((m) => wantText(m.want)).join(' · ')})` : ''),
        );
      }
      return order[i];
    },
    missing,
  };
}

/**
 * 배역을 **사람이 읽는 한 장**으로. preflight 보고의 한 칸이 된다.
 */
export function castReport(cast) {
  const lines = [`배역 ${cast.profile} · ${cast.count}명 → ${cast.filled}명 채움 (정확 ${(cast.coverage * 100).toFixed(0)}%)`];
  for (const r of cast.roles) {
    const who = r.packs.length ? r.packs.map((p) => `${p.packId}×${p.n}`).join(' · ') : '없음';
    lines.push(`  ${r.role.padEnd(12)} ${String(r.n).padStart(4)}명  ${wantText(r.want).padEnd(22)} ${who}`
      + (r.substituted ? `  ← 대신 채움: ${r.why}` : ''));
  }
  for (const m of cast.missing) lines.push(`  ✗ ${m.role} ${m.n}명 — ${m.why}`);
  return lines.join('\n');
}
