// Microsoft Rocketbox 인물 하나를 peoplemaker 팩으로 받아 온다.
//
//   node scripts/import-rocketbox.mjs rocketbox-f01
//   node scripts/import-rocketbox.mjs <packId> <Adults/인물> <걷기클립> <서기클립>
//
// Rocketbox(MIT, 리깅된 사실적 인물 115종)는 **몸과 동작이 다른 파일**이고,
// 텍스처는 2048 TGA 다. peoplemaker 의 팩은 클립마다 몸이 들어 있는 GLB 여야
// 하므로 여기서 합친다:
//
//   1. 내려받기   몸 FBX · 색 텍스처 셋 · 걷기(xy)·서기(static) 클립 FBX
//                 (packs/.cache/rocketbox 에 둔다 — 한 번 받으면 다시 안 받는다)
//   2. FBX→GLB   FBX2glTF (npm fbx2gltf 가 플랫폼별 실행 파일을 담고 있다)
//   3. 텍스처    TGA 를 1024 PNG 로 줄인다 — **노드만으로.** Rocketbox TGA 는
//                압축 없는 24·32 비트라 푸는 데 라이브러리가 필요 없다
//   4. 접붙이기  몸 GLB 에 클립의 트랙을 **뼈 이름으로** 옮긴다 (노드 번호는
//                두 파일에서 서로 다르다). FBX2glTF 가 TGA 를 못 찾아 넣은 1×1
//                자리표시 이미지는 줄인 PNG 로 바꾼다
//   5. 재기      sources.json 을 쓰고 build-pack 을 부른다 — 길이·속도·접촉은
//                사람이 안 적는다
//
// 걷기는 `xy` 판을 쓴다. 이동이 들어 있어야 build-pack 이 속도를 잴 수 있다.
// 서기는 `static`(제자리) 판이다.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets';
const CACHE = path.join(ROOT, 'packs', '.cache', 'rocketbox');

/** 이름을 붙여 둔 인물들 — 인자로 따로 줘도 된다. */
const PRESETS = {
  'rocketbox-f01': { avatar: 'Adults/Female_Adult_01', walk: 'f_walk_neutral_01', idle: 'f_idle_breathe_01', ko: '여자 01', en: 'woman 01', tags: ['female', 'adult'] },
  'rocketbox-m01': { avatar: 'Adults/Male_Adult_01', walk: 'm_walk_neutral_01', idle: 'm_idle_breathe_01', ko: '남자 01', en: 'man 01', tags: ['male', 'adult'] },
};

/**
 * 제자리 동작 — 인물마다 f_/m_ 가 붙는다. Rocketbox 에는 제자리 동작이 326개
 * 있다 (Animations/all_animations_max_motextr_static). 여기 둔 것은 사람이
 * 공간에 있을 때 흔한 것만이다. 여자 쪽에는 전화 통화(cell_phone_talk)가
 * 없어서 둘 다 문자 보내기로 맞췄다.
 */
const EXTRAS = [
  { id: 'talk', anim: 'gestic_talk_neutral_01', ko: '말하기', en: 'Talk', tags: ['talk', 'social'] },
  { id: 'listen', anim: 'gestic_listen_neutral_01', ko: '듣기', en: 'Listen', tags: ['listen', 'social'] },
  { id: 'phone', anim: 'cell_phone_textmessage', ko: '휴대폰 보기', en: 'Texting', tags: ['phone'] },
  { id: 'wave', anim: 'wave_01', ko: '손 흔들기', en: 'Wave', tags: ['wave', 'social'] },
  { id: 'look-around', anim: 'idle_look_around_01', ko: '둘러보기', en: 'Look around', tags: ['idle'] },
  { id: 'photo', anim: 'take_picture', ko: '사진 찍기', en: 'Take a picture', tags: ['photo'] },
];

const [packId, argAvatar, argWalk, argIdle] = process.argv.slice(2);
if (!packId) {
  console.error('쓰임: node scripts/import-rocketbox.mjs <packId> [Adults/인물] [걷기클립] [서기클립]');
  console.error(`      이름을 붙여 둔 것: ${Object.keys(PRESETS).join(' · ')}`);
  process.exit(2);
}
const preset = PRESETS[packId] || {};
const avatar = argAvatar || preset.avatar;
const walk = argWalk || preset.walk;
const idle = argIdle || preset.idle;
if (!avatar || !walk || !idle) { console.error(`${packId}: 인물·걷기·서기를 알 수 없다 — 인자로 줘야 한다`); process.exit(2); }
const avatarName = path.basename(avatar);

