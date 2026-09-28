# TikTok

> 상태: 초기 가설. 확인 후 확인일 기입.

## URL 패턴
- `https://www.tiktok.com/@{user}/video/{id}`
- `https://vt.tiktok.com/{short}` / `https://vm.tiktok.com/{short}` — 리다이렉트 추적 필요
- `https://m.tiktok.com/v/{id}.html`

## 신호 후보
| 신호 | 경로 | 등급 | 확인 필요 사항 | 확인일 |
|------|------|------|---------------|-------|
| "AI 생성" 라벨 (제작자 표기 / C2PA 자동 라벨) | HTML / oEmbed? | 결정적 후보 | 비로그인 HTML에서 보이는지, 필드명 | 미확인 |
| 캡션 해시태그 | oEmbed `title` | 강함 | - | - |

## 주의
- 공식 Display/Research API는 승인 필요. 비로그인 HTML은 봇 차단 가능성 높음.
