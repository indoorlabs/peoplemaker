// 팩을 실제로 세워 보고 **GPU 몫을 재는** 자리.
//
// 여기까지 잰 것은 전부 CPU 였다 (Node 에서 뼈 행렬 갱신). 화면에 세우면
// 드로우콜과 정점 스키닝이 더해지는데, 그것은 브라우저에서만 잴 수 있다.
//
//   node scripts/serve-demo.mjs
//   http://localhost:5180/?people=200&tier=full
//
// 창을 열어 두는 것이 목적이 아니라 **수를 내는 것**이 목적이라, 재는 길을
// 먼저 만든다 — window.__crowdStats() 와 window.__frameTime(ms).
// (urbanspace 의 계측과 같은 규약. 그쪽에서 브라우저가 탭을 묶어 1,000ms 로
// 읽힌 적이 있어서, 여기서도 rAF 가 몇 번 돌았는지를 함께 낸다.)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createClipPlayer } from '../src/web/clipPlayer.mjs';
import { buildGLB, FIXTURES } from '../src/lib/fixtureRig.mjs';
import { parseGLB } from '../src/lib/gltf.mjs';
import { bakeClip, bakeAtlas } from '../src/lib/poseBake.mjs';
import { createInstancedCrowd } from '../src/web/instancedCrowd.mjs';
import { bakeFromPack, geometryOf, loadPack } from '../src/web/index.mjs';

const q = new URLSearchParams(location.search);
const want = Number(q.get('people') || 200);
const tier = q.get('tier') || 'full';
const packId = q.get('pack') || 'ref-synthetic';
// 뼈 수를 흔들려면 팩의 클립이 아니라 **여기서 만든** 리그를 써야 한다.
// 진짜 Mixamo 리그가 65개라, 11개짜리로 잰 값을 그대로 믿으면 안 된다.
const boneOverride = Number(q.get('bones') || 0);
// 'skinned' 사람마다 스킨 메시 (드로우콜 = 사람 수)
// 'instanced' 구운 자세 + InstancedMesh (드로우콜 1)
const mode = q.get('mode') || 'skinned';
// 먼 단계의 살을 얼마로 줄일 것인가 (0.25 = 삼각형 4분의 1). 안 주면 안 줄인다.
const lod = Number(q.get('lod') || 0);
// 먼 단계에 팩의 텍스처를 정점 색으로 구워 넣을 것인가 (?color=1).
const bakeColor = q.get('color') === '1';
const hud = document.getElementById('hud');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);              // 픽셀비를 고정한다 — 안 그러면 기계마다 다른 것을 잰다
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
scene.add(new THREE.HemisphereLight(0xffffff, 0x30343c, 2.2));
const grid = new THREE.GridHelper(120, 60, 0x2a2f36, 0x21252b);
scene.add(grid);

const catalog = await (await fetch(`/packs/${packId}/catalog.json`)).json();
const loader = new GLTFLoader();
const gltfs = new Map();
let pack = null;
if (boneOverride) {
  const spec = { ...FIXTURES.find((f) => f.id === 'walk-forward'), bones: boneOverride };
  const glb = buildGLB(spec);
  const gltf = await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  for (const clip of catalog.clips) gltfs.set(clip.id, gltf);
} else {
  // 앱과 같은 문(loadPack)으로 받는다 — 나뉜 팩(몸 + 동작)도 그대로 읽힌다.
  pack = await loadPack({ url: `/packs/${packId}`, GLTFLoader });
  for (const clip of catalog.clips) gltfs.set(clip.id, pack.gltfOf(clip.id));
}

const player = createClipPlayer({ THREE, SkeletonUtils, catalog, gltfOf: (id) => gltfs.get(id) });

// 사람을 격자로 세운다. 배치는 이 저장소의 일이 아니지만(README 의 경계),
// **재려면 어딘가에 세워야** 하므로 가장 단순한 격자를 쓴다.
const side = Math.ceil(Math.sqrt(want));
const spot = (i) => [(i % side) * 1.6 - side * 0.8, 0, Math.floor(i / side) * 1.6 - side * 0.8];
let verts = 0;
let crowd = null;
const lodStats = {};

