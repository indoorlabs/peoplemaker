// ATTRIBUTIONS.md 를 만든다 — **손으로 적지 않는다.**
//
//   node scripts/build-attributions.mjs [나갈 파일]     (기본 ATTRIBUTIONS.md)
//
// 자산은 늘고 사람은 잊는다. 지금은 팩 열둘이 전부 MIT 하나지만, 노인이나
// 계단을 다른 출처에서 받는 순간 두 가지가 되고 손으로 적은 목록은 그때 이미
// 틀려 있다. 그래서 카탈로그에서 만든다 — 클립마다 적힌 라이선스와 출처가
// 그대로 올라온다 (계획 §5 의 위험 1).
//
// 고지문은 **옮겨 적지 않고 licenses/ 의 원문 파일을 그대로 넣는다.**

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attributionsMarkdown, attributionsFor, attributionTally } from '../src/lib/attribution.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'ATTRIBUTIONS.md'));

const catalogs = [];
for (const id of fs.readdirSync(path.join(ROOT, 'packs'))) {
  const f = path.join(ROOT, 'packs', id, 'catalog.json');
  if (fs.existsSync(f)) catalogs.push(JSON.parse(fs.readFileSync(f, 'utf8')));
}
catalogs.sort((a, b) => (a.packId < b.packId ? -1 : 1));

// 고지문을 읽어 주는 것만 여기서 한다 — 순수 층은 파일을 안 읽는다.
const missing = [];
const readNotice = (rel) => {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) { missing.push(rel); return null; }
  return fs.readFileSync(f, 'utf8');
};

const md = attributionsMarkdown(catalogs, { readNotice });
if (missing.length) {
  console.error(`✗ 고지문 파일이 없다: ${missing.join(' · ')} — 원문을 받아 licenses/ 에 두어야 한다`);
  process.exit(1);
}
fs.writeFileSync(out, md);

const items = attributionsFor(catalogs);
const tally = attributionTally(catalogs);
console.log(
  `${path.relative(ROOT, out)} · 팩 ${catalogs.length} · 클립 ${tally.total}`
  + ` · 표기 필요 ${tally.needing} · 출처 ${items.length}가지`
  + ` (${items.map((i) => `${i.origin?.ko || i.tool} ${i.license}`).join(' · ')})`,
);
