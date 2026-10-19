// theme.ts = design/tokens.json (디자인 시스템 #21). 값이 어긋나면 실패 → `npm run tokens`로 다시 복사.
import * as fs from 'fs';
import * as path from 'path';
import { VERDICTS } from '../src/api/contract';
import appTokens from '../src/ux/tokens.json';
import {
  border,
  color,
  dev,
  devFont,
  font,
  FONT_ASSETS,
  MAX_FONT_SCALE,
  radius,
  size,
  space,
  verdict,
  verdictIcon,
} from '../src/ux/theme';

const ROOT = path.join(__dirname, '..');
const designTokens = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'design', 'tokens.json'), 'utf8'));

describe('tokens.json 복사본 = design/tokens.json', () => {
  it('내용이 완전히 같다', () => {
    expect(appTokens).toEqual(designTokens);
  });
});

describe('theme.ts 값 = tokens.json', () => {
  it('기본 색', () => {
    expect(color).toEqual(designTokens.color);
  });
  it('판정 4종 main/tint/아이콘(outline)', () => {
    for (const v of VERDICTS) {
      expect(verdict[v].main).toBe(designTokens.verdict[v].main);
      expect(verdict[v].tint).toBe(designTokens.verdict[v].tint);
      expect(verdictIcon[v]).toBe(designTokens.verdict[v].icon.mci);
      expect(verdictIcon[v]).toMatch(/-outline$/);
    }
  });
  it('개발자 모드 색', () => {
    expect(dev).toEqual(designTokens.dev);
  });
  it('형태·크기·간격', () => {
    expect(radius).toEqual(designTokens.radius);
    expect(border).toEqual(designTokens.border);
    expect(size).toEqual(designTokens.size);
    expect(space.screenX).toBe(designTokens.space.screenX.app);
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'section', 'item', 'buttonGap'] as const) {
      expect(space[k]).toBe(designTokens.space[k]);
    }
    expect(MAX_FONT_SCALE).toBe(designTokens.font.maxFontScale);
  });
  it('글자 단계: 크기·행간·자간·글꼴(굵기는 family로)', () => {
    const fam = designTokens.font.family;
    for (const [k, t] of Object.entries<Record<string, string | number>>(designTokens.font.scale)) {
      const s = font[k as keyof typeof font];
      expect(s.fontSize).toBe(t.size);
      expect(s.lineHeight).toBe(t.lineHeight);
      if (t.letterSpacing !== undefined) expect(s.letterSpacing).toBe(t.letterSpacing);
      if (t.numeric === 'tabular-nums') expect(s.fontVariant).toEqual(['tabular-nums']);
      const expected =
        t.family === 'serif'
          ? fam.serif.app.bold
          : t.weight === '700'
            ? fam.sans.app.bold
            : t.weight === '600'
              ? fam.sans.app.semibold
              : fam.sans.app.regular;
      expect(s.fontFamily).toBe(expected);
      expect(s.fontWeight).toBeUndefined(); // 커스텀 폰트에 fontWeight 금지 (Android 가짜 볼드)
    }
    for (const [k, t] of Object.entries<Record<string, string | number>>(designTokens.font.dev)) {
      expect(devFont[k as keyof typeof devFont].fontSize).toBe(t.size);
    }
  });
  it('실사용자 글자는 16 이상, 명조는 24 이상 (§3.2)', () => {
    for (const [k, s] of Object.entries(font)) {
      if (k === 'eyebrow') continue; // 영문 대문자 라벨 전용
      expect({ k, ok: (s.fontSize ?? 0) >= 16 }).toEqual({ k, ok: true });
      if (s.fontFamily === designTokens.font.family.serif.app.bold) expect(s.fontSize).toBeGreaterThanOrEqual(24);
    }
  });
});

describe('글꼴 파일·라이선스', () => {
  it('FONT_ASSETS 키 = tokens 앱 글꼴 이름 4개, 파일과 OFL.txt 존재', () => {
    const fam = designTokens.font.family;
    expect(Object.keys(FONT_ASSETS).sort()).toEqual(
      [fam.sans.app.regular, fam.sans.app.semibold, fam.sans.app.bold, fam.serif.app.bold].sort(),
    );
    for (const f of ['Pretendard-Regular.otf', 'Pretendard-SemiBold.otf', 'Pretendard-Bold.otf', 'NotoSerifKR-Bold.otf', 'OFL.txt']) {
      expect(fs.existsSync(path.join(ROOT, 'assets', 'fonts', f))).toBe(true);
    }
    const ofl = fs.readFileSync(path.join(ROOT, 'assets', 'fonts', 'OFL.txt'), 'utf8');
    expect(ofl).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(ofl).toContain('Pretendard');
    expect(ofl).toContain('Noto Serif KR');
  });
  it('명조 서브셋은 2MB 이하 (전체 약 6MB → 약 1MB 목표)', () => {
    expect(fs.statSync(path.join(ROOT, 'assets', 'fonts', 'NotoSerifKR-Bold.otf')).size).toBeLessThan(2 * 1024 * 1024);
  });
});

describe('색은 tokens에서만', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
    });
  it('src/와 App.tsx에 #hex·rgba 색 상수가 없다 (tokens.json만 색을 갖는다)', () => {
    const files = [path.join(ROOT, 'App.tsx'), ...walk(path.join(ROOT, 'src'))];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const hit = src.match(/['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(/g);
      expect({ f: path.relative(ROOT, f), hit }).toEqual({ f: path.relative(ROOT, f), hit: null });
    }
  });
  it('그림자·elevation을 쓰지 않는다 (§4)', () => {
    const files = [path.join(ROOT, 'App.tsx'), ...walk(path.join(ROOT, 'src'))];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      expect({ f: path.relative(ROOT, f), hit: /shadow(Color|Opacity|Radius|Offset)|elevation:/.test(src) }).toEqual({
        f: path.relative(ROOT, f),
        hit: false,
      });
    }
  });
});
