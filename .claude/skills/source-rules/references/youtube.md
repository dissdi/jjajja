# YouTube Shorts

> 상태: 초기 가설. detection-researcher가 확인 후 `확인일`을 채운다.

## URL 패턴 (정규화 대상)
- `https://www.youtube.com/shorts/{id}` / `https://youtube.com/shorts/{id}?si=...`
- `https://m.youtube.com/shorts/{id}`
- `https://youtu.be/{id}` (공유 버튼 기본값)
- `https://www.youtube.com/watch?v={id}`
- 쿼리의 `si`, `feature` 등 추적 파라미터는 제거. video_id는 11자 `[A-Za-z0-9_-]`

## 신호 후보
| 신호 | 경로 | 등급 | 확인 필요 사항 | 확인일 |
|------|------|------|---------------|-------|
| 제작자 공개 "변경되거나 합성된 콘텐츠" 표기 | Data API? / HTML | 결정적 후보 | Data API v3로 노출되는지, 아니면 HTML에서만 보이는지 | 미확인 |
| C2PA "카메라로 촬영됨" 표기 | HTML | 반대 방향 신호(실제 촬영) | 노출 방식 | 미확인 |
| 제목/설명/해시태그의 AI 표기 | Data API `snippet` | 강함 | 한국어 표기 변형 목록(#AI, #ai영상, #AI생성, 인공지능 등) | - |
| 채널 업로드 이력 | Data API `search`/`playlistItems` | 약~강 | 쿼터 비용(검색은 비쌈) | - |

## 주의
- Data API는 키 필요 + 일일 쿼터. oEmbed(`https://www.youtube.com/oembed?url=...`)는 제목/채널명 정도만 줌.
