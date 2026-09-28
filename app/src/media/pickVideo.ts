// 휴대폰에 저장된 영상 고르기 — S1 홈과 S3 결과(D1: 주소만으로는 확인이 어려운 경우)가 같은 흐름을 쓴다.
// 고른 영상은 호출한 쪽이 onSubmitVideo → App.run({ kind: 'upload' }) 로 넘긴다.
import * as ImagePicker from 'expo-image-picker';
import type { PickedVideo } from '../api/client';

export type PickOutcome = { kind: 'picked'; video: PickedVideo } | { kind: 'cancelled' } | { kind: 'failed' };

export async function pickVideo(): Promise<PickOutcome> {
  let res: ImagePicker.ImagePickerResult;
  try {
    res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    });
  } catch {
    return { kind: 'failed' };
  }
  if (res.canceled || !res.assets?.[0]) return { kind: 'cancelled' }; // 사용자가 닫음 → 아무 일 없음
  const a = res.assets[0];
  return {
    kind: 'picked',
    video: {
      uri: a.uri,
      name: a.fileName ?? 'video.mp4',
      mimeType: a.mimeType ?? 'video/mp4',
      file: a.file,
      sizeBytes: typeof a.fileSize === 'number' ? a.fileSize : undefined,
      durationMs: typeof a.duration === 'number' ? a.duration : undefined,
    },
  };
}
