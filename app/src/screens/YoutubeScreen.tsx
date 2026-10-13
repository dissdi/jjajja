// 앱 안 유튜브(시연, 출시용 아님) — 유튜브 모바일 웹을 WebView로 거의 전체 화면에 띄우고,
// 쇼츠를 넘길 때마다 자동으로 확인해 오버레이 배지로 보여준다. 배지를 누르면 바텀시트로 결과 화면.
// 웹 번들은 YoutubeScreen.web.tsx(안내 화면)를 쓴다.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  type LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { detect } from '../api/client';
import { Button, T } from '../components/ui';
import { copy, errorCopyFor } from '../ux/copy';
import { color, font, radius, size, space, verdictColor, verdictIcon } from '../ux/theme';
import { useAutoCheck, type CheckState } from '../youtube/autoCheck';
import { badgeFor, clampBadgePos, DEFAULT_BADGE_POS, type BadgePos } from '../youtube/badge';
import { INJECTED_JS, isAllowedInWebView, parseBridgeMessage } from '../youtube/bridge';
import { YOUTUBE_START_URL, type YoutubeScreenProps } from '../youtube/screenProps';
import { youtubeVideoFromUrl } from '../youtube/videoId';
import { ResultScreen } from './ResultScreen';

// 계약 값 추가 금지 — 진입 경로는 기존 'paste'로 보낸다 (계약 v1.3 DetectSource)
const detectPaste = (url: string, signal: AbortSignal) => detect(url, 'paste', signal);

// 유튜브가 WebView를 낯선 브라우저로 보고 재생을 막는 것을 줄이기 위한 UA 조정 (시연용).
// iOS: 기본 UA 끝에 Safari 표식을 붙인다. Android: 'wv' 표식 없는 크롬 모바일 UA로 바꾼다.
const IOS_UA_SUFFIX = 'Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

export function YoutubeScreen({ onExit, onSubmitVideo }: YoutubeScreenProps) {
  useKeepAwake();
  const web = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { state, setVideo, retry } = useAutoCheck(detectPaste);

  const onUrl = useCallback((url: string) => setVideo(youtubeVideoFromUrl(url)), [setVideo]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const url = parseBridgeMessage(e.nativeEvent.data);
      if (url) onUrl(url);
    },
    [onUrl],
  );

  const onNav = useCallback(
    (nav: WebViewNavigation) => {
      setCanGoBack(nav.canGoBack);
      if (nav.url) onUrl(nav.url); // 보조 경로 (SPA 이동은 주입 스크립트가 잡는다)
    },
    [onUrl],
  );

  const goBack = useCallback(() => {
    if (canGoBack) web.current?.goBack();
    else onExit();
  }, [canGoBack, onExit]);

  const goShorts = useCallback(() => {
    setLoadFailed(false);
    web.current?.injectJavaScript(`window.location.href = ${JSON.stringify(YOUTUBE_START_URL)}; true;`);
  }, []);

  const reload = useCallback(() => {
    setLoadFailed(false);
    web.current?.reload();
  }, []);

  // Android 뒤로가기: 시트 닫기 → 유튜브 안에서 뒤로 → 앱 홈 (App은 이 화면에서 뒤로가기를 넘겨준다)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetOpen) setSheetOpen(false);
      else goBack();
      return true;
    });
    return () => sub.remove();
  }, [sheetOpen, goBack]);

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <BarButton icon="chevron-left" label={copy.youtube.backButton} a11yLabel={copy.youtube.backA11yLabel} onPress={goBack} />
        <BarButton icon="play-box-multiple-outline" label={copy.youtube.shortsButton} onPress={goShorts} />
        <View style={{ flex: 1 }} />
        <BarButton icon="close" label={copy.youtube.exitButton} a11yLabel={copy.youtube.exitA11yLabel} onPress={onExit} />
      </View>

      <View style={styles.webArea}>
        <WebView
          ref={web}
          testID="youtube-webview"
          source={{ uri: YOUTUBE_START_URL }}
          style={styles.webview}
          injectedJavaScript={INJECTED_JS}
          onMessage={onMessage}
          onNavigationStateChange={onNav}
          onShouldStartLoadWithRequest={(req) => isAllowedInWebView(req.url)}
          onError={() => setLoadFailed(true)}
          onLoadStart={() => setLoadFailed(false)}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          allowsBackForwardNavigationGestures
          setSupportMultipleWindows={false}
          applicationNameForUserAgent={Platform.OS === 'ios' ? IOS_UA_SUFFIX : undefined}
          userAgent={Platform.OS === 'android' ? ANDROID_UA : undefined}
        />
        {loadFailed && (
          <View style={styles.loadError}>
            <T style={[font.body, { color: color.textPrimary, textAlign: 'center' }]}>{copy.youtube.loadError}</T>
            <View style={{ marginTop: 16, alignSelf: 'stretch' }}>
              <Button label={copy.youtube.reloadButton} onPress={reload} />
            </View>
          </View>
        )}
        <Badge state={state} onPress={() => setSheetOpen(true)} />
      </View>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.backdrop} accessibilityLabel={copy.youtube.sheetClose} onPress={() => setSheetOpen(false)} />
          <View style={[styles.sheet, state.status === 'done' && { height: '88%' }]} accessibilityViewIsModal accessibilityLabel={copy.youtube.sheetA11yLabel}>
            <View style={styles.grabber} />
            <SheetBody
              state={state}
              onClose={() => setSheetOpen(false)}
              onRetry={retry}
              onSubmitVideo={(v) => {
                setSheetOpen(false);
                onSubmitVideo(v);
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function BarButton({
  icon,
  label,
  a11yLabel,
  onPress,
}: {
  icon: 'chevron-left' | 'play-box-multiple-outline' | 'close';
  label: string;
  a11yLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.barButton, pressed && { backgroundColor: color.surface }]}
    >
      <MaterialCommunityIcons name={icon} size={24} color={color.textPrimary} />
      <T style={[styles.barLabel]}>{label}</T>
    </Pressable>
  );
}

