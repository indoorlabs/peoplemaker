// 멀리 있는 사람들이 다 같은 회색이다 — 색을 **정점에** 구워 넣는다.
//
// ## 왜 텍스처를 안 쓰는가
//
// 먼 단계(instancedCrowd)는 한 색으로 칠한다. 그래서 100명을 세우면 100명이
// 같은 회색 덩어리다. 옷 색도 머리 색도 없다.
//
// 고치는 길은 둘이다.
//
//   1. 텍스처를 그대로 쓴다 — 그림은 제일 좋지만, 먼 사람만 필요한 화면도
//      1024×1024 PNG 셋(3.7MB)을 받아야 하고, 화면 몇 픽셀짜리 사람에게
//      그 해상도는 통째로 버려진다.
//   2. **텍스처를 정점에 한 번 구워 넣는다** — 정점마다 색 셋(12바이트).
//      줄인 살이 정점 1,030개이므로 12KB 다. 드로우콜도 재료도 안 는다.
//
// 여기는 2번이다. 멀리서 사람을 보면 눈에 남는 것은 무늬가 아니라 **덩어리
// 색**이다 — 남색 웃옷·살색 팔·검은 머리. 그것은 정점 색으로 남는다.
//
// ## 색을 지어내지 않는다
//
// 색은 팩의 baseColorTexture 에서 **UV 로 찍어** 온다. 텍스처가 없는 팩은
// baseColorFactor 를 쓴다. 둘 다 없으면 색이 없다고 말하고 만다 — 그럴듯한
// 살색을 골라 넣지 않는다.
//
// 이 파일에는 three.js 도 DOM 도 없다. 그림을 푸는 일(PNG 디코딩)은 어댑터가
// 하고, 여기는 **푼 화소**를 받는다.

/**
 * 그림에서 한 점을 찍는다 (겹선형).
 *
 * @param image { width, height, data }  data 는 RGBA 바이트 (ImageData 와 같은 모양)
 * @param u, v  GLTF 의 UV — **v 는 위에서 아래로** 간다 (ImageData 의 줄 차례와 같다).
 *              뒤집으면 얼굴에 옷 색이 오고, 그림만 봐서는 "좀 이상한데" 로만 보인다.
 * @returns [r, g, b] 0~1
 */
export function sampleImage(image, u, v, { wrap = 'repeat' } = {}) {
  const { width: w, height: h, data } = image;
  if (!(w > 0 && h > 0) || !data) throw new Error('그림이 비었다');
  const fix = (t) => (wrap === 'clamp' ? Math.min(1, Math.max(0, t)) : t - Math.floor(t));
  const x = fix(u) * w - 0.5;
  const y = fix(v) * h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const at = (xi, yi) => {
    let cx = xi, cy = yi;
    if (wrap === 'clamp') {
      cx = Math.min(w - 1, Math.max(0, cx));
      cy = Math.min(h - 1, Math.max(0, cy));
    } else {
      cx = ((cx % w) + w) % w;
      cy = ((cy % h) + h) % h;
    }
    return (cy * w + cx) * 4;
  };
  const out = [0, 0, 0];
  const corners = [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)],
    [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]];
  for (const [cx, cy, k] of corners) {
    const i = at(cx, cy);
    out[0] += k * data[i]; out[1] += k * data[i + 1]; out[2] += k * data[i + 2];
  }
  return [out[0] / 255, out[1] / 255, out[2] / 255];
}

/**
 * 정점마다 색 하나 — UV 로 텍스처를 찍어서.
 *
 * @param uv     정점마다 (u, v)
 * @param image  { width, height, data } — 없으면 factor 를 쓴다
 * @param factor 텍스처가 없을 때 쓸 색 [r, g, b] (baseColorFactor)
 */
export function colorsFromUV(uv, image, factor = [1, 1, 1], opts = {}) {
  const n = image ? uv.length / 2 : (opts.count ?? uv.length / 2);
  const out = new Float32Array(n * 3);
  if (!image) {
    for (let v = 0; v < n; v++) {
      out[v * 3] = factor[0]; out[v * 3 + 1] = factor[1]; out[v * 3 + 2] = factor[2];
    }
    return out;
  }
  for (let v = 0; v < n; v++) {
    const c = sampleImage(image, uv[v * 2], uv[v * 2 + 1], opts);
    // 텍스처의 색에 factor 를 곱한다 — 규약이 그렇게 곱하라고 적어 두었고,
    // 대개 factor 가 1 이라 아무것도 안 바뀐다.
    out[v * 3] = c[0] * factor[0];
    out[v * 3 + 1] = c[1] * factor[1];
    out[v * 3 + 2] = c[2] * factor[2];
  }
  return out;
}

/**
 * 이 색들이 정말 여러 색인가 — **구운 것이 뜻이 있는지를 수로 본다.**
 *
 * 텍스처를 잘못 찍으면 (UV 가 뒤집혔거나, 1×1 그림을 읽었거나) 모든 정점이
 * 거의 같은 색이 된다. 그러면 색을 구운 뜻이 없는데, 화면에서는 "회색 대신
 * 살색 덩어리" 라 멀쩡해 보인다. 그래서 흩어진 정도를 낸다.
 *
 * @returns { spread, mean, distinct } spread 는 채널별 표준편차의 평균
 */
export function colorSpread(colors) {
  const n = colors.length / 3;
  if (!n) return { spread: 0, mean: [0, 0, 0], distinct: 0 };
  const mean = [0, 0, 0];
  for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) mean[c] += colors[v * 3 + c] / n;
  const varr = [0, 0, 0];
  const seen = new Set();
  for (let v = 0; v < n; v++) {
    for (let c = 0; c < 3; c++) varr[c] += ((colors[v * 3 + c] - mean[c]) ** 2) / n;
    seen.add(`${Math.round(colors[v * 3] * 16)},${Math.round(colors[v * 3 + 1] * 16)},${Math.round(colors[v * 3 + 2] * 16)}`);
  }
  return {
    spread: (Math.sqrt(varr[0]) + Math.sqrt(varr[1]) + Math.sqrt(varr[2])) / 3,
    mean,
    distinct: seen.size,
  };
}
