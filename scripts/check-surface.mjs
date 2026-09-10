// check:surface — 밖에서 보는 문이 하나이고, 그 문이 README 와 같은가.
//
// 소비처(spacemaker · urbanspace)가 안쪽 파일을 직접 가져가기 시작하면
// "계약이 유일한 외부 표면" 이 말뿐이 된다 — 내부를 고칠 때마다 남의
// 저장소가 깨지고, 그러면 아무도 내부를 못 고친다.
//
// 그래서 셋을 본다:
//   1. src/web/index.mjs 가 문서에 적힌 것을 실제로 내보내는가
//   2. 그 문이 실제로 **동작하는가** (팩을 받아 계약으로 검사하고 굽는다)
//   3. 계약을 어긴 팩을 **받는 자리에서** 막는가

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import * as api from '../src/web/index.mjs';

/** 문에 있어야 하는 것 — README 의 "spacemaker 에서 쓰는 법" 과 같아야 한다. */
const PUBLIC = [
  'loadPack', 'bakeFromPack', 'geometryOf',
  'createClipPlayer', 'createInstancedCrowd',
  'pickWalkClip', 'contactsAt', 'durationAt', 'strideS', 'TIME_SCALE_MAX',
  'planCrowd', 'affordable', 'frameCostMs', 'TIERS',
  'dimensionMm', 'pendingDimensions', 'DIMENSIONS',
  'validateCatalog', 'LICENSES', 'packRedistributable', 'commercialClips',
];

/** 파일을 주소처럼 읽는 fetch — 브라우저 없이 문을 열어 보려고. */
function fileFetch(base) {
  return async (url) => {
    const rel = url.replace(base, '').replace(/^\//, '');
    const file = path.join(ROOT, 'packs', 'ref-synthetic', rel);
    if (!fs.existsSync(file)) return { ok: false, status: 404 };
    const buf = fs.readFileSync(file);
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(buf.toString('utf8')),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  };
}

runGate('check-surface', async (g) => {
  let n = 0;

  // ── 1. 문에 있는 것 ──
  for (const name of PUBLIC) {
    n++;
    if (api[name] === undefined) g.fail(`export/${name}`, 'README 에 적혀 있는데 안 내보낸다');
  }
  n++;
  // 안 적힌 것을 내보내고 있지 않은가 — 문이 조용히 넓어지면 나중에 못 좁힌다.
  const extra = Object.keys(api).filter((k) => !PUBLIC.includes(k));
  if (extra.length) g.fail('export/extra', `문서에 없는 것을 내보낸다: ${extra.join(' · ')}`);

  // ── 2. README 가 문과 같은가 ──
  {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    n++;
    if (!readme.includes('src/web/index.mjs')) {
      g.fail('readme/entry', 'README 가 문이 어디인지 안 적는다');
    }
    for (const name of ['loadPack', 'createInstancedCrowd', 'planCrowd']) {
      n++;
      if (!readme.includes(name)) g.fail(`readme/${name}`, '문에 있는데 README 가 안 적는다');
    }
  }

  // ── 3. 문이 실제로 열리는가 ──
  //
  // 이름만 있고 안 되는 문이 가장 나쁘다 — 소비처가 붙이고 나서야 안다.
  {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const THREE = await import('three');
    const base = 'pack://ref-synthetic';
    let pack = null;
    try {
      pack = await api.loadPack({ url: base, GLTFLoader, fetchImpl: fileFetch(base) });
    } catch (e) {
      g.fail('load/throw', `팩을 못 받았다 — ${e.message}`);
    }
    if (pack) {
      n++;
      if (pack.catalog.clips.length !== 5) g.fail('load/clips', `클립이 ${pack.catalog.clips.length}개다`);
      n++;
      if (!pack.gltfOf('walk-forward')) g.fail('load/gltf', 'three 가 읽은 것이 없다');
      n++;
      // **원본 바이트를 들고 있어야 한다.** 굽는 쪽은 우리 리더로 읽어야
      // FK 가 같은 수를 낸다 — three 가 읽은 것을 되짚으면 그 왕복이 끊긴다.
      if (!pack.bufferOf('walk-forward')) g.fail('load/buffer', '원본 바이트를 안 들고 있다');

      n++;
      // **팩에서 바로 굽는다.** 데모는 픽스처를 메모리에서 만들어 구웠는데,
      // 실제로는 받은 팩을 구워야 한다. 이 길이 없으면 인스턴싱은 픽스처
      // 전용 기능으로 남는다.
      let atlas = null;
      try { atlas = api.bakeFromPack(pack, ['walk-forward', 'idle']); }
      catch (e) { g.fail('bake/throw', `팩에서 못 구웠다 — ${e.message}`); }
      if (atlas) {
        n++;
        if (atlas.clips.length !== 2) g.fail('bake/clips', `구운 클립이 ${atlas.clips.length}개다`);
        n++;
        if (!(atlas.bones > 0 && atlas.height > 1)) g.fail('bake/size', '구운 것이 비어 있다');
        n++;
        const geom = api.geometryOf(pack);
        if (!geom?.getAttribute('skinIndex')) g.fail('bake/geometry', '살에 스킨 정보가 없다');
        else {
          n++;
          // 문에서 받은 것만으로 군중이 서는가 — 여기까지 되면 소비처는
          // 이 파일 하나만 알면 된다.
          let crowd = null;
          try {
            crowd = api.createInstancedCrowd({ THREE, geometry: geom, atlas, count: 10 });
            crowd.place(0, { position: [0, 0, 0], clipId: 'walk-forward' });
            crowd.update(0.1);
          } catch (e) { g.fail('crowd/throw', `군중을 못 세웠다 — ${e.message}`); }
          if (crowd) {
            n++;
            if (!(crowd.rowOf(0) >= atlas.clips[0].row)) g.fail('crowd/row', '재생 위치가 클립 밖이다');
            crowd.dispose();
          }
        }
      }
    }
  }

  // ── 4. 계약을 어긴 팩을 받는 자리에서 막는가 ──
  {
    n++;
    const bad = {
      ok: true,
      status: 200,
      json: async () => ({ packId: 'bad', version: '1', skeleton: 'smplx', clips: [] }),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    let threw = false;
    try { await api.loadPack({ url: 'x', GLTFLoader, fetchImpl: async () => bad }); }
    catch { threw = true; }
    if (!threw) {
      g.fail('load/invalid', '계약을 어긴 팩을 그냥 받는다 — 렌더 루프 깊은 데서 조용히 이상해진다');
    }
    n++;
    let threw404 = false;
    try {
      await api.loadPack({ url: 'x', GLTFLoader, fetchImpl: async () => ({ ok: false, status: 404 }) });
    } catch { threw404 = true; }
    if (!threw404) g.fail('load/404', '없는 팩을 받아도 조용하다');
  }

  console.log(`  [문] 내보내는 것 ${PUBLIC.length}개 · 팩을 받아 굽고 세우는 데까지 확인했다`);
  return n;
});
