// check:ship — 저장소에 **둘 것만 두었는가**, 그리고 그것으로 정말 되는가.
//
// 팩을 통째로 무시하던 때에는 받은 쪽에 세울 몸이 하나도 안 갔다. 이제 먼 층
// + 가장 적은 동작만 둔다 (열둘에 5.5MB). 그런데 이 자리가 조용히 틀어지는
// 방식이 셋이다:
//
//   1. `.gitignore` 와 SHIP_FILES 가 갈린다 → 두려던 것이 안 가거나, 안 두려던
//      4.2MB 짜리 몸이 따라간다
//   2. **재배포가 금지된 클립이 섞인다** (Mixamo 등) → 저장소가 그것을 배포하게
//      된다. 이것이 이 게이트에서 가장 위험한 자리다
//   3. 두긴 뒀는데 그것만으로는 아무것도 못 한다 → 설치한 쪽이 "몸은 있는데
//      안 움직인다" 를 겪는다 (먼 층을 처음 만들 때 실제로 그랬다)
//
// 그래서 git 이 정말 무엇을 들고 있는지 물어보고, 그 파일만으로 사람을 세워 본다.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runGate, ROOT } from './gate-lib.mjs';
import { SHIP_FILES, MIN_CLIPS } from '../src/lib/dist.mjs';
import { packRedistributable, LICENSES } from '../src/lib/motionPack.mjs';
import { planActivity } from '../src/lib/activity.mjs';

const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout || '';

