// 화면 흐름 (UX 명세 §1 + 계약 v2.0 로그인 필수, GitHub #20)
// 시작: 저장된 토큰이 없으면 로그인이 첫 화면. 있으면 S1 홈 → S2 확인 중 → S3 결과 / S4 에러.
// 공유하기로 들어오면(#12 기능 3) S1을 건너뛰고 바로 S2 → S3. 로그인 전이면 로그인 후 바로 그 공유를 확인한다.
// 확인 중 401이면 토큰을 지우고 로그인으로 → 로그인 후 하던 확인(공유 문구·주소·영상)을 이어서 한다.
// 화면이 적고 한 방향 흐름이라 라우터 없이 상태 하나로 전환한다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE, detect, logout, uploadVideo, type PickedVideo } from './src/api/client';
import type { AuthResponse, DetectResponse } from './src/api/contract';
import { getToken, onExpired, restoreSession, signIn, signOut } from './src/auth/session';
import { originalLinkFrom, SHARE_SOURCE } from './src/capture/share';
import { useShareEntry } from './src/capture/useShareEntry';
import { DevBand, FontsReadyContext } from './src/components/ui';
import { AccountScreen } from './src/screens/AccountScreen';
import { LoginScreen, SignupScreen } from './src/screens/AuthScreens';
import { ErrorScreen } from './src/screens/ErrorScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { YoutubeScreen } from './src/screens/YoutubeScreen';
import { color, FONT_ASSETS } from './src/ux/theme';

// 폰트·로그인 상태를 읽는 동안 스플래시를 유지한다. 폰트가 실패하거나 늦어도 SPLASH_MAX_MS 뒤에는 시스템 글꼴로 시작.
SplashScreen.preventAutoHideAsync().catch(() => {});
const SPLASH_MAX_MS = 4_000;

/** url 잡의 fromShare=true면 url은 공유로 받은 문구 그대로(제목+주소 섞임 가능) — 서버가 주소를 꺼낸다 */
export type Job = { kind: 'url'; url: string; fromShare?: boolean } | { kind: 'upload'; video: PickedVideo };

type Screen =
  | { name: 'boot' } // 저장된 토큰 읽는 중 (스플래시가 덮고 있음)
  | { name: 'login'; notice: 'pending' | 'expired' | null }
  | { name: 'signup' }
  | { name: 'home'; text: string }
  | { name: 'loading'; job: Job }
  | { name: 'result'; job: Job; data: DetectResponse }
  | { name: 'error'; job: Job; code: string }
  | { name: 'youtube' } // 앱 안 유튜브(시연) — src/screens/YoutubeScreen
  | { name: 'history' }
  | { name: 'account' };

const SEEN_RESULT_KEY = 'hasSeenResult';

