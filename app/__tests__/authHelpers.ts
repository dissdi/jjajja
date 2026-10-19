// 테스트 도우미: 로그인된 상태(보안 저장소에 토큰)로 App을 시작하게 한다. (__mocks__/expo-secure-store.js)
import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEY } from '../src/auth/tokenStore';

type MockStore = typeof SecureStore & { __store: Map<string, string>; __reset: () => void };
const mock = SecureStore as MockStore;

export const TEST_TOKEN = 'test-token-abc';

export function seedLoggedIn(token = TEST_TOKEN): void {
  mock.__reset();
  mock.__store.set(TOKEN_KEY, token);
}

export function seedLoggedOut(): void {
  mock.__reset();
}

export function storedToken(): string | null {
  return mock.__store.get(TOKEN_KEY) ?? null;
}
