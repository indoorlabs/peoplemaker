// check:consumer — **소비처가 부르는 차례가 그대로 도는가.**
//
// spacemaker 는 이 저장소를 커밋 하나에 핀해 두고 쓴다. 그 사이 우리는 34개를
// 더 쌓았다 — 그중에는 **부르는 쪽이 안 바꿔도 동작이 달라지는 것**이 있다:
//
//   · playClip 이 이제 0.25초 섞는다 (즉시가 아니다)
//   · walkAt 이 다친 걸음을 기본 후보에서 뺀다
//   · 카탈로그에 person·origins·holds·grip·thumb 가 늘었다
//   · 팩에 body-far*.glb 가 생겼다
//
// 저쪽 코드를 읽어 **실제로 부르는 것만** 골라 여기서 돌려 본다. 저쪽 저장소를
// 건드리지 않고도 "라이브러리를 올리면 깨지는가" 를 여기서 답할 수 있다.
//
// 저쪽이 부르는 것 (components/PeopleLayer.jsx · PeopleAgentBodies.jsx):
//   loadPack · bakeFromPack · geometryOf · createClipPlayer · createInstancedCrowd
//   planCrowd · planCrowdMeasured · measuredFor · pickWalkClip
//   player: spawn · walkAt · playClip · placeAt · update
//
// 그리고 저쪽은 **제 팩을 따로 들고 있다** — 클립 9개에 bodyFar 도 person 도
// 없는 옛 꼴이다. 그러니 새 계약이 **옛 팩을 거부하면 안 된다.**

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import { validateCatalog } from '../src/lib/motionPack.mjs';

const PACK = 'ref-synthetic';

/** 저쪽의 클립 고르개 — components/PeopleLayer.jsx 의 PEOPLE_CLIPS 그대로. */
const PEOPLE_CLIPS = (catalog) => catalog.clips
  .filter((c) => c.rootMotion === 'travel' || c.id === 'idle')
  .map((c) => c.id);

