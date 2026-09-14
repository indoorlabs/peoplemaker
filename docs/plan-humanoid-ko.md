# 휴머노이드 로봇 — spacemaker 에 어떻게 넣을 것인가 (계획)

FetchMan(orayyan.com/fetchman)을 읽고, spacemaker 에서 휴머노이드 로봇의 동작
시뮬레이션을 **어느 패널에 둘지**와 **무엇을 어느 저장소가 맡을지**를 적는다.
**계획만 적는다. 여기에 구현은 없다.** 수는 전부 출처가 있고, 못 잰 것은 못
쟀다고 적는다.

---

## §0 무엇을 봤나 — FetchMan (2026-09-14 읽음)

| 무엇 | 값 | 출처 |
| --- | --- | --- |
| 하는 일 | "single-object reach-and-pick policy **walks to and grasps** a target" | arXiv 2608.17027 초록 |
| 로봇 | Unitree G1, zero-shot 배포 | 같은 곳 |
| 실물 성공률 | **73.3%** (로코-조작, 시도 30회) · 조작만 77.2% (22회) | 사이트 표 |
| 시뮬 성공률 | 83% (시도 100회) · 행동 복제만으로는 67% → RL(Flow-GRPO)로 83% | 사이트 |
| 학습 데이터 | 장면 약 150,000 · 물체 약 50,000 (MolmoSpaces 시뮬) | 사이트 |
| 입력 | 손목 RGB · 머리 어안 RGB · 고유수용감각 · 물체 이름(텍스트) | 사이트 |
| 집는 물체 예 | bowl · candle · musicbox · plunger | 영상 캡션 |
| 코드 | github.com/omarrayyann/fetchman — **README 하나뿐, "Code will be added by September 1", LICENSE 없음** | 2026-09-14 확인 |
| 저자 | Rayyan · Li · Argus · Jiang · Yu · Jiang · Cui — UCLA · Allen AI & UW | 사이트 |

**요점 셋.**

1. 이것은 **정책(신경망)** 이다. 카메라 두 대와 관절 상태를 넣으면 관절
   명령이 나온다. spacemaker 가 실행할 수 있는 것이 아니고, 실행해도 얻는
   것이 없다 — spacemaker 는 사진을 안 찍는다.
2. 그래도 **수가 나왔다.** "걸어가서 집는다" 한 번이 열에 일곱 번 성공한다는
   것은 설계 검토에 바로 쓰이는 값이다 — 물건 하나를 가져오는 데 **몇 번을
   시도하는가**가 동선 길이와 함께 처리량을 정한다.
3. 코드도 가중치도 라이선스도 아직 없다. **가져올 것이 없으니 가져오지 않는다.**
   이 계획은 FetchMan 을 *부르는* 계획이 아니라, FetchMan 이 보여 준 **과제와
   수**를 spacemaker 의 시뮬레이터에 넣는 계획이다.

## §1 로봇 몸 — 있는 것과 라이선스

| 무엇 | 값 | 출처 |
| --- | --- | --- |
| 형상 | `unitree_ros/robots/g1_description` — URDF 30벌 · 메시 167개(STL) | gh api, 2026-09-14 |
| 관절 | **29 회전** (다리 6×2 · 허리 3 · 팔 7×2) · 손 붙이면 +7×2 또는 +12×2 | g1_description README 표 |
| 질량 | URDF `<mass>` 합 **35.12 kg** (`g1_29dof.urdf` — README 가 deprecated 로 표시한 판. 현행 `rev_1_0` 판은 안 셌다) | URDF 에서 셈 |
| 키·폭 | **안 쟀다.** URDF 로 FK 를 돌려야 나온다. unitree.com 은 이 기계에서 안 열린다 | — |
| 라이선스 | **BSD-3-Clause**, © 2016-2022 HangZhou YuShu (Unitree) | LICENSE 파일 |

BSD-3 는 MIT 와 같은 급이다 — 재배포에 저작권 표시와 고지문이 따라가야 한다.
이 저장소는 그 기계(`ATTRIBUTIONS.md` 자동 생성 · `licenses/`)를 이미 갖고
있다. **다만 지금까지의 방침은 "CC0 만, MIT/Rocketbox 는 됨" 이었고 BSD-3 는
그 목록에 없다.** 넣을지는 주인이 정한다 (§7).

