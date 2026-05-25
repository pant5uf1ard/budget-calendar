# 구현 명세서 — 입금 구간(Period) 기반 예산 엔진 전환

> 대상: Codex (구현 담당). 이 문서는 **설계 결정이 모두 끝난 상태**의 구현 지시서다.
> 새로운 설계 판단을 하지 말고, 아래 정의된 타입·함수·동작을 그대로 코딩한다.
> 모호하면 추측하지 말고 멈추고 질문한다. 모든 변경은 단일 파일 `mobile-app/App.tsx`와
> 신규 테스트 파일에 한정한다.
>
> 작성: 설계자(Claude). 검증: 사람(수동 테스터).

---

## 0. 한눈에 보는 그림

이 앱은 "오늘 얼마 써도 되나(영웅 숫자)"를 보여주는 생활비 코치다. 지금 코드는 모든 계산이
**달(calendar month)** 에 묶여 있어, "다음 입금일까지" 같은 구간을 제대로 못 다루고
월 경계에서 틀린 값을 낸다. 이 작업은 계산의 축을 **달 → 입금 구간(period)** 으로 바꾼다.

```
                    [ 핵심 모델 ]

  구간(period) = [ 구간시작일 , 다음 보충일 )
                          │
       다음 보충일(periodEnd) = ┌ 다음 입금일        (수입 있음)
                              ├ 목표 날짜          (수입 없음 + 목표일 설정)
                              └ 오늘+30일 롤링      (수입 없음 + 열린 구간)

  영웅 숫자(오늘 한도) = (현재잔액 − 구간내 남은 고정지출 − 저축) ÷ 남은 가중일수 × 오늘가중치

  ※ 미래 입금 "금액"은 계산에 안 들어간다(다음 구간 시작이므로). "날짜"만 쓴다.
  ※ 현재잔액 = 지금 지갑에 있는 실제 쓸 수 있는 돈(live wallet). 지출 입력 시 즉시 차감된다.
```

### 0.1 용어집

- **영웅 숫자(hero number)**: 홈 최상단의 "오늘 남은 돈". 앱의 중심.
- **구간(period)**: 한 번의 보충(입금/목표)에서 다음 보충까지의 기간. 달이 아님.
- **보충일(periodEnd)**: 구간의 끝. 다음 입금일 또는 목표 날짜.
- **봉투(envelope)**: 지출 카테고리별 예산 칸. 이 앱에선 **6개 카테고리와 1:1**.
- **live wallet**: 현재잔액이 "지금 실제 가진 돈"이라는 모델. 지출하면 잔액이 줄고, 입금하면 는다.
- **cadence**: 수입 반복 주기 (`monthly`/`biweekly`/`weekly`/`irregular`).

---

## 1. 설계자가 확정한 핵심 결정 (테스터가 검증할 가정)

> Codex는 아래를 **그대로 구현**한다. 사람 테스터는 아래가 실제로 원하는 동작인지 QA에서 확인한다.

| # | 결정 | 근거 |
|---|---|---|
| A | **live wallet**: `currentBalance`는 "지금 가진 돈". 지출 추가 시 `currentBalance -= 금액`, 수정/삭제 시 역연산, 입금 확정 시 `+= 금액`. 영웅 숫자는 잔액을 앞으로 나눈 순수 runway. | 계산 단순·정직. "있는 돈 ÷ 남은 날". 과거 지출 별도 차감 안 함(이미 잔액에 반영). |
| B | 미래 입금 **금액은 계산에 안 씀**. 다음 입금일은 *다음* 구간 시작이라, 이번 구간 예산엔 안 들어감. `amount`는 정보용(`null` 허용). | "안 들어온 돈으로 미리 안 씀" = "다음 입금까지 버티기" 약속. |
| C | 봉투 = **6개 카테고리와 1:1**(`식비/생활/교통/쇼핑/문화/기타`). `ExpenseRecord.envelopeId`를 제거하고 `category`를 봉투 키로 직접 사용. | 입력 시 선택 1번(카테고리=봉투). 현재 카테고리6 ≠ 봉투4 불일치 버그 제거. |
| D | 봉투는 **soft view**. 봉투를 초과해도 지출은 막지 않음. 영웅 숫자가 마스터. | 사용자 통제권. 봉투는 "어디로 갔나" 경고일 뿐. |
| E | 봉투 총액은 구간 중 **잠금**. 단 **봉투 간 이동(transfer)** 허용(총액 불변). 전체 재배분은 **입금일(구간 경계)** 에만. | 코치 신뢰(자기기만 방지) + 유연성. |
| F | 수입 없는 사용자 지원: `incomes` 빈 배열 + `noIncomeMode`(`targetDate`/`openEnded`). 저축 프레임은 선택 오버레이로 강등. | TAM 확장(취준생·학생·휴직). 저축 강요 거부감 제거. |

---

## 1.5 기존 코드 재사용 맵 (최우선 원칙)

> **원칙: 새로 만들기 전에 반드시 기존 것을 먼저 찾아 쓴다.** 아래는 그대로 살려서 재사용할
> 자산이다. 같은 일을 하는 코드를 새로 짜면 안 된다. 신규 함수는 "기존에 없을 때"만 만든다.

