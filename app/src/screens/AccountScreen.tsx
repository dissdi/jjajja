// 내 계정 (계약 v2.0 GET /v1/me, POST /v1/auth/logout) — GitHub #20
// 로그인한 이메일, 로그인된 기기 목록(여러 기기 연동), 로그아웃.
// 디자인 시스템 v2 §6.7: 카드 테두리 없이 라벨+값 행, 기기 목록은 행(위아래 16) + 1px line, '이 기기'는 caption 글자만.
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { getMe, type AuthFailCode } from '../api/client';
import type { MeResponse } from '../api/contract';
import { Button, Divider, InlineError, LoadingBlock, ScreenTitle, T, TextButton, TopBar } from '../components/ui';
import { copy, fill } from '../ux/copy';
import { color, font, space } from '../ux/theme';
import { formatWhen } from '../ux/when';
import { authErrorText } from './AuthScreens';

interface Props {
  onBack: () => void;
  onLogout: () => void | Promise<void>;
}

export function AccountScreen({ onBack, onLogout }: Props) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<AuthFailCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const out = await getMe();
    setLoading(false);
    if (out.ok) setMe(out.data);
    else setError(out.code);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const a = copy.account;
  // 이 기기를 맨 위로, 나머지는 최근 사용 순 (서버 순서 유지)
  const devices = me ? [...me.devices].sort((x, y) => Number(y.current) - Number(x.current)) : [];

  return (
    <ScrollView contentContainerStyle={styles.container} testID="account-screen">
      <TopBar right={<TextButton label={a.backButton} onPress={onBack} />} />
      <View style={{ marginTop: space.section }}>
        <ScreenTitle title={a.title} rule={false} />
      </View>

      {loading && !me && <LoadingBlock text={a.loading} />}

      {error && !me && (
        <View style={{ marginTop: space[7] }}>
          <T style={[font.bodyStrong, styles.ink]}>{a.loadFailed}</T>
          <InlineError text={authErrorText(error)} />
          <View style={{ marginTop: space[4] }}>
            <Button variant="secondary" label={a.retryButton} onPress={load} align="left" />
          </View>
        </View>
      )}

      {me && (
        <>
          <View style={{ marginTop: space[7] }}>
            <T style={[font.caption, styles.ink2]}>{a.emailLabel}</T>
            <T style={[font.body, styles.ink]} selectable>
              {me.user.email}
            </T>
          </View>

          <T style={[font.title, styles.ink, { marginTop: space.section }]} accessibilityRole="header">
            {a.devicesTitle}
          </T>
          <T style={[font.caption, styles.ink2, { marginTop: space[1], marginBottom: space[2] }]}>{a.devicesHint}</T>
          {devices.map((d, i) => (
            <View key={d.id} testID={`device-${d.id}`}>
              {i > 0 && <Divider />}
              <View style={styles.deviceRow} accessible>
                <View style={styles.deviceHead}>
                  <T style={[font.subhead, styles.ink, { flexShrink: 1 }]}>{d.device_name}</T>
                  {d.current && <T style={[font.caption, styles.ink2]}>{a.currentDevice}</T>}
                </View>
                <T style={[font.caption, styles.ink3]}>{fill(a.lastUsed, { when: formatWhen(d.last_used_at) })}</T>
              </View>
            </View>
          ))}
        </>
      )}

      <View style={{ marginTop: space.section }}>
        <Button
          variant="secondary"
          label={a.logoutButton}
          icon="logout"
          align="left"
          disabled={leaving}
          onPress={async () => {
            setLeaving(true);
            await onLogout();
          }}
        />
        <T style={[font.caption, styles.ink3, { marginTop: space[2] }]}>{a.logoutHint}</T>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: space.screenX, paddingBottom: space[8], backgroundColor: color.paper },
  ink: { color: color.ink },
  ink2: { color: color.inkSecondary },
  ink3: { color: color.inkTertiary },
  deviceRow: { paddingVertical: space[4] },
  deviceHead: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space[2] },
});
