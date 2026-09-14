// **표기 의무** — 이 팩을 쓰면 무엇을 적어야 하는가.
//
// 계약은 처음부터 클립마다 라이선스를 적게 했고(`LICENSES`), 그 표에는
// `attribution: true/false` 가 들어 있다. 그런데 **그 true 를 아무도 안 쓰고
// 있었다** — 팩을 받아 화면에 세우는 쪽은 자기가 무엇을 적어야 하는지 알
// 길이 없었다.
//
// ## 왜 자동으로 만들어야 하는가
//
// 자산은 늘고 사람은 잊는다. 지금은 팩 열셋이 전부 MIT 하나지만, 노인이나
// 계단을 다른 출처에서 받는 순간 두 가지가 되고, 그때 손으로 적은 목록은
// 이미 틀려 있다. spacemaker 의 DAWA 가 CC-BY 자산을 ATTRIBUTIONS.md 에
// 따로 적는 것과 같은 규약이고, 여기서는 그것을 **손이 아니라 계약이**
// 강제한다 (계획 §5 의 위험 1).
//
// ## 고지문을 베껴 적지 않는다
//
// MIT 는 "위 저작권 고지와 이 허가 고지를 **그대로** 포함하라" 고 한다.
// 그래서 원본 고지문 파일을 그대로 받아 `licenses/` 에 두고, 여기서는 그
// 파일을 가리킨다 — 한 글자라도 옮겨 적으면 그것은 다른 문서다.
//
// 실제로 옮겨 적어서 틀린 자리가 있었다: 팩의 note 에 "Copyright (c)
// Microsoft Corporation" 이라고 적혀 있었는데, 원문은 "Copyright (c) 2020
// Microsoft" 다 (2026-09-13 확인).
//
// 이 파일에는 three.js 도 DOM 도 fs 도 없다. 파일을 읽는 것은 부르는 쪽이다.

import { LICENSES } from './motionPack.mjs';

/**
 * 이 팩이 **표기를 요구하는 것들** — `[{ tool, license, clips, origin }]`.
 *
 * 클립을 `source.tool`(어디서 왔는가)로 묶는다. 라이선스가 같아도 출처가
 * 다르면 적을 것이 다르기 때문이다 — MIT 자산 둘을 한 줄로 적으면 둘 중
 * 어느 저작권자도 제대로 적히지 않는다.
 */
export function attributionNeeds(catalog) {
  const byTool = new Map();
  const need = (tool, license) => {
    const key = `${tool}|${license}`;
    if (!byTool.has(key)) byTool.set(key, { tool, license, clips: [], body: false });
    return byTool.get(key);
  };
  for (const c of catalog?.clips || []) {
    const lic = LICENSES[c.license];
    if (!lic?.attribution) continue;
    need(c.source?.tool || '(출처 없음)', c.license).clips.push(c.id);
  }
  // **몸의 출처는 클립과 다를 수 있다.** 로봇 팩이 처음이다 — 클립은 우리가
  // 함수로 만든 CC0 이고 몸은 Unitree 의 BSD-3 다. 클립만 보면 표기가 "0건"
  // 으로 나와 저작권 표시가 빠진다. 그래서 카탈로그의 bodySource 도 센다.
  const bs = catalog?.bodySource;
  if (bs && LICENSES[bs.license]?.attribution) need(bs.tool || '(출처 없음)', bs.license).body = true;
  const origins = catalog?.origins || [];
  return [...byTool.values()]
    .map((x) => ({ ...x, origin: origins.find((o) => o.tool === x.tool && o.license === x.license) || null }))
    .sort((a, b) => (a.tool < b.tool ? -1 : 1));
}

/**
 * 표기에 필요한 것이 다 있는가 — `[{ key, why }]`.
 *
 * 게이트가 한 자리씩 일부러 망가뜨려 보므로 어긋난 자리마다 다른 key 를 낸다.
 */
export function attributionProblems(catalog) {
  const out = [];
  const bad = (key, why) => out.push({ key, why });
  const needs = attributionNeeds(catalog);

  for (const nd of needs) {
    if (!nd.origin) {
      const what = [nd.clips.length ? `클립 ${nd.clips.length}개` : null, nd.body ? '몸' : null].filter(Boolean).join('과 ');
      bad(`origin/${nd.tool}`, `${nd.license} ${what}(${nd.tool})이 표기를 요구하는데 출처 선언(origins)이 없다`);
      continue;
    }
    const o = nd.origin;
    if (!o.ko || !o.en) bad(`origin/${nd.tool}/name`, '출처 이름이 두 언어로 없다');
    if (!o.url || !/^https:/.test(o.url)) bad(`origin/${nd.tool}/url`, `주소가 '${o.url}' 다`);
    // **고지문은 파일을 가리킨다.** 여기 글로 적으면 원문과 갈린다.
    if (!o.noticeFile || !/^licenses\/.+/.test(o.noticeFile)) {
      bad(`origin/${nd.tool}/notice`, `고지문 파일이 '${o.noticeFile}' 다 — licenses/… 를 가리켜야 한다`);
    }
    if (o.notice || o.text) {
      bad(`origin/${nd.tool}/inline`, '고지문을 글로 옮겨 적어 두었다 — 파일을 가리킬 것 (한 글자만 달라도 다른 문서다)');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.checked || '')) {
      bad(`origin/${nd.tool}/checked`, `원문을 언제 확인했는지가 '${o.checked}' 다`);
    }
  }

  // 쓰지도 않는 출처를 적어 두면 ATTRIBUTIONS 에 남의 이름이 오른다.
  for (const o of catalog?.origins || []) {
    if (!needs.some((nd) => nd.origin === o)) {
      bad(`origin/${o.tool}/unused`, `출처가 적혀 있는데 그것을 쓰는 클립이 없다 (${o.license})`);
    }
  }
  return out;
}

