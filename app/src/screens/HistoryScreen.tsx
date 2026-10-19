// 내 기록 (계약 v2.0 GET /v1/history 무한 스크롤, DELETE /v1/history/{id}) — GitHub #20
// 목록 → 항목 탭 → 결과 요약(판정 블록 + 확인한 때·기기·주소) → 다시 확인 / 지우기.
// 요약은 이 화면 안에서 연다(목록·스크롤 위치를 잃지 않게). 뒤로가기도 이 화면이 처리한다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { deleteHistory, getHistory, type AuthFailCode } from '../api/client';
import type { HistoryItem } from '../api/contract';
import { Button, Divider, InkBloom, InlineError, LoadingBlock, Rule, T, TextButton, TopBar, VerdictBlock, VerdictMark } from '../components/ui';
import { copy, fill } from '../ux/copy';
import { historySummaryFor } from '../ux/present';
import { border, color, font, radius, space } from '../ux/theme';
import { formatWhen } from '../ux/when';
import { authErrorText } from './AuthScreens';

interface Props {
  onBack: () => void;
  /** 이 영상 다시 확인하기 — App.run({ kind: 'url', url }) */
  onRecheck: (url: string) => void;
}

type ListState = {
  items: HistoryItem[];
  next: string | null;
  /** 첫 페이지를 받았는지 */
  loaded: boolean;
  loading: boolean;
  error: AuthFailCode | null;
};

export function HistoryScreen({ onBack, onRecheck }: Props) {
  const [list, setList] = useState<ListState>({ items: [], next: null, loaded: false, loading: false, error: null });
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const busy = useRef(false);

  const load = useCallback(async (reset: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setList((s) => ({ ...s, loading: true, error: null }));
    const cursor = reset ? null : list.next;
    const out = await getHistory(cursor);
    busy.current = false;
    if (!out.ok) {
      setList((s) => ({ ...s, loading: false, error: out.code }));
      return;
    }
    setList((s) => {
      const base = reset ? [] : s.items;
      const seen = new Set(base.map((i) => i.id));
      return {
        items: [...base, ...out.data.items.filter((i) => !seen.has(i.id))],
        next: out.data.next,
        loaded: true,
        loading: false,
        error: null,
      };
    });
  }, [list.next]);

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selected) setSelected(null);
      else onBack();
      return true;
    });
    return () => sub.remove();
  }, [selected, onBack]);

  if (selected) {
    return (
      <HistoryDetail
        item={selected}
        onBack={() => setSelected(null)}
        onRecheck={onRecheck}
        onDeleted={(id) => {
          setList((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }));
          setSelected(null);
        }}
      />
    );
  }

  const header = (
    <View>
      <TopBar right={<TextButton label={copy.history.backButton} onPress={onBack} />} />
      <T style={[font.headline, styles.ink, { marginTop: space.section }]} accessibilityRole="header">
        {copy.history.title}
      </T>
      <Rule style={{ marginTop: space[2] }} />
      <T style={[font.body, styles.ink2, { marginTop: space[3], marginBottom: space[5] }]}>{copy.history.subtitle}</T>
    </View>
  );

  const footer = (() => {
    if (!list.loaded && list.loading) return <LoadingBlock text={copy.history.loading} />;
    if (list.error) {
      return (
        <View style={{ marginTop: space[5] }}>
          <T style={[font.bodyStrong, styles.ink]}>{copy.history.loadFailed}</T>
          <InlineError text={authErrorText(list.error)} />
          <View style={{ marginTop: space[4] }}>
            <Button variant="secondary" label={copy.history.retryButton} onPress={() => load(!list.loaded)} />
          </View>
        </View>
      );
    }
    if (list.loaded && list.loading) {
      return (
        <View style={styles.more} accessible accessibilityLabel={copy.history.loadMore}>
          <InkBloom dot={12} />
          <T style={[font.caption, styles.ink3]}>{copy.history.loadMore}</T>
        </View>
      );
    }
    if (list.loaded && list.items.length === 0) {
      return (
        <View style={{ marginTop: space[6] }}>
          <T style={[font.title, styles.ink]}>{copy.history.emptyTitle}</T>
          <T style={[font.body, styles.ink2, { marginTop: space[2] }]}>{copy.history.emptyBody}</T>
        </View>
      );
    }
    return <View style={{ height: space[8] }} />;
  })();

  return (
    <FlatList
      testID="history-list"
      data={list.items}
      keyExtractor={(i) => i.id}
      contentContainerStyle={styles.container}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ItemSeparatorComponent={() => <View style={{ height: space.item }} />}
      renderItem={({ item }) => <HistoryRow item={item} onPress={() => setSelected(item)} />}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (list.loaded && list.next && !list.loading && !list.error) void load(false);
      }}
    />
  );
}

