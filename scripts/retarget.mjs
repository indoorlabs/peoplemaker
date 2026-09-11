// 동작 하나를 다른 팩의 몸으로 옮겨 그 팩의 클립으로 넣는다.
//
//   node scripts/retarget.mjs <원본 GLB> <대상 팩> <클립 id> [--ko 이름] [--en name]
//                             [--license MIT --tool 출처]   ← 원본이 팩 밖에 있을 때
//
// 예: 여자 01 에게 없는 전화 통화를 남자 01 에게서 옮긴다.
//   node scripts/retarget.mjs packs/rocketbox-m01/clips/phone-call.glb rocketbox-f01 phone-call \
//        --ko "전화 통화 (여자 01)" --en "Phone call (woman 01)"
//
// 원본이 팩 안의 클립이면 라이선스·출처를 그 팩의 sources.json 에서 그대로
// 가져온다 — 옮겼다고 라이선스가 바뀌지는 않는다.
//
// 대상 팩의 sources.json 에 클립을 더하고 build-pack 을 돌린다. 재는 값(길이·
// 루트 모션·속도·디딤)은 여기서 적지 않는다 — 옮긴 결과를 build-pack 이 잰다.
// (import-rocketbox 를 다시 돌리면 sources.json 이 새로 써져 옮긴 클립이
// 빠진다. 그때는 이 스크립트를 다시 돌린다.)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseGLB } from '../src/lib/gltf.mjs';
import { retargetClip, withAnimation, encodeGLB } from '../src/lib/retarget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
  else pos.push(argv[i]);
}
const [srcArg, targetPack, clipId] = pos;
if (!srcArg || !targetPack || !clipId) {
  console.error('쓰임: node scripts/retarget.mjs <원본 GLB> <대상 팩> <클립 id> [--ko 이름] [--en name] [--license MIT --tool 출처]');
  process.exit(2);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(clipId)) { console.error(`클립 id '${clipId}' — 소문자·숫자·- 만`); process.exit(2); }

const srcPath = path.resolve(srcArg);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// 원본의 출처 — 팩 안의 클립이면 그 팩이 적어 둔 것을 쓴다.
let srcDecl = null;
let srcRef = path.basename(srcPath);
const m = /[\\/]packs[\\/]([^\\/]+)[\\/]clips[\\/]([^\\/]+)\.glb$/.exec(srcPath);
if (m) {
  const sp = path.join(ROOT, 'packs', m[1], 'sources.json');
  if (fs.existsSync(sp)) srcDecl = readJson(sp).clips.find((c) => c.id === m[2]) || null;
  srcRef = `${m[1]}/${m[2]}`;
}
const license = flags.license || srcDecl?.license;
const tool = flags.tool || srcDecl?.source?.tool;
if (!license || !tool) {
  console.error('원본의 라이선스·출처를 모른다 — 팩 밖의 파일이면 --license 와 --tool 을 줘야 한다');
  process.exit(2);
}

// 대상 몸 — 팩의 클립 하나를 몸으로 쓴다 (서 있기가 있으면 그것).
const tdir = path.join(ROOT, 'packs', targetPack);
const sourcesPath = path.join(tdir, 'sources.json');
if (!fs.existsSync(sourcesPath)) { console.error(`${targetPack}: sources.json 이 없다`); process.exit(2); }
const sources = readJson(sourcesPath);
const bodyId = sources.clips.some((c) => c.id === 'idle') ? 'idle' : sources.clips[0]?.id;
const bodyPath = path.join(tdir, 'clips', `${bodyId}.glb`);
if (!bodyId || !fs.existsSync(bodyPath)) { console.error(`${targetPack}: 몸으로 쓸 클립 GLB 가 없다`); process.exit(2); }

const src = parseGLB(new Uint8Array(fs.readFileSync(srcPath)));
const body = parseGLB(new Uint8Array(fs.readFileSync(bodyPath)));
const result = retargetClip(src, body, { targetSkeleton: sources.skeleton });
const r = result.report;
console.log(`${srcRef} → ${targetPack}/${clipId}`);
console.log(`  ${r.sourceSkeleton} → ${r.targetSkeleton} (${r.mode === 'same-names' ? '같은 이름끼리' : '공통 뼈'}) · 짝 ${r.pairs} · 엉덩이 높이 비 ${r.hipScale} · 앞 ${r.facingDeg}° · ${r.durationS.toFixed(2)}s · ${r.frames} 프레임`);

const out = path.join(tdir, 'clips', `${clipId}.glb`);
fs.writeFileSync(out, encodeGLB(withAnimation(body, result, clipId)));
console.log(`  ${path.relative(ROOT, out)} · ${Math.round(fs.statSync(out).size / 1024)} KB`);

const baseName = srcDecl?.name || { ko: clipId, en: clipId };
const decl = {
  id: clipId,
  name: { ko: flags.ko || `${baseName.ko} · 옮김`, en: flags.en || `${baseName.en} (retargeted)` },
  license,
  source: {
    ...(srcDecl?.source || { tool }),
    retargetedFrom: srcRef,
    retargetedBy: `peoplemaker/retarget (${r.sourceSkeleton} → ${r.targetSkeleton}, 엉덩이 높이 비 ${r.hipScale})`,
  },
  tags: [...new Set([...(srcDecl?.tags || []), 'retargeted'])],
};
sources.clips = [...sources.clips.filter((c) => c.id !== clipId), decl];
fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + '\n');

const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-pack.mjs'), targetPack], { stdio: 'inherit' });
process.exit(b.status ?? 1);
