// 개발 모드 영역 (계약 v1.3 signals[].debug, 디자인 시스템 §7) — 결과 화면 맨 아래. EXPO_PUBLIC_DEBUG=1에서만.
// 실사용자 화면과 섞이지 않게 별도 파일로 둔다: mono·DEV 칩·남색 2px 선·700(monoStrong)은 이 파일과 ui.tsx의 Dev* 부품에만 있다
// (__tests__/designRules.test.tsx가 확인).
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DetectResponse } from '../api/contract';
import { DevChip, StatusChip, T } from '../components/ui';
import {
  DEBUG_GLOSSARY,
  debugBarsFor,
  debugCalcFor,
  debugGroupsFor,
  debugSummaryFor,
  type DebugBarRow,
  type DebugGroup,
} from '../ux/debugView';
import { border, color, dev, devFont, radius, size, space } from '../ux/theme';

/**
 * 개발 모드 영역 (계약 v1.3 signals[].debug, 디자인 시스템 §7). 실사용자 부분과 40 간격 + 2px 남색 선으로 끊는다.
 * (2px 선은 Do/Don't 표(§0)의 2px 제한 예외 — 개발 영역 구분 장치, §7.1)
 * 판정은 서버 값 그대로, 계산식·기여도는 설명용 재현.
 */
export function DebugTable({ data }: { data: DetectResponse }) {
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
        {calc.adjusted !== null && <T style={[devFont.monoStrong, { color: dev.warn }]} selectable>{calc.adjusted}</T>}
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
  ink: { color: color.ink },
  ink2: { color: color.inkSecondary },
  ink3: { color: color.inkTertiary },
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
