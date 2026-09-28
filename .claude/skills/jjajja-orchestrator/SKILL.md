---
name: jjajja-orchestrator
description: "jjajja(AI 슬롭 쇼츠 탐지 앱) 개발 에이전트 팀을 조율하는 오케스트레이터. 탐지 API 조사, 탐지 서버, 출처별 규칙, Expo/Swift 앱, 5060 UX, QA·정확도 평가 전반을 다룬다. 'jjajja', '슬롭 탐지', 'AI 영상 탐지', '쇼츠 URL 탐지', '1차 MVP 만들어', '공유하기로 탐지', '복사 탐지', '탐지 정확도' 요청 시 사용. 후속 작업: 다시 실행, 재실행, 업데이트, 수정, 보완, 이전 결과 기반으로 개선, 'jjajja의 {조사/서버/규칙/앱/UX/QA}만 다시', 새 플랫폼 추가, 임계값 조정 요청 시에도 반드시 이 스킬을 사용. 단순 질문(개념 설명, 파일 위치 확인)은 직접 응답."
---

# jjajja Orchestrator

AI 슬롭 쇼츠를 판별해 50~60대 사용자가 공유 전에 멈추게 하는 모바일 앱 **jjajja**를 만드는 팀을 조율한다.

**제품 로드맵 (기준):**
- **1차 (MVP)**: 쇼츠 URL 복붙 → AI 확률 (유튜브 쇼츠 우선)
- base: 직접 영상 넣기(업로드)
- branch: 배포 환경별 진입점 — 공유하기로 탐지, 복사만 해도 탐지
- 탐지 전략: 상용 API / 오픈소스를 base로 + 출처별 rule-base 코딩

## 실행 모드: 하이브리드

| Phase | 모드 | 이유 |
|-------|------|------|
| 1. 조사 | 서브 에이전트 (researcher 단독, UX는 병렬) | 독립 조사. 결과 파일만 있으면 충분 |
| 2. 설계·구현 | 에이전트 팀 | 계약 변경·도메인 동기화·점진 QA 등 실시간 조율이 핵심 |
| 3. 정확도 평가 | 서브 에이전트 (qa-integrator) | 독립 검증. 구현자와 분리해야 객관적 |

> 환경에 `TeamCreate`가 없으면 Phase 2도 `Agent(run_in_background: true)` + `SendMessage(to: 이름)`로 같은 통신 규칙을 흉내 낸다. 팀원 이름은 `Agent`의 `name`으로 지정한다.

## 에이전트 구성

| 팀원 | 정의 파일 | 타입 | 스킬 | 주 출력 |
|------|----------|------|------|--------|
| detection-researcher | `.claude/agents/detection-researcher.md` | general-purpose | ai-video-detection, source-rules | `_workspace/01_researcher_catalog.md` |
| senior-ux-designer | `.claude/agents/senior-ux-designer.md` | general-purpose | senior-ux-korean, detect-api-contract | `_workspace/02_ux_spec.md` |
| source-rule-engineer | `.claude/agents/source-rule-engineer.md` | source-rule-engineer | source-rules, detect-api-contract | `server/rules/`, `_workspace/02_rules_spec.md` |
| detection-engineer | `.claude/agents/detection-engineer.md` | detection-engineer | ai-video-detection, detect-api-contract | `server/`, `_workspace/03_engineer_notes.md` |
| mobile-engineer | `.claude/agents/mobile-engineer.md` | mobile-engineer | mobile-capture, senior-ux-korean, detect-api-contract | `app/`, `_workspace/03_mobile_notes.md` |
| qa-integrator | `.claude/agents/qa-integrator.md` | general-purpose | detection-qa, detect-api-contract | `_workspace/04_qa_report.md` |

모든 Agent/팀원 호출에 `model: "opus"`를 명시한다. 프롬프트에는 "`.claude/agents/{name}.md`를 먼저 읽고 그 역할로 작업하라"와 사용할 스킬 이름을 넣는다.

## 워크플로우

### Phase 0: 컨텍스트 확인
1. `_workspace/`, `server/`, `app/` 존재 여부 확인
2. 모드 결정:
   - `_workspace/` 없음 → **초기 실행** (Phase 1부터)
   - 있음 + 부분 요청("규칙만", "UX 문구만", "평가만") → **부분 재실행**: 해당 팀원만 호출, 이전 산출물 경로를 프롬프트에 포함
   - 있음 + 새 범위(새 플랫폼, 2차 기능) → **새 실행**: `_workspace/`를 `_workspace_{YYYYMMDD_HHMMSS}/`로 이동 후 Phase 1. 단 `server/`, `app/` 코드는 유지하고 증분 개발
3. 요청 범위를 로드맵 단계(1차/base/branch)에 매핑하여 사용자에게 한 줄로 확인

### Phase 1: 조사
**실행 모드:** 서브 에이전트 (한 메시지에서 병렬)

| 에이전트 | 작업 | run_in_background |
|---------|------|-------------------|
| detection-researcher | 탐지 API/OSS 후보 카탈로그 + 대상 플랫폼 AI 라벨·메타데이터 접근성 조사 → `01_researcher_catalog.md`. `source-rules/references/*.md`의 `미확인` 항목을 채운다 | true |
| senior-ux-designer | 계약 v1 기준 화면 흐름·문구 초안 → `02_ux_spec.md` | true |