// ── 1. 내려받기 ──
async function fetchTo(rel, dst) {
  if (fs.existsSync(dst) && fs.statSync(dst).size > 0) return dst;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const url = `${RAW}/${rel.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${rel} 를 못 받았다 (HTTP ${res.status})`);
  fs.writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
  console.log(`  받음 ${rel} (${(fs.statSync(dst).size / 1024 / 1024).toFixed(1)} MB)`);
  return dst;
}

// ── 2. FBX → GLB ──
function fbx2glb(input, outNoExt) {
  const bin = {
    win32: 'Windows_NT/FBX2glTF.exe', linux: 'Linux/FBX2glTF', darwin: 'Darwin/FBX2glTF',
  }[process.platform];
  const exe = path.join(ROOT, 'node_modules', 'fbx2gltf', 'bin', bin || '');
  if (!bin || !fs.existsSync(exe)) throw new Error(`FBX2glTF 실행 파일이 없다 (${process.platform}) — npm i 를 먼저`);
  const r = spawnSync(exe, ['-b', '--input', input, '--output', outNoExt], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`FBX2glTF 실패: ${input}\n${r.stderr || r.stdout}`);
  return `${outNoExt}.glb`;
}

// ── 3. TGA → 줄인 PNG (노드만으로) ──
/**
 * 압축 없는(2) · RLE(10) 트루컬러 TGA 를 푼다. 결과는 **위에서 아래로** 줄이
 * 놓인 RGBA 다 — TGA 의 기본은 아래에서 위라, 안 뒤집으면 텍스처가 거꾸로
 * 붙는다.
 */
function decodeTGA(buf) {
  const idLen = buf[0];
  const cmapType = buf[1];
  const type = buf[2];
  const w = buf.readUInt16LE(12);
  const h = buf.readUInt16LE(14);
  const bpp = buf[16];
  const topLeft = (buf[17] & 0x20) !== 0;
  if (cmapType !== 0 || (type !== 2 && type !== 10) || (bpp !== 24 && bpp !== 32)) {
    throw new Error(`이 TGA 는 못 푼다 (type ${type}, ${bpp}bpp, colormap ${cmapType})`);
  }
  const px = bpp / 8;
  const out = Buffer.alloc(w * h * 4);
  let src = 18 + idLen;
  let i = 0;
  const put = (o) => {
    out[i * 4] = buf[o + 2]; out[i * 4 + 1] = buf[o + 1]; out[i * 4 + 2] = buf[o];
    out[i * 4 + 3] = px === 4 ? buf[o + 3] : 255;
    i++;
  };
  if (type === 2) {
    for (; i < w * h;) { put(src); src += px; }
  } else {
    while (i < w * h) {
      const hdr = buf[src++];
      const count = (hdr & 0x7f) + 1;
      if (hdr & 0x80) { for (let k = 0; k < count; k++) put(src); src += px; }
      else { for (let k = 0; k < count; k++) { put(src); src += px; } }
    }
  }
  if (!topLeft) {
    const row = w * 4;
    const tmp = Buffer.alloc(row);
    for (let y = 0; y < h >> 1; y++) {
      const a = y * row; const b = (h - 1 - y) * row;
      out.copy(tmp, 0, a, a + row); out.copy(out, a, b, b + row); tmp.copy(out, b);
    }
  }
  return { w, h, rgba: out, hasAlpha: px === 4 };
}

/** 정수 배로 줄인다 — 칸 평균. 2048 → 1024 가 대부분이다. */
function downscale(img, target) {
  const f = Math.max(1, Math.round(img.w / target));
  if (f === 1) return img;
  const w = Math.floor(img.w / f); const h = Math.floor(img.h / f);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0, 0];
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const o = ((y * f + dy) * img.w + (x * f + dx)) * 4;
          acc[0] += img.rgba[o]; acc[1] += img.rgba[o + 1]; acc[2] += img.rgba[o + 2]; acc[3] += img.rgba[o + 3];
        }
      }
      const n = f * f; const o = (y * w + x) * 4;
      out[o] = acc[0] / n; out[o + 1] = acc[1] / n; out[o + 2] = acc[2] / n; out[o + 3] = acc[3] / n;
    }
  }
  return { w, h, rgba: out, hasAlpha: img.hasAlpha };
}

