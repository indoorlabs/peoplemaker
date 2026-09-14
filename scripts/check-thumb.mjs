// check:thumb — 섬네일이 **그 클립의 자세를 정말 보여 주는가.**
//
// 그림은 틀려도 안 틀린 것처럼 보인다. 앉기 섬네일에 선 사람이 그려져 있어도
// "사람 모양" 이라 넘어가고, 클립 목록은 멀쩡해 보인다. 그래서 그림을
// 눈으로 보는 대신 **수로 본다** — 앉으면 머리가 내려가고, 뛰면 폭이 넓다.
//
// 수로 묻는 것:
//   1. 격자가 점을 제대로 찍는가 (상자 밖은 버리는가, 위아래가 안 뒤집혔는가)
//   2. 이어 붙이기가 칸을 안 잃고 안 만드는가
//   3. **자세가 수로 갈리는가** — 서기 · 앉기 · 주저앉기 · 뛰기
//   4. 팩마다 같은 자로 그리는가 (클립마다 상자를 다시 잡으면 비교가 안 된다)
//   5. SVG 가 말이 되는가 · 파일이 계약에 적힌 자리에 있는가

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT, fullPacks, HOW_TO_GET_PACKS } from './gate-lib.mjs';
import {
  silhouetteGrid, runsOf, filledCells, gridBounds, thumbSvg, thumbBox,
  THUMB_COLS as C, THUMB_ROWS as R,
} from '../src/lib/thumbnail.mjs';
import { parseGLB } from '../src/lib/gltf.mjs';
import { attachAnimation } from '../src/lib/gltfWrite.mjs';
import { bakeClip } from '../src/lib/poseBake.mjs';
import { skinnedMeshOf, skinPoints } from '../src/lib/bodyMesh.mjs';

// **있는 팩 중에서 고른다.** 이름을 박아 두면 새로 받은 쪽에서 그 팩이
// 없어 터진다 (저장소에는 먼 층만 들어 있다).
const pickPack = () => {
  const have = fullPacks();
  return have.includes('rocketbox-f01') ? 'rocketbox-f01' : have[0];
};

