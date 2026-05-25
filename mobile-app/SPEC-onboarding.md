# 구현 명세서 — 초기 설정(온보딩) 재설계

> 대상: Codex. 새 설계 판단 금지. 명세대로만 구현.
> 본 문서는 **SPEC-period-budget.md를 전제**로 한다. 자료형(BudgetState, Category, IncomeItem 등)·
> 봉투 6칸·period 엔진은 그쪽 §2~§5에 정의돼 있다. 본 문서는 셋업 흐름과 코치 질문만 다룬다.
>
> 모호하면 멈추고 질문. 기존 컴포넌트(`MoneyInput`/`DayInput`/`CoachQuestionCard`/`LifestylePicker`)
> 와 키보드/모달 패턴은 **그대로 재사용**한다(중복 신설 금지).

---

## 0. 왜 새로 짜는가

기존 9문항 코치(`lunch`·`soloDinner`·`socialCount`·`socialType`·`split`·`kitchen`·`personalSpend`·`leak`·`style`)는
신호가 겹치고(사교 3문항 등), 영향이 약한 항목(`kitchen`)이 섞여 있다. 6봉투 모델(`식비/생활/교통/쇼핑/문화/기타`)에
맞춰 **5문항으로 압축 + 신호 강화**한다. 같은 정보량을 절반 시간에. 라이프스타일은 명시 픽커로 유지(가중치를
사용자가 보고 고르는 게 더 정직).

---

## 1. 설계 원칙

1. **필수 정보만 묻는다.** "있으면 좋은 것"은 셋업이 아니라 [설정] 화면으로(이번 작업 범위 아님, 자동 처리).
2. **한 화면 = 한 결정.** 카테고리 질문은 4지선다, 한 탭으로 진행. (`CoachQuestionCard` 패턴 재사용.)
3. **건너뛰기 vs 강제 구분.** 잔액·수입 분기는 강제. 고정지출·저축·코치는 건너뛰기 허용(기본값으로 진행).
4. **결과는 한눈에 + 즉시 수정.** 마지막 스텝에 모든 입력을 카드 4-5개로 요약, 각 카드에 [수정] 인라인.
5. **UX 정확성 바(SPEC-period-budget §5.9) 준수**: 키보드 가림 0, 첫 탭 동작, 죽은 버튼 0, 빈 상태 안내, 진행률 표시.

---

## 2. 앱이 굴러가는 데 필요한 정보 (분류)

| 정보 | 필수성 | 출처 |
|---|---|---|
| `currentBalance` | **필수** | 잔액 스텝 |
| 수입 구조 (cadence/anchorDate/amount) OR `noIncomeMode`(+targetDate) | **필수** (둘 중 하나) | 수입 분기 |
| `fixedItems[]` | 선택 (기본 빈 배열) | 고정지출 스텝 |
| `lifestyleType` | 선택 (기본 `balanced`) | 라이프스타일 스텝 |
| `coachProfile` 5문항 | 선택 (기본 중립) | 코치 5스텝 |
| `savingEnabled` + `savingGoal` | 선택 (기본 OFF) | 저축 스텝 |
| `envelopes[].periodLimit` (6칸) | 자동 산출 (코치 결과 기반, 사용자 조정 가능) | 결과 스텝 |
| `currentPeriodStart`, `currentPeriodStartingBalance`, `currentPeriodPlan`, `currentTransfers`, `coachProfile` | **셋업 완료 시 자동 세팅** (SPEC-period-budget §3.11 셋업 초기화) | 자동 |

---

## 3. 전체 스텝 흐름 (10 스텝 + 동적 분기)

```
Step 1  잔액                                  (필수)
Step 2  수입 분기 결정                          (필수) — [정기 / 들쭉날쭉 / 지금은 없음]
Step 3  수입 상세                              (Step 2 분기에 따라 폼이 달라짐)
Step 4  고정지출 + 거주 형태 (한 화면)            (건너뛰기 OK, 거주는 인라인 한 줄)
Step 5  자동 차감 (데통 + 이벤트 적립)            (둘 다 토글, default OFF + 4만)  [NEW]
Step 6  라이프스타일                            (LifestylePicker 그대로)
Step 7  코치 Q1 — 식사 환경 (점심+저녁)         (한 화면 2질문)
Step 8  코치 Q2 — 친구 약속 (빈도+회당)         (한 화면 2직접입력)
Step 9  코치 Q3 — 쇼핑 월 평균                  (직접입력 1칸)
Step 10 코치 Q4 — 콘텐츠 월 평균                (직접입력 1칸)
Step 11 코치 Q5 — 돈 관리 성향                  (4지선다)
Step 12 저축 토글                              (Q5 답이 default 결정)
Step 13 결과 — 요약 + 봉투 6칸 인라인 수정 → [시작하기]
```

총 13 스텝. 진행률은 `현재/13`로 표시. 신규 §5(데통/이벤트) 1스텝 추가, 코치 질문 5개는 압축·재구성.

---

## 4. 각 스텝 상세

### Step 1 — 잔액 (필수)

- 제목: "지금 생활비로 쓸 수 있는 돈이 얼마예요?"
- 보조: "통장 전체가 아니라 **이번에 자유롭게 쓸 부분만**. 저축할 돈·카드값·이미 약속된 돈은 빼고 적으세요."
- 위젯: `MoneyInput` 라벨 "자유 생활비 잔액". 이 값이 `currentBalance`로 저장.
- 검증: `currentBalance > 0` (0/빈값이면 [다음] 비활성 + 누르면 Alert "잔액을 입력해주세요").

