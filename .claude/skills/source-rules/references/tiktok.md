# TikTok

> 상태: 2026-09-28 부분 확인 (비로그인 HTML 1회성 확인, 양성 사례 1건). 값 의미는 추가 확인 필요.

## URL 패턴
- `https://www.tiktok.com/@{user}/video/{id}` (id 19자리 숫자)
- `https://vt.tiktok.com/{short}` / `https://vm.tiktok.com/{short}` — 리다이렉트 추적 필요
- `https://m.tiktok.com/v/{id}.html`

## 신호
| 신호 | 경로 | 등급 | 확인 결과 | 확인일 |
|------|------|------|----------|-------|
| AIGC 라벨 필드 | 비로그인 HTML `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` → `__DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct` | 결정적 후보 | 필드 `IsAigc`(bool), `aigcLabelType`(문자열, 라벨 있을 때만 존재), `AIGCDescription`, `ShowAIGC` 확인. Veo3 영상(`@professorcasey/video/7509250490928991519`)에서 `aigcLabelType:"1"`, `IsAigc:false` 관측 → "1"=제작자 라벨로 추정되나 **값 의미 미확인**. 자동(C2PA) 라벨 값 미확인 | 2026-09-28 |
| 캡션 해시태그 | oEmbed `https://www.tiktok.com/oembed?url=...` `title` | 강함 | oEmbed 동작 확인(title/author_name) | 2026-09-28 |

TikTok 정책: 제작자 라벨("Creator labeled as AI-generated") + C2PA Content Credentials 기반 자동 라벨 두 종류 (https://newsroom.tiktok.com/en-us/new-labels-for-disclosing-ai-generated-content, 확인 2026-09-28).

## 주의
- 이 서버 IP에서는 HTML이 hydrate됨(2026-09-28). 데이터센터 IP에선 빈 payload가 올 수 있다는 보고 있음(Apify 문서). 공식 Display/Research API는 승인 필요.
