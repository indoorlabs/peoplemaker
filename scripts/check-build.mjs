// check:build — 잰 값이 파일을 따라가는가.
//
// 계약의 요점은 "길이·이동·속도·접촉을 사람이 적지 않는다" 이다. 그런데 재는
// 코드가 **아무 값이나 그럴듯하게** 내놓으면 계약이 없는 것과 같다. 그래서
// 여기서는 값이 맞는지가 아니라 **입력을 흔들면 출력이 따라 움직이는지**를
// 묻는다 (urbanspace 에서 "범위 안인가" 만 물었다가 네 번 뚫린 자리다).
//
// 흔들 수 있는 이유는 기준 클립을 **함수가** 만들기 때문이다 — 속도 1.35 로
// 만들었으면 재서 1.35 가 나와야 하고, 두 배로 만들면 두 배가 나와야 한다.

import fs from 'node:fs';
import path from 'node:path';
import { runGate, ROOT } from './gate-lib.mjs';
import { parseGLB } from '../src/lib/gltf.mjs';
import { deriveClip, TRAVEL_MIN_MPS, PLANT_MAX_Y_M, MEASURED_FIELDS } from '../src/lib/packBuild.mjs';
import { FIXTURES, buildGLB } from './make-fixture-pack.mjs';

/** 사양 하나를 만들어 바로 재 본다 — 파일을 안 거친다. */
function roundTrip(spec, decl = {}) {
  const doc = parseGLB(buildGLB(spec));
  return deriveClip(doc, { id: spec.id, name: { ko: 'x', en: 'x' }, license: 'CC0-1.0', source: { tool: 't' }, ...decl }).clip;
}