runGate('check-consumer', async (g) => {
  let n = 0;

  const dir = path.join(ROOT, 'packs', PACK);
  n++;
  if (!fs.existsSync(path.join(dir, 'catalog.json'))) { g.setupFail(`${PACK} 이 없다`); return n; }

  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const SkeletonUtils = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const api = await import('../src/web/index.mjs');

  const fileFetch = async (u) => {
    const f = path.join(dir, u.replace(/^pack:\/\/x\/?/, ''));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return { ok: false, status: 404 };
    const b = fs.readFileSync(f);
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(b.toString('utf8')),
      arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    };
  };

  // ── 1. 옛 팩 꼴을 계약이 받아 주는가 ──
  //
  // 저쪽이 들고 있는 카탈로그에는 person·bodyFar·origins·holds·grip·thumb 가
  // 하나도 없다. 새로 더한 것들이 **있어야만 통과** 하게 돼 있으면, 저쪽은
  // 라이브러리를 올리는 순간 팩이 통째로 거부된다.
  {
    const cat = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
    const old = {
      packId: cat.packId,
      version: cat.version,
      skeleton: cat.skeleton,
      body: cat.body,
      forwardRad: cat.forwardRad,
      builtBy: cat.builtBy,
      clips: cat.clips.map((c) => {
        const { thumb, holds, grip, ...rest } = c;
        return rest;
      }),
    };
    n++;
    const bad = validateCatalog(old);
    if (bad.length) {
      g.fail('old/catalog', `옛 꼴의 카탈로그를 거부한다 (${bad.length}건): ${bad.slice(0, 3).map((e) => e.id).join(' · ')}`);
    }
    n++;
    // 새로 더한 것이 **있어도** 통과해야 한다 (지금 팩 그대로).
    if (validateCatalog(cat).length) g.fail('new/catalog', '지금 꼴의 카탈로그를 거부한다');
  }

  // ── 2. 저쪽이 부르는 것이 다 있는가 ──
  {
    const need = ['loadPack', 'bakeFromPack', 'geometryOf', 'createClipPlayer',
      'createInstancedCrowd', 'planCrowd', 'planCrowdMeasured', 'measuredFor', 'pickWalkClip'];
    const gone = [];
    for (const k of need) {
      n++;
      if (typeof api[k] !== 'function') { g.fail(`api/${k}`, '소비처가 부르는데 문에 없다'); gone.push(k); }
    }
    // **없는 것을 부르러 가지 않는다.** 처음에는 그냥 지나가서, 아래에서
    // TypeError 로 게이트가 통째로 터졌다 — 터진 게이트는 결함을 못 적는다.
    if (gone.length) return n;
  }

  // ── 3. 저쪽이 부르는 차례를 그대로 돌려 본다 ──
  let pack = null;
  try {
    pack = await api.loadPack({ url: 'pack://x', GLTFLoader, fetchImpl: fileFetch, clips: PEOPLE_CLIPS });
  } catch (e) {
    g.fail('run/loadPack', `저쪽이 부르는 꼴로 팩을 못 받는다 — ${e.message}`);
    return n;
  }
  n++;
  if (!pack.catalog) g.fail('run/catalog', '받은 것에 카탈로그가 없다');
  n++;
  // 고르개가 고른 것만 왔는가 — 다 받으면 저쪽이 몇 MB 를 더 받는다.
  const want = PEOPLE_CLIPS(pack.catalog);
  const missing = want.filter((id) => !pack.has(id));
  if (missing.length) g.fail('run/clips', `고른 클립을 다 안 받았다: ${missing.join(' · ')}`);

  const player = api.createClipPlayer({
    THREE, SkeletonUtils, catalog: pack.catalog, gltfOf: pack.gltfOf,
  });
  n++;
  const person = player.spawn({ clipId: 'idle', position: [0, 0, 0], headingRad: 0 });
  if (!person) g.fail('run/spawn', '사람을 못 세운다');

  n++;
  // **저쪽은 walkAt 의 결과에서 effectiveMps 를 읽는다** (PeopleAgentBodies:121).
  const pick = player.walkAt(person, 1.2);
  if (!pick || !(pick.effectiveMps > 0)) {
    // **여기서 멈춘다.** 이름이 바뀌면 아래에서 undefined.toFixed 로 터지고,
    // 터진 게이트는 "무엇이 왜" 를 못 적는다.
    g.fail('run/walkAt', `walkAt 이 ${JSON.stringify(pick)} 를 낸다 — effectiveMps 를 읽는 쪽(PeopleAgentBodies:121)이 깨진다`);
    return n;
  }
  n++;
  // **다친 걸음이 기본으로 뽑히면 안 된다** — 저쪽은 그냥 속도만 준다.
  if (pick && (pack.catalog.clips.find((c) => c.id === pick.clipId)?.tags || []).includes('distress')) {
    g.fail('run/distress', `평범한 걸음을 달랬는데 ${pick.clipId} 가 나온다`);
  }
  {
    // 그런데 **기준 팩에는 다친 걸음이 아예 없다** — 위 한 줄은 볼 것이 없는
    // 검사였다 (일부러 깨 봤더니 안 깨져서 알았다). 그래서 속도가 정확히 맞는
    // 다친 걸음을 하나 **끼워 넣고** 묻는다: 속도로만 고르면 이것이 1등이다.
    const bait = {
      ...pack.catalog,
      clips: [...pack.catalog.clips, {
        id: 'bait-injured',
        rootMotion: 'travel',
        speedMps: 1.2,
        tags: ['distress'],
        contacts: [{ kind: 'plant', tS: 0, side: 'l' }],
      }],
    };
    n++;
    const lure = api.pickWalkClip(bait, 1.2);
    if (lure?.clipId === 'bait-injured') {
      g.fail('run/distress-bait', '속도가 딱 맞는다고 다친 걸음을 골랐다 — 멀쩡한 재실자가 전부 절뚝인다');
    }
    n++;
    // 반대쪽도 봐야 한다 — **달라고 하면 줘야** 이 걸러내기가 쓸모가 있다.
    const asked = api.pickWalkClip(bait, 1.2, { distress: true });
    if (asked?.clipId !== 'bait-injured') {
      g.fail('run/distress-ask', `다친 걸음을 달랬는데 ${asked?.clipId ?? '아무것도'} 가 나온다`);
    }
  }
  n++;
  const sameAgain = player.walkAt(person, 1.2);
  if (sameAgain?.clipId !== pick?.clipId) g.fail('run/stable', '같은 속도를 두 번 물었는데 다른 클립이 나온다');

  // **저쪽은 안 걸을 때 프레임마다 playClip('idle') 를 부른다** (PeopleAgentBodies:122).
  player.playClip(person, 'idle');
  n++;
  // 섞기가 끝나면 앞 액션을 놓는가 (저쪽은 사람을 수백 명 세운다).
  for (let t = 0; t < 1; t += 1 / 60) player.update(1 / 60);
  if (person.fading) g.fail('run/fade', '1초가 지나도 섞기가 안 끝난다 — 사람마다 액션이 쌓인다');

  n++;
  // **시각이 흐르고 있어야 아래 둘이 볼 것이 있다.** 처음에는 갓 태어난
  // 사람에게 물어서 재생 시각이 0 이었다 — 그래서 "0 으로 되돌리는" 고장을
  // 일부러 넣어도 게이트가 통과했다.
  const before = player.timeOf(person);
  if (!(before > 0)) { g.fail('run/advance', `1초를 돌렸는데 재생 시각이 ${before} 다`); return n; }

  n++;
  // 같은 클립이면 아무것도 안 해야 한다 — 안 그러면 매 프레임 다시 틀어서
  // 사람이 영영 첫 자세에 굳는다.
  for (let i = 0; i < 5; i++) player.playClip(person, 'idle');
  if (player.timeOf(person) !== before) {
    g.fail('run/playClip-repeat', `같은 클립을 다시 트니 재생 시각이 ${before} 에서 ${player.timeOf(person)} 로 간다 — 프레임마다 부르는 쪽에서는 자세가 굳는다`);
  }
  n++;
  if (person.fading) g.fail('run/playClip-fade', '같은 클립인데 섞기를 새로 시작한다');

  n++;
  // 저쪽은 프레임마다 placeAt 으로 옮긴다 — 재생 시각을 안 건드려야 한다.
  player.placeAt(person, [3, 0, 4], Math.PI / 2);
  if (player.timeOf(person) !== before) g.fail('run/placeAt', '자리만 옮겼는데 재생 시각이 달라졌다');

  // ── 4. 예산 — 저쪽은 이것으로 몇 명을 어느 방식으로 세울지 정한다 ──
  {
    n++;
    const plan = api.planCrowd(200, 4, ['full', 'instanced']);
    if (!plan?.mix?.length) g.fail('run/planCrowd', '예산이 아무것도 안 낸다');
    n++;
    const table = api.measuredFor('rocketbox-f01');
    if (!table) g.fail('run/measuredFor', 'rocketbox-f01 의 잰 표가 없어졌다 — 저쪽이 이 이름으로 찾는다');
    else {
      n++;
      const m = api.planCrowdMeasured(200, 4, table, ['full', 'instanced']);
      if (!m?.mix?.length) g.fail('run/planCrowdMeasured', '잰 표로 세운 예산이 비었다');
    }
    n++;
    const p2 = api.pickWalkClip(pack.catalog, 1.2);
    if (!p2?.clipId) g.fail('run/pickWalkClip', '걸음을 못 고른다');
  }

  // ── 5. 먼 군중 — 굽고 세운다 ──
  {
    n++;
    const atlas = api.bakeFromPack(pack, want.filter((id) => ['idle', 'walk-forward'].includes(id)));
    if (!atlas?.clips?.length) { g.fail('run/atlas', '아틀라스를 못 굽는다'); return n; }
    n++;
    const geom = api.geometryOf(pack);
    if (!geom?.getAttribute('position')) g.fail('run/geometry', '살을 못 가져온다');
    n++;
    const crowd = api.createInstancedCrowd({ THREE, geometry: geom, atlas, count: 50 });
    crowd.place(0, { position: [1, 0, 2], headingRad: 0, clipId: atlas.clips[0].id });
    crowd.update(0.05);
    if (!crowd.mesh) g.fail('run/crowd', '군중 메시가 없다');
    crowd.dispose();
    console.log(`  [소비처] 저쪽이 부르는 차례가 그대로 돈다 — 클립 ${want.length}개(${want.join('·')}) · 걸음 ${pick?.clipId} ×${pick?.timeScale.toFixed(2)} → ${pick?.effectiveMps.toFixed(2)}m/s`);
  }

  // ── 6. 저쪽이 들고 있는 팩은 얼마나 낡았는가 ──
  //
  // **깨지는 것은 아니다** — 옛 팩도 받아 준다. 다만 저쪽은 먼 층도 배역도
  // 못 쓴다. 그 사실을 수로 남긴다.
  {
    const here = JSON.parse(fs.readFileSync(path.join(ROOT, 'packs', 'rocketbox-f01', 'catalog.json'), 'utf8'));
    n++;
    if (!here.bodyFar?.length) g.fail('now/far', '지금 팩에 먼 몸이 없다');
    n++;
    if (!here.person) g.fail('now/person', '지금 팩에 사람이 누구인지가 없다');
    console.log(
      `  [소비처] 지금 팩: 클립 ${here.clips.length} · 먼 몸 ${here.bodyFar.length}단계 · 배역 가능 · 장비 ${here.clips.filter((c) => c.grip).length}개`,
    );
  }

  return n;
});
