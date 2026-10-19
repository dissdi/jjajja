#!/usr/bin/env node
// design/tokens.json → extension/tokens.css (CSS 변수). 빌드 도구 없이 쓰려고 결과를 커밋한다.
// 실행: node extension/tools/gen-tokens.mjs        (파일을 다시 쓴다)
//       node extension/tools/gen-tokens.mjs --check (커밋된 파일과 다르면 exit 1)
// 테스트(test/tokens.test.js)가 커밋된 tokens.css 와 이 함수 결과가 같은지 확인한다.
// 변수 이름은 design-system.md §8.2 를 따르고, 거기 없는 토큰은 같은 규칙으로 늘렸다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOKENS_PATH = resolve(HERE, '../../design/tokens.json');
export const CSS_PATH = resolve(HERE, '../tokens.css');

const COLOR_VARS = {
  paper: 'paper',
  surface: 'surface',
  sunken: 'sunken',
  line: 'line',
  lineStrong: 'line-strong',
  ink: 'ink',
  inkSecondary: 'ink-2',
  inkTertiary: 'ink-3',
  onInk: 'on-ink',
  inkPressed: 'ink-pressed',
  accent: 'accent',
  focus: 'focus',
  disabledBg: 'disabled-bg',
  disabledFg: 'disabled-fg',
  scrim: 'scrim',
};
const VERDICT_VARS = { likely_ai: 'ai', uncertain: 'unc', likely_real: 'real', unknown: 'unk' };
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const px = (n) => (n === 0 ? '0' : `${n}px`);

/** @param {object} t tokens.json 내용 @returns {string} tokens.css 내용 */
export function renderTokensCss(t) {
  const out = [];
  const v = (name, value) => out.push(`  --${name}: ${value};`);
  out.push('/* 자동 생성 파일 — 직접 고치지 마세요. */');
  out.push(`/* source: design/tokens.json (${t.meta.name} v${t.meta.version}, ${t.meta.mode}) */`);
  out.push('/* 다시 만들기: node extension/tools/gen-tokens.mjs */');
  out.push(':root {');
  out.push('  color-scheme: light;');

  out.push('  /* color */');
  for (const [k, name] of Object.entries(COLOR_VARS)) {
    if (!(k in t.color)) throw new Error(`tokens.color.${k} 없음`);
    v(name, t.color[k]);
  }

  out.push('  /* verdict */');
  for (const [k, short] of Object.entries(VERDICT_VARS)) {
    v(`v-${short}`, t.verdict[k].main);
    v(`v-${short}-tint`, t.verdict[k].tint);
  }

  out.push('  /* dev */');
  for (const [k, val] of Object.entries(t.dev)) v(`dev-${kebab(k)}`, val);

  out.push('  /* font family (web) */');
  for (const k of ['sans', 'serif', 'mono']) v(`font-${k}`, t.font.family[k].web);

  out.push('  /* font scale (확장 override 적용) */');
  const scale = t.font.scale;
  const over = t.font.extensionOverride || {};
  for (const [k, s0] of Object.entries(scale)) {
    const s = { ...s0, ...(over[k] || {}) };
    const n = kebab(k);
    v(`fs-${n}`, px(s.size));
    v(`lh-${n}`, px(s.lineHeight));
    v(`fw-${n}`, s.weight);
    if (s.letterSpacing !== undefined) v(`ls-${n}`, px(s.letterSpacing));
  }
  for (const [k, s] of Object.entries(t.font.dev)) {
    const n = `dev-${kebab(k)}`;
    v(`fs-${n}`, px(s.size));
    v(`lh-${n}`, px(s.lineHeight));
    v(`fw-${n}`, s.weight);
    if (s.letterSpacing !== undefined) v(`ls-${n}`, px(s.letterSpacing));
  }

  out.push('  /* space */');
  for (const [k, val] of Object.entries(t.space)) {
    if (typeof val === 'number') v(`sp-${k}`, px(val));
  }
  v('sp-screen-x', px(t.space.screenX.extension));
  for (const k of ['section', 'item', 'buttonGap']) v(`sp-${kebab(k)}`, px(t.space[k]));

  out.push('  /* radius */');
  for (const [k, val] of Object.entries(t.radius)) v(`r-${k}`, px(val));

  out.push('  /* border width */');
  for (const [k, val] of Object.entries(t.border)) v(`bw-${kebab(k)}`, px(val));

  out.push('  /* size */');
  for (const [k, val] of Object.entries(t.size)) {
    if (typeof val === 'number') v(`size-${kebab(k)}`, px(val));
    else for (const [k2, val2] of Object.entries(val)) v(`size-${kebab(k)}-${kebab(k2)}`, px(val2));
  }

  out.push('  /* motion */');
  const ib = t.motion.inkBloom;
  v('motion-ink-bloom-duration', `${ib.durationMs}ms`);
  v('motion-ink-bloom-easing', ib.easing);
  v('motion-ink-bloom-scale-from', ib.scaleFrom);
  v('motion-ink-bloom-scale-to', ib.scaleTo);
  v('motion-ink-bloom-opacity-from', ib.opacityFrom);
  v('motion-ink-bloom-opacity-to', ib.opacityTo);
  v('motion-press-duration', `${t.motion.press.durationMs}ms`);
  out.push('}');

  out.push('');
  out.push('/* 판정 클래스: contract verdict 이름 그대로. 블록·마크는 var(--v-main)/var(--v-tint) 를 쓴다 */');
  for (const [k, short] of Object.entries(VERDICT_VARS)) {
    out.push(`.v-${k} { --v-main: var(--v-${short}); --v-tint: var(--v-${short}-tint); }`);
  }
  return out.join('\n') + '\n';
}

export function loadTokens(path = TOKENS_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const css = renderTokensCss(loadTokens());
  if (process.argv.includes('--check')) {
    const cur = readFileSync(CSS_PATH, 'utf8');
    if (cur !== css) {
      console.error('tokens.css 가 design/tokens.json 과 다릅니다. node extension/tools/gen-tokens.mjs 로 다시 만드세요.');
      process.exit(1);
    }
    console.log('tokens.css OK');
  } else {
    writeFileSync(CSS_PATH, css);
    console.log(`wrote ${CSS_PATH}`);
  }
}
