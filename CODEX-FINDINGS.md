# Codex Challenge — 잔여 알려진 한계

Codex 1-4차 챌린지 결과 중 별도 설계 결정이 필요해 보류한 항목.

## 2026-05-28 4차 라운드 — 모두 해결 ✓

#2 #3 = payday timing 두 이슈, "**payday = 새 cycle 첫날**" 모델로 해결:
- closePeriod: snapshot endDate = payday - 1, 새 currentPeriodStart = payday
- payday 의 지출 = 새 cycle 식비 (자동 귀속)
- snapshot frozen 이어도 #2 발생 안 함 (payday 지출이 새 cycle 로 가니까)
- plan/actuals 모두 같은 boundary 사용 → #3 해소

---

## 미해결 (별도 토픽)

### 신용카드 사용자 강제력
**상황**: 신용카드 결제 시 통장 잔액 즉시 차감 X. 결제일에 한 번에 빠짐.
- 앱은 expense 수동 입력 의존
- 입력 안 하면 강제력 0
- 입력해도 currentBalance 즉시 차감 → 실제 통장 잔액과 mismatch

**제안 방향** (별도 PR):
- A) 입력 UX 강화 (quick chip, 자주 쓰는 카테고리, lock screen widget reminder)
- D) 카드 결제 카테고리 별도 처리 — "카드값 누적 봉투" + 결제일 자동 시뮬레이션
- C) 마이데이터 / 카드사 API 연동 (큰 작업)

MVP 단계는 A 권장. Beta 피드백 후 D 검토.

---

## 이전 미수정 항목 (참고용)

## HIGH (데이터 정합성)

### H1. Payday 지출 두 구간에 중복 카운트
**위치**: `closePeriod` [App.tsx:1205-1234], `calculateEnvelopeStatus` [App.tsx:1027]

**문제**: 입금일 (today) 에 기록된 expense 가:
- 옛 구간 snapshot.actualByCategory 에 포함 (`expense.date >= start && expense.date <= today`)
- 새 구간에도 포함 (currentPeriodStart = today, 같은 expense 다시 잡힘)

→ 같은 지출이 두 구간 통계에 들어감. 새 구간 envelope `spent` 가 0 으로 시작 안 됨.

**Fix 옵션**:
- A) 새 구간 start = `addDays(today, 1)` — payday 는 옛 구간에 속함
- B) snapshot endDate = `addDays(today, -1)` — payday 는 새 구간에 속함

추천: **A** (월급 받기 전 지출로 보는 게 자연)

---

### H2. closePeriod idempotency 없음
**위치**: `closePeriod` [App.tsx:1205, 1219], `closePeriodNoIncome` effect [App.tsx:1611-1615]

**문제**: 연속 호출 시 snapshot 무한 push.
- targetDate 모드에서 `targetDate <= today` 면 overdue 상태 유지 ([App.tsx:987-989])
- auto-close effect 가 currentPeriodStart 변경 후 다시 발동 → zero-length snapshot 또 push 가능

**Fix**: 
- closePeriod 진입 가드: `if (state.currentPeriodStart === isoDate(today)) return state`
- 또는 effect dependency 수정해서 중복 발동 방지

---

## MEDIUM

### M3. 설정 토글이 envelopes 재계산 안 함
**위치**: 설정 saving Switch onChange [App.tsx:2883-2888]

**문제**: 저축 토글하면 `savingEnabled` + `savingGoal` 만 patch. envelope periodLimit 는 옛값 그대로.
- calculatePlan 의 dailyUnit 은 새 saving 반영
- envelope 표시는 옛 saving 기반

→ daily allowance 와 envelope total 불일치.

**Fix**: settings toggle 시 `suggestEnvelopeBudgets` 도 호출해서 envelopes 재패치

---

### M4. 코치 진행 중 profile 불일치
**위치**: `monthlyEnvelopeBudgets` [App.tsx:906], `monthlyLivingBudget` [App.tsx:816-818]

**문제**: `monthlyEnvelopeBudgets(state, profile)` 가 받은 profile 로 카테고리 budget 계산하지만, 내부의 `monthlyLivingBudget` → `derivedMonthlySaving` 은 `state.coachProfile` 사용.

코치 진행 중 local `coachProfile` 변경 시 `setCoachProfile` 만 update 됨. state.coachProfile 은 `initializeSetupState` 호출 전까지 stale.

→ 카테고리 share 와 living pool 이 다른 profile 기반으로 계산.

**Fix**: `monthlyLivingBudget` + `derivedMonthlySaving` 도 profile param 받기. 호출 측에서 일관 전달

---

### M5. today 파라미터 일관성
**위치**: 
- `initializeSetupState` [App.tsx:927, 930]
- setup result seed [App.tsx:1628, 1632]
- `applyEnvelopeSuggestion` [App.tsx:1890, 1896]

**문제**: 일부 호출이 today 안 넘김 → 함수 내부에서 `new Date()` 사용. 다른 호출 (calculatePlan, closePeriod) 은 memoized today 사용.

→ midnight 경계 / 테스트 컨트롤 시 다른 날짜 사용. mismatch 가능.

**Fix**: 모든 호출에 today 명시 전달

---

### M6. 수동 경로 음수 leakage
**위치**:
- 수동 setup 편집 [App.tsx:1807-1812]
- 봉투 간 이동 (transfer) [App.tsx:1193-1198]
- 카테고리별 반올림 [App.tsx:916, 922]

**문제**: 
- 사용자 envelope periodLimit 음수 입력 가능
- transfer 시 source 가 음수 가능
- 각 카테고리 `roundToThousand` 독립 적용 → 합이 livingPool 초과 가능

**Fix**: 
- envelope periodLimit `max(0, ...)` clamp
- transfer 시 source >= amount 검증
- 마지막 카테고리에 잔여 흡수 (또는 floorToThousand 사용)

---

## 검증 통과

futureBasePool 수정 후:
- under-plan: todayAllowance + future = basePool ✓
- over-plan: futureBasePool clamp(0) ✓
- "today + future > basePool" 버그 없음

다음 세션에서 위 6개 (H1, H2, M3, M4, M5, M6) 순서대로 처리.