runGate('check-thumb', (g) => {
  let n = 0;
  const PACK = pickPack();

  // 저장소에는 팩의 **먼 층만** 들어 있다 — 새로 받은 쪽에는 이 게이트가 볼
  // 것이 없다. 터지지 말고 **건너뛰되 수로 말한다** (gate-lib 의 skip).
  if (!fullPacks().length) {
    g.skip(`몸에 살을 붙여 그려 보는 게이트라 몸이 있어야 한다 — ${HOW_TO_GET_PACKS}`);
    return n;
  }

  // ── 1. 격자가 점을 제대로 찍는가 ──
  {
    const box = { x0: -1, x1: 1, y0: 0, y1: 2 };
    n++;
    // 세계에서 **위**에 있는 점은 그림에서 **위**에 찍혀야 한다.
    const hi = gridBounds(silhouetteGrid([0, 1.9, 0], { box }));
    const lo = gridBounds(silhouetteGrid([0, 0.1, 0], { box }));
    if (!(hi.y0 < lo.y0)) g.fail('grid/flip', `위에 있는 점이 y${hi.y0} · 아래가 y${lo.y0} — 위아래가 뒤집혔다`);
    n++;
    const left = gridBounds(silhouetteGrid([-0.9, 1, 0], { box }));
    const right = gridBounds(silhouetteGrid([0.9, 1, 0], { box }));
    if (!(left.x0 < right.x0)) g.fail('grid/mirror', '왼쪽 점이 오른쪽에 찍힌다');
    n++;
    // 상자 밖은 **버린다** — 접어 넣으면 팔이 반대쪽에 나타난다.
    if (filledCells(silhouetteGrid([5, 1, 0, -5, 1, 0, 0, 9, 0], { box })) !== 0) {
      g.fail('grid/clip', '상자 밖 점을 그린다');
    }
    n++;
    if (filledCells(silhouetteGrid([], { box })) !== 0) g.fail('grid/empty', '점이 없는데 칸이 찬다');
    n++;
    if (gridBounds(silhouetteGrid([], { box })) !== null) g.fail('grid/bounds-empty', '빈 격자인데 경계를 낸다');
    n++;
    // **옆에서 보기**는 다른 축을 쓴다 — z 를 안 보면 앞뒤로 뻗은 팔이 안 보인다.
    const front = filledCells(silhouetteGrid([0, 1, 0.9], { box, axis: 'xy' }));
    const side = filledCells(silhouetteGrid([0, 1, 0.9], { box, axis: 'zy' }));
    if (!(front === 1 && side === 1)) g.fail('grid/axis', `앞에서 ${front} · 옆에서 ${side} 칸이다`);
    n++;
    const sideB = gridBounds(silhouetteGrid([0, 1, 0.9], { box, axis: 'zy' }));
    const frontB = gridBounds(silhouetteGrid([0, 1, 0.9], { box, axis: 'xy' }));
    if (sideB.x0 === frontB.x0) g.fail('grid/axis-same', '옆에서 봐도 같은 자리에 찍힌다 — z 를 안 본다');
  }

  // ── 2. 이어 붙이기가 칸을 안 잃고 안 만드는가 ──
  {
    const grid = new Uint8Array(C * R);
    const want = [[0, 0], [0, 1], [0, 2], [0, 5], [3, 7], [3, 8]];
    for (const [y, x] of want) grid[y * C + x] = 1;
    const runs = runsOf(grid);
    n++;
    if (runs.reduce((s, r) => s + r.len, 0) !== want.length) {
      g.fail('runs/count', `칸 ${want.length}개인데 이어 붙이니 ${runs.reduce((s, r) => s + r.len, 0)}개다`);
    }
    n++;
    // 붙어 있는 셋은 한 줄, 떨어진 하나는 따로 — 모두 3개 (0행 2개 + 3행 1개)
    if (runs.length !== 3) g.fail('runs/merge', `이어 붙인 줄이 ${runs.length}개다 (3개여야)`);
    n++;
    if (!runs.every((r) => r.len > 0 && r.x0 >= 0 && r.x0 + r.len <= C)) g.fail('runs/range', '줄이 격자를 벗어난다');
  }

  // ── 3. 자세가 수로 갈리는가 ──
  //
  // **여기가 이 게이트의 요점이다.** 섬네일이 다 똑같이 생기면 아무 쓸모가
  // 없는데, 그림을 눈으로 안 보면 그 사실을 모른다.
  const dir = path.join(ROOT, 'packs', PACK);
  if (!fs.existsSync(path.join(dir, 'catalog.json'))) { g.setupFail(`${PACK} 이 없다`); return n; }
  const cat = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
  const bodyBuf = fs.readFileSync(path.join(dir, 'body.glb'));
  const mesh = skinnedMeshOf(parseGLB(bodyBuf));
  const box = thumbBox(cat.bodyDims.heightM, { widthM: cat.bodyDims.maxWidthM });

  const gridOf = (id) => {
    const f = path.join(dir, 'clips', `${id}.glb`);
    if (!fs.existsSync(f)) return null;
    const baked = bakeClip(attachAnimation(parseGLB(bodyBuf), parseGLB(fs.readFileSync(f))));
    return silhouetteGrid(skinPoints(mesh, baked, Math.floor(baked.frames / 2)), { box });
  };

  const poses = {};
  for (const id of ['idle', 'sit', 'crouch', 'crouch-in', 'run', 'walk-forward']) {
    const grid = gridOf(id);
    if (grid) poses[id] = { grid, b: gridBounds(grid), cells: filledCells(grid) };
  }
  n++;
  // 서기·앉기가 다 있어야 자세를 가를 수 있다. 기준 팩 하나만 받은 쪽에는
  // 앉는 클립이 없다 — 거기까지만 보고 수로 말한다.
  if (!poses.idle || !poses.sit) {
    console.log(`  [섬네일] ${PACK} 에 서기·앉기가 다 없어 자세 가르기는 건너뛴다 — ${HOW_TO_GET_PACKS}`);
    return n;
  }

  // 앉으면 머리가 내려간다 — 그림에서는 위쪽이 빈다 (y0 가 커진다).
  for (const id of ['sit', 'crouch', 'crouch-in']) {
    if (!poses[id]) continue;
    n++;
    if (!(poses[id].b.y0 > poses.idle.b.y0)) {
      g.fail(`pose/${id}/head`, `${id} 의 머리가 y${poses[id].b.y0} · 서기가 y${poses.idle.b.y0} — 안 내려갔다`);
    }
  }
  n++;
  // 앉은 사람은 **아래쪽에 모인다** — 차지하는 세로 길이가 짧다.
  if (!(poses.sit.b.h < poses.idle.b.h)) {
    g.fail('pose/sit/height', `앉기가 ${poses.sit.b.h}칸 · 서기가 ${poses.idle.b.h}칸 — 안 짧아졌다`);
  }
  if (poses.run) {
    n++;
    // 뛰면 팔다리가 벌어져 폭이 넓다.
    if (!(poses.run.b.w > poses.idle.b.w)) {
      g.fail('pose/run/width', `뛰기 폭 ${poses.run.b.w} · 서기 폭 ${poses.idle.b.w} — 안 넓어졌다`);
    }
  }
  n++;
  // **서로 다른 그림인가** — 자세 넷의 칸이 다 같으면 그리나 마나다.
  const sigs = new Set(Object.values(poses).map((p) => `${p.b.y0}|${p.b.h}|${p.b.w}`));
  if (sigs.size < Object.keys(poses).length - 1) {
    g.fail('pose/same', `자세 ${Object.keys(poses).length}개인데 서로 다른 모양이 ${sigs.size}가지다`);
  }
  n++;
  // 사람 모양인가 — 몸이 그림의 절반은 채워야 한다 (상자가 너무 넓으면 콩알이 된다).
  if (!(poses.idle.b.w >= C * 0.4 && poses.idle.b.h >= R * 0.6)) {
    g.fail('pose/fill', `선 사람이 폭 ${poses.idle.b.w}/${C} · 높이 ${poses.idle.b.h}/${R} 밖에 안 된다`);
  }

  console.log(`  [섬네일] 머리 높이(칸): ${Object.entries(poses).map(([k, v]) => `${k} ${v.b.y0}`).join(' · ')}`);
  console.log(`  [섬네일] 폭(칸): ${Object.entries(poses).map(([k, v]) => `${k} ${v.b.w}`).join(' · ')}`);

  // ── 4. 팩마다 같은 자로 그리는가 ──
  {
    n++;
    // 상자는 키에서 나온다 — 키가 다르면 상자도 다르고, 같으면 같아야 한다.
    const a = thumbBox(1.741, { widthM: 0.5 });
    const b = thumbBox(1.741, { widthM: 0.5 });
    if (JSON.stringify(a) !== JSON.stringify(b)) g.fail('box/stable', '같은 몸인데 상자가 달라진다');
    n++;
    const child = thumbBox(1.431, { widthM: 0.5 });
    if (!(child.y1 < a.y1)) g.fail('box/scale', `어린이 상자 위가 ${child.y1} · 어른이 ${a.y1} — 키를 안 따라간다`);
    n++;
    // 가로세로 비가 격자와 맞는가 — 안 맞으면 사람이 납작해진다.
    const ratio = ((a.x1 - a.x0) / (a.y1 - a.y0)) / (C / R);
    if (!(ratio > 0.9 && ratio < 2.5)) g.fail('box/aspect', `상자 비가 격자의 ${ratio.toFixed(2)}배다`);
  }

  // ── 5. SVG 와 파일 ──
  {
    const svg = thumbSvg([poses.idle.grid, poses.sit.grid], { label: 'x' });
    n++;
    if (!/^<svg [^>]*viewBox="0 0 \d+ \d+"/.test(svg)) g.fail('svg/head', 'viewBox 가 없다');
    n++;
    if (!svg.endsWith('</svg>')) g.fail('svg/close', '안 닫힌다');
    n++;
    // 프레임마다 짙기가 달라야 한다 — 다 같으면 잔상이 안 보인다.
    const alphas = [...svg.matchAll(/fill-opacity="([\d.]+)"/g)].map((m) => +m[1]);
    if (new Set(alphas).size < 2) g.fail('svg/fade', `짙기가 ${[...new Set(alphas)].join()} 한 가지다`);
    n++;
    const titled = thumbSvg([poses.idle.grid], { label: '<script>&x' });
    if (/<title><script>/.test(titled) || /&x/.test(titled.replace(/&amp;/g, ''))) {
      g.fail('svg/escape', '글자를 안 걸러서 SVG 가 깨질 수 있다');
    }
    n++;
    // 이어 붙이기가 정말 파일을 줄이는가.
    const cells = filledCells(poses.idle.grid);
    const rects = (svg.match(/M/g) || []).length;
    if (!(rects < cells)) g.fail('svg/merge', `칸 ${cells}개에 사각형 ${rects}개 — 안 줄었다`);

    // 계약에 적힌 자리에 파일이 있는가.
    let withThumb = 0;
    for (const c of cat.clips) {
      if (!c.thumb) continue;
      withThumb++;
      n++;
      if (!fs.existsSync(path.join(dir, c.thumb))) g.fail(`file/${c.id}`, `${c.thumb} 가 없다`);
    }
    n++;
    if (withThumb !== cat.clips.length) {
      g.fail('file/all', `클립 ${cat.clips.length}개 중 ${withThumb}개만 섬네일이 있다`);
    }
    const bytes = cat.clips.reduce((s, c) => (c.thumb ? s + fs.statSync(path.join(dir, c.thumb)).size : s), 0);
    console.log(`  [섬네일] ${PACK}: ${withThumb}개 · ${(bytes / 1024).toFixed(0)}KB (평균 ${Math.round(bytes / withThumb)}바이트)`);
  }

  // ── 6. 대조표가 지금 팩과 맞는가 ──
  //
  // 섬네일 377개를 하나씩 열어 볼 수는 없다 — 한 장에 모은 대조표
  // (demo/clips.html) 가 그래서 있다. 그런데 그 파일은 **굽는 순간 낡기
  // 시작한다**: 클립을 더하고 대조표를 안 다시 만들면 없는 동작이 없는 채로
  // 보인다. 수를 견줘서 그때 말한다.
  {
    const sheet = path.join(ROOT, 'demo', 'clips.html');
    n++;
    if (!fs.existsSync(sheet)) {
      g.fail('sheet/none', 'demo/clips.html 이 없다 — node scripts/build-sheet.mjs');
    } else {
      const html = fs.readFileSync(sheet, 'utf8');
      let packs = 0;
      let clips = 0;
      for (const id of fs.readdirSync(path.join(ROOT, 'packs'))) {
        const f = path.join(ROOT, 'packs', id, 'catalog.json');
        if (!fs.existsSync(f)) continue;
        packs++;
        clips += JSON.parse(fs.readFileSync(f, 'utf8')).clips.length;
      }
      n++;
      if ((html.match(/<section>/g) || []).length !== packs) {
        g.fail('sheet/packs', `대조표에 팩이 ${(html.match(/<section>/g) || []).length}개 · 실제는 ${packs}개 — 다시 만들 것`);
      }
      n++;
      if ((html.match(/<figure class="c"/g) || []).length !== clips) {
        g.fail('sheet/clips', `대조표에 클립이 ${(html.match(/<figure class="c"/g) || []).length}개 · 실제는 ${clips}개 — 다시 만들 것`);
      }
      n++;
      // **그림이 안에 박혀 있는가** — 파일로 가리키면 옮길 때 깨진다.
      if ((html.match(/<svg /g) || []).length !== clips) {
        g.fail('sheet/inline', `박힌 그림이 ${(html.match(/<svg /g) || []).length}개다 — 클립 수와 같아야 한다`);
      }
      n++;
      if (/섬네일 없음/.test(html)) g.fail('sheet/missing', '대조표에 섬네일 없는 칸이 있다');
      console.log(`  [섬네일] 대조표: 팩 ${packs} · 클립 ${clips} · ${Math.round(html.length / 1024)}KB (그림을 안에 박는다)`);
    }
  }

  return n;
});