## §2 spacemaker 에 지금 있는 것 (2026-09-14 읽음)

```
Motion 패널  (components/MotionPanelTab.jsx · MotionLayer.jsx · lib/motion/*)
  · agent kind 7종 — forklift_2t · forklift_3t · reach_truck · agv · person · wheelchair · caregiver
    kind = 치수(cm) + 구동 모형('rear' · 'diff' · 'holo') + 속도 + liftTime/lowerTime
  · task = pick 점 → drop 점 (진입 방향 yaw 선택)
  · 상태 기계  idle → toPick → lifting → toDrop → lowering → returning · blocked
    lifting/lowering 은 **시간만 흐르는 상태**다 (person 은 3초)
  · nav grid 0.2m · 고정 스텝 50ms · 결정론(시드) · 층별 · 문 뚫음 · 가구가 장애물
  · 지표  time · done · per h · dist · m/task · wait — 그리고 issues(통로 폭 부족 · 경로 없음)
  · person kind 는 예산 안에서 peoplemaker 몸으로 그린다 — **걷기와 서기만.**
    lifting 상태에서도 서 있는 그림이다 (PeopleAgentBodies:121-122)

People 패널  (components/PeoplePanelTab.jsx · PeopleLayer.jsx)
  · 군중 — 흩기 · 클릭 배치 · 동선 · **비용(드로우콜·뼈)** 이 요점
  · 시뮬레이션이 아니다. 동선 위를 걷지만 과제도 지표도 없다

패널 등록  pages/index.js PANEL_TAB_META (37개) · lib/modelerProfiles.js 가 부분집합을 고른다
  · 규약: "패널의 동작을 profile 이 갈라서는 안 된다 — 다르게 동작해야 하면
    같은 id 에 **대체 패널**을 등록한다" (modelerProfiles.js 40-43)
  · Motion 패널 머리말: "forklifts today, AGVs / people / service robots on
    the same engine tomorrow" — **로봇은 처음부터 이 엔진의 자리였다**
```

## §3 어디에 둘 것인가 — 세 안

| | People 패널에 | **Motion 패널에** | 별도 Robot 패널 |
| --- | --- | --- | --- |
| 지금 있는 것과 맞나 | ✗ People 은 군중 **비용** 패널이다. 과제·지표·nav 가 없다 | ✓ agent kind 하나 · 상태 기계 · 지표 · issues 가 그대로 쓰인다 | △ 전부 새로 만들거나 Motion 것을 두 벌 갖는다 |
| 첫 화면까지 | 시뮬레이터를 새로 짜야 한다 | **kind 한 줄** (`humanoid_g1`) — 상자로 걸어가 집는 것까지 바로 된다 | 패널 등록 + 레이어 + 저장 키를 새로 |
| 사람과 함께 | ✗ 사람 위에 로봇을 얹는 꼴 | ✓ 이미 person·wheelchair·caregiver 와 같은 판에서 서로 피한다 (`speedLimitFor`) | 두 시뮬이 서로를 모른다 |
| 로봇 고유 UI (성공률 · 재시도 · 배터리 · 충전소) | 자리 없음 | 처음 몇 개는 spec 탭에 들어간다. **많아지면 Motion 이 창고 패널이 된다** | ✓ 여기가 제자리 |
| 저장소 규약 | — | — | 새 패널이 아니라 **대체 패널/profile** 로 (modelerProfiles.js) |

**결론 — Motion 에서 시작하고, 고유 UI 가 생기면 profile 로 가른다.**

1. **R1** 로봇은 **Motion 의 agent kind** 다. 지게차·AGV·휠체어와 같은 판에서
   같은 nav 를 타고 같은 지표를 낸다. People 패널에는 안 넣는다 — People 은
   "몇 명이 얼마에 서는가" 이지 "무엇을 하는가" 가 아니다.
2. **R4 이후** 로봇 고유 항목(성공률·재시도·충전)이 Motion 의 spec 탭을 넘치면
   **같은 id 에 등록하는 대체 패널** `RobotPanelTab` 을 만들고 business profile
   (`robot`)이 그것을 고른다. 별도 탭 id 를 새로 파지 않는다 — 규약이 그렇게
   말하고, 시뮬레이터가 하나여야 사람과 로봇이 한 복도에서 만난다.
