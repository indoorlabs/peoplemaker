// check:pack — 계약(Motion Asset Pack)이 실제로 막는가.
//
// 계약은 이 저장소의 유일한 외부 표면이다. 검사기가 통과만 시키면 계약이
// 없는 것과 같으므로, **일부러 깬 카탈로그를 넣어 잡히는지**를 여기서 본다.
// 그리고 packs/ 에 실제로 들어 있는 팩을 같은 검사기로 돌린다.
//
// 네 가지를 본다:
//   1. 멀쩡한 것을 통과시키는가 (막기만 하는 검사기도 쓸모없다)
//   2. 계약이 말하는 것을 정말로 막는가 — 종류마다 하나씩
//   3. 라이선스 판단이 값에서 나오는가 (사람의 기억이 아니라)
//   4. packs/ 의 실제 팩이 계약을 지키는가

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import {
  validateCatalog, packRedistributable, commercialClips,
  SKELETONS, ROOT_MOTIONS, LICENSES,
} from '../src/lib/motionPack.mjs';

/** 계약을 지키는 최소 카탈로그. 아래 시험들은 여기서 한 군데씩만 깬다. */
const good = () => ({
  packId: 'test-pack',
  version: '0.1.0',
  skeleton: 'mixamo',
  clips: [
    {
      id: 'walk-forward',
      name: { ko: '앞으로 걷기', en: 'Walk forward' },
      durationS: 1.2,
      rootMotion: 'travel',
      speedMps: 1.35,
      license: 'CC0-1.0',
      source: { tool: 'mixamo' },
      contacts: [
        { atS: 0.0, part: 'foot-l', kind: 'plant' },
        { atS: 0.6, part: 'foot-r', kind: 'plant' },
      ],
    },
    {
      id: 'sit-down',
      name: { ko: '앉기', en: 'Sit down' },
      durationS: 2.4,
      rootMotion: 'in-place',
      license: 'CC-BY-4.0',
      source: { tool: 'mixamo' },
      contacts: [{ atS: 1.8, part: 'hip', kind: 'sit' }],
    },
  ],
});

const ids = (errs) => errs.map((e) => e.id).join(' ');

