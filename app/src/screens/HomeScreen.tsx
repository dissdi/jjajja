// S1 홈 (UX 명세 §2.1) + [추가] 영상 파일로 확인하기 보조 버튼
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { PickedVideo } from '../api/client';
import { Button, T } from '../components/ui';
import { copy } from '../ux/copy';
import { extractUrl } from '../ux/present';
import { border, color, font, MAX_FONT_SCALE, radius, size, space } from '../ux/theme';

type InlineError = keyof typeof copy.home.inlineError;

interface Props {
  initialText: string;
  showFirstRunHint: boolean;
  onSubmitUrl: (url: string) => void;
  onSubmitVideo: (video: PickedVideo) => void;
}

export function HomeScreen({ initialText, showFirstRunHint, onSubmitUrl, onSubmitVideo }: Props) {
  const [text, setText] = useState(initialText);
  const [inlineError, setInlineError] = useState<InlineError | null>(null);

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
    let res: ImagePicker.ImagePickerResult;
    try {
      res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
      });
    } catch {
      setInlineError('pickerFailed');
      return;
    }
    if (res.canceled || !res.assets?.[0]) return; // 사용자가 닫음 → 아무 일 없음
    const a = res.assets[0];
    onSubmitVideo({
      uri: a.uri,
      name: a.fileName ?? 'video.mp4',
      mimeType: a.mimeType ?? 'video/mp4',
      file: a.file,
      sizeBytes: typeof a.fileSize === 'number' ? a.fileSize : undefined,
      durationMs: typeof a.duration === 'number' ? a.duration : undefined,
    });
  };

  const hasText = text.trim().length > 0;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <T style={[font.title, styles.primaryText]} accessibilityRole="header">
        {copy.app.name}
      </T>

      <View style={styles.section}>
        <T style={[font.display, styles.primaryText]}>{copy.home.title}</T>
        <T style={[font.body, styles.primaryText, { marginTop: 8 }]}>{copy.home.subtitle}</T>
      </View>

      <View style={styles.section}>
        <View style={[styles.inputWrap, inlineError && { borderColor: color.danger }]}>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (inlineError) setInlineError(null);
            }}
            placeholder={copy.home.inputPlaceholder}
            placeholderTextColor={color.textSecondary}
            accessibilityLabel={copy.home.inputA11yLabel}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => hasText && submit(text)}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
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
              <MaterialCommunityIcons name="close-circle" size={28} color={color.textSecondary} />
            </Pressable>
          )}
        </View>

        {inlineError && (
          <View style={styles.inlineError} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <MaterialCommunityIcons name="alert" size={22} color={color.danger} style={{ marginTop: 3 }} />
            <T style={[font.body, { color: color.danger, flex: 1 }]}>{copy.home.inlineError[inlineError]}</T>
          </View>
        )}

        <View style={{ marginTop: 16 }}>
          {hasText ? (
            <Button label={copy.home.checkButton} onPress={() => submit(text)} />
          ) : (
            <Button label={copy.home.pasteButton} onPress={onPaste} />
          )}
        </View>

        {showFirstRunHint && (
          <View style={styles.hint}>
            <MaterialCommunityIcons name="information" size={20} color={color.textSecondary} style={{ marginTop: 2 }} />
            <T style={[font.caption, { color: color.textSecondary, flex: 1 }]}>{copy.home.firstRunHint}</T>
          </View>
        )}
      </View>

      <View style={[styles.section, styles.divider]}>
        <Button variant="secondary" label={copy.home.uploadButton} onPress={onPickVideo} />
        <T style={[font.caption, { color: color.textSecondary, textAlign: 'center', marginTop: 8 }]}>
          {copy.home.uploadHint}
        </T>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.screenX, paddingVertical: 20, backgroundColor: color.background, flexGrow: 1 },
  primaryText: { color: color.textPrimary },
  section: { marginTop: space.section },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.inputMinHeight,
    backgroundColor: color.surface,
    borderWidth: border.outline,
    borderColor: color.border,
    borderRadius: radius.button,
    paddingLeft: 16,
  },
  input: { flex: 1, color: color.textPrimary, paddingVertical: 12 },
  clear: { width: size.touchMin, height: size.touchMin, alignItems: 'center', justifyContent: 'center' },
  inlineError: { flexDirection: 'row', gap: 6, marginTop: 8 },
  hint: { flexDirection: 'row', gap: 6, marginTop: 16 },
  divider: { borderTopWidth: 1, borderTopColor: color.surface, paddingTop: space.section },
});