3. 사람을 그리는 것과 같은 자리에서 로봇을 그린다 (`PeopleAgentBodies` 의
   자리). 그림은 peoplemaker 가 준다 — **그러나 §4 의 이유로 처음에는 상자다.**

## §4 무엇이 어느 저장소의 일인가

### spacemaker 쪽

```
lib/motion/agentKinds.js   humanoid_g1 kind — drive 'holo' · bodyW/bodyL/bodyH 는 URDF 를 재서 (안 쟀다)
                           speed · liftTime 은 **출처가 있어야 넣는다** (§7)
lib/motion/sim.js          task 에 'reach-and-pick' 종류 — pick 점이 아니라 **가구 위의 물체**
                           (placedFurniture.sizeH 가 있다 → 집는 높이가 나온다)
                           lifting 에 **성공률** — 실패하면 다시 시도 (시드 RNG, 결정론 유지)
                           지표에 attempts · retries · pickSuccess 추가
MotionPanelTab.jsx         spec 탭에 성공률·재시도, issues 에 "손이 안 닿는 높이"
```

### peoplemaker 쪽

```
동작 팩 계약 (src/lib/motionPack.mjs)
  SKELETONS 에 로봇 규약이 없다 (mixamo · vrm · biped 뿐). 로봇은 뼈 이름도
  관절 한계도 다르다 → 'urdf' 규약 하나 (뼈 = URDF joint 이름)
동작 클립 — **여기가 진짜 구멍이다**
  Rocketbox 는 사람 모션 캡처다. 로봇 동작은 셋 중 하나로만 생긴다:
    a. 사람 클립을 G1 rig 로 옮긴다 (retarget 도구는 있다 — biped ↔ mixamo 를 이미 한다)
       → 관절 한계가 달라 **그림이 거짓**이 된다. 무릎이 안 꺾이는 데를 꺾는다.
    b. 함수로 만든다 (ref-synthetic 처럼) — 걷기 사이클을 URDF 관절로 생성
       → 정직하다: "그린 것" 이 아니라 "발자국" 이다. 손 뻗기(reach)의 높이·시각은
         잰 값으로 남는다 (지금 클립 계약의 reach.heightM · atS 와 같은 꼴)
    c. 실제 로봇 로그(관절 궤적)를 받는다 → 지금은 없다. FetchMan 코드가 열리면 그때
  **R2 는 b 로 간다.** a 는 하지 않는다 (§0 의 네 번째 금지와 같다 — 못 하는 것을 대신하지 않는다).
사람 층과 같은 것
  bodyDims(키·폭·눈높이) 를 URDF 에서 잰다 — 사이즈코리아와 같은 꼴, 출처 'measured-from-urdf'
  grip(손 뼈·높이·두 손 사이) 을 클립에서 잰다 — 이미 있는 deriveGrip 이 그대로 쓰인다
```

**금지 넷은 그대로다.** 자리(x, z)와 절대 시각과 방 이름은 spacemaker 것이고,
못 하는 것(예: 계단)을 조용히 대신하지 않는다.

## §5 단계 — 각 단계는 잰 수로 끝난다

```
R1  Motion 에 kind 하나 (spacemaker · 하루)
    humanoid_g1 을 상자로. 지게차와 같은 task(pick → drop)를 준다.
    끝: 같은 창고에서 forklift_2t 와 humanoid_g1 의 per h · m/task 가 표로 나온다.
    막힘: bodyW/L/H · speed 의 출처. URDF 를 재서 치수는 나온다. **속도는 못 잰다** (§7)

R2  로봇 팩 하나 (peoplemaker · 일주일)
    'urdf' 스켈레톤 규약 + G1 URDF → glTF 몸 + 함수 생성 클립 셋 (idle · walk-forward · reach)
    끝: check-pack 이 통과하고, reach.heightM 이 URDF 손목 FK 와 1cm 안에서 맞는다 (게이트)
    막힘: BSD-3 (§7) · 팩 라이선스 낱말표에 없다

R3  집기를 과제로 (spacemaker · 이틀)
    task 종류 'reach-and-pick' — 목표는 점이 아니라 **가구 위 물체** (sizeH → 높이)
    lifting 에 성공률. 실패 → 재시도 · 지표에 attempts/retries
    끝: 성공률 1.0 이면 지금과 같은 수, 0.733 이면 per h 가 얼마로 떨어지는지가 표로 나온다
    성공률 값은 kind 에 **출처와 함께** 적는다 (FetchMan 73.3%, n=30, 2026-08)

R4  사람과 한 복도에서 (spacemaker · 이틀)
    person·wheelchair 와 humanoid_g1 을 같은 층에. 서로 피하는 규칙이 로봇에도 맞는가
    끝: 폭 1.5m 복도에서 휠체어와 마주칠 때 누가 서는지가 결정론적으로 같다 (시드 고정)
    막힘: 로봇의 정지 거리 — 출처가 없으면 사람 값을 **빌렸다고 적는다**

R5  대체 패널 + profile (spacemaker · 필요해지면)
    Motion spec 탭이 로봇 항목으로 넘칠 때만. RobotPanelTab 을 같은 id 'motion' 에 대체 등록,
    profile 'robot' 이 고른다. 시뮬레이터는 하나.
    끝: profile 을 켜고 끄는 것 말고 코드 분기가 0줄이다 (modelerProfiles.js 규약)
```

