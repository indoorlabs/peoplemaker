// npm run check — 이 디렉터리의 check-*.mjs 를 전부 발견해서 돌린다.
//
// (urbanspace 에서 가져왔다.) 레지스트리가 곧 디렉터리다. 등록 단계가 있으면 사람들이 등록을 안 한다
// (spacemaker 에 아무도 돌리지 않는 벤치가 40개 있었다). 새 게이트를 쓰면
// 그 순간부터 검사된다.
//
//   npm run check              전부
//   npm run check -- --update  전부 기준선 재잠금

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const gates = fs
  .readdirSync(here)
  .filter((f) => /^check-.*\.mjs$/.test(f))
  .sort();

if (!gates.length) {
  console.error('게이트를 하나도 찾지 못했다 — scripts/check-*.mjs');
  process.exit(2);
}

let failed = 0;
let skipped = 0;
const t0 = Date.now();

for (const g of gates) {
  const r = spawnSync(process.execPath, [path.join(here, g), ...args], { stdio: 'inherit' });
  // 3 은 **건너뜀** — 볼 것이 없어서 못 본 것이다 (팩의 먼 층만 받은 새 클론).
  // 실패도 통과도 아니라, 몇 개가 그랬는지를 수로 남긴다.
  if (r.status === 3) skipped++;
  else if (r.status !== 0) failed++;
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
const tail = skipped ? ` · ${skipped}개는 건너뛰었다 (팩을 받아야 돈다)` : '';
if (failed) {
  console.error(`\n게이트 ${gates.length}개 중 ${failed}개 실패${tail} (${secs}s)`);
  process.exit(1);
}
console.log(`\n게이트 ${gates.length}개 중 ${gates.length - skipped}개 통과${tail} (${secs}s)`);
