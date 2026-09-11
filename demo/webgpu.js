// WebGPU 에서 우리 사람이 그려지는가 — 최소 재현.
//
// spacemaker 안에서는 "안 보인다" 까지만 알 수 있었다. 자리도 크기도 재질도
// 맞는데 화면에 없었고, 남의 앱 안에서는 렌더러 문제인지 우리 문제인지
// 가를 수가 없다. 여기서는 씬에 셋만 둔다:
//
//   1. 스킨 없는 상자 (같은 재질)   — 렌더러가 도는가
//   2. 팩의 사람 하나               — 스킨 메시가 그려지는가
//   3. 바닥 격자                    — 눈으로 크기를 재는 자
//
// 화면을 보지 않고도 답이 나오게, 렌더 뒤 픽셀을 세어 HUD 에 적는다.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadPack, createClipPlayer } from '../src/web/index.mjs';

const hud = document.getElementById('hud');
const lines = [];
const say = (s) => { lines.push(s); hud.textContent = lines.join('\n'); };

// 같은 파일을 두 렌더러로 돌린다 — 견줄 것이 있어야 원인이 갈린다.
// webgpu.html 은 three.webgpu.js 를, webgl.html 은 three.module.js 를 물린다.
const renderer = THREE.WebGPURenderer
  ? new THREE.WebGPURenderer({ antialias: true })
  : new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(3.2, 1.8, 4.2);
camera.lookAt(0, 0.9, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(3, 6, 4);
scene.add(key);
scene.add(new THREE.GridHelper(10, 10, 0x445566, 0x2a2f36));

// ── 1. 스킨 없는 상자. 사람과 **같은 재질 종류**로 만든다. ──
const boxMat = new THREE.MeshStandardMaterial({ color: 0x66ccaa, roughness: 0.6, metalness: 0 });
const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.7, 0.4), boxMat);
box.position.set(-1.2, 0.85, 0);
scene.add(box);

say(`three ${THREE.REVISION} · WebGPURenderer`);

let person = null;
let player = null;

async function main() {
  if (renderer.init) await renderer.init();
  say(`backend: ${renderer.backend?.constructor?.name || (renderer.isWebGLRenderer ? 'WebGL' : '?')}`);

  const pack = await loadPack({ url: '/packs/ref-synthetic', GLTFLoader });
  say(`팩: 클립 ${pack.catalog.clips.length}개 · 앞 ${((pack.catalog.forwardRad * 180) / Math.PI).toFixed(0)}°`);

  player = createClipPlayer({ THREE, SkeletonUtils, catalog: pack.catalog, gltfOf: pack.gltfOf });
  person = player.spawn({ clipId: 'walk-forward', position: [1.2, 0, 0], inPlace: true });
  scene.add(person.root);

  let skinned = 0;
  let mat = '?';
  let bones = 0;
  person.root.traverse((o) => {
    if (o.isSkinnedMesh) { skinned++; mat = o.material?.type; bones = o.skeleton?.bones?.length || 0; }
  });
  say(`사람: 스킨메시 ${skinned} · 재질 ${mat} · 뼈 ${bones}`);

  // 굽는 쪽이 쓰는 뼈 텍스처가 있는가 — WebGPU 스키닝이 이것을 본다.
  let boneTex = 'none';
  person.root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) boneTex = o.skeleton.boneTexture ? 'yes' : 'no';
  });
  say(`skeleton.boneTexture: ${boneTex}`);

  renderer.setAnimationLoop(tick);
}

/** 화면에서 그 색이 몇 픽셀인가 — 눈으로 안 보고 세어 답을 낸다. */
async function countPixels() {
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;
  let buf = null;
  if (renderer.readRenderTargetPixelsAsync) {
    buf = await renderer.readRenderTargetPixelsAsync(null, 0, 0, w, h).catch(() => null);
  } else if (renderer.getContext) {
    const gl = renderer.getContext();
    buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  }
  if (!buf) return null;
  let left = 0;
  let right = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = buf[i]; const g = buf[i + 1]; const b = buf[i + 2];
      // 배경(0x14161a)·격자와 다른 밝은 픽셀만 센다
      if (r + g + b < 150) continue;
      if (x < w / 2) left++; else right++;
    }
  }
  return { left, right };
}

let t = 0;
function tick(now) {
  const dt = Math.min(0.05, (now - t) / 1000 || 0.016);
  t = now;
  player?.update(dt);
  renderer.render(scene, camera);
}

main().catch((e) => say(`실패: ${e.message}`));

// 손잡이 — 이 파일은 재현 하네스라, 밖에서 만져 볼 수 있게 열어 둔다.
window.__THREE = THREE;
window.__scene = scene;
window.__ref = { get person() { return person; }, get player() { return player; } };

// 밖에서 물어볼 자리 — 게이트와 브라우저 도구가 같은 것을 본다.
window.__probe = async () => {
  const px = await countPixels();
  const out = { backend: renderer.backend?.constructor?.name || '?', pixels: px };
  if (person) {
    const v = new THREE.Vector3();
    person.root.updateWorldMatrix(true, true);
    const hips = player.resolveBone(person, 'mixamorig:Hips');
    out.hipsWorld = hips ? hips.getWorldPosition(v).toArray().map((n) => +n.toFixed(2)) : null;
    person.root.traverse((o) => {
      if (o.isSkinnedMesh) out.skin = { mat: o.material?.type, bones: o.skeleton?.bones?.length, boneTexture: !!o.skeleton?.boneTexture };
    });
  }
  return out;
};
