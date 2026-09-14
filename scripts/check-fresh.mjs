// check:fresh — **새로 받은 사람에게도 게이트가 도는가.**
//
// 이 저장소는 "게이트가 기본" 을 규약으로 삼는다. 그런데 팩은 대부분 저장소에
// 없다 (먼 층만 4.2MB). 그래서 새로 받은 쪽에서 `npm run check` 를 돌리면
// 어떻게 되는지 **한 번도 확인하지 않았다.**
//
// 해 보니 스물셋 중 일곱이 터지거나 엉뚱한 결함을 냈다:
//
//   · 팩을 다 돌면서 없는 body.glb 를 열다 **터진다** (다섯)
//   · 나뉜 팩의 클립을 몸 대신 집어 방향이 68° 어긋난 것처럼 나온다 (하나)
//   · 팩이 둘 미만이라 SETUP 결함 (하나)
//
// **게이트가 이 기계에서만 참이었던 것이다.** 고친 뒤에는 전부 돌되, 볼 것이
// 없는 자리는 건너뛰고 그 사실을 찍는다.
//
// 이 게이트는 그 성질을 지킨다: **저장소에 있는 파일만으로 게이트를 돌려 본다.**

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runGate, ROOT, fullPacks, HOW_TO_GET_PACKS } from './gate-lib.mjs';

/** 새로 받은 쪽에서도 **반드시** 돌아야 하는 게이트 — 팩이 없어도 볼 것이 있다. */
const MUST_RUN = [
  'check-activity', 'check-anthropometry', 'check-attribution', 'check-cast',
  'check-crowd', 'check-occupancy', 'check-profile', 'check-purity',
  'check-routine', 'check-scenario', 'check-surface',
];

runGate('check-fresh', (g) => {
  let n = 0;

  // **자기 자신 안에서 또 돌지 않는다.** 이 게이트는 저장소를 통째로 베껴
  // 게이트를 다 돌리는데, 그 안에 이 게이트도 들어 있다 — 처음에 막지 않아
  // 스스로를 계속 불러 461초가 걸리고 출력이 터졌다.
  if (process.env.PM_FRESH) {
    g.skip('새 클론 안에서는 이 게이트를 다시 안 돈다 (스스로를 부르게 된다)');
    return n;
  }

  const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const tracked = git('ls-files').stdout?.trim().split('\n').filter(Boolean) || [];
  n++;
  if (tracked.length < 50) { g.setupFail(`git 이 파일을 ${tracked.length}개만 들고 있다`); return n; }

  // ── 저장소에 있는 것만 옮겨 놓는다 ──
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fresh-'));
  try {
    for (const rel of tracked) {
      const src = path.join(ROOT, rel);
      if (!fs.existsSync(src)) continue;
      const dst = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    // three 는 devDependency 라 저장소에 없다 — 있는 것을 빌려 준다
    // (새로 받은 쪽은 `npm i` 로 받는다).
    const nm = path.join(tmp, 'node_modules');
    try { fs.symlinkSync(path.join(ROOT, 'node_modules'), nm, 'junction'); }
    catch { fs.cpSync(path.join(ROOT, 'node_modules'), nm, { recursive: true }); }
    // 진짜 클론처럼 git 저장소로 만든다 (git 에게 묻는 게이트가 있다).
    for (const a of [['init', '-q'], ['add', '-A'], ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'fresh']]) {
      spawnSync('git', a, { cwd: tmp });
    }

    n++;
    // 새로 받은 쪽에는 **기준 팩 하나만** 온전하다.
    const have = fullPacks(tmp);
    if (have.length !== 1 || have[0] !== 'ref-synthetic') {
      g.fail('packs', `새로 받으면 온전한 팩이 ${have.join(' · ') || '없다'} — 기준 팩 하나여야 한다`);
    }

    // ── 게이트를 돌려 본다 ──
    const r = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'check.mjs')], {
      cwd: tmp, encoding: 'utf8', env: { ...process.env, PM_FRESH: '1' },
    });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    n++;
    if (r.status !== 0) {
      const bad = out.split('\n').filter((l) => /던졌다|SETUP|새 결함/.test(l)).slice(0, 4);
      g.fail('run', `새로 받은 쪽에서 게이트가 실패한다 — ${bad.join(' / ') || `exit ${r.status}`}`);
    }
    n++;
    // **터지면 안 된다.** 터진 게이트는 아무것도 안 본 것이고, 새로 받은
    // 사람에게는 그것이 첫인상이다.
    const threw = out.split('\n').filter((l) => /게이트가 던졌다/.test(l));
    if (threw.length) g.fail('throw', `${threw.length}개가 터진다: ${threw.slice(0, 2).join(' / ')}`);

    // ── 얼마나 적게 보는가 ──
    const counts = [...out.matchAll(/검사 (\d+), 알려진/g)].map((m) => +m[1]);
    const freshChecks = counts.reduce((a, b) => a + b, 0);
    n++;
    if (!(counts.length >= 20)) g.fail('gates', `새로 받은 쪽에서 게이트가 ${counts.length}개만 돌았다`);
    n++;
    // 절반은 넘어야 한다 — 그보다 적으면 "게이트가 기본" 이 빈말이 된다.
    if (!(freshChecks > 1500)) g.fail('coverage', `새로 받으면 검사가 ${freshChecks}개뿐이다 — 절반도 못 본다`);

    n++;
    // 건너뛴 자리는 **무엇을 하면 되는지** 말해야 한다.
    const notes = out.split('\n').filter((l) => /건너뛴다|건너뜀/.test(l));
    // **몇 군데가 말해야 하는지를 적어 둔다.** "하나라도 말하면 된다" 로
    // 두었더니, 한 군데가 조용해져도 다른 데가 말해서 통과했다 — 일부러
    // 입을 막아 보고 알았다.
    // 배포(목록·받기) · 옮김(진짜 몸) · 섬네일(자세 가르기) · 잡기(드는 클립)
    const WANT_SKIPS = 4;
    // **이 게이트 자신의 건너뜀은 빼고 센다** — 팩이 없어서가 아니라 스스로를
    // 부르지 않으려고 건너뛰는 것이라, 받는 법을 적을 것도 없다.
    const packNotes = notes.filter((l) => !/check-fresh/.test(l));
    if (packNotes.length !== WANT_SKIPS) {
      g.fail('quiet', `팩이 없을 때 건너뛴다고 말하는 자리가 ${packNotes.length}군데다 — 적어 둔 것은 ${WANT_SKIPS} (조용히 덜 보거나, 볼 수 있게 됐으면 여기를 고칠 것)`);
    }
    if (packNotes.length && !packNotes.every((l) => l.includes('fetch-packs'))) {
      g.fail('how', '건너뛴다면서 어떻게 받는지를 안 알려 준다');
    }

    console.log(
      `  [새 클론] 파일 ${tracked.length}개 · 온전한 팩 ${have.join('·')} · `
      + `게이트 ${counts.length}개가 돌아 검사 ${freshChecks}개 (이 기계에서는 더 본다) · 건너뛴 자리 ${notes.length}군데`,
    );
    for (const l of notes.slice(0, 5)) console.log(`  [새 클론] ${l.trim().replace(HOW_TO_GET_PACKS, '…')}`);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 지우다 실패해도 게이트는 끝났다 */ }
  }

  void MUST_RUN;
  return n;
});
