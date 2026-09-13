// 클립을 **가볍게** — 안 변하는 트랙을 접는다.
//
// 클립이 배포에서 가장 무겁다 (팩 하나에 17MB · 열둘에 205MB). 무엇이 그
// 무게를 먹는지 재 보니:
//
//   회전 58% (10.0MB) · 이동 34% (6.0MB) · 시각 0% · 나머지 8%
//   **그런데 이동의 절반(3.2MB)이 처음부터 끝까지 같은 값이다.**
//
// 바이페드 동작은 뼈마다 자리(translation)를 싣는데, 걷는 동안 뼈 길이는 안
// 변한다 — 76프레임 내내 똑같은 수가 76번 적혀 있다. 회전에도 그런 것이
// 1.1MB 있다 (한 번도 안 돌아가는 손가락 같은 것).
//
// ## 지어내지 않는다
//
// 값이 **정말 같을 때만** 접는다. 그리고 접은 뒤에도 트랙을 없애지 않고
// **키 두 개**(처음과 끝)로 남긴다:
//
//   · 트랙을 지우면 그 뼈가 쉬는 자세로 돌아간다 — 상수 값이 쉬는 자세와
//     다르면 자세가 바뀐다 (그것이 조용한 거짓이다)
//   · 키가 둘이면 LINEAR 로 어디를 찍어도 같은 값이다 — **손실이 0이다**
//
// 얼마나 같아야 같은 것으로 볼지(eps)는 부르는 쪽이 정하고, **그때 생기는
// 최대 오차를 함께 낸다** — 값을 재서 고르라는 뜻이다.
//
// 이 파일에는 three.js 도 DOM 도 fs 도 없다. 값과 규칙만 있다.

/**
 * 얼마나 같아야 같은 것으로 볼 것인가 — **재서 골랐다.**
 *
 * 여자 01 의 클립 31개(17.0MB)를 여러 eps 로 접어 보았다:
 *
 * ```
 *   eps     줄어듦    회전 오차     이동 오차
 *   0        2.1%    3.4e-6°      0
 *   1e-7     6.3%    1.0e-5°      0
 *   1e-6    24.4%    1.0e-5°      0.00085mm   ← 무릎
 *   1e-5    26.2%    1.0e-5°      0.0097mm
 *   1e-4    26.9%    1.7e-2°      0.040mm
 * ```
 *
 * 1e-6 이 무릎이다. 그 뒤로는 **1.8% 를 더 얻자고 오차를 11배**로 키운다.
 * 0.00085mm 는 이 저장소가 재는 어떤 값보다도 작다 — 살 줄이기의 벗어남이
 * 17.3mm 이고, 디딤을 가르는 문턱이 60mm 다.
 *
 * eps=0 의 3.4e-6° 는 오차가 아니라 float32 로 적힌 사원수를 다시 읽을 때의
 * 잡음이다 (값은 비트까지 같다).
 */
export const CLIP_EPS = 1e-6;

/**
 * 사원수 두 개가 얼마나 벌어졌는가 (도) — 접은 오차를 사람이 읽는 단위로.
 *
 * **길이로 나눈다.** 처음에 안 나눴더니 eps=0(값이 비트까지 같을 때)에서도
 * 0.037° 가 나왔다 — 파일의 사원수가 단위 길이가 아니라 제 자신과의 내적이
 * 1보다 작았던 것이다. 오차가 아니라 **재는 쪽의 잘못**이었다.
 */
export function quatAngleDeg(a, b) {
  const la = Math.hypot(a[0], a[1], a[2], a[3]);
  const lb = Math.hypot(b[0], b[1], b[2], b[3]);
  if (!(la > 0) || !(lb > 0)) return 0;
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) / (la * lb);
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
}

/**
 * 채널 하나가 처음부터 끝까지 같은 값인가 — 아니면 null, 맞으면 그 값.
 *
 * @returns { values, maxErr } · maxErr 는 접을 때 생기는 최대 어긋남
 */
export function constantOf(values, per, eps) {
  if (values.length <= per) return null;
  const first = Array.from(values.slice(0, per));
  let maxErr = 0;
  for (let i = per; i < values.length; i += per) {
    for (let c = 0; c < per; c++) {
      const d = Math.abs(values[i + c] - first[c]);
      if (d > eps) return null;
      if (d > maxErr) maxErr = d;
    }
  }
  return { values: first, maxErr };
}

/**
 * 안 변하는 트랙을 키 두 개로 접는다.
 *
 * @param channels extractAnimation 이 낸 채널들
 * @returns { channels, report }
 *   report.folded      접은 트랙 수
 *   report.keysBefore/After  키 수
 *   report.maxRotDeg   접으면서 생긴 최대 회전 오차 (도)
 *   report.maxPosM     최대 이동 오차 (m)
 */
export function compactChannels(channels, { eps = CLIP_EPS } = {}) {
  const out = [];
  const report = {
    tracks: channels.length, folded: 0, keysBefore: 0, keysAfter: 0, maxRotDeg: 0, maxPosM: 0,
  };
  for (const ch of channels) {
    const keys = ch.times.length;
    report.keysBefore += keys;
    const per = ch.values.length / keys;
    // 세 점 보간(CUBICSPLINE)은 키마다 값이 셋이라 이 방법이 안 맞는다 —
    // 건드리지 않는다.
    const hit = ch.interpolation === 'LINEAR' && keys > 2 ? constantOf(ch.values, per, eps) : null;
    if (!hit) { out.push(ch); report.keysAfter += keys; continue; }

    // **오차를 사람이 읽는 단위로 잰다.**
    if (ch.path === 'rotation' && per === 4) {
      const first = hit.values;
      for (let i = 4; i < ch.values.length; i += 4) {
        const d = quatAngleDeg(first, [ch.values[i], ch.values[i + 1], ch.values[i + 2], ch.values[i + 3]]);
        if (d > report.maxRotDeg) report.maxRotDeg = d;
      }
    } else if (ch.path === 'translation') {
      if (hit.maxErr > report.maxPosM) report.maxPosM = hit.maxErr;
    }

    const times = Float32Array.from([ch.times[0], ch.times[keys - 1]]);
    const values = new Float32Array(per * 2);
    values.set(hit.values, 0);
    values.set(hit.values, per);
    out.push({ ...ch, times, values });
    report.folded++;
    report.keysAfter += 2;
  }
  return { channels: out, report };
}

/** 접기 전후를 사람이 읽는 한 줄로. */
export function compactReport(r, { bytesBefore = null, bytesAfter = null } = {}) {
  const bits = [
    `트랙 ${r.tracks} 중 ${r.folded}개를 접었다`,
    `키 ${r.keysBefore} → ${r.keysAfter}`,
  ];
  if (bytesBefore && bytesAfter) {
    bits.push(`${(bytesBefore / 1024).toFixed(0)}KB → ${(bytesAfter / 1024).toFixed(0)}KB (${(100 * (1 - bytesAfter / bytesBefore)).toFixed(0)}% 줄었다)`);
  }
  bits.push(`오차 회전 ${r.maxRotDeg.toExponential(1)}° · 이동 ${(r.maxPosM * 1000).toExponential(1)}mm`);
  return bits.join(' · ');
}
