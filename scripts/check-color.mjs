// check:color — 먼 사람이 **제 색**을 입었는가.
//
// 먼 단계는 한 색으로 칠했다. 100명을 세우면 100명이 같은 회색 덩어리였다.
// 이제 팩의 baseColorTexture 를 UV 로 찍어 정점마다 색 하나를 굽는다.
//
// 이 부류는 조용히 틀린다. 색이 **있기는 한데** 틀린 색인 경우가 그렇다 —
// v 를 뒤집어 얼굴에 옷 색이 오거나, 1×1 그림을 읽어 온몸이 한 색이 되거나,
// 텍스처를 못 찾아 흰색으로 물러선 것을 아무도 모른다. 화면에서는 "회색은
// 아니네" 로 보이고 넘어간다.
//
// 그래서 수로 묻는다:
//   1. 찍는 셈이 맞는가 — 아는 그림에서 아는 색이 나오는가 (겹선형·가장자리)
//   2. **v 는 위에서 아래로** 가는가 (GLTF 의 규약)
//   3. 줄여도 색이 남는가 — 그리고 그 색이 **원래 있던 색인가**
//   4. 진짜 몸: 색이 정말 여럿인가, 부위마다 다른가, 기록한 수와 같은가
//   5. 텍스처가 없는 팩은 baseColorFactor 로 물러서는가 (문에서 끝까지)
//
// 로켓박스 팩은 저장소에 없다 (.gitignore). 없으면 4번을 건너뛰고 말한다.

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import { sampleImage, colorsFromUV, colorSpread } from '../src/lib/vertexColor.mjs';
import { weldMesh, simplifyMesh } from '../src/lib/meshLod.mjs';
import { parseGLB } from '../src/lib/gltf.mjs';
import { decodePNG } from './png.mjs';
import { skinnedMeshOf, imagesOf } from '../src/lib/bodyMesh.mjs';
import { PACK_MEASURED } from '../src/lib/crowdBudget.mjs';

/** 화소를 손으로 적은 그림 — 답을 알고 묻기 위해. */
function image(w, h, pixels) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = pixels[i][0];
    data[i * 4 + 1] = pixels[i][1];
    data[i * 4 + 2] = pixels[i][2];
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const to255 = (c) => c.map((x) => Math.round(x * 255));

