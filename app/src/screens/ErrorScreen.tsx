// S4 에러 (UX 명세 §2.4, 디자인 시스템 v2 §6.4). 서버 message_ko는 표시하지 않고 code로 copy.ts 문구를 찾는다.
// 에러는 판정이 아니므로 판정 윗선 없이 unknown 도장(원+가로줄)과 명조 600 제목. 빨강 금지 — 모든 code에 같은 회색 도장.
// 주 버튼 하나(error.*.button) + [처음으로]는 텍스트 버튼.
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, NoticeHead, TopBar } from '../components/ui';
import { copy, errorButtonAction, errorCopyFor } from '../ux/copy';
import { color, space } from '../ux/theme';

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
      <View style={{ marginTop: space[9] }}>
        <NoticeHead title={c.title} body={c.body} />
      </View>
      <View style={{ marginTop: space.section }}>
        <Button label={c.button} onPress={action === 'home' ? onHome : onRetry} />
        {action !== 'home' && (
          <View style={{ marginTop: space[5] }}>
            <Button variant="text" label={copy.error.homeButton} onPress={onHome} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: space.screenX, paddingBottom: space[8], backgroundColor: color.paper },
});
