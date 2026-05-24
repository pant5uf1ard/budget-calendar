# Claude Code Project Instructions

이 문서는 Claude Code가 이 프로젝트에서 따를 기본 규칙. 전역 지침보다 우선, 하위 디렉터리 지침 있으면 그거 따름.

## 1. Core Posture

- 먼저 이해, 그다음 수정.
- 모호한 요구사항 추측 금지. 가정과 선택지 노출.
- 사소한 작업 빠르게. 코드 수정은 계획-실행-검증 루프.
- 요청 안 한 기능, 추상화, 리팩터링 금지.

## 2. Context Management

- 무작정 읽기 전 `rg --files`, `rg`, `ls`로 구조 좁힘.
- 관련성 높은 파일만 읽음. 대용량 로그, 빌드 산출물, `node_modules`, 생성 파일은 필요할 때만.
- 긴 작업은 변경/검증/남은 일 짧게 요약해 맥락 유지.

## 3. Plan, Execute, Verify

### Plan

- 수정 전 예상 변경 파일, 영향 범위, 검증 방법 잡음.
- 합리적 가정으로 진행 가능하면 진행. 위험한 추측 필요하면 질문.
- 선택지 여러 개면 장단점 짧게, 단순한 방향 우선.

### Execute

- 기존 패턴, 네이밍, 스타일 우선.
- 한 번에 많은 파일 건드리지 말고 요청 관련 부분만 수정.
- 단일 용도 코드에 새 추상화 금지.
- "나중에 필요할 수도" 설정, 확장성, 기능 금지.
- 200줄 코드가 50줄로 가능하면 단순화.

### Verify

- 가장 가까운 검증 실행: 타입체크, 린트, 테스트, 빌드, 실제 앱 동작.
- 버그 수정은 재현 조건 먼저 확인, 수정 후 같은 경로로 재확인.
- 검증 못 했으면 이유와 남은 리스크 명확히.

## 4. Surgical Change Rules

- 모든 변경 라인은 사용자 요청과 직접 연결.
- 인접 코드/주석/포맷 "겸사겸사" 개선 금지.
- 안 깨진 구조 리팩터링 금지.
- 내 변경으로 생긴 unused import/변수/함수는 정리.
- 기존 죽은 코드나 별도 문제는 삭제 금지. 필요하면 언급만.
- 더 단순한 방법 보이면 그 방향 우선. 과한 구현 스스로 축소.

## 5. Communication

- 작업 중 확인/수정 내용 짧게 공유.
- 에러 나면 원인 추정 + 다음 선택지 함께.
- 최종 답변은 변경 내용 + 검증 결과 중심 간결.
- 커밋 메시지는 파일명 아니라 변경 이유와 결과.

## 6. Safety

- `.env`, credentials, 토큰, 키체인, 개인정보 출력/임의수정 금지.
- `rm -rf`, `git reset --hard`, 강제 checkout, force push 등 파괴적 명령은 명시적 확인 없이 실행 금지.
- dirty worktree에서 사용자 변경 되돌리기/덮어쓰기 금지.
- 외부 정책/법률/금융/의료/보안처럼 최신성·정확도 중요 내용은 확인 가능한 근거 우선.

## 7. gstack Skills

사용 가능 시 아래 스킬을 작업 성격에 맞게 사용.

<skills>
<skill>~/.claude/skills/qa</skill>
<skill>~/.claude/skills/review</skill>
<skill>~/.claude/skills/cso</skill>
<skill>~/.claude/skills/ship</skill>
<skill>~/.claude/skills/design-html</skill>
<skill>~/.claude/skills/design-review</skill>
<skill>~/.claude/skills/design-shotgun</skill>
<skill>~/.claude/skills/design-consultation</skill>
<skill>~/.claude/skills/plan-ceo-review</skill>
<skill>~/.claude/skills/plan-eng-review</skill>
<skill>~/.claude/skills/plan-design-review</skill>
<skill>~/.claude/skills/plan-devex-review</skill>
<skill>~/.claude/skills/office-hours</skill>
<skill>~/.claude/skills/investigate</skill>
<skill>~/.claude/skills/retro</skill>
<skill>~/.claude/skills/health</skill>
<skill>~/.claude/skills/devex-review</skill>
<skill>~/.claude/skills/learn</skill>
<skill>~/.claude/skills/pair-agent</skill>
<skill>~/.claude/skills/benchmark</skill>
<skill>~/.claude/skills/checkpoint</skill>
<skill>~/.claude/skills/land-and-deploy</skill>
</skills>

주요 라우팅:

- `/review`: 코드 리뷰
- `/qa`: 실제 앱 경로 QA
- `/ship`: PR, 배포 준비
- `/investigate`: 버그 조사
- `/cso`: 보안 감사
- `/office-hours`: 제품 요구사항 인터뷰
- `/plan-ceo-review`: 전략·범위 점검
- `/plan-eng-review`: 아키텍처·엣지 케이스 점검
- `/design-review`: UI 품질 점검