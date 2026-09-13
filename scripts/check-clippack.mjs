// check:clippack — 클립을 접어도 **아무것도 안 달라지는가.**
//
// 클립이 배포에서 가장 무겁다 (열셋에 212MB). 이동 트랙의 절반이 처음부터
// 끝까지 같은 값이라 — 바이페드 동작이 뼈마다 자리를 싣는데 뼈 길이는 안
// 변한다 — 그것을 키 두 개로 접으면 24.8% 가 준다.
//
// 이 작업이 조용히 거짓말하는 길이 셋이다:
//   1. 안 변하는 줄 알았는데 변한다 → 그 뼈가 한 자세로 굳는다
//   2. 트랙을 아예 지운다 → 그 뼈가 쉬는 자세로 돌아간다 (상수 값과 다르면
//      자세가 바뀐다)
//   3. 접은 값이 원래와 미묘하게 다르다 → 잰 값(속도·디딤·앉은 높이)이 바뀐다
//
// 셋째가 가장 무섭다. 그래서 **진짜 클립을 접어 보고 다시 재서** 견준다 —
// 카탈로그가 한 글자라도 달라지면 막는다.

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import {
  compactChannels, constantOf, quatAngleDeg, compactReport, CLIP_EPS,
} from '../src/lib/clipPack.mjs';
import { parseGLB } from '../src/lib/gltf.mjs';
import { extractAnimation, motionOnly, encodeGLB } from '../src/lib/gltfWrite.mjs';
import { deriveClip } from '../src/lib/packBuild.mjs';

const PACK = 'rocketbox-f01';