## §6 안 하는 것

- **신경망 정책을 돌리지 않는다.** 카메라도 관절 토크도 없다. 성공률은 수로
  받고, 그 수가 어디서 왔는지 적는다.
- **물리를 돌리지 않는다.** 균형·미끄러짐·낙하는 없다. 이 시뮬레이터가 답하는
  것은 "통과하는가 · 몇 초 걸리는가 · 몇 번 시도하는가" 다.
- **성공률을 지어내지 않는다.** FetchMan 은 단일 물체 · 실물 30회다. 물체
  두 개·계단·문 열기에는 수가 없고, 없으면 그 과제는 **못 한다**고 낸다
  (지금 대피 시나리오가 뛰는 클립 없이 안 되는 것과 같다).
- **사람 동작을 로봇에 씌우지 않는다** (§4 a).
- **People 패널을 건드리지 않는다.**

## §7 주인이 정할 것

1. **BSD-3 (Unitree) 를 팩 라이선스 목록에 넣는가.** 조건은 MIT 와 같다
   (표기 + 고지문). 안 넣으면 R2 는 없고, 로봇은 상자로만 간다 — 그래도
   R1·R3·R4 의 **수는 전부 나온다.** 그림만 없다.
2. **속도·정지 거리의 출처.** unitree.com 이 이 기계에서 안 열려 데이터시트를
   못 읽었다. 값이 오면 kind 에 넣고, 안 오면 person 의 값을 빌렸다고 적고 간다.
3. **첫 공간.** 창고(지게차 옆)인가, 요양시설(휠체어·간호사 옆)인가. R4 의
   시험 복도 폭이 여기서 정해진다.
4. **FetchMan 코드가 열리면** (9월 1일이라 했으나 14일 현재 스텁) 관절 로그를
   받아 §4 c 로 갈지. 그때 라이선스도 같이 본다.

---

*이 문서는 계획이다. 각 단계가 끝나면 §5 아래에 "무엇이 나왔고 어디가 틀렸나"
를 붙인다 — `plan-occupancy-ko.md` 의 §7-1…§7-5 와 같은 꼴로.*

---

## §8 R2 가 끝났다 — 무엇이 나왔고 어디가 틀렸나 (2026-09-14)

주인이 정했다: **BSD-3 를 넣는다** (Unitree 와 협력). 나머지는 이쪽이 정했다 —
속도는 빌리고 그렇다고 적었다, 첫 공간은 요양시설(휠체어·간호사 옆), FetchMan
코드는 아직 스텁이라 기다린다.

### 나온 것

```
packs/unitree-g1   catalog · body 438KB · 먼 몸 116/83KB · 클립 3 · URDF 34KB
  잰 것     키 1.322m · 폭 0.362m · 눈(d435) 1.266m · 골반 0.792m · 엉덩이→발바닥 0.690m
  걷기      1.35m/s → 1.350m/s · 디딤 2회/주기 · 앞 0rad
  손 뻗기   닿음 0.45s · 뗌 2.05s · 앞 0.333m · 높이 1.077m
  살        393,270 → 12,307 삼각형 (×0.031)
게이트 27개 (check-urdf 검사 23) — URDF 순운동학이 카탈로그를 1cm 안에서 되찾는다
```

### 계획이 틀린 자리

