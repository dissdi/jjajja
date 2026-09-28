# Instagram Reels

> 상태: 2026-09-28 문헌 조사만(직접 fetch 미실시). 필드는 미확인.

## URL 패턴
- `https://www.instagram.com/reel/{shortcode}/`, `/reels/{shortcode}/`, `/p/{shortcode}/`
- `?igsh=...` 등 추적 파라미터 제거

## 신호 후보
| 신호 | 경로 | 등급 | 확인 필요 사항 | 확인일 |
|------|------|------|---------------|-------|
| Meta "AI 정보"(AI info) 라벨 | HTML? | 결정적 후보 | 비로그인 접근 가능 여부, 필드명 — 미확인. Meta는 C2PA/IPTC 메타데이터·자기 신고로 라벨 부착 | 미확인 |
| "AI creator" 계정 라벨 (2026-05 테스트 시작) | 프로필 | 강함 후보 | 노출 경로 미확인 (https://www.engadget.com/2162426/instagram-is-testing-optional-ai-creator-labels/) | 미확인 |
| 캡션 해시태그 | oEmbed(Meta 앱 토큰 필요) | 강함 | 토큰 발급 절차 | - |

## 주의
- 비로그인 접근이 매우 제한적. 1차에서는 "URL 인식 + 모델 탐지(영상 확보 가능 시)"만 목표로 두는 것이 현실적.
