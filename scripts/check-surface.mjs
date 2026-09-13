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
  'loadPack', 'bakeFromPack', 'geometryOf', 'measuredFor', 'planCrowdMeasured',
  'createClipPlayer', 'createInstancedCrowd', 'createMixedCrowd',
  'pickWalkClip', 'contactsAt', 'durationAt', 'strideS', 'TIME_SCALE_MAX',
  'ACTIVITIES', 'planActivity', 'startActivity', 'clipForRole',
  'planCast', 'castReport',
  'ROUTINES', 'planRoutine', 'startRoutine',
  'SCENARIOS', 'planScenario', 'scenarioReport',
  'profileShares', 'profileProblems', 'pendingProfiles', 'PROFILE_SOURCES',
  'planCrowd', 'affordable', 'frameCostMs', 'TIERS',
  'dimensionMm', 'pendingDimensions', 'DIMENSIONS',
  'occupantValue', 'pendingOccupantValues', 'OCCUPANT_VALUES', 'OCCUPANT_SOURCES',
  'validateCatalog', 'LICENSES', 'packRedistributable', 'commercialClips',
  'attributionsFor', 'attributionTally', 'attributionNeeds',
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

  // ── 먼 사람용 몸을 문에서 받을 수 있는가 ──
  //
  // three 는 여기서 한 번 들여온다 (아래 굽는 자리에서도 쓴다).
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const THREE = await import('three');
  //
  // 도시 스케일 소비처는 이것만 받는다 (여자 01: 4,238KB → 95KB). 문이
  // 그것을 못 주면 그 절약은 말뿐이다.
  {
    const url = 'pack://ref-synthetic';
    let bytes = 0;
    const counting = async (u) => {
      const r = await fileFetch(url)(u);
      if (!r.ok) return r;
      const ab = await r.arrayBuffer();
      bytes += ab.byteLength;
      return { ...r, arrayBuffer: async () => ab };
    };
    let farPack = null;
    n++;
    try {
      farPack = await api.loadPack({ url, GLTFLoader, fetchImpl: counting, clips: ['walk-forward'], body: 'far' });
    } catch (e) { g.fail('far/load', `먼 몸을 못 받는다 — ${e.message}`); }
    if (farPack) {
      n++;
      if (!farPack.far) g.fail('far/flag', '먼 몸을 받았는데 그렇다고 안 한다');
      n++;
      const stats = {};
      const geom = api.geometryOf(farPack, { lod: 0.25, color: true, lodStats: stats });
      // **두 번 줄이지 않는다** — 이미 구워 둔 살이다.
      if (!stats.prebaked) g.fail('far/prebaked', '이미 구운 살인데 또 줄이려 든다');
      n++;
      if (geom.getAttribute('position').count !== farPack.farLevel.vertices) {
        g.fail('far/verts', `정점이 ${geom.getAttribute('position').count} 다 — 받은 단계는 ${farPack.farLevel.vertices}`);
      }
      n++;
      // **더 거친 단계를 고를 수 있는가** — 안 주면 가장 덜 줄인 것이다.
      // 받은 바이트를 세는 fetch 는 따로 쓴다 — 위에서 세던 것에 더해지면
      // "먼 몸이 몸째보다 적게 받는가" 가 거짓이 된다 (실제로 그렇게 걸렸다).
      const coarse = await api.loadPack({ url, GLTFLoader, fetchImpl: fileFetch(url), clips: ['walk-forward'], body: 'far', farRatio: 0.1 });
      if (!(coarse.farLevel.ratio <= 0.1 + 1e-9)) {
        g.fail('far/level', `0.1 을 달라 했는데 ${coarse.farLevel.ratio} 짜리를 준다`);
      }
      n++;
      if (!(coarse.farLevel.vertices < farPack.farLevel.vertices)) {
        g.fail('far/level-smaller', `더 거친 단계인데 정점이 ${coarse.farLevel.vertices} 로 안 줄었다`);
      }
      n++;
      if (!geom.getAttribute('color')) g.fail('far/color', '먼 몸에 정점 색이 없다');
      n++;
      // 구운 아틀라스가 **그대로 맞는가** — 뼈가 같으니 맞아야 한다.
      try {
        const atlas = api.bakeFromPack(farPack, ['walk-forward']);
        const crowd = api.createInstancedCrowd({ THREE, geometry: geom, atlas, count: 3 });
        crowd.place(0, { position: [0, 0, 0], clipId: 'walk-forward' });
        crowd.update(0.1);
      } catch (e) { g.fail('far/crowd', `먼 몸으로 군중을 못 세운다 — ${e.message}`); }
      n++;
      // 몸째 받는 것보다 **정말 적게 받는가**.
      let fullBytes = 0;
      const countFull = async (u) => {
        const r = await fileFetch(url)(u);
        if (!r.ok) return r;
        const ab = await r.arrayBuffer();
        fullBytes += ab.byteLength;
        return { ...r, arrayBuffer: async () => ab };
      };
      await api.loadPack({ url, GLTFLoader, fetchImpl: countFull, clips: ['walk-forward'] });
      if (!(bytes < fullBytes)) g.fail('far/bytes', `먼 몸이 ${bytes}B · 몸째가 ${fullBytes}B — 안 줄었다`);
      else console.log(`  [문] 먼 몸으로 받으면 ${(bytes / 1024).toFixed(0)}KB · 몸째면 ${(fullBytes / 1024).toFixed(0)}KB (기준 팩은 텍스처가 없어 차이가 작다)`);
    }
    n++;
    // 먼 몸이 없는 팩에 달라고 하면 **말하고 멈춘다**.
    const noFar = async (u) => {
      const r = await fileFetch(url)(u);
      if (!r.ok || !u.endsWith('catalog.json')) return r;
      const cat = await r.json();
      delete cat.bodyFar;
      return { ...r, json: async () => cat };
    };
    let threw = false;
    try { await api.loadPack({ url, GLTFLoader, fetchImpl: noFar, clips: ['walk-forward'], body: 'far' }); }
    catch { threw = true; }
    if (!threw) g.fail('far/absent', '먼 몸이 없는 팩인데 조용히 몸째를 준다 — 받는 쪽은 95KB 를 기대한다');
  }

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
    // 몸도 git 이 들고 있어야 한다 — 나뉜 팩에서 몸이 빠지면 살 없는 동작만 간다.
    n++;
    if (fs.existsSync(path.join(ROOT, 'packs/ref-synthetic/body.glb'))) {
      const b = spawnSync('git', ['ls-files', 'packs/ref-synthetic/body.glb'], { cwd: ROOT, encoding: 'utf8' });
      if (!(b.stdout || '').trim()) g.fail('pkg/pack-body', '기준 팩의 몸(body.glb)을 git 이 안 들고 있다 — 설치한 쪽에 살 없는 동작만 간다');
    }
  }

  // ── 3. 문이 실제로 열리는가 ──
  //
  // 이름만 있고 안 되는 문이 가장 나쁘다 — 소비처가 붙이고 나서야 안다.
  {
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

      // ── 몸 + 동작 · 필요한 것만 받기 ──
      //
      // 동작마다 몸을 따로 쥐면 텍스처가 동작 수만큼 올라간다. 그리고 서기·걷기만
      // 쓰는 화면이 모든 동작을 받을 까닭이 없다 (Rocketbox 한 사람이 46MB 였다).
      n++;
      if (!pack.body) g.fail('split/body', '기준 팩이 몸 + 동작으로 나뉘어 있는데 몸을 안 들고 있다');
      n++;
      if (pack.gltfOf('idle')?.scene !== pack.gltfOf('walk-forward')?.scene) {
        g.fail('split/shared-body', '동작마다 몸을 따로 쥐고 있다 — 텍스처가 동작 수만큼 올라간다');
      }
      {
        const asked = [];
        const counting = (u) => { asked.push(u); return fileFetch(base)(u); };
        const clipCalls = () => asked.filter((u) => /\/clips\//.test(u)).length;
        let lazy = null;
        try { lazy = await api.loadPack({ url: base, GLTFLoader, fetchImpl: counting, clips: ['idle'] }); }
        catch (e) { g.fail('lazy/throw', `골라 받기가 던졌다 — ${e.message}`); }
        if (lazy) {
          n++;
          if (clipCalls() !== 1 || lazy.has('walk-forward') || !lazy.has('idle')) {
            g.fail('lazy/only', `idle 만 달랬는데 클립을 ${clipCalls()}번 받았다`);
          }
          n++;
          await lazy.load(['walk-forward', 'idle']);
          if (!lazy.has('walk-forward') || clipCalls() !== 2) {
            g.fail('lazy/load', `더 받은 뒤 클립 요청이 ${clipCalls()}번이다 — 받은 것을 또 받았거나 못 받았다`);
          }
          n++;
          let threw = false;
          try { await lazy.load(['no-such-clip']); } catch { threw = true; }
          if (!threw) g.fail('lazy/unknown', '카탈로그에 없는 클립을 달래도 조용하다');
        }
        // 받지 않은 클립을 구우려 하면 무엇을 하라고 말해야 한다. 그리고 첫
        // 클립을 안 받았어도 살은 가져올 수 있어야 한다 (몸이 따로 있다).
        const walkOnly = await api.loadPack({
          url: base, GLTFLoader, fetchImpl: fileFetch(base),
          clips: (cat) => cat.clips.filter((c) => c.id === 'walk-forward').map((c) => c.id),
        });
        n++;
        let msg = '';
        try { api.bakeFromPack(walkOnly, ['idle']); } catch (e) { msg = e.message; }
        if (!/pack\.load/.test(msg)) g.fail('lazy/bake-hint', `받지 않은 클립을 구우려 했는데 ${msg ? `'${msg}'` : '던지지 않았다'}`);
        n++;
        let geo = null;
        try { geo = api.geometryOf(walkOnly); } catch (e) { g.fail('lazy/geometry', `첫 클립을 안 받았더니 살을 못 가져온다 — ${e.message}`); }
        if (geo && !geo.getAttribute('skinIndex')) g.fail('lazy/geometry', '가져온 살에 스킨이 없다');
      }

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
        // ── 여러 조각으로 된 몸 ──
        //
        // Rocketbox 는 몸·머리·속눈썹이 조각으로 나뉘어 있다. 첫 조각만
        // 가져가던 때에는 먼 사람이 머리 없이 걸었다. 조각을 이어 붙이되,
        // 알파로 오려 내는 조각은 뺀다 (한 색 셰이더가 판째로 칠한다).
        {
          const part = (verts, bone, mat) => {
            const g2 = new THREE.BufferGeometry();
            g2.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(verts * 3).map((_, i) => i), 3));
            g2.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(verts * 3).fill(1), 3));
            g2.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(verts * 4).fill(bone), 4));
            g2.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(new Uint8Array(verts * 4).fill(255), 4, true));
            g2.setIndex([0, 1, 2]);
            return new THREE.SkinnedMesh(g2, mat);
          };
          const scene = new THREE.Group();
          scene.add(part(3, 1, new THREE.MeshBasicMaterial()));
          scene.add(part(5, 7, new THREE.MeshBasicMaterial()));
          scene.add(part(4, 9, new THREE.MeshBasicMaterial({ alphaTest: 0.5 })));
          const fake = { catalog: { clips: [{ id: 'x' }] }, gltfOf: () => ({ scene }) };
          const m = api.geometryOf(fake);
          n++;
          const cnt = m.getAttribute('position').count;
          if (cnt !== 8) g.fail('parts/count', `조각 둘(3+5)을 이었는데 정점이 ${cnt}개다 — ${cnt === 3 ? '첫 조각만 가져갔다' : cnt === 12 ? '오려 내는 조각까지 넣었다' : '잘못 이었다'}`);
          n++;
          const si = m.getAttribute('skinIndex');
          if (si.getX(0) !== 1 || si.getX(3) !== 7) g.fail('parts/bones', `이은 뒤 뼈 번호가 ${si.getX(0)}·${si.getX(3)} 다 (1·7 이어야)`);
          n++;
          const sw = m.getAttribute('skinWeight').getX(4);
          if (Math.abs(sw - 1) > 1e-6) g.fail('parts/weight', `정규화된 무게를 ${sw} 로 옮겼다 (1 이어야)`);
          n++;
          const idx = Array.from(m.index.array);
          if (idx.join() !== '0,1,2,3,4,5') g.fail('parts/index', `두 번째 조각의 면이 제자리를 못 찾았다 (${idx.join()})`);
          n++;
          if (Math.abs(m.getAttribute('position').getX(3)) > 1e-6) g.fail('parts/position', '두 번째 조각의 정점이 밀려 있다');

          // **끼워 넣은 속성.** gltf-transform 이 쓴 GLB 가 이렇다. 처음 고친
          // 판은 합성 조각(따로 된 속성)으로만 봐서 통과했는데, 진짜 Rocketbox
          // 팩에서는 속이 빈 속성을 만들어 매 프레임 무너졌다.
          const inter = (verts, bone) => {
            const mesh = part(verts, bone, new THREE.MeshBasicMaterial());
            const ib = new THREE.InterleavedBuffer(new Float32Array(verts * 6).map((_, i) => (i % 6 < 3 ? i + bone * 100 : 1)), 6);
            mesh.geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
            mesh.geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3));
            return mesh;
          };
          const scene2 = new THREE.Group();
          scene2.add(inter(3, 1));
          scene2.add(inter(5, 7));
          const m2 = api.geometryOf({ catalog: { clips: [{ id: 'x' }] }, gltfOf: () => ({ scene: scene2 }) });
          n++;
          const pos2 = m2.getAttribute('position');
          if (pos2.isInterleavedBufferAttribute || !pos2.array || pos2.count !== 8) {
            g.fail('parts/interleaved', `끼워 넣은 속성을 이었더니 ${pos2.isInterleavedBufferAttribute ? '끼워 넣은 틀에 배열을 부었다' : `정점이 ${pos2.count}개다`} — 그리면 매 프레임 무너진다`);
          } else if (Math.abs(pos2.getX(1) - 106) > 1e-6 || Math.abs(pos2.getX(3) - 700) > 1e-6) {
            // 조각마다 값을 뼈 번호×100 만큼 띄워 뒀다 — 첫 조각의 둘째 정점은
            // 칸 6(→106), 둘째 조각의 첫 정점은 700. 칸 너비를 잘못 읽거나
            // 조각을 섞으면 다른 수가 나온다.
            g.fail('parts/interleaved-values', `정점 x 가 ${pos2.getX(1)}·${pos2.getX(3)} 다 (106·700 이어야) — 끼워 넣은 칸을 잘못 읽었다`);
          }
        }

        const geom = api.geometryOf(pack);
        if (!geom?.getAttribute('skinIndex')) g.fail('bake/geometry', '살에 스킨 정보가 없다');
        else {
          // ── 먼 사람용으로 살을 줄여 주는가 ──
          //
          // 문에서 `{ lod }` 를 받아 줄인 기하를 내야 한다. 같은 아틀라스로
          // 그대로 세워져야 한다는 것이 요점이다 — 뼈와 가중치는 안 건드리므로
          // 굽는 쪽은 아무것도 안 바뀐다.
          n++;
          const stats = {};
          const thin = api.geometryOf(pack, { lod: 0.5, lodStats: stats });
          if (!(thin.getAttribute('position').count < geom.getAttribute('position').count)) {
            g.fail('lod/smaller', `줄이라고 했는데 정점이 ${thin.getAttribute('position').count} 그대로다`);
          }
          n++;
          for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) {
            if (!thin.getAttribute(k)) g.fail(`lod/attr/${k}`, `줄인 살에 ${k} 가 없다`);
          }
          n++;
          if (!thin.index) g.fail('lod/index', '줄인 살에 인덱스가 없다');
          n++;
          if (!(stats.trianglesAfter > 0 && stats.trianglesAfter < stats.trianglesBefore)) {
            g.fail('lod/stats', '얼마나 줄었는지를 안 알려준다');
          }
          n++;
          // 줄인 살로도 같은 아틀라스로 군중이 서는가.
          try {
            const c2 = api.createInstancedCrowd({ THREE, geometry: thin, atlas, count: 4 });
            c2.place(0, { position: [0, 0, 0], clipId: 'walk-forward' });
            c2.update(0.1);
          } catch (e) { g.fail('lod/crowd', `줄인 살로는 군중을 못 세운다 — ${e.message}`); }
          n++;
          // 안 주거나 1 이면 그대로여야 한다 — 예전 부름이 안 바뀐다.
          if (api.geometryOf(pack, { lod: 1 }).getAttribute('position').count !== geom.getAttribute('position').count) {
            g.fail('lod/none', 'lod 1 인데 살이 달라졌다');
          }

          // ── 먼 사람에게 색을 주는가 ──
          //
          // 기준 팩은 텍스처가 없고 baseColorFactor 만 있다. 그 길로 문
          // 끝까지 — 색이 붙고, 그 색으로 군중이 서는가.
          n++;
          const painted = api.geometryOf(pack, { color: true });
          const cattr = painted.getAttribute('color');
          if (!cattr) g.fail('color/attr', '색을 달라 했는데 안 붙는다');
          else {
            n++;
            if (cattr.count !== painted.getAttribute('position').count) {
              g.fail('color/count', `색이 ${cattr.count}개인데 정점은 ${painted.getAttribute('position').count}개다`);
            }
            n++;
            // three 가 카탈로그의 baseColorFactor 를 읽어 온 그 색인가.
            let mat = null;
            (pack.body || pack.gltfOf(pack.catalog.clips[0].id)).scene.traverse((o) => {
              if (o.isSkinnedMesh && !mat) mat = Array.isArray(o.material) ? o.material[0] : o.material;
            });
            const want = { r: 1, g: 1, b: 1 };
            if (mat?.color?.getRGB) mat.color.getRGB(want, 'srgb');
            if (Math.abs(cattr.getX(0) - want.r) > 1e-3 || Math.abs(cattr.getZ(0) - want.b) > 1e-3) {
              g.fail('color/factor', `첫 정점이 ${cattr.getX(0).toFixed(3)},${cattr.getY(0).toFixed(3)},${cattr.getZ(0).toFixed(3)} 다 — 재료는 ${want.r.toFixed(3)},${want.g.toFixed(3)},${want.b.toFixed(3)}`);
            }
            n++;
            // **팩의 기하를 건드리지 않았는가** — 가까운 사람이 쓰는 것이다.
            if (geom.getAttribute('color')) g.fail('color/mutated', '색을 구우면서 팩의 살에 색을 붙였다');
            n++;
            // 색이 있는 살로 세우면 셰이더가 그 색을 쓰는가 (#define).
            let c3 = null;
            try {
              c3 = api.createInstancedCrowd({ THREE, geometry: painted, atlas, count: 2 });
            } catch (e) { g.fail('color/crowd', `색 있는 살로 군중을 못 세운다 — ${e.message}`); }
            if (c3) {
              n++;
              if (c3.mesh.material.defines?.USE_BAKED_COLOR === undefined) {
                g.fail('color/define', '색이 있는데 셰이더가 그것을 안 쓴다');
              }
              n++;
              const plain = api.createInstancedCrowd({ THREE, geometry: geom, atlas, count: 2 });
              if (plain.mesh.material.defines?.USE_BAKED_COLOR !== undefined) {
                g.fail('color/define-off', '색이 없는데 셰이더가 색을 읽으려 한다 — 화면이 까매진다');
              }
            }
          }

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
            // ── 자리만 옮기기 ──
            //
            // 경로를 따라가는 쪽이 프레임마다 부르는 길이다. place 로 대신하면
            // 재생 시각이 매 프레임 0 으로 돌아가 사람이 첫 자세로 굳는다.
            crowd.place(0, { position: [0, 0, 0], headingRad: 0, clipId: 'walk-forward', timeOffsetS: 0 });
            crowd.update(0.4);
            const rowBefore = crowd.rowOf(0);
            crowd.moveTo(0, { position: [3, 0, 4], headingRad: Math.PI / 2 });
            crowd.update(0);   // rowOf 는 update 때 갱신된다 — 안 부르면 이 검사가 눈을 감는다
            n++;
            if (crowd.rowOf(0) !== rowBefore) {
              g.fail('crowd/moveTo-time', '자리만 옮겼는데 재생 시각이 바뀐다 — 걷다가 첫 자세로 굳는다');
            }
            n++;
            {
              const m = new THREE.Matrix4();
              crowd.mesh.getMatrixAt(0, m);
              const pos = new THREE.Vector3().setFromMatrixPosition(m);
              if (Math.hypot(pos.x - 3, pos.z - 4) > 1e-4) {
                g.fail('crowd/moveTo-pos', `옮기라 한 자리에 안 간다 (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);
              }
              const yaw = new THREE.Euler().setFromRotationMatrix(m, 'YXZ').y;
              const wantYaw = Math.PI / 2 - pack.catalog.forwardRad;
              if (Math.abs(Math.atan2(Math.sin(yaw - wantYaw), Math.cos(yaw - wantYaw))) > 0.02) {
                g.fail('crowd/moveTo-yaw', '옮길 때는 앞 보정이 빠진다 — place 와 다른 쪽을 본다');
              }
            }
            n++;
            // place 를 다시 부르면 시각이 **돌아가야** 한다 (두 길이 같아지면
            // 위 검사가 의미를 잃는다).
            crowd.place(0, { position: [0, 0, 0], clipId: 'walk-forward', timeOffsetS: 0 });
            crowd.update(0);   // rowOf 는 update 때 갱신된다
            if (crowd.rowOf(0) === rowBefore) {
              g.fail('crowd/place-resets', 'place 가 재생 시각을 안 되돌린다 — 두 길의 차이가 없다');
            }

            // ── 재생 속도만 바꾸기 ──
            //
            // 막혀서 멈춘 사람이 다리만 움직이면 제자리걸음이 된다. 0 을
            // 주면 정말 안 흘러야 하고, 두 배를 주면 두 배로 흘러야 한다.
            crowd.place(0, { position: [0, 0, 0], clipId: 'walk-forward', timeOffsetS: 0, timeScale: 1 });
            crowd.update(0.2);
            const rowMoving = crowd.rowOf(0);
            crowd.setSpeed(0, 0);
            crowd.update(0.2);
            n++;
            if (crowd.rowOf(0) !== rowMoving) g.fail('crowd/setSpeed-zero', '0 을 줬는데 재생이 계속 흐른다 — 멈춘 사람이 제자리걸음을 한다');
            crowd.setSpeed(0, 2);
            crowd.update(0.1);
            const rowFast = crowd.rowOf(0);
            // 0번은 0.2s 에서 2배로 0.1s → 0.4s 에 있다. 1번을 0.3s 에 놓고
            // 1배로 0.1s 흘리면 같은 0.4s 다 (마지막 update 가 둘 다 흘린다는
            // 것을 안 세서 처음에 이 검사가 틀렸다).
            crowd.place(1, { position: [0, 0, 0], clipId: 'walk-forward', timeOffsetS: 0.3, timeScale: 1 });
            crowd.update(0.1);
            n++;
            if (rowFast !== crowd.rowOf(1)) {
              g.fail('crowd/setSpeed-scale', `두 배로 줬는데 흐른 양이 다르다 (${rowFast} ≠ ${crowd.rowOf(1)})`);
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
