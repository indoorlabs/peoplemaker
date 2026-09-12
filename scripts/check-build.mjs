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
import {
  deriveClip, TRAVEL_MIN_MPS, PLANT_MAX_Y_M, MEASURED_FIELDS,
  packForwardRad, angleDiff, FORWARD_AGREE_RAD,
  plantEvents, PLANT_MIN_DWELL_S, SEATED_HIP_RATIO_MAX, SEAT_FEET_FORWARD_MIN,
} from '../src/lib/packBuild.mjs';
import { FIXTURES, CROUCH, buildGLB } from '../src/lib/fixtureRig.mjs';
import { readAccessor, parentMap } from '../src/lib/gltf.mjs';

/**
 * 이 클립을 틀면 **뼈 길이가 그대로인가.**
 *
 * Biped 동작은 회전만이 아니라 뼈마다 자리(translation)도 싣는다. 그래서 어른
 * 동작을 어린이 몸에 그냥 접붙이면 뼈 길이가 어른 것으로 덮여 **아이가 어른
 * 크기로 늘어난다** — 키 1.433m 가 1.740m 가 됐다 (+21.4%). 화면에서는 그냥
 * 걷는 사람이라 아무도 못 알아챈다.
 *
 * 재는 법을 두 번 고쳤다:
 *
 * 1. **살의 경계상자**로 쟀더니 손 흔들기가 8%, 앉기가 −19% 로 걸렸다 —
 *    그것은 몸 크기가 아니라 **자세**의 크기다.
 * 2. 뼈 길이를 FK 로 풀어 쟀더니 맞기는 한데 게이트가 3분 늘었다.
 *    `sampleAnimation` 이 시각 하나를 뽑으려고 클립을 통째로 푼다 (회전
 *    트랙까지 전부).
 *
 * 지금은 **이동 트랙만** 본다. 뼈 길이를 바꿀 수 있는 것은 그것뿐이고,
 * 회전 트랙은 안 풀어도 된다. 뼈가 부모에게서 얼마나 떨어져 있는지를
 * 쉬는 자세(node.translation)와 견준다.
 *
 * 뿌리의 이동(root motion)은 뼈 하나뿐이므로 **전체 뼈 중 몇 퍼센트가**
 * 달라졌는지로 본다 — 크기가 덮이면 거의 전부가 함께 달라진다.
 */
function boneLengthReport(doc) {
  const anim = doc.json.animations?.[0];
  if (!anim?.channels?.length) return null;
  const nodes = doc.json.nodes || [];
  const bones = new Set(anim.channels.map((ch) => ch.target?.node).filter((i) => i != null));
  if (bones.size < 4) return null;

  // **뿌리는 안 센다.** 몸 전체의 이동이 실리는 뼈라 길이가 달라지는 것이
  // 당연하고, 뼈가 적은 리그에서는 그 하나가 20% 가 된다 (기준 팩이 뼈 5개라
  // 문턱에 딱 걸렸다). 부모가 뼈가 아닌 노드를 뿌리로 본다.
  const parent = parentMap(doc);
  const ratios = [];
  for (const ch of anim.channels) {
    if (ch.target?.path !== 'translation') continue;
    if (!bones.has(parent.get(ch.target.node))) continue;
    const rest = nodes[ch.target.node]?.translation;
    const restLen = rest ? Math.hypot(rest[0], rest[1], rest[2]) : 0;
    // 원점에 있는 뼈(뿌리)는 길이가 0 이라 비율을 못 낸다 — 그런 뼈는 건너뛴다.
    if (!(restLen > 1e-3)) continue;
    const out = readAccessor(doc, anim.samplers[ch.sampler].output);
    const keys = out.length / 3;
    let worst = 1;
    for (const k of [0, Math.floor(keys / 2), keys - 1]) {
      const len = Math.hypot(out[k * 3], out[k * 3 + 1], out[k * 3 + 2]);
      const r = len / restLen;
      if (Math.abs(r - 1) > Math.abs(worst - 1)) worst = r;
    }
    ratios.push(worst);
  }
  if (!ratios.length) return { changed: 0, median: 1, bones: bones.size, translated: 0 };
  const changed = ratios.filter((r) => Math.abs(r - 1) > 0.03).length / bones.size;
  const sorted = [...ratios].sort((a, b) => a - b);
  return { changed, median: sorted[Math.floor(sorted.length / 2)], bones: bones.size, translated: ratios.length };
}