runGate('check-clippack', (g) => {
  let n = 0;

  // ── 1. 상수 찾기가 말이 되는가 ──
  {
    n++;
    if (constantOf(Float32Array.from([1, 2, 3, 1, 2, 3, 1, 2, 3]), 3, 0) === null) {
      g.fail('const/same', '똑같은 값 셋인데 상수가 아니라고 한다');
    }
    n++;
    if (constantOf(Float32Array.from([1, 2, 3, 1, 2, 4]), 3, 0) !== null) {
      g.fail('const/diff', '값이 변하는데 상수라고 한다');
    }
    n++;
    // eps 안이면 상수로 보되 **얼마나 어긋났는지 말해야** 한다.
    const near = constantOf(Float32Array.from([1, 1, 1.0000005]), 1, 1e-6);
    if (!near || !(near.maxErr > 0)) g.fail('const/err', 'eps 안에서 접으면서 어긋남을 안 낸다');
    n++;
    if (constantOf(Float32Array.from([1, 1, 1.1]), 1, 1e-6) !== null) g.fail('const/eps', 'eps 밖인데 접는다');
    n++;
    // 키가 하나뿐이면 접을 것이 없다.
    if (constantOf(Float32Array.from([1, 2, 3]), 3, 0) !== null) g.fail('const/one', '키가 하나인데 접는다');
  }

  // ── 2. 사원수 오차 재기 ──
  //
  // 처음에 길이로 안 나눠서, **비트까지 같은 값에서도 0.037°** 가 나왔다 —
  // 파일의 사원수가 단위 길이가 아니었다. 오차가 아니라 재는 쪽의 잘못이다.
  {
    n++;
    if (quatAngleDeg([0, 0, 0, 1], [0, 0, 0, 1]) !== 0) g.fail('quat/same', '같은 사원수인데 벌어졌다고 한다');
    n++;
    // 길이가 1 이 아닌 같은 사원수 — 여기서 0 이 나와야 한다.
    const q = [0.1, 0.2, 0.3, 0.9];   // 길이 ≈ 0.995
    if (quatAngleDeg(q, q) > 1e-9) g.fail('quat/norm', `단위 길이가 아닌 같은 사원수가 ${quatAngleDeg(q, q)}° 로 벌어졌다고 한다`);
    n++;
    // 90° 돈 것은 90° 로 나와야 한다.
    const a = [0, 0, 0, 1];
    const b = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)];
    if (Math.abs(quatAngleDeg(a, b) - 90) > 1e-6) g.fail('quat/deg', `90° 를 ${quatAngleDeg(a, b)}° 라고 한다`);
  }

  // ── 3. 접어도 값이 같은가 ──
  {
    const times = Float32Array.from([0, 0.1, 0.2, 0.3]);
    const ch = {
      node: 0, nodeName: 'a', path: 'translation', interpolation: 'LINEAR', times,
      values: Float32Array.from([1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3]),
    };
    const moving = {
      ...ch, path: 'rotation', values: Float32Array.from([0, 0, 0, 1, 0, 0.1, 0, 0.99, 0, 0.2, 0, 0.98, 0, 0.3, 0, 0.95]),
    };
    const { channels, report } = compactChannels([ch, moving]);
    n++;
    if (report.folded !== 1) g.fail('fold/count', `접은 것이 ${report.folded}개다 (하나여야)`);
    n++;
    if (channels[0].times.length !== 2) g.fail('fold/keys', `접은 트랙의 키가 ${channels[0].times.length}개다 (둘이어야)`);
    n++;
    // **트랙을 지우지 않는다** — 지우면 그 뼈가 쉬는 자세로 돌아간다.
    if (channels.length !== 2) {
      g.fail('fold/drop', '트랙을 지웠다 — 그 뼈가 쉬는 자세로 돌아간다');
      // 여기서 멈춘다. 안 멈추면 아래가 없는 채널을 읽다 **터지고**, 그러면
      // 뒤 검사가 통째로 가려진다 (일부러 지워 보다 그렇게 됐다).
      return n;
    }
    n++;
    // 처음과 끝 시각이 그대로여야 길이가 안 바뀐다.
    if (channels[0].times[0] !== times[0] || channels[0].times[1] !== times[times.length - 1]) {
      g.fail('fold/time', '접으면서 처음·끝 시각이 달라졌다');
    }
    n++;
    // 두 키의 값이 같아야 LINEAR 로 어디를 찍어도 같다.
    const v = channels[0].values;
    if (!(v[0] === v[3] && v[1] === v[4] && v[2] === v[5])) g.fail('fold/value', '접은 두 키의 값이 다르다 — 사이에서 값이 흔들린다');
    n++;
    if (channels[1].times.length !== times.length) g.fail('fold/moving', '변하는 트랙을 접었다');
    n++;
    // 세 점 보간은 건드리지 않는다 (키마다 값이 셋이라 이 방법이 안 맞는다).
    const cubic = { ...ch, interpolation: 'CUBICSPLINE' };
    if (compactChannels([cubic]).report.folded !== 0) g.fail('fold/cubic', 'CUBICSPLINE 을 접는다');
  }

  // ── 4. eps 를 키우면 더 접히고 오차가 커지는가 ──
  const dir = path.join(ROOT, 'packs', PACK, 'clips');
  n++;
  if (!fs.existsSync(dir)) { g.setupFail(`${PACK} 의 클립이 없다`); return n; }
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).slice(0, 6);
  const at = (eps) => {
    let folded = 0;
    let keys = 0;
    let rot = 0;
    let pos = 0;
    for (const nm of names) {
      const anim = extractAnimation(parseGLB(fs.readFileSync(path.join(dir, nm))));
      const r = compactChannels(anim.channels, { eps }).report;
      folded += r.folded; keys += r.keysAfter;
      rot = Math.max(rot, r.maxRotDeg); pos = Math.max(pos, r.maxPosM);
    }
    return { folded, keys, rot, pos };
  };
  {
    const tight = at(0);
    const loose = at(1e-3);
    n++;
    if (!(loose.folded >= tight.folded)) g.fail('eps/more', `eps 를 키웠는데 접은 것이 ${tight.folded} → ${loose.folded} 다`);
    n++;
    if (!(loose.keys <= tight.keys)) g.fail('eps/keys', 'eps 를 키웠는데 키가 안 줄었다');
    n++;
    if (!(loose.pos >= tight.pos)) g.fail('eps/err', `eps 를 키웠는데 오차가 ${tight.pos} → ${loose.pos} 다 — 공짜로 줄어든 것처럼 보인다`);
  }

  // ── 5. **진짜 클립을 접어 보고 다시 재서 견준다** ──
  //
  // 여기가 이 게이트의 요점이다. 위는 전부 규칙을 본 것이고, 이것만이
  // "잰 값이 안 달라진다" 를 실제로 말한다.
  {
    const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'packs', PACK, 'sources.json'), 'utf8'));

    // **저장소의 클립은 이미 접혀 있다.** 그래서 다시 접어도 안 줄고, "줄었는가"
    // 를 볼 수가 없다 (처음에 그렇게 써서 0.0% 가 나왔다). 일부러 **부풀린**
    // 판을 만들어 그것을 접는다 — 접은 키 둘을 다른 트랙만큼 늘려 놓는다.
    const fatten = (channels) => {
      const longest = channels.reduce((a, c) => (c.times.length > a.length ? c.times : a), channels[0].times);
      return channels.map((ch) => {
        if (ch.times.length >= longest.length) return ch;
        const per = ch.values.length / ch.times.length;
        const values = new Float32Array(per * longest.length);
        for (let k = 0; k < longest.length; k++) values.set(ch.values.slice(0, per), k * per);
        return { ...ch, times: Float32Array.from(longest), values };
      });
    };

    let before = 0;
    let after = 0;
    let checked = 0;
    for (const nm of names) {
      const id = nm.replace(/\.glb$/, '');
      const decl = (sources.clips || []).find((c) => c.id === id);
      if (!decl) continue;
      const doc = parseGLB(fs.readFileSync(path.join(dir, nm)));
      const anim = extractAnimation(doc);
      // 부풀린 판이 '접기 전' 이다.
      const fat = motionOnly(doc, { name: anim.name, channels: fatten(anim.channels) }).doc;
      const buf = encodeGLB(fat);
      const { channels } = compactChannels(extractAnimation(fat).channels, { eps: CLIP_EPS });
      const { doc: out, missing } = motionOnly(doc, { name: anim.name, channels });
      n++;
      if (missing.length) { g.fail(`redo/${id}/bones`, `다시 쓰면서 뼈를 잃었다: ${missing.slice(0, 3).join(', ')}`); continue; }
      const bytes = encodeGLB(out);
      before += buf.length;
      after += bytes.length;

      // **원본과 견준다** — 부풀린 것과가 아니라.
      const a = deriveClip(doc, decl, { skeleton: sources.skeleton }).clip;
      const b = deriveClip(parseGLB(bytes), decl, { skeleton: sources.skeleton }).clip;
      n++;
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        const keys = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
        g.fail(`redo/${id}`, `접었더니 잰 값이 달라졌다 — ${keys.map((k) => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`).join(' · ')}`);
      }
      checked++;
    }
    n++;
    if (checked < 3) g.setupFail(`견준 클립이 ${checked}개다`);
    n++;
    // 정말 줄었는가 — 안 줄면 이 작업을 할 이유가 없다.
    if (!(after < before * 0.95)) g.fail('redo/bytes', `${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB — 5%도 안 줄었다`);

    // ── 6. 이미 접은 것을 또 접어도 안 줄어드는가 (멱등) ──
    const twice = (() => {
      const nm = names[0];
      const doc = parseGLB(fs.readFileSync(path.join(dir, nm)));
      const one = compactChannels(extractAnimation(doc).channels, { eps: CLIP_EPS });
      const redone = motionOnly(doc, { name: 'x', channels: one.channels }).doc;
      return compactChannels(extractAnimation(redone).channels, { eps: CLIP_EPS }).report;
    })();
    n++;
    if (twice.folded !== 0) g.fail('idem', `이미 접은 것을 또 ${twice.folded}개 접는다 — 한 번으로 안 끝난다`);

    console.log(`  [클립] ${PACK} 6개: ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB (${(100 * (1 - after / before)).toFixed(1)}% 줄었다) · 잰 값은 그대로`);
  }

  // ── 7. 저장소의 클립이 이미 접혀 있는가 ──
  //
  // 접어 둔 것이 다시 부풀면(수입 스크립트를 다시 돌렸다든가) 배포가 조용히
  // 무거워진다. 그 사실을 수로 말한다.
  {
    let folded = 0;
    for (const nm of names) {
      const anim = extractAnimation(parseGLB(fs.readFileSync(path.join(dir, nm))));
      folded += compactChannels(anim.channels, { eps: CLIP_EPS }).report.folded;
    }
    n++;
    if (folded > 0) {
      g.fail('stale', `저장소의 클립에 아직 접을 것이 ${folded}개 있다 — node scripts/compact-clips.mjs --all`);
    }
    console.log(`  [클립] 저장소의 클립은 이미 접혀 있다 (더 접을 것 ${folded}개) · eps ${CLIP_EPS}`);
  }

  void compactReport;
  return n;
});
