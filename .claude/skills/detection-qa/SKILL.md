---
name: detection-qa
description: "jjajja의 QA 절차 — (1) 경계면 교차 검증: API 계약 ↔ 서버 응답 ↔ 앱 TS 타입/화면, URL 패턴 ↔ 공유 인텐트, verdict 구간 ↔ UX 표현, (2) 라벨된 쇼츠 데이터셋으로 탐지 정확도·오탐률 평가와 임계값/가중치 조정 근거 산출. 통합 테스트, 정확도 평가, 오탐 분석, 회귀 확인, '제대로 맞추는지 확인해줘' 류 요청 시 반드시 사용."
---

# Detection QA

## A. 경계면 교차 검증
각 항목은 **두 파일을 동시에 열어** 비교한다. 한쪽만 보면 각각은 멀쩡해 보인다.

| # | 왼쪽 | 오른쪽 | 확인 |
|---|------|--------|------|
| A1 | `detect-api-contract` 응답 예시 | `server/` 응답 모델(pydantic 등) | 필드명·타입·nullable 일치, 누락/추가 필드 |
| A2 | `detect-api-contract` | `app/src/api/contract.ts` | 동일 + 버전 주석이 최신인지 |
| A3 | `app/src/api/contract.ts` | 화면 코드의 필드 접근 | 존재하지 않는 필드 접근, camelCase 변환 흔적 |
| A4 | 계약의 에러 code 목록 | 서버 raise 지점 / 앱 `ux/copy.ts` 매핑 | 양방향 누락 |
| A5 | 계약의 verdict 구간표 | 서버 앙상블 코드 | 경계값(≥ vs >) 일치, 앱이 재계산하지 않는지 |
| A6 | `server/rules/normalize.py` 지원 도메인 | 앱 붙여넣기 검증·intent filter | 서버가 받는데 앱이 거부하는(또는 반대) 도메인 |
| A7 | UX 명세 문구 키 | `ux/copy.ts` | 키 누락, 명세와 다른 문구 |

런타임 확인이 가능하면 서버를 띄우고 실제 응답 JSON을 `scripts/check_contract.py`로 계약 예시와 키 비교한다.

## B. 탐지 정확도 평가

### 데이터셋 `eval/dataset.csv`
```
url,label,platform,label_source,note
https://youtube.com/shorts/xxx,ai,youtube,"채널이 AI 생성 명시",Sora 계열 추정
https://youtube.com/shorts/yyy,real,youtube,"언론사 공식 채널",뉴스
```
- `label`: `ai` | `real`. `label_source`에 라벨 근거 필수 (근거 없는 라벨은 평가를 오염시킨다)
- 음성(real) 샘플에 **뉴스·동물·요리·풍경처럼 AI 슬롭이 흉내 내는 장르**를 충분히 포함한다 — 오탐은 여기서 난다
- 5060 공유 맥락을 반영: 건강 정보, 감동 사연, 정치·사건 영상

### 실행
```bash
python .claude/skills/detection-qa/scripts/eval_detect.py \
  --dataset eval/dataset.csv --endpoint http://localhost:8000/v1/detect \
  --out _workspace/04_eval_results.csv
```
스크립트는 각 URL 결과를 CSV로 저장하고 지표를 출력한다.

### 보고 지표
- 오탐률(FPR: real → likely_ai) — **최우선**
- 미탐률(FNR: ai → likely_real)
- verdict 분포(uncertain 비율이 너무 높으면 쓸모없는 앱)
- 탐지기별 단독 AUC, 규칙 신호별 적중률 → 앙상블 가중치 조정 근거
- 플랫폼별·장르별 분해

### 임계값/가중치 조정
결과로 조정안을 내되 직접 바꾸지 않는다: 계약 구간표 변경안 → detection-engineer, 규칙 가중치 변경안 → source-rule-engineer에 전달.

## 리포트 형식 (`_workspace/04_qa_report.md`)
1. 요약 (통과/실패 수, 치명 이슈)
2. 경계면 불일치: `{항목ID} {파일:라인} 기대 / 실제 / 재현 / 담당`
3. 정확도 지표 표 + 오탐 사례 목록(URL, 판정, 주 신호)
4. 이전 리포트 이슈 해결 여부
