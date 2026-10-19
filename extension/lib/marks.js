// 판정 마크 안의 아이콘(인라인 SVG, 24 viewBox, 선 1.75 — v2 가는 선). 도장 테두리는 CSS(.mark)가 그린다.
// 모양: likely_ai 삼각형+느낌표 / uncertain 물음표 / likely_real 체크 / unknown 가로줄 (design-system.md §2.2)
const NS = 'http://www.w3.org/2000/svg';

export const MARK_PATHS = {
  likely_ai: [
    { d: 'M12 3.5 L21.5 20 H2.5 Z', fill: 'none' },
    { d: 'M12 9.5 V14' },
    { d: 'M12 16.6 V17.2' },
  ],
  uncertain: [{ d: 'M8.8 9.2 a3.3 3.3 0 1 1 4.9 2.9 c-1.1 .6 -1.7 1.3 -1.7 2.5 V15' }, { d: 'M12 18 V18.6' }],
  likely_real: [{ d: 'M5.5 12.5 L10 17 L18.5 7.5' }],
  unknown: [{ d: 'M6.5 12 H17.5' }],
};
export const INFO_PATHS = [{ d: 'M12 2.8 a9.2 9.2 0 1 0 0.01 0 Z' }, { d: 'M12 10.5 V17' }, { d: 'M12 7 V7.6' }];

/** @param {Document} doc @param {Array<{d: string}>} paths */
export function svgIcon(doc, paths) {
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const p of paths) {
    const el = doc.createElementNS(NS, 'path');
    el.setAttribute('d', p.d);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '1.75');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(el);
  }
  return svg;
}

/**
 * 판정 마크(도장) 요소. 스크린리더에서는 숨기고 헤드라인이 읽히게 한다.
 * bare: 도장 테두리 없이 아이콘 20만(기록 목록, design-system.md §6.7)
 */
export function markElement(doc, verdict, { bare = false } = {}) {
  const v = MARK_PATHS[verdict] ? verdict : 'unknown';
  const box = doc.createElement('div');
  box.className = `mark v-${v}${bare ? ' bare' : ''}`;
  box.setAttribute('aria-hidden', 'true');
  box.appendChild(svgIcon(doc, MARK_PATHS[v]));
  return box;
}