if (mode === 'instanced') {
  // 구운 자세 + InstancedMesh — 드로우콜 하나.
  // **팩을 그대로 굽는다.** 예전에는 늘 픽스처를 구웠다 — 기준 팩이 곧
  // 픽스처라 티가 안 났는데, Rocketbox 팩을 주니 픽스처의 뼈 11개 자세로
  // Rocketbox 살을 비틀어 조각이 흩어진 화면이 됐다. 뼈 수를 흔들 때만
  // 픽스처를 굽는다.
  let atlas;
  let geom = null;
  if (boneOverride) {
    const glbFor = (spec) => buildGLB({ ...spec, bones: boneOverride });
    const walkSpec = FIXTURES.find((f) => f.id === 'walk-forward');
    const idleSpec = FIXTURES.find((f) => f.id === 'idle');
    atlas = bakeAtlas([
      { id: 'walk-forward', baked: bakeClip(parseGLB(glbFor(walkSpec))) },
      { id: 'idle', baked: bakeClip(parseGLB(glbFor(idleSpec))) },
    ]);
    gltfs.get('walk-forward').scene.traverse((o) => { if (o.isSkinnedMesh && !geom) geom = o.geometry; });
  } else {
    // 앱이 쓰는 길과 같은 길 — 재는 것이 앱이 그리는 것이어야 한다.
    atlas = bakeFromPack(pack, ['walk-forward', 'idle']);
    // 살을 줄이는 데 드는 시간도 잰다 — 받는 쪽이 첫 화면에서 치르는 값이다.
    const t0 = performance.now();
    geom = geometryOf(pack, { lod, color: bakeColor, lodStats });
    lodStats.ms = +(performance.now() - t0).toFixed(1);
  }
  verts = geom.attributes.position.count;
  crowd = createInstancedCrowd({ THREE, geometry: geom, atlas, count: want });
  for (let i = 0; i < want; i++) {
    crowd.place(i, {
      position: spot(i), headingRad: Math.PI,
      clipId: 'walk-forward', timeOffsetS: Math.random() * atlas.clips[0].durationS,
    });
  }
  scene.add(crowd.mesh);
} else {
  for (let i = 0; i < want; i++) {
    const p = player.spawn({ clipId: 'walk-forward', position: spot(i), headingRad: Math.PI });
    p.mixer.update(Math.random() * p.clip.durationS);   // 위상을 흩는다
    scene.add(p.root);
    if (i === 0) p.root.traverse((o) => { if (o.isSkinnedMesh) verts += o.geometry.attributes.position.count; });
  }
}

camera.position.set(side * 0.9, side * 0.75 + 6, side * 1.4);
camera.lookAt(0, 1, 0);

let bones = 0;
if (crowd) {
  const g0 = gltfs.get('walk-forward');
  g0.scene.traverse((o) => { if (o.isBone) bones++; });
} else {
  player.people[0]?.root.traverse((o) => { if (o.isBone) bones++; });
}

const clock = new THREE.Clock();
const advance = (dt) => (crowd ? crowd.update(dt) : player.update(dt));
function tick() {
  requestAnimationFrame(tick);
  advance(clock.getDelta());
  renderer.render(scene, camera);
}
tick();

// ── 재는 길 ──────────────────────────────────────────────────────

window.__crowdStats = () => ({
  사람: crowd ? want : player.people.length,
  방식: mode,
  단계: tier,
  뼈: bones,
  총뼈: bones * (crowd ? want : player.people.length),
  몸정점: verts,
  ...(lod ? { 살줄임: lod, 줄이기ms: lodStats.ms ?? null, 삼각형원본: lodStats.trianglesBefore ?? null } : {}),
  ...(bakeColor ? { 정점색: true } : {}),
  드로우콜: renderer.info.render.calls,
  삼각형: renderer.info.render.triangles,
  프로그램: renderer.info.programs?.length ?? null,
  ...(crowd ? { 자세텍스처: `${crowd.textureSize.width}×${crowd.textureSize.height}` } : {}),
});

// urbanspace 의 __frameTime 과 같은 규약 — rAF 가 묶였는지를 스스로 말한다.
window.__frameTime = (ms = 2000) => new Promise((resolve) => {
  const gaps = [];
  let last = performance.now();
  let raf = 0;
  const t0 = last;
  const onFrame = () => {
    const t = performance.now();
    gaps.push(t - last);
    last = t;
    raf++;
    if (t - t0 < ms) requestAnimationFrame(onFrame);
    else {
      const s = gaps.slice(1).sort((a, b) => a - b);
      const rafExpected = ms / 16.7;
      resolve({
        프레임: s.length,
        중앙ms: s.length ? +s[Math.floor(s.length / 2)].toFixed(2) : null,
        p90ms: s.length ? +s[Math.floor(s.length * 0.9)].toFixed(2) : null,
        fps: s.length ? +((1000 * s.length) / ms).toFixed(1) : 0,
        ...(raf < rafExpected * 0.25
          ? { 못믿음: `브라우저가 탭을 묶었다 — rAF 가 ${raf}번 돌았다 (${Math.round(rafExpected)}번쯤이어야)` }
          : {}),
        ...window.__crowdStats(),
      });
    }
  };
  requestAnimationFrame(onFrame);
});

