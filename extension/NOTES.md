# extension 작업 노트 (web-extension-engineer, 2026-10-13)

## 결정
- **활성화 방식**: `declarativeContent` 대신 `action.disable()`(전역 기본) + 탭 단위 `enable/disable` + `setIcon`.
  declarativeContent 는 아이콘을 탭별로 바꾸기 번거롭고(ImageData 필요), 상태를 코드로 테스트하기 어렵다.
  판별은 `lib/video.js` 순수 함수 하나로 통일.
- **SPA 감지 이중화**: `tabs.onUpdated`(pushState 도 `changeInfo.url` 로 옴) + content script `yt-navigate-finish`.
  `tabs` 권한 없이 youtube host 권한만으로 유튜브 탭의 url 이 보인다. 다른 사이트 탭은 url 이 비어 있어 자동으로 꺼짐 처리.
- **보내는 URL**: 탭 URL 을 그대로 보내지 않고 `https://www.youtube.com/watch?v=ID` / `.../shorts/ID` 로 정규화
  (재생목록 `list`, 시간 `t`, 추적 파라미터 제거 → 서버 캐시 적중률↑). 서버 `rules/youtube.py` 가 두 형식 모두 처리.
- **source**: 계약 값 중 `"paste"` 사용 (새 값 추가 금지 지시). 통계상 확장 경로를 구분할 수 없다는 한계 있음 —
  구분이 필요하면 계약에 값을 먼저 추가해야 한다(detection-engineer 요청 사항).
- **캐시 키**: `result:youtube:<video_id>` — watch/shorts 로 같은 영상을 열어도 같은 결과. `storage.session` 이라 브라우저를 닫으면 삭제.
  service worker 메모리의 in-flight Map 으로 같은 영상 동시 요청을 하나로 합친다.
- **제한 시간**: 45초(AbortController). 계약 v1.2 URL 서버 보장 40초.
- **권한**: localhost/127.0.0.1 은 기본 host_permissions(포트 무관). 그 외 주소는 옵션 페이지 [저장] 클릭 핸들러에서
  `permissions.request({origins:["https://host/*"]})` — 사용자 동작 안에서 첫 await 로 호출해야 한다. 주소를 바꾸면 이전 주소 권한 반납.

## UX 문구 조정 (senior-ux-korean 기준, 확장 맥락에 맞춘 부분)
- verdict 표·에러 표는 그대로. 아이콘은 색 외에 문자도 다르게: `!` `?` `✓` `–` (색각 이상 대비).
- `invalid_url`: 원문은 "공유 → 링크 복사 후 붙여넣기" 안내인데 확장에는 붙여넣기가 없다 → "유튜브 영상 화면에서 다시 눌러 주세요".
- `unsupported_platform`: "유튜브 쇼츠" → "유튜브 영상" (확장은 일반 watch 영상도 받음).
- D1(주소 확인 + unknown + partial): 헤드라인은 원문, 보조 문장은 확장에 파일 업로드가 없어
  "영상 파일이 있다면 휴대폰 앱에서 파일로 확인할 수 있어요" 로 변경. 퍼센트·근거 숨김.
- 근거: status ok + 문장 있음, decisive 먼저, 최대 3개. **꺼진 모델(kind=model, weight 0) 근거는 숨김** —
  실제 서버(디버그 모드)에서 d3 가 weight 0 인데 "화면 움직임만으로는 판단하기 어려워요" 가 근거로 나와 판정과 무관한 문장이 섞였다.
  규칙 쪽 weight 0(설명용)은 계약대로 보여준다.
- 확장 전용 에러(네트워크/권한/서버 주소 없음/영상 화면 아님)는 같은 톤으로 작성, 네트워크·권한은 [설정 열기] 버튼.
- "자세히 (개발자용)": 서버가 debug 를 하나라도 보낼 때만. 사용자용 "자세히 보기"(모델 n%·규칙 있음/없음)는 이번 범위에서 만들지 않았다.
- 팝업은 380px 폭 제약 때문에 본문 18px / 헤드라인 24px, 버튼 높이 52px.

## 검증
- `node --test test/` 22개 통과 (URL 판별, 서버 주소 정규화, 응답 검사, 표시 모델, 에러 매핑, fetch 주입 POST/에러/timeout).
- 로컬 서버(`localhost:8000`, 디버그 모드)에 `lib/api.js` 로 실제 요청 → 파싱·표시 모델 정상, debugRows 5개.
  - 참고(탐지 쪽): `dQw4w9WgXcQ`(실사 뮤직비디오)가 hive 0.0022 / commfor 0.02 인데 ai_probability 0.40 → `uncertain`.
    규칙 weight 0 신호들이 0.5 로 들어가 평균을 끌어올리는지 detection-engineer 확인 필요 (확장은 서버 verdict 를 그대로 씀).
- 크롬 실제 로드는 이 서버에서 못 해 봄 → README 의 수동 확인 항목 참고.

## 수동 확인 필요 (크롬에서)
1. 로드 시 매니페스트 오류 없음, 유튜브 홈 → 회색/비활성, 영상 클릭(SPA 이동) → 빨강/활성, 홈으로 돌아가면 다시 비활성
2. shorts 에서 위아래로 넘길 때 버튼 유지, 새 영상으로 결과 요청되는지
3. 터널 주소 저장 시 권한 프롬프트 → 허용 후 결과 표시, 거부 시 문구
4. 팝업 닫았다 다시 열기 → 캐시 결과 즉시 + "n분 전" 안내, [다시 확인] 동작
5. 서버 끄고 누르기 → 네트워크 문구 + [설정 열기]