**[계산 도우미] 펼침 영역 (선택)** — 헷갈리는 사용자용. MoneyInput 아래 작은 텍스트 버튼 "💡 헷갈리면 도우미 펼치기" → 탭하면 3칸 계산기 나옴:

```
┌─────────────────────────────────┐
│ 통장 전체 잔액   [ MoneyInput ]   │
│ − 저축할 돈       [ MoneyInput ]   │
│ − 카드값·약속    [ MoneyInput ]   │
│ ─────────────────────────────── │
│ = 자유 생활비    XXX만 (자동)    │ ← `colors.teal` 강조
└─────────────────────────────────┘
[ 이 값으로 채우기 ] ← teal primary
```

동작:
- 3칸 입력 시 실시간 자동 계산
- [이 값으로 채우기] 누르면 위 메인 `MoneyInput`(자유 생활비)에 값 자동 주입 + 도우미 영역 접힘
- 도우미 안 펼치면 그냥 사용자가 직접 메인 칸에 입력
- 도우미 입력값은 저장 안 함(`currentBalance`만 저장). 일회성 계산기.

이렇게 하면: 통장 그대로 적고 싶은 사용자는 도우미 펼쳐서 빼기 계산, 자유 생활비 직접 아는 사용자는 그냥 메인 칸 입력. 헷갈림 0.

### Step 2 — 수입 분기 결정 (필수)

- 제목: "돈은 어떻게 들어와요?"
- 보조: "정기적이면 자동으로 다음 입금일을 계산해드려요. 들쭉날쭉이거나 지금 수입이 없어도 괜찮아요."
- 위젯: 카드 3개 (LifestylePicker 패턴) — 한 탭에 선택 + 자동 진행.
  - **[정기적으로 들어와요]** (월급·용돈·주급 등) → `cadence ∈ {monthly, biweekly, weekly}` 로 Step 3 분기
  - **[들쭉날쭉이에요]** (프리랜서·자영업) → `cadence = 'irregular'` 로 Step 3 분기
  - **[지금은 수입이 없어요]** (취준·휴직·학생) → `incomes = []` + `noIncomeMode` 로 Step 3 분기

### Step 3 — 수입 상세 (Step 2 분기로 폼 분기)

> 모든 케이스에서 amount는 **선택**(빈칸 = `null`). 영웅 숫자는 *날짜만* 사용. 1개 이상 입력 시 [수입 추가] 버튼.

**3-A. 정기형** (cadence ∈ {monthly, biweekly, weekly})
- 라벨 "어떤 주기로?": 칩 3개 [매달 / 격주 / 매주] (한 탭 선택).
- monthly: `DayInput` "매달 며칠?" + (선택) 금액 → `anchorDate` = 이번 달 그 일로 합성.
- biweekly/weekly: 날짜 피커(`@react-native-community/datetimepicker`) "기준 입금일(가장 가까운 과거 또는 미래)" + (선택) 금액.
- 이름 입력 `TextInput`(기본 "월급"/"용돈"/"주급").
- 다중 수입 허용: [수입 추가] 누르면 같은 폼 1줄 더.

**3-B. 들쭉날쭉형** (cadence='irregular')
- 라벨 "최근에 마지막으로 입금받은 날?" 날짜 피커(필수, anchorDate).
- 라벨 "보통 며칠 간격으로 들어와요?" `DayInput`-스타일 숫자 입력(선택, `estIntervalDays`. 비우면 평균 추정/기본 30).
- (선택) 금액. 이름.

**3-C. 수입 없음** (incomes=[])
- 라벨 "이 돈으로 언제까지 써야 해요?" 칩 2개:
  - **[특정 날짜까지]** → 날짜 피커 노출(필수). `noIncomeMode='targetDate'`, `targetDate`.
  - **[정해진 날 없음, 최대한 오래]** → `noIncomeMode='openEnded'`, `targetDate=undefined`.

### Step 4 — 고정지출 + 거주 형태 (한 화면)

- 제목: "매달 거의 고정으로 빠지는 돈이 있어요?"
- 보조: "월세, 통신비, 구독, 보험, 헬스 같은 것들. 없으면 그냥 [다음]."
- **상단 인라인 한 줄 — 거주 형태**: 칩 3개 가로 배치 [`자취` / `본가` / `룸쉐어`]. 한 탭으로 `housing` 세팅. (default `solo`)
  - 보조 텍스트: "거주 형태에 따라 생활 봉투를 다르게 잡아요(자취 7만 / 본가 3만 / 룸쉐어 5만)."
- 위젯(고정지출): 빈 상태 안내(`emptyBox`) + [고정 지출 추가] → 행 1개 추가 (이름/날짜/금액).
- **계절성 안내 노트**: 입력칸 아래 작은 회색 텍스트 — "가스비처럼 겨울에 크게 늘어나는 항목은 **연 평균값**으로 잡으세요. 예: 여름 2만 / 겨울 7만이면 4만으로." (`colors.muted`)
- 검증: 없음. 빈 배열 허용.

### Step 5 — 자동 차감 (데통 + 이벤트 적립) [NEW]