runGate('check-ship', (g) => {
  let n = 0;

  const tracked = git('ls-files', 'packs').trim().split('\n').filter(Boolean);
  n++;
  if (tracked.length < 10) { g.setupFail(`git 이 팩 파일을 ${tracked.length}개만 들고 있다 — git 이 안 돌았거나 경로가 다르다`); return n; }

  const personPacks = [];
  for (const id of fs.readdirSync(path.join(ROOT, 'packs'))) {
    const f = path.join(ROOT, 'packs', id, 'catalog.json');
    if (!fs.existsSync(f)) continue;
    const cat = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (cat.person) personPacks.push({ id, cat });
  }
  n++;
  if (personPacks.length < 2) { g.setupFail('사람 팩이 둘 미만이다'); return n; }

  // ── 1. 사람 팩마다 둘 것이 다 있는가 ──
  for (const { id } of personPacks) {
    for (const rel of SHIP_FILES) {
      n++;
      const want = `packs/${id}/${rel}`;
      if (!tracked.includes(want)) {
        g.fail(`miss/${id}/${rel}`, `저장소에 없다 — 설치한 쪽이 이 파일을 못 받는다 (.gitignore 를 볼 것)`);
      }
    }
  }

  // ── 2. 안 둘 것이 따라가지 않는가 ──
  {
    const allowed = new Set(SHIP_FILES);
    const stray = tracked.filter((t) => {
      const m = /^packs\/(rocketbox-[^/]+)\/(.+)$/.exec(t);
      return m && !allowed.has(m[2]);
    });
    n++;
    if (stray.length) {
      g.fail('stray', `둘 것이 아닌 파일이 저장소에 있다 (${stray.length}개): ${stray.slice(0, 3).join(' · ')}`);
    }
    n++;
    // 몸째(4.2MB)와 텍스처는 절대 안 간다 — 그것이 이 나눔의 뜻이다.
    const heavy = tracked.filter((t) => /rocketbox-.*\/(body\.glb|.*\.png)$/.test(t));
    if (heavy.length) g.fail('heavy', `몸째나 텍스처가 저장소에 있다: ${heavy.slice(0, 3).join(' · ')}`);
    n++;
    const bytes = tracked.reduce((s, t) => {
      const f = path.join(ROOT, t);
      return fs.existsSync(f) ? s + fs.statSync(f).size : s;
    }, 0);
    // 무거워지면 말한다 — 8MB 를 넘으면 나눔이 무너지고 있는 것이다.
    if (bytes > 8 * 1024 * 1024) g.fail('bytes', `저장소의 팩이 ${(bytes / 1024 / 1024).toFixed(1)}MB 다 — 나눔이 무너지고 있다`);
    console.log(`  [배포] 저장소에 두는 것: 파일 ${tracked.length}개 · ${(bytes / 1024 / 1024).toFixed(2)}MB (사람 ${personPacks.length}명)`);
  }

  // ── 3. 재배포가 금지된 것이 섞이지 않았는가 ──
  //
  // **여기가 가장 위험한 자리다.** Mixamo 클립이 하나라도 들어오면 저장소가
  // 그것을 배포하게 된다 — 라이선스 사고는 조용하고, 몇 달 뒤 남이 알려 준다.
  for (const { id, cat } of personPacks) {
    n++;
    if (!packRedistributable(cat)) {
      const bad = cat.clips.filter((c) => LICENSES[c.license]?.redistributable === false);
      g.fail(`redist/${id}`, `재배포가 금지된 클립이 있는 팩인데 저장소에 둔다: ${bad.map((c) => `${c.id}(${c.license})`).join(' · ')}`);
    }
    n++;
    // 두는 클립 하나하나도 본다 — 팩 전체가 괜찮아도 두는 것만 볼 수 있다.
    for (const rel of SHIP_FILES.filter((r) => r.startsWith('clips/'))) {
      const clipId = rel.slice(6).replace(/\.glb$/, '');
      const clip = cat.clips.find((c) => c.id === clipId);
      if (!clip) { g.fail(`redist/${id}/${clipId}`, '두려는 클립이 카탈로그에 없다'); continue; }
      if (LICENSES[clip.license]?.redistributable === false) {
        g.fail(`redist/${id}/${clipId}`, `${clip.license} 은 재배포가 금지다`);
      }
    }
  }

  // ── 4. 둔 것만으로 정말 되는가 ──
  //
  // 설치한 쪽이 겪는 것을 그대로 본다: 저장소에 있는 파일만 있다고 치고,
  // 군중을 세우고 대피를 시켜 본다.
  for (const { id, cat } of personPacks.slice(0, 3)) {
    const have = new Set(SHIP_FILES.filter((r) => r.startsWith('clips/')).map((r) => r.slice(6).replace(/\.glb$/, '')));
    const asShipped = { ...cat, clips: cat.clips.filter((c) => have.has(c.id)) };
    n++;
    // 먼 몸이 있어야 도시 스케일이 된다.
    if (!cat.bodyFar?.length) g.fail(`use/${id}/far`, '먼 몸이 없는 팩이다');
    n++;
    // **대피는 안 된다 — 그것이 사실이고, 그 사실이 바뀌면 말해야 한다.**
    //
    // 대피까지 두려고 둘러보기(250KB)와 문 열기(480KB)를 넣어 봤더니 5.5MB 가
    // 13.0MB 가 됐다 — 활동 하나에 저장소가 두 배다. 그래서 안 둔다. 대신
    // **무엇이 모자란지를 적어 두고**, 늘거나 줄면 게이트가 알려 준다.
    const WANT_MISSING = ['lookAround', 'door'];
    const evac = planActivity(asShipped, 'evacuate');
    const got = [...new Set(evac.missing.map((m) => m.role || m.need))].sort();
    if (got.join() !== [...WANT_MISSING].sort().join()) {
      g.fail(`use/${id}/evacuate`, `두는 클립으로 대피에 모자란 것이 ${got.join(' · ') || '없음'} 다 — 적어 둔 것은 ${WANT_MISSING.join(' · ')} (클립을 더 두었으면 SHIP_FILES 와 여기를 함께 고칠 것)`);
    }
    n++;
    // 걷고 뛰는 것은 **되어야 한다** — 그게 이만큼 두는 이유다.
    for (const need of ['idle', 'walk-forward', 'run']) {
      if (!asShipped.clips.some((c) => c.id === need)) g.fail(`use/${id}/${need}`, '군중이 걷고 뛰려면 이 클립이 있어야 한다');
    }
    n++;
    // 걷기·서기가 다 있어야 멈춘 사람이 걷다 만 자세로 안 굳는다.
    for (const want of MIN_CLIPS) {
      if (!asShipped.clips.some((c) => c.id === want)) g.fail(`use/${id}/${want}`, '가장 적은 동작이 빠졌다');
    }
  }
  {
    const { cat } = personPacks[0];
    const have = new Set(SHIP_FILES.filter((r) => r.startsWith('clips/')).map((r) => r.slice(6).replace(/\.glb$/, '')));
    const asShipped = { ...cat, clips: cat.clips.filter((c) => have.has(c.id)) };
    const evac = planActivity(asShipped, 'evacuate');
    console.log(
      `  [배포] 둔 클립 ${asShipped.clips.length}개(${[...have].join('·')})로: 군중이 서고 걷고 뛴다 · `
      + `먼 몸 ${cat.bodyFar.length}단계 · **대피는 안 된다** (${[...new Set(evac.missing.map((m) => m.role || m.need))].join('·')} 가 더 든다 — 두면 13.0MB)`,
    );
  }

  // ── 5. 최소 예제가 **설치하면 되는 것만** 쓰는가 ──
  //
  // demo/minimal.js 는 소비처가 그대로 베끼는 자리다. 거기서 안 따라오는
  // 클립을 쓰면, 베낀 쪽은 `npm i` 하고 곧바로 404 를 본다.
  {
    const f = path.join(ROOT, 'demo', 'minimal.js');
    n++;
    if (!fs.existsSync(f)) g.fail('demo/none', 'demo/minimal.js 가 없다');
    else {
      const raw = fs.readFileSync(f, 'utf8');
      // **주석을 걷어내고 본다.** 처음에 그냥 봤더니 "`body: 'far'` 가
      // 요점이다" 라는 주석 때문에, 코드에서 그것을 빼도 게이트가 통과했다.
      const SLASHES = '//';
      const src = raw
        .split('\n')
        .map((l) => (l.includes(SLASHES) ? l.slice(0, l.indexOf(SLASHES)) : l))
        .join('\n');
      const shipped = new Set(SHIP_FILES.filter((r) => r.startsWith('clips/')).map((r) => r.slice(6).replace(/\.glb$/, '')));
      n++;
      // 예제가 대는 클립 이름을 다 뽑아 본다.
      const used = [...src.matchAll(/clipId: '([a-z0-9-]+)'/g)].map((m) => m[1]);
      const stray2 = used.filter((id) => !shipped.has(id));
      if (stray2.length) g.fail('demo/clips', `최소 예제가 안 따라오는 클립을 쓴다: ${[...new Set(stray2)].join(' · ')}`);
      n++;
      const listed = /const SHIPPED = \[([^\]]*)\]/.exec(src);
      const inList = listed ? [...listed[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]) : [];
      const strayList = inList.filter((id) => !shipped.has(id));
      if (!inList.length || strayList.length) {
        g.fail('demo/list', `예제의 SHIPPED 가 ${inList.join(' · ') || '없다'} — 저장소에 두는 것과 갈렸다`);
      }
      n++;
      // **문 하나만 쓴다** — 안쪽 파일을 직접 가져가면 내부를 고칠 때 깨진다.
      const deep = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1])
        .filter((x) => /^\.\.?\//.test(x) || /src\/(lib|web)\//.test(x));
      if (deep.length) g.fail('demo/door', `최소 예제가 안쪽 파일을 직접 가져간다: ${deep.join(' · ')}`);
      n++;
      if (!/from 'peoplemaker'/.test(src)) g.fail('demo/name', "예제가 'peoplemaker' 라는 이름으로 안 가져온다 — 베끼는 쪽과 다른 코드가 된다");
      n++;
      // 먼 몸으로 받는가 — 몸째를 받으면 4.2MB 를 헛되이 받는다.
      if (!/body: 'far'/.test(src)) g.fail('demo/far', "예제가 body: 'far' 를 안 쓴다");
      console.log(`  [배포] 최소 예제: 클립 ${inList.join('·')} · 문 하나만 쓴다 · 먼 몸으로 받는다`);
    }
  }

  // ── 6. .gitignore 와 SHIP_FILES 가 같은 말을 하는가 ──
  {
    const one = personPacks[0].id;
    for (const rel of SHIP_FILES) {
      n++;
      const r = spawnSync('git', ['check-ignore', '-q', `packs/${one}/${rel}`], { cwd: ROOT });
      if (r.status === 0) g.fail(`ignore/${rel}`, '.gitignore 가 무시한다 — SHIP_FILES 와 갈렸다');
    }
    // 안 둘 것은 정말 무시되는가.
    for (const rel of ['body.glb', 'sources.json', 'clips/sit.glb', 'thumbs/idle.svg']) {
      n++;
      const r = spawnSync('git', ['check-ignore', '-q', `packs/${one}/${rel}`], { cwd: ROOT });
      if (r.status !== 0) g.fail(`ignore/keep/${rel}`, '.gitignore 가 안 무시한다 — 저장소가 무거워진다');
    }
  }

  return n;
});
