import * as fs from 'fs';
import * as path from 'path';
import { CONTRACT_ERROR_CODES, VERDICTS } from '../src/api/contract';
import { copy, errorButtonAction, errorCopyFor, fill } from '../src/ux/copy';

const APP_ONLY = ['network', 'timeout', 'unknown'];

describe('copy.ts ↔ 계약', () => {
  it('result.verdict 키 = 계약 verdict enum (정확히 4개)', () => {
    expect(Object.keys(copy.result.verdict).sort()).toEqual([...VERDICTS].sort());
  });

  it('error 키 = 계약 code 7개 + 앱 전용 3개 (+ homeButton)', () => {
    const keys = Object.keys(copy.error).filter((k) => k !== 'homeButton').sort();
    expect(keys).toEqual([...CONTRACT_ERROR_CODES, ...APP_ONLY].sort());
  });

  it.each([...CONTRACT_ERROR_CODES, ...APP_ONLY])('에러 code %s → 문구 매핑 누락 없음', (code) => {
    const c = errorCopyFor(code);
    expect(c.code).toBe(code);
    expect(c.title.length).toBeGreaterThan(0);
    expect(c.body.length).toBeGreaterThan(0);
    expect(c.button.length).toBeGreaterThan(0);
  });

  it('모르는 code / homeButton → error.unknown 폴백', () => {
    expect(errorCopyFor('something_new')).toEqual({ ...copy.error.unknown, code: 'unknown' });
    expect(errorCopyFor('homeButton').code).toBe('unknown');
    expect(errorCopyFor('').code).toBe('unknown');
  });

  it('주 버튼 동작: 다시 붙여넣기/처음으로 → home, 다시 해보기 → retry', () => {
    expect(errorButtonAction(errorCopyFor('invalid_url').button)).toBe('home');
    expect(errorButtonAction(errorCopyFor('video_unavailable').button)).toBe('home');
    expect(errorButtonAction(errorCopyFor('file_too_large').button)).toBe('home');
    // invalid_file: 같은 파일 재시도는 의미 없으므로 처음으로 (v1.1)
    expect(errorButtonAction(errorCopyFor('invalid_file').button)).toBe('home');
    expect(errorButtonAction(errorCopyFor('network').button)).toBe('retry');
    expect(errorButtonAction(errorCopyFor('timeout').button)).toBe('retry');
    expect(errorButtonAction(errorCopyFor('detectors_down').button)).toBe('retry');
  });
});

describe('금지어 (UX 명세 §7-7)', () => {
  const FORBIDDEN = ['가짜', '조작', '딥페이크', '슬롭', '분석', '확률', '속으', '진짜예요'];
  const all: string[] = [];
  const walk = (o: unknown) => {
    if (typeof o === 'string') all.push(o);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  };
  walk(copy);
  it.each(FORBIDDEN)('"%s" 미포함', (w) => {
    expect(all.filter((s) => s.includes(w))).toEqual([]);
  });
});

describe('verdict 재계산 금지 (UX 명세 §7-3)', () => {
  it('앱 소스에 확률 구간 경계값/비교가 없다', () => {
    const files = ['App.tsx', ...['api', 'ux', 'screens', 'components'].flatMap((d) =>
      fs.readdirSync(path.join(__dirname, '../src', d)).map((f) => path.join('src', d, f)),
    )];
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      expect({ f, hit: /ai_probability\s*[<>]=?|0\.75|0\.40?\b/.test(src) }).toEqual({ f, hit: false });
    }
  });
});

describe('fill', () => {
  it('자리표시자 치환, 모르는 키는 그대로', () => {
    expect(fill('AI 가능성 {pct}%', { pct: 87 })).toBe('AI 가능성 87%');
    expect(fill('{a}{b}', { a: 1 })).toBe('1{b}');
  });
});

describe('D1 linkOnly 문구', () => {
  it('버튼 이름 = 홈 업로드 버튼 (같은 흐름)', () => {
    expect(copy.result.linkOnly.uploadButton).toBe(copy.home.uploadButton);
  });
  it('헤드라인 25자 안팎, 다시 시도 문구 없음', () => {
    expect(copy.result.linkOnly.headline.length).toBeLessThanOrEqual(27);
    Object.values(copy.result.linkOnly).forEach((t) => expect(t).not.toContain('다시 시도'));
  });
});
