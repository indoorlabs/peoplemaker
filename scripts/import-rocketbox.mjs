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
import { parseGLB } from '../src/lib/gltf.mjs';
import { bodyOnly, motionOnly, extractAnimation, encodeGLB } from '../src/lib/gltfWrite.mjs';
import { bakeFarLevels } from './build-far.mjs';
import { retargetClip, animationOf, restBoneScale } from '../src/lib/retarget.mjs';
import { NodeIO } from '@gltf-transform/core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets';
const CACHE = path.join(ROOT, 'packs', '.cache', 'rocketbox');

/** 이름을 붙여 둔 인물들 — 인자로 따로 줘도 된다. */
// `person` 은 **잰 값이 아니라 적은 값이다.** 살을 재서 "이 사람은 어린이다"
// 를 알아낼 방법이 없다 — 키 1.43m 는 열 살일 수도 작은 어른일 수도 있다.
// Rocketbox 가 폴더로 나눠 둔 것(Adults/Children/Professions)을 그대로 옮겨
// 적고, 출처를 `declared-by-import` 로 남긴다 (계약의 PERSON_SOURCES).
const PRESETS = {
  'rocketbox-f01': { avatar: 'Adults/Female_Adult_01', walk: 'f_walk_neutral_01', idle: 'f_idle_breathe_01', ko: '여자 01', en: 'woman 01', person: { source: 'declared-by-import', ageBand: 'adult', sex: 'female', mobility: 'walk', attire: 'casual' }, tags: ['female', 'adult'] },
  'rocketbox-m01': { avatar: 'Adults/Male_Adult_01', walk: 'm_walk_neutral_01', idle: 'm_idle_breathe_01', ko: '남자 01', en: 'man 01', person: { source: 'declared-by-import', ageBand: 'adult', sex: 'male', mobility: 'walk', attire: 'casual' }, tags: ['male', 'adult'] },
  'rocketbox-f02': { avatar: 'Adults/Female_Adult_02', walk: 'f_walk_neutral_01', idle: 'f_idle_breathe_01', ko: '여자 02', en: 'woman 02', person: { source: 'declared-by-import', ageBand: 'adult', sex: 'female', mobility: 'walk', attire: 'casual' }, tags: ['female', 'adult'] },
  'rocketbox-m02': { avatar: 'Adults/Male_Adult_02', walk: 'm_walk_neutral_01', idle: 'm_idle_breathe_01', ko: '남자 02', en: 'man 02', person: { source: 'declared-by-import', ageBand: 'adult', sex: 'male', mobility: 'walk', attire: 'casual' }, tags: ['male', 'adult'] },
  'rocketbox-business-f01': { avatar: 'Professions/Business_Female_01', walk: 'f_walk_neutral_01', idle: 'f_idle_breathe_01', ko: '정장 여자 01', en: 'business woman 01', person: { source: 'declared-by-import', ageBand: 'adult', sex: 'female', mobility: 'walk', attire: 'business' }, tags: ['female', 'adult', 'business'] },
  'rocketbox-business-m01': { avatar: 'Professions/Business_Male_01', walk: 'm_walk_neutral_01', idle: 'm_idle_breathe_01', ko: '정장 남자 01', en: 'business man 01', person: { source: 'declared-by-import', ageBand: 'adult', sex: 'male', mobility: 'walk', attire: 'business' }, tags: ['male', 'adult', 'business'] },
  // **어린이는 걸음 클립이 어른 것뿐이다.** Rocketbox 의 동작 326개가 전부
  // f_/m_ (어른)이라, 그대로 붙이면 키 차이만큼 발이 뜨거나 파묻힐 수 있다.
  // 받아서 **재 보고** 정한다 — 뜨면 scripts/retarget.mjs 로 옮겨 붙인다.
  'rocketbox-c01': { avatar: 'Children/Male_Child_01', walk: 'm_walk_neutral_01', idle: 'm_idle_breathe_01', ko: '남자아이 01', en: 'boy 01', person: { source: 'declared-by-import', ageBand: 'child', sex: 'male', mobility: 'walk', attire: 'casual' }, tags: ['male', 'child'] },
  'rocketbox-c02': { avatar: 'Children/Female_Child_01', walk: 'f_walk_neutral_01', idle: 'f_idle_breathe_01', ko: '여자아이 01', en: 'girl 01', person: { source: 'declared-by-import', ageBand: 'child', sex: 'female', mobility: 'walk', attire: 'casual' }, tags: ['female', 'child'] },
  // **요양시설·병원에 필요한 사람들.** Rocketbox 는 MIT 라 라이선스가 안 는다
  // (휠체어를 못 넣은 까닭이 CC-BY 였던 것과 다르다).
  //
  // **노인은 여기에도 없다.** Adults 40명·Professions 74명의 이름을 다 봤는데
  // old · senior · elder 로 잡히는 것이 0개다. 그래서 요양시설의 입소자는
  // 여전히 못 세운다 — 그 사실을 배역이 수로 말한다.
  'rocketbox-medical-f01': { avatar: 'Professions/Medical_Female_01', walk: 'f_walk_neutral_01', idle: 'f_idle_breathe_01', ko: '의료진 여자 01', en: 'medical woman 01', person: { source: 'declared-by-import', ageBand: 'adult', sex: 'female', mobility: 'walk', attire: 'care-worker' }, tags: ['female', 'adult', 'medical'] },
  'rocketbox-medical-m01': { avatar: 'Professions/Medical_Male_01', walk: 'm_walk_neutral_01', idle: 'm_idle_breathe_01', ko: '의료진 남자 01', en: 'medical man 01', person: { source: 'declared-by-import', ageBand: 'adult', sex: 'male', mobility: 'walk', attire: 'care-worker' }, tags: ['male', 'adult', 'medical'] },
  'rocketbox-security-m01': { avatar: 'Professions/Security_Male_01', walk: 'm_walk_neutral_01', idle: 'm_idle_breathe_01', ko: '경비 남자 01', en: 'security man 01', person: { source: 'declared-by-import', ageBand: 'adult', sex: 'male', mobility: 'walk', attire: 'uniform' }, tags: ['male', 'adult', 'security'] },
  'rocketbox-security-f01': { avatar: 'Professions/Security_Female_01', walk: 'f_walk_neutral_01', idle: 'f_idle_breathe_01', ko: '경비 여자 01', en: 'security woman 01', person: { source: 'declared-by-import', ageBand: 'adult', sex: 'female', mobility: 'walk', attire: 'uniform' }, tags: ['female', 'adult', 'security'] },
};

