// S3 결과 (UX 명세 §2.3, §3, §3.1a(D1), §4, §5.6 / 디자인 시스템 §6.3, §6.5, §6.6, §7)
// verdict는 서버 값을 그대로 쓴다 — ai_probability로 재계산하지 않는다.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import type { PickedVideo } from '../api/client';
import type { DetectResponse } from '../api/contract';
import { Button, DevChip, Divider, InlineError, Note, StatusChip, T, TopBar, VerdictBlock } from '../components/ui';
import { pickVideo } from '../media/pickVideo';
import { copy } from '../ux/copy';
import { DEBUG_MODE } from '../debug';
import {
  DEBUG_GLOSSARY,
  debugBarsFor,
  debugCalcFor,
  debugGroupsFor,
  debugSummaryFor,
  type DebugBarRow,
  type DebugGroup,
} from '../ux/debugView';
import { buildShareText, detailRowsFor, headlineFor, partialNoteFor, percentLabel, resultModeFor, selectEvidence } from '../ux/present';
import { border, color, dev, devFont, font, radius, size, space } from '../ux/theme';

interface Props {
  data: DetectResponse;
  /** 사용자가 넣은 원본 URL(공유로 들어왔으면 공유 문구에서 꺼낸 원래 링크). 영상 파일로 확인했으면 null */
  url: string | null;
  /** 공유하기로 들어왔는지 (#12 기능 3) — 보내기 버튼을 '카카오톡 등으로 다시 보내기'로 */
  fromShare?: boolean;
  onRetry: () => void;
  onAgain: () => void;
  /** D1: 저장한 영상을 골랐을 때 — 홈의 업로드 흐름과 같은 App.run({ kind: 'upload' }) */
  onSubmitVideo: (video: PickedVideo) => void;
  /** 개발 모드(원시 표). 기본값은 EXPO_PUBLIC_DEBUG=1 여부 — 테스트에서만 직접 넘긴다 */
  debug?: boolean;
  /** 맨 아래 보조 버튼 이름. 기본 '다른 영상 확인하기'. 앱 안 유튜브 바텀시트에선 '닫고 계속 보기' */
  againLabel?: string;
  /** 바텀시트 안에서는 맨 위 JJAJJA 줄을 숨긴다 */
  inSheet?: boolean;
}

