# PeopleMaker

공간에 **사람**을 넣는다. spacemaker 가 공간을 만들고, 이쪽이 그 안에 살 사람을
만든다.

```
indoorlabs/spacemaker    건물 공간 · BIM · 디지털트윈
indoorlabs/urbanspace    도시 스케일 · 보행 · 교통
indoorlabs/peoplemaker   ← 여기. 위 둘이 함께 쓴다.
```

## 무엇을 하고, 무엇을 하지 않는가

**한다** — 사람의 몸(인체치수·아바타)과 동작(모션 클립)을 만들어 **자산으로
내보낸다**. 텍스트→동작 생성, 영상→모션 캡처, 리타게팅, 라이선스 기록.

**안 한다** — 그 사람을 **어디에 놓을지**는 안 정한다. 배치·동선·활동
스케줄은 공간을 아는 쪽(spacemaker · urbanspace)의 일이다. 여기서 그것까지
하면 두 저장소가 같은 것을 두 벌 갖게 되고, 한쪽만 고쳐진다.

경계는 **계약** 하나다:

```
PeopleMaker  ──[ Motion Asset Pack ]──>  spacemaker / urbanspace
             catalog.json + body.glb + clips/*.glb
             (몸은 한 번 · 동작 파일에는 뼈 움직임만)
```

계약이 지켜지는 한 이 안에서 몸 모델을 바꾸든 생성기를 바꾸든 소비하는 쪽은
안 바뀐다. **그 갈아 끼우기가 이 저장소가 따로 있는 이유다** — 2026년 2월
Epic 이 Meshcapade(SMPL 상업 라이선스 창구)를 인수하면서, 몸 모델 하나가
제품 전체를 물고 갈 수 있다는 것이 분명해졌다.

## 규약

이 저장소는 urbanspace 의 규약을 그대로 쓴다. 요점 셋:

1. **순수 층** — `src/lib/*.mjs` 는 three.js·DOM·PyTorch 를 import 하지
   않는다. 값과 규칙만 있고, 그래서 게이트가 브라우저 없이 검사한다.
2. **값 옆에 손으로 베낀 수를 두지 않는다** — 인체치수든 라이선스든 **출처**가
   함께 있어야 하고, 없으면 게이트가 막는다.
3. **게이트가 기본** — `scripts/check-*.mjs` 를 쓰면 그 순간부터 검사된다
   (등록 단계 없음). 새로 생긴 결함만 빌드를 막는다.

```
npm i                      게이트가 three 를 쓴다 (재생기 검사용, devDependency)
npm run check              전부 검사
npm run check -- --update  기준선 재잠금
```

`src/lib` 는 의존성이 없다. three 를 쓰는 것은 `src/web` 과 그 게이트뿐이고,
그것도 **import 하지 않고 주입받는다** — 소비처가 이미 three 를 쓰고 있어서,
이 저장소가 제 판을 끌어오면 한 페이지에 two 벌이 뜬다.

## spacemaker · urbanspace 에서 쓰는 법

```bash
npm i github:indoorlabs/peoplemaker
```

three 는 **peer 의존**이다 — 소비처가 이미 쓰는 판을 그대로 쓴다. 이
저장소가 제 판을 끌어오면 한 페이지에 두 벌이 뜬다.

밖에서 보는 문은 **`src/web/index.mjs` 하나**이고, 패키지의 진입점이 그것을
가리킨다 (`import { loadPack } from 'peoplemaker'`). 순수 층만 필요하면
`peoplemaker/lib` 로 들어온다 — three 가 안 딸려 온다. 안쪽 파일을 직접
가져가면 내부를 고칠 때마다 남의 저장소가 깨진다 — 게이트가 그 문의 목록을
지킨다.

three 는 **주입한다.** 소비처가 이미 쓰고 있는 판을 그대로 넘긴다 (이
저장소가 제 판을 끌어오면 한 페이지에 두 벌이 뜬다).

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  loadPack, bakeFromPack, geometryOf,
  createClipPlayer, createInstancedCrowd, createMixedCrowd, planCrowd,
  measuredFor, planCrowdMeasured,
} from 'peoplemaker';

// 1. 팩을 받는다. 계약을 어긴 팩은 **여기서** 던진다.
//    팩 파일은 앱이 서비스하는 주소에 둔다 (node_modules 의 packs/ 를
//    복사하거나, 따로 배포한 팩을 가리킨다).
//    동작은 필요한 것만 받을 수 있다 — 나머지는 나중에 pack.load(['talk']).
//    (Rocketbox 한 사람: 몸 4MB + 걷기·서기 0.2MB. 동작을 다 받으면 8~11MB.)
const pack = await loadPack({
  url: '/packs/ref-synthetic', GLTFLoader,
  clips: (cat) => cat.clips.filter((c) => c.rootMotion === 'travel' || c.id === 'idle').map((c) => c.id),
});