/**
 * rAF 를 안 쓰고 잰다.
 *
 * 창이 가려지면 브라우저가 rAF 를 1Hz 로 묶는다 — 그러면 위의 __frameTime 은
 * "못믿음" 만 낸다(그렇게 나오는 것이 맞다). 그런데 **수는 여전히 필요하다.**
 *
 * 동기 루프로 그리고 마지막에 `gl.finish()` 로 GPU 를 기다리면, rAF 와
 * 상관없이 한 프레임에 드는 시간이 나온다. 화면에 실제로 보이는 것과 같지는
 * 않다 — 합성과 vsync 가 빠져 있다. 그래서 이름을 다르게 둔다.
 */
window.__renderBench = (frames = 120) => {
  const gl = renderer.getContext();
  const dt = 1 / 60;
  const step = () => { advance(dt); renderer.render(scene, camera); };
  for (let i = 0; i < 20; i++) step();     // 데우기
  gl.finish();
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) step();
  gl.finish();                              // GPU 가 끝나기를 기다린다
  const ms = (performance.now() - t0) / frames;
  return {
    프레임당ms: +ms.toFixed(3),
    초당프레임: +(1000 / ms).toFixed(1),
    ...window.__crowdStats(),
    잰방법: '동기 루프 + gl.finish — vsync·합성 제외',
  };
};

/**
 * **GPU 시간을 진짜로 잰다.**
 *
 * `gl.finish()` 로는 안 된다 — 브라우저에서 그것은 명령을 GPU 프로세스로
 * 보내는 데서 끝나고, 그린 것이 끝나기를 기다리지 않는다. 그래서 5,000명 ·
 * 삼각형 390만 개가 0.127ms 로 읽혔다. 초당 30조 삼각형이라는 뜻이라,
 * 그 수는 **그럴 리가 없다**는 것으로 스스로를 반증한다.
 *
 * WebGL2 의 EXT_disjoint_timer_query_webgl2 는 GPU 안에서 잰다. 이 확장이
 * 없는 기계도 있으므로(브라우저 설정에 따라 꺼진다) 없으면 없다고 말한다 —
 * 조용히 CPU 값을 GPU 값인 척 돌려주지 않는다.
 */
window.__gpuBench = async (frames = 60) => {
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const dt = 1 / 60;
  const step = () => { advance(dt); renderer.render(scene, camera); };
  for (let i = 0; i < 20; i++) step();

  const cpu0 = performance.now();
  if (!ext) {
    for (let i = 0; i < frames; i++) step();
    return { ...window.__crowdStats(), cpu프레임당ms: +((performance.now() - cpu0) / frames).toFixed(3), gpu: null,
      못믿음: 'EXT_disjoint_timer_query_webgl2 가 없다 — GPU 시간은 못 쟀다' };
  }
  const q = gl.createQuery();
  gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
  for (let i = 0; i < frames; i++) step();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  const cpuMs = (performance.now() - cpu0) / frames;

  // 결과가 나올 때까지 기다린다. disjoint 가 뜨면 그 회차는 버린다 —
  // GPU 가 중간에 다른 일로 끌려간 것이라 시간이 뜻을 잃는다.
  for (let i = 0; i < 200; i++) {
    if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
  const ok = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !disjoint;
  const ns = ok ? gl.getQueryParameter(q, gl.QUERY_RESULT) : null;
  gl.deleteQuery(q);
  return {
    ...window.__crowdStats(),
    cpu프레임당ms: +cpuMs.toFixed(3),
    gpu프레임당ms: ns == null ? null : +(ns / 1e6 / frames).toFixed(3),
    ...(ok ? {} : { 못믿음: disjoint ? 'GPU 가 중간에 딴 일을 했다 (disjoint)' : '질의 결과가 안 왔다' }),
    잰방법: 'EXT_disjoint_timer_query_webgl2 — GPU 안에서 잰 시간',
  };
};

const s = window.__crowdStats();
hud.textContent = [
  `팩 ${packId} · ${mode}`,
  `사람 ${s.사람}  뼈 ${s.뼈}/인  총 ${s.총뼈.toLocaleString()}`,
  `몸 정점 ${s.몸정점}  드로우콜 ${s.드로우콜}`,
  '',
  'window.__frameTime(2000) 으로 잰다',
].join('\n');
setInterval(() => {
  const c = window.__crowdStats();
  hud.textContent = hud.textContent.replace(/드로우콜 \d+/, `드로우콜 ${c.드로우콜}`);
}, 1000);