- 제목: "매달 자동으로 떼둘 돈이 있어요?"
- 보조: "고정비·저축 외에 매달 같은 금액으로 빠지는 것들. 봉투 가용 풀에서 미리 빠집니다."
- 위젯 2개 (세로 배치):
  - **데이트 통장**: `Switch` 토글 + 켜지면 `MoneyInput`("월 본인 부담액") 노출. default OFF.
    - 라벨: "데이트 통장"
    - 보조: "사귀는 사람과 공동 계좌 굴리고 있으면. 회당 평균 × 한 달 횟수 / 2 정도."
    - 저장: `datePoolMonthly`
  - **이벤트·기념일 적립**: `Switch` 토글 + 켜지면 `MoneyInput`("월 적립액") 노출. default ON, 4만원.
    - 라벨: "이벤트 적립"
    - 보조: "명절·생일·기념일 같은 갑작스러운 지출 대비. 권장 3-5만."
    - 저장: `eventReserveMonthly`
- 건너뛰기 가능. 둘 다 OFF면 다음 단계로.

### Step 6 — 라이프스타일 (선택)

- 제목: "평일이랑 주말 소비 리듬은?"
- 보조: "하루한도가 요일마다 다르게 분배돼요. 모르면 균등형."
- 위젯: `LifestylePicker` 그대로 재사용. 기본 `balanced`.

### Step 7~11 — 코치 5문항 (§5에 전문 정의)

각 스텝은 `CoachQuestionCard` 또는 `MoneyInput` 기반. 진행률 표시. **답 누르면 active 표시만**(자동 다음 X) — [다음] 버튼 명시. 건너뛰기 별도 텍스트 버튼, default 적용 + 다음.

### Step 12 — 저축 토글

- 제목: "저축도 챙길까요?"
- 보조: "지금은 안 챙겨도 돼요. 켜두면 매 구간 일정 금액을 먼저 떼두고 나머지로 하루한도를 잡아요."
- 위젯: Toggle (`Switch`) — 켜면 `MoneyInput` 노출(기본값 = 코치 추천액 = `suggestSavingAmount`).
- 토글 default 값은 Q5 답으로 결정(§5.5).

### Step 13 — 결과 (요약 + 인라인 수정 강조)

- 제목: "이렇게 시작할게요"
- **상단 한 줄 요약 (눈에 띄게)**: "한 달 가용 X만 / 이번 구간(N일) Y만" — `colors.teal`로 강조.
- 카드 7개(`Metric`/`BreakdownRow` 재사용, 각 카드 헤더에 영역명 명시):

  | 카드 | 표시 내용 | 수정 버튼 |
  |---|---|---|
  | 잔액 | currentBalance 만원 | [잔액 수정] → Step 1 |
  | 수입 | "월 X만 (다음 입금: 〇월 〇일)" | [수입 수정] → Step 2 |
  | 고정지출 | "월 X만 (n개 항목, 자취)" | [고정 수정] → Step 4 |
  | 자동 차감 | "저축 X / 데통 Y / 이벤트 Z" | [자동 차감 수정] → Step 5 |
  | 코치 답변 | "식사·약속·쇼핑·콘텐츠 미리보기 4줄" | [코치 다시 풀기] → Step 7 |
  | 저축 | "ON X만" 또는 "OFF" 회색 | [저축 수정] → Step 12 |
  | **봉투** | **6칸 인라인 편집** (식비/생활/교통/쇼핑/문화/기타). 각 봉투 카드: 라벨 + `MoneyInput` + 월/구간 듀얼 표시 | (직접 편집, 별도 [수정] 없음) |

- **봉투 카드 동작 (핵심)**:
  - 사용자가 한 봉투 값 바꾸면 → 즉시 **합 자동 갱신**(상단 요약 라인 변동).
  - 합이 livingBudget 초과하면 → 빨간 경고 배너 "가용보다 X만 초과. 다른 봉투 줄이거나 자동 차감 조정."
  - 합이 부족하면 (otherBudget < 1) → 노란 경고 "기타 봉투가 너무 작아요. 비상 대비 안 됨."
  - 봉투 간 합계 차이는 자동으로 기타 봉투에 흡수 (사용자가 식비 −2 하면 기타 +2 자동).

- 하단 큰 버튼 [이대로 시작하기] → `setupComplete=true` + §3.11 셋업 초기화 항목(currentPeriodStart 등 5개) 전부 세팅.

---

## 5. 코치 5문항 (전문 — 재설계)

> **변경**: 카테고리 답만으론 봉투 절대값 부정확. **카테고리 답 + 직접 입력 혼합**으로 재설계.
> 답이 그대로 봉투 절대값을 산출(§6). 한 탭 선택 X — **답 누르면 active 표시만**, [다음] 버튼 명시.

### Q1 — 식사 환경 (식비 봉투 절대 산출)
한 화면에 점심·저녁 2개 선택. `CoachQuestionCard` 2개 세로 배치.

**Q1-a 평일 점심**
- 질문: "평일 점심은 어떻게 해결해요?"
- 선택지:
  - `provided` — "회사·학교에서 나와요" → 식비 +0만
  - `lunchbox` — "도시락 싸 가요" → 식비 +2만
  - `buy` — "사 먹어요" → 식비 +10만
  - `delivery` — "배달도 자주" → 식비 +14만

**Q1-b 저녁**
- 질문: "저녁은 보통 어떻게?"
- 선택지:
  - `home` — "거의 해먹어요" → 식비 +8만
  - `mixed` — "반반 정도" → 식비 +13만
  - `buy` — "거의 사 먹어요" → 식비 +18만

→ **식비 봉투 = Q1-a 값 + Q1-b 값**

