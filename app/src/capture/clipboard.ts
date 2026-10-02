// 복사만 해도 확인 (#12, mobile-capture 스킬 "복사만 해도 탐지"):
// 앱이 앞으로 올 때 클립보드 "내용은 읽지 않고" 링크가 있을 법한지만 본다.
// 내용을 읽으면 iOS 16+는 붙여넣기 허용 팝업, Android 12+는 화면 알림이 뜨므로,
// 실제로 읽는 건 사용자가 [붙여넣기]를 누를 때뿐이다 (HomeScreen.onPaste).
//   iOS     UIPasteboard.hasURLs — 주소 항목이 있을 때만 true (팝업 없음)
//   Android ClipDescription.hasTextContent — 글이 있으면 true, 주소인지는 모름 (알림 없음)
//   웹      브라우저가 권한을 물으므로 확인하지 않는다
import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

export async function clipboardMayHaveLink(os: string = Platform.OS): Promise<boolean> {
  try {
    if (os === 'ios') return await Clipboard.hasUrlAsync();
    if (os === 'android') return await Clipboard.hasStringAsync();
  } catch {
    // 확인에 실패하면 안내를 띄우지 않는 것으로 충분하다
  }
  return false;
}
