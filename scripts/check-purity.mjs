// check:purity — **순두부 층이 정말 순수한가.**
//
// 규약 1 (agents.md): `src/lib/*.mjs` 는 three.js·DOM·node 전용 모듈을 import
// 하지 않는다. 값과 규칙만 있어서, 게이트가 브라우저 없이 검사하고 파이썬
// 파이프라인이 three 를 안 끌고 계약을 읽는다.
//
// 그런데 **그 규약을 코드가 안 지키고 있었다** — 사람이 지키는 중이었다.
// 한 줄만 들어가면 소비처(spacemaker)의 서버 빌드가 깨지고, 그때서야 안다.
//
// 여기서 보는 것 넷:
//   1. 순수 층이 남을 안 끌어오는가 (three · node: · DOM 전역)
//   2. 순수 층의 모든 파일을 index 가 다시 내보내는가 — 안 하면 없는 것과 같다
//   3. 웹 어댑터가 three 를 **import 하지 않는가** (주입받는 것이 규약이다)
//   4. 순수 층이 실제로 **혼자 돌아가는가** — 판을 갈아 끼워 확인한다

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';

const LIB = path.join(ROOT, 'src', 'lib');
const WEB = path.join(ROOT, 'src', 'web');

/** import 하는 곳들 — 문자열 뜯기로 충분하다 (이 저장소는 한 줄 import 만 쓴다). */
function importsOf(code) {
  const out = [];
  const re = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code))) out.push(m[1]);
  const dyn = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dyn.exec(code))) out.push(m[1]);
  return out;
}

/** DOM·브라우저 전역을 쓰는가 — 이름만 훑는다 (주석은 뺀다). */
function domUses(code) {
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '');
  const bad = [];
  for (const g of ['document', 'window', 'navigator', 'OffscreenCanvas', 'HTMLCanvasElement', 'localStorage']) {
    if (new RegExp(`(^|[^\\w.'"\`])${g}\\s*[.[(]`).test(bare)) bad.push(g);
  }
  return bad;
}

runGate('check-purity', async (g) => {
  let n = 0;
  const libFiles = fs.readdirSync(LIB).filter((f) => f.endsWith('.mjs'));

  // ── 1. 순수 층이 남을 안 끌어오는가 ──
  for (const f of libFiles) {
    const code = fs.readFileSync(path.join(LIB, f), 'utf8');
    n++;
    const outside = importsOf(code).filter((s) => !s.startsWith('./') && !s.startsWith('../'));
    if (outside.length) {
      g.fail(`lib/${f}/import`,
        `순수 층이 밖을 끌어온다: ${outside.join(', ')} — 브라우저·파이썬 쪽에서 그대로 못 쓴다`);
    }
    n++;
    // ../web 이나 ../../scripts 로 거슬러 올라가는 것도 밖이다.
    const up = importsOf(code).filter((s) => s.startsWith('../'));
    if (up.length) g.fail(`lib/${f}/up`, `순수 층이 위로 올라가 가져온다: ${up.join(', ')}`);
    n++;
    const dom = domUses(code);
    if (dom.length) g.fail(`lib/${f}/dom`, `순수 층이 브라우저 전역을 쓴다: ${dom.join(', ')}`);
  }

  // ── 2. index 가 다 내보내는가 ──
  {
    const index = fs.readFileSync(path.join(LIB, 'index.mjs'), 'utf8');
    const listed = new Set(importsOf(index).map((s) => s.replace('./', '')));
    for (const f of libFiles) {
      if (f === 'index.mjs') continue;
      n++;
      if (!listed.has(f)) {
        g.fail(`index/${f}`, 'index 가 다시 안 내보낸다 — 순수 층 문(peoplemaker/lib)에서 안 보인다');
      }
    }
  }

  // ── 3. 웹 어댑터가 three 를 import 하지 않는가 ──
  //
  // three 는 **주입받는다.** 어댑터가 제 판을 import 하면 소비처의 three 와
  // 두 벌이 떠서, instanceof 검사가 조용히 실패한다.
  for (const f of fs.readdirSync(WEB).filter((x) => x.endsWith('.mjs'))) {
    n++;
    const code = fs.readFileSync(path.join(WEB, f), 'utf8');
    const three = importsOf(code).filter((s) => s === 'three' || s.startsWith('three/'));
    if (three.length) g.fail(`web/${f}/three`, `three 를 import 한다: ${three.join(', ')} — 주입받아야 한다`);
  }

  // ── 4. 정말 혼자 도는가 ──
  //
  // 읽어서 판단하는 것으로는 모자란다. **three 를 못 쓰게 막아 놓고** 순수
  // 층을 통째로 불러 본다 — 어딘가에서 몰래 쓰고 있으면 여기서 터진다.
  {
    n++;
    const guard = `
      import { Module } from 'node:module';
      const real = Module._load;
      Module._load = (req, ...rest) => {
        if (req === 'three' || String(req).startsWith('three/')) throw new Error('순수 층이 three 를 불렀다');
        return real(req, ...rest);
      };
      globalThis.document = undefined;
      globalThis.window = undefined;
      const lib = await import('file://${LIB.replace(/\\/g, '/')}/index.mjs');
      if (!lib.validateCatalog || !lib.planActivity) throw new Error('순수 층 문이 비었다');
      console.log('ok ' + Object.keys(lib).length);
    `;
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', guard], { encoding: 'utf8' });
    if (r.status !== 0) {
      g.fail('lib/standalone', `three 없이 순수 층을 못 불러온다 — ${(r.stderr || '').split('\n').find((l) => l.includes('Error')) || r.status}`);
    } else {
      console.log(`  [순수] three 를 막고 불러도 문이 열린다 (${(r.stdout || '').trim()})`);
    }
  }

  // ── scripts 는 순수하지 않아도 된다 — 그 사실을 적어 둔다 ──
  //
  // scripts/png.mjs 는 node:zlib 을 쓴다. 그것이 순수 층에 있으면 안 되고,
  // scripts 에 있으면 된다. 규약이 어디까지인지가 수로 남아야 한다.
  {
    n++;
    const png = fs.readFileSync(path.join(ROOT, 'scripts', 'png.mjs'), 'utf8');
    if (!importsOf(png).some((s) => s.startsWith('node:'))) {
      g.fail('scripts/png', 'png.mjs 가 node 모듈을 안 쓴다 — 그러면 순수 층에 있어야 하는 것 아닌가');
    }
    console.log(`  [순수] lib ${libFiles.length}개 파일 · 밖을 끌어오는 것 0 · scripts 는 node 를 써도 된다`);
  }

  return n;
});
