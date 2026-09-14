# spacemaker 를 올리는 법 — 무엇을 하면 무엇이 달라지는가

이 문서는 **spacemaker 쪽을 고칠 사람**에게 쓴다. peoplemaker 를 38커밋 뒤의
것으로 올릴 때 저쪽 저장소에서 해야 하는 일과, **안 해도 되는 일**을 적는다.
수는 전부 잰 것이고 어디서 잰 것인지 함께 적는다.

## 한 줄

**핀만 올리면 코드는 한 줄도 안 고쳐도 된다** — 다만 얻는 것도 없다.
얻으려면 팩을 갈아 끼워야 하고, 갈아 끼우면 **한 군데는 손대야 한다**
(아래 2번의 두 갈래 중 하나). 그리고 그 전에 **여기서 밀어야 한다** —
38커밋이 아직 GitHub 에 없다.

## 지금 어떤 상태인가

| | spacemaker 가 보는 것 | 지금 peoplemaker |
| --- | --- | --- |
| 핀 | `2c0cf83` (2026-09-11) | `HEAD` — 그 뒤 38커밋 |
| `origin/main` | `2c0cf83` | **`2c0cf83`** — 38커밋이 안 밀렸다 |
| 서비스하는 팩 | `public/packs/` 3개 · 23MB | 저장소에 13개 · 4.22MB |
| 사람 | 2명 (여자 01 · 남자 01) | 12명 (어른 8 · 어린이 2 · 의료 2 · 경비 2) |
| 팩당 클립 | 9개 | 저장소에 3개 · 받으면 31~34개 |
| 먼 몸 (`bodyFar`) | **없다** | 2단계 (`body-far.glb` · `body-far-10.glb`) |
| 배역 (`person`) | **없다** | 나이대·성별·이동성·복장 |
| 구운 도장 | **없다** | `builtAt` · `builtFrom` (갈아 끼운 것을 확인할 수 있다) |

`origin/main` 이 저쪽 핀과 **같은 커밋**이다. 그러니 지금 `npm update` 를 해도
받는 것이 없다. 미는 것이 0번이다.

## 0. 여기서 민다

```sh
git push origin main      # peoplemaker · 38커밋
```

민 다음에야 아래가 성립한다.

## 1. 핀을 올린다 — **코드는 안 고친다**

```sh
npm i github:indoorlabs/peoplemaker   # spacemaker
```

저쪽이 부르는 것은 아홉 개의 함수와 다섯 개의 메서드다:

```
loadPack · bakeFromPack · geometryOf · createClipPlayer · createInstancedCrowd
planCrowd · planCrowdMeasured · measuredFor · pickWalkClip
player: spawn · walkAt · placeAt · playClip · update
```

이 차례가 38커밋 뒤에도 그대로 도는지는 **이쪽 게이트가 매 커밋 증명한다**
(`scripts/check-consumer.mjs`, 검사 46). 저쪽 소스 8개를 읽어 부르는 이름과
차례를 그대로 옮겨 적었고, 일부러 열한 군데를 깨서 열하나 다 잡히는 것을
확인했다. **옛 팩 꼴을 거부하지 않는지도 함께 본다** — 그래서 팩을 안 갈아도
지금 그대로 돈다.

그 사이 달라진 것 중 부르는 쪽이 안 바꿔도 영향을 받는 것은 셋이다.

| 달라진 것 | 저쪽에서 무슨 일이 | 고칠 것 |
| --- | --- | --- |
| `playClip` 이 0.25초 섞는다 (전에는 즉시) | 안 걸을 때 프레임마다 `playClip(p,'idle')` 을 부르는데, 같은 클립이면 아무것도 안 하므로 그대로다 | 없음 |
| `walkAt` 이 `distress` 걸음을 기본에서 뺀다 | 지금 저쪽 팩에는 그런 클립이 없어 차이가 없다. 갈아 끼우면 절뚝이는 사람이 안 섞인다 | 없음 |
| 카탈로그에 항목 다섯이 늘었다 | 저쪽 팩에는 하나도 없지만 계약이 받아 준다 | 없음 |