runGate('check-build', (g) => {
  let n = 0;

  // ── 1. 만든 값을 되찾는가 ──
  for (const spec of FIXTURES) {
    const clip = roundTrip(spec);
    n++;
    if (Math.abs(clip.durationS - spec.durationS) > 0.01) {
      g.fail(`rt/${spec.id}/duration`, `길이 ${spec.durationS}s 로 만들었는데 ${clip.durationS}s 로 잰다`);
    }
    n++;
    const wantTravel = spec.speedMps >= TRAVEL_MIN_MPS;
    if ((clip.rootMotion === 'travel') !== wantTravel) {
      g.fail(`rt/${spec.id}/rootMotion`, `속도 ${spec.speedMps} 인데 ${clip.rootMotion} 로 잰다`);
    }
    n++;
    if (wantTravel && Math.abs(clip.speedMps - spec.speedMps) > 0.02) {
      g.fail(`rt/${spec.id}/speed`, `속도 ${spec.speedMps} 로 만들었는데 ${clip.speedMps} 로 잰다`);
    }
  }

  // ── 2. 흔들면 따라오는가 ──
  //
  // 이것이 없으면 "속도를 늘 1.35 로 돌려주는" 코드도 위 검사를 통과한다.
  {
    const base = FIXTURES.find((f) => f.id === 'walk-forward');
    n++;
    const twice = roundTrip({ ...base, speedMps: base.speedMps * 2 });
    if (Math.abs(twice.speedMps - base.speedMps * 2) > 0.03) {
      g.fail('shake/speed', `속도를 두 배로 만들었는데 ${twice.speedMps} 다 (${base.speedMps * 2} 여야)`);
    }
    n++;
    const longer = roundTrip({ ...base, durationS: base.durationS * 3 });
    if (Math.abs(longer.durationS - base.durationS * 3) > 0.02) {
      g.fail('shake/duration', `길이를 세 배로 만들었는데 ${longer.durationS}s 다`);
    }
    n++;
    // 길이를 늘리되 속도를 그대로 두면 **속도는 안 변해야** 한다. 거리로
    // 갈랐다가 앉기가 이동으로 나온 자리가 여기다 — 거리는 길이를 모른다.
    if (Math.abs(longer.speedMps - base.speedMps) > 0.03) {
      g.fail('shake/speed-invariant', `길이만 바꿨는데 속도가 ${base.speedMps} → ${longer.speedMps} 로 변했다`);
    }
    n++;
    // 걸음을 두 주기로 만들면 발이 두 배로 닿는다.
    const one = roundTrip(base);
    const two = roundTrip({ ...base, cycles: 2, durationS: base.durationS * 2 });
    if (!(two.contacts.length >= one.contacts.length * 2 - 1)) {
      g.fail('shake/contacts', `주기를 둘로 했는데 접촉이 ${one.contacts.length} → ${two.contacts.length} 다`);
    }
    n++;
    if (!one.contacts.length) g.fail('shake/contacts-none', '걷는 클립인데 접촉이 하나도 안 잡힌다');
    n++;
    // 가만히 선 클립에는 **닿는 순간**이 없다. 발이 내내 땅에 있기 때문이다.
    const idle = roundTrip(FIXTURES.find((f) => f.id === 'idle'));
    if (idle.contacts.length) {
      g.fail('shake/contacts-idle', `가만히 선 클립에 접촉이 ${idle.contacts.length}회 잡힌다 — 닿아 있는 상태를 사건으로 세고 있다`);
    }
  }

  // ── 3. 접촉이 클립 안에 있는가, 두 발이 갈리는가 ──
  {
    const walk = roundTrip(FIXTURES.find((f) => f.id === 'walk-forward'));
    for (const c of walk.contacts) {
      n++;
      if (!(c.atS >= 0 && c.atS <= walk.durationS)) g.fail('contact/range', `${c.atS}s 가 길이 밖이다`);
      n++;
      if (c.kind !== 'plant') g.fail('contact/kind', `발 접촉인데 종류가 ${c.kind} 다`);
    }
    n++;
    const parts = new Set(walk.contacts.map((c) => c.part));
    if (parts.size !== 2) {
      g.fail('contact/feet', `한 걸음 주기에 잡힌 발이 ${[...parts].join('·') || '없음'} 이다 — 좌우 둘이어야 한다`);
    }
    n++;
    // 시각 순으로 정렬돼 있어야 한다 — 쓰는 쪽이 앞에서부터 훑는다.
    const sorted = [...walk.contacts].sort((a, b) => a.atS - b.atS);
    if (JSON.stringify(sorted) !== JSON.stringify(walk.contacts)) g.fail('contact/order', '접촉이 시각 순이 아니다');
  }

  // ── 4. 사람이 잰 값을 적으면 막는가 ──
  //
  // 두 벌이 되는 것을 막는 것이 이 검사다. 조용히 덮으면 "내가 적은 값이 왜
  // 안 들어갔지" 가 되고, 조용히 두면 파일과 어긋난다.
  for (const field of MEASURED_FIELDS) {
    n++;
    let threw = false;
    try { roundTrip(FIXTURES[0], { [field]: 1 }); } catch { threw = true; }
    if (!threw) g.fail(`handwritten/${field}`, `sources.json 에 ${field} 를 적어도 막지 않는다`);
  }

  // ── 5. 깨진 파일에 조용하지 않은가 ──
  {
    const glb = buildGLB(FIXTURES[0]);
    n++;
    let threw = false;
    try { parseGLB(glb.slice(0, glb.byteLength - 40)); } catch { threw = true; }
    if (!threw) g.fail('broken/truncated', '자른 GLB 를 조용히 읽는다 — 뒤쪽 접근자가 쓰레기를 준다');
    n++;
    threw = false;
    try { parseGLB(new Uint8Array(8)); } catch { threw = true; }
    if (!threw) g.fail('broken/short', '8바이트짜리를 GLB 로 읽는다');
    n++;
    // **머리말 길이가 실제와 다른 파일.**
    //
    // 자른 파일은 덩어리 경계 검사가 대신 잡아서, 머리말 길이 검사가 놀고
    // 있었다 — 일부러 그 줄을 지워도 게이트가 안 걸렸다. 뒤에 무언가 덧붙은
    // 파일은 경계 검사로는 못 잡는다: 덩어리는 멀쩡하고 뒤에 쓰레기만 붙어
    // 있기 때문이다. 그러면 모르는 데이터를 실은 채 그냥 읽는다.
    threw = false;
    const padded = new Uint8Array(glb.byteLength + 16);
    padded.set(glb);
    try { parseGLB(padded); } catch { threw = true; }
    if (!threw) g.fail('broken/appended', '뒤에 16바이트가 덧붙은 GLB 를 조용히 읽는다 — 머리말 길이를 안 보고 있다');
  }

  // ── 6. 구워 둔 팩이 지금 코드와 같은가 ──
  //
  // 재는 방법을 고치고 다시 안 구우면, 저장소의 카탈로그가 코드가 내는 값과
  // 달라진다. 그 어긋남은 아무 데서도 안 보인다 — 여기서 본다.
  {
    const dir = path.join(ROOT, 'packs');
    const packs = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'catalog.json')))
      : [];
    for (const p of packs) {
      const cat = JSON.parse(fs.readFileSync(path.join(dir, p, 'catalog.json'), 'utf8'));
      const src = JSON.parse(fs.readFileSync(path.join(dir, p, 'sources.json'), 'utf8'));
      for (const decl of src.clips || []) {
        const file = path.join(dir, p, 'clips', `${decl.id}.glb`);
        if (!fs.existsSync(file)) continue;   // GLB 는 저장소에 안 둘 수 있다 (.gitignore)
        n++;
        const fresh = deriveClip(parseGLB(fs.readFileSync(file)), decl, { skeleton: src.skeleton }).clip;
        const baked = (cat.clips || []).find((c) => c.id === decl.id);
        if (!baked) { g.fail(`stale/${p}/${decl.id}`, '카탈로그에 없다 — 다시 구울 것'); continue; }
        for (const f of MEASURED_FIELDS) {
          if (JSON.stringify(baked[f]) !== JSON.stringify(fresh[f])) {
            g.fail(`stale/${p}/${decl.id}/${f}`,
              `구운 값 ${JSON.stringify(baked[f])} 과 지금 재는 값 ${JSON.stringify(fresh[f])} 이 다르다 — build-pack 을 다시 돌릴 것`);
          }
        }
      }
      console.log(`  [팩] ${p}: 클립 ${(cat.clips || []).length}개가 지금 코드와 같은 값인지 확인했다`);
    }
  }

  console.log(`  [재기] 이동 문턱 ${TRAVEL_MIN_MPS}m/s · 접촉 문턱 ${PLANT_MAX_Y_M}m`);
  return n;
});
