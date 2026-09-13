// check:dist — 내보낸 팩을 **받아서 정말 쓸 수 있는가.**
//
// 팩은 저장소에 없다 (`.gitignore` 가 `packs/rocketbox-*/` 를 무시한다). 그래서
// 소비처는 어딘가에 올려 둔 것을 주소로 받는데, **그 길이 여태 없었다** —
// spacemaker 의 node_modules 를 열어 보니 기준 팩 하나뿐이고, 진짜 사람을
// 하나도 못 세운다.
//
// 이 길이 조용히 깨지는 방식이 셋이다:
//   1. 목록이 팩과 어긋난다 → 없는 파일을 받으러 가거나, 있는 클립을 못 받는다
//   2. 받다 끊긴다 → GLB 는 열 때 터지는 게 아니라 **이상한 자세로 열린다**
//   3. 층이 모자란다 → 몸은 받았는데 클립이 없어 사람이 안 움직인다
//      (실제로 처음 만든 far 층이 그랬다 — 받아서 열어 보고 알았다)
//
// 그래서 **실제로 내보내고 받아서 열어 본다.**

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runGate, ROOT } from './gate-lib.mjs';
import {
  TIERS, distManifest, tierBytes, bytesFor, missingClips, manifestProblems, MIN_CLIPS,
} from '../src/lib/dist.mjs';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

