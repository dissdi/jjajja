// S1 홈 (UX 명세 §2.1, 디자인 시스템 v2 §6.1) + 영상 파일로 확인하기 + 앱 안 유튜브(시연) + 내 기록·내 계정(#20)
// v2: 폭 넓은 주 버튼은 하나(입력이 비면 [붙여넣기], 차면 [확인하기]). 나머지 하나는 바로 아래 텍스트 버튼.
// 영상 파일은 선 버튼(글자 폭), 유튜브 시연은 텍스트 버튼. 섹션 구분선 대신 여백 40.
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { PickedVideo } from '../api/client';
import { Button, IconButton, ScreenTitle, T, TextButton, TextField, TopBar } from '../components/ui';
import { pickVideo } from '../media/pickVideo';
import { copy } from '../ux/copy';
import { extractUrl } from '../ux/present';
import { color, font, space } from '../ux/theme';

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
        <ScreenTitle title={copy.home.title} subtitle={copy.home.subtitle} />
      </View>

      <View style={{ marginTop: space[7] }}>
        <TextField
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (inlineError) setInlineError(null);
          }}
          error={inlineError ? copy.home.inlineError[inlineError] : null}
          placeholder={copy.home.inputPlaceholder}
          accessibilityLabel={copy.home.inputA11yLabel}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={() => hasText && submit(text)}
          right={
            hasText ? (
              <IconButton
                icon="close"
                accessibilityLabel={copy.home.clearA11yLabel}
                onPress={() => {
                  setText('');
                  setInlineError(null);
                }}
              />
            ) : undefined
          }
        />

        <View style={{ marginTop: space[3] }}>
          {hasText ? (
            <>
              <Button label={copy.home.checkButton} onPress={() => submit(text)} />
              <View style={{ marginTop: space.buttonGap }}>
                <TextButton label={copy.home.pasteButton} onPress={onPaste} />
              </View>
            </>
          ) : (
            <Button label={copy.home.pasteButton} onPress={onPaste} />
          )}
        </View>

        {showFirstRunHint && <T style={[font.caption, styles.caption]}>{copy.home.firstRunHint}</T>}
      </View>

      <View style={{ marginTop: space.section }}>
        <Button variant="secondary" label={copy.home.uploadButton} onPress={onPickVideo} />
        <T style={[font.caption, styles.caption]}>{copy.home.uploadHint}</T>
      </View>

      {onOpenYoutube && (
        <View style={{ marginTop: space[5] }}>
          <TextButton label={copy.home.youtubeButton} onPress={onOpenYoutube} accessibilityHint={copy.home.youtubeHint} />
          <T style={[font.caption, styles.caption, { marginTop: 0 }]}>{copy.home.youtubeHint}</T>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.screenX, paddingBottom: space[8], backgroundColor: color.paper, flexGrow: 1 },
  caption: { color: color.inkTertiary, textAlign: 'center', marginTop: space[2] },
});
