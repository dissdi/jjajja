# jjajja

AI로 만든 쇼츠(AI 슬롭)인지 확인해 주는 모바일 앱.
AI 영상을 구분하기 어려워 단톡방 등에 그대로 공유하는 50~60대 사용자가 **공유 전에 한 번 멈추게** 하는 것이 목표다.

```
유튜브 쇼츠 링크 붙여넣기 ─▶ 탐지 서버 ─▶ "AI로 만든 영상일 가능성이 높아요 (AI 가능성 95%)"
```

## 현재 범위 (1차 MVP)

| 기능 | 상태 |
|------|------|
| 유튜브 쇼츠 URL 붙여넣기 → AI 가능성 | ✅ |
| 영상 파일 직접 올려서 확인 | ✅ |
| 유튜브 자체 AI 표시(C2PA·제작자 공개) 규칙 신호 | ✅ |
| 상용 탐지 API(Hive) — 최신 영상 생성기(Veo 3, Sora 2, Kling, Seedance 등) 대응 | ✅ 평가셋 오탐 0/8·놓침 0/14 (설정으로 켬, 표본 작음) |
| 오픈소스 탐지 모델(Community Forensics) | ⚠️ 동작하지만 판별력 약함 (참고용) |
| 결과 화면 "자세히 보기" — 모델별 점수 | ✅ |
| **데스크탑 유튜브 크롬 확장** — 영상 시청 중 원클릭 확인 (`extension/`) | ✅ 내부용 (개발자 모드로 설치) |
| **앱 안 유튜브 (시연)** — 쇼츠를 넘기면 자동 확인, 화면 위 배지 | ✅ 휴대폰 Expo Go로 시연 확인 (출시 불가, 시연 전용) |
| **공유 → 확인 → 다시 공유** — 유튜브·카카오톡 공유 목록에 jjajja, 결과 문구+링크 재공유 | 🧪 구현 완료, 개발용 빌드(EAS) 필요·실기기 미확인 |
| 복사만 해도 확인 | ⏳ 다음 단계 |
| 틱톡·인스타 릴스 | ⏳ 다음 단계 |

## 구조

```
server/        FastAPI 탐지 서버 (Python)
  rules/       출처별 규칙 — URL 정규화, 유튜브 AI 표시 신호
  detectors/   탐지 모델 어댑터 (d3, commfor_224, mock)
  app/         API, 파이프라인, 앙상블
  config/      앙상블 가중치 (weights.yaml)
app/           Expo(React Native, TypeScript) 앱 — 붙여넣기·업로드, 공유 수신, 앱 안 유튜브(시연)
extension/     데스크탑 유튜브 크롬 확장 (Manifest V3, 빌드 없이 로드)
eval/          평가용 라벨 데이터셋
.claude/       개발용 에이전트 하네스 (에이전트·스킬 정의)
```

서버와 앱 사이 API 형식은 [`.claude/skills/detect-api-contract/SKILL.md`](.claude/skills/detect-api-contract/SKILL.md)가 단일 기준이다.

## 실행

### 1. 환경 (conda)

```sh
conda env create -f environment.yml   # python 3.11, ffmpeg, nodejs 20
conda activate jjajja
pip install -r server/requirements.txt
```

### 2. 서버

```sh
cd server
uvicorn app.main:app --host 0.0.0.0 --port 8000
curl localhost:8000/v1/health
```

모델 가중치는 첫 실행 때 Hugging Face에서 받는다(약 0.9GB). 기본은 CPU로 돈다. 설정·GPU 사용법은 [`server/README.md`](server/README.md).

#### Hive(상용 탐지 API) 켜기

