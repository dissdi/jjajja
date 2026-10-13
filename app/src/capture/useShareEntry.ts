// 공유 시트로 앱이 열렸을 때(또는 실행 중에 공유가 들어왔을 때) onShared(text)를 한 번 부른다.
// 네이티브: expo-share-intent (app.json plugins). Expo Go·웹에는 네이티브 모듈이 없어서 아무 일도 하지 않는다
// (라이브러리가 requireOptionalNativeModule로 null을 받아 조용히 꺼짐) → 기존 붙여넣기 흐름은 그대로.
import { useShareIntent } from 'expo-share-intent';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { decideShareEntry } from './share';

export function useShareEntry(onShared: (text: string) => void): void {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    disabled: Platform.OS === 'web',
    // 결과를 보고 카카오톡으로 다시 보내러 나갔다 와도 같은 공유를 다시 확인하지 않도록 기본값(true) 유지
    resetOnBackground: true,
  });
  const lastHandled = useRef<string | null>(null);
  const cb = useRef(onShared);
  cb.current = onShared;

  useEffect(() => {
    if (!hasShareIntent) {
      lastHandled.current = null; // 처리 후 비워졌으면 같은 영상을 다시 공유해도 다시 확인
      return;
    }
    const d = decideShareEntry(hasShareIntent, shareIntent, lastHandled.current);
    if (d.kind === 'run') {
      lastHandled.current = d.text;
      cb.current(d.text);
    }
    resetShareIntent(); // 네이티브 쪽 값도 비움 — 앱을 다시 열 때 같은 공유가 또 들어오지 않게
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent, shareIntent]);
}
