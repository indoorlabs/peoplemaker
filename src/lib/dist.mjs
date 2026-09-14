// 팩을 내보낼 때의 **목록** — 무엇이 있고 얼마인가.
//
// 팩은 저장소에 없다 (`.gitignore` 가 `packs/rocketbox-*/` 를 무시한다).
// 받는 쪽은 어딘가에 올려 둔 것을 주소로 받는데, 그때 **무엇이 있고 얼마인지**
// 를 알아야 고를 수 있다 — `loadPack` 은 파일마다 따로 받고 클립도 골라 받는다.
//
// ## 층(tier)을 왜 나누는가
//
// 도시 스케일 화면은 먼 몸만 쓴다 (텍스처도 없다). 그런 쪽에 4.2MB 짜리 몸을
// 보내는 것은 통째로 버리는 값이다. 그래서 목록이 **쓰임마다 얼마인지**를
// 미리 더해 둔다 — 받는 쪽이 계산을 다시 안 해도 되게.
//
// 이 파일에는 three.js 도 DOM 도 fs 도 없다. 값과 규칙만 있다.

/**
 * 파일이 어느 층에 드는가.
 *
 * **층만으로는 사람이 안 움직인다.** `far` 를 받으면 몸은 오는데 클립이 없어서
 * 세울 수는 있어도 자세가 없다 — 받아서 열어 보고 알았다. 클립은 쓰는 쪽이
 * **골라** 받는 것이라(활동마다 쓰는 것이 다르다) 층에 안 넣는다. 대신 목록이
 * 클립마다 몇 바이트인지 적어 두고(`clipBytes`), 골라 더하면 된다
 * (`bytesFor`).
 */
export const TIERS = {
  far: {
    what: '먼 사람만 세우는 화면 (도시 스케일) — 텍스처도 몸째도 안 받는다. **클립은 따로 고른다**',
    match: (p) => p === 'catalog.json' || /^body-far/.test(p),
  },
  near: {
    what: '가까운 사람까지 — 몸째와 텍스처가 든다',
    match: (p) => p === 'catalog.json' || /^body/.test(p) || /\.(png|jpg|jpeg|ktx2)$/i.test(p),
  },
  all: {
    what: '동작 전부 — 클립이 가장 무겁다 (필요한 것만 골라 받을 수 있다)',
    match: (p) => !/^thumbs\//.test(p),
  },
  sheet: {
    what: '섬네일까지 — 사람이 고를 때만 쓴다',
    match: () => true,
  },
};

/**
 * **올려 둔 팩의 목록** — 저장소에 없는 것은 여기서 받는다.
 *
 * 값과 규칙만 있는 이 파일에 주소가 있는 까닭: 게이트가 건너뛸 때도, 받는
 * 쪽이 없는 클립을 만났을 때도 **같은 주소를 말해야** 한다. 한쪽은 빈자리를
 * 주고 있었다 — 오류 문구가 `<목록 주소>` 라고 적어서, 그것을 본 사람은
 * 어디서 받는지 몰랐다.
 */
export const PACKS_URL = 'https://github.com/indoorlabs/peoplemaker/releases/download/packs-2026-09-14/packs.json';

/**
 * **올려 둔 것이 어떤 모양으로 놓여 있는가.**
 *
 * 파일을 폴더째 올릴 수 있는 자리(정적 호스팅·버킷)면 `packs/<팩>/<경로>` 로
 * 그대로 둔다. 그런데 **GitHub Release 는 이름에 `/` 를 못 쓴다** — 올린
 * 파일이 전부 한 자리에 납작하게 놓인다. 그래서 목록이 배치를 말하고, 받는
 * 쪽이 그대로 주소를 만든다.
 *
 * 받아서 **어디에 쓸지는 안 달라진다** — 배치는 주소를 만드는 규칙일 뿐이고,
 * 저장은 늘 `<받을 곳>/<팩>/<경로>` 다.
 */
