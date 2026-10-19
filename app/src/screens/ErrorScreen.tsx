// S4 에러 (UX 명세 §2.4, 디자인 시스템 §6.4). 서버 message_ko는 표시하지 않고 code로 copy.ts 문구를 찾는다.
// 에러는 판정이 아니므로 판정 블록 면·띠 없이 unknown 마크(원+가로줄)만. 빨강 금지 — 모든 code에 같은 회색 마크.
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Rule, T, TopBar, VerdictMark } from '../components/ui';
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
    <ScrollView contentContainerStyle={styles.container}>
      <TopBar />
      <View style={styles.body} accessible accessibilityLabel={`${c.title}. ${c.body}`}>
        <VerdictMark verdict="unknown" />
        <T style={[font.headline, { color: color.ink, marginTop: space[4] }]}>{c.title}</T>
        <Rule style={{ marginTop: space[2] }} />
        <T style={[font.body, { color: color.inkSecondary, marginTop: space[3] }]}>{c.body}</T>
      </View>
      <View style={{ marginTop: space.section }}>
        <Button label={c.button} onPress={action === 'home' ? onHome : onRetry} />
        {action !== 'home' && (
          <View style={{ marginTop: space.buttonGap }}>
            <Button variant="secondary" label={copy.error.homeButton} onPress={onHome} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: space.screenX, paddingBottom: space[6], backgroundColor: color.paper },
  body: { marginTop: space[9] },
});
