import type { PickedVideo } from '../api/client';

/** YoutubeScreen(.tsx / .web.tsx) 공통 props */
export interface YoutubeScreenProps {
  /** 앱 홈으로 나가기 */
  onExit: () => void;
  /** 결과가 '주소만으로는 확인이 어려워요'(D1)일 때 저장한 영상으로 확인 — App의 업로드 흐름으로 넘긴다 */
  onSubmitVideo: (video: PickedVideo) => void;
}

/** 시작 주소. 쇼츠 피드로 바로 들어간다 (유튜브가 /shorts/<id>로 바꿔 준다) */
export const YOUTUBE_START_URL = 'https://m.youtube.com/shorts';
