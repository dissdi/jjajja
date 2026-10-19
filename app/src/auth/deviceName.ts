// 로그인할 때 서버에 보내는 기기 이름 (계약 v2.0 login/signup `device_name`).
// 계정 화면의 "로그인된 기기" 목록에 그대로 보이므로 쉬운 말로: "Android 앱 (Galaxy S24)", "iPhone 앱", "웹 브라우저".
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export function deviceNameFor(os: string, modelName: string | null | undefined, isTablet = false): string {
  const base =
    os === 'android' ? 'Android 앱' : os === 'ios' ? (isTablet ? 'iPad 앱' : 'iPhone 앱') : '웹 브라우저';
  const model = (modelName ?? '').trim();
  if (os === 'web' || !model || model === base) return base;
  return `${base} (${model})`.slice(0, 60);
}

export function currentDeviceName(): string {
  let model: string | null = null;
  let tablet = false;
  try {
    model = Device.modelName ?? null;
    tablet = Device.deviceType === Device.DeviceType.TABLET;
  } catch {
    // 모듈 없음 → 플랫폼 이름만
  }
  return deviceNameFor(Platform.OS, model, tablet);
}