1. **"1cm 게이트" 는 맞았는데 견줄 시각을 틀렸다.** 닿기 시작한 시각(atS)에
   순운동학을 돌려 13cm 가 어긋났다 — 카탈로그의 값은 가장 멀리 간 자리다.
2. **관절 한계는 계획에 없었다.** 게이트가 첫 판에 발목 -0.985rad(한계 -0.873)
   를 잡았다. 사람 동작을 안 씌우는 이유를 우리 함수도 어긴 것이다. 이제 세
   클립의 관절 각 1,938개가 전부 한계 안이다.
3. **표기 계약에 구멍이 있었다.** 클립 단위 표기라 "클립은 CC0 · 몸은 BSD-3"
   인 팩의 저작권 표시가 빠졌다. `bodySource` 를 계약에 더했다 — §4 가 이것을
   예상하지 못했다.
4. **키는 재졌다.** §1 에서 "못 쟀다" 던 키가 살을 재서 1.322m 로 나왔다
   (unitree.com 의 값과 견주는 일은 남아 있다).

### 남은 것

- 속도·정지 거리의 출처 (빌린 값 그대로다)
- 클립이 셋뿐이다 — 물건 집기(들고 걷기)·문 열기는 없다. R3 의 과제가 그것을
  요구하면 그때 함수를 더한다.
- R3·R4 는 spacemaker 쪽이다 (§4). R1 은 아래.

---

## §9 R1 이 끝났다 — spacemaker 에 kind 하나 (2026-09-14)

`lib/motion/agentKinds.js` 에 `humanoid_g1` — 걷고(holo), 치수는 이쪽 팩이 잰
36 × 43 × 132 cm, 집는 시간은 손 뻗기 클립 2.4 s, 속도는 person 에서 빌렸다.
`scripts/motion-smoke.mjs` 가 kind 를 인자로 받고, `scripts/robot-kind-bench.mjs`
가 같은 창고에서 표를 낸다 (그쪽 `check:benches` 가 알아서 돌린다).

### 표 — 그리고 표가 말한 것

```
40 × 24 m · 통로 3.6 m · 랙 면의 집는 점 12개 → 하역장 · 각 kind 셋 · 900 s

  kind           done   per h   m/task   정지점이 띠 안   이유
  forklift_2t     9/12    36.0     37.5      0/12          no_progress 3
  person          5/12    20.0    105.9     12/12          no_progress 7
  wheelchair      3/12    12.0    151.3      0/12          no_progress 9
  humanoid_g1     2/12     8.0    265.3      0/12          no_progress 10
```

**계획이 틀린 자리.** "per h · m/task 가 표로 나온다" 는 나왔다. 그런데 표가
보여 준 것은 로봇이 아니라 **sim 이었다**: 걷거나 제자리 회전하는 kind 는
전부 과제를 놓친다 — person 도 5/12 다. 로봇이 들여온 문제가 아니다.

짚은 원인은 하나만 맞았다. 정지점을 몸 길이 절반만 물려 걷는 몸의 정지점이
자기 팽창 띠 안에 놓이는 것 — 그것은 person(12/12 띠 안)만 설명하고, 로봇과
휠체어는 정지점이 걸을 수 있는 칸인데도 못 간다. 원인이 더 있고 안 찾았다.
저쪽 sim 을 고치는 것은 지시 밖이라 **수로 남겨 뒀다.** R3(성공률 있는
집기)로 가기 전에 이것부터 풀어야 한다 — 안 그러면 성공률 0.733 을 곱할
분모가 거짓이다.

**주인이 정할 것 하나 더:** 요양시설 kind(휠체어·간호사)도 같은 자리에서
무너진다. 그쪽 벤치(care-response-bench)는 과제 sim 이 아니라 경로 길이로
응답 시간을 내서 안 걸렸을 뿐이다.

### §9-1 sim 을 고쳤다 — 한 줄이었다 (2026-09-14, 주인이 "진행")

매초 추적해 보니 한 기제였다. 집고 나서 물러나는 단계(creep -0.7)와 부딪힌
뒤의 1 초 후진(backoff -0.6)이 남긴 **v < 0** 이 경로 추종에 그대로 들어가고,
`lookAhead` 는 v 의 부호로 진행 방향을 정해 뒤에 있는 경유점을 "지나친 것"
으로 버린다 → 모퉁이를 잃고 랙을 가로질러 목표를 겨눈다 → 부딪히고 물러나기를
45 초 되풀이한다. 지게차는 후진 경로의 첫 경유점이 일부러 뒤에 놓이고 후진이
정상 주행이라 이 논리가 맞다. 걷거나 제자리에서 도는 몸은 아니다.

