// 화면 흐름 (UX 명세 §1): S1 홈 → S2 확인 중 → S3 결과 / S4 에러
// 화면이 4개뿐이고 한 방향 흐름이라 라우터 없이 상태 하나로 전환한다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { detect, uploadVideo, type PickedVideo } from './src/api/client';
import type { DetectResponse, DetectSource } from './src/api/contract';
import { clipboardMayHaveLink } from './src/capture/clipboard';
import { ErrorScreen } from './src/screens/ErrorScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { color } from './src/ux/theme';

type Job = { kind: 'url'; url: string; source: DetectSource } | { kind: 'upload'; video: PickedVideo };

type Screen =
  | { name: 'home'; text: string }
  | { name: 'loading'; job: Job }
  | { name: 'result'; job: Job; data: DetectResponse }
  | { name: 'error'; job: Job; code: string };

const SEEN_RESULT_KEY = 'hasSeenResult';

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home', text: '' });
  const [homeKey, setHomeKey] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const [clipboardHint, setClipboardHint] = useState(false);
  const inflight = useRef<AbortController | null>(null);

  // 첫 결과를 보기 전까지 첫 실행 안내 노출 (§2.1.2). 저장 실패 시 계속 노출.
  useEffect(() => {
    AsyncStorage.getItem(SEEN_RESULT_KEY)
      .then((v) => v === 'true' && setShowHint(false))
      .catch(() => {});
  }, []);

  // 복사만 해도 확인 (#12): 앱을 열 때·다시 앞으로 올 때만 클립보드를 (내용 없이) 확인한다.
  // 한 번 확인을 시작하면 다음에 앱이 다시 앞으로 올 때까지 안내를 띄우지 않는다 —
  // 방금 확인한 주소가 클립보드에 남아 있어도 홈으로 돌아올 때 같은 안내가 반복되지 않게.
  const clipboardMuted = useRef(false);
  useEffect(() => {
    const check = () => {
      clipboardMayHaveLink()
        .then((has) => setClipboardHint(has && !clipboardMuted.current)) // 늦게 끝난 확인이 다시 켜지 않게
        .catch(() => setClipboardHint(false));
    };
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      clipboardMuted.current = false;
      check();
    });
    return () => sub.remove();
  }, []);

  const goHome = useCallback((text = '') => {
    inflight.current?.abort();
    inflight.current = null;
    setHomeKey((k) => k + 1); // 입력칸 상태 초기화
    setScreen({ name: 'home', text });
  }, []);

  const run = useCallback(async (job: Job) => {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setScreen({ name: 'loading', job });
    clipboardMuted.current = true;
    setClipboardHint(false);
    const out = job.kind === 'url' ? await detect(job.url, job.source, ctrl.signal) : await uploadVideo(job.video, ctrl.signal);
    if (ctrl.signal.aborted || inflight.current !== ctrl) return; // 사용자가 그만둠
    inflight.current = null;
    if (out.ok) {
      setScreen({ name: 'result', job, data: out.data });
      setShowHint(false);
      AsyncStorage.setItem(SEEN_RESULT_KEY, 'true').catch(() => {});
    } else if (out.code !== 'cancelled') {
      setScreen({ name: 'error', job, code: out.code });
    }
  }, []);

  // Android 뒤로가기: S2 → 취소 후 S1, S3/S4 → S1 (§1)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'home') return false;
      goHome(screen.name === 'loading' && screen.job.kind === 'url' ? screen.job.url : '');
      return true;
    });
    return () => sub.remove();
  }, [screen, goHome]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: color.background }}>
        <StatusBar style="dark" />
        {screen.name === 'home' && (
          <HomeScreen
            key={homeKey}
            initialText={screen.text}
            showFirstRunHint={showHint}
            clipboardHint={clipboardHint}
            onSubmitUrl={(url, source) => run({ kind: 'url', url, source })}
            onSubmitVideo={(video) => run({ kind: 'upload', video })}
          />
        )}
        {screen.name === 'loading' && (
          <LoadingScreen
            isUpload={screen.job.kind === 'upload'}
            onCancel={() => goHome(screen.job.kind === 'url' ? screen.job.url : '')}
          />
        )}
        {screen.name === 'result' && (
          <ResultScreen
            data={screen.data}
            url={screen.job.kind === 'url' ? screen.job.url : null}
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
  );
}
