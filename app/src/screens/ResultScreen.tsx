// S3 결과 (UX 명세 §2.3, §3, §3.1a(D1), §4, §5.6)
// verdict는 서버 값을 그대로 쓴다 — ai_probability로 재계산하지 않는다.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import type { PickedVideo } from '../api/client';
import type { DetectResponse } from '../api/contract';
import { Button, T } from '../components/ui';
import { pickVideo } from '../media/pickVideo';
import { copy } from '../ux/copy';
import { DEBUG_MODE } from '../debug';
import { DEBUG_GLOSSARY, debugCalcFor, debugGroupsFor, debugSummaryFor, type DebugGroup } from '../ux/debugView';
import { buildShareText, detailRowsFor, headlineFor, partialNoteFor, percentLabel, resultModeFor, selectEvidence } from '../ux/present';
import { border, color, font, radius, size, space, verdictColor, verdictIcon } from '../ux/theme';

interface Props {
  data: DetectResponse;
  /** 사용자가 넣은 원본 URL. 영상 파일로 확인했으면 null */
  url: string | null;
  onRetry: () => void;
  onAgain: () => void;
  /** D1: 저장한 영상을 골랐을 때 — 홈의 업로드 흐름과 같은 App.run({ kind: 'upload' }) */
  onSubmitVideo: (video: PickedVideo) => void;
  /** 개발 모드(원시 표). 기본값은 EXPO_PUBLIC_DEBUG=1 여부 — 테스트에서만 직접 넘긴다 */
  debug?: boolean;
}

