---
name: source-rules
description: "출처(플랫폼)별 rule-base 탐지 규칙 설계·구현 가이드 — 유튜브 쇼츠/틱톡/인스타 릴스/네이버 클립/카카오톡 전달 링크의 URL 정규화, 공식 AI 라벨·C2PA·해시태그·채널 패턴 신호, 규칙 가중치와 오탐 관리. 플랫폼 추가, 규칙 추가/수정, URL 파싱 문제, '이 링크가 인식 안 돼' 류 요청 시 반드시 사용."
---

# Source Rules

모델을 돌리기 전에 "어디서 왔는가"만으로 얻을 수 있는 신호를 뽑는다. 규칙은 싸고 빠르며 설명 가능하다 — 5060 사용자에게 "왜"를 보여줄 근거가 된다.

## 구조

```
server/rules/
├── __init__.py        # registry: platform → RuleSet
├── normalize.py       # URL → (platform, video_id, canonical_url)
├── base.py            # RuleSet 프로토콜, RuleSignal
├── youtube.py
├── tiktok.py
├── instagram.py
└── ...
```

```python
@dataclass
class RuleSignal:
    id: str                    # 예: "yt_ai_disclosure", "hashtag_ai"
    kind: Literal["rule"] = "rule"
    status: Literal["ok","error","unavailable"] = "ok"
    decisive: bool = False
    score: float | None = None
    weight: float = 1.0
    evidence_ko: str = ""
    via: Literal["api","oembed","html"] = "api"
```

신호 필드는 `detect-api-contract`의 `signals[]`와 1:1로 맞춘다.

## 신호 등급

| 등급 | 예 | 취급 |
|------|----|------|
| 결정적 | 플랫폼 공식 AI 생성 라벨, C2PA 생성기 기록 | `decisive=true`. 모델 점수보다 우선 |
| 강함 | 업로더 자기 표기(#AI생성, "AI로 만든"), 채널이 AI 생성 영상만 대량 업로드 | 높은 가중치, 단독 판정 금지 |
| 약함 | 조회수 급등 패턴, 짧은 업로드 간격, 템플릿형 제목 | 낮은 가중치 |

약한 신호만으로 `likely_ai`가 나오지 않도록 앙상블 가중치 상한을 둔다.

## 수집 경로 폴백
공식 API → oEmbed → HTML 파싱. HTML은 구조 변경으로 자주 깨지므로 파싱 실패 시 `status="unavailable"`로 조용히 빠지게 한다 (예외로 전체 요청을 죽이지 않는다).

## 새 플랫폼 추가 절차
1. `references/{platform}.md` 작성 — URL 패턴, 접근 가능한 메타데이터, AI 라벨 노출 여부(확인일 포함)
2. `normalize.py`에 패턴 추가 + 단위 테스트(단축/모바일/공유 링크 변형 포함)
3. `{platform}.py` RuleSet 구현
4. mobile-engineer에게 도메인 추가 알림 (공유 인텐트/붙여넣기 검증 목록 동기화)
5. 양성·음성 테스트 URL을 `eval/dataset.csv`에 추가

## 플랫폼별 참고
- 유튜브 쇼츠: `references/youtube.md`
- 틱톡: `references/tiktok.md`
- 인스타그램 릴스: `references/instagram.md`
- 카카오톡으로 전달된 링크는 대부분 위 플랫폼 URL을 그대로 담거나 단축 URL이다 → 단축 URL은 리다이렉트를 따라가 정규화한다.

## 단축 URL (#7)
`server/rules/shorturl.py` — `rules.resolve()`가 `normalize` 실패 시 단축 링크를 따라간다.
- **허용 목록(`SHORTENERS`)의 호스트에만 요청한다.** 리다이렉트 대상은 먼저 정규화하고, 대상이 다시 단축 서비스일 때만 요청한다 → 사용자가 붙인 링크로 서버가 임의 주소(내부망 포함)를 부르지 않는다(SSRF 방지). 플랫폼 자체에도 요청하지 않는다.
- GET(본문 미수신) + 최대 5홉 + 루프 감지 + 전체 타임아웃(`JJAJJA_RESOLVE_TIMEOUT_S`, 기본 8초, URL 예산에서 차감). 200 HTML 중간 페이지는 meta refresh → og:url 순으로 읽는다(64KB까지).
- 결과: 지원 플랫폼 → 정상 판정 / 지원하지 않는 사이트 → `unsupported_platform` / 끊김·시간 초과·루프 → `video_unavailable`.
- 새 단축 서비스는 `SHORTENERS`에 추가하고 `rules/tests/test_shorturl.py`에 케이스를 남긴다. 공유 인텐트 도메인 필터를 만들 때(#12) 이 목록도 포함해야 한다.
- 미확인: 실제 카카오톡 공유 문자열(단축 링크 포함 여부·도메인) 샘플 검증.

각 reference의 라벨/API 정보는 조사 시점 기준이다. 구현 전 detection-researcher 카탈로그로 재확인하라.