고침은 `lib/motion/kinematics.js` 한 줄 — 뒷바퀴 조향이 아닌 kind 는 경로
추종을 후진 속도로 시작하지 않는다. 고치는 방식 여섯을 시드 8개 × kind 넷으로
재서 골랐다 (시드는 결과를 안 바꿨다 — 이 창고에서는 결정론이 시드보다 세다):

```
                 forklift  person  wheelchair  humanoid   미결(교착)
  고치기 전           9        5         3          2        0
  exit 리셋만         9        6         7          3        7 ← 로봇이 양보 교착
  짧은 앞보기만       9        3         3          3        0 ← 오히려 해롭다
  클램프만            9        8         9          9        0 ← 이것
  클램프+앞보기       9        5         5          7        1
```

**계획이 틀린 자리 둘.** 첫 가설(정지점이 팽창 띠 안)은 person 만 설명했고
원인이 아니었다. 둘째로 "좁은 몸은 앞보기를 짧게" 가 그럴듯했는데 재 보니
반대였다 — 한 판의 수로 판단했으면 그것을 넣었을 것이다. 여섯을 나란히 잰
뒤에야 한 줄만 남길 수 있었다.

벤치가 이제 관계를 단언한다: 걷는 로봇과 휠체어는 같은 창고에서 지게차보다
적게 끝내지 않는다 (고치기 전 2 대 9). 고친 줄을 일부러 빼면 잡힌다.
남은 no_progress 3개는 지게차의 3개와 같은 과제다 — 이 창고의 성질이다.

---

## §10 R3 · R4 가 끝났다 — 성공률이 있는 집기, 복도에서의 마주침 (2026-09-14)

### R3 — 집기에 성공률

kind 가 값을 갖는다: `pick: { success: 0.733, trials: 30, maxTries: 3, source: FetchMan
arXiv 2608.17027 }` 와 `reachM: 1.077` (이쪽 팩의 손 뻗기 클립을 잰 값). sim 은
집을 때마다 **시드 난수**로 던지고, 실패하면 그 자리에서 다시 시도하고, 상한을
넘으면 `pick_failed` 로 과제를 놓는다 — 조용히 성공한 척하지 않는다. 물체가 손
닿는 높이보다 높으면 걸어가기 전에 `too_high` 로 말한다 (통로 폭과 같은 자리).

```
같은 창고 · 로봇 셋 · 900 s
  성공률 없이   9/12 · 36.0/h
  0.733 로      8/12 · 32.0/h · 시도 10 · 실패 1 · 같은 시드면 같은 수
  1.5 m 물체 → too_high (손 1.077 m) · 0.8 m 물체 → 배정
```

**계획과 다른 것.** 물체를 "가구 위" 로 두려 했는데, 지금 과제는 점이고 가구를
클릭해 높이를 채우는 자리는 ModelingLayer(1만 2천 줄)라 손대지 않았다. 과제가
`from.heightM` 을 나르면 sim 이 본다 — 채우는 것은 다음 일이다. 재시도 상한 3은
출처가 없다(없으면 무한이 된다). 그렇다고 적었다.

### R4 — 요양시설 복도에서 휠체어와

복도 폭은 sim 이 스스로 말하는 값에서 정했다: 휠체어의 통로 요구 1.6 m ± 0.2.

```
1.4 m  휠체어가 맡은 과제 → aisle_narrow (요구 1.60) · 로봇은 끝낸다 (요구 1.26)
1.8 m  마주치면 둘 다 끝낸다 · 서는 쪽은 로봇 1.3 s (정면이면 id 가 작은 쪽이 간다)
       두 번 돌려 같다
```

**계획이 틀린 자리.** 과제에 kind 이름을 붙였다가 반대로 나왔다 — sim 은 과제를
kind 가 아니라 **가장 가까운 놀고 있는 쪽**에 맡긴다. 벤치는 "누가 맡았고 무엇이
거부됐는가" 로 고쳤다. 그리고 이 sim 은 사람끼리 부딪히지 않는다 — 양보 규칙뿐이다.
벤치가 보는 것은 그 규칙이 결정론적인가이지 몸이 지나가는가가 아니다.