## 2. 팩을 갈아 끼운다 — **여기서부터 얻는 것이 생긴다**

핀만 올리면 **얻는 것이 없다.** 저쪽은 `public/packs/` 에 제 팩을 따로 들고
있고 거기에는 먼 몸이 없기 때문이다.

### 마침 크기가 맞는다

저쪽 코드가 이름을 부르는 클립은 셋뿐이다 — `idle`(`PeopleLayer` ·
`PeopleAgentBodies`) · `walk-forward`(`PeopleLayer`) · `run`(`MotionPanelTab`).
peoplemaker 저장소가 사람마다 두고 있는 클립도 **정확히 그 셋**이다.

```sh
# spacemaker — 설치된 팩을 그대로 public 으로 (Next 는 public/ 만 서비스한다)
rm -rf public/packs && cp -r node_modules/peoplemaker/packs public/packs
node scripts/trim-pack-catalogs.mjs          # ← 아래를 꼭 읽을 것
```

**그냥 복사하면 깨진다.** 재현해서 확인했다. 딸려 오는 사본은 카탈로그가
클립 34개를 적는데 **파일은 셋뿐**이고, 저쪽 `PEOPLE_CLIPS` 는 거기서
`travel || idle` 로 여덟을 고른다 — 다섯이 없어 `loadPack` 이 멈춘다
(`walk-fast` · `walk-slow` · `walk-injured` · `walk-bruised` · `run-injured`).

peoplemaker 쪽 오류가 이제 그 사정을 말한다:

```
pack://…/clips/run-injured.glb 가 없다 (HTTP 404). 카탈로그는 클립 34개를 적지만
**이 사본에 파일이 다 있는 것은 아니다** — 저장소에 딸려 오는 사본은
idle · walk-forward · run 뿐이다. 있는 것만 달라고 하거나(clips: ['idle',
'walk-forward']), 나머지를 먼저 받을 것 (node scripts/fetch-packs.mjs <목록> --clips …).
```

두 갈래 중 하나를 고르면 된다.

**갈래 1 — 카탈로그를 온 파일에 맞춘다** (코드 수정 없음, 권함).
복사한 뒤 카탈로그에서 파일이 없는 클립을 지운다:

```js
// spacemaker/scripts/trim-pack-catalogs.mjs
import fs from 'node:fs';
const root = 'public/packs';
for (const id of fs.readdirSync(root)) {
  const f = `${root}/${id}/catalog.json`;
  if (!fs.existsSync(f)) continue;
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  const here = new Set(fs.readdirSync(`${root}/${id}/clips`).map((x) => x.replace('.glb', '')));
  const before = c.clips.length;
  c.clips = c.clips.filter((x) => here.has(x.id));
  fs.writeFileSync(f, JSON.stringify(c, null, 2));
  console.log(`${id}: 클립 ${before} → ${c.clips.length}`);
}
```

**갈래 2 — 받을 클립을 직접 준다** (`PEOPLE_CLIPS` 를 고친다).

```js
const PEOPLE_CLIPS = () => ['idle', 'walk-forward'];
```

이러면 카탈로그는 그대로 두고 화면에 필요한 것만 받는다. 다만 나중에
클립을 더 받아도 자동으로 안 늘어난다.

| | 지금 | 갈아 끼운 뒤 |
| --- | --- | --- |
| 파일 | 3팩 | **87개 · 13팩** |
| 크기 | 23MB | **4.22MB** |
| 사람 | 2명 | **12명** |
| 먼 몸 | 없다 | 2단계 |

**23MB 가 4.22MB 가 되면서 사람이 2명에서 12명이 된다.** 지금 팩의 무게는
대부분 텍스처가 붙은 몸째(`body.glb`)와 안 쓰는 클립 일곱이다.

### 그래서 몇 명이 서는가

같은 한 프레임 4ms 예산에서 (여자 01 · Radeon 780M · 이 저장소에서 잰 값):

```
지금 (몸째 스킨드)          28명    드로우콜 3/인
먼 단계                    823명    드로우콜 2   · 정점 4,883
더 줄인 단계 (0.1)        8,327명   드로우콜 2   · 정점 425
```

