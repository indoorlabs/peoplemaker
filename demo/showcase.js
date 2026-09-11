// 공간 하나에 사람 열 명을 여러 동작으로 세워 보는 자리.
//
// 재는 데모(main.js)와 달리 **보이는 것**이 목적이다 — 그림자·환경광을 켜고
// 방을 하나 만든다. 사람은 앱과 같은 길(loadPack → createClipPlayer)로 세운다.
//
//   node scripts/serve-demo.mjs 5181
//   http://localhost:5181/demo/showcase.html

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadPack, createClipPlayer } from '../src/web/index.mjs';

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
camera.position.set(7.6, 4.4, 9.2);
camera.lookAt(0.2, 0.85, -0.4);

// ── 방 ──
const W = 14; const D = 10; const H = 3.2;
const mat = (color, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(0xc9ad8a, 0.75));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
// 바닥 널 — 줄만 옅게
for (let x = -W / 2 + 0.6; x < W / 2; x += 0.6) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.01, D), mat(0xb89c7a, 0.8));
  line.rotation.x = -Math.PI / 2; line.position.set(x, 0.001, 0);
  scene.add(line);
}
const wallMat = mat(0xf2efea);
const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.2), wallMat);
back.position.set(0, H / 2, -D / 2); back.receiveShadow = true; scene.add(back);
const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, H, D), wallMat);
left.position.set(-W / 2, H / 2, 0); left.receiveShadow = true; scene.add(left);
// 뒷벽의 창 — 밝은 판과 틀
for (const x of [-3.5, 0.5, 4.5]) {
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ color: 0xdbe9f4 }));
  // 틀 앞면(0.11)과 같은 면이면 무늬가 인다 — 조금 앞으로
  glass.position.set(x, 1.75, -D / 2 + 0.13); scene.add(glass);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.56, 1.76, 0.04), mat(0x5b5650, 0.6));
  frame.position.set(x, 1.75, -D / 2 + 0.09); scene.add(frame);
}
// 벽에 걸린 그림 하나 (사진 찍는 사람이 볼 것)
const art = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 1.6), mat(0x3f6e8c, 0.5));
art.position.set(-W / 2 + 0.14, 1.7, -1.2); scene.add(art);
// 탁자와 화분
const table = new THREE.Group();
const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 40), mat(0x9a8f84, 0.45));
top.position.y = 1.05; table.add(top);
const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 12), mat(0x333333, 0.4));
leg.position.y = 0.525; table.add(leg);
table.position.set(2.6, 0, -2.6);
table.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
scene.add(table);
const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.45, 24), mat(0x8a5a3c, 0.8));
pot.position.set(-6.3, 0.225, -4.3); pot.castShadow = true; scene.add(pot);
const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), mat(0x4d7a45, 0.9));
leaves.position.set(-6.3, 0.95, -4.3); leaves.castShadow = true; scene.add(leaves);

// ── 빛 ──
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a58c, 0.9));
const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
sun.position.set(6, 9, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
sun.shadow.bias = -0.0004;
scene.add(sun);

// ── 사람 ──
const [f, m] = await Promise.all(['rocketbox-f01', 'rocketbox-m01']
  .map((id) => loadPack({ url: `/packs/${id}`, GLTFLoader })));
const players = {
  f: createClipPlayer({ THREE, SkeletonUtils, catalog: f.catalog, gltfOf: f.gltfOf }),
  m: createClipPlayer({ THREE, SkeletonUtils, catalog: m.catalog, gltfOf: m.gltfOf }),
};
// headingRad: 0 = +Z(카메라 쪽), π/2 = +X
const deg = (d) => (d * Math.PI) / 180;
const CAST = [
  // 탁자 옆 대화 한 쌍
  { who: 'f', clip: 'talk', at: [1.8, -2.1], face: deg(60) },
  { who: 'm', clip: 'listen', at: [3.0, -1.5], face: deg(-120) },
  // 앞쪽 대화 한 쌍
  { who: 'm', clip: 'talk', at: [-1.2, 1.6], face: deg(80) },
  { who: 'f', clip: 'listen', at: [-0.1, 1.8], face: deg(-100) },
  // 혼자 통화
  { who: 'f', clip: 'phone-call', at: [4.4, 1.2], face: deg(-20) },   // 남자 동작을 옮겨 붙인 것 (scripts/retarget.mjs)
  // 그림을 찍는 사람
  { who: 'm', clip: 'photo', at: [-4.6, -1.0], face: deg(-90) },
  // 손 흔드는 사람 — 걸어오는 사람에게
  { who: 'f', clip: 'wave', at: [-3.4, -3.3], face: deg(20) },
  // 걷는 두 사람
  { who: 'm', clip: 'walk-forward', at: [0.9, -0.4], face: deg(-150), walk: true },
  { who: 'f', clip: 'walk-forward', at: [-2.6, 3.4], face: deg(95), walk: true },
  // 창가에서 둘러보기
  { who: 'm', clip: 'look-around', at: [0.6, -4.1], face: deg(10) },
];
const people = [];
CAST.forEach((c, i) => {
  const p = players[c.who].spawn({
    clipId: c.clip, position: [c.at[0], 0, c.at[1]], headingRad: c.face, inPlace: !!c.walk,
  });
  // 동작마다 위상을 흩는다 — 같은 순간이면 복제한 것처럼 보인다.
  p.mixer.update(((i * 0.61803) % 1) * p.clip.durationS);
  p.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(p.root);
  people.push(p);
});

const clock = new THREE.Timer();
let frames = 0;
function tick(t) {
  clock.update(t);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!window.__freeze) for (const pl of Object.values(players)) pl.update(dt);
  renderer.render(scene, camera);
  if (++frames === 30) window.__ready = { people: people.length, clips: CAST.map((c) => c.clip) };
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