/**
 * PNG 로 싼다 — 줄마다 **Paeth 필터**를 쓴다.
 *
 * 처음엔 필터 없이 쌌더니 Pillow 판보다 30% 컸다(1.5 MB 대 1.2 MB). 클립마다
 * 텍스처가 들어가서 클립 하나가 5.5 MB 가 됐다. 사진 같은 텍스처는 이웃
 * 화소와의 차이가 작아서, 차이를 싸면 zlib 이 훨씬 잘 줄인다.
 */
function encodePNG({ w, h, rgba, hasAlpha }) {
  const ch = hasAlpha ? 4 : 3;
  const stride = w * ch;
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < ch; c++) px[y * stride + x * ch + c] = rgba[(y * w + x) * 4 + c];
    }
  }
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 4;                                      // Paeth
    for (let i = 0; i < stride; i++) {
      const cur = px[y * stride + i];
      const a = i >= ch ? px[y * stride + i - ch] : 0;              // 왼쪽
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;               // 위
      const c = y > 0 && i >= ch ? px[(y - 1) * stride + i - ch] : 0; // 왼쪽 위
      const p = a + b - c;
      const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[o + 1 + i] = (cur - pred) & 0xff;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = hasAlpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 4. 접붙이기 ──
async function graft(bodyGlb, clipGlb, textures, outPath) {
  const io = new NodeIO();
  const body = await io.read(bodyGlb);
  const clip = await io.read(clipGlb);
  const root = body.getRoot();
  const buffer = root.listBuffers()[0] || body.createBuffer();
  const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  for (const a of root.listAnimations()) a.dispose();          // 몸 쪽 빈 Take
  const src = clip.getRoot().listAnimations()[0];
  if (!src) throw new Error(`${clipGlb}: 애니메이션이 없다`);
  const anim = body.createAnimation('clip');
  const copyAcc = (acc) => body.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(buffer);
  let kept = 0; let skipped = 0;
  for (const ch of src.listChannels()) {
    // 몸에 없는 노드(Footsteps · MotionExtractionHelper · 얼굴 세부)는 건너뛴다 —
    // 거기 매달린 살이 없으니 그려질 것도 없다.
    const dst = byName.get(ch.getTargetNode()?.getName());
    if (!dst) { skipped++; continue; }
    const s = ch.getSampler();
    const sampler = body.createAnimationSampler()
      .setInput(copyAcc(s.getInput())).setOutput(copyAcc(s.getOutput())).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler);
    anim.addChannel(body.createAnimationChannel().setTargetNode(dst).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    kept++;
  }
  const part = (m) => (/_body$/.test(m) ? 'body' : /_head$/.test(m) ? 'head' : /_opacity$/.test(m) ? 'opacity' : null);
  let textured = 0;
  for (const m of root.listMaterials()) {
    const p = part(m.getName());
    if (!p || !textures[p]) continue;
    m.setBaseColorTexture(body.createTexture(`${m.getName()}_color`).setImage(new Uint8Array(textures[p])).setMimeType('image/png'));
    m.setBaseColorFactor([1, 1, 1, 1]);
    // 금속 1 이면 환경맵 없는 장면에서 까맣게 나온다 (기준 팩에서 한 번 겪었다).
    m.setMetallicFactor(0);
    m.setRoughnessFactor(0.85);
    if (p === 'opacity') { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.5); m.setDoubleSided(true); }
    textured++;
  }
  // 자리표시(1×1)만 남은 텍스처는 치운다.
  for (const t of root.listTextures()) {
    const img = t.getImage();
    if (img && img.byteLength < 200 && t.listParents().filter((x) => x.propertyType !== 'Root').length === 0) t.dispose();
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await io.write(outPath, body);
  return { kept, skipped, textured, kb: Math.round(fs.statSync(outPath).size / 1024) };
}

// ── 돌린다 ──
const dir = path.join(ROOT, 'packs', packId);
const work = path.join(CACHE, avatarName);
fs.mkdirSync(work, { recursive: true });

console.log(`${packId} ← Rocketbox ${avatar} · 걷기 ${walk} · 서기 ${idle}`);
const bodyFbx = await fetchTo(`Avatars/${avatar}/Export/${avatarName}.fbx`, path.join(work, `${avatarName}.fbx`));
const walkFbx = await fetchTo(`Animations/all_animations_max_motextr_xy/${walk}.max.fbx`, path.join(CACHE, 'anims', `${walk}.max.fbx`));
const idleFbx = await fetchTo(`Animations/all_animations_max_motextr_static/${idle}.max.fbx`, path.join(CACHE, 'anims', `${idle}.max.fbx`));

// 텍스처 접두어(f001 · m002 …)는 인물마다 다르다 — 폴더 이름이 아니라 몸
// GLB 의 재질 이름에서 읽는다.
const bodyGlb = fbx2glb(bodyFbx, path.join(work, avatarName));
const mats = (await new NodeIO().read(bodyGlb)).getRoot().listMaterials().map((m) => m.getName());
const prefix = (mats.find((m) => /_body$/.test(m)) || '').replace(/_body$/, '');
if (!prefix) throw new Error(`${avatarName}: 몸 재질(_body)을 못 찾았다 — 재질 ${mats.join(', ')}`);
const textures = {};
for (const p of ['body', 'head', 'opacity']) {
  const tga = await fetchTo(`Avatars/${avatar}/Textures/${prefix}_${p}_color.tga`, path.join(work, `${prefix}_${p}_color.tga`));
  const img = downscale(decodeTGA(fs.readFileSync(tga)), 1024);
  textures[p] = encodePNG(img);
  console.log(`  텍스처 ${p}: ${img.w}×${img.h}${img.hasAlpha ? ' RGBA' : ''} → ${(textures[p].length / 1024).toFixed(0)} KB`);
}

const walkGlb = fbx2glb(walkFbx, path.join(CACHE, 'anims', walk));
const idleGlb = fbx2glb(idleFbx, path.join(CACHE, 'anims', idle));
// 제자리 동작의 앞글자(f_/m_)는 걷기 클립 이름에서 읽는다 — 인물과 같은 쪽이다.
const sex = /^([fm])_/.exec(walk)?.[1];
const extras = [];
for (const x of sex ? EXTRAS : []) {
  const file = `${sex}_${x.anim}`;
  const fbx = await fetchTo(`Animations/all_animations_max_motextr_static/${file}.max.fbx`, path.join(CACHE, 'anims', `${file}.max.fbx`));
  extras.push({ ...x, file, glb: fbx2glb(fbx, path.join(CACHE, 'anims', file)) });
}
for (const [id, clipGlb] of [['walk-forward', walkGlb], ['idle', idleGlb], ...extras.map((x) => [x.id, x.glb])]) {
  const r = await graft(bodyGlb, clipGlb, textures, path.join(dir, 'clips', `${id}.glb`));
  console.log(`  ${id}.glb: 트랙 ${r.kept} · 건너뜀 ${r.skipped} · 텍스처 ${r.textured} · ${r.kb} KB`);
}

// ── 5. 사람이 적는 것만 적고, 나머지는 잰다 ──
const name = { ko: preset.ko || avatarName, en: preset.en || avatarName };
const source = (anim) => ({
  tool: 'microsoft/Microsoft-Rocketbox',
  avatar: `Assets/Avatars/${avatar}/Export/${avatarName}.fbx`,
  animation: anim,
  convertedBy: 'FBX2glTF 0.9.7 + peoplemaker/import-rocketbox',
});
const sources = {
  packId,
  version: '0.1.0',
  skeleton: 'biped',
  note: `Microsoft Rocketbox 의 ${avatarName} (MIT, Copyright (c) Microsoft Corporation). 몸과 동작이 원래 다른 파일이라 scripts/import-rocketbox.mjs 가 접붙였다 — 동작은 뼈 이름으로 맞췄고, 텍스처는 2048 TGA 를 1024 PNG 로 줄였다. 한 팩에 한 사람이다: 두 사람을 한 팩에 넣으면 속도에 맞춰 클립을 고르다 걷는 도중 사람이 바뀐다.`,
  clips: [
    { id: 'walk-forward', name: { ko: `앞으로 걷기 (${name.ko})`, en: `Walk forward (${name.en})` }, license: 'MIT',
      source: source(`Assets/Animations/all_animations_max_motextr_xy/${walk}.max.fbx`), tags: ['walk', ...(preset.tags || [])] },
    { id: 'idle', name: { ko: `서 있기 (${name.ko})`, en: `Idle (${name.en})` }, license: 'MIT',
      source: source(`Assets/Animations/all_animations_max_motextr_static/${idle}.max.fbx`), tags: ['idle', ...(preset.tags || [])] },
    ...extras.map((x) => ({
      id: x.id, name: { ko: `${x.ko} (${name.ko})`, en: `${x.en} (${name.en})` }, license: 'MIT',
      source: source(`Assets/Animations/all_animations_max_motextr_static/${x.file}.max.fbx`), tags: [...x.tags, ...(preset.tags || [])],
    })),
  ],
};
fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-pack.mjs'), packId], { stdio: 'inherit' });
process.exit(b.status ?? 1);
