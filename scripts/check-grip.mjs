// check:grip — **무언가를 들고 있는 클립**이 쓸 수 있는 값을 내는가.
//
// 건물 안 사람의 절반은 무언가를 들고 있다 — 카트·가방·우산·서류철. 쓰는 쪽이
// 그 물건을 손에 붙이려면 두 가지를 알아야 한다:
//
//   **어느 뼈에 매달 것인가**   grip.bones (이름)
//   **손이 몸 어디쯤에 있는가** grip.heightM · forwardM · spanM
//
// 무엇을 들었는지는 **살을 봐서 알 수 없다** — 카트인지 유모차인지는 사람이
// 적는다(`holds`). 이 게이트가 지키는 것은 그 둘의 경계다: 적은 것이 낱말표
// 안에 있는가, 잰 것이 정말 재어졌는가, 그리고 **적힌 것과 잰 것이 크게
// 어긋나지 않는가.**
//
// ## 가설이 하나 틀렸다
//
// "양손으로 잡으면 두 손 사이가 안 흔들린다" 로 가르려 했는데, 재 보니
// **카트(양손)와 뛰기(빈손)가 똑같이 0.111m** 였다. 그래서 이 값은 증명을
// 못 하고 **반증만** 한다 — 서류 보기(0.34)나 마시기(0.31)처럼 크게 흔들리면
// 양손일 수 없다. 게이트는 그 사실을 수로 못 박는다.

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT, fullPacks, HOW_TO_GET_PACKS } from './gate-lib.mjs';
import { HELD_THINGS, HELD_HANDS, BOTH_HANDS_SPREAD_MAX, validateCatalog } from '../src/lib/motionPack.mjs';
import { deriveGrip } from '../src/lib/packBuild.mjs';
import { parseGLB } from '../src/lib/gltf.mjs';
import { attachAnimation } from '../src/lib/gltfWrite.mjs';

