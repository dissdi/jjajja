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
    ...Object.values(tokens.verdict).flatMap((v) => [v.main, v.tint]),
    ...Object.values(tokens.dev),
  ];
  for (const h of hexes) assert.ok(css.includes(`: ${h};`), h);
  assert.match(css, /--fs-headline: 24px;/, '확장 override(헤드라인 24) 적용');
  assert.match(css, /--fs-body: 18px;/);
});

test('스타일 규칙: 라이트 전용·그림자 없음·tokens 밖의 hex 없음', () => {
  for (const f of ['ui.css', 'popup.css', 'fonts.css', 'options.html', 'popup.html']) {
    const s = read(f);
    assert.equal(/prefers-color-scheme/.test(s), false, `${f}: 다크 모드 블록 금지(A1)`);
    assert.equal(/box-shadow/.test(s), false, `${f}: 그림자 금지`);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(s.replace(/href="#[^"]*"/g, '')), false, `${f}: 색은 tokens.css 변수로만`);
  }
});

test('글꼴: 패키지 안 woff2, 원격 로드 없음, OFL 동봉', () => {
  const fonts = read('fonts.css');
  assert.equal(/https?:\/\//.test(fonts), false, '원격 글꼴 금지');
  const urls = [...fonts.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(urls.sort(), [
    'fonts/NotoSerifKR-Bold.subset.woff2',
    'fonts/Pretendard-Bold.woff2',
    'fonts/Pretendard-Regular.woff2',
    'fonts/Pretendard-SemiBold.woff2',
  ]);
  for (const u of urls) {
    const p = resolve(EXT, u);
    assert.ok(existsSync(p), u);
    assert.equal(readFileSync(p).subarray(0, 4).toString('latin1'), 'wOF2', `${u}: woff2`);
  }
  assert.ok(statSync(resolve(EXT, 'fonts/NotoSerifKR-Bold.subset.woff2')).size < 1_000_000, '명조 서브셋 1MB 미만');
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