### Q2 — 친구 약속 (문화 봉투 직접 산출)
한 화면에 빈도·회당 2개 직접 입력. `MoneyInput` 2개.

- 빈도: "한 달에 친구·외식·술 약속 몇 번?" 숫자 입력 (0-30)
- 회당: "한 번에 평균 얼마 써요?" `MoneyInput`
- → **친구 약속 비용 = 빈도 × 회당**
- (default 빈도 5 / 회당 25,000)

### Q3 — 쇼핑 월 평균 (직접 입력)
- 질문: "옷·물건 등 한 달에 평균 얼마 써요?"
- 보조: "고정 구독 빼고. 옷·신발·가방·잡화 등."
- `MoneyInput` 한 칸. default 100,000.
- → **쇼핑 봉투 = 입력값**

### Q4 — 콘텐츠 월 평균 (직접 입력)
- 질문: "게임 현질·영화·공연 등 콘텐츠에 한 달 얼마?"
- 보조: "고정 구독(넷플릭스 등)은 제외 — 그건 고정비. 일회성 결제만."
- `MoneyInput` 한 칸. default 30,000.
- → **문화 봉투 = Q2 친구약속 비용 + Q4 콘텐츠**

### Q5 — 돈 관리 성향 (기타 봉투·저축 기본값)
- 질문: "평소 돈 관리 스타일은?"
- 보조: "이걸로 기타 봉투 여유 + 저축 토글 기본 상태를 정해요."
- 선택지:
  - `tight` — "빡빡하게, 한 푼이라도 아끼는 편" → 기타 여유 −1만, 저축 default ON
  - `balanced` — "적당히 균형" → 기타 그대로, 저축 default OFF
  - `loose` — "넉넉하게 쓰는 편" → 기타 여유 +2만, 저축 default OFF

---

## 6. 봉투 산출 로직 (직접 산출 — 가중치 매핑 폐기)

> **변경**: SPEC-period-budget §3.9 `coachRatios` 비율 매핑 방식 **폐기**. 코치 답이 곧 봉투 절대값.
> 사용자 답이 곧 봉투. 비현실적 비율 산출 가능성 0(예전 교통 18만, 쇼핑 29만 같은 오류 차단).

### 6.1 가용 풀(livingBudget) 계산

```
monthlyIncome = 수입 합(cadence별 월 환산):
  monthly  : amount
  biweekly : amount × 26/12   (1년 26회)
  weekly   : amount × 52/12   (1년 52회)
  irregular: max(0, amount ?? 0)
  ※ amount null인 항목은 0으로 처리(예측 안 함 — period 엔진과 동일)

monthlyFixed = state.fixedItems 합 (모두 월 단위로 가정)

livingBudget = max(0, monthlyIncome
                      − monthlyFixed
                      − (savingEnabled ? savingGoal : 0)
                      − datePoolMonthly        // 데통 신규 필드(§7)
                      − eventReserveMonthly)   // 이벤트 적립 신규 필드(§7)
```

### 6.2 봉투 절대값 산출 (직접)

```
// 식비 (Q1 답 합산)
LUNCH_COST   = { provided: 0, lunchbox: 2, buy: 10, delivery: 14 }   // 만원
DINNER_COST  = { home: 8, mixed: 13, buy: 18 }
mealBudget   = LUNCH_COST[Q1.lunch] + DINNER_COST[Q1.dinner]

// 문화 (Q2 + Q4)
socialBudget   = Q2.frequency × Q2.perVisit       // 회당 × 빈도 (원 단위 그대로)
cultureBudget  = socialBudget + Q4.contentMonthly

// 쇼핑 (Q3)
shoppingBudget = Q3.shoppingMonthly

// 생활 (거주 형태별 — §7 housing 신규 필드)
LIVING_COST = { solo: 7, family: 3, share: 5 }  // 만원
livingItemsBudget = LIVING_COST[housing]

// 교통 (정기권 외 추가분 default — 사용자 결과 화면에서 조정)
transportBudget = 3 만원

// 성향 보정(Q5)
otherAdjust = { tight: -1, balanced: 0, loose: +2 }[Q5]  // 만원

// 기타 (잔여)
sumFixed = mealBudget + cultureBudget + shoppingBudget + livingItemsBudget + transportBudget
otherBudget = livingBudget − sumFixed + otherAdjust
```

**합 = livingBudget** 보장 (otherBudget가 잔여를 흡수).

### 6.3 음수·과소 처리

```
if otherBudget < 1 만원:
  warning = '이 라이프엔 가용이 부족해요. 저축·데통 양보하거나 봉투를 조정하세요.'
  // 결과 화면 빨간 배너 + 가장 큰 봉투 옆에 [줄이기] 단축 버튼
```

비현실적 합산도 표시(`mealBudget > 50` 같은 경우): 노란 경고 "식비가 일반보다 큼. 확인하세요."

### 6.4 구간(period) 봉투 = 월 × (구간일수 / 30)

```
periodLimit[k] = round(monthlyBudget[k] × (구간일수 / 30))
```

UI 표시: "이번 구간 식비 9만 (월 환산 18만)" 같이 **듀얼 표시**(사용자 머릿속 월 단위 + 모델 구간 단위 동시 만족).

---

## 7. 데이터 모델 변경

### 7.1 신규 타입 — `BudgetCoachProfile`

