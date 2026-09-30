// 개발 모드 플래그. EXPO_PUBLIC_DEBUG=1 일 때만 on (기본 off). 번들 시점에 들어간다.
// on이면 결과 화면의 [자세히 보기]가 기본 펼침 + 신호별 원시 표(계약 v1.3 signals[].debug)를 보여준다.
// 서버도 JJAJJA_DEBUG=1 이어야 debug.reason/raw가 채워진다 (없으면 표에 '-').
export const DEBUG_MODE: boolean = process.env.EXPO_PUBLIC_DEBUG === '1';