runGate('check-dist', (g) => {
  let n = 0;

  // ── 1. 층 나누기가 말이 되는가 ──
  {
    const files = [
      { path: 'catalog.json', bytes: 100 },
      { path: 'body.glb', bytes: 4000 },
      { path: 'body-far.glb', bytes: 90 },
      { path: 'body-far-10.glb', bytes: 50 },
      { path: 'body_albedo.png', bytes: 3000 },
      { path: 'clips/walk-forward.glb', bytes: 500 },
      { path: 'clips/idle.glb', bytes: 400 },
      { path: 'thumbs/idle.svg', bytes: 5 },
    ];
    n++;
    // 먼 층은 몸째도 텍스처도 안 받는다 — 그게 이 층의 뜻이다.
    const far = tierBytes(files, 'far');
    if (far !== 100 + 90 + 50) g.fail('tier/far', `먼 층이 ${far} 바이트다 (240 이어야 — 몸째나 텍스처가 섞였다)`);
    n++;
    if (!(tierBytes(files, 'far') < tierBytes(files, 'near'))) g.fail('tier/order', '먼 층이 가까운 층보다 가볍지 않다');
    n++;
    if (!(tierBytes(files, 'near') < tierBytes(files, 'all'))) g.fail('tier/order2', '가까운 층에 클립이 이미 들어 있다');
    n++;
    if (tierBytes(files, 'all') >= tierBytes(files, 'sheet')) g.fail('tier/sheet', '섬네일 층이 안 더 무겁다');
    n++;
    // 섬네일은 사람이 고를 때만 쓴다 — 자동으로 따라오면 안 된다.
    if (tierBytes(files, 'all') !== tierBytes(files, 'sheet') - 5) g.fail('tier/thumbs', '섬네일이 all 층에 섞여 있다');
    n++;
    let threw = false;
    try { tierBytes(files, '없는층'); } catch { threw = true; }
    if (!threw) g.fail('tier/unknown', '모르는 층을 받아 준다');
  }

  // ── 2. 목록이 팩과 어긋나면 잡는가 ──
  {
    const packDir = path.join(ROOT, 'packs');
    const ids = fs.readdirSync(packDir).filter((id) => fs.existsSync(path.join(packDir, id, 'catalog.json')));
    n++;
    if (ids.length < 2) { g.setupFail('팩이 둘 미만이다'); return n; }

    const rowsOf = (id) => {
      const dir = path.join(packDir, id);
      const files = [];
      const walk = (rel) => {
        for (const name of fs.readdirSync(path.join(dir, rel || '.'))) {
          const r = rel ? `${rel}/${name}` : name;
          if (fs.statSync(path.join(dir, r)).isDirectory()) { walk(r); continue; }
          if (r === 'sources.json') continue;
          const buf = fs.readFileSync(path.join(dir, r));
          files.push({ path: r, bytes: buf.length, sha256: sha(buf) });
        }
      };
      walk('');
      return { catalog: JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8')), files: files.sort((a, b) => (a.path < b.path ? -1 : 1)) };
    };
    const real = ids.map(rowsOf);
    const manifest = distManifest(real, { builtAt: '2026-09-13' });
    n++;
    const probs = manifestProblems(manifest);
    if (probs.length) g.fail('manifest/ok', probs.slice(0, 3).map((p) => `${p.key}: ${p.why}`).join(' · '));

    const breaks = [
      ['해시를 지우면', (m) => { delete m.packs[0].files[0].sha256; }, /^sha\//],
      ['크기를 0 으로', (m) => { m.packs[0].files[0].bytes = 0; }, /^bytes\//],
      ['카탈로그를 빼면', (m) => { m.packs[0].files = m.packs[0].files.filter((f) => f.path !== 'catalog.json'); }, /^catalog\//],
      ['클립 파일을 빼면', (m) => { m.packs[0].files = m.packs[0].files.filter((f) => !f.path.startsWith('clips/')); }, /^clip\//],
      ['합이 안 맞으면', (m) => { m.packs[0].bytes += 7; }, /^sum\//],
      ['같은 팩이 두 번', (m) => { m.packs.push(m.packs[0]); }, /^dup\//],
      ['층 크기가 없으면', (m) => { delete m.packs[0].tiers.far; }, /^tier\//],
    ];
    for (const [what, patch, want] of breaks) {
      n++;
      const bad = JSON.parse(JSON.stringify(manifest));
      patch(bad);
      if (!manifestProblems(bad).some((p) => want.test(p.key))) {
        g.fail(`manifest/${what}`, `${what} 안 잡는다`);
      }
    }

    // ── 3. 골라 받기가 수로 맞는가 ──
    const row = manifest.packs.find((r) => r.person);
    n++;
    if (!row) { g.setupFail('사람 팩이 없다'); return n; }
    n++;
    // 층만 받으면 **클립이 0개다** — 그걸로는 사람이 안 움직인다.
    if (bytesFor(row, { tier: 'far', clips: [] }) !== row.tiers.far) {
      g.fail('choose/none', '클립을 안 고르면 층 크기와 같아야 한다');
    }
    n++;
    if (!(bytesFor(row, { tier: 'far', clips: MIN_CLIPS }) > row.tiers.far)) {
      g.fail('choose/min', '가장 적은 묶음을 골랐는데 안 무거워진다 — 클립이 안 더해진다');
    }
    n++;
    if (bytesFor(row, { tier: 'far', clips: 'all' }) !== row.tiers.far + Object.values(row.clipBytes).reduce((s, b) => s + b, 0)) {
      g.fail('choose/all', '전부 고른 크기가 안 맞는다');
    }
    n++;
    // 없는 클립을 달라고 하면 **말한다** (조용히 0 을 더하지 않는다).
    if (!missingClips(row, ['없는클립']).length) g.fail('choose/missing', '없는 클립을 달라 했는데 안 말한다');
    n++;
    if (missingClips(row, MIN_CLIPS).length) g.fail('choose/have', '있는 클립을 없다고 한다');
    n++;
    // 먼 층 + 가장 적은 묶음이 **몸째보다 가벼운가** — 그게 나누는 이유다.
    if (!(bytesFor(row, { tier: 'far', clips: MIN_CLIPS }) < row.tiers.near)) {
      g.fail('choose/win', '골라 받는 것이 몸째 받는 것보다 안 가볍다');
    }
    const kb = (b) => `${Math.round(b / 1024)}KB`;
    const people = manifest.packs.filter((r) => r.person);
    console.log(
      `  [배포] 팩 ${manifest.packs.length}개 · 통째 ${(manifest.totalBytes / 1024 / 1024).toFixed(1)}MB · `
      + `먼 몸만 ${(manifest.tiers.far.allBytes / 1024 / 1024).toFixed(1)}MB · `
      + `먼 몸 + ${MIN_CLIPS.join('·')} ${(people.reduce((s, r) => s + bytesFor(r, { tier: 'far', clips: MIN_CLIPS }), 0) / 1024 / 1024).toFixed(1)}MB`,
    );
    console.log(`  [배포] 팩 하나: 먼 몸 ${kb(row.tiers.far)} · 몸째 ${kb(row.tiers.near)} · 동작까지 ${kb(row.tiers.all)}`);
  }

  // ── 4. 정말 내보내고 받아서 열리는가 ──
  //
  // **여기가 이 게이트의 요점이다.** 위의 검사는 전부 수를 보는 것이고, 그
  // 수가 맞아도 받은 파일이 안 열릴 수 있다.
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-dist-'));
    const one = 'ref-synthetic';
    n++;
    const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-dist.mjs'), path.join(tmp, 'out')], { encoding: 'utf8' });
    if (b.status !== 0) { g.fail('run/build', `내보내기가 실패했다 — ${(b.stderr || '').slice(0, 120)}`); }
    else {
      n++;
      const f = spawnSync(process.execPath, [
        path.join(ROOT, 'scripts', 'fetch-packs.mjs'), path.join(tmp, 'out', 'packs.json'),
        '--tier', 'far', '--pack', one, '--clips', 'all', '--to', path.join(tmp, 'recv'),
      ], { encoding: 'utf8' });
      if (f.status !== 0) g.fail('run/fetch', `받기가 실패했다 — ${(f.stderr || '').slice(0, 160)}`);
      else {
        n++;
        const got = path.join(tmp, 'recv', one);
        if (!fs.existsSync(path.join(got, 'catalog.json'))) g.fail('run/catalog', '받은 것에 카탈로그가 없다');
        n++;
        const cat = JSON.parse(fs.readFileSync(path.join(got, 'catalog.json'), 'utf8'));
        const have = fs.existsSync(path.join(got, 'clips')) ? fs.readdirSync(path.join(got, 'clips')).length : 0;
        if (have !== cat.clips.length) g.fail('run/clips', `클립을 전부 달라 했는데 ${have}/${cat.clips.length} 개다`);
        n++;
        // 받은 바이트가 원본과 **같은가** — 해시로 봤지만 한 번 더 본다.
        const src = fs.readFileSync(path.join(ROOT, 'packs', one, 'catalog.json'));
        if (sha(src) !== sha(fs.readFileSync(path.join(got, 'catalog.json')))) {
          g.fail('run/bytes', '받은 카탈로그가 원본과 다르다');
        }
        n++;
        // **다시 받으면 안 받는다** — 해시가 같으면 건너뛴다.
        const again = spawnSync(process.execPath, [
          path.join(ROOT, 'scripts', 'fetch-packs.mjs'), path.join(tmp, 'out', 'packs.json'),
          '--tier', 'far', '--pack', one, '--clips', 'all', '--to', path.join(tmp, 'recv'),
        ], { encoding: 'utf8' });
        if (!/받음 0개/.test(again.stdout || '')) g.fail('run/again', `두 번째로 받을 때도 다시 받는다: ${(again.stdout || '').split('\n').pop()}`);
        n++;
        // **깨진 파일을 쓰지 않는가** — 한 바이트만 바꿔 놓고 다시 받아 본다.
        const victim = path.join(got, 'catalog.json');
        fs.writeFileSync(victim, `${fs.readFileSync(victim, 'utf8')} `);
        const third = spawnSync(process.execPath, [
          path.join(ROOT, 'scripts', 'fetch-packs.mjs'), path.join(tmp, 'out', 'packs.json'),
          '--tier', 'far', '--pack', one, '--clips', 'all', '--to', path.join(tmp, 'recv'),
        ], { encoding: 'utf8' });
        if (!/받음 1개/.test(third.stdout || '')) g.fail('run/repair', '바뀐 파일을 다시 안 받는다 — 해시를 안 보고 있다');
        n++;
        // **보내는 쪽이 깨져 있으면 안 쓴다.** 위의 '바뀐 것만 1개' 는 받는
        // 쪽이 바뀐 경우라 내려받을 때의 해시 검사를 안 건드린다 — 그걸
        // 빼 보고도 게이트가 통과해서 알았다. 여기서는 **올려 둔 파일**을
        // 한 바이트 바꾸고, 받는 쪽이 그것을 쓰지 않는지 본다.
        const upstream = path.join(tmp, 'out', 'packs', one, 'catalog.json');
        const goodBytes = fs.readFileSync(upstream);
        fs.writeFileSync(upstream, `${goodBytes.toString('utf8')} `);
        fs.rmSync(path.join(tmp, 'recv', one, 'catalog.json'), { force: true });
        const rot = spawnSync(process.execPath, [
          path.join(ROOT, 'scripts', 'fetch-packs.mjs'), path.join(tmp, 'out', 'packs.json'),
          '--tier', 'far', '--pack', one, '--clips', 'none', '--to', path.join(tmp, 'recv'),
        ], { encoding: 'utf8' });
        const refused = rot.status !== 0 && /깨진 것/.test(rot.stdout || '');
        const wrote = fs.existsSync(path.join(tmp, 'recv', one, 'catalog.json'));
        if (!refused || wrote) {
          g.fail('run/corrupt', `올려 둔 파일이 목록과 다른데 ${wrote ? '그대로 썼다' : '멈추지 않았다'} — 받다 끊긴 GLB 는 이상한 자세로 열린다`);
        }
        fs.writeFileSync(upstream, goodBytes);
        console.log(`  [배포] 내보내고 받아서 열었다: ${one} · 클립 ${have}개 · 다시 받으면 0개 · 바뀐 것만 1개 · 보낸 쪽이 깨지면 안 쓴다`);
      }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ── 5. 층 이름이 문서와 같은가 ──
  n++;
  if (Object.keys(TIERS).join() !== 'far,near,all,sheet') {
    g.fail('tier/names', `층이 ${Object.keys(TIERS).join()} 다 — 이름이 바뀌면 소비처의 스크립트가 깨진다`);
  }

  return n;
});
