# Codex Challenge 결과 — 미수정 TODO

Codex 3차 챌린지에서 발견된 잔여 이슈. 우선순위순.

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