export function ResultScreen({
  data,
  url,
  fromShare = false,
  onRetry,
  onAgain,
  onSubmitVideo,
  debug = DEBUG_MODE,
  againLabel = copy.result.againButton,
  inSheet = false,
}: Props) {
  const [shareError, setShareError] = useState(false);
  const [pickerFailed, setPickerFailed] = useState(false);
  const v = data.verdict;
  const vCopy = headlineFor(data);
  const linkOnly = resultModeFor(data) === 'linkOnly';
  const isUnknown = v === 'unknown';
  const pl = isUnknown ? null : percentLabel(data.ai_probability);
  const evidence = selectEvidence(v, data.signals);
  const partial = partialNoteFor(data, url === null);
  const detailRows = detailRowsFor(data);
  const [detailsOpen, setDetailsOpen] = useState(debug); // 기본 접힘 (명세 §2.3a). 개발 모드만 기본 펼침

  const shareMessage = buildShareText(data, url); // unknown이면 null → 버튼 없음

  const onShare = async () => {
    setShareError(false);
    const message = shareMessage;
    if (message === null) return;
    try {
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
    <ScrollView contentContainerStyle={[styles.container, inSheet && { paddingTop: space[4] }]}>
      {!inSheet && <TopBar />}

      <View style={{ marginTop: inSheet ? 0 : space[5] }}>
        <VerdictBlock testID="verdict-block" verdict={v} headline={vCopy.headline} percent={pl} sub={vCopy.sub} />
      </View>

      {linkOnly && <Note text={copy.result.linkOnly.saveHint} style={{ marginTop: space[5] }} />}

      {!isUnknown && (
        <View style={styles.section}>
          {evidence.length > 0 ? (
            <>
              <T style={[font.title, styles.ink]} accessibilityRole="header">
                {copy.result.evidenceTitle}
              </T>
              {evidence.map((e, i) => (
                <View key={i} style={styles.bullet}>
                  <View style={styles.bulletMark} />
                  <T style={[font.body, styles.ink, { flex: 1 }]}>{e}</T>
                </View>
              ))}
            </>
          ) : (
            <T style={[font.body, styles.ink]}>{copy.result.evidenceEmpty}</T>
          )}
        </View>
      )}

      {(debug || detailRows.length > 0) && (
        <View style={{ marginTop: space[6] }}>
          <Divider />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.result.details.toggle}
            accessibilityHint={detailsOpen ? copy.result.details.toggleCloseA11yHint : copy.result.details.toggleOpenA11yHint}
            accessibilityState={{ expanded: detailsOpen }}
            onPress={() => setDetailsOpen((o) => !o)}
            style={({ pressed }) => [styles.detailsToggle, pressed && { backgroundColor: color.sunken }]}
          >
            <T style={[font.subhead, styles.ink, { flex: 1 }]}>{copy.result.details.toggle}</T>
            <MaterialCommunityIcons
              name={detailsOpen ? 'chevron-up' : 'chevron-down'}
              size={24}
              color={color.ink}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </Pressable>
          <Divider />
          {detailsOpen && !debug && detailRows.length > 0 && (
            <View style={styles.detailsBox}>
              {detailRows.map((r, i) => (
                <View key={r.key} style={[i > 0 && { marginTop: space[4] }]} accessible>
                  {r.kind === 'rule' ? (
                    r.name !== null && (
                      <View style={styles.detailHead}>
                        <T style={[font.bodyStrong, styles.ink, { flex: 1 }]}>{r.name}</T>
                        {r.value !== null && <T style={[font.figure, styles.ink]}>{r.value}</T>}
                      </View>
                    )
                  ) : (
                    <View style={styles.detailHead}>
                      {r.name !== null && <T style={[font.bodyStrong, styles.ink, { flex: 1 }]}>{r.name}</T>}
                      {r.value !== null && <T style={[font.figure, styles.ink]}>{r.value}</T>}
                    </View>
                  )}
                  {r.detail !== null && <T style={[font.body, styles.ink, { marginTop: 2 }]}>{r.detail}</T>}
                  {r.caution !== null && <T style={[font.caption, styles.ink3, { marginTop: space[1] }]}>{r.caution}</T>}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {partial && <Note text={partial} style={{ marginTop: space[5] }} />}

      <T style={[font.caption, styles.ink3, { marginTop: space[4] }]}>{copy.result.disclaimer}</T>

      <View style={styles.section}>
        {linkOnly ? (
          <>
            <Button label={copy.result.linkOnly.uploadButton} onPress={onPickVideo} />
            {pickerFailed && <InlineError text={copy.home.inlineError.pickerFailed} />}
          </>
        ) : isUnknown ? (
          <Button label={copy.result.retryButton} onPress={onRetry} />
        ) : shareMessage === null ? null : (
          <>
            <Button
              label={fromShare ? copy.result.reshareButton : copy.result.shareButton}
              icon="share-variant-outline"
              onPress={onShare}
            />
            <T style={[font.caption, styles.ink3, { textAlign: 'center', marginTop: 6 }]}>
              {fromShare ? copy.result.reshareHint : copy.result.shareHint}
            </T>
            {shareError && <InlineError text={copy.result.shareError} />}
          </>
        )}
        <View style={{ marginTop: space.buttonGap }}>
          <Button variant="secondary" label={againLabel} onPress={onAgain} />
        </View>
      </View>

      {debug && detailsOpen && <DebugTable data={data} />}
    </ScrollView>
  );
}

/**
 * 개발 모드 영역 (계약 v1.3 signals[].debug, 디자인 시스템 §7). 실사용자 부분과 32 간격 + 2px 남색 선으로 끊는다.
 * 판정은 서버 값 그대로, 계산식·기여도는 설명용 재현.
 */
function DebugTable({ data }: { data: DetectResponse }) {
  const sum = debugSummaryFor(data);
  const calc = debugCalcFor(data);
  const groups = debugGroupsFor(data);
  const bars = debugBarsFor(data);
  const [glossOpen, setGlossOpen] = useState(false);
  return (
    <View testID="debug-table" style={styles.debugArea}>
      <DevChip />
      <View style={styles.debugCard}>
        <T style={[devFont.title, styles.ink]} selectable>{sum.verdict}</T>
        <T style={[devFont.monoStrong, styles.ink]} selectable>{sum.probability}</T>
        <T style={[devFont.label, styles.ink2]}>{sum.partial}</T>
        <T style={[devFont.label, styles.ink2]}>{sum.cached}</T>
        <T style={[devFont.mono, styles.ink3]} selectable>{sum.requestId}</T>
      </View>
      <View style={styles.debugCard}>
        <T style={[devFont.title, styles.ink]}>계산식 (가중 평균, 설명용)</T>
        <T style={[devFont.mono, styles.ink]} selectable>{calc.formula}</T>
        {calc.adjusted !== null && <T style={[devFont.label, { color: dev.warn, fontWeight: '700' }]} selectable>{calc.adjusted}</T>}
        {calc.decisive !== null && <T style={[devFont.monoStrong, styles.ink]} selectable>{calc.decisive}</T>}
      </View>
      <View style={styles.debugCard} testID="debug-bars">
        <T style={[devFont.title, styles.ink]}>기여도 (weight·score ÷ Σweight)</T>
        {bars.map((b) => (
          <DebugBar key={b.key} row={b} />
        ))}
      </View>
      <DebugGroupView testID="debug-group-used" group={groups.used} />
      <DebugGroupView testID="debug-group-excluded" group={groups.excluded} />
      <Pressable accessibilityRole="button" onPress={() => setGlossOpen((o) => !o)} style={styles.glossToggle}>
        <T style={[devFont.title, { color: color.accent }]}>{glossOpen ? '용어 설명 접기 ▲' : '용어 설명 펼치기 ▼'}</T>
      </Pressable>
      {glossOpen && (
        <View testID="debug-glossary" style={styles.debugCard}>
          {DEBUG_GLOSSARY.map((g) => (
            <T key={g.term} style={[devFont.label, styles.ink, { fontFamily: devFont.mono.fontFamily, fontWeight: '400' }]}>
              <T style={[devFont.monoStrong, styles.ink]}>{g.term}</T>
              {` — ${g.desc}`}
            </T>
          ))}
        </View>
      )}
    </View>
  );
}

function DebugBar({ row }: { row: DebugBarRow }) {
  const failed = row.chip === 'FAIL';
  return (
    <View style={[styles.barRow, failed && styles.barRowFail]}>
      <View style={styles.barHead}>
        <T style={[devFont.monoStrong, { color: failed ? dev.fail : color.ink, flex: 1 }]} selectable>
          {row.id}
        </T>
        <StatusChip status={row.chip} />
      </View>
      <View style={styles.barHead}>
        <T style={[devFont.mono, styles.ink2]}>{`score ${row.score} · w ${row.weight}`}</T>
      </View>
      <View style={styles.barHead}>
        <View style={[styles.barTrack, row.share === null && styles.barExcluded]}>
          {row.share !== null && (
            <View style={{ width: `${Math.max(0, Math.min(1, row.share)) * 100}%`, height: '100%', backgroundColor: dev.barFill }} />
          )}
          {row.share !== null && row.decisive && <View style={styles.barTick} />}
        </View>
        <T style={[devFont.mono, styles.ink, { marginLeft: space[2] }]}>{row.shareText}</T>
      </View>
    </View>
  );
}

function DebugGroupView({ group, testID }: { group: DebugGroup; testID: string }) {
  return (
    <View testID={testID} style={{ marginTop: space[3] }}>
      <T style={[devFont.title, styles.ink]}>{`${group.title} (${group.cards.length})`}</T>
      <T style={[devFont.label, styles.ink3]}>{group.desc}</T>
      {group.cards.length === 0 && <T style={[devFont.label, styles.ink3]}>(없음)</T>}
      {group.cards.map((c) => (
        <View key={c.key} style={[styles.debugCard, c.alert && styles.barRowFail]}>
          <T style={[devFont.title, { color: c.alert ? dev.fail : color.ink }]} selectable>
            {c.title}
            {c.title !== c.id && <T style={[devFont.mono, styles.ink3]}>{`  ${c.id}`}</T>}
          </T>
          {c.fields.map((f) => (
            <View key={f.label} style={styles.debugField}>
              <T style={[devFont.label, styles.ink2, { width: 104 }]}>{f.label}</T>
              <T style={[f.alert ? devFont.monoStrong : devFont.mono, { flex: 1, color: f.alert ? dev.fail : color.ink }]} selectable>
                {f.value}
              </T>
            </View>
          ))}
          {c.rawLines.length > 0 && (
            <View style={styles.debugRaw}>
              <T style={[devFont.label, styles.ink3]}>원점수 상세</T>
              {c.rawLines.map((l, i) => (
                <T key={i} style={[devFont.mono, styles.ink]} selectable>
                  {l}
                </T>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.screenX, paddingBottom: space[8], backgroundColor: color.paper, flexGrow: 1 },
  section: { marginTop: space.section },
  ink: { color: color.ink },
  ink2: { color: color.inkSecondary },
  ink3: { color: color.inkTertiary },
  bullet: { flexDirection: 'row', gap: space[3], marginTop: space.item, alignItems: 'flex-start' },
  // 글머리: 잉크 사각점 6×6 (•보다 인쇄물 느낌, §6.3). 본문 28 행간 가운데에 맞춘다
  bulletMark: { width: 6, height: 6, backgroundColor: color.ink, marginTop: 11 },
  detailsToggle: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[1] },
  detailsBox: { backgroundColor: color.sunken, padding: space[4] },
  detailHead: { flexDirection: 'row', alignItems: 'baseline', gap: space[3] },
  // 개발자 모드
  debugArea: {
    marginTop: space.section,
    paddingTop: space[3],
    borderTopWidth: border.strong,
    borderTopColor: dev.band,
  },
  debugCard: {
    marginTop: space[2],
    padding: space[3],
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    borderWidth: border.hair,
    borderColor: color.lineStrong,
  },
  debugField: { flexDirection: 'row', paddingVertical: space[1], paddingHorizontal: 0 },
  debugRaw: { marginTop: 6, paddingTop: 6, borderTopWidth: border.hair, borderTopColor: color.line },
  glossToggle: { marginTop: space[3], minHeight: size.touchMin, justifyContent: 'center' },
  barRow: { marginTop: space[2], paddingVertical: space[1], paddingLeft: space[2] },
  barRowFail: { backgroundColor: dev.failTint, borderLeftWidth: 3, borderLeftColor: dev.fail },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: 2 },
  barTrack: {
    width: size.devBar.width,
    height: size.devBar.height,
    backgroundColor: dev.barTrack,
    borderRadius: radius.none,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  // RN에서 45° 빗금 대신 1px barExcluded 테두리만 그린 빈 트랙 (§7.3 허용 대안)
  barExcluded: { borderWidth: border.hair, borderColor: dev.barExcluded },
  barTick: { width: 2, height: '100%', backgroundColor: dev.band },
});