```ts
type BudgetCoachProfile = {
  lunch:           'provided' | 'lunchbox' | 'buy' | 'delivery'
  dinner:          'home' | 'mixed' | 'buy'
  socialFrequency: number    // 월 약속 횟수 (직접 입력, 0-30)
  socialPerVisit:  number    // 회당 평균 금액 (원)
  shoppingMonthly: number    // 원
  contentMonthly:  number    // 원
  moneyStyle:      'tight' | 'balanced' | 'loose'
}

const initialCoachProfile: BudgetCoachProfile = {
  lunch:           'buy',
  dinner:          'mixed',
  socialFrequency: 5,
  socialPerVisit:  25000,
  shoppingMonthly: 100000,
  contentMonthly:  30000,
  moneyStyle:      'balanced',
}

// 신규 BudgetState 필드 (§2 참조 — SPEC-period-budget의 BudgetState에 추가)
//   datePoolMonthly:     number  (데이트 통장 월 본인 부담, 0이면 사용 안 함)
//   eventReserveMonthly: number  (이벤트·기념일·돌발 적립, default 40000)
//   housing:             'solo' | 'family' | 'share'  (거주 형태)
```

기존 9키 타입·`BUDGET_COACH_QUESTIONS` 상수는 **제거**(마이그레이션은 §8).

### 7.2 `CoachQuestionKey` 등 관련 타입

5개로 축소: `'mealPattern' | 'socialFreq' | 'shopHabit' | 'biggestLeak' | 'moneyStyle'`.
`CoachQuestion`·`BUDGET_COACH_QUESTIONS` 배열을 §5 정의대로 5문항 재구성.

### 7.3 `BudgetState`

`coachProfile: BudgetCoachProfile` 필드는 SPEC-period-budget §2.2에 이미 추가됨. 신규 타입으로 변경만.

---

## 8. 마이그레이션 (구버전 9문항 → 신규 5문항)

`sanitizeBudgetState`에서 구버전 `coachProfile` 자동 매핑 (재설계):

```
구버전 9키 → 신규 7키  (한 곳에서 못 정하면 default)

lunch:
  old.lunch === 'provided' → 'provided'
  old.lunch === 'home'     → 'lunchbox'
  old.lunch === 'buy'      → 'buy'
  old.lunch === 'mixed' or 누락 → 'buy'  // 보수적

dinner:
  if old.leak === 'delivery':                  → 'buy'
  elif old.kitchen in {'small','hard'}:        → 'buy'
  elif old.soloDinner === 'rare':              → 'home'   // 혼밥 적음 = 데이트/약속 위주
  elif old.soloDinner === 'fourPlus':          → 'mixed'  // 혼밥 많음 = 해먹기도 함
  else:                                        → 'mixed'

socialFrequency (월 약속 횟수, 직접 입력 숫자로 추정):
  old.socialCount === 'rare'      → 2
  old.socialCount === 'twoThree'  → 5    // 월 평균
  old.socialCount === 'fourPlus'  → 10
  (그 외)                         → 5

socialPerVisit:
  default 25000 (구버전 데이터 없음)
  단 old.split === 'mostlyMe' → 35000 (부담 큰 사람)

shoppingMonthly:
  old.personalSpend === 'under10'      → 50000
  old.personalSpend === 'tenTwenty'    → 150000
  old.personalSpend === 'twentyThirty' → 250000
  old.personalSpend === 'overThirty'   → 350000
  (그 외)                              → 100000

contentMonthly:
  old.leak === 'hobby' → 50000
  old.leak === 'snack' → 20000
  (그 외)              → 30000

moneyStyle:
  old.style === 'strict'   → 'tight'
  old.style === 'safe'     → 'loose'
  old.style === 'balanced' → 'balanced'
  (그 외)                  → 'balanced'

// 신규 BudgetState 필드 (구버전 데이터 없음 — default)
datePoolMonthly:     0          (사용 안 함)
eventReserveMonthly: 40000      (default ON 4만)
housing:             'solo'     (default — 자취 가정)
```

**구버전 사용자 처리**: 마이그레이션 후 신규 키가 다 채워지므로 **재셋업 강요 금지**. 사용자가
설정에서 "코치 다시 풀기"를 누르면 새 5문항 실행(이번 작업 범위는 onboarding만; 설정 진입은 후속).

---

## 9. UI 컴포넌트 재사용 맵 (필수 — 새로 만들지 말 것)

