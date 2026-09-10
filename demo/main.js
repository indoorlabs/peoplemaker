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

const q = new URLSearchParams(location.search);
const want = Number(q.get('people') || 200);
const tier = q.get('tier') || 'full';
const packId = q.get('pack') || 'ref-synthetic';
// 뼈 수를 흔들려면 팩의 클립이 아니라 **여기서 만든** 리그를 써야 한다.
// 진짜 Mixamo 리그가 65개라, 11개짜리로 잰 값을 그대로 믿으면 안 된다.
const boneOverride = Number(q.get('bones') || 0);
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
if (boneOverride) {
  const spec = { ...FIXTURES.find((f) => f.id === 'walk-forward'), bones: boneOverride };
  const glb = buildGLB(spec);
  const gltf = await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  for (const clip of catalog.clips) gltfs.set(clip.id, gltf);
} else {
  for (const clip of catalog.clips) {
    const buf = await (await fetch(`/packs/${packId}/clips/${clip.id}.glb`)).arrayBuffer();
    gltfs.set(clip.id, await loader.parseAsync(buf, ''));
  }
}

const player = createClipPlayer({ THREE, SkeletonUtils, catalog, gltfOf: (id) => gltfs.get(id) });

// 사람을 격자로 세운다. 배치는 이 저장소의 일이 아니지만(README 의 경계),
// **재려면 어딘가에 세워야** 하므로 가장 단순한 격자를 쓴다.
const side = Math.ceil(Math.sqrt(want));
let verts = 0;
for (let i = 0; i < want; i++) {
  const p = player.spawn({
    clipId: 'walk-forward',
    position: [(i % side) * 1.6 - side * 0.8, 0, Math.floor(i / side) * 1.6 - side * 0.8],
    headingRad: Math.PI,
  });
  p.mixer.update(Math.random() * p.clip.durationS);   // 위상을 흩는다
  scene.add(p.root);
  if (i === 0) p.root.traverse((o) => { if (o.isSkinnedMesh) verts += o.geometry.attributes.position.count; });
}

camera.position.set(side * 0.9, side * 0.75 + 6, side * 1.4);
camera.lookAt(0, 1, 0);

let bones = 0;
player.people[0]?.root.traverse((o) => { if (o.isBone) bones++; });

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  player.update(clock.getDelta());
  renderer.render(scene, camera);
}
tick();

// ── 재는 길 ──────────────────────────────────────────────────────

window.__crowdStats = () => ({
  사람: player.people.length,
  단계: tier,
  뼈: bones,
  총뼈: bones * player.people.length,
  몸정점: verts,
  드로우콜: renderer.info.render.calls,
  삼각형: renderer.info.render.triangles,
  프로그램: renderer.info.programs?.length ?? null,
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
  const step = () => { player.update(dt); renderer.render(scene, camera); };
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

const s = window.__crowdStats();
hud.textContent = [
  `팩 ${packId} · 단계 ${tier}`,
  `사람 ${s.사람}  뼈 ${s.뼈}/인  총 ${s.총뼈.toLocaleString()}`,
  `몸 정점 ${s.몸정점}  드로우콜 ${s.드로우콜}`,
  '',
  'window.__frameTime(2000) 으로 잰다',
].join('\n');
setInterval(() => {
  const c = window.__crowdStats();
  hud.textContent = hud.textContent.replace(/드로우콜 \d+/, `드로우콜 ${c.드로우콜}`);
}, 1000);
