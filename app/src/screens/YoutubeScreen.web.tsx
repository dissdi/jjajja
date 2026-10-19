// 앱 안 유튜브(시연) — 웹(expo web)용 대체 화면. react-native-webview는 웹에서 동작하지 않으므로
// 불러오지도 않는다(Metro가 웹 번들에선 이 파일을 고른다).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, NoticeHead, TopBar } from '../components/ui';
import { copy } from '../ux/copy';
import { color, size, space } from '../ux/theme';
import type { YoutubeScreenProps } from '../youtube/screenProps';

export function YoutubeScreen({ onExit }: YoutubeScreenProps) {
  const c = copy.youtube.webOnly;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TopBar />
      <View style={{ marginTop: space[9] }}>
        <MaterialCommunityIcons name="cellphone" size={size.verdictMark} color={color.inkSecondary} accessibilityElementsHidden />
        <View style={{ marginTop: space[5] }}>
          <NoticeHead title={c.title} body={c.body} mark={false} />
        </View>
      </View>
      <View style={{ marginTop: space.section }}>
        <Button label={c.button} onPress={onExit} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: space.screenX, paddingBottom: space[8], backgroundColor: color.paper },
});