export const LAYOUTS = {
  tree: {
    what: '폴더 그대로 — packs/<팩>/<경로> (정적 호스팅·버킷)',
    url: (packId, filePath) => `packs/${packId}/${filePath}`,
  },
  flat: {
    what: '한 자리에 납작하게 — <팩>__<경로의 / 를 __ 로> (GitHub Release)',
    url: (packId, filePath) => `${packId}__${filePath.replace(/\//g, '__')}`,
  },
};

/** 목록이 말하는 배치로 이 파일의 주소를 만든다 (안 적혀 있으면 폴더 그대로). */
export function fileUrl(manifest, packId, filePath) {
  const layout = manifest?.layout || 'tree';
  const def = LAYOUTS[layout];
  if (!def) throw new Error(`모르는 배치: ${layout} (${Object.keys(LAYOUTS).join(' · ')})`);
  return def.url(packId, filePath);
}

/** 이 층에 드는 파일의 바이트 합. */
export function tierBytes(files, tier) {
  const m = TIERS[tier]?.match;
  if (!m) throw new Error(`모르는 층: ${tier}`);
  return (files || []).reduce((s, f) => (m(f.path) ? s + f.bytes : s), 0);
}

/**
 * 내보낼 목록.
 *
 * @param packs [{ catalog, files: [{ path, bytes, sha256 }] }]
 * @returns 받는 쪽이 그대로 읽는 값
 */
export function distManifest(packs, { builtAt = null, version = 1, layout = 'tree' } = {}) {
  if (!LAYOUTS[layout]) throw new Error(`모르는 배치: ${layout} (${Object.keys(LAYOUTS).join(' · ')})`);
  const rows = (packs || []).map(({ catalog, files }) => ({
    packId: catalog.packId,
    version: catalog.version,
    skeleton: catalog.skeleton,
    // 누구인지 — 배역이 이것으로 고른다 (없는 팩은 사람이 아니다).
    ...(catalog.person ? { person: catalog.person } : {}),
    ...(catalog.bodyDims ? { bodyDims: catalog.bodyDims } : {}),
    clips: (catalog.clips || []).map((c) => c.id),
    // **클립마다 몇 바이트인가** — 골라 받는 쪽이 미리 더해 볼 수 있게.
    clipBytes: Object.fromEntries(
      (files || []).filter((f) => f.path.startsWith('clips/'))
        .map((f) => [f.path.slice(6).replace(/\.glb$/, ''), f.bytes]),
    ),
    files,
    bytes: (files || []).reduce((s, f) => s + f.bytes, 0),
    tiers: Object.fromEntries(Object.keys(TIERS).map((t) => [t, tierBytes(files, t)])),
  })).sort((a, b) => (a.packId < b.packId ? -1 : 1));

  const tiers = Object.fromEntries(Object.entries(TIERS).map(([t, def]) => [t, {
    what: def.what,
    allBytes: rows.reduce((s, r) => s + r.tiers[t], 0),
    perPackBytes: rows.length ? Math.round(rows.reduce((s, r) => s + r.tiers[t], 0) / rows.length) : 0,
  }]));

  return {
    version,
    ...(builtAt ? { builtAt } : {}),
    // 폴더 그대로면 굳이 안 적는다 — 안 적힌 목록도 예전처럼 읽힌다.
    ...(layout === 'tree' ? {} : { layout }),
    note: '팩은 저장소에 없다 — 이 목록이 어디에 무엇이 얼마로 있는지 말한다. loadPack 은 파일마다 따로 받으므로 필요한 것만 받으면 된다.',
    packs: rows,
    tiers,
    totalFiles: rows.reduce((s, r) => s + r.files.length, 0),
    totalBytes: rows.reduce((s, r) => s + r.bytes, 0),
  };
}

