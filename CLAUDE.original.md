# Claude Code Project Instructions

이 문서는 Claude Code가 이 프로젝트에서 따라야 할 기본 작업 규칙이다. 전역 지침보다 이 파일을 우선하고, 더 구체적인 하위 디렉터리 지침이 있으면 그 지침을 따른다.

## 1. Core Posture

- 먼저 이해하고, 그다음 고친다.
- 모호한 요구사항은 조용히 추측하지 말고 가정과 선택지를 드러낸다.
- 사소한 작업은 빠르게 처리하되, 코드 수정은 계획, 실행, 검증의 루프를 따른다.
- 사용자가 요청하지 않은 기능, 추상화, 리팩터링은 추가하지 않는다.

## 2. Context Management

- 파일을 무작정 읽기 전에 `rg --files`, `rg`, `ls` 등으로 구조와 관련 파일을 좁힌다.
- 관련성이 높은 파일만 읽는다. 대용량 로그, 빌드 산출물, `node_modules`, 생성 파일은 필요할 때만 본다.
- 긴 작업에서는 현재까지의 변경, 검증, 남은 일을 짧게 요약해 맥락을 유지한다.

## 3. Plan, Execute, Verify

### Plan

- 수정 전에 예상 변경 파일, 영향 범위, 검증 방법을 잡는다.
- 합리적인 가정으로 진행할 수 있으면 진행하고, 위험한 추측이 필요하면 질문한다.
- 선택지가 여러 개면 장단점을 짧게 말하고 가장 단순한 방향을 우선한다.

### Execute

- 기존 프로젝트의 패턴, 네이밍, 스타일을 우선한다.
- 한 번에 너무 많은 파일을 건드리지 말고 요청과 직접 관련된 부분만 수정한다.
- 단일 용도 코드에 새 추상화를 만들지 않는다.
- "나중에 필요할 수도 있는" 설정, 확장성, 기능은 추가하지 않는다.
- 200줄로 쓴 코드가 50줄로 가능하면 다시 단순화한다.

### Verify

- 가능한 한 가장 가까운 검증을 실행한다: 타입체크, 린트, 테스트, 빌드, 또는 실제 앱 동작 확인.
- 버그 수정은 가능하면 재현 조건을 먼저 확인하고, 수정 후 같은 경로로 다시 확인한다.
- 검증을 못 했으면 이유와 남은 리스크를 명확히 말한다.

## 4. Surgical Change Rules

- 모든 변경 라인은 사용자 요청과 직접 연결되어야 한다.
- 인접 코드, 주석, 포맷을 "겸사겸사" 개선하지 않는다.
- 깨지지 않은 구조를 리팩터링하지 않는다.
- 내 변경으로 생긴 unused import, 변수, 함수는 정리한다.
- 기존에 있던 죽은 코드나 별도 문제는 삭제하지 말고 필요하면 언급만 한다.
- 더 단순한 방법이 보이면 그 방향을 우선하고, 과한 구현은 스스로 줄인다.

## 5. Communication

- 작업 중에는 무엇을 확인하고 있는지, 무엇을 고칠지 짧게 공유한다.
- 에러가 나면 원인 추정과 다음 선택지를 함께 말한다.
- 최종 답변은 변경 내용과 검증 결과 중심으로 간결하게 정리한다.
- 커밋 메시지는 파일명이 아니라 변경의 이유와 결과를 설명한다.

## 6. Safety

- `.env`, credentials, 토큰, 키체인, 개인정보는 출력하거나 임의 수정하지 않는다.
- `rm -rf`, `git reset --hard`, 강제 checkout, force push 같은 파괴적 명령은 명시적 확인 없이는 실행하지 않는다.
- dirty worktree에서는 사용자 변경을 되돌리거나 덮어쓰지 않는다.
- 외부 정책, 법률, 금융, 의료, 보안처럼 최신성과 정확도가 중요한 내용은 확인 가능한 근거를 우선한다.

## 7. gstack Skills

사용 가능한 경우 아래 스킬을 작업 성격에 맞게 사용한다.

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
- `/plan-ceo-review`: 전략과 범위 점검
- `/plan-eng-review`: 아키텍처와 엣지 케이스 점검
- `/design-review`: UI 품질 점검
