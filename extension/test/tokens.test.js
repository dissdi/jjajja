// 디자인 토큰·글꼴·스타일 규칙 (design-system.md §8.3 동기화, §9 하지 말 것)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSS_PATH, loadTokens, renderTokensCss } from '../tools/gen-tokens.mjs';

const EXT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(EXT, p), 'utf8');
const tokens = loadTokens();

test('커밋된 tokens.css 가 design/tokens.json 에서 생성한 결과와 같다', () => {
  assert.equal(readFileSync(CSS_PATH, 'utf8'), renderTokensCss(tokens), 'node extension/tools/gen-tokens.mjs 로 다시 만드세요');
});

test('tokens.json 의 색 hex 가 tokens.css 에 모두 있다', () => {
  const css = read('tokens.css');
  const hexes = [
    ...Object.values(tokens.color),
    ...Object.values(tokens.verdict).map((v) => v.main), // tint 는 v2 예약값 — CSS 로 내보내지 않음
    ...Object.values(tokens.dev),
  ];
  for (const h of hexes) assert.ok(css.includes(`: ${h};`), h);
  assert.match(css, /--fs-headline: 24px;/, '확장 override(헤드라인 24) 적용');
  assert.match(css, /--fs-body: 18px;/);
  assert.match(css, /--line-ui: #857D70;/, 'v2 lineUi');
  assert.match(css, /--size-button-min-height-ext: 44px;/, '확장 주 버튼 44');
  assert.match(css, /--fs-button: 16px;/, '확장 버튼 글자 16');
  assert.match(css, /--fw-button: 600;/);
  assert.match(css, /--r-button: 8px;/);
  assert.match(css, /--sp-screen-x: 20px;/, '확장 좌우 20');
  assert.equal(/-tint:/.test(css.replace('--dev-fail-tint', '')), false, '판정 tint 변수 없음(v2 면 없음)');
});

test('스타일 규칙: 라이트 전용·그림자 없음·tokens 밖의 hex 없음', () => {
  for (const f of ['ui.css', 'popup.css', 'fonts.css', 'options.html', 'popup.html']) {
    const s = read(f);
    assert.equal(/prefers-color-scheme/.test(s), false, `${f}: 다크 모드 블록 금지(A1)`);
    assert.equal(/box-shadow/.test(s), false, `${f}: 그림자 금지`);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(s.replace(/href="#[^"]*"/g, '')), false, `${f}: 색은 tokens.css 변수로만`);
  }
});

// CSS 규칙 목록 [{ sel, body }] — 주석 제거, @media 안쪽도 평탄화
function cssRules(src) {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  for (const m of s.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ sel: m[1].trim().replace(/^@media[^{]*/, '').trim(), body: m[2] });
  return out;
}
const styleOf = (f) => {
  const s = read(f);
  return f.endsWith('.html') ? [...s.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n') : s;
};
const USER_CSS = ['ui.css', 'popup.css', 'options.html'];
const DEV_SEL = /dev|\.bar\b|\.bar[ .>:-]|bar-/;

test('v2: 700 굵기는 판정 헤드라인(과 개발자 영역)에만', () => {
  for (const f of USER_CSS) {
    for (const { sel, body } of cssRules(styleOf(f))) {
      if (!/font-weight:\s*(700|bold|var\(--fw-headline\))/.test(body)) continue;
      assert.ok(sel === '.verdict-block .headline' || DEV_SEL.test(sel), `${f}: "${sel}" 에 700`);
    }
  }
  const css = read('tokens.css');
  for (const k of ['display', 'title', 'subhead', 'button', 'eyebrow', 'body-strong', 'figure']) {
    assert.doesNotMatch(css, new RegExp(`--fw-${k}: 700;`), `--fw-${k}`);
  }
});

test('v2: 2px 선은 포커스 링·개발 영역만, 카드 외곽선·판정 면/띠 없음', () => {
  for (const f of USER_CSS) {
    for (const { sel, body } of cssRules(styleOf(f))) {
      for (const m of body.matchAll(/(border[\w-]*|outline)\s*:\s*([^;]+)/g)) {
        const [, prop, val] = m;
        if (!/(\b2px\b|--bw-strong|--bw-focus|\b3px\b)/.test(val)) continue;
        const ok = (prop === 'outline' && /--bw-focus/.test(val)) || DEV_SEL.test(sel);
        assert.ok(ok, `${f}: "${sel}" ${prop}: ${val}`);
      }
      assert.equal(/--v-tint|--bw-verdict-stripe|--line-strong/.test(body), false, `${f}: "${sel}" v1 토큰`);
    }
  }
  const ui = cssRules(read('ui.css'));
  const vb = ui.find((r) => r.sel === '.verdict-block');
  assert.match(vb.body, /border-top:\s*var\(--bw-verdict-line\) solid var\(--v-main\)/, '판정 블록 위 1px 판정색 선');
  assert.equal(/background/.test(vb.body), false, '판정 블록 면 없음');
  assert.equal(ui.some((r) => r.sel === '.card'), false, '카드 외곽선 부품 없음');
});

test('v2: 버튼 — 주 44·내용 폭(최대 400)·모서리 8, 보조는 1px lineUi 선 버튼(글자 폭)', () => {
  const ui = cssRules(read('ui.css'));
  const get = (sel) => ui.filter((r) => r.sel === sel).map((r) => r.body).join(';');
  assert.match(get('.btn'), /min-height:\s*var\(--size-button-min-height-ext\)/);
  assert.match(get('.btn'), /border-radius:\s*var\(--r-button\)/);
  assert.match(get('.btn-primary'), /max-width:\s*var\(--size-button-max-width\)/);
  assert.match(get('.btn-secondary'), /border:\s*var\(--bw-hair\) solid var\(--line-ui\)/);
  assert.match(get('.btn-secondary'), /width:\s*fit-content/);
  assert.doesNotMatch(get('.btn-secondary'), /width:\s*100%/);
  assert.match(get('.input'), /border:\s*var\(--bw-hair\) solid var\(--line-ui\)/, '입력칸 경계는 lineUi(3:1)');
});

test('v2: 화면마다 주 버튼은 하나', () => {
  const html = read('popup.html');
  for (const m of html.matchAll(/<section id="(\w+)"[\s\S]*?<\/section>/g)) {
    const n = (m[0].match(/btn-primary/g) || []).length;
    assert.ok(n <= 1, `#${m[1]}: 주 버튼 ${n}개`);
  }
  assert.equal((read('options.html').match(/class="btn btn-primary"/g) || []).length, 1, '옵션 페이지 주 버튼 1개');
  assert.equal(/class="rule"/.test(html.match(/id="verdict-block"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? ''), false, '판정 블록에 괘선 없음');
});

test('글꼴: 패키지 안 woff2, 원격 로드 없음, OFL 동봉', () => {
  const fonts = read('fonts.css');
  assert.equal(/https?:\/\//.test(fonts), false, '원격 글꼴 금지');
  const urls = [...fonts.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(urls.sort(), [
    'fonts/NotoSerifKR-Bold.subset.woff2',
    'fonts/NotoSerifKR-SemiBold.subset.woff2',
    'fonts/Pretendard-Bold.woff2',
    'fonts/Pretendard-Regular.woff2',
    'fonts/Pretendard-SemiBold.woff2',
  ]);
  for (const u of urls) {
    const p = resolve(EXT, u);
    assert.ok(existsSync(p), u);
    assert.equal(readFileSync(p).subarray(0, 4).toString('latin1'), 'wOF2', `${u}: woff2`);
  }
  for (const w of ['Bold', 'SemiBold']) {
    assert.ok(statSync(resolve(EXT, `fonts/NotoSerifKR-${w}.subset.woff2`)).size < 1_000_000, `명조 ${w} 서브셋 1MB 미만`);
  }
  const ofl = read('fonts/OFL.txt');
  assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(ofl, /Pretendard/);
  assert.match(ofl, /Noto Serif KR/);
  for (const html of ['popup.html', 'options.html']) {
    const s = read(html);
    assert.equal(/<link[^>]+href="https?:/.test(s), false, `${html}: 원격 스타일 금지`);
    assert.ok(s.indexOf('fonts.css') < s.indexOf('tokens.css') && s.indexOf('tokens.css') < s.indexOf('ui.css'), html);
  }
});

test('매니페스트: 아이콘 파일 존재, 권한 최소', () => {
  const m = JSON.parse(read('manifest.json'));
  const icons = [...Object.values(m.icons), ...Object.values(m.action.default_icon)];
  for (const i of icons) assert.ok(existsSync(resolve(EXT, i)), i);
  for (const s of ['16', '32', '48', '128']) assert.ok(existsSync(resolve(EXT, `icons/inactive-${s}.png`)));
  assert.deepEqual(m.permissions, ['storage']);
  assert.equal(m.content_security_policy, undefined, '기본 CSP 유지(원격 스크립트·글꼴 없음)');
});
