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
import { spawnSync } from 'node:child_process';
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

  // ── 2-2. 패키지가 그 문을 가리키는가 ──
  //
  // 소비처는 `npm i github:indoorlabs/peoplemaker` 로 받아 `peoplemaker` 를
  // import 한다. exports 가 엉뚱한 데를 가리키면 그때서야 안다.
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    n++;
    if (!pkg.exports?.['.']) g.fail('pkg/exports', '패키지 진입점이 없다 — deep import 를 강요하게 된다');
    else {
      n++;
      const entry = path.join(ROOT, pkg.exports['.']);
      if (!fs.existsSync(entry)) g.fail('pkg/entry', `진입점 ${pkg.exports['.']} 이 없다`);
      n++;
      if (path.resolve(entry) !== path.resolve(path.join(ROOT, 'src/web/index.mjs'))) {
        g.fail('pkg/entry-wrong', '진입점이 문(src/web/index.mjs)이 아니다');
      }
    }
    n++;
    // 순수 층 문도 따로 있어야 한다 — three 없이 계약만 검사하는 쪽이 쓴다.
    const lib = pkg.exports?.['./lib'];
    if (!lib || !fs.existsSync(path.join(ROOT, lib))) g.fail('pkg/lib', 'peoplemaker/lib 문이 없다');
    n++;
    // **three 는 peer 여야 한다.** 보통 의존으로 두면 소비처의 three 와 두
    // 벌이 뜨고, instanceof 검사가 조용히 실패한다.
    if (!pkg.peerDependencies?.three) g.fail('pkg/peer', 'three 가 peer 의존이 아니다');
    n++;
    if (pkg.dependencies?.three) g.fail('pkg/dep', 'three 를 보통 의존으로도 걸고 있다 — 두 벌이 뜬다');
    n++;
    // 받는 쪽에 실제로 갈 파일 — src 와 packs 가 빠지면 설치해도 아무것도 없다.
    for (const need of ['src', 'packs']) {
      if (!(pkg.files || []).includes(need)) g.fail(`pkg/files/${need}`, `files 에 ${need} 가 없다`);
    }
    n++;
    // **기준 팩의 클립이 저장소에 있는가.**
    //
    // `npm i github:...` 는 **git 이 들고 있는 것**을 가져간다. .gitignore 가
    // GLB 를 빼고 있어서, 설치한 쪽에는 카탈로그만 가고 클립이 없었다 —
    // 받아서 돌려 보고서야 알았다 (idle.glb 404). files 목록만 보면 멀쩡해
    // 보이므로, git 이 실제로 들고 있는지를 물어야 한다.
    const tracked = spawnSync('git', ['ls-files', 'packs/ref-synthetic/clips'], { cwd: ROOT, encoding: 'utf8' });
    const glbs = (tracked.stdout || '').split('\n').filter((f) => f.endsWith('.glb'));
    const onDisk = fs.existsSync(path.join(ROOT, 'packs/ref-synthetic/clips'))
      ? fs.readdirSync(path.join(ROOT, 'packs/ref-synthetic/clips')).filter((f) => f.endsWith('.glb'))
      : [];
    if (glbs.length !== onDisk.length) {
      g.fail('pkg/pack-clips',
        `기준 팩의 클립이 디스크에 ${onDisk.length}개인데 git 은 ${glbs.length}개만 들고 있다 — 설치한 쪽에 안 간다`);
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

            // ── 먼 사람도 같은 쪽을 보는가 ──
            //
            // 인스턴싱 쪽은 카탈로그를 안 보고 아틀라스만 받는다. 앞 보정을
            // 여기로 안 넘기면 **가까운 사람과 먼 사람이 서로 반대를 본다** —
            // 단계가 바뀌는 거리에서 사람이 홱 도는 화면이 된다.
            n++;
            if (atlas.forwardRad !== pack.catalog.forwardRad) {
              g.fail('crowd/forward-carry', `아틀라스가 팩의 앞을 안 갖고 왔다 (${atlas.forwardRad} ≠ ${pack.catalog.forwardRad})`);
            }
            for (const deg of [0, 90, 210]) {
              n++;
              const want = (deg * Math.PI) / 180;
              crowd.place(0, { position: [0, 0, 0], headingRad: want, clipId: 'walk-forward' });
              const m = new THREE.Matrix4();
              crowd.mesh.getMatrixAt(0, m);
              const yaw = new THREE.Euler().setFromRotationMatrix(m, 'YXZ').y;
              // 재생기가 같은 각도에 대해 내는 회전과 견준다 — 두 길이 같은
              // 셈을 하는지를 묻는 것이지, 어느 한쪽이 맞는지를 묻는 게 아니다.
              const wantYaw = want - pack.catalog.forwardRad;
              const d = Math.abs(Math.atan2(Math.sin(yaw - wantYaw), Math.cos(yaw - wantYaw)));
              if (d > 0.02) {
                g.fail(`crowd/forward/${deg}`,
                  `${deg}° 로 놓았는데 인스턴싱의 회전이 ${((yaw * 180) / Math.PI).toFixed(1)}° 다 (${((wantYaw * 180) / Math.PI).toFixed(1)}° 여야) — 가까운 사람과 반대를 본다`);
              }
            }
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
