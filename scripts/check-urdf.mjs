// check:urdf — **로봇 팩이 URDF 와 맞는가.**
//
// 사람 팩은 살을 재서 값을 낸다. 로봇 팩은 다르다 — 값의 원문이 **URDF** 라는
// 글로 따로 있다 (관절이 어디 있고 어느 축으로 얼마나 도는지). 그러니 잰 값을
// glTF 가 아니라 **URDF 로 다시 계산해** 견줄 수 있고, 그래야 한다. 같은 코드로
// 두 번 재면 같은 실수를 두 번 한다 — 여기서는 glTF 를 안 열고 URDF 의 관절
// 사슬만으로 순운동학을 돌린다.
//
// 보는 것:
//   1. 손 뻗기 — 카탈로그가 잰 손 높이·앞 거리를 URDF 순운동학이 1cm 안에서 되찾는가
//   2. 눈높이 — 머리 카메라(d435) 높이를 되찾는가
//   3. 걷기 — 만든 속도를 잰 속도가 되찾는가 · 발이 디디는가 · 앞을 보는가
//   4. **관절 한계** — 함수가 만든 각이 URDF 의 limit 을 한 번도 안 넘는가.
//      사람 클립을 로봇에 안 씌우는 까닭이 이것이다. 우리 것도 넘으면 같은 거짓이다.
//   5. 몸의 표기 — 클립은 CC0 인데 몸은 BSD-3 인 팩이 표기를 요구하는가
//
// 새로 받은 쪽에서도 돈다: 카탈로그 · URDF · body-far.glb 는 저장소에 있다.

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import {
  parseURDF, robotRig, withSoles, fk, poseAt, standingRootY, ROBOT_CLIPS, G1,
} from '../src/lib/urdfRig.mjs';
import { parseGLB, findNode } from '../src/lib/gltf.mjs';
import { LICENSES, validateCatalog } from '../src/lib/motionPack.mjs';
import { attributionNeeds, attributionProblems } from '../src/lib/attribution.mjs';

const PACK = 'unitree-g1';

