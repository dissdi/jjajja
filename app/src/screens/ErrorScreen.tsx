// S4 에러 (UX 명세 §2.4). 서버 message_ko는 표시하지 않고 code로 copy.ts 문구를 찾는다.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Button, T } from '../components/ui';
import { copy, errorButtonAction, errorCopyFor } from '../ux/copy';
import { color, font, space } from '../ux/theme';

interface Props {
  code: string;
  onRetry: () => void;
  onHome: () => void;
}

export function ErrorScreen({ code, onRetry, onHome }: Props) {
  const c = errorCopyFor(code);
  const action = errorButtonAction(c.button);
  return (
    <View style={styles.container}>
      <View style={styles.center} accessible accessibilityLabel={`${c.title}. ${c.body}`}>
        <MaterialCommunityIcons name="alert-circle-outline" size={64} color={color.neutral} />
        <T style={[font.headline, styles.text, { marginTop: 20 }]}>{c.title}</T>
        <T style={[font.body, styles.text, { marginTop: 8 }]}>{c.body}</T>
      </View>
      <Button label={c.button} onPress={action === 'home' ? onHome : onRetry} />
      {action !== 'home' && (
        <View style={{ marginTop: space.buttonGap }}>
          <Button variant="secondary" label={copy.error.homeButton} onPress={onHome} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: space.screenX, paddingVertical: 24, backgroundColor: color.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: color.textPrimary, textAlign: 'center' },
});
