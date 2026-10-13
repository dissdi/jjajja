// 앱 안 유튜브(시연) — 웹(expo web)용 대체 화면. react-native-webview는 웹에서 동작하지 않으므로
// 불러오지도 않는다(Metro가 웹 번들에선 이 파일을 고른다).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Button, T } from '../components/ui';
import { copy } from '../ux/copy';
import { color, font, space } from '../ux/theme';
import type { YoutubeScreenProps } from '../youtube/screenProps';

export function YoutubeScreen({ onExit }: YoutubeScreenProps) {
  const c = copy.youtube.webOnly;
  return (
    <View style={styles.container}>
      <View style={styles.center} accessible accessibilityLabel={`${c.title}. ${c.body}`}>
        <MaterialCommunityIcons name="cellphone" size={64} color={color.neutral} />
        <T style={[font.headline, styles.text, { marginTop: 20 }]}>{c.title}</T>
        <T style={[font.body, styles.text, { marginTop: 8 }]}>{c.body}</T>
      </View>
      <Button label={c.button} onPress={onExit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: space.screenX, paddingVertical: 24, backgroundColor: color.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: color.textPrimary, textAlign: 'center' },
});