/** 이 팩들이 요구하는 표기를 **하나로 모은다** — 같은 출처는 한 번만. */
export function attributionsFor(catalogs) {
  const merged = new Map();
  for (const c of catalogs || []) {
    const cat = c?.catalog || c;
    for (const nd of attributionNeeds(cat)) {
      const key = `${nd.tool}|${nd.license}`;
      if (!merged.has(key)) merged.set(key, { ...nd, clips: [], packs: [], bodies: [] });
      const m = merged.get(key);
      m.clips.push(...nd.clips.map((id) => `${cat.packId}/${id}`));
      m.packs.push(cat.packId);
      if (nd.body) m.bodies.push(cat.packId);
      if (!m.origin && nd.origin) m.origin = nd.origin;
    }
  }
  return [...merged.values()].sort((a, b) => (a.tool < b.tool ? -1 : 1));
}

/**
 * 표기가 **필요 없는** 클립도 센다 — "0건" 을 말할 수 있어야 한다.
 *
 * @returns { total, needing, free, byLicense }
 */
export function attributionTally(catalogs) {
  const byLicense = {};
  let total = 0;
  let needing = 0;
  let bodiesNeeding = 0;
  for (const c of catalogs || []) {
    const cat = c?.catalog || c;
    // 몸이 따로 표기를 요구하는 팩 — 클립 수에는 안 들어간다.
    if (LICENSES[cat.bodySource?.license]?.attribution) bodiesNeeding++;
    for (const clip of cat.clips || []) {
      total++;
      byLicense[clip.license] = (byLicense[clip.license] || 0) + 1;
      if (LICENSES[clip.license]?.attribution) needing++;
    }
  }
  return { total, needing, free: total - needing, byLicense, bodiesNeeding };
}

/**
 * ATTRIBUTIONS.md 의 본문 — 고지문 파일의 **내용을 넣어 준다**.
 *
 * @param readNotice (noticeFile) => 그 파일의 글. 부르는 쪽이 읽어서 넘긴다
 *                   (이 층은 파일을 안 읽는다).
 */
export function attributionsMarkdown(catalogs, { readNotice, generatedBy = 'peoplemaker/build-attributions' } = {}) {
  const items = attributionsFor(catalogs);
  const tally = attributionTally(catalogs);
  const L = [];
  L.push('# ATTRIBUTIONS');
  L.push('');
  L.push('이 파일은 **손으로 적지 않는다** — `node scripts/build-attributions.mjs` 가 팩의');
  L.push('카탈로그에서 만든다. 클립마다 적힌 라이선스와 출처가 그대로 올라온다.');
  L.push('');
  L.push(`클립 ${tally.total}개 중 **표기가 필요한 것 ${tally.needing}개** · 필요 없는 것 ${tally.free}개.`
    + (tally.bodiesNeeding ? ` 몸이 따로 표기를 요구하는 팩 ${tally.bodiesNeeding}개.` : ''));
  L.push('');
  L.push('| 라이선스 | 클립 |');
  L.push('|---|---|');
  for (const [lic, k] of Object.entries(tally.byLicense).sort()) {
    const f = LICENSES[lic];
    const marks = [
      f?.attribution ? '표기 필요' : '표기 불필요',
      f?.commercial === false ? '**상업 사용 불가**' : null,
      f?.shareAlike ? '**동일조건 변경허락**' : null,
      f?.redistributable === false ? '**재배포 금지**' : null,
      f?.conditions ? '조건 있음' : null,
    ].filter(Boolean);
    L.push(`| \`${lic}\` | ${k}개 — ${marks.join(' · ')} |`);
  }
  L.push('');

  if (!items.length) {
    L.push('표기가 필요한 자산이 없다.');
  }
  for (const it of items) {
    const o = it.origin;
    L.push(`## ${o ? o.ko : it.tool}`);
    L.push('');
    L.push(`- 출처: ${o ? `[${o.en}](${o.url})` : it.tool}`);
    L.push(`- 라이선스: \`${it.license}\``);
    L.push(`- 쓰는 팩 ${new Set(it.packs).size}개 · 클립 ${it.clips.length}개${it.bodies?.length ? ` · 몸 ${it.bodies.length}개` : ''}`);
    if (o?.checked) L.push(`- 고지문 원문을 확인한 날: ${o.checked} (\`${o.noticeFile}\`)`);
    L.push('');
    if (o?.noticeFile && readNotice) {
      const text = readNotice(o.noticeFile);
      if (text) {
        L.push('원문 고지 — **그대로 옮긴다**:');
        L.push('');
        L.push('```');
        L.push(text.trimEnd());
        L.push('```');
        L.push('');
      }
    }
  }
  L.push('---');
  L.push('');
  L.push(`만든 것: \`${generatedBy}\``);
  L.push('');
  return L.join('\n');
}
