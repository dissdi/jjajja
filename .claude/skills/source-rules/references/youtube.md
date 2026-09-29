# YouTube Shorts

> 상태: 2026-09-28 detection-researcher가 실제 쇼츠 페이지/innertube 응답으로 확인. 근거·원본 로그는 `_workspace/01_researcher_catalog.md` §4.

## URL 패턴 (정규화 대상)
- `https://www.youtube.com/shorts/{id}` / `https://youtube.com/shorts/{id}?si=...`
- `https://m.youtube.com/shorts/{id}`
- `https://youtu.be/{id}` (공유 버튼 기본값)
- `https://www.youtube.com/watch?v={id}`
- 쿼리의 `si`, `feature` 등 추적 파라미터는 제거. video_id는 11자 `[A-Za-z0-9_-]`
- 참고: 데스크톱 UA로 `/shorts/{id}`를 받으면 watch 페이지와 같은 `ytInitialData`(twoColumnWatchNextResults) 구조가 온다 (확인 2026-09-28). canonical은 `watch?v=`.

## 신호 (확인 결과)
| 신호 | 경로 | 등급 | 확인 결과 | 확인일 |
|------|------|------|----------|-------|
| **C2PA 기반 AI 라벨** ("Made with AI" + "Info from Google LLC / OpenAI") | HTML `ytInitialData` / innertube `next` | **결정적** | `howThisWasMadeSectionViewModel.attributionText.content`가 "Info from {서명자}" (ko: "정보 출처: {서명자}"). Veo(Google LLC), Sora(OpenAI) 영상에서 관측. YouTube 도움말: attribution은 Content Credentials 서명 주체 | 2026-09-28 |
| **제작자 공개 "변경되거나 합성된 콘텐츠"** ("Made with AI", attribution 없음) | HTML `ytInitialData` / innertube `next` | 결정적 후보(제작자 자기 신고) | 같은 view model, `attributionText`가 `{}`. 대부분 `videoPrimaryInfoRenderer.badges[].metadataBadgeRenderer`(label "AI", a11y "AI: Content was made with AI")도 동반 | 2026-09-28 |
| C2PA "카메라로 촬영됨" (Captured with a camera) | HTML / innertube `next` | 반대 방향(실제 촬영) 결정적 | 같은 view model, header "Captured with a camera", attribution "Info from Truepic", 도움말 링크 `answer/15446725`. 관측 사례 `gfjgRHtDa38`(Truepic). 실제 쇼츠에서 거의 없음 | 2026-09-28 |
| 자동 더빙 (Auto-dubbed) | 같은 view model | **무관 — 반드시 제외** | header "Auto-dubbed"/"자동 더빙", 도움말 `answer/15569972`. 섹션 존재만으로 AI 판정하면 오탐 | 2026-09-28 |
| Data API `status.containsSyntheticMedia` | Data API v3 `videos.list?part=status` | 결정적 후보 | 2024-10-30 추가된 필드(업로더가 insert/update로 설정). **타 채널 영상에 API 키로 조회 시 반환되는지 미확인**(키 없음). 반환되더라도 제작자 공개만 반영, C2PA attribution 구분 불가 | 미확인 |
| oEmbed | `https://www.youtube.com/oembed?url=...&format=json` | 약함(제목/채널명만) | `title`, `author_name`, `author_url`, 썸네일만. AI 라벨 없음 | 2026-09-28 |
| 제목/설명/해시태그의 AI 표기 | oEmbed `title` / `ytInitialPlayerResponse.videoDetails.shortDescription` | 강함 | 관측된 한국어 표기: #AI영상, #AI생성, #ai동물, "AI로 제작한", "AI가 만든", #AI콘텐츠. 영어: #aigenerated, #veo3, #klingai, #sora | 2026-09-28 |
| 채널 업로드 이력 | Data API `playlistItems` | 약~강 | 미검증 | - |

### 필드 경로 (구현용)
```
ytInitialData.engagementPanels[*]
  .engagementPanelSectionListRenderer.content
  .structuredDescriptionContentRenderer.items[*]
  .howThisWasMadeSectionViewModel
     .bodyHeader.content        # "Made with AI" | "AI로 제작" | "Captured with a camera" | "Auto-dubbed" | "자동 더빙"
     .bodyText.content          # "Sounds or visuals were altered or fully generated. Learn more"
     .bodyText.commandRuns[0].onTap.innertubeCommand.urlEndpoint.url
                                # //support.google.com/youtube/answer/{ID}  ← 언어 무관 판별 키
     .attributionText.content   # "Info from Google LLC" | "Info from OpenAI" | 없음({})
ytInitialData.contents.twoColumnWatchNextResults.results.results.contents[0]
  .videoPrimaryInfoRenderer.badges[*].metadataBadgeRenderer   # label "AI" (제작자 공개 시 주로 존재)
```
- 도움말 answer ID로 판별 (문구는 IP/hl에 따라 현지화되므로 텍스트 매칭 금지):
  - `15447836` → AI/합성 (Made with AI)
  - `15446725` → Captured with a camera
  - `15569972` → Auto-dubbed (무시)