### 그대로 재사용 (수정 없이)
- **입력 컴포넌트**: `MoneyInput`([App.tsx:812](mobile-app/App.tsx#L812)) — 모든 금액 입력(이동 금액, 입금 확정액, 봉투 한도)에 재사용. `DayInput`([831](mobile-app/App.tsx#L831))/`DayField`([873](mobile-app/App.tsx#L873)) — monthly 기준일의 '일' 입력. `Field`([787](mobile-app/App.tsx#L787)) — 라벨+입력 래퍼.
- **선택 UI 패턴**: `LifestylePicker`([882](mobile-app/App.tsx#L882))·`CoachQuestionCard`([960](mobile-app/App.tsx#L960))의 칩/카드 패턴 → cadence 선택기, noIncomeMode 선택기를 **같은 패턴으로** 만든다(스타일 재사용).
- **표시 컴포넌트**: `Metric`([905](mobile-app/App.tsx#L905)), `BreakdownRow`([995](mobile-app/App.tsx#L995)) → 리포트 "계획 vs 실제" 줄에 재사용. `ExpenseRow`([914](mobile-app/App.tsx#L914)) → 기록 목록.
- **포맷/유틸**: `money`/`calendarMoney`/`formatMoneyText`/`numeric`/`isoDate`/`addDays`/`makeId`/`clampDay`/`weightForDate`/`lifestyleOption`/`sumForDate`/`recordsForDate` — 전부 재사용.
- **키보드/레이아웃 인프라**: `KeyboardAvoidingView` 셸([1878](mobile-app/App.tsx#L1878)), `keyboardVisible` 리스너([1062](mobile-app/App.tsx#L1062)), `SafeAreaView`, `Keyboard.dismiss()` — 신규 화면도 이 패턴을 그대로 따른다(§5.9).
- **모달 패턴**: 지출 모달([1908](mobile-app/App.tsx#L1908))의 구조(`Modal` transparent + 내부 `KeyboardAvoidingView` + 닫기 리셋 `closeExpenseModal`) → 입금 확정 모달·이동 모달·리포트를 **같은 골격**으로.
- **state 갱신 패턴**: `patch()`([1102](mobile-app/App.tsx#L1102)), `sortByDayThenName`, sanitize 파이프라인.

### 수정해서 재사용 (재작성 금지, 기존 뼈대 유지)
- `calculatePlan`([730](mobile-app/App.tsx#L730)) — **시그니처와 요일가중치(`weightForDate`/`lifestyleOption`) 재사용**, 본문은 §3.5로 **교체**. 기존 [762](mobile-app/App.tsx#L762)의 "오늘 쓴 돈 되더하기" *의도*만 §3.5의 `basePool = … + todaySpent`로 가져온다. **주의: 762 코드를 그대로 복붙하지 말 것** — 기존은 '기록된 날 제외' 가중치라 §3.5와 구조가 달라 충돌(§3.5가 정답).
- `calculateEnvelopeStatus`([567](mobile-app/App.tsx#L567)) — warning 3단계(over/watch/safe)·구조 유지, 필터를 month→period로(§3.8).
- `coachRatios`([520](mobile-app/App.tsx#L520))/`suggestEnvelopeBudgets`([558](mobile-app/App.tsx#L558)) — profile 가감 로직 패턴 유지, 키를 6 카테고리로(§3.9).
- `recurringAmountBetween`([629](mobile-app/App.tsx#L629))/`remainingWeightBetween`([657](mobile-app/App.tsx#L657))/`expenseBetweenDates`([649](mobile-app/App.tsx#L649)) — 이미 date-range 기반. **period 계산의 주력으로 재사용**.
- 셋업 result 스텝의 봉투 편집 UI([1442](mobile-app/App.tsx#L1442)) — 리포트의 "다음 구간 봉투 조정"에 재사용.
- sanitize 함수들 — 마이그레이션 한 곳에 추가(§4).

### 신규로 만드는 것 (기존에 없을 때만)
- `nextOccurrence`/`periodBounds`/`projectRunway`/`transferEnvelope`/`closePeriodWithIncome` (§3) — 기존에 없는 신규 로직.
- 봉투 탭(`renderEnvelopes`), 입금 확정 배너/모달, 리포트 화면 (§5) — 단, 위 재사용 컴포넌트로 조립.
- 날짜 선택기 — §5.9-D 참조(표준 라이브러리 1개 추가).

---

## 2. 데이터 모델 변경

### 2.1 새 타입

```ts
// 신규
type Cadence = 'monthly' | 'biweekly' | 'weekly' | 'irregular'

// 변경: IncomeItem ({ day, amount } → 아래)
type IncomeItem = {
  id: string
  name: string
  amount: number | null     // null = 금액 미정. 계산에 사용 안 함(정보·리포트용).
  cadence: Cadence
  anchorDate: string        // ISO 'yyyy-mm-dd'. 기준 입금일.
                            // monthly: 이 날짜의 '일(day)'이 매달 반복.
                            // weekly/biweekly: 이 날짜로부터 7/14일 주기.
                            // irregular: '마지막 실제 입금일'. 다음 예상일은 추정으로 계산(§3.3).
  estIntervalDays?: number  // irregular 전용. 사용자가 입력/덮어쓴 예상 간격. 없으면 추정·폴백.
}

// 변경: BudgetEnvelope
type BudgetEnvelope = {
  id: string                // = category 이름(고정). 예: '식비'
  name: Category            // 6개 카테고리 중 하나. id와 동일 값.
  periodLimit: number       // 이번 구간 예산(과거 monthlyLimit 대체).
  // spent 필드는 제거(파생 계산으로 대체, §3.5). 저장하지 않음.
}

// 변경: ExpenseRecord — envelopeId 제거
type ExpenseRecord = {
  id: string
  date: string
  amount: number
  memo: string
  category: Category        // 이게 곧 봉투 키.
  createdAt: string
  // envelopeId  ← 제거
}

// 신규: 구간 스냅샷(입금일 리포트용)
type EnvelopeTransfer = {
  from: Category
  to: Category
  amount: number
  at: string                // ISO datetime
}

type PeriodSnapshot = {
  id: string
  startDate: string         // ISO. 이 구간 시작일.
  endDate: string           // ISO. 이 구간이 닫힌 날(다음 입금 확정일).
  startingBalance: number   // 구간 시작 시 currentBalance.
  confirmedIncome: number   // 이 구간을 닫으며 확정된 입금액(다음 구간 시드). 정보용.
  envelopePlan: { category: Category; limit: number }[]  // 구간 시작 시 코치가 잡은 '초기' 계획.
  transfers: EnvelopeTransfer[]                          // 구간 중 일어난 이동 로그.
  actualByCategory: { category: Category; amount: number }[]  // 구간 동안 카테고리별 실제 지출(닫을 때 계산).
}
```

### 2.2 BudgetState 변경

```ts
type BudgetState = {
  setupComplete: boolean
  currentBalance: number
  // 저축(선택 오버레이로 강등)
  savingEnabled: boolean        // 신규. false면 저축 로직 전부 비활성(영웅 숫자만).
  savingGoal: number
  savingDeadline: number
  lifestyleType: LifestyleType
  weekendMultiplier?: number

  incomes: IncomeItem[]         // 빈 배열 허용(수입 없음).
  // 수입 없는 사용자용(incomes가 빈 배열일 때만 의미)
  noIncomeMode: 'targetDate' | 'openEnded'   // 신규. 기본 'openEnded'.
  targetDate?: string           // 신규. ISO. noIncomeMode==='targetDate'일 때 사용.

  fixedItems: FixedItem[]
  envelopes: BudgetEnvelope[]   // 항상 6개(카테고리 1:1).
  expenses: ExpenseRecord[]

  // 구간 추적(신규)
  currentPeriodStart: string             // ISO. 현재 구간 시작일. 셋업·매 입금확정·자동롤 때 갱신.
  currentPeriodStartingBalance: number   // 구간 시작 시점의 currentBalance 스냅. 스냅샷 startingBalance 출처.
  currentPeriodPlan: { category: Category; limit: number }[]  // 구간 시작 시 잠긴 '초기' 봉투 계획. 스냅샷 envelopePlan 출처.
  currentTransfers: EnvelopeTransfer[]   // 현재 구간의 이동 로그(닫을 때 스냅샷으로 이동).
  periods: PeriodSnapshot[]              // 닫힌 구간들의 기록.

  // 코치 프로필(신규) — 셋업 때 BudgetState에 영속 저장. 입금확정 시 다음 구간 봉투 추천에 재사용.
  coachProfile: BudgetCoachProfile

  // 신규 자동 차감 + 거주 (SPEC-onboarding §7 참조)
  datePoolMonthly: number               // 데이트 통장 월 본인 부담 (0이면 사용 안 함)
  eventReserveMonthly: number           // 이벤트·기념일 적립 (default 40000)
  housing: 'solo' | 'family' | 'share'  // 거주 형태 → 생활 봉투 추정 기준


  dailyNotes: Record<string, string>
  noSpendDates: string[]
}
```

### 2.3 상수 변경

```ts
// 봉투 = 카테고리 1:1. DEFAULT_ENVELOPE_NAMES를 CATEGORIES와 동일하게.
const CATEGORIES: Category[] = ['식비', '생활', '교통', '쇼핑', '문화', '기타']  // 변경 없음
// makeDefaultEnvelopes(): CATEGORIES를 그대로 6개 봉투로 생성. id=name=카테고리, periodLimit=0.
```

```ts
function makeDefaultEnvelopes(): BudgetEnvelope[] {
  return CATEGORIES.map(name => ({ id: name, name, periodLimit: 0 }))
}
```

---

## 3. 계산 엔진 (이 작업의 두뇌 — 가장 정밀하게)

> 모두 순수 함수. UI에서 분리되어 테스트 가능해야 한다. §8 테스트가 이 함수들을 직접 검증한다.

### 3.1 날짜 유틸 (신규/보강)

```ts
// 'yyyy-mm-dd' → Date (로컬). 이미 isoDate 있음. 역함수 parseIso 추가.
function parseIso(key: string): Date  // new Date(y, m-1, d)

// 두 날짜 사이 일수(b - a), 자정 기준. 음수 가능.
function daysBetween(a: Date, b: Date): number  // round((b-a)/86400000)

// 월 길이 보정: 해당 월에 day가 없으면 그 달 마지막 날로 clamp.
function clampDayToMonth(year: number, monthIndex: number, day: number): Date
```

### 3.2 수입 1건의 "다음 발생일" — `nextOccurrence(item, from)`

`from`(포함) 이후의 가장 빠른 발생일을 반환. **달을 넘어도 정확히** 계산.

```
nextOccurrence(item, from, fallbackInterval?):  // from: Date, 반환: Date. from(포함) 이후 가장 빠른 발생일.
  // fallbackInterval: irregular에서 item.estIntervalDays가 없을 때 쓸 추정값(periodBounds가 estimateInterval(state)로 주입).
  anchor = parseIso(item.anchorDate)
  if item.cadence === 'monthly':
    for k in 0..2:
      cand = clampDayToMonth(from.year, from.month + k, anchor.getDate())
      if cand >= from: return cand
    return clampDayToMonth(from.year, from.month + 3, anchor.getDate())
  if item.cadence === 'weekly' or 'biweekly':
    step = (item.cadence === 'weekly') ? 7 : 14
    // anchor가 미래면 그대로, 과거면 step 배수만큼 진행해 from 이상 첫 값.
    n = max(0, ceil(daysBetween(anchor, from) / step))   // daysBetween(anchor,from) 음수면 0
    return addDays(anchor, n * step)
  // irregular
  interval = max(1, item.estIntervalDays ?? fallbackInterval ?? 30)   // §3.3, 0 방지
  cand = anchor
  while cand < from: cand = addDays(cand, interval)
  return cand
```

### 3.3 irregular 예상 간격 — `estimateInterval(item)`

해당 수입의 과거 확정 입금 간격 평균. 데이터는 `periods[].confirmedIncome`가 아니라
**입금 확정 이력**에서 온다 → 구현 편의상 `periods`의 `endDate`들을 입금 이벤트로 보고
연속 구간의 endDate 차이 평균을 쓴다(해당 income이 구간을 닫은 경우). 최소 2건 이상일 때만.
없으면 `undefined` 반환(상위에서 `estIntervalDays` 또는 30 폴백).

```
estimateInterval(state):   // item별로 구분하지 않는다(수입원 보통 1개). state.periods 전체 사용.
  dates = state.periods.map(p => parseIso(p.endDate)) 오름차순
  if dates.length < 2: return undefined
  gaps = 인접 차이(일)
  return round(average(gaps))
```

> MVP 단순화: 입금 이벤트를 income별로 구분 저장하지 않으므로, periods 전체의 endDate
> 간격 평균을 써도 된다(수입원이 보통 1개라 충분). 정밀 분리는 NOT in scope.

### 3.4 구간 경계 — `periodBounds(state, today)`

```
periodBounds(state, today):  // 반환 { start: Date, end: Date | null, overdue: boolean }
  start = parseIso(state.currentPeriodStart)
  fb = estimateInterval(state)   // irregular 폴백(없으면 undefined)

  if state.incomes.length > 0:
    // ★ #9 수정: end는 '오늘 이후'가 아니라 '구간시작 직후 첫 발생일'.
    //   확인 안 한 입금일이 지나면 end가 과거가 되어 daysUntilEnd=0 → 한도가 줄며 "입금 확인" 유도.
    //   (오늘 이후로 잡으면 미확정 시 다음 사이클까지 늘어나 한도가 부풀려지는 버그.)
    cands = state.incomes.map(it => nextOccurrence(it, addDays(start, 1), fb))
    end = min(cands)
    overdue = (end <= today)   // 예정 입금일이 지났는데 미확정 → 배너(§5.4)
    return { start, end, overdue }

  // 수입 없음
  if state.noIncomeMode === 'targetDate' && state.targetDate:
    target = parseIso(state.targetDate)
    return { start, end: target, overdue: (target <= today) }   // 목표일 지남 → 재설정 유도

  // openEnded: 구간시작 + 30일 롤링(고정 today+30이 아님 — start 기준이어야 봉투 윈도우가 안 늘어남, #15)
  end = addDays(start, 30)
  return { start, end, overdue: (end <= today) }   // 30일 경과 → 자동 롤(§3.4-note)
```

> **자동 롤(§3.4-note, #15 수정)**: 수입 없는 사용자는 입금 이벤트가 없어 구간이 안 닫힌다.
> 앱 로드/홈 진입 시 `overdue===true`(end<=today)이고 incomes가 비었으면(openEnded/targetDate)
> **자동으로 구간을 롤**한다: `closePeriodNoIncome(state, today)` 호출(=closePeriodWithIncome의
> confirmedIncome=0·잔액 불변 버전). 이로써 봉투 spent 윈도우가 무한히 안 늘어난다(start 갱신).
> 수입 있는 사용자는 자동 롤 금지 — 반드시 §5.4 입금 확정을 거친다(실제 입금액 반영 위해).
>
> openEnded는 같은 공식 하나로 영웅 숫자를 만든다. "이 페이스면 며칠 버팀" projection은 §3.6 별도.
>
> **DST 주의**: `daysBetween`(ms 나눗셈)과 `addDays`(setDate 기반)는 DST 전환일에 1일 어긋날 수
> 있다. 한국은 DST 없음 → 실무상 안전. 글로벌 대비하려면 둘 다 로컬 자정 정규화. (현재 가정: no-DST)

### 3.5 메인 계산 — `calculatePlan(state, today)` (재작성)

기존 시그니처 유지(`(state, today) => plan`). 반환 필드는 아래로 정리(소비처 §5.1).

```
calculatePlan(state, today):
  { start, end, overdue } = periodBounds(state, today)
  endForCalc = end ?? addDays(today, 30)        // null 방어(openEnded는 이미 +30)
  // 남은 가중일수: [today, endForCalc) 의 요일 가중치 합. 최소 1.
  remainingWeightedDays = sum over d in [today, endForCalc):
                            weightForDate(d, state.lifestyleType)
  remainingWeightedDays = max(remainingWeightedDays, 1)

  // 구간 내 '아직 안 빠진' 고정지출: [today, endForCalc) 사이 발생분.
  fixedRemaining = recurringAmountBetween(state.fixedItems, today, endForCalc, /*includeEnd*/false)

  // 저축(선택): 활성 + 아직 안 뗀 경우만.
  savingReserved = (state.savingEnabled && state.savingGoal > 0)
                     ? state.savingGoal : 0
  // ※ MVP: 저축은 구간당 1회 떼는 단순 모델. 정교한 저축일 분기는 NOT in scope.

  todaySpent = sumForDate(state, isoDate(today))   // 먼저 구한다(아래 보정에 필요)

  // ★ 이중차감 방지(중요): currentBalance는 live wallet이라 '오늘 쓴 돈'까지 이미 빠져 있다.
  //   그대로 남은 날로 나누면 오늘 지출이 미래 날까지 깎고 + 오늘에서 또 빠지는 이중차감 발생.
  //   → 오늘 쓴 돈을 풀에 도로 더해 '오늘 시작 시점' 풀로 만든 뒤 나눈다.
  //   (기존 코드 App.tsx:762의 todayBaseBudget = remainingBudget + todaySpent 와 동일 의도)
  basePool = currentBalance + todaySpent − fixedRemaining − savingReserved
  dailyUnit = basePool / remainingWeightedDays

  todayWeight = weightForDate(today, state.lifestyleType)
  todayAllowance = dailyUnit * todayWeight
  todayRemaining = todayAllowance − todaySpent

  // ★ #5 주의: remainingWeightedDays는 [today, endForCalc)의 '모든' 날 가중치 합이다.
  //   기존 코드의 remainingWeight처럼 '이미 기록된 날 제외'를 하지 않는다(live wallet에선 과거 지출이
  //   이미 잔액에 반영되어 [today,end) 범위에 과거가 없음; 오늘분은 +todaySpent 보정으로 처리).
  //   end가 과거(overdue)면 범위가 비어 max(.,1)=1 → 오늘 한도=basePool(전액) = "입금 확인" 넛지.

  return {
    periodStart: start,
    periodEnd: end,                    // null이면 openEnded
    daysUntilEnd: end ? max(0, daysBetween(today, end)) : null,
    overdue,
    dailyUnit,            // allowanceForDate(§5.8)가 이 값 × 요일가중치로 캘린더 셀 계산
    todayAllowance,
    todaySpent,
    todayRemaining,
    fixedRemaining,
    savingReserved,
    mode: deriveMode(state),           // 'income' | 'targetDate' | 'openEnded'
    modeLabel: deriveModeLabel(state), // §3.7
    runwayDays: projectRunway(state, today),  // §3.6
  }
```

> **live wallet 핵심**: `spendablePool`은 `currentBalance`에서 출발한다(과거 지출을 따로 빼지
> 않는다 — 이미 잔액에 반영됨). 단, **오늘 안에 입력한 지출**은 `todaySpent`로 빼서
> 오늘 남은 한도를 보여준다. 어제까지의 지출은 이미 잔액을 깎았으므로 중복 차감 금지.

### 3.6 runway projection — `projectRunway(state, today)`

```
projectRunway(state, today):  // 반환 number(일) | null
  // 최근 14일 평균 일일 지출
  recent = expenses in [today-14, today]
  avgDaily = sum(recent) / 14
  if avgDaily <= 0: return null
  return floor(currentBalance / avgDaily)
```

홈에서 openEnded 모드일 때 "이 페이스면 약 N일 버틸 수 있어요"로 표시(§5.1).

### 3.7 모드/라벨 — 저축 강등

```
deriveMode(state):
  if state.incomes.length > 0: return 'income'
  return state.noIncomeMode   // 'targetDate' | 'openEnded'

deriveModeLabel(state):
  'income'     → '다음 입금일까지'
  'targetDate' → '목표일까지'
  'openEnded'  → '페이스 관리 중'
```

> 기존 `'저축일까지 관리 중'` 라벨/모드는 **삭제**. 저축은 라벨이 아니라 선택 오버레이.

### 3.8 봉투 상태 — `calculateEnvelopeStatus(state, today)` (재작성)

달 기준(`monthPrefix`) → **구간 기준**으로. 봉투 spent = 현재 구간 동안의 카테고리별 지출.

```
calculateEnvelopeStatus(state, today):
  { start } = periodBounds(state, today)
  startKey = isoDate(start); todayKey = isoDate(today)
  spentByCat = {}
  for e in state.expenses where startKey <= e.date <= todayKey:
    spentByCat[e.category] += e.amount
  return state.envelopes.map(env => {
    spent = spentByCat[env.name] ?? 0
    remaining = env.periodLimit − spent
    usage = env.periodLimit > 0 ? spent / env.periodLimit : 0
    warning = remaining < 0 ? 'over' : usage >= 0.8 ? 'watch' : 'safe'
    return { ...env, spent, remaining, usageRatio: usage, warning }
  })
```

### 3.9 봉투 추천 — `suggestEnvelopeBudgets` (직접 산출 — SPEC-onboarding §6이 정답)

> **★ 변경**: 기존 `coachRatios` 비율 매핑 방식은 폐기. 코치 답으로 봉투 절대값을 **직접 산출**한다.
> 자세한 산출 공식은 **SPEC-onboarding.md §6** 참조. 본 섹션은 그 호출 인터페이스만 정의.

`coachRatios`가 반환하는 키를 **6개 카테고리**로 바꾼다. 예비비는 제거(저축으로 이전).

```
coachRatios(profile) → { 식비, 생활, 교통, 쇼핑, 문화, 기타 }  // 합 = 1
```

**기본 비율(가감 전, 합=1.00):** `식비 0.34 / 생활 0.14 / 교통 0.12 / 쇼핑 0.16 / 문화 0.16 / 기타 0.08`

**모든 profile 분기의 신 카테고리 매핑(기존 lines 520-542 전수 이식 — 빠짐없이):**

```
// 식비 (식사·배달·군것질)
lunch === 'buy'              : 식비 += 0.08
lunch === 'provided'|'home'  : 식비 -= 0.04
soloDinner === 'fourPlus'    : 식비 += 0.06
soloDinner === 'rare'        : 식비 -= 0.05
kitchen === 'small'|'hard'   : 식비 += 0.04
leak === 'delivery'          : 식비 += 0.06
leak === 'snack'             : 식비 += 0.03
// 문화 (약속·놀이·사교) — 기존 '개인소비'의 사교성 분기 이전
socialCount === 'fourPlus'   : 문화 += 0.10
socialCount === 'twoThree'   : 문화 += 0.05
socialCount === 'rare'       : 문화 -= 0.06
socialType === 'play'|'cafe' : 문화 += 0.05
split === 'mostlyMe'         : 문화 += 0.06
split === 'lessMe'           : 문화 -= 0.04
leak === 'social'            : 문화 += 0.04
// 쇼핑 (개인 소비·취미) — 기존 '개인소비'의 소비성 분기 이전
personalSpend === 'under10'      : 쇼핑 -= 0.08
personalSpend === 'twentyThirty' : 쇼핑 += 0.06
personalSpend === 'overThirty'   : 쇼핑 += 0.12
leak === 'shopping'              : 쇼핑 += 0.06
// 교통
socialType === 'transport'   : 교통 += 0.05
// 기타 (버퍼) — 기존 '예비비' 분기 이전(예비비 봉투는 삭제됨)
style === 'safe'             : 기타 += 0.05
style === 'strict'           : 기타 -= 0.03
// (생활: 기본값 유지, 별도 가감 없음)
```

**각 항목 하한(가감 후 clamp):** `식비 0.18 / 생활 0.06 / 교통 0.06 / 쇼핑 0.08 / 문화 0.08 / 기타 0.04`.
마지막에 6개 합으로 정규화(기존 패턴 동일).
`suggestEnvelopeBudgets`는 `livingBudget * ratio[category]`를 각 봉투 `periodLimit`에 넣어 6개 반환.
`livingBudget`은 `monthPlannedLivingBudget` 재사용하되 **저축은 `savingEnabled`일 때만** 차감(§5.7).

### 3.10 봉투 간 이동 — `transferEnvelope(state, from, to, amount)`

```
transferEnvelope(state, from, to, amount):  // 반환 새 state
  // 총액 불변. from/to는 카테고리.
  envelopes = state.envelopes.map(env =>
    env.name === from ? { ...env, periodLimit: env.periodLimit - amount } :
    env.name === to   ? { ...env, periodLimit: env.periodLimit + amount } : env)
  currentTransfers = [...state.currentTransfers,
                      { from, to, amount, at: new Date().toISOString() }]
  return { ...state, envelopes, currentTransfers }
```

> 가드: `amount > 0`. from의 periodLimit가 음수가 되어도 막지 않음(soft, 경고만 §5.3).
> 총액은 절대 변하지 않음(테스트 §8로 검증).

### 3.11 구간 닫기 — `closePeriod(state, today, newBalance)`

입금 확정/자동롤 시: 현재 구간을 스냅샷으로 저장 → 잔액을 `newBalance`로 **재조정(set)** →
새 구간 시작 → 다음 구간 봉투 코치 재추천. **모든 출처가 명시됨(미정의 변수 0).**

> **★ #7 이중가산 방지**: 잔액에 `+= 입금액` 하지 **않는다**. live wallet이라 사용자는 이미
> 통장 입금을 보고 있을 수 있어 더하면 이중계산. 대신 §5.4 모달이 "입금 포함 지금 잔액"을 받아
> `newBalance`로 **세팅**한다. `confirmedIncome`(정보용) = `newBalance − 직전 잔액`.

```
closePeriod(state, today, newBalance):   // newBalance = 재조정된 현재 잔액
  start = state.currentPeriodStart; endKey = isoDate(today)
  actualByCategory = calculateEnvelopeStatus(state, today)
                       .map(e => ({ category: e.name, amount: e.spent }))
  snapshot = {
    id: makeId(),
    startDate: start,
    endDate: endKey,
    startingBalance: state.currentPeriodStartingBalance,   // ← 출처 확정(§2.2 필드)
    confirmedIncome: newBalance - state.currentBalance,    // ← 정보용, 차액
    envelopePlan: state.currentPeriodPlan,                 // ← 출처 확정(§2.2 필드)
    transfers: state.currentTransfers,
    actualByCategory,
  }
  nextState = { ...state, currentBalance: newBalance }     // 재추천은 재조정 후 잔액 기준
  newEnvelopes = suggestEnvelopeBudgets(nextState, state.coachProfile)  // ← coachProfile은 영속(§2.2)
  return {
    ...state,
    currentBalance: newBalance,
    currentPeriodStart: endKey,
    currentPeriodStartingBalance: newBalance,              // 새 구간 시작 잔액
    currentPeriodPlan: newEnvelopes.map(e => ({ category: e.name, limit: e.periodLimit })),  // 새 초기계획 잠금
    currentTransfers: [],
    periods: [...state.periods, snapshot],
    envelopes: newEnvelopes,
  }

// #15 자동 롤(수입 없는 사용자): 잔액·입금 없음. newBalance = 현재 잔액 그대로.
closePeriodNoIncome(state, today):
  return closePeriod(state, today, state.currentBalance)
```

> **셋업 완료 시에도 동일 초기화**: `setupComplete=true` 시점에 `currentPeriodStart=isoDate(today)`,
> `currentPeriodStartingBalance=currentBalance`, `currentPeriodPlan=현재 envelopes 매핑`, `currentTransfers=[]`,
> `coachProfile=화면 coachProfile`을 state에 함께 저장한다(이 5개가 안 세팅되면 첫 구간 스냅샷이 깨짐).

---

## 4. 마이그레이션 (sanitize)

기존 사용자 데이터(`{day, amount}` 수입, `monthlyLimit` 봉투, `envelopeId` 지출)를 무손실 변환.
`sanitizeBudgetState`와 하위 sanitize 함수에서 처리.

### 4.1 수입 — `sanitizeIncomeItem`

```
sanitizeIncomeItem(item, index):
  // 구버전: { day:number, amount:number }
  // 신버전 필드가 있으면 그대로, 없으면 day로부터 monthly 승격.
  cadence = isValidCadence(item.cadence) ? item.cadence : 'monthly'
  anchorDate = isIsoDateKey(item.anchorDate)
                 ? item.anchorDate
                 : isoDate(clampDayToMonth(today.year, today.month, item.day ?? 25))
  amount = (item.amount === null) ? null : sanitizeAmount(item.amount)  // 0이어도 null 아님
  return { id, name, amount, cadence, anchorDate, estIntervalDays? }
```

> 구버전 사용자는 전부 `monthly` + 이번 달 그 '일'의 anchorDate로 승격 → 무손실, 즉시
> cross-month 버그까지 고쳐진 상태로 동작.

> **★ #16 필수**: 기존 `sanitizeBudgetState`의 수입 필터 `.filter(item => item.amount > 0)`
> ([App.tsx:374](mobile-app/App.tsx#L374))를 **제거**한다. 새 모델은 금액 미정(`amount: null`/0)
> 수입을 허용하며, 계산엔 "날짜"만 쓰므로 금액 0이라고 버리면 **사용자의 입금일이 삭제**된다
> (기능 핵심 파괴). 대신 `anchorDate`가 유효한 항목만 남기는 필터로 교체.

### 4.2 봉투 — `sanitizeEnvelope` + 강제 정규화

봉투는 **항상 정확히 6개(카테고리 1:1)** 가 되도록 정규화. 기존 데이터의 `monthlyLimit`를
같은 이름 카테고리의 `periodLimit`로 매핑. 매칭 안 되는 옛 봉투(개인소비/예비비 등)는
규칙으로 흡수:

```
정규화:
  for each cat in CATEGORIES:
    old = savedEnvelopes.find(e => e.name === cat)
    periodLimit = old ? sanitizeAmount(old.monthlyLimit ?? old.periodLimit) : 0
  // 흡수 규칙(옛 기본 봉투 이름 → 신 카테고리):
  //   '개인소비' → '문화'에 합산,  '예비비' → 버림(저축으로),
  //   매칭 안 되는 임의 이름 → '기타'에 합산.
  결과: CATEGORIES 순서로 6개 봉투.
```

### 4.3 지출 — `sanitizeExpenseRecord`

`envelopeId` 필드 무시(제거). `category`만 정규화(`normalizeCategory`, 기존 함수). 끝.

### 4.4 신규 state 필드 기본값 (`sanitizeBudgetState`)

```
savingEnabled:     // ★ #12: 마이그레이션 승격과 정상저장을 구분.
                   saved.savingEnabled === undefined        // 진짜 레거시(필드 없음)일 때만
                     ? (saved.savingGoal > 0)               //   → savingGoal>0 이면 true 승격
                     : Boolean(saved.savingEnabled)         // 신버전은 저장값 그대로(끈 사용자 존중)
noIncomeMode:      ('targetDate'|'openEnded') 검증, 기본 'openEnded'
targetDate:        isIsoDateKey면 유지, 아니면 undefined
currentPeriodStart:        isIsoDateKey(saved.currentPeriodStart) ? 유지 : isoDate(today)
currentPeriodStartingBalance: Number.isFinite(saved.currentPeriodStartingBalance)
                              ? saved... : sanitizeAmount(결과 currentBalance)   // 없으면 현재 잔액
currentPeriodPlan: 배열이면 검증 유지, 아니면 결과 envelopes를 {category,limit} 매핑으로 초기화
currentTransfers:  배열이면 검증 후 유지, 아니면 []
periods:           배열이면 각 스냅샷 검증 후 유지, 아니면 []
coachProfile:      객체면 각 키 검증 후 유지, 아니면 initialCoachProfile
```

---

## 5. UI 변경

> 화면 단위 동작 명세. 기존 컴포넌트/스타일 최대 재사용. JSX 세부는 기존 패턴을 따른다.

### 5.1 홈 `renderHome` ([App.tsx:1515](mobile-app/App.tsx#L1515))

영웅 숫자 영역:
- "오늘 남은 돈" = `plan.todayRemaining` (변경 없음).
- `plan.modeLabel` 표시 (저축 라벨 제거됨, §3.7).
- 모드별 보조 한 줄:
  - `income`: "다음 입금까지 D-{plan.daysUntilEnd}"  (overdue면 "입금 확인 필요" 강조)
  - `targetDate`: "목표일까지 D-{daysUntilEnd}"
  - `openEnded`: "이 페이스면 약 {plan.runwayDays}일" (runwayDays null이면 숨김)

지출 빠른 입력:
- **봉투 선택기(EnvelopePicker) 제거.** 카테고리 칩이 곧 봉투. `addExpense` 호출 시
  envelopeId 인자 제거(§5.5). `quickEnvelopeId` state 및 [App.tsx:1562-1565](mobile-app/App.tsx#L1562) 블록 삭제.
- 입력창엔 봉투 잔액 **표시 안 함**(영웅 숫자만 강조).

봉투 섹션:
- 홈의 "이번 달 봉투" 블록([App.tsx:1579](mobile-app/App.tsx#L1579))은 **홈에서 제거**하고 신규 "봉투 탭"으로 이동(§5.3).
- 제목 "이번 달 봉투" → 사용 안 함.

### 5.2 탭 추가 — `Tab` 타입

```ts
type Tab = 'home' | 'calendar' | 'envelopes' | 'settings'  // 'envelopes' 신규
```
하단 탭 바에 "봉투" 추가. `renderEnvelopes()` 신규.

### 5.3 봉투 탭 `renderEnvelopes` (신규)

- `calculateEnvelopeStatus(state, today)` 결과 6개를 카드로. 각 카드: 카테고리명,
  `spent 사용 · periodLimit 한도`, `remaining`, warning(`over`→"한도 초과", `watch`→"빠르게 줄고 있어요").
- **봉투 간 이동 UI(이게 유일한 조정 방법)**: 헤더에 [봉투끼리 금액 옮기기] 버튼 → from/to 카테고리 선택 + 금액 입력 → `transferEnvelope`. 성공 시 Alert "쇼핑 → 식비 2만원 옮겼어요". 총액 불변 안내.
- 상단에 "이번 구간 총 예산 {sum periodLimit}" 표시(이동해도 안 변함을 시각적으로).
- **★ D2 결정 강조 — 봉투 limit 직접 편집 금지**:
  - 봉투 탭 안에서 `periodLimit` 숫자를 직접 입력·수정하는 UI를 만들지 마라.
  - 카드 우측 [수정] 버튼 같은 거 추가 금지. 카드는 read-only.
  - 조정은 오직 [봉투끼리 금액 옮기기]로만 가능(총액 불변).
  - 전체 재배분은 입금 확정(§5.4) → 리포트(§5.6) → 다음 구간 봉투 추천 단계에서만.
  - 사용자가 봉투를 직접 수정하고 싶어 할 때를 위해 안내 텍스트: "구간 중엔 잠겨요. 옮기기로 조정하세요." (`colors.subtle`)

### 5.3.1 봉투 탭 UI 통일 (다른 탭과 톤 맞춤)

- 헤더 "봉투" 텍스트: `styles.title` 사용(홈/캘린더와 동일 폰트·크기·spacing).
- "이번 구간 총 예산 ~~" 표시: `eyebrow` + `BreakdownRow` 패턴으로(다른 카드들과 같이).
- 섹션 간 margin·padding: 다른 탭과 동일 `styles.section` 사용.
- 색상은 §9.5 토큰만(별도 §9.5 in SPEC-onboarding 참조).

### 5.4 입금 확인 프롬프트 (신규)

`plan.overdue === true` + `incomes.length>0`이면(예정 입금일 지났는데 미확정), 홈 상단 배너:
- "OO 입금 들어왔어요?" → [확정] 누르면 모달:
  - **잔액 재조정 입력**: "입금 포함, 지금 잔액이 얼마예요?" `MoneyInput`, 기본값 = `currentBalance + (income.amount ?? 0)`.
    (금액 미정 수입이면 기본값 = `currentBalance` → **0 아님, 항상 확정 가능**. #19 해결.)
  - [확정] → `closePeriod(state, today, 입력한 잔액)` 호출 → 입금일 리포트(§5.6) 표시.
- [아직] 누르면 배너만 숨김. **구간은 그대로** → `end`가 과거라 하루한도가 계속 줄어듦(#9: 다음
  사이클로 부풀지 않음). 다음 실행 때 배너 재노출.
- **수입 있는 사용자는 자동 롤 금지** — 반드시 이 확정을 거친다(실제 잔액 반영 위해). 자동 롤은
  수입 없는 사용자(openEnded/targetDate)만(§3.4-note `closePeriodNoIncome`).

### 5.5 지출 추가/수정 — envelopeId 제거 + live wallet 차감

`addExpense(date, amountText, memo, category)` — envelopeId 인자 삭제, `hasEnvelope` 체크 삭제.
지출 추가/수정/삭제 시 **currentBalance 동기 갱신**:

```
addExpense:    expenses += rec;  currentBalance -= amount
deleteExpense: 대상 amount 복원:  currentBalance += rec.amount
saveModalExpense(수정): currentBalance += (old.amount) ; currentBalance -= (new.amount)
```

> 모든 잔액 연산은 `setState` 한 번 안에서 expenses 변경과 함께 처리(원자성). 음수 잔액 허용
> (경고만, §5.1 영웅 숫자 음수 빨강).

모달/빠른입력의 `EnvelopePicker`·`quickEnvelopeId`·`modalEnvelopeId` 관련 state·JSX 전부 제거.
[startEditingExpense](mobile-app/App.tsx#L1155)에서 `setModalEnvelopeId` 제거.

> **#8 주의(엣지)**: 수정 시 잔액 델타 = `new.amount − old.amount`로만 처리(날짜가 바뀌어도 동일).
> 단 **이미 닫힌 구간의 스냅샷은 소급 재계산하지 않는다**(out of scope) — 과거 날짜로 옮기면
> 그 구간 리포트는 안 바뀜. 코덱스는 이를 보정하려 하지 말 것. 또 `deleteExpense`는 잔액 복원만
> 하고 `noSpendDates`는 건드리지 않는다(기존 동작 유지).

### 5.6 입금일 리포트 (신규 모달/화면)

`closePeriodWithIncome` 직후 가장 최근 `periods` 스냅샷으로:
- "지난 구간({start}~{end}) 정리"
- 카테고리별: 계획(envelopePlan) vs 실제(actualByCategory) 막대/숫자.
- 가장 많이 초과한 카테고리 1개 짚기: "문화에서 계획보다 N원 더 썼어요".
- "다음 구간 봉투 이렇게 잡을까요?" → 새 추천 봉투(이미 `closePeriod...`가 세팅) 보여주고
  사용자가 숫자 조정 가능(기존 result 스텝의 봉투 편집 UI 재사용).

### 5.7 셋업 `renderSetup` ([App.tsx:1242](mobile-app/App.tsx#L1242))

- **수입 스텝(step 1)**: `DayInput`(일 입력) → **주기 + 기준일 입력**으로 변경.
  - cadence 선택(월급/격주/주급/들쭉날쭉) + anchorDate(날짜 피커). 금액(선택, 비우면 null).
  - "수입이 없어요" 옵션 → `incomes=[]` + 다음에서 noIncomeMode 질문.
- **수입 없음 분기**: "이 돈, 언제까지 써야 해요?" → [특정 날짜까지: targetDate] / [정해진 날 없음: openEnded].
- **저축 스텝**: 결과 화면의 저축 제안을 **선택**으로. "저축도 챙길까요?" 토글 → 켜면 `savingEnabled=true`
  + 제안액, 끄면 `savingEnabled=false`(영웅 숫자만). 기본 꺼짐(저축 강등).
- **★ #17 필수**: 기존 저축 강제 시드 경로를 `savingEnabled` 게이트 뒤로 옮긴다.
  `finishSetup`([App.tsx:1284](mobile-app/App.tsx#L1284))·`applyEnvelopeSuggestion`([1222](mobile-app/App.tsx#L1222))·
  result-seed effect([1092](mobile-app/App.tsx#L1092))이 `savingGoal`을 **무조건 세팅하면 안 됨**.
  `savingEnabled===false`면 `savingGoal=0`으로 두고 봉투 배분도 저축 차감 없이 계산. 안 그러면
  "기본 꺼짐"이 거짓이 됨.
- 결과 스텝: 봉투 6개 편집(기존 UI 재사용, `monthlyLimit`→`periodLimit`, 라벨 "구간 예산").
- `currentPeriodStart`를 셋업 완료 시 `isoDate(today)`로 세팅.

### 5.8 캘린더 `renderCalendar` ([App.tsx:1654](mobile-app/App.tsx#L1654))

- **`allowanceForDate` 재정의(#6 필수)**: 기존은 제거된 plan 필드(`plan.deadline/weekday/weekend/afterDeadlineUnit`)를 읽어 **컴파일 깨짐**. 새 정의:
  ```
  allowanceForDate(date, plan, lifestyle):
    return plan.dailyUnit * weightForDate(date, lifestyle)   // 구간 내 균등 분배 × 요일가중치
  ```
- 캘린더는 **항상 현재 plan 기준**으로 표시(`calculatePlan(state, 그달)` 호출 제거 — 달이 계산 단위가 아님).
  과거/미래 날짜는 참고용 회색. 톤 로직(`dayTone`/`spendingTone`)은 그대로 재사용(plan 필드 의존 없음).

> 캘린더의 month-locked 헬퍼(`monthExpenseTotal`, `remainingWeightRaw`, `expenseUntilDay`,
> `incomeUntilDay`, `fixedUntilDay`, `nextIncomeDay`, `monthPlannedLivingBudget`의 month 의존)는
> §3 신규 함수로 대체되며 **사용처가 사라지면 삭제**한다(죽은 코드 정리, §7).

---

### 5.9 UI/UX 정확성 바 (실사용자 기준 — 위반 시 미완성)

> 실사용자가 "이상하다 / 안 눌린다 / 입력창이 안 보인다"고 느끼면 안 된다. 아래는 **모든 신규·수정
> 화면에 공통 적용**되는 강제 규칙이다. §8.3 수동 시나리오에서 항목별로 확인한다.

**A. 키보드가 입력창을 가리면 안 된다**
- 텍스트/숫자 입력이 있는 모든 화면·모달은 기존 패턴을 그대로 따른다: 바깥 `ScrollView`(또는 `KeyboardAvoidingView`) + `keyboardShouldPersistTaps="handled"` + iOS `behavior="padding"`(셸/모달 기존값과 동일).
- 입력 중인 칸은 **항상 키보드 위에 보여야 한다**. 모달은 지출 모달([1911](mobile-app/App.tsx#L1911)) 골격을 복제 → 내부 `KeyboardAvoidingView`로 입력칸을 밀어올린다. 입력칸이 화면 하단에 위치하면 ScrollView로 스크롤되어 보이게 한다.
- 스크롤·바깥 탭으로 키보드 닫힘(`keyboardDismissMode="interactive"` 또는 탭 시 `Keyboard.dismiss()`), 기존 `keyboardVisible` 상태 재사용.

**B. 버튼은 첫 탭에 동작해야 한다 (죽은 버튼 0)**
- `keyboardShouldPersistTaps="handled"` 필수 — 키보드 떠 있을 때 버튼 첫 탭이 "키보드만 닫고 끝"나는 RN 흔한 버그 방지.
- 모든 `TouchableOpacity`에 실제 동작하는 `onPress` 연결. 화면에 보이는데 아무것도 안 하는 버튼 금지.
- 동작 불가 상태(이동 금액 0, 입금 확정액 0, 필수 미입력)면 버튼을 **비활성 시각화**(기존 `primaryButtonMuted` 스타일) + 누르면 기존 `Alert.alert`로 이유 안내(addExpense 검증 패턴과 동일).

**C. 피드백·확인**
- 입력 검증 실패는 기존 `Alert.alert(제목, 설명)` 패턴으로 일관되게.
- 봉투 이동 성공 시 확인 메시지("쇼핑 → 식비 2만원 옮겼어요"). 입금 확정·구간 닫기 같은 비가역 동작은 실행 전 확인.
- 지출 삭제는 기존 동작 유지하되, 실수 방지용 확인 1단계 추가 권장(기존 패턴 내에서).

**D. 날짜 입력 (신규 — 표준 라이브러리 1개만 추가)**
- monthly cadence: **신규 의존성 없이** `DayInput`(일) 재사용 → 현재 달 + 그 일로 `anchorDate` 합성.
- weekly/biweekly/irregular anchorDate, targetDate: 실제 달력 날짜 필요 → `@react-native-community/datetimepicker`(Expo 공식 지원, 네이티브 UX) **1개만** 추가해 재사용. 3-필드 수기입력·자체 달력 제작 금지(이상한 UX 유발).

**E. 빈 상태·경계 표시**
- 모든 목록은 비었을 때 기존 `emptyBox`/`emptyText` 패턴으로 안내(빈 화면 금지): 봉투 탭 한도 0, 리포트 이력 없음 등.
- 음수는 빨강(`dangerText`): 영웅 숫자 음수, 봉투 remaining 음수. D-day는 음수로 안 보이게 `max(0, …)` clamp.
- 큰 숫자/긴 카테고리명이 줄을 깨지 않게(기존 텍스트 스타일·줄바꿈 재사용).

**F. 상태 정리·일관성**
- 모달 닫으면 입력 state 리셋(기존 `closeExpenseModal` 패턴). 입금 확정 → 리포트 → 닫으면 홈으로 깔끔히 복귀하고 영웅 숫자·봉투가 즉시 갱신.
- 신규 "봉투" 탭은 기존 탭 바 스타일과 동일하게.
- 숫자 입력은 `keyboardType="numeric"`, 텍스트 입력은 `autoCorrect={false} spellCheck={false}`(기존 패턴) 일관 적용.

---

## 6. 구현 순서 (단계별, 각 단계 독립 테스트 가능)

> "make the change easy, then make the easy change". 구조 먼저, 동작 나중. 단계마다 타입체크 통과 + 사람 QA.

1. **단계 1 — 테스트 인프라**: §8.1. 러너 설치, 첫 더미 테스트 green.
2. **단계 2 — 타입 + 마이그레이션**: §2, §4. 앱이 빌드되고 기존 데이터가 새 타입으로 로드되는지(앱 켜짐). UI는 아직 옛 값 그대로여도 됨.
3. **단계 3 — 계산 엔진**: §3.1~3.8. 순수 함수 교체. §8.2 유닛 테스트 전부 green. 홈 영웅 숫자가 구간 기준으로 나오는지.
4. **단계 4 — 봉투 카테고리 1:1 + live wallet**: §5.1, §5.5. envelopeId 제거, 잔액 차감. 봉투 탭(§5.3).
5. **단계 5 — 수입 모델 UI + 수입 없음**: §5.7. 셋업에서 cadence/anchorDate/none 입력.
6. **단계 6 — 구간 닫기 + 입금 확인 + 리포트 + 이동**: §3.10, §3.11(`closePeriod`/`closePeriodNoIncome`), §5.4, §5.6.
   - **자동 롤 배선**: 앱 로드 후(`loaded && setupComplete`) `useEffect`에서 `plan.overdue && incomes.length===0`이면
     `closePeriodNoIncome` 1회 호출(무한 루프 방지 — 호출 후 start가 갱신돼 overdue 해제됨).
7. **단계 7 — UX 정확성 패스**: §5.9 전 화면 점검(키보드 가림·죽은 버튼·빈 상태·날짜 피커). §8.3 UX 체크 통과.
8. **단계 8 — 죽은 코드 정리**: §7.

각 단계 시작 전 §1.5 재사용 맵을 확인해 **기존 것부터 쓴다**. 각 단계 끝에 `npm run typecheck`(=`tsc --noEmit`) 통과 필수.

---

## 7. 정리할 죽은 코드 (이 변경으로 사용처 소멸 시)

사용처가 0이 되면 삭제, 아니면 남김(다른 데서 쓰면 언급만):
`nextIncomeDay`, `incomeUntilDay`, `fixedUntilDay`, `expenseUntilDay`, `monthExpenseTotal`,
`monthPlannedLivingBudget`(저축 분기 제거 후 잔존 여부 확인), `remainingWeightRaw`,
`nextSavingDeadlineDate`, `recurringAmountBetween`의 month 분기 등. **rg로 참조 0 확인 후** 삭제.

---

## 8. 테스트 계획

### 8.1 테스트 러너 도입 (현재 0개)

- `vitest` 사용(빠르고 RN 무관한 순수 함수 테스트에 충분). devDependency 추가.
- `package.json`에 `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`.
- 순수 함수(§3·§4)를 테스트하려면 App.tsx에서 **계산/마이그레이션 함수를 export** 해야 함.
  → 최소 변경: 해당 함수들에 `export` 키워드 추가(컴포넌트는 default export 유지).
- 테스트 파일: `mobile-app/__tests__/budget-engine.test.ts`.

### 8.2 유닛 테스트 (코덱스가 작성, 모든 케이스 green이 완료 기준)

`nextOccurrence`:
- monthly anchor=15일, from=10일 → 15일. from=20일 → 다음달 15일(**cross-month**).
- monthly anchor=31일, from=2월 → 2월 말일(clamp).
- weekly anchor, from 정확히 anchor → anchor. from anchor+8 → anchor+14.
- biweekly 동일 패턴 14주기.
- irregular estInterval=20, anchor=1일, from=25일 → 21일+? (anchor부터 20씩 더해 from 이상 첫 값).

`periodBounds`:
- 수입 monthly 10일, currentPeriodStart=이번달 10일, today=25일 → end=다음달 10일, overdue=false(**cross-month 핵심 회귀**).
- 수입 2개(10일/25일), currentPeriodStart=직전, today=5일 → end=가장 빠른 다음 발생일.
- **#9 overdue**: 수입 monthly 10일, currentPeriodStart=지난달 10일, today=15일(이번달, 미확정) → end=이번달 10일(과거), overdue=true. (다음달로 점프하지 않음)
- incomes=[], noIncomeMode=targetDate, targetDate=+40일 → end=targetDate, overdue=false.
- incomes=[], openEnded, currentPeriodStart=today → end=today+30. start=today-31 → end 과거, overdue=true(자동롤 트리거).

`calculatePlan`:
- 잔액 80만, 다음입금 5일 뒤, 고정 0, 저축 off, balanced(가중 1) → dailyUnit=16만, todayAllowance=16만.
- 고정 5만 추가 → spendablePool=75만.
- savingEnabled+savingGoal 10만 → pool에서 차감.
- 오늘 지출 3만 입력됨 → todayRemaining = todayAllowance − 3만.
- 잔액 < 고정 → spendablePool 음수 → todayRemaining 음수(조기 경고용).
- openEnded → todayAllowance 산출되고 runwayDays 계산됨.

`calculateEnvelopeStatus`:
- 구간 시작 이후 식비 지출 합만 식비 봉투 spent에 반영(다른 카테고리 격리).
- periodLimit 초과 → warning='over', remaining 음수.
- 구간 시작 이전 지출은 제외(경계 정확성).

`transferEnvelope`:
- 식비→문화 2만 후 두 봉투 합 = 이동 전 합(**총액 불변 invariant**).
- currentTransfers에 1건 기록.

마이그레이션:
- 옛 `{day:10, amount:2000000}` → `{cadence:'monthly', anchorDate: 이번달10일, amount:2000000}`.
- 옛 봉투 `개인소비` → `문화`에 합산, `예비비` → 버림. 결과 정확히 6개.
- 옛 지출 `envelopeId` 무시되고 category 유지.
- 구버전 savingGoal>0 → savingEnabled=true 승격.

`closePeriod`(재조정 모델):
- **#7**: 잔액이 newBalance로 **세팅**됨(`+=` 아님). confirmedIncome = newBalance − 직전잔액.
- currentPeriodStart=오늘, currentPeriodStartingBalance=newBalance. periods에 스냅샷 1건
  (startingBalance=직전 currentPeriodStartingBalance, envelopePlan=직전 currentPeriodPlan, actualByCategory 정확).
- currentTransfers 비워짐. 새 봉투 추천 + currentPeriodPlan 새로 잠금.
- `closePeriodNoIncome`: newBalance=현재잔액 → 잔액 불변, confirmedIncome=0, start만 갱신.

마이그레이션 추가:
- **#16**: 옛 수입 `{day:10, amount:0}`(금액 미정) → 삭제되지 않고 `{cadence:'monthly', anchorDate:이번달10일, amount:null/0}` 유지(입금일 보존).
- **#12**: `savingEnabled` 없는 레거시 + savingGoal>0 → true 승격. 신버전 savingEnabled=false + savingGoal>0(잔존) → **false 유지**(재승격 안 됨).
- 신규 필드 기본값: currentPeriodStartingBalance=currentBalance, currentPeriodPlan=envelopes 매핑, coachProfile=initialCoachProfile.

`addExpense`/`deleteExpense`(live wallet):
- 추가 → currentBalance −= amount. 삭제 → += amount. 수정 → += old − new.
- 잔액 음수 허용(막지 않음).

### 8.3 사람(수동) 테스트 시나리오 — 테스터용

각 단계 후 실기기/시뮬레이터에서:
1. **기존 사용자 무손실**: 구버전 데이터로 켜기 → 수입/잔액/지출 그대로, 앱 안 깨짐.
2. **월 하순 정규직**: 월급 10일 설정, 기기 날짜 25일 → 하루한도가 "다음달 10일까지"로 합리적(예전엔 월말까지로 과소).
3. **live wallet**: 지출 3만 추가 → 잔액 3만 감소, 영웅 숫자 감소. 삭제 → 복원.
4. **봉투 카테고리 1:1**: 식비로 지출 → 봉투 탭 식비만 증가. 입력창엔 봉투 잔액 안 보임.
5. **봉투 이동**: 쇼핑→식비 2만 → 총 예산 불변, 두 봉투만 변동.
6. **수입 없음(여친 시나리오)**: 수입 없음+목표일 → 하루한도 나옴, 저축 안 물어봄, 저축 라벨 없음.
7. **입금 확인**: 입금일 지나면 배너 → 확정 → 리포트 → 다음 구간 봉투 추천.

**UX 정확성 체크(§5.9) — 모든 신규/수정 화면에서 확인:**
- [ ] 모든 입력칸: 탭하면 키보드가 떠도 **입력칸이 키보드 위에 보임**(셋업·지출모달·입금확정·이동·리포트·봉투편집 전부).
- [ ] 키보드 떠 있는 상태에서 버튼 **첫 탭에 동작**(두 번 눌러야 하지 않음).
- [ ] 비활성 버튼은 회색 + 누르면 이유 Alert. 보이는 버튼 중 아무 동작 없는 것 0개.
- [ ] 봉투 이동 성공 시 확인 메시지. 입금 확정은 실행 전 확인.
- [ ] 빈 목록은 안내 문구(빈 화면 0). 음수는 빨강. D-day 음수 안 뜸.
- [ ] 모달 닫으면 입력값 리셋. 입금 확정 후 홈 숫자 즉시 갱신.
- [ ] 날짜 선택은 네이티브 피커(weekly/biweekly/irregular/목표일). monthly는 일 입력.

---

## 9. NOT in scope (이번 작업에서 명시적으로 제외)

- **iCloud 백업 / CSV·JSON 내보내기** — 별도 워크스트림(TODO). 방향만 확정: 로컬=원본,
  CloudKit 자동 백업(목표) + 수동 내보내기(선출시), 백업 상태 화면 필수.
- **다기기 실시간 동기화** — 단일 블롭 구조론 불가. 레코드 기반(CloudKit/SQLite) 재설계 필요. 미래.
- **SQLite 전환** — 정상 사용 5~10년은 AsyncStorage 단일 블롭으로 충분. 백업/내보내기와 함께 갈 때만.
- **카드 문자 복붙 파싱** — 별도 기능. 이번 엔진 작업과 무관.
- **위젯(홈/잠금화면)** — 별도. Pro 기능.
- **irregular 수입원별 간격 분리 추정** — periods 전체 평균으로 충분. 정밀 분리 제외.
- **저축의 정교한 저축일 분기** — 구간당 1회 단순 차감으로 충분.

---

## 10. 완료 기준 (Definition of Done)

- [ ] `npm run typecheck` 통과(에러 0).
- [ ] `npm run test` — §8.2 전 케이스 green.
- [ ] §8.3 수동 시나리오 1~7 통과(테스터 확인).
- [ ] §8.3 **UX 정확성 체크 전 항목 통과**(§5.9 — 키보드 가림 0, 죽은 버튼 0).
- [ ] §1.5 재사용 맵 준수 — 기존 컴포넌트/유틸로 조립, 같은 일 하는 코드 중복 신설 0.
- [ ] §7 죽은 코드 참조 0 확인 후 삭제.
- [ ] 기존 사용자 데이터 무손실(시나리오 1).
- [ ] 새 기능이 NOT in scope 항목을 건드리지 않음. 신규 의존성은 `datetimepicker` 1개로 한정.
