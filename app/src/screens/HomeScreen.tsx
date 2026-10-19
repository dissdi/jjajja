// S1 홈 (UX 명세 §2.1, 디자인 시스템 §6.1) + 영상 파일로 확인하기 + 앱 안 유튜브(시연) + 내 기록·내 계정(#20)
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { PickedVideo } from '../api/client';
import { Button, Divider, InlineError, Input, Rule, T, TextButton, TopBar } from '../components/ui';
import { pickVideo } from '../media/pickVideo';
import { copy } from '../ux/copy';
import { extractUrl } from '../ux/present';
import { border, color, font, radius, size, space, verdict } from '../ux/theme';

type InlineErrorKey = keyof typeof copy.home.inlineError;

interface Props {
  initialText: string;
  showFirstRunHint: boolean;
  onSubmitUrl: (url: string) => void;
  onSubmitVideo: (video: PickedVideo) => void;
  /** [추가·시연] 앱 안 유튜브 화면 열기. 없으면 버튼을 숨긴다 */
  onOpenYoutube?: () => void;
  /** [추가·#20] 내 기록 / 내 계정. 없으면 숨긴다 */
  onOpenHistory?: () => void;
  onOpenAccount?: () => void;
}

export function HomeScreen({
  initialText,
  showFirstRunHint,
  onSubmitUrl,
  onSubmitVideo,
  onOpenYoutube,
  onOpenHistory,
  onOpenAccount,
}: Props) {
  const [text, setText] = useState(initialText);
  const [focused, setFocused] = useState(false);
  const [inlineError, setInlineError] = useState<InlineErrorKey | null>(null);

  const submit = (raw: string) => {
    const url = extractUrl(raw);
    if (!url) {
      setInlineError('notUrl');
      return;
    }
    setText(url);
    onSubmitUrl(url);
  };

  const onPaste = async () => {
    let clip: string;
    try {
      clip = await Clipboard.getStringAsync();
    } catch {
      setInlineError('pasteDenied');
      return;
    }
    if (!clip || clip.trim() === '') {
      setInlineError('clipboardEmpty');
      return;
    }
    const url = extractUrl(clip);
    if (!url) {
      setText(clip.trim());
      setInlineError('notUrl');
      return;
    }
    setInlineError(null);
    setText(url);
    onSubmitUrl(url); // 붙여넣기 즉시 확인 시작 (§2.1.1)
  };

  const onPickVideo = async () => {
    setInlineError(null);
    const out = await pickVideo();
    if (out.kind === 'failed') setInlineError('pickerFailed');
    else if (out.kind === 'picked') onSubmitVideo(out.video);
  };

  const hasText = text.trim().length > 0;
  const borderColor = inlineError ? verdict.likely_ai.main : focused ? color.ink : color.lineStrong;
  const borderWidth = inlineError || focused ? border.strong : border.ink;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TopBar
        right={
          <>
            {onOpenHistory && <TextButton label={copy.home.historyLink} onPress={onOpenHistory} />}
            {onOpenAccount && <TextButton label={copy.home.accountLink} onPress={onOpenAccount} />}
          </>
        }
      />

      <View style={{ marginTop: space.section }}>
        <T style={[font.display, styles.ink]} accessibilityRole="header">
          {copy.home.title}
        </T>
        <Rule style={{ marginTop: space[3] }} />
        <T style={[font.body, styles.ink2, { marginTop: space[3] }]}>{copy.home.subtitle}</T>
      </View>

      <View style={{ marginTop: space[6] }}>
        <View style={[styles.inputWrap, { borderColor, borderWidth }]}>
          <Input
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (inlineError) setInlineError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={copy.home.inputPlaceholder}
            accessibilityLabel={copy.home.inputA11yLabel}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => hasText && submit(text)}
            style={[font.body, styles.input]}
          />
          {hasText && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.home.clearA11yLabel}
              onPress={() => {
                setText('');
                setInlineError(null);
              }}
              style={styles.clear}
              hitSlop={4}
            >
              <MaterialCommunityIcons name="close" size={24} color={color.inkSecondary} />
            </Pressable>
          )}
        </View>

        {inlineError && <InlineError text={copy.home.inlineError[inlineError]} />}

        <View style={{ marginTop: space[3] }}>
          {hasText ? (
            <Button label={copy.home.checkButton} onPress={() => submit(text)} />
          ) : (
            <Button label={copy.home.pasteButton} onPress={onPaste} />
          )}
        </View>

        {showFirstRunHint && <T style={[font.caption, styles.caption]}>{copy.home.firstRunHint}</T>}
      </View>

      <Divider style={{ marginTop: space.section }} />

      <View style={{ marginTop: space.section }}>
        <Button variant="secondary" label={copy.home.uploadButton} onPress={onPickVideo} />
        <T style={[font.caption, styles.caption]}>{copy.home.uploadHint}</T>
      </View>

      {onOpenYoutube && (
        <View style={{ marginTop: space[3] }}>
          <TextButton label={copy.home.youtubeButton} onPress={onOpenYoutube} icon="chevron-right" accessibilityHint={copy.home.youtubeHint} />
          <T style={[font.caption, { color: color.inkTertiary }]}>{copy.home.youtubeHint}</T>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.screenX, paddingBottom: space[8], backgroundColor: color.paper, flexGrow: 1 },
  ink: { color: color.ink },
  ink2: { color: color.inkSecondary },
  caption: { color: color.inkTertiary, textAlign: 'center', marginTop: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.inputMinHeight,
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    paddingLeft: space[4],
  },
  input: { flex: 1, minWidth: 0, color: color.ink, paddingVertical: space[3] },
  clear: { width: size.touchMin, height: size.touchMin, alignItems: 'center', justifyContent: 'center' },
});
