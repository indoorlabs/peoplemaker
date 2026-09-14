// 게이트 공통 — 기준선 래칫과 보고.
//
// indoorlabs/urbanspace 의 scripts/gate-lib.mjs 를 그대로 가져왔다. 같은
// 사람이 같은 규약으로 쓰는 저장소라 두 벌을 만들 이유가 없다 — 한쪽에서
// 배운 것(비동기 게이트를 안 기다리면 늘 통과한다 같은 것)이 여기서도
// 그대로 지켜져야 한다.
//
// 게이트를 처음 켜면 대개 수백 건이 실패하고, 1일차에 실패하는 게이트는 꺼진다.
// 그래서 알려진 결함을 JSON 에 적어 두고 새로 생기거나 나빠진 것만 빌드를 막는다.
//   node scripts/check-x.mjs            새 결함이 있으면 exit 1
//   node scripts/check-x.mjs --update   기준선 재잠금

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
const BASELINE_DIR = path.join(here, 'baselines');

/**
 * **굽는 데 필요한 것이 다 있는 팩** — 몸과 사람이 적은 것까지.
 *
 * 저장소에는 팩의 **먼 층만** 들어 있다 (열둘에 4.2MB). 몸째·텍스처·클립
 * 31개는 따로 배포한다. 그래서 새로 받은 사람에게는 굽거나 재는 게이트가
 * 볼 것이 없다 — 그때 **터지지 말고 건너뛰어야** 한다.
 *
 * 새로 받아 `npm run check` 를 돌려 보고 알았다: 스물셋 중 일곱이 터지거나
 * 엉뚱한 결함을 냈다. 이 저장소가 "게이트가 기본" 이라고 적어 두고 정작
 * **이 기계에서만** 참이었던 것이다.
 */
export function fullPacks(root = ROOT) {
  const dir = path.join(root, 'packs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((id) => (
    fs.existsSync(path.join(dir, id, 'catalog.json'))
    && fs.existsSync(path.join(dir, id, 'sources.json'))
    && fs.existsSync(path.join(dir, id, 'body.glb'))
  ));
}

/** 팩을 어떻게 받는지 — 건너뛸 때 함께 적는다. */
export const HOW_TO_GET_PACKS = 'node scripts/fetch-packs.mjs <packs.json 주소> --tier all --clips all';

export function runGate(name, collect) {
  const update = process.argv.includes('--update');
  const setupErrors = [];
  const findings = [];
  let skipped = null;

  // 게이트는 자기 셋업부터 검사한다 — 평면 게이트 1일차 320건 중 절반이
  // 게이트 자신의 버그였다. 셋업 결함은 조용한 남 탓이 아니라 크게 실패한다.
  const api = {
    fail: (id, msg) => findings.push({ id, msg }),
    setupFail: (msg) => setupErrors.push(msg),
    /**
     * **볼 것이 없어서 못 본다** — 실패도 통과도 아니다.
     *
     * 조용히 통과시키면 게이트가 눈을 감는 가장 흔한 길이 되고, 실패로 두면
     * 새로 받은 사람이 첫 명령에서 빨간 글을 본다. 그래서 셋째 자리를 두고
     * **수로 센다** (스물셋 중 몇 개가 건너뛰었는지 요약에 나온다).
     */
    skip: (why) => { skipped = why; },
  };

  let counted = 0;
  try {
    counted = collect(api) ?? 0;
  } catch (e) {
    console.error(`\n[${name}] 게이트가 던졌다: ${e.stack || e.message}`);
    process.exit(2);
  }

  // **비동기 게이트를 기다린다.**
  //
  // 여기가 동기뿐이던 때에는 게이트가 프로미스를 돌려주면 그것을 세는 수로
  // 쓰고 그대로 지나갔다 — 결함을 담기 **전에** 결함을 세는 셈이라, 그 게이트는
  // 늘 "알려진 결함 0" 으로 통과한다. 통과한 척만 하는 게이트가 이 저장소에서
  // 가장 나쁜 것이다. 프로세스를 띄워 보는 게이트(check-mcp)를 만들다 밟았다.
  //
  // 동기 게이트는 아무것도 안 달라진다 — 아래 finish 를 그대로 부른다.
  if (counted && typeof counted.then === 'function') {
    return counted.then((c) => finish(c ?? 0)).catch((e) => {
      console.error(`\n[${name}] 게이트가 던졌다: ${e.stack || e.message}`);
      process.exit(2);
    });
  }
  return finish(counted);

  function finish(counted) {
  if (skipped) {
    console.log(`[${name}] 건너뜀 — ${skipped}`);
    process.exit(3);
  }
  if (setupErrors.length) {
    console.error(`\n[${name}] SETUP 결함 ${setupErrors.length}건 — 게이트가 불가능한 것을 시켰다:`);
    for (const m of setupErrors) console.error(`  · ${m}`);
    process.exit(2);
  }

  const file = path.join(BASELINE_DIR, `${name}.json`);
  const ids = findings.map((f) => f.id).sort();

  if (update) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ name, count: ids.length, ids }, null, 2) + '\n');
    console.log(`[${name}] 기준선 재잠금 — ${ids.length}건 (검사 ${counted})`);
    return;
  }

  const baseline = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).ids : [];
  const known = new Set(baseline);
  const fresh = findings.filter((f) => !known.has(f.id));
  const fixed = baseline.filter((id) => !ids.includes(id));

  if (fresh.length) {
    console.error(`\n[${name}] 새 결함 ${fresh.length}건 (검사 ${counted}, 기준선 ${baseline.length}):`);
    for (const f of fresh.slice(0, 40)) console.error(`  · ${f.id} — ${f.msg}`);
    if (fresh.length > 40) console.error(`  … 외 ${fresh.length - 40}건`);
    process.exit(1);
  }

  if (fixed.length) {
    console.error(`\n[${name}] ${fixed.length}건이 고쳐졌다. 기준선을 다시 잠글 것:`);
    console.error(`  node scripts/${name}.mjs --update`);
    process.exit(1);
  }

  console.log(`[${name}] ok — 검사 ${counted}, 알려진 결함 ${findings.length}`);
  }
}
