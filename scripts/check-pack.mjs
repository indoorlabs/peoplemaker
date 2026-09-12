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
//   5. 몸 + 동작으로 나눈 팩이 몸째인 것과 같은 자세를 내는가

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import {
  validateCatalog, validateSplitFiles, packRedistributable, commercialClips,
  SKELETONS, ROOT_MOTIONS, LICENSES,
} from '../src/lib/motionPack.mjs';
import { parseGLB, sampleAnimation, parentMap, nodeWorldMatrix, animationDurationS } from '../src/lib/gltf.mjs';
import { buildGLB, FIXTURES } from '../src/lib/fixtureRig.mjs';
import { bakeClip } from '../src/lib/poseBake.mjs';
import { bodyOnly, motionOnly, extractAnimation, attachAnimation, encodeGLB } from '../src/lib/gltfWrite.mjs';

/** 계약을 지키는 최소 카탈로그. 아래 시험들은 여기서 한 군데씩만 깬다. */
const good = () => ({
  packId: 'test-pack',
  version: '0.1.0',
  skeleton: 'mixamo',
  forwardRad: 3.1416,
  clips: [
    {
      id: 'walk-forward',
      name: { ko: '앞으로 걷기', en: 'Walk forward' },
      durationS: 1.2,
      rootMotion: 'travel',
      speedMps: 1.35,
      travelHeadingRad: 3.1416,
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
    ['이동 클립인데 방향을 뺀다', (c) => { delete c.clips[0].travelHeadingRad; }, 'clip/walk-forward/travelHeading'],
    ['제자리 클립에 방향을 준다', (c) => { c.clips[1].travelHeadingRad = 0; }, 'clip/sit-down/travelHeading-inplace'],
    ['팩의 앞을 뺀다', (c) => { delete c.forwardRad; }, 'catalog/forwardRad'],
    ['앉은 높이를 0 으로', (c) => { c.clips[1].seat = { hipHeightM: 0, hipRatio: 0.4, groundOffsetM: 0 }; }, 'clip/sit-down/seat/height'],
    ['앉았는데 쉬는 자세보다 높다', (c) => { c.clips[1].seat = { hipHeightM: 1.2, hipRatio: 1.3, groundOffsetM: 0 }; }, 'clip/sit-down/seat/ratio'],
    ['앉은 클립의 바닥을 뺀다', (c) => { c.clips[1].seat = { hipHeightM: 0.4, hipRatio: 0.42 }; }, 'clip/sit-down/seat/ground'],
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
    let split = 0;
    for (const p of packs) {
      n++;
      let doc;
      try { doc = JSON.parse(fs.readFileSync(path.join(dir, p, 'catalog.json'), 'utf8')); }
      catch (e) { g.fail(`pack/${p}/parse`, e.message); continue; }
      const clipDir = path.join(dir, p, 'clips');
      const files = fs.existsSync(clipDir) ? fs.readdirSync(clipDir).filter((f) => f.endsWith('.glb')) : [];
      const packFiles = fs.readdirSync(path.join(dir, p));
      for (const e of validateCatalog(doc, { clipFiles: files, packFiles })) g.fail(`pack/${p}/${e.id}`, e.msg);
      // 나뉜 팩이면 파일 **내용**까지 — 동작 파일에 몸이 다시 들어가지 않았는가,
      // 동작이 몸에 없는 뼈를 움직이지 않는가.
      if (typeof doc.body === 'string' && fs.existsSync(path.join(dir, p, doc.body))) {
        n++;
        const body = parseGLB(fs.readFileSync(path.join(dir, p, doc.body)));
        const clipDocs = files.map((f) => ({ id: f.replace(/\.glb$/, ''), doc: parseGLB(fs.readFileSync(path.join(clipDir, f))) }));
        for (const e of validateSplitFiles(body, clipDocs)) g.fail(`pack/${p}/${e.id}`, e.msg);
        split++;
      }
    }
    console.log(`  [팩] 검사한 팩 ${packs.length}개(나뉜 팩 ${split}) · 계약 위반을 ${breaks.length}가지 방식으로 확인했다`);
  }

  // ── 6. 나뉜 팩 — 몸 + 동작이 몸째인 것과 같은가 ──
  //
  // 팩을 몸 하나 + 동작들로 나눴다 (동작 9개인 사람이 46MB → 11MB). 나눴다가
  // 다시 이은 것이 몸째인 것과 **같은 자세**를 내야 한다 — 뼈 위치와 구운
  // 행렬 두 자로 본다. 이름으로 잇기 때문에, 이름이 하나라도 어긋나면 여기서 갈린다.
  {
    const body0 = parseGLB(buildGLB(FIXTURES[0]));
    const body = parseGLB(encodeGLB(bodyOnly(body0)));
    let worstPos = 0;
    let worstBake = 0;
    let where = '';
    for (const spec of FIXTURES) {
      const full = parseGLB(buildGLB(spec));
      const { doc: m, missing } = motionOnly(body0, extractAnimation(full));
      n++;
      if (missing.length) { g.fail(`split/${spec.id}/missing`, `몸에 없는 뼈 ${missing.join(', ')}`); continue; }
      const joined = attachAnimation(body, parseGLB(encodeGLB(m)));
      const pf = parentMap(full);
      const pj = parentMap(joined);
      const idxJ = new Map(joined.json.nodes.map((nd, i) => [nd.name, i]));
      const dur = animationDurationS(full, 0);
      for (const t of [0, 0.29, 0.53, 0.97].map((f) => f * dur)) {
        const sf = sampleAnimation(full, 0, t);
        const sj = sampleAnimation(joined, 0, t);
        for (const j of full.json.skins[0].joints) {
          const a = nodeWorldMatrix(full, j, sf, pf);
          const b = nodeWorldMatrix(joined, idxJ.get(full.json.nodes[j].name), sj, pj);
          const d = Math.hypot(a[12] - b[12], a[13] - b[13], a[14] - b[14]);
          if (d > worstPos) { worstPos = d; where = `${spec.id} @${t.toFixed(2)}s`; }
        }
      }
      const bf = bakeClip(full).data;
      const bj = bakeClip(joined).data;
      if (bf.length !== bj.length) worstBake = Infinity;
      else for (let i = 0; i < bf.length; i++) worstBake = Math.max(worstBake, Math.abs(bf[i] - bj[i]));
    }
    // **노드 순서가 다른 동작.** 우리 동작 파일은 몸의 노드 순서를 그대로 베껴서,
    // 번호로 이어도 이름으로 이어도 같은 답이 나온다 — 번호로 잇게 깨 봤더니
    // 위 검사가 통과했다. 다른 데서 온 동작은 순서가 다르므로 뒤집어 본다.
    {
      const full = parseGLB(buildGLB(FIXTURES[0]));
      const m = motionOnly(body0, extractAnimation(full)).doc;
      const j = JSON.parse(JSON.stringify(m.json));
      const perm = [...j.nodes.keys()].reverse();              // 새 자리 i ← 옛 자리 perm[i]
      const inv = new Map(perm.map((old, i) => [old, i]));
      j.nodes = perm.map((old) => ({ ...j.nodes[old], ...(j.nodes[old].children ? { children: j.nodes[old].children.map((c) => inv.get(c)) } : {}) }));
      j.scenes = j.scenes.map((sc) => ({ ...sc, nodes: sc.nodes.map((x) => inv.get(x)) }));
      for (const a of j.animations) for (const c of a.channels) c.target.node = inv.get(c.target.node);
      const joined = attachAnimation(body, { json: j, bin: m.bin });
      const pf = parentMap(full);
      const pj = parentMap(joined);
      const idxJ = new Map(joined.json.nodes.map((nd, i) => [nd.name, i]));
      let worst = 0;
      for (const t of [0.2, 0.7].map((f) => f * animationDurationS(full, 0))) {
        const sf = sampleAnimation(full, 0, t);
        const sj = sampleAnimation(joined, 0, t);
        for (const jt of full.json.skins[0].joints) {
          const a = nodeWorldMatrix(full, jt, sf, pf);
          const b = nodeWorldMatrix(joined, idxJ.get(full.json.nodes[jt].name), sj, pj);
          worst = Math.max(worst, Math.hypot(a[12] - b[12], a[13] - b[13], a[14] - b[14]));
        }
      }
      n++;
      if (worst > 1e-5) g.fail('split/by-name', `노드 순서가 다른 동작을 이었더니 뼈가 ${(worst * 1000).toFixed(1)}mm 어긋난다 — 이름이 아니라 번호로 잇는다`);
    }
    n++;
    if (worstPos > 1e-5) g.fail('split/equivalent', `나눴다 이은 것의 뼈가 몸째인 것과 ${(worstPos * 1000).toFixed(3)}mm 다르다 (${where})`);
    n++;
    if (worstBake > 1e-5) g.fail('split/bake', `나눴다 이은 것을 구운 행렬이 ${worstBake} 만큼 다르다`);

    // 몸에서 애니메이션 바이트까지 걷었는가 — 이름만 지우면 파일은 그대로다.
    n++;
    const bo = bodyOnly(body0);
    const orphan = bo.json.bufferViews.filter((_, i) => !bo.json.accessors.some((a) => a.bufferView === i)
      && !(bo.json.images || []).some((im) => im.bufferView === i));
    if (bo.json.animations || orphan.length || !(bo.bin.byteLength < body0.bin.byteLength)) {
      g.fail('split/compact', `몸에 애니메이션이 남았거나 쓰지 않는 버퍼뷰 ${orphan.length}개가 남았다 (${body0.bin.byteLength} → ${bo.bin.byteLength} 바이트)`);
    }

    // 계약 검사기가 나뉜 팩의 잘못을 막는가
    const m0 = parseGLB(encodeGLB(motionOnly(body0, extractAnimation(parseGLB(buildGLB(FIXTURES[1])))).doc));
    n++;
    const clean = validateSplitFiles(body, [{ id: 'ok', doc: m0 }]);
    if (clean.length) g.fail('split/clean', `멀쩡한 몸 + 동작을 막는다 — ${clean.map((e) => e.id).join(', ')}`);
    const splitBreaks = [
      ['body/animation', () => [body0, [{ id: 'ok', doc: m0 }]]],
      ['clip/x/mesh', () => [body, [{ id: 'x', doc: body0 }]]],
      ['clip/x/names', () => {
        const j = JSON.parse(JSON.stringify(m0.json));
        j.nodes[j.animations[0].channels[0].target.node].name = 'nobody';
        return [body, [{ id: 'x', doc: { json: j, bin: m0.bin } }]];
      }],
      ['body/skin', () => {
        const j = JSON.parse(JSON.stringify(body.json));
        delete j.skins;
        return [{ json: j, bin: body.bin }, []];
      }],
    ];
    for (const [want, make] of splitBreaks) {
      n++;
      const ids = validateSplitFiles(...make()).map((e) => e.id);
      if (!ids.includes(want)) g.fail(`split/break/${want}`, `막아야 할 것을 못 막았다 — 나온 것: ${ids.join(', ') || '없음'}`);
    }
    const withBody = { ...good(), body: 'body.glb' };
    n++;
    if (validateCatalog(withBody, { packFiles: ['body.glb', 'catalog.json'] }).length) g.fail('split/catalog-ok', '몸이 있는 멀쩡한 카탈로그를 막는다');
    n++;
    if (!validateCatalog(withBody, { packFiles: ['catalog.json'] }).some((e) => e.id === 'catalog/body-file')) g.fail('split/catalog-missing', '몸 파일이 없는데 통과시킨다');
    n++;
    if (!validateCatalog({ ...good(), body: '../x.glb' }).some((e) => e.id === 'catalog/body')) g.fail('split/catalog-path', '팩 밖을 가리키는 몸 이름을 통과시킨다');
    console.log(`  [팩] 나뉜 팩: 픽스처 ${FIXTURES.length}개를 나눴다 이어 몸째와 견줬다 — 뼈 ${(worstPos * 1000).toFixed(4)}mm · 구운 행렬 ${worstBake.toExponential(1)}`);
  }

  return n;
});
