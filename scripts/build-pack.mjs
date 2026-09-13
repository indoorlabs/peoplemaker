// 팩을 굽는다 — 사람이 적은 것 + 클립에서 잰 것 → catalog.json
//
//   node scripts/build-pack.mjs <packId>
//
// 사람이 적는 것은 sources.json 이고, 잴 수 있는 값(길이·이동·속도·접촉)은
// 여기서 GLB 를 열어 잰다. 손으로 적으면 파일과 어긋나고, 어긋나도 아무도
// 모른다 — 그래서 sources.json 에 그 값을 적으면 **에러로 막는다**.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGLB } from '../src/lib/gltf.mjs';
import { attachAnimation } from '../src/lib/gltfWrite.mjs';
import { deriveClip, applyReach, buildCatalog, deriveBodyDims } from '../src/lib/packBuild.mjs';
import { validateCatalog, validateSplitFiles } from '../src/lib/motionPack.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packId = process.argv[2];
if (!packId) {
  console.error('쓰임: node scripts/build-pack.mjs <packId>');
  process.exit(2);
}

const dir = path.join(ROOT, 'packs', packId);
const srcFile = path.join(dir, 'sources.json');
if (!fs.existsSync(srcFile)) {
  console.error(`${srcFile} 가 없다 — 사람이 적는 것(이름·라이선스·출처)이 먼저다`);
  process.exit(2);
}
const sources = JSON.parse(fs.readFileSync(srcFile, 'utf8'));

const clips = [];
const docs = [];
let measured = 0;
// 몸이 따로 있으면 나뉜 팩이다 — 클립은 뼈 움직임만 든다 (재는 데는 그것으로 족하다).
const bodyFile = path.join(dir, 'body.glb');
const split = fs.existsSync(bodyFile);
for (const decl of sources.clips || []) {
  const file = path.join(dir, 'clips', `${decl.id}.glb`);
  if (!fs.existsSync(file)) {
    console.error(`  ✗ ${decl.id}: clips/${decl.id}.glb 가 없다`);
    process.exit(1);
  }
  let doc;
  try { doc = parseGLB(fs.readFileSync(file)); }
  catch (e) { console.error(`  ✗ ${decl.id}: GLB 를 못 읽었다 — ${e.message}`); process.exit(1); }

  let out;
  try { out = deriveClip(doc, decl, { skeleton: sources.skeleton }); }
  catch (e) { console.error(`  ✗ ${e.message}`); process.exit(1); }

  clips.push(out.clip);
  docs.push({ id: decl.id, doc });
  measured++;
  const c = out.clip;
  console.log(
    `  ${c.id.padEnd(14)} ${c.durationS.toFixed(2)}s  ${c.rootMotion.padEnd(8)}`
    + `${c.speedMps ? `${c.speedMps} m/s` : '        '}  접촉 ${c.contacts.length}회  `
    + `${c.seat ? `· 앉음 엉덩이 ${c.seat.hipHeightM}m (쉬는 자세의 ${c.seat.hipRatio})·바닥 ${c.seat.groundOffsetM}m ` : ''}`
    + `· ${out.notes.join(' · ')}`,
  );
}

const catalog = buildCatalog({
  packId: sources.packId, version: sources.version, skeleton: sources.skeleton, clips,
  // 사람이 적은 것 — 이 팩의 사람이 누구인가. 없으면 없는 대로 간다
  // (검사용 합성 팩은 사람이 아니다).
  person: sources.person,
  body: split ? 'body.glb' : undefined,
  // 먼 몸은 굽는 쪽(import-rocketbox)이 만들어 sources.json 에 적어 둔다.
  // 먼 몸은 굽는 쪽(build-far)이 만들어 sources.json 에 단계 목록으로 적어 둔다.
  bodyFar: Array.isArray(sources.bodyFar)
    ? sources.bodyFar.filter((l) => fs.existsSync(path.join(dir, l.file)))
    : undefined,
  // **이 몸을 잰 치수** — 공간 쪽이 복도 폭·창 높이를 검토할 때 쓰는 값이다.
  bodyDims: split
    ? deriveBodyDims(
      parseGLB(fs.readFileSync(bodyFile)),
      docs.filter((d) => ['idle', 'walk-forward'].includes(d.id))
        .map((d) => ({ id: d.id, doc: attachAnimation(parseGLB(fs.readFileSync(bodyFile)), d.doc) })),
      { skeleton: sources.skeleton },
    )
    : undefined,
});
if (sources.note) catalog.note = sources.note;

// ── 두 번째 판: 손이 닿는 순간 ──
//
// 팩의 **앞**을 알아야 손이 앞으로 나갔는지 알 수 있는데, 앞은 이동 클립을
// 다 재고 나서야 나온다 (catalog.forwardRad). 그래서 여기서 한 번 더 돈다.
//
// **무엇에 닿는지는 안 정한다.** 손이 멀리 나간 것만으로는 문을 잡았는지
// 모른다 — 그 동작이 무엇인지는 사람이 sources.json 에 적고(tags 의 'reach'),
// 언제 어디까지 뻗는지만 잰다.
if (typeof catalog.forwardRad === 'number') {
  for (const decl of sources.clips) {
    if (!(decl.tags || []).includes('reach')) continue;
    const clip = catalog.clips.find((c) => c.id === decl.id);
    const doc = docs.find((d) => d.id === decl.id)?.doc;
    if (!clip || !doc) continue;
    applyReach(clip, doc, decl, { skeleton: sources.skeleton, forwardRad: catalog.forwardRad });
    const reach = clip.reach;
    if (!reach) { console.log(`  ${decl.id.padEnd(14)} 손이 뻗는 자리를 못 찾았다`); continue; }
    console.log(`  ${decl.id.padEnd(14)} 손 ${reach.part} 가 ${reach.atS}s 에 닿아 ${reach.releaseS}s 에 뗀다`
      + ` · 앞으로 ${reach.forwardM}m · 높이 ${reach.heightM}m ← 손잡이를 둘 자리`);
  }
}

// 굽자마자 계약으로 검사한다. 내보내기 전에 막는 것이 요점이다 —
// 게이트는 나중에 돌지만, 여기서 막으면 잘못된 팩이 애초에 안 생긴다.
const files = fs.readdirSync(path.join(dir, 'clips')).filter((f) => f.endsWith('.glb'));
const errs = [
  ...validateCatalog(catalog, { clipFiles: files, packFiles: fs.readdirSync(dir) }),
  ...(split ? validateSplitFiles(parseGLB(fs.readFileSync(bodyFile)), docs) : []),
];
if (errs.length) {
  console.error(`\n계약 위반 ${errs.length}건 — 카탈로그를 안 쓴다:`);
  for (const e of errs) console.error(`  · ${e.id} — ${e.msg}`);
  process.exit(1);
}

fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`\n${packId}: 클립 ${measured}개를 재서 catalog.json 에 썼다`);
