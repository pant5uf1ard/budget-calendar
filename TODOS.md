# TODOS

이 프로젝트에서 의도적으로 나중으로 미룬 작업들. 각 항목은 "왜"와 "어디서 시작하는지"를 담는다.

---

## 백업 / 데이터 영속성 (Pro·신뢰 기능)

**What**: 기기를 바꿔도 가계부 기록이 살아남게 하는 백업. 자동 iCloud 백업을 목표로 하되,
수동 내보내기(CSV/JSON)를 먼저 안전망으로 깐다.

**Why**: 시장조사에서 반복된 사용자 통증이 "기록이 날아갈까 봐 무섭다"였다. 현재는 로컬
`AsyncStorage` 단일 블롭뿐이라 앱 삭제·기기 변경 시 데이터가 사라진다. 백업은 유료 전환
명분이자 가계부로서의 기본 신뢰 기능.

**방향(이미 설계 확정 — D7)**:
- 로컬(AsyncStorage)이 항상 진실의 원본. 앱은 iCloud 없어도 100% 동작.
- **목표**: CloudKit 비공개 DB에 state 블롭을 레코드 1개로 자동 백업 + 새 기기 자동 복원.
  사용자 iCloud 용량 사용 → 서버 비용 0, 가입 불필요.
- **선출시**: 수동 내보내기/가져오기(JSON/CSV 공유시트). entitlement 불필요, 빠름. CSV는
  "내보내기" Pro 기능과 겸용.
- **필수**: 백업 상태 화면 — iCloud 연결 상태(`CKAccountStatus`) + "마지막 백업 N분 전" +
  수동 백업 버튼 + 백업 꺼짐 능동 경고 배너 + 새 기기 복원 확인 메시지.
- iCloud Key-Value Store는 1MB 한도라 **제외**(가계부 블롭이 5년이면 ~900KB로 근접).

**Pros**: 신뢰·유료 명분 동시 확보. 단일 블롭 구조와 궁합 좋음(블롭 통째 업/다운).
**Cons**: 자동 백업은 네이티브 통합 묵직(iCloud entitlement + Expo dev build + 네이티브 모듈).
사람 ~4-6일 / CC ~0.5-1일. 복원은 무조건 보장 아님(미로그인·iCloud 꺼짐·용량참·업로드 전 초기화).

**Context/시작점**: `mobile-app/SPEC-period-budget.md` §9(NOT in scope)에 방향 요약 있음. 현재
영속성은 `App.tsx:1035-1053`(AsyncStorage 단일 키 `budget-calendar-mobile-v1`, state 전체 JSON).
수동 내보내기부터 → 그 위에 CloudKit. 상태 화면 UI는 §5.9 UX 바 준수.

**Depends on / 순서**: 입금구간 calc-엔진 전환(SPEC-period-budget.md)이 먼저 끝난 뒤. 수동
내보내기 → 자동 iCloud 백업 → (먼 미래) 다기기 실시간 동기화는 별도(레코드 기반 재설계 필요).

---

## 다기기 실시간 동기화 (먼 미래)

**What**: iPhone·iPad 동시 편집 동기화.
**Why**: 편의 기능. 단, 편한가계부가 잘하는 영역이라 우리 핵심 웨지("오늘 얼마")는 아님.
**Cons**: 단일 블롭은 last-write-wins로 동시 편집 시 데이터 손실 → 레코드 기반(CloudKit/SQLite)
저장구조 재설계 필요. 사람 ~3-6주. 핵심 검증 전엔 과한 선투자.
**Depends on**: 백업(CloudKit) 먼저. 사용자 수요 근거 확인 후 착수.

---

## SQLite 전환 (조건부)

**What**: 지출 가계부 데이터를 AsyncStorage 단일 블롭 → expo-sqlite 레코드 저장.
**Why**: 정상 사용 5~10년은 단일 블롭으로 충분하므로 지금은 불필요. 백업/내보내기 또는 다기기
동기화를 본격화할 때만 값을 한다.
**Depends on**: 위 동기화 작업과 함께. 단독으로는 하지 않음.