export default function App() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const [splashTimedOut, setSplashTimedOut] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: 'boot' });
  const [homeKey, setHomeKey] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const inflight = useRef<AbortController | null>(null);
  const booted = useRef(false);
  /** 로그인 후 이어서 할 확인 (공유로 들어왔는데 로그인 전 / 확인 중 401) */
  const pending = useRef<Job | null>(null);

  // 첫 결과를 보기 전까지 첫 실행 안내 노출 (§2.1.2). 저장 실패 시 계속 노출.
  useEffect(() => {
    AsyncStorage.getItem(SEEN_RESULT_KEY)
      .then((v) => v === 'true' && setShowHint(false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSplashTimedOut(true), SPLASH_MAX_MS);
    return () => clearTimeout(t);
  }, []);

  const splashDone = (fontsLoaded || !!fontError || splashTimedOut) && screen.name !== 'boot';
  useEffect(() => {
    if (splashDone) SplashScreen.hideAsync().catch(() => {});
  }, [splashDone]);

  const goHome = useCallback((text = '') => {
    inflight.current?.abort();
    inflight.current = null;
    setHomeKey((k) => k + 1); // 입력칸 상태 초기화
    setScreen({ name: 'home', text });
  }, []);

  const toLogin = useCallback((notice: 'pending' | 'expired' | null) => {
    inflight.current?.abort();
    inflight.current = null;
    setScreen({ name: 'login', notice });
  }, []);

  const run = useCallback(
    async (job: Job) => {
      if (!getToken()) {
        // 로그인 필수 (계약 v2.0) — 로그인 후 바로 이 확인을 한다
        pending.current = job;
        toLogin('pending');
        return;
      }
      inflight.current?.abort();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      setScreen({ name: 'loading', job });
      const out =
        job.kind === 'url'
          ? await detect(job.url, job.fromShare ? SHARE_SOURCE : 'paste', ctrl.signal)
          : await uploadVideo(job.video, ctrl.signal);
      if (out.ok === false && out.code === 'unauthorized') {
        // 토큰은 client가 지웠고 onExpired가 로그인 화면으로 보냈다. 로그인 후 이어서 확인
        pending.current = job;
        return;
      }
      if (ctrl.signal.aborted || inflight.current !== ctrl) return; // 사용자가 그만둠
      inflight.current = null;
      if (out.ok) {
        setScreen({ name: 'result', job, data: out.data });
        setShowHint(false);
        AsyncStorage.setItem(SEEN_RESULT_KEY, 'true').catch(() => {});
      } else if (out.code !== 'cancelled') {
        setScreen({ name: 'error', job, code: out.code });
      }
    },
    [toLogin],
  );

  // 시작: 저장된 토큰 읽기 → 없으면 로그인, 있으면 홈(또는 기다리던 공유 확인)
  useEffect(() => {
    let alive = true;
    restoreSession().then((t) => {
      if (!alive) return;
      booted.current = true;
      const p = pending.current;
      if (!t) {
        setScreen({ name: 'login', notice: p ? 'pending' : null });
      } else if (p) {
        pending.current = null;
        void run(p);
      } else {
        setScreen({ name: 'home', text: '' });
      }
    });
    return () => {
      alive = false;
    };
  }, [run]);

  // 서버 401 → 토큰 삭제됨 → 로그인 화면으로 (이미 로그인·가입 화면이면 그대로)
  useEffect(
    () =>
      onExpired(() => {
        inflight.current = null;
        setScreen((s) => (s.name === 'login' || s.name === 'signup' ? s : { name: 'login', notice: 'expired' }));
      }),
    [],
  );

  const onAuthed = useCallback(
    async (res: AuthResponse) => {
      await signIn(res.token);
      const p = pending.current;
      pending.current = null;
      if (p) void run(p);
      else goHome();
    },
    [run, goHome],
  );

  const onLogout = useCallback(async () => {
    await logout().catch(() => null); // 서버 폐기는 최선만 — 실패해도 이 기기에서는 지운다
    await signOut();
    pending.current = null;
    toLogin(null);
  }, [toLogin]);

  // 공유 시트에서 '우리 앱'을 고르면 바로 확인 시작 (Expo Go·웹에서는 동작 안 함 — README 참고)
  useShareEntry((text) => {
    const job: Job = { kind: 'url', url: text, fromShare: true };
    if (!booted.current) {
      pending.current = job; // 토큰을 다 읽으면 처리
      return;
    }
    void run(job);
  });

  // Android 뒤로가기: S2 → 취소 후 S1, S3/S4 → S1 (§1). 가입 → 로그인.
  // youtube·history·account는 화면이 직접 처리한다(시트·요약 닫기 먼저).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      switch (screen.name) {
        case 'boot':
        case 'login':
        case 'home':
        case 'youtube':
        case 'history':
        case 'account':
          return false;
        case 'signup':
          setScreen({ name: 'login', notice: pending.current ? 'pending' : null });
          return true;
        default:
          goHome(screen.name === 'loading' && screen.job.kind === 'url' ? screen.job.url : '');
          return true;
      }
    });
    return () => sub.remove();
  }, [screen, goHome]);

  return (
    <FontsReadyContext.Provider value={fontsLoaded && !fontError}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: color.paper }}>
          <StatusBar style="dark" />
          <DevBand apiBase={API_BASE} />
          {screen.name === 'boot' && <View style={{ flex: 1, backgroundColor: color.paper }} testID="boot" />}
          {screen.name === 'login' && (
            <LoginScreen
              notice={screen.notice}
              onLoggedIn={onAuthed}
              onGoSignup={() => setScreen({ name: 'signup' })}
            />
          )}
          {screen.name === 'signup' && (
            <SignupScreen
              notice={pending.current ? 'pending' : null}
              onSignedUp={onAuthed}
              onGoLogin={() => setScreen({ name: 'login', notice: pending.current ? 'pending' : null })}
            />
          )}
          {screen.name === 'home' && (
            <HomeScreen
              key={homeKey}
              initialText={screen.text}
              showFirstRunHint={showHint}
              onSubmitUrl={(url) => run({ kind: 'url', url })}
              onSubmitVideo={(video) => run({ kind: 'upload', video })}
              onOpenYoutube={() => setScreen({ name: 'youtube' })}
              onOpenHistory={() => setScreen({ name: 'history' })}
              onOpenAccount={() => setScreen({ name: 'account' })}
            />
          )}
          {screen.name === 'youtube' && (
            <YoutubeScreen onExit={() => goHome()} onSubmitVideo={(video) => run({ kind: 'upload', video })} />
          )}
          {screen.name === 'history' && (
            <HistoryScreen onBack={() => goHome()} onRecheck={(url) => run({ kind: 'url', url })} />
          )}
          {screen.name === 'account' && <AccountScreen onBack={() => goHome()} onLogout={onLogout} />}
          {screen.name === 'loading' && (
            <LoadingScreen
              isUpload={screen.job.kind === 'upload'}
              onCancel={() => goHome(screen.job.kind === 'url' ? screen.job.url : '')}
            />
          )}
          {screen.name === 'result' && (
            <ResultScreen
              data={screen.data}
              url={screen.job.kind === 'url' ? (screen.job.fromShare ? originalLinkFrom(screen.job.url) : screen.job.url) : null}
              fromShare={screen.job.kind === 'url' && screen.job.fromShare === true}
              onRetry={() => run(screen.job)}
              onAgain={() => goHome()}
              onSubmitVideo={(video) => run({ kind: 'upload', video })}
            />
          )}
          {screen.name === 'error' && (
            <ErrorScreen code={screen.code} onRetry={() => run(screen.job)} onHome={() => goHome()} />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </FontsReadyContext.Provider>
  );
}
