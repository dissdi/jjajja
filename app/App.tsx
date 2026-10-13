// 화면 흐름 (UX 명세 §1): S1 홈 → S2 확인 중 → S3 결과 / S4 에러
// 공유하기로 들어오면(#12 기능 3) S1을 건너뛰고 바로 S2 → S3.
// 화면이 4개뿐이고 한 방향 흐름이라 라우터 없이 상태 하나로 전환한다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { detect, uploadVideo, type PickedVideo } from './src/api/client';
import type { DetectResponse } from './src/api/contract';
import { originalLinkFrom, SHARE_SOURCE } from './src/capture/share';
import { useShareEntry } from './src/capture/useShareEntry';
import { ErrorScreen } from './src/screens/ErrorScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { YoutubeScreen } from './src/screens/YoutubeScreen';
import { color } from './src/ux/theme';

/** url 잡의 fromShare=true면 url은 공유로 받은 문구 그대로(제목+주소 섞임 가능) — 서버가 주소를 꺼낸다 */
type Job = { kind: 'url'; url: string; fromShare?: boolean } | { kind: 'upload'; video: PickedVideo };

type Screen =
  | { name: 'home'; text: string }
  | { name: 'loading'; job: Job }
  | { name: 'result'; job: Job; data: DetectResponse }
  | { name: 'error'; job: Job; code: string }
  | { name: 'youtube' }; // 앱 안 유튜브(시연) — src/screens/YoutubeScreen

const SEEN_RESULT_KEY = 'hasSeenResult';

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home', text: '' });
  const [homeKey, setHomeKey] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const inflight = useRef<AbortController | null>(null);

  // 첫 결과를 보기 전까지 첫 실행 안내 노출 (§2.1.2). 저장 실패 시 계속 노출.
  useEffect(() => {
    AsyncStorage.getItem(SEEN_RESULT_KEY)
      .then((v) => v === 'true' && setShowHint(false))
      .catch(() => {});
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
    const out = job.kind === 'url' ? await detect(job.url, job.fromShare ? SHARE_SOURCE : 'paste', ctrl.signal) : await uploadVideo(job.video, ctrl.signal);
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

  // 공유 시트에서 '우리 앱'을 고르면 바로 확인 시작 (Expo Go·웹에서는 동작 안 함 — README 참고)
  useShareEntry((text) => run({ kind: 'url', url: text, fromShare: true }));

  // Android 뒤로가기: S2 → 취소 후 S1, S3/S4 → S1 (§1)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'home' || screen.name === 'youtube') return false; // youtube는 화면이 직접 처리
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
            onSubmitUrl={(url) => run({ kind: 'url', url })}
            onSubmitVideo={(video) => run({ kind: 'upload', video })}
            onOpenYoutube={() => setScreen({ name: 'youtube' })}
          />
        )}
        {screen.name === 'youtube' && (
          <YoutubeScreen onExit={() => goHome()} onSubmitVideo={(video) => run({ kind: 'upload', video })} />
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
  );
}
