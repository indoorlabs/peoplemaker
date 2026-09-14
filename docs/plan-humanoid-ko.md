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
- R1·R3·R4 는 spacemaker 쪽이다 (§4).
