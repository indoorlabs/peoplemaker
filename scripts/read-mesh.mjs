// GLB 의 스킨 메시를 배열로 — 게이트가 살을 직접 만질 때 쓴다.
//
// **web 의 geometryOf 와 같은 규칙**이라야 한다: 조각을 잇고, 알파로 오려
// 내는 조각(속눈썹·머리카락 카드)은 뺀다. 규칙이 갈라지면 게이트가 앱이
// 안 그리는 살을 검사하게 된다.
//
// 색을 함께 구울 수 있다 (`imageOf`). 그림을 푸는 일은 부르는 쪽이 한다 —
// 브라우저는 three 가 풀어 주고, Node 는 scripts/png.mjs 가 푼다.

import { readAccessor } from '../src/lib/gltf.mjs';
import { colorsFromUV } from '../src/lib/vertexColor.mjs';

/**
 * @param doc     parseGLB 결과
 * @param imageOf (textureIndex) => { width, height, data } | null — 주면 색을 굽는다
 */
export function skinnedMeshOf(doc, { imageOf = null } = {}) {
  const j = doc.json;
  const parts = [];
  for (const mesh of j.meshes || []) {
    for (const p of mesh.primitives || []) {
      if (p.attributes.JOINTS_0 === undefined) continue;
      const mat = j.materials?.[p.material];
      const cutout = !!mat && (mat.alphaMode === 'BLEND' || mat.alphaMode === 'MASK');
      parts.push({ p, mat, cutout });
    }
  }
  if (!parts.length) throw new Error('스킨 메시가 없다');
  const use = parts.some((x) => !x.cutout) ? parts.filter((x) => !x.cutout) : parts;

  const pos = [], nor = [], si = [], sw = [], idx = [], col = [];
  let base = 0;
  for (const { p, mat } of use) {
    const P = readAccessor(doc, p.attributes.POSITION);
    const N = p.attributes.NORMAL !== undefined ? readAccessor(doc, p.attributes.NORMAL) : null;
    const J = readAccessor(doc, p.attributes.JOINTS_0);
    const W = readAccessor(doc, p.attributes.WEIGHTS_0);
    const I = readAccessor(doc, p.indices);
    const count = P.length / 3;
    for (let i = 0; i < count * 3; i++) { pos.push(P[i]); nor.push(N ? N[i] : 0); }
    for (let i = 0; i < count * 4; i++) { si.push(J[i]); sw.push(W[i]); }
    for (let i = 0; i < I.length; i++) idx.push(I[i] + base);
    base += count;

    if (!imageOf) continue;
    const pbr = mat?.pbrMetallicRoughness || {};
    const factor = (pbr.baseColorFactor || [1, 1, 1, 1]).slice(0, 3);
    const texIndex = pbr.baseColorTexture?.index;
    const uvIndex = p.attributes.TEXCOORD_0;
    const image = texIndex != null && uvIndex != null ? imageOf(texIndex) : null;
    const uv = image ? readAccessor(doc, uvIndex) : null;
    const c = colorsFromUV(uv, image, factor, { count });
    for (let i = 0; i < c.length; i++) col.push(c[i]);
  }

  return {
    position: Float32Array.from(pos),
    normal: Float32Array.from(nor),
    color: imageOf ? Float32Array.from(col) : null,
    skinIndex: Uint16Array.from(si),
    skinWeight: Float32Array.from(sw),
    index: Uint32Array.from(idx),
    parts: use.length,
  };
}

/** 이 GLB 안의 그림을 푸는 함수 — 텍스처 번호로 찾아 준다. */
export function imagesOf(doc, decode) {
  const cache = new Map();
  return (textureIndex) => {
    if (cache.has(textureIndex)) return cache.get(textureIndex);
    let out = null;
    try {
      const source = doc.json.textures?.[textureIndex]?.source;
      const img = doc.json.images?.[source];
      const bv = img != null ? doc.json.bufferViews?.[img.bufferView] : null;
      if (bv) {
        const off = bv.byteOffset || 0;
        out = decode(doc.bin.subarray(off, off + bv.byteLength));
      }
    } catch { out = null; }
    cache.set(textureIndex, out);
    return out;
  };
}

/**
 * 구운 한 프레임의 뼈 행렬로 살에 자세를 입힌다 — 셰이더가 하는 셈과 같다.
 *
 * @param baked lib/poseBake.mjs 의 bakeClip 결과
 */
export function skinPoints(mesh, baked, frame) {
  const out = new Float32Array(mesh.position.length);
  const at = frame * baked.bones * 16;
  for (let v = 0; v < mesh.position.length / 3; v++) {
    const x = mesh.position[v * 3], y = mesh.position[v * 3 + 1], z = mesh.position[v * 3 + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let c = 0; c < 4; c++) {
      const w = mesh.skinWeight[v * 4 + c];
      if (!(w > 0)) continue;
      const m = at + mesh.skinIndex[v * 4 + c] * 16;
      ox += w * (baked.data[m] * x + baked.data[m + 4] * y + baked.data[m + 8] * z + baked.data[m + 12]);
      oy += w * (baked.data[m + 1] * x + baked.data[m + 5] * y + baked.data[m + 9] * z + baked.data[m + 13]);
      oz += w * (baked.data[m + 2] * x + baked.data[m + 6] * y + baked.data[m + 10] * z + baked.data[m + 14]);
    }
    out[v * 3] = ox; out[v * 3 + 1] = oy; out[v * 3 + 2] = oz;
  }
  return out;
}

/**
 * 점 무리의 **가장 긴 축 길이** — 몸의 키를 공간에 안 매이게 재는 법.
 *
 * 바인드 자세는 z 가 위이고(Rocketbox), 자세를 입히면 y 가 위다. 축을 골라
 * 재면 둘을 못 견준다.
 */
export function longestExtent(points) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      if (points[i + c] < lo[c]) lo[c] = points[i + c];
      if (points[i + c] > hi[c]) hi[c] = points[i + c];
    }
  }
  return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
}