- `attributionText.content` 존재 → C2PA 서명 기반(결정적, 서명자=생성기 벤더 추정 가능). 없음 → 제작자 공개.
- 라벨 부재는 **무정보**. AI 생성이 확실한 쇼츠 다수가 라벨 없음(예: `CQet9_sxSKo`, `V_EPw46kMrk`). 또 YouTube는 "명백히 비사실적인" 생성물(브레인롯 등)은 공개 의무 대상이 아니다.

### 수집 경로 (우선순위, 2026-09-28 서버 IP에서 실측)
1. **innertube `POST https://www.youtube.com/youtubei/v1/next?prettyPrint=false`**, body `{"context":{"client":{"clientName":"WEB","clientVersion":"2.2026MMDD.00.00","hl":"en","gl":"US"}},"videoId":"..."}` — 키 불필요, HTML이 캡차로 막힌 뒤에도 계속 200 응답. 같은 `howThisWasMadeSectionViewModel` 포함. (비공식 내부 API — 약관·변경 리스크)
2. HTML `https://www.youtube.com/watch?v={id}&hl=en` 의 `var ytInitialData = {...};` — 약 170회 연속 요청 후 `google.com/sorry` 캡차(302/303)로 차단됨.
3. oEmbed — 제목/채널명만. 해시태그 규칙용 폴백.
4. Data API v3 — 키 필요, `containsSyntheticMedia` 노출 여부 미확인.

## 주의
- 서버 IP 차단: HTML 스크래핑과 yt-dlp 영상 추출이 같은 IP에서 함께 막혔다("Sign in to confirm you're not a bot", 2026-09-28). 캐시 필수, 요청 간격 두기.
- yt-dlp 2026.08.x는 JS 런타임(deno) 없으면 경고 + 일부 포맷 누락.

## 구현 상태 (2026-09-28, T1)
- 코드: `server/rules/youtube.py`, 규칙 id·가중치·오탐 주의는 `_workspace/02_rules_spec.md` §3~§7
- 신호 id: `yt_c2pa_ai_label`(decisive) / `yt_creator_ai_disclosure` / `yt_c2pa_camera` / `yt_no_ai_label`(weight 0, 설명용) / `yt_self_report_ai` / 실패 시 `yt_ai_label`(unavailable)
- `present`(계약 v1.2): c2pa_ai·creator·camera=true, no_ai_label=false("AI 표시가 있나" 기준), self_report=매치 여부, unavailable=null. 의미표는 `_workspace/02_rules_spec.md` §3
- 회귀 fixture: `server/rules/tests/fixtures/next_*.json` (innertube 원본, hl=ko)
- 오탐 사례 기록: 자동 더빙 영상 배지 label이 "자동 더빙"으로 AI 배지와 같은 `metadataBadgeRenderer`에 온다 → label == "AI"만 인정

## 운영 (#9, 2026-09-29)
- **innertube 클라이언트 버전**: 기본값은 `youtube.INNERTUBE_CLIENT_VERSION`. 유튜브가 바꾸면 재배포 없이 `JJAJJA_INNERTUBE_CLIENT_VERSION`으로 덮어쓴다(요청마다 읽음). 최신 값은 watch 페이지 HTML의 `INNERTUBE_CONTEXT_CLIENT_VERSION`.
- **실패율 경고**: `youtube.MONITOR`가 경로(innertube/html/oembed)별 최근 20회 실제 호출을 본다. 200인데 파서가 못 읽는 응답·비200·네트워크 오류 = 실패. 봇 차단(429/403/캡차)은 IP 문제라 제외(기존 cooldown 경고). 10회 이상 중 50% 이상 실패하면 WARNING 로그(경로별 10분에 한 번). innertube 경고가 뜨면 먼저 클라이언트 버전을 확인한다.
- 남은 한계: 신호 캐시·차단 cooldown은 여전히 프로세스 메모리(재시작 시 사라짐, 워커 간 비공유). 최종 판정 결과는 `app/cache.py`가 파일로 저장해 재시작 후에도 재요청하지 않는다. 채널 업로드 이력 신호는 Data API 키 필요(#8).