/** 이만큼 넘는 뼈가 길이를 바꾸면 그 클립은 그 몸의 것이 아니다. */
const SIZE_TOLERANCE = 0.2;

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
      let worst = null;
      for (const decl of src.clips || []) {
        const file = path.join(dir, p, 'clips', `${decl.id}.glb`);
        if (!fs.existsSync(file)) continue;   // GLB 는 저장소에 안 둘 수 있다 (.gitignore)
        n++;
        const clipDoc = parseGLB(fs.readFileSync(file));

        // ── 클립이 **이 몸의 것인가** (뼈 길이가 그대로인가) ──
        n++;
        const size = boneLengthReport(clipDoc);
        if (size) {
          if (!worst || size.changed > worst.changed) worst = { ...size, id: decl.id };
          if (size.changed > SIZE_TOLERANCE) {
            g.fail(`size/${p}/${decl.id}`,
              `뼈 ${(size.changed * 100).toFixed(0)}% 의 길이가 달라진다 (가운데 값 ${size.median.toFixed(3)}배) — 다른 몸의 동작을 그냥 접붙인 것이다 (옮겨 붙일 것)`);
          }
        }

        const fresh = deriveClip(clipDoc, decl, { skeleton: src.skeleton }).clip;

        // **적힌 것과 잰 것이 맞는가.** 사람이 "앉기" 라고 적은 클립에 앉은
        // 값이 없으면, 그 클립은 앉아 있지 않은 것이다 — 어린이에게 어른
        // 의자 동작을 옮겨 붙이다 사람이 공중에 앉은 적이 있다.
        n++;
        if ((decl.tags || []).includes('seated') && !fresh.seat) {
          g.fail(`seated/${p}/${decl.id}`,
            '앉기라고 적혀 있는데 엉덩이가 안 내려간다 — 옮겨 붙이기가 자세를 못 살린 것이다');
        }
        const baked = (cat.clips || []).find((c) => c.id === decl.id);
        if (!baked) { g.fail(`stale/${p}/${decl.id}`, '카탈로그에 없다 — 다시 구울 것'); continue; }
        for (const f of MEASURED_FIELDS) {
          if (JSON.stringify(baked[f]) !== JSON.stringify(fresh[f])) {
            g.fail(`stale/${p}/${decl.id}/${f}`,
              `구운 값 ${JSON.stringify(baked[f])} 과 지금 재는 값 ${JSON.stringify(fresh[f])} 이 다르다 — build-pack 을 다시 돌릴 것`);
          }
        }
      }
      const seated = (cat.clips || []).filter((c) => c.seat);
      console.log(`  [팩] ${p}: 클립 ${(cat.clips || []).length}개가 지금 코드와 같은 값인지 확인했다`
        + (worst ? ` · 뼈 길이가 달라진 비율 최대 ${(worst.changed * 100).toFixed(0)}% (${worst.id})` : '')
        + (seated.length ? ` · 앉은 클립 ${seated.map((c) => `${c.id} ${c.seat.hipHeightM}m`).join('·')}` : ''));
    }
  }

  // ── 앉은 높이를 **재는가** ──
  //
  // "앉았다고 적혀 있는가" 로는 모자란다 — 상수를 박아도 통과한다. 픽스처의
  // 앉는 깊이를 흔들어 놓고, 잰 값이 **따라오는지**를 본다. 엉덩이는 쉬는
  // 자세에서 0.90m 이므로, 0.5 만큼 내려가면 0.40m 에 앉는 것이다.
  {
    const sitSpec = FIXTURES.find((f) => f.kind === 'sit');
    for (const drop of [0.5, 0.35, 0.6]) {
      n++;
      const clip = roundTrip({ ...sitSpec, id: `sit${drop}`, seatDropM: drop });
      const want = 0.90 - drop;
      if (!clip.seat) { g.fail(`seat/${drop}/none`, `${want.toFixed(2)}m 에 앉는 클립인데 앉은 값이 없다`); continue; }
      n++;
      if (Math.abs(clip.seat.hipHeightM - want) > 0.02) {
        g.fail(`seat/${drop}`, `${want.toFixed(2)}m 에 앉혔는데 ${clip.seat.hipHeightM}m 로 잰다`);
      }
    }
    n++;
    // 선 클립·걷는 클립에는 앉은 값이 없어야 한다 — 걸을 때도 엉덩이는 내려간다.
    for (const id of ['idle', 'walk-forward']) {
      const spec = FIXTURES.find((f) => f.id === id);
      const clip = roundTrip(spec);
      if (clip.seat) g.fail(`seat/standing/${id}`, `서 있는 클립에 앉은 값이 붙었다 (${clip.seat.hipHeightM}m)`);
    }
    n++;
    // 살짝 내려앉은 것은 앉은 것이 아니다 — 문턱이 있는지 본다.
    const shallow = roundTrip({ ...sitSpec, id: 'shallow', seatDropM: 0.1 });
    if (shallow.seat) g.fail('seat/shallow', `10cm 만 내려갔는데 앉았다고 한다 (문턱 ${SEATED_HIP_RATIO_MAX})`);
    const deep = roundTrip({ ...sitSpec, id: 'deep', seatDropM: 0.5 });
    n++;
    // **쪼그린 사람은 앉은 것이 아니다.** 엉덩이 높이는 앉은 것과 같고,
    // 다른 것은 발이다 — 앉으면 앞으로 나가고 쪼그리면 몸 아래 있다.
    const crouch = roundTrip(CROUCH);
    if (crouch.seat) {
      g.fail('seat/crouch', `쪼그린 자세에 앉은 값이 붙었다 (엉덩이 ${crouch.seat.hipHeightM}m · 발 ${crouch.seat.feetForwardM}m 앞)`);
    }
    n++;
    if (!(deep.seat?.feetForwardM >= SEAT_FEET_FORWARD_MIN)) {
      g.fail('seat/forward', `앉은 클립인데 발이 ${deep.seat?.feetForwardM}m 밖에 안 나갔다`);
    }
    n++;
    // 둘의 엉덩이 높이가 같아야 이 검사가 뜻이 있다 — 높이로는 못 가른다는 것.
    const crouchY = roundTrip({ ...CROUCH, id: 'crouchY' });
    if (Math.abs((crouchY.seat?.hipHeightM ?? 0.4) - deep.seat.hipHeightM) > 0.05) {
      g.setupFail('쪼그리기와 앉기의 엉덩이 높이가 달라 이 검사가 뜻을 잃는다');
    }
    console.log(`  [재기] 앉은 높이: 0.5m 내려가면 ${deep.seat?.hipHeightM}m (발 ${deep.seat?.feetForwardM}m 앞) · `
      + `0.1m 내려가면 ${shallow.seat ? shallow.seat.hipHeightM + 'm' : '앉은 것으로 안 센다'} · `
      + `쪼그리기는 같은 높이(0.40m)인데 ${crouch.seat ? '앉았다고 한다' : '안 센다'}`);
  }

  // ── 뼈 길이 검사가 **진짜로 잡는가** ──
  //
  // 위에서 팩을 다 훑어도 "달라진 뼈가 없다" 만 나오면, 그 검사가 눈을 감고
  // 있는 것인지 알 수 없다. 그래서 멀쩡한 클립의 이동 트랙을 1.25배로 늘려
  // 놓고 — 어른 동작을 아이에게 접붙였을 때 일어나는 바로 그 일이다 —
  // 걸리는지 본다.
  {
    const dir = path.join(ROOT, 'packs');
    const packs = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    let victim = null;
    for (const p of packs) {
      const clips = path.join(dir, p, 'clips');
      if (!fs.existsSync(clips)) continue;
      for (const f of fs.readdirSync(clips)) {
        if (!f.endsWith('.glb')) continue;
        const doc = parseGLB(fs.readFileSync(path.join(clips, f)));
        const r = boneLengthReport(doc);
        // 뼈마다 자리를 싣는 클립이라야 이 검사가 뜻이 있다.
        if (r && r.translated >= 4) { victim = { file: path.join(clips, f), where: `${p}/${f}` }; break; }
      }
      if (victim) break;
    }
    if (!victim) {
      console.log('  [재기] 뼈마다 자리를 싣는 클립이 없어 크기 검사를 흔들어 보지 못했다 (Rocketbox 팩이 없다)');
    } else {
      n++;
      const before = boneLengthReport(parseGLB(fs.readFileSync(victim.file)));
      if (before.changed > SIZE_TOLERANCE) {
        g.fail('size/self/clean', `멀쩡한 클립(${victim.where})이 이미 걸린다 — 검사가 너무 빡빡하다`);
      }
      n++;
      // 이동 트랙을 늘린다 — 접근자 바이트를 그 자리에서 고친다.
      const doc = parseGLB(fs.readFileSync(victim.file));
      const anim = doc.json.animations[0];
      for (const ch of anim.channels) {
        if (ch.target?.path !== 'translation') continue;
        const acc = doc.json.accessors[anim.samplers[ch.sampler].output];
        const bv = doc.json.bufferViews[acc.bufferView];
        const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const dv = new DataView(doc.bin.buffer, doc.bin.byteOffset, doc.bin.byteLength);
        for (let i = 0; i < acc.count * 3; i++) {
          const o = base + i * 4;
          dv.setFloat32(o, dv.getFloat32(o, true) * 1.25, true);
        }
      }
      const after = boneLengthReport(doc);
      if (!(after.changed > SIZE_TOLERANCE)) {
        g.fail('size/self/stretched', `이동을 1.25배로 늘렸는데 달라진 뼈가 ${(after.changed * 100).toFixed(0)}% 뿐이다 — 검사가 눈을 감고 있다`);
      }
      console.log(`  [재기] 크기 검사: ${victim.where} 를 1.25배로 늘리니 달라진 뼈 ${(before.changed * 100).toFixed(0)}% → ${(after.changed * 100).toFixed(0)}% (가운데 값 ${after.median.toFixed(2)}배)`);
    }
  }

  // ── 진행 방향을 **재는가** ──
  //
  // "값이 있는가" 로는 모자란다 — 상수를 박아도 통과한다. 클립을 여러
  // 방향으로 만들어 놓고, 잰 값이 **따라오는지**를 본다.
  {
    for (const deg of [180, 0, 90, -45]) {
      n++;
      const want = (deg * Math.PI) / 180;
      const clip = roundTrip({ id: `dir${deg}`, durationS: 1.2, speedMps: 1.35, cycles: 1, kind: 'walk', travelRad: want });
      if (clip.rootMotion !== 'travel') { g.fail(`dir/${deg}/kind`, `${deg}° 클립이 이동으로 안 잡힌다`); continue; }
      n++;
      if (angleDiff(clip.travelHeadingRad, want) > 0.02) {
        g.fail(`dir/${deg}`,
          `${deg}° 로 만든 클립을 ${((clip.travelHeadingRad * 180) / Math.PI).toFixed(1)}° 로 잰다`);
      }
      n++;
      // 방향이 달라도 **속도는 같아야** 한다 — 한쪽 축만 보고 재면 여기서 터진다.
      if (Math.abs(clip.speedMps - 1.35) > 0.02) {
        g.fail(`dir/${deg}/speed`, `방향을 바꿨더니 속도가 ${clip.speedMps} 로 나온다`);
      }
    }

    // 팩의 앞 — 갈리면 조용히 평균 내지 말고 멈춰야 한다.
    const mk = (id, rad) => ({ id, rootMotion: 'travel', travelHeadingRad: rad });
    n++;
    if (packForwardRad([mk('a', Math.PI), mk('b', Math.PI + 0.05)]) === null) {
      g.fail('forward/agree', '방향이 같은 클립들인데 앞을 못 정한다');
    }
    n++;
    let threw = false;
    try { packForwardRad([mk('a', Math.PI), mk('b', Math.PI / 2)]); } catch { threw = true; }
    if (!threw) g.fail('forward/disagree', '옆걸음이 섞였는데 조용히 하나를 고른다');
    n++;
    // 문턱 바로 안쪽은 통과해야 한다 — 아무 차이나 막으면 손으로 만든
    // 클립의 흔들림에 매번 걸린다.
    if (packForwardRad([mk('a', 0), mk('b', FORWARD_AGREE_RAD * 0.9)]) === null) {
      g.fail('forward/tolerance', '문턱 안쪽인데 막는다');
    }
    n++;
    if (packForwardRad([{ id: 'x', rootMotion: 'in-place' }]) !== null) {
      g.fail('forward/none', '이동 클립이 없는데 앞을 지어낸다');
    }
    console.log('  [재기] 네 방향으로 만든 클립의 진행 방향을 되찾고, 갈릴 때 멈추는지 확인했다');
  }

  // ── 디딤 판정 — 문턱을 지나는 것이 아니라 **머무는 것** ──
  //
  // 진짜 클립(Rocketbox)은 저장소에 안 올라가므로 CI 가 못 본다. 그래서 규칙
  // 자체를 합성 곡선으로 본다. 곡선은 한 주기 1.2s, 120 표본.
  {
    const T = 1.2;
    const N = 120;
    const curve = (fn) => Array.from({ length: N }, (_, i) => fn((T * i) / N));
    // 휘두르는 발이 도중에 한 번 내려왔다 올라간다 (Rocketbox 에서 본 모양):
    //   0.00~0.10 골짜기(0.03m)  0.10~0.40 들림  0.40~1.10 디딤  1.10~ 들림
    const doubleHump = curve((t) => (t < 0.10 ? 0.03 : t < 0.40 ? 0.10 : t < 1.10 ? 0.005 : 0.10));
    n++;
    const ev = plantEvents(doubleHump, T);
    if (ev.length !== 1) g.fail('plant/dip', `짧은 골짜기(0.1s)를 디딤으로 센다 — ${ev.length}회 (${ev.join(', ')}s)`);
    n++;
    if (ev.length && Math.abs(ev[0] - 0.4) > 0.02) g.fail('plant/at', `디딤 시각이 ${ev[0]}s 다 — 0.40s 여야`);

    // 주기 끝에서 시작해 처음으로 이어지는 디딤은 **한 번**이다.
    const wrap = curve((t) => (t < 0.30 ? 0.005 : t < 0.90 ? 0.10 : 0.005));
    n++;
    const ew = plantEvents(wrap, T);
    if (ew.length !== 1) g.fail('plant/wrap', `끝을 넘어 이어진 디딤을 ${ew.length}번으로 쪼갠다`);
    n++;
    if (ew.length && Math.abs(ew[0] - 0.9) > 0.02) g.fail('plant/wrap-at', `이어진 디딤의 시작이 ${ew[0]}s 다 — 0.90s 여야`);

    // 늘 땅에 있는 발은 사건이 없다 (서 있기).
    n++;
    if (plantEvents(curve(() => 0.01), T).length) g.fail('plant/standing', '서 있는 발에서 디딤을 지어낸다');

    // **문턱 바로 위아래** — 규칙이 머문 시간을 정말 보는지. 머문 시간을
    // 문턱보다 조금 길게/짧게 해서 결과가 뒤집히는지 본다.
    const dwell = (d) => curve((t) => (t >= 0.5 && t < 0.5 + d ? 0.005 : 0.10));
    n++;
    if (plantEvents(dwell(PLANT_MIN_DWELL_S * 1.25), T).length !== 1) g.fail('plant/just-long', '문턱보다 조금 긴 디딤을 놓친다');
    n++;
    if (plantEvents(dwell(PLANT_MIN_DWELL_S * 0.75), T).length !== 0) g.fail('plant/just-short', '문턱보다 조금 짧은 골짜기를 센다');
    console.log(`  [재기] 디딤은 ${PLANT_MIN_DWELL_S}s 이상 머물러야 센다 — 골짜기·감긴 디딤·서 있기를 합성 곡선으로 봤다`);
  }

  console.log(`  [재기] 이동 문턱 ${TRAVEL_MIN_MPS}m/s · 접촉 문턱 ${PLANT_MAX_Y_M}m`);
  return n;
});
