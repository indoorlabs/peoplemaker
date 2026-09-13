// 클립 대조표 — 팩 열셋의 동작을 **한 장에** 놓는다.
//
//   node scripts/build-sheet.mjs [나갈 파일]        (기본 demo/clips.html)
//
// 섬네일을 굽고 나서도 그것을 한 번에 볼 길이 없었다. 파일 353개를 하나씩
// 열어 볼 수는 없다 — 그러면 굽지 않은 것과 같다.
//
// 섬네일을 **파일로 가리키지 않고 안에 박는다.** 한 파일만 열면 되고, 팩을
// 옮기거나 zip 으로 보내도 그림이 안 깨진다 (1.7MB 쯤 된다).
//
// 그림 옆에는 **잰 값**을 적는다 — 길이·속도·앉은 높이·손이 닿는 높이.
// 그것이 이 저장소가 그 클립에 대해 아는 전부이고, 그림은 그 값이 맞는지
// 눈으로 보게 하는 것이다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'demo', 'clips.html'));

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 이 클립에 대해 **잰** 것 — 지어낸 것은 여기 없다. */
function facts(c) {
  const f = [`${c.durationS.toFixed(1)}s`];
  if (c.rootMotion === 'travel' && c.speedMps) f.push(`${c.speedMps} m/s`);
  if (c.contacts?.length) f.push(`디딤 ${c.contacts.length}`);
  if (c.seat) f.push(`앉음 ${c.seat.hipHeightM}m`);
  if (c.reach) f.push(`손 ${c.reach.heightM}m`);
  if ((c.tags || []).includes('retargeted')) f.push('옮김');
  return f;
}

const packs = [];
for (const id of fs.readdirSync(path.join(ROOT, 'packs'))) {
  const f = path.join(ROOT, 'packs', id, 'catalog.json');
  if (!fs.existsSync(f)) continue;
  packs.push({ id, cat: JSON.parse(fs.readFileSync(f, 'utf8')) });
}
packs.sort((a, b) => (a.id < b.id ? -1 : 1));

const rows = [];
let thumbs = 0;
let noThumb = 0;
for (const { id, cat } of packs) {
  const p = cat.person;
  const d = cat.bodyDims;
  const head = p
    ? `${p.ageBand} · ${p.sex} · ${p.attire}${d ? ` · 키 ${d.heightM}m · 폭 ${d.maxWidthM}m` : ''}`
    : '사람이 아닌 팩 (검사용)';
  const cells = [];
  for (const c of cat.clips) {
    const file = c.thumb ? path.join(ROOT, 'packs', id, c.thumb) : null;
    let svg = '';
    if (file && fs.existsSync(file)) { svg = fs.readFileSync(file, 'utf8'); thumbs++; } else { noThumb++; }
    cells.push(
      `<figure class="c"${(c.tags || []).includes('distress') ? ' data-distress="1"' : ''}>`
      + `<div class="t">${svg || '<div class="none">섬네일 없음</div>'}</div>`
      + `<figcaption><b>${esc(c.id)}</b><span>${esc(facts(c).join(' · '))}</span>`
      + `<em>${esc(c.name?.ko || '')}</em></figcaption></figure>`,
    );
  }
  rows.push(
    `<section><h2>${esc(id)} <small>${esc(head)} · 클립 ${cat.clips.length}</small></h2>`
    + `<div class="grid">${cells.join('')}</div></section>`,
  );
}

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>PeopleMaker — 클립 대조표</title>
<style>
 :root { color-scheme: light dark; --ink:#1c2430; --dim:#6b7684; --line:#e3e7ec; --bg:#fbfcfd; }
 @media (prefers-color-scheme: dark) { :root { --ink:#e8ecf1; --dim:#96a1b0; --line:#2a323c; --bg:#161a1f; } }
 body { margin:0; padding:24px; background:var(--bg); color:var(--ink);
        font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
 h1 { font-size:20px; margin:0 0 4px; }
 .lede { color:var(--dim); margin:0 0 24px; max-width:62ch; }
 h2 { font-size:15px; margin:28px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--line); }
 h2 small { font-weight:400; color:var(--dim); margin-left:8px; }
 .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(96px,1fr)); gap:12px; }
 .c { margin:0; }
 .t { background:color-mix(in srgb, var(--ink) 5%, transparent); border-radius:6px;
      display:flex; align-items:center; justify-content:center; padding:4px 0; min-height:150px; }
 .t svg { max-width:100%; height:auto; color:var(--ink); }
 .t path { fill:currentColor; }
 .t text { fill:currentColor; }
 .none { color:var(--dim); font-size:11px; }
 figcaption { display:flex; flex-direction:column; gap:1px; margin-top:5px; font-size:11px; }
 figcaption b { font-weight:600; }
 figcaption span, figcaption em { color:var(--dim); font-style:normal; }
 [data-distress] .t { outline:1px solid color-mix(in srgb, #c4462f 45%, transparent); }
 footer { margin-top:32px; padding-top:12px; border-top:1px solid var(--line); color:var(--dim); }
</style></head><body>
<h1>PeopleMaker — 클립 대조표</h1>
<p class="lede">섬네일은 <b>그린 그림이 아니라 잰 그림</b>이다. 구운 자세에 살을 붙여
그 점들이 차지한 칸을 찍은 것이라, 조명도 재질도 지어낸 선도 없다. 프레임 셋을
옅은 것부터 짙은 것까지 겹쳐 움직임을 보인다. 붉은 테두리는 비상시 동작이다.</p>
${rows.join('\n')}
<footer>팩 ${packs.length} · 클립 ${packs.reduce((s, p) => s + p.cat.clips.length, 0)} ·
섬네일 ${thumbs}${noThumb ? ` (없는 것 ${noThumb})` : ''} ·
<code>node scripts/build-sheet.mjs</code> 로 다시 만든다</footer>
</body></html>`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(
  `${path.relative(ROOT, out)} · 팩 ${packs.length} · 클립 ${packs.reduce((s, p) => s + p.cat.clips.length, 0)}`
  + ` · 섬네일 ${thumbs}${noThumb ? ` (없는 것 ${noThumb})` : ''} · ${Math.round(fs.statSync(out).size / 1024)}KB`,
);