// 2. 몇 명을 어느 단계로 세울지 — 예산이 정한다 (한 프레임 4ms 기준)
//    진짜 몸으로 잰 표가 있는 팩(Rocketbox)은 그 표로 센다. 뼈 수로 세는
//    planCrowd 는 그 몸을 13~15배 싸게 본다 (lib/crowdBudget.mjs 의 PACK_MEASURED).
//    몸을 몇 가지 섞는지도 값이다 — 팩마다 군중이 하나씩 생긴다 (kinds).
const table = measuredFor(pack.catalog.packId);
const plan = table
  ? planCrowdMeasured(want, 4, table, ['full', 'instancedLod'], { kinds: packs.length })
  : planCrowd(want, 4, ['full', 'instanced']);

// 3. 가까운 사람 — 사람마다 스킨 메시
const player = createClipPlayer({ THREE, SkeletonUtils, catalog: pack.catalog, gltfOf: pack.gltfOf });
const p = player.spawn({ clipId: 'walk-forward', position: [x, 0, z], headingRad: h });
const pick = player.walkAt(p, 1.1);   // 원하는 속도 → 클립과 재생 속도를 골라 준다

// 경로를 따라 직접 옮길 거라면 클립은 제자리로 두고, **pick.effectiveMps 로**
// 옮긴다. 다른 속도로 옮기면 발이 미끄러진다.
const q = player.spawn({ clipId: 'walk-forward', inPlace: true });
player.placeAt(q, [x, 0, z], headingRad);   // 프레임마다

// 4. 먼 사람 — 구운 자세, 드로우콜 하나. 살은 줄이고 색은 구워서 준다.
//    뼈와 가중치는 안 건드리므로 **같은 아틀라스를 그대로 쓴다**.
//    Rocketbox 몸에서 삼각형 8,064 → 2,016 · 1,000명이 4.81 → 1.46ms.
//    color 를 주면 팩의 텍스처를 정점 색으로 굽는다 (안 주면 다 같은 회색).
const atlas = bakeFromPack(pack);
const geom = geometryOf(pack, { lod: 0.25, color: true });
const crowd = createInstancedCrowd({ THREE, geometry: geom, atlas, count: n });
crowd.place(i, { position: [x, 0, z], headingRad: h, clipId: 'walk-forward' });

// 4-2. 몸이 여럿이면 — 팩마다 군중 하나, 사람 번호는 이어진다
//      (한 팩이 한 사람이라, 안 섞으면 먼 군중이 같은 사람 수천 명이다)
const mixed = createMixedCrowd({
  THREE, count: n,
  kinds: packs.map((p) => ({ id: p.catalog.packId, atlas: bakeFromPack(p), geometry: geometryOf(p, { lod: 0.25, color: true }) })),
  // 누구를 어느 몸으로 할지는 **쓰는 쪽이 정한다**. 안 주면 고르게 섞는다.
});
for (const m of mixed.meshes) scene.add(m);
mixed.place(i, { position: [x, 0, z], headingRad: h, clipId: 'walk-forward' });

// 5. 프레임마다
player.update(dt);
crowd.update(dt);
```

**배치·경로·활동 스케줄은 이 저장소가 안 한다** — 공간을 아는 쪽의 일이다.
여기서 주는 것은 "이 사람이 지금 어떤 자세인가" 와 "몇 명까지 감당되는가" 다.

### 먼 사람의 살 줄이기 (LOD)

드로우콜을 하나로 줄이고 나니 **벽이 정점으로 옮겨 갔다.** 드로우콜이 2 인데
1,000명이 4.81ms 였고, 그러면 남은 것은 삼각형 몫뿐이다. 이차오차(QEM)로
모서리를 접어 살을 줄인다.

```
Rocketbox 여자 01 · 먼 단계 · 같은 기계 (2026-09-12)

                  삼각형   200명   1,000명   5,000명
  안 줄임          8,064   1.46ms   4.81ms      —
  줄임 (0.25)      2,016   0.95ms   1.46ms   5.32ms
  줄임 (0.1)         806      —        —     2.46ms

  4ms 예산에 823명 → 3,623명
