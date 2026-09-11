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
  createClipPlayer, createInstancedCrowd, planCrowd,
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
const table = measuredFor(pack.catalog.packId);
const plan = table
  ? planCrowdMeasured(want, 4, table, ['full', 'instanced'])
  : planCrowd(want, 4, ['full', 'instanced']);

// 3. 가까운 사람 — 사람마다 스킨 메시
const player = createClipPlayer({ THREE, SkeletonUtils, catalog: pack.catalog, gltfOf: pack.gltfOf });
const p = player.spawn({ clipId: 'walk-forward', position: [x, 0, z], headingRad: h });
const pick = player.walkAt(p, 1.1);   // 원하는 속도 → 클립과 재생 속도를 골라 준다

// 경로를 따라 직접 옮길 거라면 클립은 제자리로 두고, **pick.effectiveMps 로**
// 옮긴다. 다른 속도로 옮기면 발이 미끄러진다.
const q = player.spawn({ clipId: 'walk-forward', inPlace: true });
player.placeAt(q, [x, 0, z], headingRad);   // 프레임마다

// 4. 먼 사람 — 구운 자세, 드로우콜 하나
const atlas = bakeFromPack(pack);
const crowd = createInstancedCrowd({ THREE, geometry: geometryOf(pack), atlas, count: n });
crowd.place(i, { position: [x, 0, z], headingRad: h, clipId: 'walk-forward' });

// 5. 프레임마다
player.update(dt);
crowd.update(dt);
```

**배치·경로·활동 스케줄은 이 저장소가 안 한다** — 공간을 아는 쪽의 일이다.
여기서 주는 것은 "이 사람이 지금 어떤 자세인가" 와 "몇 명까지 감당되는가" 다.

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
클립 5개 (합성 기준 팩) → 재서 카탈로그 → three.js 가 읽고 사람을 세운다
사람 여럿의 비용을 CPU·GPU 양쪽에서 재고, 드로우콜을 하나로 줄였다
리그의 앞을 재서, 시킨 쪽으로 실제로 걷는다 (제자리 재생도 같이)
게이트 7개 · 검사 277 (살이 사람 모양인지까지 잰다)

  200명 · 뼈 65   스킨드   드로우콜 201 · CPU 16.9ms · GPU 16.8ms
                  인스턴싱 드로우콜   2 · CPU 0.04ms · GPU 0.84ms
  5,000명         인스턴싱 드로우콜   2 · CPU 0.12ms · GPU 2.62ms

데모: node scripts/serve-demo.mjs → http://localhost:5180/?people=200&bones=65
     /demo/webgl.html · /demo/webgpu.html — 같은 코드를 두 렌더러로 (견주는 자리)
```

아직 없는 것: 사람이 만든 진짜 클립(Mixamo 는 계정이 필요하다), 사이즈코리아
치수 5종, 그리고 다수 렌더링(LOD·인스턴싱). **없다는 것을 게이트가 수로 말한다.**
