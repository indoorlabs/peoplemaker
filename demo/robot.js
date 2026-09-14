// 로봇이 방에 있는 그림 — showcase.js 의 방·조명에 Unitree G1 을 세운다.
//
//   node scripts/serve-demo.mjs 5180
//   http://localhost:5180/demo/robot.html            방 하나에 로봇 넷 + 사람 둘
//   http://localhost:5180/demo/robot.html?cam=2      다른 카메라
//
// 재는 데모가 아니라 **보이는** 데모다. 로봇은 앱과 같은 길(loadPack →
// createClipPlayer)로 세우고, 사람 둘은 크기를 견주려고 옆에 둔다. 손 뻗기는
// 탁자(상판 1.05 m) 앞에 둔다 — 로봇의 손이 1.077 m 까지 올라간다(팩이 잰 값).
//
// 저장소 사본에는 클립이 idle · walk-forward 뿐이다. reach · walk-carry 와
// 사람 둘의 talk · listen 은 먼저 받아야 한다:
//   node scripts/fetch-packs.mjs <PACKS_URL> --tier all --clips all
// (주소는 src/lib/dist.mjs 의 PACKS_URL). 없으면 loadPack 이 어느 파일이 없는지
// 말하고 멈춘다.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadPack, createClipPlayer } from '../src/web/index.mjs';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e6e1);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
const CAMS = {
  1: { pos: [7.6, 4.4, 9.2], look: [0.2, 0.85, -0.4] },      // 전경
  2: { pos: [4.2, 1.6, 2.4], look: [2.2, 0.9, -2.4] },        // 탁자 앞의 로봇 가까이
  3: { pos: [-6.5, 2.2, 6.5], look: [0, 0.9, -1] },           // 창가 쪽에서
};
const cam = CAMS[q.get('cam') || '1'] || CAMS[1];
camera.position.set(...cam.pos);
camera.lookAt(...cam.look);

// ── 방 (showcase.js 와 같다) ──
const W = 14; const D = 10; const H = 3.2;
const mat = (color, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(0xc9ad8a, 0.75));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
for (let x = -W / 2 + 0.6; x < W / 2; x += 0.6) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.01, D), mat(0xb89c7a, 0.8));
  line.rotation.x = -Math.PI / 2; line.position.set(x, 0.001, 0); scene.add(line);
}
const wallMat = mat(0xf2efea);
const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.2), wallMat);
back.position.set(0, H / 2, -D / 2); back.receiveShadow = true; scene.add(back);
const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, H, D), wallMat);
left.position.set(-W / 2, H / 2, 0); left.receiveShadow = true; scene.add(left);
for (const x of [-3.5, 0.5, 4.5]) {
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ color: 0xdbe9f4 }));
  glass.position.set(x, 1.75, -D / 2 + 0.13); scene.add(glass);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.56, 1.76, 0.04), mat(0x5b5650, 0.6));
  frame.position.set(x, 1.75, -D / 2 + 0.09); scene.add(frame);
}
// 탁자 — 상판 1.05 m. 로봇이 여기 손을 뻗는다.
const table = new THREE.Group();
const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 40), mat(0x9a8f84, 0.45));
top.position.y = 1.05; table.add(top);
const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 12), mat(0x333333, 0.4));
leg.position.y = 0.525; table.add(leg);
// 탁자 위의 물건 — 집을 것
const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.07, 24), mat(0xd9534f, 0.5));
bowl.position.set(0.15, 1.05 + 0.055, 0.1); table.add(bowl);
table.position.set(2.6, 0, -2.6);
table.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
scene.add(table);
// 선반 — 벽에, 물건 하나 (닿는 높이 1.077 m 보다 높은 1.5 m — sim 이면 too_high)
const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.3), mat(0x6b5b4e, 0.6));
shelf.position.set(-W / 2 + 0.25, 1.5, 1.2); shelf.castShadow = true; scene.add(shelf);
const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.18), mat(0x3f6e8c, 0.6));
box.position.set(-W / 2 + 0.25, 1.5 + 0.11, 1.2); box.castShadow = true; scene.add(box);
const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.45, 24), mat(0x8a5a3c, 0.8));
pot.position.set(-6.3, 0.225, -4.3); pot.castShadow = true; scene.add(pot);
const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), mat(0x4d7a45, 0.9));
leaves.position.set(-6.3, 0.95, -4.3); leaves.castShadow = true; scene.add(leaves);

// ── 빛 ──
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a58c, 0.9));
const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
sun.position.set(6, 9, 5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
sun.shadow.bias = -0.0004; scene.add(sun);

// ── 사람과 로봇 — 앱과 같은 길 ──
const [g1, f, m] = await Promise.all(['unitree-g1', 'rocketbox-f01', 'rocketbox-m01']
  .map((id) => loadPack({ url: `/packs/${id}`, GLTFLoader })));
const players = {
  r: createClipPlayer({ THREE, SkeletonUtils, catalog: g1.catalog, gltfOf: g1.gltfOf }),
  f: createClipPlayer({ THREE, SkeletonUtils, catalog: f.catalog, gltfOf: f.gltfOf }),
  m: createClipPlayer({ THREE, SkeletonUtils, catalog: m.catalog, gltfOf: m.gltfOf }),
};
const deg = (d) => (d * Math.PI) / 180;
// headingRad: 0 = +Z(카메라 쪽), π/2 = +X. 로봇은 팩이 재서 +Z 를 본다(forwardRad 0).
const CAST = [
  // 탁자 앞에서 손을 뻗는 로봇 — 그릇을 향해
  { who: 'r', clip: 'reach', at: [2.6, -1.85], face: deg(180) },
  // 들고 걷는 로봇 — 탁자에서 문 쪽으로
  { who: 'r', clip: 'walk-carry', at: [0.4, -0.2], face: deg(120), walk: true },
  // 걸어오는 로봇
  { who: 'r', clip: 'walk-forward', at: [-2.4, 2.6], face: deg(40), walk: true },
  // 창가에 서 있는 로봇
  { who: 'r', clip: 'idle', at: [-3.6, -3.9], face: deg(20) },
  // 사람 둘 — 크기를 견주려고. 로봇 키 1.322 m, 사람 1.6~1.7 m.
  { who: 'f', clip: 'talk', at: [4.6, 1.0], face: deg(-60) },
  { who: 'm', clip: 'listen', at: [5.5, 0.2], face: deg(130) },
];
const people = [];
CAST.forEach((c, i) => {
  const p = players[c.who].spawn({ clipId: c.clip, position: [c.at[0], 0, c.at[1]], headingRad: c.face, inPlace: !!c.walk });
  p.mixer.update(((i * 0.61803) % 1) * p.clip.durationS);
  p.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(p.root);
  people.push(p);
});
// 손 뻗기는 가장 멀리 간 자세(1.0~1.6 s)에서 멈춰 둔다 — 사진이 그 순간을 찍게.
const reacher = people[0];
reacher.mixer.setTime(1.3);
reacher.action.paused = true;

const clock = new THREE.Timer();
let frames = 0;
function tick(t) {
  clock.update(t);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!window.__freeze) for (const pl of Object.values(players)) pl.update(dt);
  reacher.mixer.setTime(1.3);
  renderer.render(scene, camera);
  if (++frames === 30) window.__ready = { people: people.length, robots: CAST.filter((c) => c.who === 'r').length, g1: g1.catalog.builtFrom };
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