1. [portal.thehive.ai](https://portal.thehive.ai/signup)에서 API 키를 발급한다.
2. `server/.env`에 `HIVE_API_KEY=발급받은키`를 적는다(gitignore됨, `chmod 600` 권장). 키는 커밋·로그에 남기지 않는다.
3. 탐지기 목록에 `hive`를 넣어 띄운다(서버가 시작할 때 `server/.env`를 스스로 읽는다):

```sh
cd server
JJAJJA_DETECTORS=d3,commfor_224,hive uvicorn app.main:app --port 8000
curl localhost:8000/v1/health    # detectors.hive == "ok" 확인
```

- 비용: 영상 앞 20초만 보낸다(1초 1프레임, 약 $6/1000프레임 → 영상 1편 약 $0.12). 같은 영상은 결과 캐시로 다시 과금되지 않는다.
- 키가 없으면 `hive`만 "down"으로 빠지고 서버는 정상 동작한다.
- 사용자가 올린 영상이 외부 업체로 전송된다 — 출시 전 개인정보·약관 검토 대상(#10).

### 3-A. 웹으로 시연 (가장 간단)

원격 서버(VS Code Remote)에서 띄우고 PC 브라우저로 본다. 터미널 두 개:

```sh
# 터미널 1: 서버 — 웹 앱(8081)에서 부를 수 있게 CORS를 켠다
conda activate jjajja
cd server
JJAJJA_CORS_ORIGINS=http://localhost:8081 uvicorn app.main:app --host 127.0.0.1 --port 8000
# Hive까지 켜려면 앞에 JJAJJA_DETECTORS=d3,commfor_224,hive 를 붙인다

# 터미널 2: 웹 앱
conda activate jjajja
cd app
npm install             # 처음 한 번
# 공용 서버에서는 Metro 캐시를 프로젝트 안에 둔다 (/tmp/metro-cache는 다른 사용자와 공유돼 권한 오류가 난다)
mkdir -p .expo/tmp
TMPDIR=$PWD/.expo/tmp EXPO_PUBLIC_API_BASE=http://localhost:8000 npx expo start --web --port 8081
```

`CI=1`을 붙이지 않는다 — 파일 감시가 꺼져서 코드를 고쳐도 새로고침에 반영되지 않는다.

1. VS Code 아래쪽 **PORTS** 탭에서 **8000**, **8081**을 포워딩한다(자동으로 잡히면 생략).
2. PC 브라우저에서 **http://localhost:8081** 을 연다. 개발자 도구의 모바일 보기(Ctrl+Shift+M)를 켜면 휴대폰 화면처럼 보인다.

시연용 링크:

| 링크 | 예상 결과 |
|---|---|
| `https://youtube.com/shorts/kaVmpWPnE5s` | 🔴 AI 가능성 높음 — 올린 사람이 AI 영상이라고 밝힘 |
| `https://youtube.com/shorts/gfjgRHtDa38` | 🟢 AI 흔적 없음 — 제작 기록에 카메라 촬영 |
| 유튜브 AI 표시가 없는 일반 쇼츠 | 🟡 확실하지 않아요 — 결과 아래 "자세히 보기"에서 모델 점수 확인 |

유튜브가 서버 IP를 봇으로 막으면 영상 다운로드가 실패한다. 그때는 서버를 `JJAJJA_FETCH_ENABLED=0`으로 띄워 유튜브 표시만으로 판정하거나, 앱의 **영상 파일로 확인하기**로 mp4를 올린다. 같은 링크를 반복 요청하지 말 것(결과는 캐시된다).

### 3-B. 휴대폰으로 시연 (Expo Go, 앱 안 유튜브 포함)

원격 서버에서 띄우고, 휴대폰은 **임시 터널 두 개**로 붙는다: ① 탐지 서버(8000) ② 앱 번들(Metro). 휴대폰과 서버가 같은 네트워크일 필요가 없다.

**처음 한 번 — 도구 설치**
```sh
# cloudflared (탐지 서버 터널). conda에 없어서 공식 릴리스를 .tools/에 받는다 (gitignore됨)
mkdir -p .tools && curl -sSL -o .tools/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x .tools/cloudflared
# Expo --tunnel 이 쓰는 ngrok (conda env jjajja의 node에 전역 설치)
conda activate jjajja && npm i -g @expo/ngrok@^4.1.0
```

**시연할 때 — 터미널 세 개**
```sh
# 터미널 1: 탐지 서버 (Hive·개발 모드는 선택)
cd server
JJAJJA_DEBUG=1 JJAJJA_DETECTORS=d3,commfor_224,hive uvicorn app.main:app --host 127.0.0.1 --port 8000

# 터미널 2: 탐지 서버 임시 터널 → 출력의 https://xxxx.trycloudflare.com 주소를 복사
.tools/cloudflared tunnel --no-autoupdate --url http://localhost:8000

# 터미널 3: 앱 번들 터널. API 주소는 터널 2의 주소, EXPO_PUBLIC_* 는 번들 시점 값이라 -c
cd app
mkdir -p .expo/tmp2
TMPDIR=$PWD/.expo/tmp2 EXPO_PUBLIC_DEBUG=1 \
EXPO_PUBLIC_API_BASE=https://xxxx.trycloudflare.com \
npx expo start --tunnel --port 8082 -c
```

**휴대폰**
1. Expo Go 설치 → 터미널 3의 QR을 찍거나, "Enter URL manually"에 `exp://xxxx-anonymous-8082.exp.direct` 입력.
   터미널이 QR을 그리지 못하는 환경이면 주소는 `curl -s localhost:8082 -H 'expo-platform: android'`의 `exp.direct` 호스트로 확인하고, QR은 `python -c "import segno; segno.make('exp://...').save('.tools/expo-qr.png', scale=10)"`로 만들어 VS Code에서 연다.
2. 홈 맨 아래 **[유튜브 보면서 확인하기 (시연)]** → 쇼츠를 넘기다 한 편에 0.8초 머물면 오른쪽 위 배지가 "확인 중…" → "AI 가능성 ○○%". 배지를 누르면 결과·자세히 보기.

**주의**
- 터널이 열려 있는 동안 탐지 서버가 인터넷에 노출된다. 시연이 끝나면 터널(터미널 2·3)을 닫는다.
- 터널 주소는 실행할 때마다 바뀐다. 바뀌면 터미널 3을 새 주소로 `-c` 재시작.
- 서버 자신의 DNS가 새 `trycloudflare.com` 주소를 바로 못 찾을 수 있다(휴대폰은 정상). 서버에서 확인하려면 `curl --resolve <host>:443:<IP>` 로 외부 DNS의 IP를 지정.
- 쇼츠를 넘길 때마다 서버가 영상을 내려받으므로 **시연은 10~20편 정도**로. 많이 넘기면 유튜브가 서버 IP를 봇으로 막는다(막히면 유튜브 표시만으로 판정).
- 앱 안 유튜브는 구글 로그인이 안 되고, 재생 차단·봇 확인 화면이 뜰 수 있다. 시연 전용 — 스토어 출시 불가.
- 처음 열 때 번들 생성에 시간이 걸린다. 미리 `curl -s -o /dev/null "http://localhost:8082/index.ts.bundle?platform=android&dev=true"` 로 데워 두면 빠르다.
- 공유하기(기능 3)는 Expo Go에서 동작하지 않는다 → [`app/README.md`](app/README.md)의 EAS 빌드 절차.

### 3-C. 데스크탑 크롬 확장

크롬 → `chrome://extensions` → **개발자 모드** → **압축해제된 확장 프로그램 로드** → `extension/` 폴더. 유튜브 영상·쇼츠에서 아이콘이 켜지고, 누르면 결과 팝업. 서버 주소는 확장 옵션에서 바꾼다(기본 `http://localhost:8000`, 다른 PC는 3-B의 터널 주소). 자세한 내용은 [`extension/README.md`](extension/README.md).

### 테스트

```sh
conda activate jjajja                # (base)에는 pytest·서버 패키지가 없다
cd server && python -m pytest -q     # 네트워크 없이 fixture로 동작
cd ../app && npx jest && npx tsc --noEmit
cd ../extension && node --test       # 크롬 확장 순수 로직
```

환경을 켜지 않고 돌리려면 `conda run -n jjajja python -m pytest -q`.

## 알려진 한계

- **Hive는 작은 평가셋에서만 검증됐다.** 평가셋 22개(AI 14, 실제 8)에서 Hive 단독 AUC 1.00(실제 영상은 모두 0.095 이하, AI는 모두 0.135 이상), 전체 파이프라인 오탐 0/8·놓침 0/14였다(재현: `server/tools/collect_hive_scores.py`, `server/tools/compare_hive_loo.py`). 다만 실제 영상이 8개뿐이라 오탐률의 95% 상한은 여전히 37%다 — 평가셋 확장(#4) 후 다시 확인한다. 그래서 Hive는 "AI 가능성 높음"을 낼 수 있는 강한 신호로 쓰되, **모델만으로 "AI 흔적 없음"은 내지 않는 하한은 유지**한다(실제 영상은 "확실하지 않아요"가 최선). 생성기 이름 추정(kling, seedance2 등)은 프레임마다 흔들려 사용자 화면에 보여주지 않는다. 평가 클립에 소리가 없어 AI 음성 판정은 검증하지 못했다.
- **공개 탐지 모델의 판별력이 약하다.** 평가셋 22개(AI 14, 실제 8)로 잰 결과 D3는 AUC 0.44(무작위 수준)라 껐고, Community Forensics는 0.70이지만 신뢰구간이 0.5를 포함해 비중을 낮춰 참고용으로만 쓴다(재현: `server/tools/collect_eval_scores.py`, `server/tools/calibrate_loo.py`). 그래서 유튜브 AI 표시·촬영 기록이 없는 영상은 **최선이 "확실하지 않아요"** 다. 모델만으로 "AI 가능성 높음"이나 "AI 흔적 없음"이 나오지 않도록 막아 두었다.
- **URL 방식은 영상 자체를 못 볼 수 있다.** 플랫폼이 서버의 영상 다운로드를 막으면 유튜브 AI 표시만으로 판정하고, 판단 근거가 없으면 영상 파일로 확인하도록 안내한다.
- **약관 리스크**: URL 방식의 영상 다운로드(yt-dlp)와 유튜브 비공식 API 사용은 연구/프로토타입 용도다. 출시 전 법무 검토가 필요하다.
- 단축 링크(bit.ly, kko.to, naver.me 등)는 서버가 리다이렉트를 따라가 해석한다(#7). 허용 목록(`server/rules/shorturl.py`의 `SHORTENERS`)에 없는 단축 서비스는 인식하지 못한다.

## 로드맵

1. **1차** — 쇼츠 URL 붙여넣기 → AI 가능성 (현재)
2. **base** — 영상 직접 올리기 (구현됨), 탐지 모델 개선: 상용 API(Hive) 채택(설정으로 켬), 평가셋 100개 이상으로 재검증(#4), 필요 시 자체 학습
3. **branch** — 배포 환경별 진입점: 데스크탑 크롬 확장 (구현됨), 앱 안 유튜브 시연 (구현됨), 공유 → 확인 → 다시 공유 (구현됨, 실기기 확인 필요), 복사 후 앱을 열면 확인 제안
4. 플랫폼 확장 — 틱톡, 인스타 릴스
