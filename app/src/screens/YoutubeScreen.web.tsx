// 앱 안 유튜브(시연) — 웹(expo web)용 대체 화면. react-native-webview는 웹에서 동작하지 않으므로
// 불러오지도 않는다(Metro가 웹 번들에선 이 파일을 고른다).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Rule, T, TopBar } from '../components/ui';
import { copy } from '../ux/copy';
import { color, font, space } from '../ux/theme';
import type { YoutubeScreenProps } from '../youtube/screenProps';

export function YoutubeScreen({ onExit }: YoutubeScreenProps) {
  const c = copy.youtube.webOnly;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TopBar />
      <View style={{ marginTop: space[9] }} accessible accessibilityLabel={`${c.title}. ${c.body}`}>
        <MaterialCommunityIcons name="cellphone" size={48} color={color.inkSecondary} />
        <T style={[font.headline, { color: color.ink, marginTop: space[4] }]}>{c.title}</T>
        <Rule style={{ marginTop: space[2] }} />
        <T style={[font.body, { color: color.inkSecondary, marginTop: space[3] }]}>{c.body}</T>
      </View>
      <View style={{ marginTop: space.section }}>
        <Button label={c.button} onPress={onExit} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: space.screenX, paddingBottom: space[6], backgroundColor: color.paper },
});
