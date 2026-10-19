// S3 결과 (UX 명세 §2.3, §3, §3.1a(D1), §4, §5.6 / 디자인 시스템 v2 §6.3, §6.5, §6.6, §7)
// v2: 판정 블록은 면 없이 위 1px 판정색 선 + 도장 40 + 명조 헤드라인. 주 버튼 하나(보내기/다시 확인/영상 파일),
// [다른 영상 확인하기]·[닫고 계속 보기]는 텍스트 버튼(§0.2 V4).
// verdict는 서버 값을 그대로 쓴다 — ai_probability로 재계산하지 않는다.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import type { PickedVideo } from '../api/client';
import type { DetectResponse } from '../api/contract';
import { Button, Divider, InlineError, Note, T, TopBar, VerdictBlock } from '../components/ui';
import { pickVideo } from '../media/pickVideo';
import { copy } from '../ux/copy';
import { DEBUG_MODE } from '../debug';
import { buildShareText, detailRowsFor, headlineFor, partialNoteFor, percentLabel, resultModeFor, selectEvidence } from '../ux/present';
import { color, font, radius, size, space } from '../ux/theme';
import { DebugTable } from './DebugTable';

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

      <View style={{ marginTop: inSheet ? 0 : space[6] }}>
        <VerdictBlock testID="verdict-block" verdict={v} headline={vCopy.headline} percent={pl} sub={vCopy.sub} />
      </View>

      {linkOnly && <Note text={copy.result.linkOnly.saveHint} />}

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
        <View style={{ marginTop: space.section }}>
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
              size={size.buttonIcon}
              color={color.inkSecondary}
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
                  {r.detail !== null && <T style={[font.body, styles.ink, { marginTop: space[1] }]}>{r.detail}</T>}
                  {r.caution !== null && <T style={[font.caption, styles.ink3, { marginTop: space[1] }]}>{r.caution}</T>}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={{ marginTop: space[6], gap: space[2] }}>
        {partial && <Note text={partial} />}
        <T style={[font.caption, styles.ink3]}>{copy.result.disclaimer}</T>
      </View>

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
            <T style={[font.caption, styles.ink3, { textAlign: 'center', marginTop: space[2] }]}>
              {fromShare ? copy.result.reshareHint : copy.result.shareHint}
            </T>
            {shareError && <InlineError text={copy.result.shareError} />}
          </>
        )}
        <View style={{ marginTop: space[5] }}>
          <Button variant="text" label={againLabel} onPress={onAgain} />
        </View>
      </View>

      {debug && detailsOpen && <DebugTable data={data} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.screenX, paddingBottom: space[8], backgroundColor: color.paper, flexGrow: 1 },
  section: { marginTop: space.section },
  ink: { color: color.ink },
  ink2: { color: color.inkSecondary },
  ink3: { color: color.inkTertiary },
  bullet: { flexDirection: 'row', gap: space[3], marginTop: space.item, alignItems: 'flex-start' },
  // 글머리: 잉크 사각점 4×4 (§6.3). 본문 29 행간 가운데(위 12)에 맞춘다
  bulletMark: { width: size.bullet, height: size.bullet, backgroundColor: color.ink, marginTop: space[3] + 1 },
  // 자세히 보기 토글: 높이 52 (상단 바와 같은 높이), 위아래 1px line
  detailsToggle: { minHeight: size.topBar, flexDirection: 'row', alignItems: 'center' },
  detailsBox: { backgroundColor: color.sunken, borderRadius: radius.md, padding: space[4], marginTop: space[2] },
  detailHead: { flexDirection: 'row', alignItems: 'baseline', gap: space[3] },
});