/**
 * **저장소에 두는 파일** — `npm i` 만으로 되는 만큼.
 *
 * 팩은 무겁다 (열셋 통째로 257MB). 그래서 예전에는 팩 폴더를 통째로 무시했는데,
 * 그러면 받은 쪽에 **세울 몸이 하나도 안 간다** — spacemaker 를 열어 보고
 * 알았다. 먼 층 + 가장 적은 동작만 두면 열둘에 5.5MB 다.
 *
 * ## 이만큼으로 되는 것과 안 되는 것
 *
 *   된다      도시 스케일 군중이 서고 · 걷고 · 뛴다 (서기·걷기·뛰기)
 *   안 된다   **대피**는 둘러보기와 문 열기가 더 든다
 *
 * 대피까지 두려고 `look-around`(250KB)와 `door-open`(480KB)을 넣어 봤더니
 * 5.5MB 가 **13.0MB** 가 됐다 — 활동 하나에 저장소가 두 배다. 그래서 안 둔다.
 * 대피가 필요한 쪽은 그 둘만 더 받으면 된다:
 *
 *   npm run fetch:packs -- <packs.json 주소> --tier far --clips look-around,door-open
 *
 * 뛰기는 두는 까닭이 다르다: 뛰는 클립이 없으면 **대피가 걷는 대피가 되고**
 * 피난 시간이 거짓이 된다. 없는 편이 낫다.
 *
 * `.gitignore` 와 여기가 어긋나면 `scripts/check-ship.mjs` 가 막는다.
 */
export const SHIP_FILES = [
  'catalog.json',
  'body-far.glb',
  'body-far-10.glb',
  'clips/idle.glb',
  'clips/walk-forward.glb',
  'clips/run.glb',
];

/**
 * 걷기·서기 같은 **가장 적은 동작** — 이만큼은 있어야 사람이 사람처럼 선다.
 *
 * 서 있기만 있으면 군중이 전부 얼어 있고, 걷기만 있으면 멈춘 사람이 걷다 만
 * 자세로 굳는다 (그래서 재생기가 클립을 갈아탄다).
 */
export const MIN_CLIPS = ['idle', 'walk-forward'];

/**
 * 이만큼 받으면 몇 바이트인가 — **받기 전에** 더해 볼 수 있게.
 *
 * @param row    목록의 팩 한 줄
 * @param tier   층 이름
 * @param clips  함께 받을 클립 id 들 (기본 MIN_CLIPS · 'all' 이면 전부)
 */
export function bytesFor(row, { tier = 'far', clips = MIN_CLIPS } = {}) {
  const clipTotal = Object.values(row?.clipBytes || {}).reduce((s, b) => s + b, 0);
  // **층이 이미 클립을 품고 있으면 그 몫을 뺀다.** `all`·`sheet` 의 크기표에는
  // 클립이 들어 있는데(그래야 "동작 전부 172.5MB" 라는 수가 나온다), 받을 때는
  // 클립을 따로 고르므로 두 번 세면 안 된다 — 'sheet' 에 클립 0개를 달라니
  // 67KB 라 해 놓고 42KB 를 받았다. 무엇을 받을지는 fetch-packs 와 같은
  // 규칙이다: 클립이 아닌 파일은 층으로, 클립은 고른 것으로.
  const tierHasClips = TIERS[tier]?.match?.('clips/x.glb') === true;
  const base = (row?.tiers?.[tier] ?? 0) - (tierHasClips ? clipTotal : 0);
  if (clips === 'all') return base + clipTotal;
  const want = (clips || []).filter((id) => row?.clipBytes?.[id] !== undefined);
  return base + want.reduce((s, id) => s + row.clipBytes[id], 0);
}

/** 이 팩에 없는 클립을 달라고 했는가 — 받기 전에 말한다. */
export function missingClips(row, clips) {
  if (clips === 'all') return [];
  return (clips || []).filter((id) => row?.clipBytes?.[id] === undefined);
}