```

대가는 살이 원래에서 벗어나는 거리다. 0.25 에서 **최대 17.3mm · 평균
1.62mm** (키 1.74m 인 몸에서), 0.1 이면 최대 44.9mm 로 커진다. 이 수는 기계를
안 타는 **이 살의 성질**이라, 게이트가 매번 다시 재서 기록과 견준다.

**뼈도 가중치도 안 건드린다** — 접을 때 두 점 중 하나를 남기고 그 점의 것을
그대로 쓴다 (새 점을 지어내면 가중치를 섞어야 하고, 어깨와 팔의 가중치를
섞으면 그 정점이 어느 쪽도 아닌 데로 끌려간다). 그래서 구운 아틀라스가
그대로 맞는다.

줄이는 데 브라우저에서 74ms 가 든다 (Rocketbox 몸). 첫 화면에서 한 번이다.
게이트: `scripts/check-lod.mjs`.

### 먼 사람의 색

먼 단계는 한 색으로 칠했다 — 100명을 세우면 100명이 같은 회색 덩어리였다.
이제 팩의 baseColorTexture 를 UV 로 찍어 **정점마다 색 하나**를 굽는다
(`geometryOf(pack, { color: true })`).

텍스처를 그대로 쓰지 않는 까닭은 값이다. 1024×1024 PNG 셋이 3.7MB 이고,
화면에서 몇 픽셀인 사람에게 그 해상도는 통째로 버려진다. 정점 색은 정점마다
12바이트라 줄인 살(정점 1,030)에서 **12KB** 다. 드로우콜도 재료도 안 는다.

```
1,000명   4.81ms(안 줄임) → 1.46ms(줄임) → 1.37ms(줄임 + 색)
5,000명                      5.32ms         5.57ms
```

값이 오르내리는 폭이 재기의 흔들림과 같은 자릿수다 — **색은 사실상 공짜다.**
굽는 데 브라우저에서 130ms (줄이기 74ms + 그림 풀기·찍기 56ms).

멀리서 눈에 남는 것은 무늬가 아니라 덩어리 색이다 — 남색 웃옷·살색 팔·검은
머리. 그것은 정점 색으로 남는다. 텍스처가 없는 팩은 baseColorFactor 로
물러서고, 둘 다 없으면 색이 없다고 말한다 — 그럴듯한 살색을 지어내지 않는다.

게이트: `scripts/check-color.mjs` — 아는 그림에서 아는 색이 나오는가, **v 가
아래로 가는가**, 줄여도 그 색이 원래 있던 색인가, 진짜 몸에서 색이 정말
여럿인가(흩어짐 0.199 · 141가지 · 부위마다 다른가).

### 사람마다 다른 사람 (팩 섞기)

한 팩은 한 사람이다 (그 규약은 의도한 것이다 — 두 사람을 한 팩에 넣으면
속도에 맞춰 클립을 고르다 걷는 도중에 사람이 바뀐다). 그래서 먼 군중이
**같은 사람 수천 명**이었다.

먼 단계는 InstancedMesh 하나이고, 인스턴스들이 **같은 기하를 나눠 쓰는 것**이
드로우콜을 줄인 방법 자체다. 그러니 한 군중에 몸 둘을 넣을 길이 없다 —
몸마다 군중을 둔다. `createMixedCrowd` 가 사람 번호를 (어느 몸, 몇 번째)로
옮겨 주고, 쓰는 쪽은 몸이 몇이든 `place(i, …)` 하나로 본다.

```
같은 기계 · 줄인 살 · 구운 색 (2026-09-12)

   사람    몸 하나   몸 둘   몸 여섯
    200     0.95     1.00     1.16
  1,000     1.37     1.52     1.93
  5,000     5.57     5.23     5.56
  드로우콜    2        3        7

  4ms 예산:  3,623명 · 3,671명 · 3,284명
```

**몸 가짓수는 고정비로 들어온다** — 200명에서 몸 하나당 0.04ms 다. 사람 수에
붙는 값이 아니라 시작할 때 한 번 치르는 값이고(드로우콜과 버퍼 바꿔 끼우기),
그래서 여섯으로 늘려도 예산 안 사람이 9% 준다. 둘일 때 오히려 는 것은 남자
01 의 줄인 살(삼각형 1,748)이 여자 01(2,016)보다 가볍기 때문이다 — 값은 사람
수가 아니라 **삼각형**을 따라간다.

몸 둘을 한 기하에 이어 붙이고 안 쓰는 쪽을 찌그러뜨리는 길은 안 간다 —
그러면 **모든 사람이 모든 몸의 정점 값을 치른다** (5,000명 × 몸 둘 = 정점
두 배). 드로우콜 하나 아끼자고 삼각형을 두 배로 그리는 셈이다.

지금 팩은 여섯이다 — 여자 01·02, 남자 01·02, 정장 여자 01, 정장 남자 01.
한 사람 받는 데 3분쯤 걸리고(내려받기가 대부분), 팩이 8~12MB · 원본 캐시가
따로 528MB 다. 더 늘리려면 `PRESETS` 에 한 줄 적고 스크립트를 돌린다:

```sh
node scripts/import-rocketbox.mjs rocketbox-f03
```

게이트: `scripts/check-mix.mjs` — i 번을 놓으면 **그 몸의 그 칸**만 움직이는가,
옮기기가 재생 시각을 안 건드리는가, 없는 클립·없는 사람을 말하고 막는가,
그리고 잰 표가 **몇 가지로 잰 것인지** 말하는가 (여섯으로 잰 표를 스무
가지에 슬쩍 쓰면 예산이 거짓말한다).

### 동작 옮기기 (retarget)

동작 하나를 다른 몸으로 옮겨 그 팩의 클립으로 넣는다. 뼈 이름·국소 축·
비율·쉬는 자세(T/A)·앞이 달라도 **뼈가 가리키는 방향**을 맞추고, 몸 전체의
이동은 엉덩이 높이 비로 줄이거나 늘린다. 뼈 길이는 대상 몸의 것을 지킨다.

```sh
# 여자 01 에게 없는 전화 통화를 남자 01 에게서
node scripts/retarget.mjs packs/rocketbox-m01/clips/phone-call.glb rocketbox-f01 phone-call \
     --ko "전화 통화 (여자 01)" --en "Phone call (woman 01)"
