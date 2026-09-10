// 기준 팩을 파일로 굽는다.
//
//   node scripts/make-fixture-pack.mjs
//
// 만드는 일은 src/lib/fixtureRig.mjs 가 한다 (브라우저에서도 돌아야 해서
// 순수 층에 있다). 여기서는 그 결과를 packs/ 에 쓰고, 사람이 적는 것
// (이름·라이선스·출처)만 sources.json 으로 남긴다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES, buildGLB } from '../src/lib/fixtureRig.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'packs', 'ref-synthetic');

// **이 파일은 이제 아무것도 내보내지 않는다.**
//
// 만드는 함수가 순수 층으로 갔으므로, 게이트도 데모도 저쪽을 가져다 쓴다.
// 그래서 "import 만으로 packs/ 를 덮어쓰는" 걱정이 사라졌다 — 여기 남은 것은
// 파일을 쓰는 일뿐이고, 그 일은 직접 돌릴 때만 일어난다.

fs.mkdirSync(path.join(OUT, 'clips'), { recursive: true });
for (const spec of FIXTURES) {
  const glb = buildGLB(spec);
  fs.writeFileSync(path.join(OUT, 'clips', `${spec.id}.glb`), glb);
  console.log(`  ${spec.id}.glb  ${(glb.byteLength / 1024).toFixed(1)}KB  (만든 속도 ${spec.speedMps} m/s)`);
}

// 사람이 적는 것만 — 잴 수 있는 값은 여기 없다 (build-pack 이 잰다).
const sources = {
  packId: 'ref-synthetic',
  version: '0.1.0',
  skeleton: 'mixamo',
  note: '사람의 모션 캡처가 아니다. 함수가 만든 기준 클립이고, 파이프라인과 계약을 검사하려고 둔다.',
  clips: FIXTURES.map((f) => ({
    id: f.id,
    name: {
      ko: { 'walk-forward': '앞으로 걷기', 'walk-inplace': '제자리 걷기', 'walk-fast': '빠르게 걷기', idle: '가만히 서 있기', 'sit-down': '앉기' }[f.id],
      en: { 'walk-forward': 'Walk forward', 'walk-inplace': 'Walk in place', 'walk-fast': 'Walk fast', idle: 'Idle', 'sit-down': 'Sit down' }[f.id],
    },
    license: 'CC0-1.0',
    source: { tool: 'peoplemaker/make-fixture-pack', synthetic: true },
    tags: [f.kind],
  })),
};
fs.writeFileSync(path.join(OUT, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
console.log(`\n기준 팩 ${FIXTURES.length}개 · ${OUT}`);
console.log('다음: node scripts/build-pack.mjs ref-synthetic');

