// design/tokens.json(디자인 시스템 원본) → app/src/ux/tokens.json 복사.
// Metro는 app/ 밖 파일을 번들하지 않으므로 복사본을 둔다. 손으로 고치지 않는다.
// 일치 여부는 __tests__/theme.test.ts가 확인한다 (어긋나면 테스트 실패 → `npm run tokens`).
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'design', 'tokens.json');
const dst = path.join(__dirname, '..', 'src', 'ux', 'tokens.json');
fs.copyFileSync(src, dst);
console.log(`copied ${path.relative(process.cwd(), src)} -> ${path.relative(process.cwd(), dst)}`);