```

지금 아는 규약은 `biped`(Rocketbox)·`mixamo` 다. 원본이 팩 밖의 파일이면
`--license` 와 `--tool` 을 줘야 한다 — 옮겼다고 라이선스가 바뀌지는 않는다.
게이트: `scripts/check-retarget.mjs`.

### 방향

`headingRad` 는 **세계에서 바라보는 쪽**이다 (0 = +Z, 시계 반대). 리그가
어느 쪽을 보고 있는지는 팩이 **재서** 갖고 있고(`catalog.forwardRad`),
어댑터가 그 차이를 흡수한다 — 쓰는 쪽은 리그의 사정을 알 필요가 없다.

이것을 안 재던 때 사람들이 시킨 것의 정반대로 걸었다. 걷는 그림은 멀쩡해서
화면만 봐서는 한참 못 알아챈다. 지금은 게이트가 네 방향으로 걸려 보고
**실제로 간 방향**을 재서 견준다.

## 지금 어디까지 왔나

`docs/plan-peoplemaker-ko.md` 의 P1 절반. 계약이 실물로 통과했다:

```
클립 5개(합성 기준 팩) · Rocketbox 사람 여섯(동작 8~9개씩) → 재서 카탈로그 →
three.js 가 읽고 사람을 세운다
드로우콜을 사람 수에서 둘로 줄이고, 그러고 나서 살을 4분의 1로 줄였다
먼 사람이 제 색을 입고, 몸 여러 벌을 한 화면에 섞는다
리그의 앞을 재서, 시킨 쪽으로 실제로 걷는다 (제자리 재생도 같이)
동작을 다른 몸으로 옮긴다 (retarget)
게이트 11개 · 검사 572 (살이 사람 모양인지·제 색인지·제 몸인지까지 잰다)

  Rocketbox 여자 01 · 한 프레임 4ms 예산 · Radeon 780M
    스킨드 (가까이)          28명    드로우콜 3/인 · 정점 5,438
    먼 단계                 823명    드로우콜 2   · 정점 4,883
    먼 단계 + 살 줄임      3,623명   드로우콜 2   · 정점 1,030
    거기에 몸 둘을 섞어     3,671명   드로우콜 3
    몸 여섯을 섞어         3,284명   드로우콜 7

데모: node scripts/serve-demo.mjs → http://localhost:5180/?people=200&bones=65
     ?pack=rocketbox-f01&mode=instanced&lod=0.25&color=1 — 줄인 살 · 구운 색
     ?packs=rocketbox-f01,rocketbox-m01,rocketbox-f02,… — 몸 여섯을 섞는다
     /demo/webgl.html · /demo/webgpu.html — 같은 코드를 두 렌더러로 (견주는 자리)
```

아직 없는 것: 사이즈코리아 치수 5종, 사람이 만든 진짜 클립(Mixamo 는 계정이
필요하다), 그리고 **어른뿐인 것** — 여섯 다 20~40대 몸이다. Rocketbox 에
어린이 넷이 있지만 걸음 클립은 어른 것뿐이라, 그대로 붙여도 되는지(키 차이
만큼 발이 뜨는지) 재 봐야 한다 — `scripts/retarget.mjs` 가 그 자리다.
휠체어처럼 **타는 것**이 있는 사람도 없다: 계약상 그것은 몸에 붙은 살이고
(한 팩 = 한 사람), 어디로 다닐 수 있는지는 공간을 아는 쪽 일이다.
**없다는 것을 게이트가 수로 말한다.**
