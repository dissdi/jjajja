// 로그인 상태 (메모리 사본 + 보안 저장소). React와 무관한 모듈 — api/client가 헤더를 붙일 때 쓴다.
// 401 unauthorized를 받으면 client가 expire()를 부르고, App은 onExpired로 로그인 화면으로 보낸다 (계약 v2.0).
import { deleteToken, readToken, writeToken } from './tokenStore';

let token: string | null = null;
const listeners = new Set<() => void>();

/** 앱 시작 때 한 번: 저장된 토큰을 읽어 메모리에 올린다 */
export async function restoreSession(): Promise<string | null> {
  token = await readToken();
  return token;
}

export function getToken(): string | null {
  return token;
}

export async function signIn(t: string): Promise<void> {
  token = t;
  await writeToken(t);
}

/** 사용자가 로그아웃 — 알림 없이 지운다 */
export async function signOut(): Promise<void> {
  token = null;
  await deleteToken();
}

/** 서버가 401 unauthorized — 토큰을 지우고 듣는 쪽(App)에 알린다 */
export function expire(): void {
  token = null;
  void deleteToken();
  listeners.forEach((l) => l());
}

export function onExpired(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** 테스트 전용 */
export function __setTokenForTest(t: string | null): void {
  token = t;
}