runGate('check-color', (g) => {
  let n = 0;

  // ── 1. 찍는 셈 ──
  {
    // 2×2 — 왼위 빨강, 오른위 초록, 왼아래 파랑, 오른아래 흰색.
    const img = image(2, 2, [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]]);
    const corners = [
      ['왼위', 0.25, 0.25, [255, 0, 0]],
      ['오른위', 0.75, 0.25, [0, 255, 0]],
      ['왼아래', 0.25, 0.75, [0, 0, 255]],
      ['오른아래', 0.75, 0.75, [255, 255, 255]],
    ];
    for (const [what, u, v, want] of corners) {
      n++;
      const got = to255(sampleImage(img, u, v));
      if (got.join() !== want.join()) g.fail(`sample/${what}`, `${what} 텍셀 가운데를 찍었는데 ${got.join()} 가 나왔다 (${want.join()} 여야)`);
    }
    n++;
    // **v 는 아래로 간다.** 뒤집혀 있으면 위아래 두 줄이 서로 바뀐다 —
    // 사람에게서는 머리에 신발 색이 오는 식이고, 그림만 봐서는 못 알아챈다.
    const top = to255(sampleImage(img, 0.25, 0.25));
    const bottom = to255(sampleImage(img, 0.25, 0.75));
    if (top.join() !== '255,0,0' || bottom.join() !== '0,0,255') {
      g.fail('sample/v-down', `v=0.25 가 ${top.join()} · v=0.75 가 ${bottom.join()} — 위아래가 뒤집혔다`);
    }
    n++;
    // 겹선형 — 두 텍셀 한가운데는 평균이어야 한다.
    const mid = sampleImage(img, 0.5, 0.25);
    if (!near(mid[0], 0.5, 0.01) || !near(mid[1], 0.5, 0.01)) {
      g.fail('sample/bilinear', `빨강과 초록 사이가 ${to255(mid).join()} 다 — 섞이지 않았다`);
    }
    n++;
    // 가장자리 밖 — clamp 는 끝 색, repeat 는 돌아온다.
    const clamped = to255(sampleImage(img, 1.4, 0.25, { wrap: 'clamp' }));
    if (clamped.join() !== '0,255,0') g.fail('sample/clamp', `u=1.4 를 clamp 로 찍었는데 ${clamped.join()} 다`);
    n++;
    const wrapped = to255(sampleImage(img, 1.25, 0.25));
    if (wrapped.join() !== '255,0,0') g.fail('sample/repeat', `u=1.25 를 repeat 로 찍었는데 ${wrapped.join()} 다 (u=0.25 와 같아야)`);
    n++;
    try {
      sampleImage({ width: 0, height: 0, data: null }, 0, 0);
      g.fail('sample/empty', '빈 그림을 받아 준다');
    } catch { /* 던지는 것이 맞다 */ }
  }

  // ── 2. 정점마다 색 ──
  {
    const img = image(2, 1, [[255, 0, 0], [0, 0, 255]]);
    const uv = Float32Array.from([0.25, 0.5, 0.75, 0.5]);
    n++;
    const c = colorsFromUV(uv, img);
    if (to255([c[0], c[1], c[2]]).join() !== '255,0,0' || to255([c[3], c[4], c[5]]).join() !== '0,0,255') {
      g.fail('colors/uv', `정점 둘이 ${to255([...c.slice(0, 3)]).join()} · ${to255([...c.slice(3)]).join()} 다`);
    }
    n++;
    // 텍스처가 없으면 factor 로 채운다 — 그럴듯한 살색을 지어내지 않는다.
    const f = colorsFromUV(null, null, [0.2, 0.4, 0.6], { count: 3 });
    if (f.length !== 9 || !near(f[0], 0.2) || !near(f[7], 0.4)) {
      g.fail('colors/factor', 'factor 로 안 채운다');
    }
    n++;
    // factor 는 텍스처 색에 곱해진다 (규약이 그렇다).
    const half = colorsFromUV(uv, img, [0.5, 0.5, 0.5]);
    if (!near(half[0], c[0] / 2, 1e-5)) g.fail('colors/factor-mul', 'factor 를 안 곱한다');

    // 흩어짐 — 한 색이면 0, 여러 색이면 0 보다 크다.
    n++;
    const flat = colorsFromUV(null, null, [0.5, 0.5, 0.5], { count: 10 });
    // 0 과 견주지 않는다 — 평균을 나눠 더하는 동안 1e-9 쯤이 남는다.
    if (colorSpread(flat).spread > 1e-6) g.fail('spread/flat', '같은 색만 있는데 흩어졌다고 한다');
    n++;
    if (!(colorSpread(c).spread > 0.1)) g.fail('spread/varied', '빨강과 파랑이 섞인 것을 안 흩어졌다고 한다');
  }

  // ── 3. 줄여도 색이 남는가 ──
  //
  // 줄이기는 점을 **남기지 지어내지 않는다**. 색도 같은 규약이라, 줄인 살의
  // 색은 전부 이은 살에 있던 색이어야 한다.
  {
    const size = 8;
    const pos = [], idx = [], uv = [];
    for (let y = 0; y <= size; y++) {
      for (let x = 0; x <= size; x++) { pos.push(x / size, 0, y / size); uv.push(x / size, y / size); }
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = y * (size + 1) + x;
        idx.push(a, a + 1, a + size + 1, a + 1, a + size + 2, a + size + 1);
      }
    }
    // 왼쪽 절반 빨강 · 오른쪽 절반 파랑인 그림
    const px = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px.push(x < 8 ? [200, 30, 30] : [30, 30, 200]);
    const color = colorsFromUV(Float32Array.from(uv), image(16, 16, px));
    const mesh = {
      position: Float32Array.from(pos), normal: new Float32Array(pos.length), color,
      skinIndex: new Uint16Array((pos.length / 3) * 4), skinWeight: new Float32Array((pos.length / 3) * 4),
      index: Uint32Array.from(idx),
    };
    for (let v = 0; v < pos.length / 3; v++) mesh.skinWeight[v * 4] = 1;

    const welded = weldMesh(mesh);
    n++;
    if (!welded.color) g.fail('carry/weld', '이으면서 색을 버린다');
    const small = simplifyMesh(mesh, { ratio: 0.25 });
    n++;
    if (!small.color || small.color.length !== small.position.length) g.fail('carry/simplify', '줄이면서 색을 버린다');
    n++;
    // 색이 아예 없으면 아래를 볼 것이 없다 — 던지지 말고 말하고 넘어간다.
    if (!welded.color || !small.color) return n;
    const known = new Set();
    for (let v = 0; v < welded.color.length; v += 3) {
      known.add(`${welded.color[v].toFixed(4)},${welded.color[v + 1].toFixed(4)},${welded.color[v + 2].toFixed(4)}`);
    }
    let invented = 0;
    for (let v = 0; v < small.color.length; v += 3) {
      if (!known.has(`${small.color[v].toFixed(4)},${small.color[v + 1].toFixed(4)},${small.color[v + 2].toFixed(4)}`)) invented++;
    }
    if (invented) g.fail('carry/invented', `줄인 살에 원래 없던 색이 ${invented}개 있다 — 색을 섞었다`);
    n++;
    // 두 색이 다 남았는가 — 한쪽이 통째로 사라지면 반쪽이 회색이 된다.
    if (!(colorSpread(small.color).spread > 0.1)) g.fail('carry/lost', '줄이고 나니 한 색만 남았다');
  }

  // ── 4. 진짜 몸 ──
  const rec = PACK_MEASURED.rocketbox.instancedLod.color;
  const bodyFile = path.join(ROOT, 'packs', 'rocketbox-f01', 'body.glb');
  if (!fs.existsSync(bodyFile)) {
    console.log('  [색] 로켓박스 팩이 없어 진짜 몸 검사는 건너뛰었다 (scripts/import-rocketbox.mjs 로 만든다)');
  } else {
    const doc = parseGLB(fs.readFileSync(bodyFile));
    n++;
    // 그림이 정말 풀리는가 — 1×1 로 물러서면 온몸이 한 색이 된다.
    const imageOf = imagesOf(doc, decodePNG);
    const img = imageOf(0);
    if (!(img?.width >= 256 && img?.height >= 256)) {
      g.fail('body/texture', `팩의 텍스처가 ${img ? `${img.width}×${img.height}` : '안 풀린다'}`);
    }
    const mesh = skinnedMeshOf(doc, { imageOf });
    const lod = simplifyMesh(mesh, { ratio: PACK_MEASURED.rocketbox.instancedLod.ratio });
    const sp = colorSpread(lod.color);
    n++;
    if (!(sp.spread > rec.spread * 0.9)) {
      g.fail('body/spread', `색이 ${sp.spread.toFixed(3)} 만큼만 흩어졌다 — 기록은 ${rec.spread}`);
    }
    n++;
    if (!(sp.distinct >= rec.distinct * 0.9)) {
      g.fail('body/distinct', `색이 ${sp.distinct} 가지다 — 기록은 ${rec.distinct}`);
    }
    n++;
    // 평균색이 기록과 같은가 — v 가 뒤집히거나 조각이 섞이면 여기가 움직인다.
    for (let c = 0; c < 3; c++) {
      if (Math.abs(sp.mean[c] - rec.mean[c]) > 0.02) {
        g.fail('body/mean', `평균색이 ${sp.mean.map((x) => x.toFixed(3)).join(',')} 다 — 기록은 ${rec.mean.join(',')}`);
        break;
      }
    }
    n++;
    // **부위마다 다른가.** 옷과 살과 머리가 다른 색이어야 색을 구운 뜻이 있다.
    // 이 몸의 바인드 공간은 z 가 위다 — 축을 재서 쓴다.
    const P = lod.position;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) {
      for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], P[i + c]); hi[c] = Math.max(hi[c], P[i + c]); }
    }
    const size = [0, 1, 2].map((c) => hi[c] - lo[c]);
    const up = size.indexOf(Math.max(...size));
    const meanOf = (a, b) => {
      const m = [0, 0, 0];
      let k = 0;
      for (let v = 0; v < P.length / 3; v++) {
        const t = (P[v * 3 + up] - lo[up]) / size[up];
        if (t < a || t >= b) continue;
        for (let c = 0; c < 3; c++) m[c] += lod.color[v * 3 + c];
        k++;
      }
      return k ? m.map((x) => x / k) : null;
    };
    const head = meanOf(0.9, 1.01);
    const chest = meanOf(0.45, 0.55);
    const apart = head && chest
      ? Math.max(...[0, 1, 2].map((c) => Math.abs(head[c] - chest[c]))) : 0;
    if (!(apart > 0.03)) {
      g.fail('body/regions', `머리쪽과 가슴쪽 색이 ${apart.toFixed(3)} 밖에 안 다르다 — 온몸이 한 색이면 구운 뜻이 없다`);
    }
    console.log(`  [색] Rocketbox 몸: 흩어짐 ${sp.spread.toFixed(3)} · 색 ${sp.distinct}가지 · 평균 ${to255(sp.mean).join(',')}`);
    console.log(`  [색] 머리쪽 ${to255(head).join(',')} · 가슴쪽 ${to255(chest).join(',')} (텍스처 ${img.width}×${img.height} 에서 찍었다)`);
  }

  // ── 5. 텍스처가 없는 팩은 factor 로 ──
  //
  // 합성 기준 팩은 텍스처도 UV 도 없고 baseColorFactor 만 있다. 문에서
  // 끝까지 — 팩을 받아 색을 굽고, 그 색이 카탈로그의 그 색인지.
  {
    const pack = path.join(ROOT, 'packs', 'ref-synthetic');
    const doc = parseGLB(fs.readFileSync(path.join(pack, 'body.glb')));
    const mesh = skinnedMeshOf(doc, { imageOf: () => null });
    const want = doc.json.materials[0].pbrMetallicRoughness.baseColorFactor.slice(0, 3);
    n++;
    let off = 0;
    for (let v = 0; v < mesh.color.length; v += 3) {
      for (let c = 0; c < 3; c++) if (!near(mesh.color[v + c], want[c], 1e-6)) off++;
    }
    if (off) g.fail('factor/pack', `텍스처 없는 팩에서 ${off}개 성분이 baseColorFactor 와 다르다`);
    n++;
    if (colorSpread(mesh.color).spread > 1e-6) g.fail('factor/flat', 'factor 하나로 채웠는데 색이 흩어져 있다');
    console.log(`  [색] 기준 팩: 텍스처가 없어 baseColorFactor ${to255(want).join(',')} 로 채웠다`);
  }

  return n;
});
