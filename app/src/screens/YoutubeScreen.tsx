// 앱 안 유튜브(시연, 출시용 아님) — 유튜브 모바일 웹을 WebView로 전체 화면에 띄우고(안전 영역만 비움),
// 쇼츠를 넘길 때마다 자동으로 확인해 떠 있는 배지로 보여준다.
// 상단 막대는 없다: 배지를 누르면 바텀시트가 열리고, 위에는 결과(또는 지금 상태 한 줄), 아래에는
// [뒤로](유튜브 안에서 뒤로, 더 갈 곳이 없으면 앱 홈) · [쇼츠 처음으로] · [나가기](앱 홈)가 있다.
// 배지는 영상이 아닌 화면에서도 늘 보인다(뒤로·나가기로 가는 유일한 손잡이).
// 웹 번들은 YoutubeScreen.web.tsx(안내 화면)를 쓴다.
// 디자인 시스템 v2 §5.5(배지: 불투명 surface 면 + 2px ink 테두리 — 실사용자 화면에서 2px가 남는 유일한 곳, 높이 40),
// §5.6(바텀시트: paper 면 + 윗모서리 16, 윗선 없음), §6.8(시트 안 버튼 위계: 주 버튼 하나, 나머지 선·텍스트 버튼).
// 자동 확인도 로그인 토큰을 쓴다(api/client가 Bearer를 붙임). 401이면 App이 로그인 화면으로 보낸다.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, type LayoutChangeEvent, Modal, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { detect } from '../api/client';
import { Button, InkBloom, NoticeHead, T, useReduceMotion } from '../components/ui';
import { copy, errorCopyFor } from '../ux/copy';
import { border, color, font, radius, size, space, verdict as verdictTokens, verdictIcon } from '../ux/theme';
import { useAutoCheck, type CheckState } from '../youtube/autoCheck';
import { badgeFor, clampBadgePos, DEFAULT_BADGE_POS, type BadgePos } from '../youtube/badge';
import { INJECTED_JS, isAllowedInWebView, parseBridgeMessage } from '../youtube/bridge';
import { YOUTUBE_START_URL, type YoutubeScreenProps } from '../youtube/screenProps';
import { youtubeVideoFromUrl } from '../youtube/videoId';
import { ResultScreen } from './ResultScreen';

// 계약 값 추가 금지 — 진입 경로는 기존 'paste'로 보낸다 (계약 DetectSource)
const detectPaste = (url: string, signal: AbortSignal) => detect(url, 'paste', signal);

// 유튜브가 WebView를 낯선 브라우저로 보고 재생을 막는 것을 줄이기 위한 UA 조정 (시연용).
// iOS: 기본 UA 끝에 Safari 표식을 붙인다. Android: 'wv' 표식 없는 크롬 모바일 UA로 바꾼다.
const IOS_UA_SUFFIX = 'Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

export function YoutubeScreen({ onExit, onSubmitVideo }: YoutubeScreenProps) {
  useKeepAwake();
  const reduceMotion = useReduceMotion();
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

  /** 유튜브 안에서 뒤로. 더 갈 곳이 없으면 앱 홈 */
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

  const closeSheet = useCallback(() => setSheetOpen(false), []);

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
    <View style={styles.root} testID="youtube-screen">
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
            <T style={[font.body, { color: color.ink, textAlign: 'center' }]}>{copy.youtube.loadError}</T>
            <View style={{ marginTop: space[6], alignSelf: 'stretch' }}>
              <Button label={copy.youtube.reloadButton} onPress={reload} />
            </View>
          </View>
        )}
        <Badge state={state} onPress={() => setSheetOpen(true)} />
      </View>

      <Modal visible={sheetOpen} transparent animationType={reduceMotion ? 'fade' : 'slide'} onRequestClose={closeSheet}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.backdrop} accessibilityLabel={copy.youtube.sheetClose} onPress={closeSheet} />
          <Sheet expanded={state.status === 'done'}>
            <View style={styles.sheetBody}>
              <SheetBody
                state={state}
                onClose={closeSheet}
                onRetry={retry}
                onSubmitVideo={(v) => {
                  setSheetOpen(false);
                  onSubmitVideo(v);
                }}
              />
            </View>
            <SheetNav
              onBack={() => {
                setSheetOpen(false);
                goBack();
              }}
              onShorts={() => {
                setSheetOpen(false);
                goShorts();
              }}
              onExit={() => {
                setSheetOpen(false);
                onExit();
              }}
            />
          </Sheet>
        </View>
      </Modal>
    </View>
  );
}

/** 바텀시트 면 §5.6 (v2) — paper, 윗모서리 16, 윗선 없음(scrim만), 손잡이 36×4 lineUi. 그림자 없음 */
function Sheet({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="youtube-sheet"
      style={[styles.sheet, expanded && { height: '88%' }, { paddingBottom: insets.bottom }]}
      accessibilityViewIsModal
      accessibilityLabel={copy.youtube.sheetA11yLabel}
    >
      <View style={styles.grabber} />
      {children}
    </View>
  );
}

/**
 * 시트 맨 아래 화면 이동 (상단 막대 대신). 선 버튼 3개(높이 44, hitSlop 4 → 터치 52, 사이 12), 위에 1px line.
 * 결과의 주 버튼(보내기 등)과 겹치지 않게 주 버튼은 쓰지 않는다. 글자가 커지면 다음 줄로 감긴다.
 */
