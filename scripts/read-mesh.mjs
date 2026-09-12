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
