// S2 확인 중 (UX 명세 §2.2)
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button, T } from '../components/ui';
import { copy } from '../ux/copy';
import { color, font, space } from '../ux/theme';

const SLOW_AFTER_MS = 20_000;

interface Props {
  isUpload: boolean;
  onCancel: () => void;
}

export function LoadingScreen({ isUpload, onCancel }: Props) {
  useKeepAwake();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  const subtitle = slow ? copy.loading.slow : isUpload ? copy.loading.uploadSubtitle : copy.loading.subtitle;

  return (
    <View style={styles.container}>
      <View style={styles.center} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${copy.loading.title} ${subtitle}`}>
        <ActivityIndicator size="large" color={color.primary} />
        <T style={[font.display, styles.text, { marginTop: 24 }]}>{copy.loading.title}</T>
        <T style={[font.body, styles.text, { marginTop: 8 }]}>{subtitle}</T>
      </View>
      <Button variant="secondary" label={copy.loading.cancelButton} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: space.screenX, paddingVertical: 24, backgroundColor: color.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: color.textPrimary, textAlign: 'center' },
});
