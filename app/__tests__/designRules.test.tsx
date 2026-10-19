// 디자인 시스템 v2 Do/Don't (§0 Do/Don't 표, §9) 지키기 — 실기기 피드백 "버튼이 너무 커, 굵어서 싸 보임"이 다시 생기지 않게.
//  - 버튼: 보이는 높이 48(주)/44(선·텍스트), 터치는 hitSlop으로 48 이상(선·텍스트 52), 주 버튼은 내용 폭 최대 400
//  - 한 화면에 폭 넓은 주 버튼은 하나
//  - 700 굵기는 판정 헤드라인(명조)만 — 개발자 모드 제외
//  - 2px 선은 유튜브 배지·개발 영역만, 카드 외곽선(lineStrong)은 개발 카드만
//  - 판정 블록: 면·왼쪽 띠 없이 위 1px 판정색 선 + 도장 40(1.5)
import { render, screen } from '@testing-library/react-native';
import * as fs from 'fs';
import * as path from 'path';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import type { DetectResponse, Verdict } from '../src/api/contract';
import { Button, IconButton, TextButton, VerdictBlock } from '../src/components/ui';
import { LoginScreen, SignupScreen } from '../src/screens/AuthScreens';
import { ErrorScreen } from '../src/screens/ErrorScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { LoadingScreen } from '../src/screens/LoadingScreen';
import { ResultScreen } from '../src/screens/ResultScreen';
import { YoutubeScreen as YoutubeScreenWeb } from '../src/screens/YoutubeScreen.web';
import { border, color, font, radius, size, space, tokens, verdict as verdictTokens } from '../src/ux/theme';
import { SAMPLE } from './fixtures';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const noop = () => {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Style = Record<string, any>;
const flat = (node: { props: { style?: unknown } }): Style => (StyleSheet.flatten(node.props.style as never) ?? {}) as Style;
const touchHeight = (node: { props: { style?: unknown; hitSlop?: unknown } }) => {
  const s = flat(node);
  const slop = node.props.hitSlop;
  const v = typeof slop === 'number' ? slop * 2 : slop && typeof slop === 'object' ? ((slop as { top?: number }).top ?? 0) + ((slop as { bottom?: number }).bottom ?? 0) : 0;
  return (s.minHeight as number) + v;
};

describe('버튼 수치 (§5.1, §4.4)', () => {
  it('주 버튼: 보이는 높이 48, 모서리 8, 내용 폭(100%, 최대 400, 가운데), 테두리 없음, 터치 48 이상', () => {
    render(<Button testID="b" label="보내기" onPress={noop} />);
    const b = screen.getByTestId('b');
    const s = flat(b);
    expect(s.minHeight).toBe(48);
    expect(s.minHeight).toBe(tokens.size.buttonMinHeight);
    expect(s.height).toBeUndefined(); // 고정 height 금지 (1.6배 확대 대비)
    expect(s.borderRadius).toBe(8);
    expect(s.width).toBe('100%');
    expect(s.maxWidth).toBe(400);
    expect(s.alignSelf).toBe('center');
    expect(s.paddingHorizontal).toBe(24);
    expect(s.borderWidth ?? 0).toBe(0);
    expect(touchHeight(b)).toBeGreaterThanOrEqual(size.touchMin);
  });

  it('주 버튼 글자: 17/24, 600 (700 아님)', () => {
    render(<Button label="보내기" onPress={noop} />);
    const s = flat(screen.getByText('보내기'));
    expect(s.fontSize).toBe(17);
    expect(s.lineHeight).toBe(24);
    expect(s.letterSpacing).toBe(-0.2);
    // 폰트 로드 전(테스트)은 시스템 글꼴 + fontWeight, 로드 후는 Pretendard-SemiBold
    expect(s.fontFamily === tokens.font.family.sans.app.semibold || s.fontWeight === '600').toBe(true);
    expect(s.fontWeight).not.toBe('700');
  });

  it('선 버튼: 높이 44, 1px lineUi, 글자 폭(가운데), 모서리 8, hitSlop 4 → 터치 52', () => {
    render(<Button testID="b" variant="secondary" label="영상 파일로 확인하기" onPress={noop} />);
    const b = screen.getByTestId('b');
    const s = flat(b);
    expect(s.minHeight).toBe(44);
    expect(s.borderWidth).toBe(1);
    expect(s.borderColor).toBe(color.lineUi);
    expect(s.borderRadius).toBe(8);
    expect(s.alignSelf).toBe('center');
    expect(s.width).toBeUndefined(); // 폭 가득 금지
    expect(s.paddingHorizontal).toBe(20);
    expect(b.props.hitSlop).toBe(4);
    expect(touchHeight(b)).toBe(52);
  });

  it('선 버튼 align="left" (목록·설정 화면)', () => {
    render(<Button testID="b" variant="secondary" label="다시 불러오기" align="left" onPress={noop} />);
    expect(flat(screen.getByTestId('b')).alignSelf).toBe('flex-start');
  });

  it('텍스트 버튼: 높이 44, 테두리·면 없음, hitSlop 4 → 터치 52, 남색 밑줄 17/600', () => {
    render(<TextButton testID="t" label="다른 영상 확인하기" onPress={noop} />);
    const t = screen.getByTestId('t');
    const s = flat(t);
    expect(s.minHeight).toBe(44);
    expect(s.borderWidth ?? 0).toBe(0);
    expect(s.backgroundColor).toBeUndefined();
    expect(t.props.hitSlop).toBe(4);
    expect(touchHeight(t)).toBe(52);
    const label = flat(screen.getByText('다른 영상 확인하기'));
    expect(label.color).toBe(color.accent);
    expect(label.textDecorationLine).toBe('underline');
    expect(label.fontSize).toBe(17);
  });

  it('Button variant="text"도 같은 텍스트 버튼', () => {
    render(<Button testID="t" variant="text" label="처음으로" onPress={noop} />);
    expect(touchHeight(screen.getByTestId('t'))).toBe(52);
  });

  it('아이콘 버튼: 상자 40 + hitSlop 8 → 터치 56', () => {
    render(<IconButton testID="i" icon="close" accessibilityLabel="지우기" onPress={noop} />);
    const i = screen.getByTestId('i');
    const s = flat(i);
    expect(s.width).toBe(40);
    expect(s.height).toBe(40);
    expect(i.props.hitSlop).toBe(8);
    expect(s.height + 2 * i.props.hitSlop).toBeGreaterThanOrEqual(size.touchMin);
  });

  it('인접 버튼 간격 12 이상 (hitSlop 4+4가 겹치지 않게)', () => {
    expect(space.buttonGap).toBeGreaterThan(2 * tokens.size.hitSlop.secondary);
  });
});

// ---------------------------------------------------------------------------
// 한 화면에 폭 넓은 주 버튼은 하나 (§0.4, §5.1)
// ---------------------------------------------------------------------------

const data = (o: Partial<DetectResponse>): DetectResponse => ({ ...(SAMPLE as DetectResponse), ...o });
/** 그려진 트리에서 주 버튼(잉크 면 + minHeight 48)과 폭 가득 늘어난 버튼을 센다 */
type HostNode = { type: unknown; props: Style };
function countButtons() {
  const hosts: HostNode[] = screen.root.findAll((n: HostNode) => typeof n.type === 'string' && n.props.accessibilityRole === 'button');
  const styles: Style[] = hosts.map((n) => flat(n));
  const primary = styles.filter(
    (s) => s.minHeight === tokens.size.buttonMinHeight && [color.ink, color.inkPressed, color.disabledBg].includes(s.backgroundColor as string),
  );
  const stretched = styles.filter((s) => s.alignSelf === 'stretch' || (s.width === '100%' && s.maxWidth === undefined));
  // 보이는 버튼(면 또는 테두리가 있는 것)이 48보다 크면 안 된다. 면·테두리 없는 행 토글(자세히 보기 52)은 제외
  const tall = styles.filter(
    (s) =>
      typeof s.minHeight === 'number' &&
      s.minHeight > tokens.size.buttonMinHeight &&
      ((s.backgroundColor !== undefined && s.backgroundColor !== 'transparent') || (s.borderWidth ?? 0) > 0),
  );
  return { primary: primary.length, stretched: stretched.length, tall: tall.length };
}

describe('화면마다 주 버튼 하나, 폭 가득 버튼 없음, 48보다 큰 버튼 없음', () => {
  const cases: [string, () => ReactElement][] = [
    ['홈(빈 입력)', () => <HomeScreen initialText="" showFirstRunHint onSubmitUrl={noop} onSubmitVideo={noop} onOpenYoutube={noop} onOpenHistory={noop} onOpenAccount={noop} />],
    ['홈(입력 있음)', () => <HomeScreen initialText="https://youtu.be/x" showFirstRunHint={false} onSubmitUrl={noop} onSubmitVideo={noop} onOpenYoutube={noop} />],
    ['확인 중', () => <LoadingScreen isUpload={false} onCancel={noop} />],
    ...(['likely_ai', 'uncertain', 'likely_real'] as Verdict[]).map(
      (v) => [`결과 ${v}`, () => <ResultScreen data={data({ verdict: v })} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} debug={false} />] as [string, () => ReactElement],
    ),
    ['결과 공유 재전송', () => <ResultScreen data={data({})} url="https://youtu.be/x" fromShare onRetry={noop} onAgain={noop} onSubmitVideo={noop} debug={false} />],
    ['결과 unknown', () => <ResultScreen data={data({ verdict: 'unknown', ai_probability: null })} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} debug={false} />],
    [
      'D1 주소만으로는 어려움',
      () => (
        <ResultScreen
          data={data({ verdict: 'unknown', ai_probability: null, partial: true, platform: 'youtube' })}
          url="https://youtu.be/x"
          onRetry={noop}
          onAgain={noop}
          onSubmitVideo={noop}
          debug={false}
        />
      ),
    ],
    ['시트 결과', () => <ResultScreen data={data({})} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} inSheet againLabel="닫고 계속 보기" debug={false} />],
    ['결과 개발 모드', () => <ResultScreen data={data({})} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} debug />],
    ['에러(다시 시도)', () => <ErrorScreen code="detectors_down" onRetry={noop} onHome={noop} />],
    ['에러(처음으로)', () => <ErrorScreen code="unsupported_platform" onRetry={noop} onHome={noop} />],
    ['로그인', () => <LoginScreen onLoggedIn={noop} onGoSignup={noop} notice="pending" />],
    ['회원가입', () => <SignupScreen onSignedUp={noop} onGoLogin={noop} />],
    ['유튜브(웹 안내)', () => <YoutubeScreenWeb onExit={noop} onSubmitVideo={noop} />],
  ];
  it.each(cases)('%s', (_name, el) => {
    render(el());
    const c = countButtons();
    expect(c.primary).toBeLessThanOrEqual(1);
    expect(c.stretched).toBe(0);
    expect(c.tall).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 판정 블록 (§5.4)
// ---------------------------------------------------------------------------

describe('판정 블록: 면·띠 없이 위 1px 판정색 선 + 도장 40(1.5) + 명조 700 헤드라인', () => {
  it.each<Verdict>(['likely_ai', 'uncertain', 'likely_real', 'unknown'])('%s', (v) => {
    render(<VerdictBlock testID="vb" verdict={v} headline="헤드라인" percent="AI 가능성 87%" sub="보조 문장" />);
    const s = flat(screen.getByTestId('vb'));
    expect(s.backgroundColor).toBeUndefined();
    expect(s.borderLeftWidth ?? 0).toBe(0);
    expect(s.borderWidth ?? 0).toBe(0);
    expect(s.borderTopWidth).toBe(1);
    expect(s.borderTopColor).toBe(verdictTokens[v].main);
    expect(s.paddingVertical).toBe(24);
    const mark = flat(screen.getByTestId(`verdict-mark-${v}`, { includeHiddenElements: true }));
    expect(mark.width).toBe(40);
    expect(mark.borderWidth).toBe(1.5);
    expect(mark.borderRadius).toBe(v === 'likely_ai' ? radius.sm : radius.round);
    const h = flat(screen.getByText('헤드라인'));
    expect(h.fontSize).toBe(26);
    expect(h.color).toBe(verdictTokens[v].main);
    const sub = flat(screen.getByText('보조 문장'));
    expect(sub.fontSize).toBe(18);
    expect(sub.color).toBe(color.ink);
    expect(sub.fontWeight ?? '400').toBe('400');
  });
});

// ---------------------------------------------------------------------------
// 굵기·선 규칙 — 소스 정적 검사 (§3.2, §4.1, §8.3 QA 대조 항목)
// ---------------------------------------------------------------------------

const ROOT = path.join(__dirname, '..');
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
const SOURCES = [path.join(ROOT, 'App.tsx'), ...walk(path.join(ROOT, 'src'))].map((f) => ({
  f: path.relative(ROOT, f).split(path.sep).join('/'),
  src: fs.readFileSync(f, 'utf8'),
}));
const filesMatching = (re: RegExp) => SOURCES.filter(({ src }) => re.test(src)).map(({ f }) => f).sort();

describe('굵기 700은 판정 헤드라인만 (§0 Do/Don’t 표, §9)', () => {
  it('토큰: 실사용자 글자 단계 중 700은 headline 하나', () => {
    const bold = Object.entries(tokens.font.scale)
      .filter(([, t]) => t.weight === '700')
      .map(([k]) => k);
    expect(bold).toEqual(['headline']);
  });
  it('theme.font: 굵은 글꼴(Pretendard-Bold / NotoSerifKR-Bold)로 그리는 단계는 headline 하나', () => {
    const boldFamilies = [tokens.font.family.sans.app.bold, tokens.font.family.serif.app.bold];
    const bold = Object.entries(font)
      .filter(([, s]) => boldFamilies.includes(s.fontFamily as string))
      .map(([k]) => k);
    expect(bold).toEqual(['headline']);
    expect(font.display.fontFamily).toBe(tokens.font.family.serif.app.semibold);
    expect(font.titleSerif.fontFamily).toBe(tokens.font.family.serif.app.semibold);
  });
  it("소스에 fontWeight '700'/'bold' 하드코딩 없음", () => {
    expect(filesMatching(/fontWeight:\s*['"](700|800|900|bold)['"]/)).toEqual([]);
  });
  it('font.headline(명조 700)은 판정 블록(components/ui.tsx)에서만 쓴다', () => {
    expect(filesMatching(/font\.headline\b/)).toEqual(['src/components/ui.tsx']);
  });
  it('Pretendard-Bold 이름을 화면 코드가 직접 쓰지 않는다', () => {
    expect(filesMatching(/Pretendard-Bold|sans\.app\.bold|SANS\.bold/).filter((f) => f !== 'src/ux/theme.ts')).toEqual([]);
  });
  it('개발자 모드 글자(devFont: mono·700)는 ui.tsx의 Dev 부품과 DebugTable.tsx에만', () => {
    expect(filesMatching(/devFont\./)).toEqual(['src/components/ui.tsx', 'src/screens/DebugTable.tsx']);
  });
});

describe('선: 1px 기본, 2px는 유튜브 배지·개발 영역만, 카드 외곽선 없음 (§4.1, §5.3)', () => {
  it('border.strong / border.focus(2px)는 YoutubeScreen(배지)과 DebugTable(개발 영역)에만', () => {
    expect(border.strong).toBe(2);
    expect(filesMatching(/border\.(strong|focus)\b/)).toEqual(['src/screens/DebugTable.tsx', 'src/screens/YoutubeScreen.tsx']);
  });
  it('YoutubeScreen의 2px는 배지 한 곳뿐', () => {
    const yt = SOURCES.find((s) => s.f === 'src/screens/YoutubeScreen.tsx')!.src;
    expect(yt.match(/border\.(strong|focus)\b/g)).toHaveLength(1);
  });
  it('숫자 2 이상 테두리 두께 하드코딩은 개발 영역(DebugTable)에만', () => {
    expect(filesMatching(/[bB]order\w*Width:\s*([2-9]|\d{2,})\b/).filter((f) => f !== 'src/screens/DebugTable.tsx')).toEqual([]);
  });
  it('lineStrong(카드 외곽선)은 개발 카드에만', () => {
    expect(filesMatching(/color\.lineStrong\b/)).toEqual(['src/screens/DebugTable.tsx']);
  });
  it('판정 tint(색 면)는 화면에서 쓰지 않는다 (v2 예약값)', () => {
    expect(filesMatching(/\.tint\b/).filter((f) => f !== 'src/ux/theme.ts')).toEqual([]);
  });
  it('왼쪽 판정 띠(verdictStripe)를 쓰지 않는다', () => {
    expect(filesMatching(/verdictStripe/)).toEqual([]);
  });
});