완료 후 리더가 카탈로그의 "추천 조합"을 사용자에게 요약하고 **어떤 상용 API를 쓸지(키/비용이 드는 결정)** 확인받는다. 확인 전에는 Phase 2에서 무료/OSS 탐지기와 목(mock) 어댑터로 진행한다.

### Phase 2: 설계·구현
**실행 모드:** 에이전트 팀

1. `TeamCreate("jjajja-build", members: [source-rule-engineer, detection-engineer, mobile-engineer, qa-integrator])` — senior-ux-designer는 문구 수정 요청이 예상되면 포함
2. `TaskCreate` (의존성 포함):
   - T1 규칙: URL 정규화 + 대상 플랫폼 RuleSet → source-rule-engineer
   - T2 서버 골격: `/v1/health`, `/v1/detect`(계약 준수, mock 탐지기) → detection-engineer
   - T3 탐지기 어댑터: Phase 1 선정 탐지기 → detection-engineer (depends T2)
   - T4 앙상블 + 규칙 연동 → detection-engineer (depends T1, T3)
   - T5 앱: 홈(붙여넣기)·결과·에러 화면 → mobile-engineer (depends T2의 계약 확정)
   - T6 점진 QA: 각 "검증 요청" 수신 시 detection-qa A항목 → qa-integrator
   - branch 범위일 때만: T7 공유 인텐트/Share Extension, T8 클립보드 확인 → mobile-engineer
3. **통신 규칙:**
   - 계약 변경은 detection-engineer만 제안 → `detect-api-contract` 먼저 수정 → mobile-engineer·qa-integrator에게 통지
   - 새 도메인 지원 시 source-rule-engineer → mobile-engineer 통지
   - 모듈 완성 시 구현자 → qa-integrator "검증 요청"; 불일치는 qa → 담당자 직접
4. 리더는 막힌 팀원에게 개입하고, 사용자 결정이 필요한 사항(API 키, 유료 플랜, 약관 리스크)만 모아서 묻는다
5. 완료 후 `TeamDelete`

### Phase 3: 정확도 평가
**실행 모드:** 서브 에이전트

qa-integrator 1명: 서버를 띄우고(가능할 때) `detection-qa` B 절차 실행 → `04_qa_report.md`. 데이터셋이 없으면 수집 계획만 제안.
조정안(임계값/가중치)은 사용자 확인 후 부분 재실행으로 반영한다.

### Phase 4: 정리·보고
1. `_workspace/` 보존
2. 사용자에게 보고: 완성 범위(로드맵 기준), 실행 방법(서버·앱), 지표(있으면), 미해결 이슈, 사용자 결정 필요 항목
3. 피드백 요청: "결과나 팀 구성에서 바꾸고 싶은 점이 있나요?" → 피드백은 하네스 진화(CLAUDE.md 변경 이력)로 반영

## 데이터 흐름

```
Phase1 ─ researcher ─▶ 01_catalog ─┐          ux ─▶ 02_ux_spec ─┐
                                   ▼                            ▼
Phase2  source-rule ─▶ server/rules ─▶ detection-eng ─▶ server/ ◀─contract─▶ app/ ◀─ mobile-eng
                              ╲             │                     │
                               ╲            ▼ 검증 요청            ▼ 검증 요청
                                ────────▶ qa-integrator ◀─────────┘
Phase3                                qa ─▶ 04_qa_report ─▶ (조정안) ─▶ 부분 재실행
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| 팀원 1명 실패 | 상태 확인 후 1회 재시작, 재실패 시 작업을 리더가 인계하거나 누락 명시 |
| 상용 API 키 없음 | mock/OSS 탐지기로 진행, 보고서에 "실탐지 미검증" 명시 |
| 영상 다운로드 차단 | 규칙 신호만으로 `partial` 응답 경로 검증, 사용자에게 대안(업로드) 보고 |
| GPU 필요 작업 | 공용 서버 규칙: 소유자 확인 → 빈 GPU 없으면 보류 후 사용자에게 알림 |
| 계약 불일치 발견 | 계약 파일이 기준. 계약과 다른 쪽을 고친다 |
| 조사 결과 상충 | 삭제하지 않고 출처 병기 |
| 과반 실패 | 중단하고 사용자에게 진행 여부 확인 |

## 테스트 시나리오

### 정상 흐름
1. 사용자: "jjajja 1차 MVP 만들어줘"
2. Phase 0: `_workspace/` 없음 → 초기 실행, 범위 = 1차(유튜브 쇼츠 URL 붙여넣기)
3. Phase 1: 카탈로그·UX 명세 생성 → 사용자에게 API 선택 확인
4. Phase 2: 4인 팀, T1~T6. 서버가 `/v1/detect` 응답 → qa가 A1/A2/A5 통과 확인
5. Phase 3: 데이터셋 20개로 FPR/FNR 산출
6. 결과: `server/`, `app/`, `_workspace/04_qa_report.md`

### 에러 흐름
1. Phase 2에서 mobile-engineer가 결과 화면에 `aiProbability`(camelCase)로 접근
2. qa-integrator A3에서 발견 → mobile-engineer에게 {파일:라인, 기대 `ai_probability`} 전송
3. 수정 후 재검증 통과. 리포트 "해결된 이슈"에 기록

### 부분 재실행 흐름
1. 사용자: "틱톡도 되게 해줘"
2. Phase 0: 새 범위 → researcher(틱톡 신호 재확인) → source-rule-engineer(tiktok RuleSet) → mobile-engineer(도메인 동기화) → qa A6
