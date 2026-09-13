// check:attribution — 팩을 쓰는 쪽이 **무엇을 적어야 하는지** 알 수 있는가.
//
// 라이선스 사고는 조용하다. 표기를 빠뜨려도 화면은 멀쩡하고 게이트도 통과하고,
// 몇 달 뒤 남이 알려 준다. 계약은 처음부터 클립마다 라이선스를 적게 했고 그
// 표에 `attribution: true` 가 있었는데 — **그 true 를 아무도 안 쓰고 있었다.**
//
// 수로 묻는 것:
//   1. 표기가 필요한 클립마다 출처 선언이 있는가
//   2. 고지문을 **옮겨 적지 않고** 원문 파일을 가리키는가 · 그 파일이 있는가
//   3. ATTRIBUTIONS.md 가 지금 팩과 맞는가 (낡으면 빠진 이름이 생긴다)
//   4. **새 라이선스가 들어오면 잡히는가** — CC-BY 클립을 하나 넣어 본다
//   5. 상업 불가·재배포 금지·동일조건이 눈에 띄게 적히는가

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import {
  attributionNeeds, attributionProblems, attributionsFor, attributionTally, attributionsMarkdown,
} from '../src/lib/attribution.mjs';
import { validateCatalog, LICENSES } from '../src/lib/motionPack.mjs';

