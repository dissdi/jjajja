// S2 확인 중 (UX 명세 §2.2, 디자인 시스템 §6.2) — 잉크 번짐 하나 + 명조 제목 + 예상 시간 + 경과 시간
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, InkBloom, T } from '../components/ui';
import { copy, fill } from '../ux/copy';
import { color, font, space } from '../ux/theme';

const SLOW_AFTER_MS = 20_000;

interface Props {
  isUpload: boolean;
  onCancel: () => void;
}

export function LoadingScreen({ isUpload, onCancel }: Props) {
  useKeepAwake();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => clearInterval(t);
  }, []);
  const slow = elapsed >= SLOW_AFTER_MS;
  const secs = Math.floor(elapsed / 1000);

  // 오래 걸려도 보조 문장만 바꾼다(경고색 금지, §6.2)
  const subtitle = slow ? copy.loading.slow : isUpload ? copy.loading.uploadSubtitle : copy.loading.subtitle;

  return (
    <View style={styles.container}>
      <View style={styles.center} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${copy.loading.title} ${subtitle}`}>
        <InkBloom />
        <T style={[font.display, styles.text, { marginTop: space[6] }]}>{copy.loading.title}</T>
        <T style={[font.body, styles.text2, { marginTop: space[2] }]}>{subtitle}</T>
        {secs > 0 && <T style={[font.caption, styles.text3, { marginTop: space[1] }]}>{fill(copy.loading.elapsed, { sec: secs })}</T>}
      </View>
      <View style={{ marginTop: space[8] }}>
        <Button variant="secondary" label={copy.loading.cancelButton} onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: space.screenX, paddingVertical: space[6], backgroundColor: color.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: color.ink, textAlign: 'center' },
  text2: { color: color.inkSecondary, textAlign: 'center' },
  text3: { color: color.inkTertiary, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
