// **동작 섬네일** — 클립이 무슨 동작인지 그림 하나로 보인다.
//
// 클립이 팩마다 서른 개가 됐다. `walk-injured` 와 `walk-bruised` 가 어떻게
// 다른지, `crouch-in` 이 정말 주저앉는 것인지 이름만으로는 모른다. 지금은
// 확인하려면 브라우저를 띄워 하나씩 틀어 봐야 한다.
//
// ## 렌더러를 안 쓴다
//
// three.js 로 그리면 이 층이 three 를 import 하게 되고(순수 층이 깨진다),
// headless GL 을 붙이면 의존성이 하나 는다. 대신 **이미 있는 것**으로 만든다:
// 구운 자세에 살 점을 붙여(skinPoints) 그 점들을 격자에 찍고, 찬 칸을 가로로
// 이어 붙여 SVG 사각형으로 낸다.
//
// 그래서 이 섬네일은 **그린 그림이 아니라 잰 그림**이다. 살 점이 진짜로 그
// 자리에 있다 — 조명도 재질도 없고, 있는 것은 그 프레임에 몸이 차지한
// 자리뿐이다. 계약이 "지어내지 않는다" 로 지켜 온 것이 그림에도 그대로 간다.
//
// ## 한 장에 여러 프레임을 겹친다
//
// 한 자세만 그리면 걷기와 서기가 똑같이 보인다. 클립을 고르게 나눈 프레임을
// 옅은 것부터 짙은 것까지 겹쳐 그리면 **움직임이 보인다** — 잔상처럼.
//
// 이 파일에는 three.js 도 DOM 도 없다. 값과 규칙만 있다.

/**
 * 섬네일 한 칸의 기본 크기 (격자 칸 수).
 *
 * 처음에 48×64 로 두었더니 사람이 그림의 **3분의 1만** 차지했다 — 상자가
 * 가로로 너무 넓었다. 사람은 세로로 긴 물체다 (키 1.74m · 폭 0.5m).
 */
export const THUMB_COLS = 24;
export const THUMB_ROWS = 64;

/**
 * 점들이 차지한 칸을 찍는다 — 정사영(옆에서 안 보고 앞에서 본다).
 *
 * @param points  [x,y,z, …] 평평한 배열 (skinPoints 가 내는 것)
 * @param box     { x0, x1, y0, y1 } 세계 좌표에서의 그릴 범위.
 *                **클립마다 다시 잡지 않는다** — 그러면 앉은 사람과 선 사람이
 *                같은 크기로 그려져 비교가 안 된다. 팩 하나에 하나를 쓴다.
 * @param axis    'xy'(앞에서) 또는 'zy'(옆에서)
 */
export function silhouetteGrid(points, { box, cols = THUMB_COLS, rows = THUMB_ROWS, axis = 'xy' } = {}) {
  const grid = new Uint8Array(cols * rows);
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  if (!(w > 0) || !(h > 0)) return grid;
  const hi = axis === 'zy' ? 2 : 0;
  for (let i = 0; i < points.length; i += 3) {
    const u = (points[i + hi] - box.x0) / w;
    const v = (points[i + 1] - box.y0) / h;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    const cx = Math.floor(u * cols);
    // 화면은 위가 0 이다 — 세계의 y 가 클수록 위로 간다.
    const cy = rows - 1 - Math.floor(v * rows);
    grid[cy * cols + cx] = 1;
  }
  return grid;
}

/**
 * 찬 칸을 **가로로 이어 붙인다** — 칸마다 사각형 하나를 내면 3,072개가
 * 되는데, 이어 붙이면 100개 남짓이다 (파일이 30배 작아진다).
 */
export function runsOf(grid, cols = THUMB_COLS, rows = THUMB_ROWS) {
  const out = [];
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      if (!grid[y * cols + x]) { x++; continue; }
      let x1 = x;
      while (x1 + 1 < cols && grid[y * cols + x1 + 1]) x1++;
      out.push({ y, x0: x, len: x1 - x + 1 });
      x = x1 + 1;
    }
  }
  return out;
}

/** 찬 칸 수 — 게이트가 "앉으면 낮고 넓어지는가" 를 이 수로 본다. */
export function filledCells(grid) {
  let k = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) k++;
  return k;
}

/** 찬 칸의 경계 — 게이트가 자세를 수로 가른다 (앉으면 위쪽이 비어 있다). */
export function gridBounds(grid, cols = THUMB_COLS, rows = THUMB_ROWS) {
  let x0 = cols; let x1 = -1; let y0 = rows; let y1 = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!grid[y * cols + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * 섬네일 SVG 하나.
 *
 * @param grids  프레임마다의 격자 — **앞의 것이 옅고 뒤의 것이 짙다** (잔상)
 * @param label  아래에 적을 글 (없으면 안 적는다)
 */
/** SVG 안에 글자를 넣기 전에 — 안 거르면 클립 이름 하나로 그림이 깨진다. */
function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function thumbSvg(grids, {
  cols = THUMB_COLS, rows = THUMB_ROWS, cell = 3, label = null,
  ink = '#2b3440', bg = 'none', pad = 2,
} = {}) {
  const W = cols * cell + pad * 2;
  const H = rows * cell + pad * 2 + (label ? 12 : 0);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">`];
  if (bg !== 'none') parts.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
  if (label) parts.push(`<title>${esc(label)}</title>`);

  grids.forEach((grid, i) => {
    // 마지막 프레임이 가장 짙다 — 지금 자세가 어디인지 한눈에 보이게.
    const a = grids.length === 1 ? 1 : 0.22 + (0.78 * i) / (grids.length - 1);
    const d = runsOf(grid, cols, rows)
      .map((r) => `M${pad + r.x0 * cell} ${pad + r.y * cell}h${r.len * cell}v${cell}h${-r.len * cell}z`)
      .join('');
    if (d) parts.push(`<path d="${d}" fill="${ink}" fill-opacity="${a.toFixed(2)}"/>`);
  });

  if (label) {
    parts.push(
      `<text x="${W / 2}" y="${H - 3}" font-family="system-ui,sans-serif" font-size="9"`
      + ` text-anchor="middle" fill="${ink}" fill-opacity="0.7">${esc(label)}</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

/**
 * 이 팩의 **그릴 범위** — 클립마다 다시 잡지 않는다.
 *
 * 서 있는 사람으로 잡고 옆으로 조금 넉넉하게 둔다. 그래야 앉은 클립이
 * 아래쪽에, 뛰는 클립이 옆으로 퍼져 보인다 — 같은 자에 대고 그리는 셈이다.
 */
export function thumbBox(heightM, { widthM = null, margin = 0.12 } = {}) {
  const h = heightM * (1 + margin * 2);
  // 가로세로 비를 격자에 맞춘다 — 안 맞추면 사람이 납작하거나 홀쭉해진다.
  // 칸 하나가 세로로도 가로로도 같은 거리를 뜻하게 두는 것이 요점이다.
  const halfWant = ((THUMB_COLS / THUMB_ROWS) * h) / 2;
  // 팔을 벌리거나 다리를 벌린 클립이 잘리면 안 된다 — 몸 폭의 1.5배는 든다.
  const halfNeed = ((widthM || heightM * 0.4) * 1.5) / 2;
  const half = Math.max(halfWant, halfNeed);
  return { x0: -half, x1: half, y0: -heightM * margin, y1: heightM * (1 + margin) };
}
