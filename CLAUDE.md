# jjajja

AI 슬롭(AI 생성) 쇼츠를 판별해, 구분하지 못하고 공유하는 50~60대 한국인 사용자가 공유 전에 한 번 멈추게 하는 모바일 앱.

## 하네스: jjajja (AI 슬롭 쇼츠 탐지 앱)

**목표:** 쇼츠 URL(→ 업로드, 공유, 복사 진입점으로 확장)을 받아 AI 생성 확률을 쉬운 말로 보여주는 앱을 조사부터 구현, QA까지 에이전트 팀으로 만든다.

**트리거:** jjajja 개발 관련 작업(탐지 조사, 서버, 출처별 규칙, 앱, UX, QA/평가) 요청 시 `jjajja-orchestrator` 스킬을 사용하라. 단순 질문은 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-09-28 | 초기 구성 | 전체 | - |
| 2026-09-28 | 계약 v1.1 (invalid_file, limits, partial 정의, score nullable) | skills/detect-api-contract | 업로드 경로 구현, 앱 요청, QA가 null score 버그 발견 |
| 2026-09-28 | check_contract에 타입 검사, eval_detect에 --sleep/--stop-if-unavailable | skills/detection-qa/scripts | 키만 비교해 null 버그 누락, 유튜브 봇 차단 방지 |
| 2026-09-28 | file_too_large·invalid_file 문구 | skills/senior-ux-korean | 실제 한도(180초)와 문구 불일치 |
| 2026-09-28 | 계약 v1.2 (signals[].present, 응답 시간 보장 URL 40초·업로드 110초) | skills/detect-api-contract | GitHub #1, #2 |
| 2026-09-29 | 에러 표: 풀 수 없는 단축 링크 → `video_unavailable` (스키마 변경 없음) | skills/detect-api-contract | GitHub #7 |
