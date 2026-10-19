// 내 계정 (계약 v2.0 GET /v1/me, POST /v1/auth/logout) — GitHub #20
// 로그인한 이메일, 로그인된 기기 목록(여러 기기 연동), 로그아웃.
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { getMe, type AuthFailCode } from '../api/client';
import type { MeResponse } from '../api/contract';
import { Button, Divider, InlineError, LoadingBlock, Rule, T, TextButton, TopBar } from '../components/ui';
import { copy, fill } from '../ux/copy';
import { border, color, font, radius, space } from '../ux/theme';
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
      <T style={[font.headline, styles.ink, { marginTop: space.section }]} accessibilityRole="header">
        {a.title}
      </T>
      <Rule style={{ marginTop: space[2] }} />

      {loading && !me && <LoadingBlock text={a.loading} />}

      {error && !me && (
        <View style={{ marginTop: space[5] }}>
          <T style={[font.bodyStrong, styles.ink]}>{a.loadFailed}</T>
          <InlineError text={authErrorText(error)} />
          <View style={{ marginTop: space[4] }}>
            <Button variant="secondary" label={a.retryButton} onPress={load} />
          </View>
        </View>
      )}

      {me && (
        <>
          <View style={[styles.card, { marginTop: space[5] }]}>
            <T style={[font.caption, styles.ink3]}>{a.emailLabel}</T>
            <T style={[font.bodyStrong, styles.ink]} selectable>
              {me.user.email}
            </T>
          </View>

          <T style={[font.title, styles.ink, { marginTop: space.section }]} accessibilityRole="header">
            {a.devicesTitle}
          </T>
          <T style={[font.caption, styles.ink2, { marginTop: space[1], marginBottom: space[3] }]}>{a.devicesHint}</T>
          {devices.map((d, i) => (
            <View key={d.id} testID={`device-${d.id}`}>
              {i > 0 && <Divider />}
              <View style={styles.deviceRow} accessible>
                <View style={styles.deviceHead}>
                  <T style={[font.bodyStrong, styles.ink, { flexShrink: 1 }]}>{d.device_name}</T>
                  {d.current && (
                    <View style={styles.currentChip}>
                      <T style={[font.caption, styles.ink]}>{a.currentDevice}</T>
                    </View>
                  )}
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
          disabled={leaving}
          onPress={async () => {
            setLeaving(true);
            await onLogout();
          }}
        />
        <T style={[font.caption, styles.ink3, { textAlign: 'center', marginTop: 6 }]}>{a.logoutHint}</T>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: space.screenX, paddingBottom: space[8], backgroundColor: color.paper },
  ink: { color: color.ink },
  ink2: { color: color.inkSecondary },
  ink3: { color: color.inkTertiary },
  card: {
    backgroundColor: color.surface,
    borderWidth: border.ink,
    borderColor: color.lineStrong,
    borderRadius: radius.sm,
    padding: space[4],
  },
  deviceRow: { paddingVertical: space[3] },
  deviceHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  currentChip: {
    borderWidth: border.strong,
    borderColor: color.ink,
    borderRadius: radius.sm,
    paddingHorizontal: space[2],
  },
});