`body-far*.glb` 가 없으면 위 두 줄은 **열리지 않는다.** 이것이 팩을 갈아야
하는 이유의 전부다.

### 오가는 클립 — 일곱을 잃고 하나를 얻는다

지금 저쪽 팩의 아홉 중 일곱은 `listen` · `look-around` · `phone` ·
`phone-call` · `photo` · `talk` · `wave` 다. 저쪽 코드는 이 이름들을 부르지
않고, `PEOPLE_CLIPS` 가 `rootMotion === 'travel' || id === 'idle'` 로
고르므로 **받아지지도 않는다** — 목록에만 있었다.

반대로 `MotionPanelTab.jsx` 는 `'run'` 을 이름으로 부르는데 **지금 서비스하는
세 팩에는 `run` 이 없다.** 갈아 끼우면 그 자리가 처음으로 채워진다.

일곱이 다시 필요하면 골라서 받는다:

```sh
node scripts/fetch-packs.mjs <목록 주소> --tier far --clips idle,walk-forward,run,talk,wave
```

대피 시나리오까지 하려면 `look-around` 와 문 여는 동작이 더 든다 —
13팩 전부면 13.0MB 다 (지금 23MB 보다 여전히 작다).

## 3. 사람 목록에 아홉을 더한다 — **저쪽에서 고칠 유일한 곳**

`components/PeoplePanelTab.jsx` 의 목록이 네 줄이다 (기준 · 여자 01 ·
남자 01 · 섞기). 팩을 갈아 끼워도 **고르는 자리가 없으면 안 보인다.**
기본값은 `store/useSettingsStore.js` 의 `planPeoplePackUrl` 에 있다 (지금은
`/packs/ref-synthetic` — 합성 기준 팩이라 사람처럼 안 생겼다).

```
rocketbox-f01 · f02 · m01 · m02 · c01 · c02
rocketbox-business-f01 · business-m01
rocketbox-medical-f01 · medical-m01     ← 간호사
rocketbox-security-f01 · security-m01   ← 순찰 대원
```

각 팩은 제가 누구인지 말한다 (`catalog.person`: 나이대 · 성별 · 이동성 ·
복장). 손으로 이름을 적는 대신 그 값으로 목록을 만들 수 있다.

## 4. 갈아 끼운 것을 확인한다 — **카탈로그에 도장이 있다**

`version` 은 양쪽 다 `0.1.0` 이고 `builtBy` 도 같아서, 그것만으로는 옛
사본을 물고 있는지 알 수 없었다. 그래서 **언제 · 어느 커밋으로 구웠는지**를
카탈로그에 적게 했다.

```js
const { catalog } = await loadPack({ url: '/packs/rocketbox-f01', GLTFLoader });
catalog.builtAt     // '2026-09-14'  — 없으면 옛 사본을 물고 있다
catalog.builtFrom   // '4a0fc56'     — 이 커밋으로 구웠다
catalog.bodyFar?.length   // 2 면 먼 층이 열린다
```

**`builtAt` 이 `undefined` 면 브라우저나 CDN 이 옛 `catalog.json` 을 물고
있는 것이다.** 도장이 없는 옛 팩도 계약은 그대로 받아 주므로(저쪽 화면을
막지 않는다) 오류가 아니라 **조용히 옛 사람이 선다** — 그래서 이 한 줄로
확인해야 한다.

## 안 해도 되는 것

- **부르는 차례를 고치는 것** — 위 2·3 말고는 없다. 저쪽이 부르는 아홉
  함수와 다섯 메서드가 그대로 도는 것을 게이트가 검사 46으로 증명한다.
- **three 올리기** — 저쪽은 0.183.2, 이쪽 개발은 0.186 이다. 저쪽 판으로
  열어 보는 시험이 따로 있다 (`npm run smoke -- ../spacemaker/node_modules/three`).
- **호스팅** — 먼 층은 저장소에 들어 있어 `node_modules` 에 그냥 온다.
  31~34개 클립을 다 쓰려면 그때 목록(`packs.json`)을 올릴 자리가 필요하다
  (146.7MB · 아직 안 정했다).