runGate('check-pack', (g) => {
  let n = 0;

  // ── 1. 멀쩒한 것은 통과한다 ──
  n++;
  {
    const errs = validateCatalog(good());
    if (errs.length) g.fail('good/rejected', `계약을 지키는 카탈로그를 막는다 — ${ids(errs)}`);
  }

  // ── 2. 계약이 말하는 것을 정말로 막는가 ──
  //
  // 하나씩 깨서 **그 결함이 나오는지**까지 본다. "무엇이든 실패했다" 로
  // 세면, 엉뚱한 이유로 실패해도 통과한 것처럼 보인다.
  const breaks = [
    ['판 번호를 뺀다', (c) => { delete c.version; }, 'catalog/version'],
    ['스켈레톤을 아무 이름으로', (c) => { c.skeleton = 'smplx'; }, 'catalog/skeleton'],
    ['클립을 비운다', (c) => { c.clips = []; }, 'catalog/empty'],
    ['id 를 겹치게', (c) => { c.clips[1].id = c.clips[0].id; }, 'clip/walk-forward/dup'],
    ['이름을 한 언어만', (c) => { delete c.clips[0].name.en; }, 'clip/walk-forward/name'],
    ['길이를 0 으로', (c) => { c.clips[0].durationS = 0; }, 'clip/walk-forward/duration'],
    ['이동 클립인데 속도를 뺀다', (c) => { delete c.clips[0].speedMps; }, 'clip/walk-forward/speed'],
    ['제자리 클립에 속도를 준다', (c) => { c.clips[1].speedMps = 1.2; }, 'clip/sit-down/speed-inplace'],
    ['라이선스를 뺀다', (c) => { delete c.clips[0].license; }, 'clip/walk-forward/license'],
    ['모르는 라이선스', (c) => { c.clips[0].license = 'WTFPL'; }, 'clip/walk-forward/license-unknown'],
    ['무엇으로 만들었는지 뺀다', (c) => { delete c.clips[0].source; }, 'clip/walk-forward/source'],
    ['접촉 시각을 길이 밖으로', (c) => { c.clips[1].contacts[0].atS = 9.9; }, 'clip/sit-down/contact0/range'],
    ['접촉 부위를 아무 이름으로', (c) => { c.clips[1].contacts[0].part = 'butt'; }, 'clip/sit-down/contact0/part'],
    ['루트 모션을 아무 이름으로', (c) => { c.clips[0].rootMotion = 'moving'; }, 'clip/walk-forward/rootMotion'],
  ];
  for (const [why, breakIt, wantId] of breaks) {
    n++;
    const c = good();
    breakIt(c);
    const errs = validateCatalog(c);
    if (!errs.some((e) => e.id === wantId)) {
      g.fail(`break/${wantId}`, `${why} — '${wantId}' 가 안 나온다 (나온 것: ${ids(errs) || '없음'})`);
    }
  }

  // ── 3. 라이선스 판단이 값에서 나오는가 ──
  //
  // 사람이 "이건 상업 사용 되던가?" 를 기억하지 않게 하는 것이 이 필드의
  // 요점이다. 표를 고치면 판단이 따라와야 한다.
  {
    n++;
    const c = good();
    if (!packRedistributable(c)) g.fail('license/redist', 'CC0·CC-BY 만 든 팩이 재배포 불가로 나온다');
    n++;
    c.clips[0].license = 'Adobe-Mixamo';   // 재배포 금지
    if (packRedistributable(c)) {
      g.fail('license/redist-mixamo', 'Mixamo 클립이 든 팩을 공개 배포 가능이라고 한다 — 재배포 금지 자산이다');
    }
    n++;
    const nc = good();
    nc.clips[1].license = 'CC-BY-NC-4.0';
    if (commercialClips(nc).length !== 1) {
      g.fail('license/commercial', `비상업 클립을 걸러내지 못한다 (${commercialClips(nc).length}개가 남았다)`);
    }
    n++;
    // 표 자체가 말이 되는가 — 상업 가능하다면서 조건도 재배포도 안 적힌 것이
    // 있으면, 그것은 표가 덜 채워진 것이다.
    for (const [key, spec] of Object.entries(LICENSES)) {
      if (typeof spec.commercial !== 'boolean') g.fail(`license/${key}`, '상업 사용 가능 여부가 값으로 없다');
    }
  }

  // ── 4. 선언이 서로 어긋나지 않는가 ──
  {
    n++;
    if (!Object.keys(SKELETONS).length) g.fail('decl/skeleton', '스켈레톤 규약이 하나도 없다');
    n++;
    if (!ROOT_MOTIONS.includes('in-place') || !ROOT_MOTIONS.includes('travel')) {
      g.fail('decl/rootMotion', '루트 모션 정책이 둘 다 있어야 한다');
    }
    n++;
    // SMPL-X 를 규약으로 삼지 않기로 한 결정이 코드에 남아 있는가.
    // (docs/plan-peoplemaker-ko.md §1 — 라이선스를 갈아 끼울 수 있어야 한다)
    if (Object.keys(SKELETONS).some((k) => /smpl/i.test(k))) {
      g.fail('decl/smpl', 'SMPL 계열을 스켈레톤 규약으로 삼았다 — 상업 라이선스가 계약에 박힌다');
    }
  }

  // ── 5. packs/ 의 실제 팩 ──
  {
    const dir = path.join(ROOT, 'packs');
    const packs = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'catalog.json')))
      : [];
    for (const p of packs) {
      n++;
      let doc;
      try { doc = JSON.parse(fs.readFileSync(path.join(dir, p, 'catalog.json'), 'utf8')); }
      catch (e) { g.fail(`pack/${p}/parse`, e.message); continue; }
      const clipDir = path.join(dir, p, 'clips');
      const files = fs.existsSync(clipDir) ? fs.readdirSync(clipDir).filter((f) => f.endsWith('.glb')) : [];
      for (const e of validateCatalog(doc, { clipFiles: files })) g.fail(`pack/${p}/${e.id}`, e.msg);
    }
    console.log(`  [팩] 검사한 팩 ${packs.length}개 · 계약 위반을 ${breaks.length}가지 방식으로 확인했다`);
  }

  return n;
});