| 신규 화면/요소 | 재사용할 것 |
|---|---|
| 코치 Q1~Q5 카드 | `CoachQuestionCard` ([App.tsx:960](mobile-app/App.tsx#L960)) 그대로 |
| Step 2 분기 카드 3개 | `LifestylePicker` 카드 패턴 ([App.tsx:882](mobile-app/App.tsx#L882)) 스타일 복제 |
| Step 3 cadence 칩 | 카테고리 칩(`chip`/`chipActive`) 스타일 ([App.tsx:1550](mobile-app/App.tsx#L1550)) |
| 금액 입력 | `MoneyInput` ([812](mobile-app/App.tsx#L812)) |
| 일(day-of-month) 입력 | `DayInput` ([831](mobile-app/App.tsx#L831)) / `DayField` ([873](mobile-app/App.tsx#L873)) |
| 날짜(실제) 입력 | `@react-native-community/datetimepicker` (SPEC-period-budget §5.9-D, 1개 신규 의존성) |
| 결과 봉투 6칸 편집 | 기존 setupEnvelopeRow JSX ([1442](mobile-app/App.tsx#L1442)) 그대로 |
| Toggle (저축) | RN `Switch` (RN 내장, 신규 의존성 0) |
| 라벨+입력 래퍼 | `Field` ([787](mobile-app/App.tsx#L787)) |
| 진행률·이전/다음 버튼 | 기존 setup nav ([1494](mobile-app/App.tsx#L1494)) 골격 그대로, 총 스텝 수만 12로 갱신 |
| 스크롤/키보드 | 기존 `ScrollView` + `keyboardShouldPersistTaps="handled"` + `keyboardDismissMode="interactive"` + `KeyboardAvoidingView` ([1878](mobile-app/App.tsx#L1878)) 패턴 |

---

## 9.5 코치·셋업 화면 색상 토큰 (필수 — `colors` 객체로만)

> **문제**: 기존 `CoachQuestionCard`와 일부 셋업 스타일이 [App.tsx:237의 `colors` 객체](mobile-app/App.tsx#L237)
> 토큰을 일관되게 안 써서 앱 전체 톤에서 어긋나 있다. 신규/수정 화면은 **반드시 아래 토큰만** 사용한다.
> 새 색상 코드 추가 금지. `colors` 객체에 없는 색은 사용 금지(필요 시 사용자에게 보고 후 객체에 추가).

### 9.5.1 신규/수정 화면 전체에서 쓰는 토큰 매핑

| UI 요소 | 토큰 |
|---|---|
| 스크린 배경 | `colors.bg` (#F5F6F8) |
| 카드/모달 표면 | `colors.surface` (#FFFFFF) |
| 카드 테두리 | `colors.border` (#E8EAED) |
| 입력칸 테두리 | `colors.borderMd` (#D1D5DB) |
| 본문/제목 텍스트 | `colors.text` (#0F172A) |
| 설명·보조 텍스트 | `colors.muted` (#64748B) |
| 보조의 보조(placeholder, 비활성 라벨) | `colors.subtle` (#94A3B8) |
| **브랜드/액션 강조** | `colors.teal` (#0D9488) |
| 강조 진하게(눌림·아이콘) | `colors.tealDark` (#0F766E) |
| 강조 약하게(배경 틴트) | `colors.tealLight` (#F0FDFA) |
| 위험/초과/음수 텍스트 | `colors.danger` (#DC2626) |
| 위험 배경 틴트 | `colors.dangerBg` (#FEF2F2) |
| 성공/안전 텍스트 | `colors.success` (#16A34A) |
| 성공 배경 틴트 | `colors.successBg` (#F0FDF4) |
| 경고/주의 텍스트 | `colors.warning` (#D97706) |
| 경고 배경 틴트 | `colors.warningBg` (#FFFBEB) |

### 9.5.2 요소별 정확한 색 적용 규칙 (코치 5문항·셋업 12스텝·결과 화면)

**진행률 표시 ("N/12")**
- 배경: `colors.surface`
- 텍스트: `colors.muted`

**질문/스텝 제목 (`setupQuestionTitle`)**
- 텍스트: `colors.text`, 굵게, 큰 사이즈 그대로

**설명/보조 카피 (`setupQuestionCopy`)**
- 텍스트: `colors.muted`

**`CoachQuestionCard` (Step 6~10) — 선택지 chip/버튼**
- 카드 컨테이너 배경: `colors.surface`, 테두리: `colors.border`
- 선택지 비활성: 배경 `colors.surface` / 테두리 `colors.border` / 텍스트 `colors.text`
- 선택지 **활성**(사용자가 고른 답): 배경 `colors.teal` / 테두리 `colors.teal` / 텍스트 `colors.surface`(흰)
- 호버/눌림(pressed) 상태: 배경 `colors.tealDark` / 텍스트 `colors.surface`
- 라벨 좌측 보조(번호 표시 등): `colors.subtle`

**Step 2 분기 카드 3개**(정기/들쭉날쭉/없음) — `LifestylePicker` 카드 스타일 복제
- 비활성: 배경 `colors.surface` / 테두리 `colors.border` / 제목 `colors.text` / 부제 `colors.muted`
- 활성: 테두리 `colors.teal` (2px) / 좌측 체크 아이콘 색 `colors.teal` / 배경은 그대로(`colors.surface`)
- (배경을 통째로 teal로 바꾸지 말 것 — 라이프스타일 패턴과 동일하게 테두리·아이콘만 강조)

**Step 3 cadence 칩 (매달/격주/매주)**
- 비활성: 배경 `colors.tealLight` 옅게 / 테두리 `colors.border` / 텍스트 `colors.tealDark`
- 활성: 배경 `colors.teal` / 텍스트 `colors.surface`
- (지출 입력의 카테고리 칩과 같은 패턴 — [App.tsx:1550](mobile-app/App.tsx#L1550))

**Primary 버튼 ([다음], [이대로 시작하기], [확정])**
- 활성 배경: `colors.teal` / 텍스트: `colors.surface`
- 비활성(필수 미입력): 배경 `colors.borderMd` / 텍스트 `colors.subtle` (기존 `primaryButtonMuted` 패턴)
- 눌림: 배경 `colors.tealDark`

**Secondary 버튼 ([이전], [건너뛰기], [수입 추가], [고정 지출 추가])**
- 배경 `colors.surface` / 테두리 `colors.borderMd` / 텍스트 `colors.text`
- 눌림: 배경 `colors.bg`

**텍스트 버튼만(약함, 예: 결과 화면 [수정])**
- 텍스트 `colors.teal`, 배경/테두리 없음

**입력칸 (TextInput / MoneyInput / DayInput)**
- 배경 `colors.surface`
- 테두리 `colors.borderMd`, 포커스 시 `colors.teal`
- 텍스트 `colors.text`, placeholder `colors.subtle`

**저축 토글 (Step 11, RN `Switch`)**
- `trackColor`: `{ false: colors.borderMd, true: colors.teal }`
- `thumbColor`: `colors.surface`
- iOS도 동일 토큰 강제 (RN Switch가 iOS에서 ios-default를 안 쓰도록 명시 지정).

**결과 화면 카드(Step 12) — `Metric`/`BreakdownRow` 재사용**
- 카드 배경 `colors.surface`, 테두리 `colors.border`
- 라벨 `colors.muted`, 값 `colors.text`
- 6봉투 합 = 총 예산 강조줄: 값 `colors.teal`
- 저축 OFF 상태: 라벨·값 모두 `colors.subtle` 회색 처리

**빈 상태 박스 (`emptyBox`)**
- 배경 `colors.bg` (스크린과 같게) / 테두리 dashed `colors.border` / 텍스트 `colors.muted`

**Step 4 위험 상태(잔액<고정 같은 경고 라인 — 결과 화면에서만 노출)**
- 텍스트 `colors.danger`, 배경 `colors.dangerBg`, 테두리 `colors.overBorder`

### 9.5.3 금지 사항 (코덱스가 추측 못 하게)

- `colors` 객체에 **없는** 색상 코드 직접 작성 금지 (`#abcdef` 식 인라인 금지).
- 그라데이션·그림자 새로 추가 금지(기존 스타일에 있는 것만).
- 화면별로 다른 액센트 색 부여 금지(전 화면 액센트는 `colors.teal` 일관).
- 카테고리별 고유 색상(식비=주황 등) 금지 — 봉투 warning 3색만이 의미 색상.
- 다크모드 분기 금지(스코프 밖).
- `CoachQuestionCard`의 기존 인라인 스타일에 `colors` 토큰을 안 쓰는 부분이 있으면 **이번 작업에서 토큰으로 교체**(다른 스타일은 건드리지 말 것 — 색상만).

### 9.5.4 검증 (테스터)

새 셋업 12스텝을 처음부터 끝까지 진행하며:
- [ ] 모든 화면이 같은 배경색(`colors.bg`)으로 이어진다(튀는 화면 0).
- [ ] 활성 선택지·진행률·primary 버튼이 전부 같은 `colors.teal`이다(톤 어긋남 0).
- [ ] 비활성/회색 요소가 전부 `colors.muted`/`colors.subtle`/`colors.borderMd` 중 하나다.
- [ ] 다른 화면(홈/캘린더/봉투 탭)으로 이동했을 때 톤이 같다("다른 앱 같은 화면" 0).

---

## 10. UX 정확성 바 (체크리스트)

> SPEC-period-budget §5.9 전부 적용 + 셋업 특수 규칙:

- [ ] 모든 입력칸: 키보드 떠도 그 칸이 보임 (날짜 피커·금액·텍스트 모두).
- [ ] 모든 버튼: 키보드 떠 있을 때 **첫 탭 동작**(`keyboardShouldPersistTaps="handled"`).
- [ ] 필수 미입력 시 [다음] 비활성(`primaryButtonMuted` 회색) + 누르면 이유 Alert.
- [ ] 진행률 "현재/13" 모든 스텝에 표시.
- [ ] [이전] 버튼 항상 작동(Step 1 제외). 데이터 손실 없이 돌아감.
- [ ] 건너뛸 수 있는 스텝(고정·자동차감·라이프스타일·코치·저축)은 [건너뛰기] 텍스트 버튼 **분리** + default 적용 + 다음.
- [ ] Step 2의 3 분기 카드는 한 탭에 선택 + 자동 다음(이중 탭 금지).
- [ ] **Step 3 수입 폼 = 2행 레이아웃 + 배경 `colors.surface`** (이름 칸 flex 1.2, 회색 배경 금지). "매달 며칠?" 라벨 = 기준일 위 mini 라벨로(별 줄 X). #1 fix.
- [ ] **코치 답 누르면 active 표시만**, 자동 다음 금지. [다음] 명시 버튼. #2 fix.
- [ ] **`MoneyInput` 빈 문자열 허용** — 다 지우면 0으로 강제 복구 금지. 빈 문자열 유지, 저장 시점만 numeric 변환. #3 fix.
- [ ] **저축 라벨**: "월" 아니라 "다음 입금일까지 떼어둘 저축액"으로 정확히. #3 fix.
- [ ] **결과 화면 [수정] 버튼 라벨**: 각각 "잔액 수정"/"수입 수정"/"고정 수정"/"자동 차감 수정"/"코치 다시 풀기"/"저축 수정"로 영역명 명시. 단독 [수정] X. #5 fix.
- [ ] **결과 화면 봉투 카드**: 6칸 인라인 편집 + 합 변경 시 상단 요약 자동 갱신. 초과/부족 시 경고 배너.
- [ ] Step 13 결과 [수정] 점프 → 돌아오면 다시 Step 13로(상태 보존).
- [ ] 빈 상태(고정지출 0개) 안내 문구 — 빈 화면 0.
- [ ] **봉투 탭 직접 편집 금지**: 봉투 카드에 limit 수정 입력칸·[수정] 버튼 추가 0. 이동만. #7 D2 fix.
- [ ] **봉투 탭 UI 통일**: 헤더 "봉투" `styles.title`, "이번 구간 총 예산" `BreakdownRow` 패턴, 문구 "봉투끼리 금액 옮기기", 다른 탭과 톤 동일. #6 fix.
- [ ] [이대로 시작하기] 누르면 §3.11 셋업 초기화 5항목(`currentPeriodStart`/`currentPeriodStartingBalance`/`currentPeriodPlan`/`currentTransfers`/`coachProfile`) 전부 세팅됨 검증.

---

## 11. 테스트 / 완료 기준

### 유닛 테스트(`vitest`, `mobile-app/__tests__/onboarding.test.ts`)

```
suggestEnvelopeBudgets (직접 산출):
- default profile (lunch='buy', dinner='mixed', socialFreq=5, perVisit=25000, shopping=100000, content=30000, style='balanced') 
  + livingBudget=560000 (헬스 없는 사용자 케이스 가정)
  → 식비 230000, 문화 155000 (사회 125000+콘텐츠 30000), 쇼핑 100000, 생활 70000, 교통 30000, 기타=잔여.
- lunch='provided' + dinner='home' → mealBudget=80000 (회사 점심 + 해먹기).
- 친구 약속 5×30000=150000 → socialBudget=150000 → 문화=180000(콘텐츠 30000 더).
- otherBudget < 1만 → warning 플래그 true 반환.
- housing='family' → livingItemsBudget=30000 (자취 70000보다 적음).
- moneyStyle='loose' → otherAdjust=+20000 (기타 봉투 늘림).
- moneyStyle='tight' → savingEnabledDefault=true 반환.

가용 풀(livingBudget):
- 수입 135만 - 고정 23.4만 - 저축 35만 - 데통 20만 - 이벤트 4만 → livingBudget=52.6만.
- savingEnabled=false → 저축 차감 안 됨.
- amount=null 수입 → 0으로 계산(예측 안 함).
- cadence='biweekly' amount=500000 → 월 환산 500000 * 26/12 ≈ 1083333.

구간 변환:
- 월 봉투 식비 200000, 구간일수 15 → periodLimit=100000.

마이그레이션(`sanitizeBudgetState` 신규 분기):
- 구버전 {lunch:'buy', soloDinner:'rare', socialCount:'fourPlus', personalSpend:'overThirty', leak:'shopping', kitchen:'small', style:'strict', split:'half', socialType:'meal'}
  → {lunch:'buy', dinner:'buy'(kitchen small), socialFrequency:10, socialPerVisit:25000, shoppingMonthly:350000, contentMonthly:30000, moneyStyle:'tight'}.
- leak='delivery' + kitchen='small' → dinner='buy'.
- soloDinner='rare' + 다른 leak 없음 + kitchen 정상 → dinner='home'.
- split='mostlyMe' → socialPerVisit=35000.
- 신규 BudgetState 필드: datePoolMonthly=0, eventReserveMonthly=40000, housing='solo' 기본값.

셋업 완료 시 §3.11 초기화 항목(currentPeriodStart 등 5개)가 세팅되는지(통합 테스트 형태).
```

### 수동 시나리오 (사람 테스터)

1. **신규 사용자 전 코스**: 12스텝 끝까지 진행 + Step 12 [시작하기] → 홈에서 영웅 숫자 계산됨.
2. **수입 3분기 각각**:
   (a) 정기 monthly + 금액 입력 → 다음 입금일 자동 산출.
   (b) 들쭉날쭉 + 마지막 입금일만 입력 → 추정 다음일 계산.
   (c) 수입 없음 + targetDate → "목표일까지" 모드.
3. **저축 OFF**: Step 11에서 끔 → Step 12 결과에 "저축 OFF" 회색, 봉투 합 = 잔액 전부 분배.
4. **건너뛰기**: 고정/라이프스타일/코치 5스텝/저축 모두 [건너뛰기] → default로 결과 도달, 영웅 숫자 정상.
5. **인라인 수정**: Step 12에서 봉투 1개 숫자 변경 → 합 변동 즉시 반영. 다른 카드 [수정] → 해당 스텝 점프 → 돌아옴.
6. **구버전 사용자**: 구 데이터로 켜기 → 셋업 안 다시 뜸(이미 setupComplete), coachProfile 자동 매핑됨, 봉투/하루한도 정상.
7. **UX 바**: §10 체크리스트 전 항목.

### Definition of Done

- [ ] `npm run typecheck` 통과.
- [ ] `npm run test` — 신규 유닛 테스트 + 기존 테스트 전부 green.
- [ ] 수동 시나리오 1~7 통과.
- [ ] 신규 컴포넌트 신설 0 (§9 재사용 맵 준수).
- [ ] 신규 의존성: `@react-native-community/datetimepicker` 1개만 (이미 SPEC-period-budget에서 추가됨).
- [ ] 기존 `BUDGET_COACH_QUESTIONS` 9문항 코드·상수 전부 제거 후 참조 0 확인.

---

## 12. NOT in scope (이번 작업 제외)

- 설정 화면에서 "코치 다시 풀기" / "수입 수정" 등 사후 편집 UI — 후속.
- 코치 답에 따른 *동적 추천 메시지*("배달 자주 시키시네요? 식비 봉투 더 크게 잡았어요") — 후속.
- 결과 스텝에서 "다른 사용자는 보통 이래요" 같은 벤치마크 — 후속.
- 첫 진입 인트로/튜토리얼 — 기존 setupIntro 문구 유지.