export function ResultScreen({ data, url, onRetry, onAgain, onSubmitVideo, debug = DEBUG_MODE }: Props) {
  const [shareError, setShareError] = useState(false);
  const [pickerFailed, setPickerFailed] = useState(false);
  const v = data.verdict;
  const vc = verdictColor[v];
  const vCopy = headlineFor(data);
  const linkOnly = resultModeFor(data) === 'linkOnly';
  const isUnknown = v === 'unknown';
  const pl = isUnknown ? null : percentLabel(data.ai_probability);
  const evidence = selectEvidence(v, data.signals);
  const partial = partialNoteFor(data, url === null);
  const detailRows = detailRowsFor(data);
  const [detailsOpen, setDetailsOpen] = useState(debug); // 기본 접힘 (명세 §2.3a). 개발 모드만 기본 펼침

  const cardLabel = [vCopy.headline, pl, vCopy.sub].filter(Boolean).join('. ');

  const onShare = async () => {
    setShareError(false);
    try {
      const message = buildShareText(data, url);
      if (Platform.OS === 'android') await Share.share({ message }, { dialogTitle: copy.share.dialogTitle });
      else await Share.share({ message });
    } catch {
      setShareError(true);
    }
  };

  const onPickVideo = async () => {
    setPickerFailed(false);
    const out = await pickVideo();
    if (out.kind === 'failed') setPickerFailed(true);
    else if (out.kind === 'picked') onSubmitVideo(out.video);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View
        style={[styles.card, { backgroundColor: vc.bg, borderLeftColor: vc.main }]}
        accessible
        accessibilityLabel={cardLabel}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {v === 'uncertain' ? (
            // 노랑은 대비가 낮아 채운 원 + 진한 물음표로 모양 식별 (§6.1)
            <View style={[styles.uncertainIcon, { backgroundColor: vc.main }]}>
              <MaterialCommunityIcons name="help" size={32} color={vc.text} />
            </View>
          ) : (
            <MaterialCommunityIcons name={verdictIcon[v]} size={size.verdictIcon} color={vc.main} />
          )}
        </View>
        <T style={[font.headline, { color: vc.text, marginTop: 12 }]}>{vCopy.headline}</T>
        {pl !== null && <T style={[font.body, { color: color.textSecondary, marginTop: 4 }]}>{pl}</T>}
        <T style={[font.subhead, { color: color.textPrimary, marginTop: 8 }]}>{vCopy.sub}</T>
      </View>

      {linkOnly && (
        <View style={[styles.note, { marginTop: 20 }]}>
          <MaterialCommunityIcons name="information" size={20} color={color.textSecondary} style={{ marginTop: 2 }} />
          <T style={[font.caption, styles.secondaryText, { flex: 1 }]}>{copy.result.linkOnly.saveHint}</T>
        </View>
      )}

      {!isUnknown && (
        <View style={styles.section}>
          {evidence.length > 0 ? (
            <>
              <T style={[font.subhead, styles.primaryText]} accessibilityRole="header">
                {copy.result.evidenceTitle}
              </T>
              {evidence.map((e, i) => (
                <View key={i} style={styles.bullet}>
                  <T style={[styles.evidenceText]}>•</T>
                  <T style={[styles.evidenceText, { flex: 1 }]}>{e}</T>
                </View>
              ))}
            </>
          ) : (
            <T style={[font.body, styles.primaryText]}>{copy.result.evidenceEmpty}</T>
          )}
        </View>
      )}

      {(debug || detailRows.length > 0) && (
        <View style={{ marginTop: 20 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.result.details.toggle}
            accessibilityHint={detailsOpen ? copy.result.details.toggleCloseA11yHint : copy.result.details.toggleOpenA11yHint}
            accessibilityState={{ expanded: detailsOpen }}
            onPress={() => setDetailsOpen((o) => !o)}
            style={({ pressed }) => [styles.detailsToggle, pressed && { backgroundColor: color.surface }]}
          >
            <T style={[font.subhead, styles.primaryText, { flex: 1 }]}>{copy.result.details.toggle}</T>
            <MaterialCommunityIcons
              name={detailsOpen ? 'chevron-up' : 'chevron-down'}
              size={28}
              color={color.textPrimary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </Pressable>
          {detailsOpen && debug && <DebugTable data={data} />}
          {detailsOpen &&
            !debug &&
            detailRows.map((r) => (
              <View key={r.key} style={styles.detailRow} accessible>
                {r.kind === 'rule'
                  ? r.name !== null && (
                      <T style={[font.body, styles.primaryText, { fontWeight: '700' }]}>
                        {r.value !== null ? `${r.name}: ${r.value}` : r.name}
                      </T>
                    )
                  : (
                      <>
                        {r.name !== null && <T style={[font.body, styles.primaryText, { fontWeight: '700' }]}>{r.name}</T>}
                        {r.value !== null && <T style={[font.subhead, styles.primaryText]}>{r.value}</T>}
                      </>
                    )}
                {r.detail !== null && <T style={[font.body, styles.primaryText, { marginTop: 2 }]}>{r.detail}</T>}
                {r.caution !== null && (
                  <T style={[font.caption, styles.secondaryText, { marginTop: 4 }]}>{r.caution}</T>
                )}
              </View>
            ))}
        </View>
      )}

      {partial && (
        <View style={[styles.note, { marginTop: 20 }]}>
          <MaterialCommunityIcons name="information" size={20} color={color.textSecondary} style={{ marginTop: 2 }} />
          <T style={[font.caption, styles.secondaryText, { flex: 1 }]}>{partial}</T>
        </View>
      )}

      <T style={[font.caption, styles.secondaryText, { marginTop: 16 }]}>{copy.result.disclaimer}</T>

      <View style={styles.section}>
        {linkOnly ? (
          <>
            <Button label={copy.result.linkOnly.uploadButton} onPress={onPickVideo} />
            {pickerFailed && (
              <T style={[font.body, { color: color.danger, marginTop: 6 }]} accessibilityLiveRegion="polite">
                {copy.home.inlineError.pickerFailed}
              </T>
            )}
          </>
        ) : isUnknown ? (
          <Button label={copy.result.retryButton} onPress={onRetry} />
        ) : (
          <>
            <Button label={copy.result.shareButton} onPress={onShare} />
            <T style={[font.caption, styles.secondaryText, { textAlign: 'center', marginTop: 6 }]}>
              {copy.result.shareHint}
            </T>
            {shareError && (
              <T style={[font.body, { color: color.danger, marginTop: 6 }]} accessibilityLiveRegion="polite">
                {copy.result.shareError}
              </T>
            )}
          </>
        )}
        <View style={{ marginTop: space.buttonGap }}>
          <Button variant="secondary" label={copy.result.againButton} onPress={onAgain} />
        </View>
      </View>
    </ScrollView>
  );
}

/** 개발 모드 표 (계약 v1.3 signals[].debug). 개발자용 설명 — 판정은 서버 값 그대로, 계산식은 설명용 재현 */
function DebugTable({ data }: { data: DetectResponse }) {
  const sum = debugSummaryFor(data);
  const calc = debugCalcFor(data);
  const groups = debugGroupsFor(data);
  const [glossOpen, setGlossOpen] = useState(false);
  return (
    <View testID="debug-table" style={styles.debugBox}>
      <View style={styles.debugCard}>
        <T style={[styles.dbg, { fontWeight: '700', fontSize: 16 }]} selectable>{sum.verdict}</T>
        <T style={[styles.dbg, { fontWeight: '700' }]} selectable>{sum.probability}</T>
        <T style={styles.dbg}>{sum.partial}</T>
        <T style={styles.dbg}>{sum.cached}</T>
        <T style={[styles.dbgSmall, styles.secondaryText]} selectable>{sum.requestId}</T>
      </View>
      <View style={styles.debugCard}>
        <T style={[styles.dbg, { fontWeight: '700' }]}>계산식 (가중 평균, 설명용)</T>
        <T style={styles.mono} selectable>{calc.formula}</T>
        {calc.adjusted !== null && <T style={[styles.dbg, { color: color.danger }]} selectable>{calc.adjusted}</T>}
        {calc.decisive !== null && <T style={[styles.dbg, { fontWeight: '700' }]} selectable>{calc.decisive}</T>}
      </View>
      <DebugGroupView testID="debug-group-used" group={groups.used} />
      <DebugGroupView testID="debug-group-excluded" group={groups.excluded} />
      <Pressable accessibilityRole="button" onPress={() => setGlossOpen((o) => !o)} style={styles.glossToggle}>
        <T style={[styles.dbg, { fontWeight: '700' }]}>{glossOpen ? '용어 설명 접기 ▲' : '용어 설명 펼치기 ▼'}</T>
      </Pressable>
      {glossOpen && (
        <View testID="debug-glossary" style={styles.debugCard}>
          {DEBUG_GLOSSARY.map((g) => (
            <T key={g.term} style={styles.dbg}>
              <T style={[styles.dbg, { fontWeight: '700' }]}>{g.term}</T>
              {` — ${g.desc}`}
            </T>
          ))}
        </View>
      )}
    </View>
  );
}

function DebugGroupView({ group, testID }: { group: DebugGroup; testID: string }) {
  return (
    <View testID={testID} style={{ marginTop: 14 }}>
      <T style={[styles.dbg, { fontWeight: '700', fontSize: 16 }]}>{`${group.title} (${group.cards.length})`}</T>
      <T style={[styles.dbgSmall, styles.secondaryText]}>{group.desc}</T>
      {group.cards.length === 0 && <T style={[styles.dbg, styles.secondaryText]}>(없음)</T>}
      {group.cards.map((c) => (
        <View key={c.key} style={styles.debugCard}>
          <T style={[styles.dbg, { fontWeight: '700' }, c.alert && { color: color.danger }]} selectable>
            {c.title}
            {c.title !== c.id && <T style={[styles.dbgSmall, styles.secondaryText]}>{`  ${c.id}`}</T>}
          </T>
          {c.fields.map((f) => (
            <View key={f.label} style={styles.debugField}>
              <T style={[styles.dbg, styles.secondaryText, { width: 96 }]}>{f.label}</T>
              <T style={[styles.dbg, { flex: 1 }, f.alert && { color: color.danger, fontWeight: '700' }]} selectable>
                {f.value}
              </T>
            </View>
          ))}
          {c.rawLines.length > 0 && (
            <View style={styles.debugRaw}>
              <T style={[styles.dbgSmall, styles.secondaryText]}>원점수 상세</T>
              {c.rawLines.map((l, i) => (
                <T key={i} style={styles.dbg} selectable>{l}</T>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.screenX, paddingVertical: 20, backgroundColor: color.background, flexGrow: 1 },
  card: { borderRadius: radius.card, borderLeftWidth: border.verdictStripe, padding: 20 },
  uncertainIcon: {
    width: size.verdictIcon,
    height: size.verdictIcon,
    borderRadius: size.verdictIcon / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginTop: space.section },
  bullet: { flexDirection: 'row', gap: 8, marginTop: space.item },
  evidenceText: { fontSize: 20, fontWeight: '400', lineHeight: 30, color: color.textPrimary },
  note: { flexDirection: 'row', gap: 6 },
  detailsToggle: {
    minHeight: size.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: border.outline,
    borderColor: color.border,
    borderRadius: radius.button,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  detailRow: { marginTop: space.item, paddingBottom: space.item, borderBottomWidth: 1, borderBottomColor: color.surface },
  primaryText: { color: color.textPrimary },
  secondaryText: { color: color.textSecondary },
  debugBox: { marginTop: space.item, padding: 10, backgroundColor: color.surface, borderRadius: 6 },
  debugCard: { marginTop: 8, padding: 10, backgroundColor: color.background, borderRadius: 6, borderWidth: 1, borderColor: color.border },
  debugField: { flexDirection: 'row', marginTop: 2 },
  debugRaw: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: color.surface },
  glossToggle: { marginTop: 14, paddingVertical: 8 },
  dbg: { fontSize: 14, lineHeight: 20, color: color.textPrimary },
  dbgSmall: { fontSize: 12, lineHeight: 16 },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    lineHeight: 18,
    color: color.textPrimary,
  },
});
