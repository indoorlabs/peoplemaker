// PNG 를 화소로 — **게이트와 빌드 쪽에서만** 쓴다.
//
// 브라우저는 그림을 스스로 푼다 (three 가 ImageBitmap 으로 준다). Node 에는
// 그 길이 없어서, 게이트가 "먼 사람의 색이 정말 팩의 텍스처에서 왔는가" 를
// 물으려면 여기서 풀어야 한다.
//
// **src/lib 에 두지 않는다.** node:zlib 를 쓰기 때문이다 — 순수 층은 브라우저
// 에서도 그대로 돌아야 한다는 것이 이 저장소의 규약이고, node 전용 모듈이
// 하나 들어가면 그 규약이 깨진다.
//
// 푸는 것은 우리 팩에 실제로 들어 있는 모양뿐이다: 8비트 · 색 유형 2(RGB)와
// 6(RGBA) · 인터레이스 없음. 다른 모양은 **말하고 멈춘다** — 조용히 엉뚱한
// 화소를 내면 그 색이 어디서 왔는지 아무도 모르게 된다.

import zlib from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * @returns { width, height, data }  data 는 RGBA 바이트 — ImageData 와 같은 모양
 */
export function decodePNG(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (let i = 0; i < SIG.length; i++) {
    if (u8[i] !== SIG[i]) throw new Error('PNG 서명이 아니다');
  }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let off = 8;
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off + 8 <= u8.byteLength) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(u8[off + 4], u8[off + 5], u8[off + 6], u8[off + 7]);
    const start = off + 8;
    if (type === 'IHDR') {
      width = dv.getUint32(start);
      height = dv.getUint32(start + 4);
      depth = u8[start + 8];
      colorType = u8[start + 9];
      interlace = u8[start + 12];
    } else if (type === 'IDAT') {
      idat.push(u8.subarray(start, start + len));
    } else if (type === 'IEND') break;
    off = start + len + 4;      // 4 는 CRC
  }
  if (depth !== 8) throw new Error(`${depth}비트 PNG 는 안 읽는다 (8비트만)`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`색 유형 ${colorType} 는 안 읽는다 (2·6 만)`);
  if (interlace) throw new Error('인터레이스 PNG 는 안 읽는다');
  if (!idat.length) throw new Error('IDAT 가 없다');

  const raw = zlib.inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c))));
  const bpp = colorType === 2 ? 3 : 4;
  const stride = width * bpp;
  const out = new Uint8ClampedArray(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);

  let at = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[at++];
    for (let x = 0; x < stride; x++) {
      const v = raw[at + x];
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let r;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: {
          // Paeth — 셋 중 예측에 가장 가까운 것.
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`모르는 필터 ${filter} (줄 ${y})`);
      }
      line[x] = r & 0xff;
    }
    at += stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = line[x * bpp];
      out[o + 1] = line[x * bpp + 1];
      out[o + 2] = line[x * bpp + 2];
      out[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev.set(line);
  }
  return { width, height, data: out };
}
