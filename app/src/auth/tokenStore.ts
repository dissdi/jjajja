// 로그인 토큰 저장소 (계약 v2.0 "토큰": 앱은 기기 보안 저장소).
// - 휴대폰(iOS/Android, Expo Go 포함): expo-secure-store (키체인 / Keystore)
// - 웹: expo-secure-store가 없으므로 localStorage로 대신한다(브라우저 안에서만 유지). 막혀 있으면 메모리.
// 토큰은 로그·URL·화면에 남기지 않는다.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const TOKEN_KEY = 'jjajja.auth.token';

let memory: string | null = null;

function webStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

export async function readToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      const ls = webStorage();
      return ls ? ls.getItem(TOKEN_KEY) : memory;
    }
    return (await SecureStore.getItemAsync(TOKEN_KEY)) ?? null;
  } catch {
    return memory;
  }
}

export async function writeToken(token: string): Promise<void> {
  memory = token;
  try {
    if (Platform.OS === 'web') {
      webStorage()?.setItem(TOKEN_KEY, token);
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // 저장 실패 → 이번 실행 동안만 메모리로 유지 (다음 실행 때 다시 로그인)
  }
}

export async function deleteToken(): Promise<void> {
  memory = null;
  try {
    if (Platform.OS === 'web') {
      webStorage()?.removeItem(TOKEN_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // 이미 없음
  }
}
