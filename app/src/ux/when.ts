// 서버 시각(ISO 8601) → "10월 19일 오후 2:05" (올해가 아니면 "2025년 10월 19일 오후 2:05").
// 기기 시간대 기준. Intl에 기대지 않는다(Hermes·기종별 한국어 지원 차이). 읽을 수 없으면 빈 문자열.
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const date = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const year = d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}년 `;
  return `${year}${date} ${ampm} ${h12}:${mm}`;
}