function HistoryRow({ item, onPress }: { item: HistoryItem; onPress: () => void }) {
  const s = historySummaryFor(item);
  const when = formatWhen(item.checked_at);
  const meta = fill(copy.history.meta, { when, device: item.device_name });
  return (
    <Pressable
      testID={`history-item-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={[s.headline, s.percent, item.url ?? copy.history.uploadedVideo, meta].filter(Boolean).join('. ')}
      accessibilityHint={copy.history.itemA11yHint}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: color.sunken }]}
    >
      <View style={styles.rowHead}>
        <VerdictMark verdict={item.verdict} small />
        <View style={{ flex: 1 }}>
          <T style={[font.bodyStrong, styles.ink]}>{s.headline}</T>
          {s.percent !== null && <T style={[font.figure, styles.ink2]}>{s.percent}</T>}
        </View>
      </View>
      <T style={[font.caption, styles.ink2, { marginTop: space[2] }]} numberOfLines={2}>
        {item.url ?? copy.history.uploadedVideo}
      </T>
      <T style={[font.caption, styles.ink3]}>{meta}</T>
    </Pressable>
  );
}

function HistoryDetail({
  item,
  onBack,
  onRecheck,
  onDeleted,
}: {
  item: HistoryItem;
  onBack: () => void;
  onRecheck: (url: string) => void;
  onDeleted: (id: string) => void;
}) {
  const s = historySummaryFor(item);
  const d = copy.history.detail;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doDelete = async () => {
    setDeleting(true);
    setError(null);
    const out = await deleteHistory(item.id);
    setDeleting(false);
    // 404 not_found: 이미 지워졌음 → 목록에서도 빼고 안내 (같은 결과)
    if (out.ok || out.code === 'not_found') {
      onDeleted(item.id);
      return;
    }
    setError(authErrorText(out.code));
  };

  return (
    <ScrollView contentContainerStyle={styles.container} testID="history-detail">
      <TopBar right={<TextButton label={d.backButton} onPress={onBack} />} />
      <T style={[font.title, styles.ink, { marginTop: space[5], marginBottom: space[3] }]} accessibilityRole="header">
        {d.title}
      </T>
      <VerdictBlock verdict={item.verdict} headline={s.headline} percent={s.percent} sub={s.sub} />

      <View style={{ marginTop: space[6] }}>
        <InfoRow label={d.whenLabel} value={formatWhen(item.checked_at)} />
        <Divider />
        <InfoRow label={d.deviceLabel} value={item.device_name} />
        <Divider />
        <InfoRow label={d.linkLabel} value={item.url ?? copy.history.uploadedVideo} selectable={item.url !== null} />
      </View>

      <T style={[font.caption, styles.ink3, { marginTop: space[4] }]}>{copy.result.disclaimer}</T>

      <View style={{ marginTop: space.section }}>
        {item.url !== null && <Button label={d.recheckButton} onPress={() => onRecheck(item.url as string)} />}
        <View style={{ marginTop: item.url !== null ? space.buttonGap : 0 }}>
          {!confirming ? (
            <Button variant="secondary" label={d.deleteButton} onPress={() => setConfirming(true)} />
          ) : (
            <View style={styles.confirm} accessibilityLiveRegion="polite">
              <T style={[font.bodyStrong, styles.ink]}>{d.deleteConfirm}</T>
              <View style={{ marginTop: space[3] }}>
                <Button
                  variant={item.url !== null ? 'secondary' : 'primary'}
                  label={deleting ? d.deleting : d.deleteYes}
                  onPress={doDelete}
                  disabled={deleting}
                  testID="history-delete-yes"
                />
              </View>
              <View style={{ marginTop: space[2] }}>
                <TextButton label={d.deleteNo} onPress={() => setConfirming(false)} align="center" />
              </View>
            </View>
          )}
          {error && <InlineError text={error} />}
        </View>
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value, selectable }: { label: string; value: string; selectable?: boolean }) {
  return (
    <View style={{ paddingVertical: space[3] }}>
      <T style={[font.caption, styles.ink3]}>{label}</T>
      <T style={[font.body, styles.ink]} selectable={selectable}>
        {value}
      </T>
    </View>
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
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], paddingVertical: space[5] },
  confirm: { borderWidth: border.strong, borderColor: color.ink, borderRadius: radius.sm, padding: space[4] },
});