/** WebView 위에 떠 있는 배지. 탭 → 바텀시트, 끌기 → 자리 옮기기 */
function Badge({ state, onPress }: { state: CheckState; onPress: () => void }) {
  const view = badgeFor(state);
  const [pos, setPos] = useState<BadgePos>(DEFAULT_BADGE_POS);
  const posRef = useRef(pos);
  posRef.current = pos;
  const start = useRef(pos);
  const area = useRef({ width: 0, height: 0 });
  const badgeSize = useRef({ width: 0, height: 0 });

  const pan = useMemo(
    () =>
      PanResponder.create({
        // 탭은 Pressable이 받고, 6pt 넘게 움직이면 끌기로 가져온다
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          start.current = posRef.current;
        },
        onPanResponderMove: (_, g) => {
          setPos(
            clampBadgePos(
              { right: start.current.right - g.dx, top: start.current.top + g.dy },
              area.current,
              badgeSize.current,
            ),
          );
        },
      }),
    [],
  );

  if (view.kind === 'hidden') return null;
  const vc = view.kind === 'result' ? verdictColor[view.verdict] : null;
  return (
    <View
      style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' }]}
      onLayout={(e: LayoutChangeEvent) => {
        area.current = e.nativeEvent.layout;
      }}
    >
      <View
        {...pan.panHandlers}
        style={[styles.badgeWrap, { top: pos.top, right: pos.right }]}
        onLayout={(e: LayoutChangeEvent) => {
          badgeSize.current = e.nativeEvent.layout;
        }}
      >
        <Pressable
          testID="youtube-badge"
          accessibilityRole="button"
          accessibilityLabel={view.a11yLabel}
          accessibilityHint={copy.youtube.badgeA11yHint}
          accessibilityLiveRegion="polite"
          onPress={onPress}
          style={({ pressed }) => [styles.badge, vc && { borderColor: vc.main }, pressed && { opacity: 0.85 }]}
        >
          {view.kind === 'checking' && <ActivityIndicator size="small" color={color.primary} />}
          {view.kind === 'error' && <MaterialCommunityIcons name="refresh" size={22} color={color.neutral} />}
          {view.kind === 'result' && vc && (
            <View style={[styles.dot, { backgroundColor: vc.main }]}>
              <MaterialCommunityIcons
                name={view.verdict === 'uncertain' ? 'help' : verdictIcon[view.verdict]}
                size={16}
                color={view.verdict === 'uncertain' ? vc.text : '#FFFFFF'}
              />
            </View>
          )}
          <T style={[styles.badgeText, vc && { color: vc.text }]} numberOfLines={1}>
            {view.label}
          </T>
        </Pressable>
      </View>
    </View>
  );
}

function SheetBody({
  state,
  onClose,
  onRetry,
  onSubmitVideo,
}: {
  state: CheckState;
  onClose: () => void;
  onRetry: () => void;
  onSubmitVideo: Parameters<typeof ResultScreen>[0]['onSubmitVideo'];
}) {
  if (state.status === 'done') {
    return (
      <ResultScreen
        data={state.data}
        url={state.video.url}
        onRetry={onRetry}
        onAgain={onClose}
        againLabel={copy.youtube.sheetClose}
        onSubmitVideo={onSubmitVideo}
      />
    );
  }
  if (state.status === 'error') {
    const c = errorCopyFor(state.code);
    return (
      <View style={styles.sheetPad} accessible={false}>
        <T style={[font.headline, styles.center]}>{c.title}</T>
        <T style={[font.body, styles.center, { marginTop: 8 }]}>{c.body}</T>
        <View style={{ marginTop: space.section }}>
          <Button label={copy.youtube.retryButton} onPress={onRetry} />
        </View>
        <View style={{ marginTop: space.buttonGap }}>
          <Button variant="secondary" label={copy.youtube.sheetClose} onPress={onClose} />
        </View>
      </View>
    );
  }
  // 확인 중 (또는 영상 화면이 아님)
  return (
    <View style={styles.sheetPad}>
      <ActivityIndicator size="large" color={color.primary} />
      <T style={[font.display, styles.center, { marginTop: 16 }]}>{copy.loading.title}</T>
      <T style={[font.body, styles.center, { marginTop: 8 }]}>{copy.loading.subtitle}</T>
      <View style={{ marginTop: space.section }}>
        <Button variant="secondary" label={copy.youtube.sheetClose} onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.background,
    paddingHorizontal: 4,
    minHeight: size.touchMin + 4,
  },
  barButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.touchMin,
    paddingHorizontal: 10,
    borderRadius: radius.button,
    gap: 2,
  },
  barLabel: { fontSize: 16, fontWeight: '600', color: color.textPrimary },
  webArea: { flex: 1 },
  webview: { flex: 1, backgroundColor: '#000000' },
  loadError: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: color.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.screenX,
  },
  badgeWrap: { position: 'absolute' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: size.touchMin,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 2,
    borderColor: color.border,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 18, fontWeight: '700', color: color.textPrimary },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: color.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: 8,
    overflow: 'hidden',
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: color.border, marginBottom: 4 },
  sheetPad: { paddingHorizontal: space.screenX, paddingVertical: 24, alignItems: 'stretch' },
  center: { color: color.textPrimary, textAlign: 'center' },
});