function SheetNav({ onBack, onShorts, onExit }: { onBack: () => void; onShorts: () => void; onExit: () => void }) {
  return (
    <View style={styles.nav} accessibilityLabel={copy.youtube.navA11yLabel} testID="youtube-sheet-nav">
      <Button
        variant="secondary"
        icon="chevron-left"
        label={copy.youtube.backButton}
        accessibilityLabel={copy.youtube.backA11yLabel}
        onPress={onBack}
        testID="youtube-nav-back"
      />
      <Button variant="secondary" label={copy.youtube.shortsButton} onPress={onShorts} testID="youtube-nav-shorts" />
      <Button
        variant="secondary"
        label={copy.youtube.exitButton}
        accessibilityLabel={copy.youtube.exitA11yLabel}
        onPress={onExit}
        testID="youtube-nav-exit"
      />
    </View>
  );
}

/** WebView 위에 떠 있는 배지 §5.5 (v2: 높이 40, 아이콘 20, 글자 16/600 ink, hitSlop 4 → 터치 48). 탭 → 바텀시트, 끌기 → 자리 옮기기 */
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
          hitSlop={size.hitSlop.secondary}
          style={({ pressed }) => [styles.badge, pressed && { backgroundColor: color.sunken }]}
        >
          {view.kind === 'idle' && <MaterialCommunityIcons testID="badge-icon-idle" name="menu" size={size.badgeIcon} color={color.ink} />}
          {view.kind === 'checking' && (
            <View style={styles.badgeIconBox}>
              <InkBloom dot={10} />
            </View>
          )}
          {view.kind === 'error' && (
            <MaterialCommunityIcons name={verdictIcon.unknown} size={size.badgeIcon} color={verdictTokens.unknown.main} />
          )}
          {view.kind === 'result' && (
            <MaterialCommunityIcons
              testID={`badge-icon-${view.verdict}`}
              name={verdictIcon[view.verdict]}
              size={size.badgeIcon}
              color={verdictTokens[view.verdict].main}
            />
          )}
          <T style={[font.badge, { color: color.ink }]} numberOfLines={1}>
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
        inSheet
      />
    );
  }
  if (state.status === 'error') {
    const c = errorCopyFor(state.code);
    // §6.4 모양: unknown 도장 + 명조 600 제목 + 괘선 + 본문 (빨강 없음). [다시 해보기] 주 버튼 + [닫고 계속 보기] 텍스트 버튼 (§6.8)
    return (
      <View style={styles.sheetPad}>
        <NoticeHead title={c.title} body={c.body} />
        <View style={{ marginTop: space.section }}>
          <Button label={copy.youtube.retryButton} onPress={onRetry} />
        </View>
        <View style={{ marginTop: space[5] }}>
          <Button variant="text" label={copy.youtube.sheetClose} onPress={onClose} />
        </View>
      </View>
    );
  }
  if (state.status === 'idle') {
    // 영상이 아닌 화면 — 상태 한 줄 + [닫고 계속 보기]. 아래 화면 이동 버튼이 이 시트의 주 용도
    return (
      <View style={styles.sheetPad}>
        <T style={[font.body, styles.center2]}>{copy.youtube.sheetIdle}</T>
        <View style={{ marginTop: space[3] }}>
          <Button variant="text" label={copy.youtube.sheetClose} onPress={onClose} />
        </View>
      </View>
    );
  }
  // 확인 중 — §6.2 축소판: 점 16 + display + 안내 + [닫고 계속 보기] (아래 화면 이동 선 버튼과 구분되게 텍스트 버튼)
  return (
    <View style={[styles.sheetPad, { alignItems: 'center' }]}>
      <InkBloom />
      <T style={[font.display, styles.center, { marginTop: space[6] }]}>{copy.loading.title}</T>
      <T style={[font.body, styles.center2, { marginTop: space[2] }]}>{copy.loading.subtitle}</T>
      <View style={{ marginTop: space[6], alignSelf: 'stretch' }}>
        <Button variant="text" label={copy.youtube.sheetClose} onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink },
  webArea: { flex: 1 },
  webview: { flex: 1, backgroundColor: color.ink },
  loadError: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.paper,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.screenX,
  },
  badgeWrap: { position: 'absolute' },
  // 불투명 크림 면 + 2px 잉크 테두리 (어두운 영상 위 18:1, 흰 화면 위 17.7:1, 회색 썸네일 3.63:1). 그림자·반투명 금지
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: size.badgeHeight,
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: border.strong,
    borderColor: color.ink,
  },
  badgeIconBox: { width: size.badgeIcon, height: size.badgeIcon, alignItems: 'center', justifyContent: 'center' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim },
  sheet: {
    maxHeight: '88%',
    backgroundColor: color.paper,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
  },
  // 결과가 길면 이 부분만 스크롤되고, 아래 화면 이동 줄은 늘 보인다
  sheetBody: { flexGrow: 1, flexShrink: 1 },
  grabber: {
    alignSelf: 'center',
    width: size.sheetHandle.width,
    height: size.sheetHandle.height,
    borderRadius: size.sheetHandle.height / 2,
    backgroundColor: color.lineUi,
    marginTop: space[2],
  },
  sheetPad: { paddingHorizontal: space.screenX, paddingTop: space[6], paddingBottom: space[5], alignItems: 'stretch' },
  nav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.buttonGap,
    paddingHorizontal: space.screenX,
    paddingVertical: space[4],
    borderTopWidth: border.hair,
    borderTopColor: color.line,
  },
  center: { color: color.ink, textAlign: 'center' },
  center2: { color: color.inkSecondary, textAlign: 'center' },
});