runGate('check-attribution', (g) => {
  let n = 0;

  const catalogs = [];
  for (const id of fs.readdirSync(path.join(ROOT, 'packs'))) {
    const f = path.join(ROOT, 'packs', id, 'catalog.json');
    if (fs.existsSync(f)) catalogs.push(JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  if (catalogs.length < 3) { g.setupFail(`팩이 ${catalogs.length}개다`); return n; }
  catalogs.sort((a, b) => (a.packId < b.packId ? -1 : 1));
  const readNotice = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf8') : null);

  // ── 1·2. 팩마다 표기가 채워졌는가 ──
  for (const cat of catalogs) {
    n++;
    const probs = attributionProblems(cat);
    if (probs.length) g.fail(`pack/${cat.packId}`, probs.map((p) => `${p.key}: ${p.why}`).join(' · '));
    n++;
    // 고지문 파일이 진짜 있는가 — 가리키기만 하고 없으면 아무것도 못 적는다.
    for (const o of cat.origins || []) {
      if (!readNotice(o.noticeFile)) g.fail(`pack/${cat.packId}/notice`, `${o.noticeFile} 가 없다`);
    }
  }
  {
    n++;
    const tally = attributionTally(catalogs);
    if (!(tally.needing > 0)) g.fail('tally/none', '표기가 필요한 클립이 0개다 — 이 저장소의 자산은 MIT 다');
    n++;
    if (tally.total !== catalogs.reduce((s, c) => s + c.clips.length, 0)) g.fail('tally/total', '클립 수를 잘못 센다');
    console.log(`  [표기] 클립 ${tally.total}개 중 표기 필요 ${tally.needing} · 불필요 ${tally.free} (${Object.entries(tally.byLicense).map(([k, v]) => `${k} ${v}`).join(' · ')})`);
  }

  // ── 3. ATTRIBUTIONS.md 가 지금 팩과 맞는가 ──
  {
    const file = path.join(ROOT, 'ATTRIBUTIONS.md');
    n++;
    if (!fs.existsSync(file)) {
      g.fail('file/none', 'ATTRIBUTIONS.md 가 없다 — node scripts/build-attributions.mjs');
    } else {
      n++;
      // **다시 만들어 견준다.** 낡았는지 보는 가장 곧은 길이다.
      const now = attributionsMarkdown(catalogs, { readNotice });
      if (fs.readFileSync(file, 'utf8') !== now) {
        g.fail('file/stale', 'ATTRIBUTIONS.md 가 지금 팩과 다르다 — 다시 만들 것 (자산이 늘면 빠진 이름이 생긴다)');
      }
      n++;
      // 원문 고지가 정말 들어 있는가 — 가장 중요한 한 줄로 본다.
      const notice = readNotice('licenses/microsoft-rocketbox.LICENSE.md') || '';
      const holder = notice.split('\n').find((l) => /^Copyright/.test(l));
      if (!holder || !fs.readFileSync(file, 'utf8').includes(holder)) {
        g.fail('file/holder', `저작권 고지('${holder}')가 ATTRIBUTIONS.md 에 없다`);
      }
    }
  }

  // ── 4. 새 라이선스가 들어오면 잡히는가 ──
  //
  // **여기가 이 게이트의 요점이다.** 지금은 전부 MIT 하나라 아무 일도 안
  // 일어난다 — 노인이나 계단을 다른 출처에서 받는 날이 시험대이고, 그날
  // 이 검사가 살아 있어야 한다. 그래서 그날을 여기서 미리 만들어 본다.
  {
    const base = catalogs.find((c) => c.origins?.length);
    n++;
    if (!base) { g.setupFail('출처가 적힌 팩이 없다'); return n; }

    const withCcBy = {
      ...base,
      clips: [...base.clips, {
        id: 'borrowed',
        name: { ko: '빌린 동작', en: 'Borrowed' },
        license: 'CC-BY-4.0',
        source: { tool: 'some/other-source' },
        durationS: 1,
        rootMotion: 'in-place',
        contacts: [],
      }],
    };
    n++;
    const probs = attributionProblems(withCcBy);
    if (!probs.some((p) => p.key === 'origin/some/other-source')) {
      g.fail('new/unknown', 'CC-BY 클립을 넣었는데 출처가 없다고 안 한다 — 표기 의무가 조용히 새는 자리다');
    }
    n++;
    const needs = attributionNeeds(withCcBy);
    if (!needs.some((x) => x.license === 'CC-BY-4.0' && !x.origin)) {
      g.fail('new/needs', '표기가 필요한 새 출처를 안 세운다');
    }
    n++;
    // **고지문을 글로 적으면 막는다** — 옮겨 적으면 원문과 갈린다.
    const inlined = { ...base, origins: [{ ...base.origins[0], notice: 'Copyright (c) 2020 Microsoft' }] };
    if (!attributionProblems(inlined).some((p) => /inline/.test(p.key))) {
      g.fail('new/inline', '고지문을 글로 옮겨 적어 두었는데 안 막는다');
    }
    n++;
    if (!validateCatalog(inlined).some((e) => /origins\/.*\/inline/.test(e.id))) {
      g.fail('new/inline-contract', '계약이 옮겨 적은 고지문을 안 막는다');
    }
    n++;
    // 안 쓰는 출처를 적어 두면 남의 이름이 ATTRIBUTIONS 에 오른다.
    const stray = { ...base, origins: [...base.origins, { ...base.origins[0], tool: 'nobody/uses-this' }] };
    if (!attributionProblems(stray).some((p) => /unused/.test(p.key))) {
      g.fail('new/unused', '쓰지도 않는 출처를 받아 준다');
    }
    n++;
    // 확인한 날이 없으면 막는다 — 원문은 바뀔 수 있다.
    const undated = { ...base, origins: [{ ...base.origins[0], checked: undefined }] };
    if (!attributionProblems(undated).some((p) => /checked/.test(p.key))) {
      g.fail('new/checked', '원문을 언제 확인했는지 없이 받아 준다');
    }
  }

  // ── 5. 위험한 라이선스가 눈에 띄는가 ──
  {
    const risky = {
      ...catalogs[0],
      clips: [
        { id: 'a', license: 'CC-BY-NC-4.0', source: { tool: 't' }, durationS: 1, rootMotion: 'in-place', contacts: [] },
        { id: 'b', license: 'CC-BY-SA-4.0', source: { tool: 't' }, durationS: 1, rootMotion: 'in-place', contacts: [] },
        { id: 'c', license: 'Adobe-Mixamo', source: { tool: 't' }, durationS: 1, rootMotion: 'in-place', contacts: [] },
      ],
    };
    const md = attributionsMarkdown([risky], { readNotice });
    for (const [lic, word] of [['CC-BY-NC-4.0', '상업 사용 불가'], ['CC-BY-SA-4.0', '동일조건'], ['Adobe-Mixamo', '재배포 금지']]) {
      n++;
      if (!md.includes(word)) g.fail(`risk/${lic}`, `${lic} 인데 '${word}' 가 안 적힌다`);
    }
    n++;
    // Mixamo 는 표기가 필요 없지만 **재배포가 안 된다** — 그 사실이 표에 남아야 한다.
    if (LICENSES['Adobe-Mixamo'].attribution !== false) g.fail('risk/mixamo', 'Mixamo 가 표기를 요구한다고 적혀 있다');
    n++;
    const items = attributionsFor([risky]);
    if (!items.length) g.fail('risk/items', '표기가 필요한 것이 있는데 목록이 비었다');
  }

  return n;
});
