import * as Clipboard from 'expo-clipboard';
import { clipboardMayHaveLink } from '../src/capture/clipboard';

jest.mock('expo-clipboard', () => ({
  hasUrlAsync: jest.fn(),
  hasStringAsync: jest.fn(),
  getStringAsync: jest.fn(),
  getUrlAsync: jest.fn(),
}));

const m = Clipboard as jest.Mocked<typeof Clipboard>;

beforeEach(() => jest.clearAllMocks());

describe('clipboardMayHaveLink (#12) — 내용은 읽지 않는다', () => {
  afterEach(() => {
    // 팝업(iOS)·알림(Android)이 뜨는 읽기 함수는 어떤 경우에도 부르지 않는다
    expect(m.getStringAsync).not.toHaveBeenCalled();
    expect(m.getUrlAsync).not.toHaveBeenCalled();
  });

  it.each([true, false])('iOS: hasUrlAsync=%s 그대로', async (v) => {
    m.hasUrlAsync.mockResolvedValue(v);
    await expect(clipboardMayHaveLink('ios')).resolves.toBe(v);
    expect(m.hasStringAsync).not.toHaveBeenCalled();
  });

  it.each([true, false])('Android: hasStringAsync=%s 그대로', async (v) => {
    m.hasStringAsync.mockResolvedValue(v);
    await expect(clipboardMayHaveLink('android')).resolves.toBe(v);
    expect(m.hasUrlAsync).not.toHaveBeenCalled();
  });

  it('웹 등 그 밖의 플랫폼: 확인하지 않고 false', async () => {
    await expect(clipboardMayHaveLink('web')).resolves.toBe(false);
    expect(m.hasUrlAsync).not.toHaveBeenCalled();
    expect(m.hasStringAsync).not.toHaveBeenCalled();
  });

  it('확인 실패 → false (예외를 밖으로 내보내지 않음)', async () => {
    m.hasUrlAsync.mockRejectedValue(new Error('denied'));
    await expect(clipboardMayHaveLink('ios')).resolves.toBe(false);
  });
});
