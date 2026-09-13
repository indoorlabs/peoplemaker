// **가장 짧은 길** — `npm i` 하고 이것만 베끼면 군중이 선다.
//
//   node scripts/serve-demo.mjs → http://localhost:5180/demo/minimal.html
//
// 여기서 쓰는 것은 **설치하면 따라오는 것뿐이다** (먼 몸 + 서기·걷기·뛰기,
// 사람 열둘에 5.5MB). 몸째도 텍스처도 나머지 클립도 안 받는다 — 도시 스케일
// 화면은 그것들을 한 번도 안 쓰면서 받고 있었다.
//
// 그리고 **문 하나만 쓴다** (`import … from 'peoplemaker'`). 안쪽 파일을
// 직접 가져가면 이 저장소가 내부를 고칠 때마다 남의 앱이 깨진다.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  loadPack, bakeFromPack, geometryOf, createMixedCrowd,
  planCast, castReport, planCrowdMeasured, measuredFor,
} from 'peoplemaker';

const hud = document.getElementById('hud');
const say = (t) => { hud.textContent = t; };

// ── 1. 어떤 사람들을 세울 것인가 ──────────────────────────────
//
// 프로필은 **비율만** 말한다 (교원 1인당 학생 12.1명 → 학생 92.37%). 몇
// 명인지는 건물을 아는 쪽이 정하므로 여기서 준다.
const WANT = Number(new URLSearchParams(location.search).get('people') || 400);
const PROFILE = await (await fetch('/profiles/school-kr.json')).json();

// 설치하면 따라오는 클립 — 이만큼으로 서고 걷고 뛴다.
const SHIPPED = ['idle', 'walk-forward', 'run'];

// ── 2. 팩을 받는다 ───────────────────────────────────────────
//
// `body: 'far'` 가 요점이다. 먼 몸은 살을 줄이고 색을 구워 둔 것이라
// **텍스처가 없다** — 받을 것이 팩당 163KB 다 (몸째는 4.2MB).
const IDS = [
  'rocketbox-f01', 'rocketbox-f02', 'rocketbox-m01', 'rocketbox-m02',
  'rocketbox-business-f01', 'rocketbox-business-m01',
  'rocketbox-medical-f01', 'rocketbox-medical-m01',
  'rocketbox-security-f01', 'rocketbox-security-m01',
  'rocketbox-c01', 'rocketbox-c02',
];
say('팩을 받는 중…');
const packs = await Promise.all(IDS.map((id) => loadPack({
  url: `/packs/${id}`, GLTFLoader, body: 'far', clips: SHIPPED,
})));

// ── 3. 누구를 어느 몸으로 세울 것인가 ─────────────────────────
//
// 배역이 사람 번호를 팩에 붙인다. **없는 사람은 없다고 말한다** — 이 프로필은
// 학생이 어린이라 채워지지만, 노인을 찾는 프로필이면 여기서 0명이 나온다.
const cast = planCast(PROFILE, { packs: packs.map((p) => p.catalog), count: WANT });
// **역할은 번호에서 뭉쳐 있다** (학생 0~369 · 교원 370~399). 배역은 한 역할
// 안에서만 몸을 번갈아 붙인다 — 화면에 세워 보면 교원이 한 덩어리로 보인다.
// 섞어 놓고 싶으면 **자리를 정하는 쪽**이 섞는다 (여기가 아니다).

// ── 4. 군중을 만든다 ─────────────────────────────────────────
//
// 몸마다 InstancedMesh 하나다 (드로우콜 = 몸 가짓수). 사람 번호는 이어지므로
// 쓰는 쪽은 `place(i, …)` 하나만 보면 된다.
const kinds = packs.map((p) => ({
  id: p.catalog.packId,
  atlas: bakeFromPack(p, SHIPPED),
  geometry: geometryOf(p),          // 먼 몸은 이미 줄이고 색까지 구워져 있다
}));
const crowd = createMixedCrowd({
  THREE,
  kinds,
  count: cast.filled,
  // 배역이 정한 대로 — 안 주면 고르게 섞는다.
  kindOf: (i) => IDS.indexOf(cast.kindOf(i)),
});

// ── 5. 화면 ──────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 2.2));
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshBasicMaterial({ color: 0x1b1f25 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
for (const m of crowd.meshes) scene.add(m);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 14, 34);
camera.lookAt(0, 1, 0);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── 6. 사람을 놓고 걷게 한다 ─────────────────────────────────
//
// **경로는 이 저장소가 안 낸다.** 여기서는 줄지어 앞으로 보내고 끝에서 되돌린다 —
// 진짜 경로는 공간을 아는 쪽(spacemaker)이 낸다.
const SPEED = 1.2;            // m/s — 걷는 속도는 쓰는 쪽이 정한다
const cols = Math.ceil(Math.sqrt(cast.filled));
const people = [];
for (let i = 0; i < cast.filled; i++) {
  const x = ((i % cols) - cols / 2) * 1.1;
  const z = (Math.floor(i / cols) - cols / 2) * 1.1;
  people.push({ x, z });
  crowd.place(i, {
    position: [x, 0, z],
    headingRad: 0,
    clipId: 'walk-forward',
    // 사람마다 재생 시각을 흩어 놓는다 — 안 그러면 전부 같은 발이 나간다.
    timeOffsetS: (i % 37) / 37,
  });
}

const table = measuredFor(packs[0].catalog.packId);
const budget = table
  ? planCrowdMeasured(cast.filled, 4, table, ['full', 'instancedLod', 'instancedLodTenth'], { kinds: kinds.length })
  : null;

say([
  castReport(cast).split('\n')[0],
  `몸 ${kinds.length}가지 · 드로우콜 ${crowd.drawCalls} · 받은 것 먼 몸 + ${SHIPPED.join('·')}`,
  budget ? `4ms 예산: ${budget.ms}ms (${budget.mix.map((m) => `${m.tier} ${m.count}`).join(' + ')})` : '',
  '경로는 spacemaker 가 낸다 — 여기서는 줄지어 걷기만 한다',
].filter(Boolean).join('\n'));

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    p.z += SPEED * dt;
    if (p.z > cols * 0.6) p.z -= cols * 1.1;
    // **자리만 옮긴다.** place 로 옮기면 매 프레임 첫 자세로 돌아가 다리가 떨린다.
    crowd.moveTo(i, { position: [p.x, 0, p.z] });
  }
  crowd.update(dt);
  renderer.render(scene, camera);
});