/**
 * 목록이 말이 되는가 — `[{ key, why }]`.
 *
 * 받는 쪽이 이것을 믿고 받으므로, 목록이 팩과 어긋나면 조용히 빠진 파일이
 * 생긴다 (그 클립만 없는 사람이 나온다).
 */
export function manifestProblems(manifest) {
  const out = [];
  const bad = (key, why) => out.push({ key, why });
  if (!manifest || typeof manifest !== 'object') return [{ key: 'shape', why: '목록이 값이 아니다' }];
  if (!Array.isArray(manifest.packs) || !manifest.packs.length) return [{ key: 'packs', why: '팩이 없다' }];
  // 배치는 없어도 된다 (안 적히면 폴더 그대로). 다만 적혔으면 **아는 것**이어야
  // 한다 — 모르는 배치를 만나면 받는 쪽이 엉뚱한 주소를 만들어 전부 404 가 된다.
  if (manifest.layout !== undefined && !LAYOUTS[manifest.layout]) {
    bad('layout', `'${manifest.layout}' 는 모르는 배치다 (${Object.keys(LAYOUTS).join(' · ')})`);
  }
  // 납작한 자리에 올릴 때 **이름이 겹치면 하나가 다른 하나를 덮는다.**
  if (manifest.layout === 'flat') {
    const names = new Map();
    for (const p of manifest.packs || []) {
      for (const f of p.files || []) {
        const u = fileUrl(manifest, p.packId, f.path);
        if (names.has(u)) bad(`flat/${u}`, `${names.get(u)} 와 이름이 겹친다 — 하나가 덮인다`);
        else names.set(u, `${p.packId}/${f.path}`);
      }
    }
  }

  const seen = new Set();
  for (const p of manifest.packs) {
    if (!p.packId) { bad('packId', '이름이 없는 팩이 있다'); continue; }
    if (seen.has(p.packId)) bad(`dup/${p.packId}`, '같은 팩이 두 번 적혔다');
    seen.add(p.packId);
    if (!p.files?.length) { bad(`files/${p.packId}`, '파일이 없다'); continue; }
    if (!p.files.some((f) => f.path === 'catalog.json')) bad(`catalog/${p.packId}`, 'catalog.json 이 목록에 없다');
    for (const f of p.files) {
      if (!(f.bytes > 0)) bad(`bytes/${p.packId}/${f.path}`, `크기가 ${f.bytes} 다`);
      if (!/^[0-9a-f]{8,}$/.test(f.sha256 || '')) bad(`sha/${p.packId}/${f.path}`, '해시가 없다 — 받은 것이 맞는지 못 본다');
    }
    // 클립마다 파일이 있는가 — 카탈로그에 있는데 못 받는 클립이 있으면,
    // 그 클립을 쓰는 활동이 **받고 나서야** 안 된다는 것을 안다.
    for (const id of p.clips || []) {
      if (!p.files.some((f) => f.path === `clips/${id}.glb`)) {
        bad(`clip/${p.packId}/${id}`, '카탈로그에 있는데 내보낼 파일이 없다');
      }
    }
    const sum = p.files.reduce((s, f) => s + f.bytes, 0);
    if (sum !== p.bytes) bad(`sum/${p.packId}`, `바이트 합이 ${sum} 인데 ${p.bytes} 라고 적혀 있다`);
    for (const t of Object.keys(TIERS)) {
      if (p.tiers?.[t] === undefined) bad(`tier/${p.packId}/${t}`, `'${t}' 층의 크기가 없다`);
      else if (p.tiers[t] > p.bytes) bad(`tier/${p.packId}/${t}`, `층이 팩 전체보다 크다`);
    }
    // 먼 몸만 받는 쪽이 몸째를 받게 되면 안 된다 — 그 층의 뜻이 없어진다.
    if (p.tiers?.far > p.tiers?.near) bad(`tier/${p.packId}/order`, '먼 층이 가까운 층보다 무겁다');
  }
  return out;
}