### R5 는 안 했다

Motion 의 spec 탭에 두 줄(성공률 · 닿는 높이), 지표 한 칸(재시도), issues 에
두 이유가 늘었을 뿐이다. 넘치지 않았다 — 별도 패널·profile 은 그때 간다.

### 남은 것

- 속도·정지 거리의 출처. 재시도 상한의 출처.
- FetchMan 코드 (스텁).

---

## §11 스스로 정해 둘을 더 했다 (2026-09-14, "너가 진행")

**들고 걷기** — `walk-carry`. 걸음은 walk-forward 와 같고 오른팔만 앞에 들어
흔들지 않는다. 무엇을 드는지는 사람이 적고(`cup`), 손이 어디 있는지는 잰다:
1.35 m/s · 디딤 2회 · 손 높이 0.901 m · 두 손 사이 0.329 m · 붙일 뼈
`right_wrist_yaw_link`. 관절 각 2,477개가 한계 안. check-grip 이 로봇도 같은
규칙으로 본다. Release 에 올렸다 (자산 893).

**가구 위를 클릭하면 높이가 실린다** — spacemaker `ModelingLayer` 의 과제
클릭에서 `pickFurnitureAt` 로 가구를 찾아 `sizeH` 를 `heightM` 으로 싣는다.
가구가 없거나 높이가 없으면 안 싣는다 — 짐작한 높이를 넣지 않는다. 그래서
`too_high` 가 화면에서도 나온다. 1만 2천 줄짜리 파일이라 손대지 않겠다고
§10 에 적었는데, 열어 보니 열 줄이었고 도우미는 이미 있었다 — 그 말은 틀렸다.

클립이 넷이 됐다. 화면에서 로봇이 집은 것을 들고 걷는 데까지는 저쪽이 로봇을
상자가 아닌 몸으로 그려야 한다 — 아래 §12.

---

## §12 로봇이 몸으로 선다 (2026-09-14, "진행")

**계약 하나 — 드는 클립도 다친 걸음과 같은 규칙.** 들고 걷기가 walk-forward 와
속도가 같아서 속도로만 고르면 동률이었다 — 빈손인 사람이 무언가를 든 채로 걸을
수 있었다. `walkAt(person, mps, { holding })`: 빈손이면 드는 클립을 안 고르고,
들었으면 드는 클립만 고르며, 든 팩에 드는 클립이 없으면 **null** 이다(조용히
빈손으로 대신하지 않는다). 게이트가 미끼 셋으로 본다. 처음에 걸러내기에만 넣고
고르는 함수가 안 넘겨서 게이트에 잡혔다 — 규칙과 고르기는 한 줄로 이어져야 한다.

**spacemaker.** kind 가 제 팩을 가리킨다(`packUrl: '/packs/unitree-g1'`).
MotionLayer 가 몸을 **팩별로** 모아 세운다 — person 은 People 패널의 팩, 로봇은
제 팩. 예산은 팩 수로 나눈다. PeopleAgentBodies 가 sim 의 상태를 자세로 옮긴다:
집는 동안(lifting · lowering) 손 뻗기, 든 채(laden) 걸으면 들고 걷기, 그 클립이
없는 팩은 빈손으로 걷되 팩마다 한 번 말한다. 저쪽 `public/packs/unitree-g1` 에
먼 몸 + 클립 넷(268KB)을 Release 에서 받아 뒀고 BSD-3 고지문(LICENSE.md)을
바이트 그대로 옆에 뒀다. `served-packs-bench` 가 그것을 본다 — 팩이 있는가 ·
몸이 부르는 클립이 있는가 · 잰 치수와 kind 가 같은가 · 고지문이 있는가 · 도장이
있는가 (10 ok).

**못 본 것.** 화면은 브라우저가 있어야 본다. 저는 JSX 를 파서로 구문만 확인했고
그림은 못 봤다 — 로봇이 서고 걷고 집는 것을 눈으로 확인하는 일은 남아 있다.
저쪽 Rocketbox 팩(public/packs/rocketbox-*)에는 MIT 고지문이 없다 — 전부터
그랬고 이번에 만든 규칙은 kind 가 가리키는 팩만 본다.