runGate('check-grip', (g) => {
  let n = 0;

  const cats = [];
  for (const id of fs.readdirSync(path.join(ROOT, 'packs'))) {
    const f = path.join(ROOT, 'packs', id, 'catalog.json');
    if (fs.existsSync(f)) cats.push({ id, cat: JSON.parse(fs.readFileSync(f, 'utf8')) });
  }
  n++;
  if (!cats.length) { g.setupFail('팩이 없다'); return n; }

  // ── 1. 적은 것이 낱말표 안인가 · 잰 것이 붙어 있는가 ──
  let held = 0;
  for (const { id, cat } of cats) {
    for (const c of cat.clips || []) {
      if (!c.holds) continue;
      held++;
      n++;
      if (!HELD_THINGS.includes(c.holds.what)) g.fail(`what/${id}/${c.id}`, `'${c.holds.what}' 는 아는 것이 아니다`);
      n++;
      if (!HELD_HANDS.includes(c.holds.hand)) g.fail(`hand/${id}/${c.id}`, `어느 손인지가 '${c.holds.hand}' 다`);
      n++;
      // **선언만 하고 안 재면 쓸 수가 없다** — 쓰는 쪽이 물건을 어디 맬지 모른다.
      if (!c.grip) { g.fail(`grip/${id}/${c.id}`, '드는 것을 적어 놓고 손이 어디인지는 안 쟀다'); continue; }
      n++;
      if (!c.grip.bones?.['hand-l'] || !c.grip.bones?.['hand-r']) {
        g.fail(`bones/${id}/${c.id}`, '붙일 뼈 이름이 없다');
      }
      n++;
      // 사람 몸에서 손이 있을 만한 자리인가 (무릎 아래나 머리 위면 잘못 잡았다).
      if (!(c.grip.heightM > 0.3 && c.grip.heightM < 2)) g.fail(`height/${id}/${c.id}`, `손 높이가 ${c.grip.heightM}m 다`);
      n++;
      if (!(c.grip.spanM > 0.05 && c.grip.spanM < 1.5)) g.fail(`span/${id}/${c.id}`, `두 손 사이가 ${c.grip.spanM}m 다`);
      n++;
      // **반증**: 양손이라 적혔는데 두 손이 크게 따로 놀면 그 선언이 틀렸다.
      if (c.holds.hand === 'both' && c.grip.spanSpreadM > BOTH_HANDS_SPREAD_MAX) {
        g.fail(`both/${id}/${c.id}`, `양손이라는데 두 손 사이가 ${c.grip.spanSpreadM}m 흔들린다`);
      }
    }
  }
  n++;
  // 새로 받은 쪽에는 기준 팩 하나뿐이고 거기에는 드는 클립이 없다 — 결함이
  // 아니라 볼 것이 없는 것이다.
  if (!held) { g.skip(`드는 클립이 있는 팩이 없다 — ${HOW_TO_GET_PACKS}`); return n; }
  n++;
  // 안 적었는데 잰 값만 있으면, 그 값이 어디서 왔는지 아무도 모른다.
  for (const { id, cat } of cats) {
    for (const c of cat.clips || []) {
      if (c.grip && !c.holds) g.fail(`orphan/${id}/${c.id}`, '무엇을 드는지 안 적었는데 잡은 자리만 재어져 있다');
    }
  }

  // ── 2. 계약이 어긋난 선언을 막는가 ──
  {
    const base = cats.find(({ cat }) => (cat.clips || []).some((c) => c.grip));
    n++;
    if (!base) { g.skip(`드는 클립이 있는 팩이 없다 — ${HOW_TO_GET_PACKS}`); return n; }
    const withGrip = base.cat.clips.find((c) => c.grip);
    const patch = (f) => {
      const c2 = JSON.parse(JSON.stringify(base.cat));
      f(c2.clips.find((c) => c.id === withGrip.id));
      return validateCatalog(c2).map((e) => e.id);
    };
    const breaks = [
      ['모르는 물건', (c) => { c.holds.what = 'spaceship'; }, `clip/${withGrip.id}/holds/what`],
      ['모르는 손', (c) => { c.holds.hand = 'third'; }, `clip/${withGrip.id}/holds/hand`],
      ['붙일 뼈를 지움', (c) => { delete c.grip.bones; }, `clip/${withGrip.id}/grip/bones`],
      ['안 적고 재기만', (c) => { delete c.holds; }, `clip/${withGrip.id}/grip/why`],
      ['두 손 사이가 0', (c) => { c.grip.spanM = 0; }, `clip/${withGrip.id}/grip/span`],
      ['한 손 동작을 양손이라고', (c) => { c.holds.hand = 'both'; c.grip.spanSpreadM = 0.4; }, `clip/${withGrip.id}/grip/both`],
    ];
    for (const [what, f, want] of breaks) {
      n++;
      if (!patch(f).includes(want)) g.fail(`break/${what}`, `${what} 했는데 '${want}' 로 안 잡는다`);
    }
  }

  // ── 3. 재는 것이 진짜인가 ──
  //
  // 위는 전부 카탈로그의 수를 본 것이다. 여기서는 **몸에 동작을 붙여 다시
  // 재서** 카탈로그와 견준다 — 두 군데서 따로 만들면 늘 갈린다.
  {
    const have = fullPacks();
    n++;
    if (!have.length) { g.skip(`진짜 몸이 없다 — ${HOW_TO_GET_PACKS}`); return n; }
    // **드는 클립이 있는 팩을 고른다.** 이름순 첫 팩을 집었더니 아직 안 받은
    // 팩이라 통째로 건너뛰었다 — 볼 것이 있는 데를 골라야 본다.
    const catOf = (x) => JSON.parse(fs.readFileSync(path.join(ROOT, 'packs', x, 'catalog.json'), 'utf8'));
    const id = have.find((x) => (catOf(x).clips || []).some((c) => c.grip)) || have[0];
    const dir = path.join(ROOT, 'packs', id);
    const cat = catOf(id);
    const body = fs.readFileSync(path.join(dir, 'body.glb'));
    const withGrip = (cat.clips || []).filter((c) => c.grip);
    n++;
    if (!withGrip.length) { g.skip(`${id} 에 드는 클립이 없다 — ${HOW_TO_GET_PACKS}`); return n; }

    for (const c of withGrip.slice(0, 4)) {
      const doc = attachAnimation(parseGLB(body), parseGLB(fs.readFileSync(path.join(dir, 'clips', `${c.id}.glb`))));
      const again = deriveGrip(doc, { skeleton: cat.skeleton, forwardRad: cat.forwardRad });
      n++;
      if (JSON.stringify(again) !== JSON.stringify(c.grip)) {
        g.fail(`redo/${c.id}`, `다시 재니 다르다 — ${JSON.stringify(c.grip)} vs ${JSON.stringify(again)}`);
      }
    }

    // **견줄 자**: 빈손 동작도 재 본다. 드는 동작과 수가 똑같으면 재는 것이
    // 아무것도 안 보고 있는 것이다.
    const idle = (cat.clips || []).find((c) => c.id === 'idle');
    n++;
    if (idle) {
      const doc = attachAnimation(parseGLB(body), parseGLB(fs.readFileSync(path.join(dir, 'clips', 'idle.glb'))));
      const empty = deriveGrip(doc, { skeleton: cat.skeleton, forwardRad: cat.forwardRad });
      const any = withGrip.find((c) => c.grip.heightM !== empty.heightM);
      if (!any) g.fail('contrast', '드는 동작과 빈손이 손 높이가 다 같다 — 재는 것이 자세를 안 보고 있다');
      else {
        console.log(`  [잡기] 빈손(서기) 손 높이 ${empty.heightM}m · 두 손 사이 ${empty.spanM}m (흔들림 ${empty.spanSpreadM}m)`);
      }
    }
    const w = (s, k) => String(s).padEnd(k);
    for (const c of withGrip) {
      console.log(`  [잡기] ${w(c.id, 11)} ${w(`${c.holds.what}/${c.holds.hand}`, 18)} 두 손 사이 ${w(c.grip.spanM, 7)} 흔들림 ${w(c.grip.spanSpreadM, 7)} 높이 ${w(c.grip.heightM, 7)} 뼈 ${c.grip.bones['hand-r']}`);
    }
    console.log(`  [잡기] 드는 클립 ${held}개 (팩 ${cats.length}개) · 양손 선언은 흔들림 ${BOTH_HANDS_SPREAD_MAX}m 를 넘으면 막는다 (증명이 아니라 반증이다)`);
  }

  return n;
});