/**
 * 제자리 동작 — 인물마다 f_/m_ 가 붙는다. Rocketbox 에는 제자리 동작이 326개
 * 있다 (Animations/all_animations_max_motextr_static). 여기 둔 것은 사람이
 * 공간에 있을 때 흔한 것만이다. 여자 쪽에는 전화 통화(cell_phone_talk)가
 * 없어서 둘 다 문자 보내기로 맞췄고, 통화는 남자 쪽에만 받는다(only) —
 * 여자 몸에는 scripts/retarget.mjs 로 옮겨 붙인다.
 */
const EXTRAS = [
  { id: 'talk', anim: 'gestic_talk_neutral_01', ko: '말하기', en: 'Talk', tags: ['talk', 'social'] },
  { id: 'listen', anim: 'gestic_listen_neutral_01', ko: '듣기', en: 'Listen', tags: ['listen', 'social'] },
  { id: 'phone', anim: 'cell_phone_textmessage', ko: '휴대폰 보기', en: 'Texting', tags: ['phone'] },
  { id: 'wave', anim: 'wave_01', ko: '손 흔들기', en: 'Wave', tags: ['wave', 'social'] },
  { id: 'look-around', anim: 'idle_look_around_01', ko: '둘러보기', en: 'Look around', tags: ['idle'] },
  { id: 'photo', anim: 'take_picture', ko: '사진 찍기', en: 'Take a picture', tags: ['photo'] },
  // **앉기.** 계약이 처음부터 "접촉 이벤트는 앉기·문 열기를 공간에 맞출 때
  // 쓴다" 고 적어 두었는데, 정작 앉은 클립이 없었다. 의자에 앉은 사람은
  // 건물 재실자의 절반이다.
  // **앉기는 옮겨 붙인다** (접붙이면 안 된다). 이 파일은 쉬는 자세부터 앉아
  // 있어서, 트랙이 안 건드리는 뼈가 몸의 **선 자세**로 남는다 — 엉덩이는
  // 앉았는데 발끝이 12cm 땅속으로 들어갔다. 옮겨 붙이면 짝지은 뼈 전부의
  // 세계 회전을 다시 쓰므로 발끝이 1cm 에 선다.
  { id: 'sit', anim: 'sit_chair_idle_neutral_01', ko: '앉아 있기', en: 'Sitting', tags: ['sit', 'seated'], retarget: true },
  // 책상에 앉은 사람 — 사무실 재실자의 기본 자세다. 의자 동작과 같은 이유로
  // 옮겨 붙인다 (쉬는 자세부터 앉아 있다).
  { id: 'sit-table', anim: 'sit_table_idle_neutral_01', ko: '책상에 앉아 있기', en: 'Sitting at a table', tags: ['sit', 'seated', 'work'], retarget: true },
  // 문 — 계약이 "접촉 이벤트는 앉기·**문 열기**를 공간에 맞출 때 쓴다" 고
  // 적어 둔 그 문이다.
  { id: 'door-open', anim: 'try_door_inwards', ko: '문 열기', en: 'Opening a door', tags: ['door', 'reach'] },
  { id: 'door-knock', anim: 'knock_door', ko: '문 두드리기', en: 'Knocking on a door', tags: ['door', 'reach'] },
  // 쪼그리기 — 엉덩이가 앉은 만큼 내려가지만 **의자가 없다**. 앉기와 가르는
  // 값이 계약에 있어야 한다 (그래서 받는다).
  { id: 'crouch', anim: 'crouch_idle', ko: '쪼그려 앉기', en: 'Crouching', tags: ['crouch'], retarget: true },
  { id: 'documents', anim: 'documents_check', ko: '서류 보기', en: 'Checking documents', tags: ['work', 'hold'] },
  { id: 'drink', anim: 'drink_drinking', ko: '마시기', en: 'Drinking', tags: ['hold'] },
  { id: 'clap', anim: 'claphands_01', ko: '박수', en: 'Clapping', tags: ['social'] },
  { id: 'work-table', anim: 'work_table', ko: '책상에서 일하기', en: 'Working at a table', tags: ['work'] },
  { id: 'stretch', anim: 'idle_stretch_arms_01', ko: '기지개', en: 'Stretching', tags: ['idle'] },
  // **이동 클립** — 제자리 동작과 다른 폴더(_xy)에서 받는다. 걷기 하나뿐일
  // 때는 모든 속도를 재생 속도로만 맞췄다 (빨리 걸으라면 걷기를 빨리 돌렸다).
  // 뛰기가 있어야 대피가 대피가 된다.
  { id: 'run', anim: 'run_neutral_01', ko: '뛰기', en: 'Running', tags: ['run', 'travel'], travel: true },
  { id: 'walk-fast', anim: 'walk_fast_01', ko: '빨리 걷기', en: 'Walking fast', tags: ['walk', 'travel'], travel: true },
  { id: 'walk-slow', anim: 'walk_slow_01', ko: '천천히 걷기', en: 'Walking slowly', tags: ['walk', 'travel'], travel: true },
  { id: 'phone-call', anim: 'cell_phone_talk_01', ko: '전화 통화', en: 'Phone call', tags: ['phone', 'talk'], only: 'm' },

  // ── 비상시 ────────────────────────────────────────────────
  //
  // **Rocketbox 에 쓰러짐도 폭력도 없다** (동작 326개를 다 뒤졌다 — fall ·
  // collapse · faint · punch · fight 로 잡히는 것이 0개다). 있는 것은
  // "다쳐서 절뚝이며 걷기 · 기침 · 화난 자세 · 주저앉기" 까지다. 없는 것을
  // 비슷한 것으로 메우지 않는다 — 화난 자세를 폭력이라고 적으면 그 팩으로
  // 만든 폭력 시나리오가 조용히 거짓이 된다.
  //
  // 성별이 한쪽만 있는 동작이 여럿이다. 남자 몸에는 scripts/retarget.mjs 로
  // 옮겨 붙이면 되고, 옮기기 전까지는 **그 팩에 없는 것**이다.
  { id: 'cough', anim: 'idle_cough_01', ko: '기침', en: 'Coughing', tags: ['distress'] },
  { id: 'nervous', anim: 'idle_nervous_01', ko: '불안해하기', en: 'Nervous', tags: ['distress'] },
  { id: 'angry', anim: 'idle_angry_01', ko: '화난 자세', en: 'Angry stance', tags: ['distress', 'conflict'] },
  // 문 너머를 살핀다 — 화재 시 표준 행동이다 (문이 뜨거운지 본다).
  { id: 'door-listen', anim: 'listen_door', ko: '문에 귀 대기', en: 'Listening at a door', tags: ['door', 'distress'] },
  // **주저앉기는 전이 클립이다.** crouch(쪼그린 채 있기)는 이미 있는데,
  // 서 있다가 주저앉는 **과정**이 없었다. 그것이 crouch_in 이다.
  { id: 'crouch-in', anim: 'crouch_in', ko: '주저앉기', en: 'Crouching down', tags: ['crouch', 'transition'], only: 'f', retarget: true },
  { id: 'crouch-out', anim: 'crouch_out', ko: '주저앉았다 일어서기', en: 'Standing up from a crouch', tags: ['crouch', 'transition'], only: 'f', retarget: true },
  // 다쳐서 움직이는 사람 — 피난 시간이 크게 달라지는 자리다.
  { id: 'walk-injured', anim: 'walk_injured', ko: '다쳐서 걷기', en: 'Walking injured', tags: ['walk', 'travel', 'distress'], travel: true, only: 'f' },
  { id: 'run-injured', anim: 'run_injured', ko: '다쳐서 뛰기', en: 'Running injured', tags: ['run', 'travel', 'distress'], travel: true },
  { id: 'walk-bruised', anim: 'walk_bruised', ko: '절뚝이며 걷기', en: 'Walking bruised', tags: ['walk', 'travel', 'distress'], travel: true },

  // ── 장비를 다루는 사람 ────────────────────────────────────
  //
  // 건물 안 사람의 절반은 **무언가를 들고 있다** — 카트·가방·우산·서류철.
  // 그런데 쓰는 쪽이 그 물건을 손에 붙이려면 두 가지를 알아야 한다: 어느
  // 뼈에 매달 것인가, 그리고 그 손이 몸 어디쯤에 있는가. `holds` 로 무엇을
  // 드는지 적고, `grip` 을 재서 계약에 싣는다 (lib/packBuild.deriveGrip).
  //
  // 가방(hold_bag)은 남녀 파일 이름이 달라(f 는 _01 이 붙는다) 여기 안 넣었다 —
  // 이름을 하나로 못 적으면 조용히 한쪽만 들어온다.
  { id: 'trolley', anim: 'trolley_idle', ko: '카트 밀기', en: 'Pushing a trolley', tags: ['hold', 'equipment'], holds: { what: 'trolley', hand: 'both' } },
  { id: 'umbrella', anim: 'umbrella_idle_01', ko: '우산 쓰기', en: 'Holding an umbrella', tags: ['hold', 'equipment'], holds: { what: 'umbrella', hand: 'right' } },
  { id: 'newspaper', anim: 'newspaper_hand_idle', ko: '신문 보기', en: 'Reading a newspaper', tags: ['hold', 'equipment'], holds: { what: 'newspaper', hand: 'both' } },
  { id: 'file', anim: 'documentfile_idle', ko: '서류철 들기', en: 'Holding a file', tags: ['hold', 'equipment', 'work'], holds: { what: 'document', hand: 'right' } },
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
async function fetchTo(rel, dst, { optional = false } = {}) {
  if (fs.existsSync(dst) && fs.statSync(dst).size > 0) return dst;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const url = `${RAW}/${rel.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url);
  // 없어도 되는 파일은 null 로 — 크게 실패하는 것이 기본이고, 없어도 되는
  // 것만 부르는 쪽이 그렇다고 말한다.
  if (res.status === 404 && optional) return null;
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
  // **Bip 번호를 떼고 잇는다.**
  //
  // 어른 몸은 `Bip01 …`, 어린이 몸은 `Bip02 …` 다 (3ds Max 에서 한 장면에
  // 둘째 바이페드가 받는 번호다). 동작 326개는 전부 Bip01 로 만들어져 있어서,
  // 이름을 그대로 맞추면 어린이에게는 **트랙이 하나도 안 붙는다** — 105개가
  // 전부 건너뛰어졌고, 그 결과가 "애니메이션이 0개다" 였다.
  //
  // 번호만 떼면 84개 중 83개가 이름으로 맞는다 (남는 하나는 뼈가 아니라
  // 메시다). 뼈대 규약이 같은 것이지 다른 리그가 아니므로, 옮겨 붙이기
  // (retarget)가 아니라 **이름 맞추기**가 맞다.
  const unnumber = (name) => (name || '').replace(/^Bip\d\d\b/, 'Bip');
  const byName = new Map(root.listNodes().map((n) => [unnumber(n.getName()), n]));
  for (const a of root.listAnimations()) a.dispose();          // 몸 쪽 빈 Take
  const src = clip.getRoot().listAnimations()[0];
  if (!src) throw new Error(`${clipGlb}: 애니메이션이 없다`);
  const anim = body.createAnimation('clip');
  const copyAcc = (acc) => body.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(buffer);
  let kept = 0; let skipped = 0;
  for (const ch of src.listChannels()) {
    // 몸에 없는 노드(Footsteps · MotionExtractionHelper · 얼굴 세부)는 건너뛴다 —
    // 거기 매달린 살이 없으니 그려질 것도 없다.
    const dst = byName.get(unnumber(ch.getTargetNode()?.getName()));
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
// 몸·머리는 인물마다 있고, **opacity 는 없는 인물이 있다** — 속눈썹·머리카락
// 카드가 없는 몸(어린이)이 그렇다. 없으면 없는 대로 간다: 그 재질을 쓰는
// 조각이 아예 없으므로, 빈 자리를 지어내면 오히려 1×1 자리표시가 남는다.
const textures = {};
for (const p of ['body', 'head', 'opacity']) {
  const rel = `Avatars/${avatar}/Textures/${prefix}_${p}_color.tga`;
  const tga = await fetchTo(rel, path.join(work, `${prefix}_${p}_color.tga`), { optional: p === 'opacity' });
  if (!tga) { console.log(`  텍스처 ${p}: 없다 (이 인물에는 그 재질이 없다)`); continue; }
  const img = downscale(decodeTGA(fs.readFileSync(tga)), 1024);
  textures[p] = encodePNG(img);
  console.log(`  텍스처 ${p}: ${img.w}×${img.h}${img.hasAlpha ? ' RGBA' : ''} → ${(textures[p].length / 1024).toFixed(0)} KB`);
}

const walkGlb = fbx2glb(walkFbx, path.join(CACHE, 'anims', walk));
const idleGlb = fbx2glb(idleFbx, path.join(CACHE, 'anims', idle));
// 제자리 동작의 앞글자(f_/m_)는 걷기 클립 이름에서 읽는다 — 인물과 같은 쪽이다.
const sex = /^([fm])_/.exec(walk)?.[1];
const extras = [];
for (const x of sex ? EXTRAS.filter((e) => !e.only || e.only === sex) : []) {
  const file = `${sex}_${x.anim}`;
  const folder = x.travel ? 'all_animations_max_motextr_xy' : 'all_animations_max_motextr_static';
  const fbx = await fetchTo(`Animations/${folder}/${file}.max.fbx`, path.join(CACHE, 'anims', `${file}.max.fbx`));
  extras.push({ ...x, file, glb: fbx2glb(fbx, path.join(CACHE, 'anims', file)) });
}
// **몸 하나 + 동작들로 쓴다.** 접붙인 온전한 GLB 는 캐시에 두고, 거기서 몸
// (body.glb, 한 번)과 동작(clips/<id>.glb, 뼈 움직임만)을 떼어 낸다. 예전에는
// 동작마다 몸을 통째로 담아 사람 하나가 46MB 였다 (그중 동작은 6.5MB).
// clips/ 는 비우고 쓴다 — 옮겨 붙인 클립(retarget)도 함께 지워지므로 다시 옮겨야 한다.
const full = path.join(work, 'full');
fs.rmSync(path.join(dir, 'clips'), { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'clips'), { recursive: true });
/**
 * **몸 크기가 다르면 접붙이면 안 된다.**
 *
 * Biped 동작은 회전만이 아니라 뼈마다 **자리(translation)** 도 싣는다. 그래서
 * 어른 동작을 어린이 몸에 그냥 접붙이면 뼈 길이가 어른 것으로 덮여, 아이가
 * 어른 크기로 늘어난다 — 재 보니 키 1.433m 가 1.740m 가 됐다 (+21.4%).
 * 화면에서는 그냥 걷는 사람이라 아무도 못 알아챈다.
 *
 * **뼈 길이 비**로 가른다 (쉬는 자세의 부모-자식 거리, 가운데 값):
 *
 *   어른   1.000        (동작 리그가 곧 그 몸이다)
 *   어린이 0.79 언저리
 *
 * 처음에는 엉덩이 높이 비로 갈랐는데, 의자에 앉은 동작에서 어긋났다 —
 * 그 파일은 **쉬는 자세부터 앉아 있어서** 엉덩이가 66% 에 있고, 그것을
 * 크기로 읽으면 1.51배가 된다. 그 비로 옮겨 붙이니 사람이 공중에 앉았다
 * (발끝 32cm). 뼈 길이는 자세로 안 변한다.
 *
 * 2% 를 넘으면 **옮겨 붙인다**(retarget) — 뼈 길이는 대상 몸의 것을 지키고,
 * 몸 전체의 이동만 엉덩이 높이 비로 줄인다. 남자아이 걸음이 1.018m/s 에서
 * 0.80m/s 가 됐고, 키는 0.1% 만 달라졌다.
 */
const RETARGET_SIZE_TOLERANCE = 0.02;

let bodyDoc = null;
let farFacts = null;
const retargeted = new Map();

for (const [id, clipGlb] of [['walk-forward', walkGlb], ['idle', idleGlb], ...extras.map((x) => [x.id, x.glb])]) {
  const fullPath = path.join(full, `${id}.glb`);
  const r = await graft(bodyGlb, clipGlb, textures, fullPath);
  const doc = parseGLB(fs.readFileSync(fullPath));
  if (!bodyDoc) {
    bodyDoc = doc;
    const b = encodeGLB(bodyOnly(doc));
    fs.writeFileSync(path.join(dir, 'body.glb'), b);
    console.log(`  body.glb: 텍스처 ${r.textured} · ${Math.round(b.byteLength / 1024)} KB`);

    // **먼 사람용 몸** — 줄인 살에 색을 구워 넣고 텍스처를 뺀다.
    //
    // 도시 스케일 화면은 이 몸만 있으면 된다. 지금까지는 4MB 짜리 몸을 받아
    // 브라우저에서 130ms 를 들여 매번 줄이고 색을 찍었다 — 그 일을 여기서
    // 한 번 한다.
    // 굽는 길은 한 군데다 — scripts/build-far.mjs 가 그 자리다.
    const baked = bakeFarLevels(b);
    for (const { glb, facts } of baked) {
      fs.writeFileSync(path.join(dir, facts.file), glb);
      console.log(`  ${facts.file}: 정점 ${facts.from.vertices}→${facts.vertices}`
        + ` · 삼각형 ${facts.from.triangles}→${facts.triangles} · 텍스처 0`
        + ` · ${Math.round(glb.byteLength / 1024)} KB (몸의 ${(glb.byteLength / b.byteLength * 100).toFixed(1)}%)`);
    }
    farFacts = baked.map((x) => x.facts);
  }

  // 접붙인 것을 쓸지, 옮겨 붙일지 — **뼈 길이**가 정한다.
  const srcDoc = parseGLB(fs.readFileSync(clipGlb));
  const size = restBoneScale(srcDoc, bodyDoc, { sourceSkeleton: 'biped', targetSkeleton: 'biped' });
  // 크기가 다르거나, 그 동작이 **쉬는 자세부터 다른** 파일이면 옮겨 붙인다.
  const always = EXTRAS.find((x) => x.id === id)?.retarget === true;
  const takeover = always || (size.median != null && Math.abs(size.median - 1) > RETARGET_SIZE_TOLERANCE);
  const moved = takeover ? retargetClip(srcDoc, bodyDoc, { targetSkeleton: 'biped' }) : null;
  if (takeover) retargeted.set(id, moved.report.scale);
  const anim = takeover ? animationOf(bodyDoc, moved, id) : extractAnimation(doc);

  const { doc: motion, missing } = motionOnly(bodyDoc, anim);
  if (missing.length) throw new Error(`${id}: 몸에 없는 뼈 ${missing.slice(0, 4).join(', ')}`);
  const m = encodeGLB(motion);
  fs.writeFileSync(path.join(dir, 'clips', `${id}.glb`), m);
  console.log(`  ${id}.glb: ${takeover ? `옮겨 붙임${always ? '(쉬는 자세가 다르다)' : ''} (뼈 길이 비 ${size.median.toFixed(3)} · 짝 ${moved.report.pairs})` : `트랙 ${r.kept} · 건너뜀 ${r.skipped}`} · 동작만 ${Math.round(m.byteLength / 1024)} KB (몸째였으면 ${r.kb} KB)`);
}
if (retargeted.size) {
  console.log(`  ${retargeted.size}개를 옮겨 붙였다 — 동작 리그와 이 몸의 뼈 길이가 다르다`);
}

// ── 5. 사람이 적는 것만 적고, 나머지는 잰다 ──
const name = { ko: preset.ko || avatarName, en: preset.en || avatarName };
const source = (anim, id) => ({
  tool: 'microsoft/Microsoft-Rocketbox',
  avatar: `Assets/Avatars/${avatar}/Export/${avatarName}.fbx`,
  animation: anim,
  convertedBy: 'FBX2glTF 0.9.7 + peoplemaker/import-rocketbox',
  // 옮겨 붙인 클립은 그 사실이 남아야 한다 — 라이선스는 안 바뀌지만,
  // 어느 몸의 동작을 어떤 비로 줄였는지는 나중에 아무도 못 알아낸다.
  ...(retargeted.has(id)
    ? { retargetedBy: `peoplemaker/retarget (biped → biped, 크기 비 ${retargeted.get(id)})` }
    : {}),
});
const sources = {
  packId,
  version: '0.1.0',
  skeleton: 'biped',
  // **이 팩의 사람이 누구인가** — PRESETS 에 적힌 것을 그대로 옮긴다.
  // 안 적힌 인물을 인자로 받아 들여올 때는 없는 채로 나가고, 그러면 배역이
  // 그 팩을 안 쓴다 (짐작해서 '어른' 을 넣지 않는다).
  ...(preset.person ? { person: preset.person } : {}),
  // **표기 의무.** MIT 는 저작권 고지를 그대로 포함하라고 한다 — 고지문은
  // licenses/ 에 원문 그대로 두고 여기서는 가리키기만 한다.
  origins: [{"tool": "microsoft/Microsoft-Rocketbox", "license": "MIT", "ko": "Microsoft Rocketbox", "en": "Microsoft Rocketbox", "url": "https://github.com/microsoft/Microsoft-Rocketbox", "noticeFile": "licenses/microsoft-rocketbox.LICENSE.md", "noticeUrl": "https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/LICENSE.md", "checked": "2026-09-13"}],
  // 먼 사람용 몸 — 무엇을 어떻게 줄였는지가 팩에 남아야 한다.
  ...(farFacts ? { bodyFar: farFacts } : {}),
  note: `Microsoft Rocketbox 의 ${avatarName} (MIT, Copyright (c) Microsoft Corporation). 몸과 동작이 원래 다른 파일이라 scripts/import-rocketbox.mjs 가 접붙였다 — 동작은 뼈 이름으로 맞췄고, 텍스처는 2048 TGA 를 1024 PNG 로 줄였다. 한 팩에 한 사람이다: 두 사람을 한 팩에 넣으면 속도에 맞춰 클립을 고르다 걷는 도중 사람이 바뀐다.`,
  clips: [
    { id: 'walk-forward', name: { ko: `앞으로 걷기 (${name.ko})`, en: `Walk forward (${name.en})` }, license: 'MIT',
      source: source(`Assets/Animations/all_animations_max_motextr_xy/${walk}.max.fbx`, 'walk-forward'), tags: ['walk', ...(preset.tags || [])] },
    { id: 'idle', name: { ko: `서 있기 (${name.ko})`, en: `Idle (${name.en})` }, license: 'MIT',
      source: source(`Assets/Animations/all_animations_max_motextr_static/${idle}.max.fbx`, 'idle'), tags: ['idle', ...(preset.tags || [])] },
    ...extras.map((x) => ({
      id: x.id, name: { ko: `${x.ko} (${name.ko})`, en: `${x.en} (${name.en})` }, license: 'MIT',
      source: source(`Assets/Animations/all_animations_max_motextr_${x.travel ? 'xy' : 'static'}/${x.file}.max.fbx`, x.id), tags: [...x.tags, ...(preset.tags || [])],
      // 무엇을 들고 있는지는 **사람이 적는다** — 살을 봐서 알 수 없다.
      ...(x.holds ? { holds: x.holds } : {}),
    })),
  ],
};
fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-pack.mjs'), packId], { stdio: 'inherit' });
process.exit(b.status ?? 1);