runGate('check-urdf', (g) => {
  let n = 0;
  const dir = path.join(ROOT, 'packs', PACK);
  n++;
  if (!fs.existsSync(path.join(dir, 'catalog.json'))) { g.setupFail(`${PACK} 이 없다`); return n; }
  const cat = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
  const urdfFile = path.join(dir, cat.bodySource?.file || '');
  n++;
  if (!cat.bodySource?.file || !fs.existsSync(urdfFile)) { g.fail('urdf/file', `몸의 원문(URDF)이 팩에 없다 — ${cat.bodySource?.file}`); return n; }

  // ── 리그 — URDF 에서. 발바닥은 먼 몸의 뼈대에서 읽는다 (살은 저장소에 없다) ──
  const urdf = parseURDF(fs.readFileSync(urdfFile, 'utf8'));
  const rig = robotRig(urdf, { root: G1.root });
  n++;
  const revolute = urdf.joints.filter((j) => j.type === 'revolute').length;
  if (revolute !== 29) g.fail('urdf/joints', `회전 관절이 ${revolute}개다 — G1 은 29 (다리 6×2 · 허리 3 · 팔 7×2)`);
  const far = parseGLB(fs.readFileSync(path.join(dir, 'body-far.glb')));
  const soleOf = (ankle) => {
    const name = ankle === G1.ankleRoll.L ? G1.sole.L : G1.sole.R;
    const i = findNode(far, name);
    if (i == null) throw new Error(`먼 몸에 ${name} 노드가 없다`);
    return far.json.nodes[i].translation;
  };
  withSoles(rig, [[G1.ankleRoll.L, G1.sole.L], [G1.ankleRoll.R, G1.sole.R]], soleOf);

  n++;
  // 선 자세의 골반 높이 — URDF 로 계산한 것과 glTF 에 구워진 것이 같은가.
  const y0 = standingRootY(rig);
  const rootBaked = far.json.nodes[findNode(far, G1.root)].translation[1];
  if (Math.abs(y0 - rootBaked) > 1e-4) g.fail('stand/root', `골반 높이가 URDF 로는 ${y0.toFixed(4)} 인데 구운 몸은 ${rootBaked.toFixed(4)} 다`);
  n++;
  const rest = fk(rig, {}, [0, y0, 0]);
  const soleY = [G1.sole.L, G1.sole.R].map((s) => rest.pos[rig.idx.get(s)][1]);
  if (soleY.some((y) => Math.abs(y) > 1e-3)) g.fail('stand/sole', `선 자세에서 발바닥이 땅에서 ${soleY.map((y) => (y * 1000).toFixed(1)).join('·')}mm 떠 있다`);

  // ── 1. 손 뻗기 ──
  const reach = cat.clips.find((c) => c.id === 'reach');
  n++;
  if (!reach?.reach) g.fail('reach/none', '손 뻗기 클립에 잰 값(reach)이 없다');
  else {
    const spec = ROBOT_CLIPS.find((c) => c.id === 'reach');
    const hand = rig.idx.get(reach.reach.part === 'hand-l' ? G1.hand.L : G1.hand.R);
    // 카탈로그의 높이·앞 거리는 **손이 가장 멀리 간 자리**의 값이다 (atS 는
    // 그 자리에 닿기 시작한 시각). 처음에 atS 에 FK 를 돌려 13cm 가 어긋났다 —
    // 팔을 올리는 도중이었다. 그래서 클립을 훑어 가장 멀리 간 프레임을 찾는다.
    let best = null;
    for (let t = 0; t <= spec.durationS + 1e-9; t += 1 / 60) {
      const { angles, root } = poseAt(spec, Math.min(t, spec.durationS), rig);
      const p = fk(rig, angles, root).pos[hand];
      const fwd = p[2] - root[2];
      if (!best || fwd > best.fwd) best = { t, y: p[1], fwd };
    }
    n++;
    if (Math.abs(best.y - reach.reach.heightM) > 0.01) {
      g.fail('reach/height', `손 높이가 카탈로그 ${reach.reach.heightM}m · URDF 순운동학 ${best.y.toFixed(3)}m — 1cm 넘게 다르다`);
    }
    n++;
    if (Math.abs(best.fwd - reach.reach.forwardM) > 0.01) {
      g.fail('reach/forward', `손 앞 거리가 카탈로그 ${reach.reach.forwardM}m · URDF 순운동학 ${best.fwd.toFixed(3)}m`);
    }
    n++;
    // 닿기 시작한 시각은 가장 멀리 간 시각보다 앞이어야 한다.
    if (!(reach.reach.atS <= best.t + 1e-6)) g.fail('reach/onset', `닿기 시작(${reach.reach.atS}s)이 가장 멀리 간 시각(${best.t.toFixed(2)}s)보다 뒤다`);
    console.log(`  [URDF] 손 뻗기: 카탈로그 높이 ${reach.reach.heightM} · 앞 ${reach.reach.forwardM} (닿기 ${reach.reach.atS}s) ↔ URDF 순운동학 가장 멀리 ${best.t.toFixed(2)}s 에 높이 ${best.y.toFixed(3)} · 앞 ${best.fwd.toFixed(3)}`);
  }

  // ── 2. 눈높이 (머리 카메라) ──
  n++;
  const eyeIdx = rig.idx.get(G1.eye);
  if (eyeIdx == null) g.fail('eye/node', `${G1.eye} 링크가 URDF 에 없다`);
  else if (cat.bodyDims?.eyeHeightM == null) g.fail('eye/catalog', '카탈로그에 눈높이가 없다 — d435 를 눈으로 삼기로 했다');
  else {
    const spec = ROBOT_CLIPS.find((c) => c.id === 'idle');
    const { angles, root } = poseAt(spec, 0, rig);
    const y = fk(rig, angles, root).pos[eyeIdx][1];
    n++;
    if (Math.abs(y - cat.bodyDims.eyeHeightM) > 0.001) g.fail('eye/height', `눈높이가 카탈로그 ${cat.bodyDims.eyeHeightM} · URDF ${y.toFixed(4)}`);
    console.log(`  [URDF] 눈(d435) 높이 ${y.toFixed(3)}m · 키 ${cat.bodyDims.heightM}m · 폭 ${cat.bodyDims.widthM}m (살을 재서)`);
  }

  // ── 3. 걷기 ──
  {
    const walk = cat.clips.find((c) => c.id === 'walk-forward');
    const spec = ROBOT_CLIPS.find((c) => c.id === 'walk-forward');
    n++;
    if (!walk) g.fail('walk/none', '걷는 클립이 없다');
    else {
      n++;
      if (Math.abs(walk.speedMps - spec.speedMps) > 0.01) g.fail('walk/speed', `만든 속도 ${spec.speedMps} 를 잰 속도 ${walk.speedMps} 가 못 되찾는다`);
      n++;
      const plants = (walk.contacts || []).filter((c) => c.kind === 'plant').length;
      if (plants < 2) g.fail('walk/plant', `한 주기에 디딤이 ${plants}회다 — 발바닥 노드가 문턱을 못 넘는다`);
      n++;
      if (Math.abs(walk.travelHeadingRad) > 0.05) g.fail('walk/heading', `앞이 ${walk.travelHeadingRad}rad 다 — URDF 의 +x 는 glTF 의 +Z 여야 한다 (0)`);
      console.log(`  [URDF] 걷기 ${spec.speedMps}m/s 로 만들어 ${walk.speedMps}m/s 로 잰다 · 디딤 ${plants}회/주기 · 앞 ${walk.travelHeadingRad}rad`);
    }
  }

  // ── 4. 관절 한계 ──
  //
  // **여기가 이 게이트의 요점이다.** 사람 동작을 로봇에 씌우지 않는 까닭이
  // 관절 한계다. 우리가 함수로 만든 것도 한계를 넘으면 같은 거짓이다.
  {
    let worst = { over: 0 };
    let samples = 0;
    for (const spec of ROBOT_CLIPS) {
      for (let t = 0; t <= spec.durationS + 1e-9; t += 1 / 60) {
        const { angles } = poseAt(spec, Math.min(t, spec.durationS), rig);
        for (const [name, th] of Object.entries(angles)) {
          samples++;
          const lim = rig.nodes[rig.idx.get(name)]?.limit;
          if (!lim) continue;
          const over = Math.max(lim.lower - th, th - lim.upper, 0);
          if (over > worst.over) worst = { over, name, th, lim, clip: spec.id, t };
        }
      }
    }
    n++;
    if (worst.over > 1e-6) {
      g.fail('limit/over', `${worst.clip} ${worst.t.toFixed(2)}s 에 ${worst.name} 가 ${worst.th.toFixed(3)}rad — 한계 [${worst.lim.lower}, ${worst.lim.upper}] 를 ${worst.over.toFixed(3)}rad 넘는다`);
    }
    console.log(`  [URDF] 관절 각 ${samples}개를 봤다 — 한계를 넘은 것 ${worst.over > 1e-6 ? 1 : 0}`);
  }

  // ── 5. 몸의 표기 ──
  {
    n++;
    if (!LICENSES['BSD-3-Clause']?.attribution) g.fail('license/bsd3', 'BSD-3 가 표기를 요구하지 않는 것으로 돼 있다');
    n++;
    if (cat.bodySource?.license !== 'BSD-3-Clause') g.fail('body/license', `몸의 라이선스가 ${cat.bodySource?.license} 다`);
    n++;
    // 클립은 전부 CC0 — 그래도 몸 때문에 표기가 필요해야 한다.
    const needs = attributionNeeds(cat);
    if (!needs.some((x) => x.body && x.license === 'BSD-3-Clause')) g.fail('body/needs', '몸이 BSD-3 인데 표기 요구가 안 나온다 — 클립만 보고 있다');
    n++;
    if (attributionProblems(cat).length) g.fail('body/problems', attributionProblems(cat).map((p) => p.key).join(' · '));
    n++;
    // 몸의 출처를 떼면 **두 군데서** 잡혀야 한다: 계약(bodySource 없이 origin 만 남음 → unused) 과 표기.
    const noBody = { ...cat };
    delete noBody.bodySource;
    if (!attributionProblems(noBody).some((p) => /unused/.test(p.key))) g.fail('body/drop', '몸의 출처를 떼도 남은 출처 선언이 쓰이지 않는다고 안 말한다');
    n++;
    if (validateCatalog({ ...cat, origins: [] }).some((e) => e.id === 'catalog/bodySource/origin') === false) {
      g.fail('body/no-origin', '몸이 BSD-3 인데 출처 선언을 지워도 계약이 안 막는다');
    }
    const notice = cat.origins?.find((o) => o.license === 'BSD-3-Clause')?.noticeFile;
    n++;
    if (!notice || !fs.existsSync(path.join(ROOT, notice))) g.fail('body/notice', `고지문 파일이 없다 — ${notice}`);
    console.log(`  [URDF] 몸 ${cat.bodySource.tool} (${cat.bodySource.license}) · 클립 ${cat.clips.length}개는 ${[...new Set(cat.clips.map((c) => c.license))].join('·')} — 표기는 몸 때문에 필요하다`);
  }

  return n;
});
