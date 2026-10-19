// jest 전용: expo-secure-store를 메모리 Map으로 흉내 낸다 (node_modules 옆 __mocks__는 자동 적용).
// 테스트에서 __store로 직접 들여다보거나 __reset()으로 비운다.
const store = new Map();

module.exports = {
  __esModule: true,
  __store: store,
  __reset: () => store.clear(),
  getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
  setItemAsync: jest.fn(async (k, v) => {
    store.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k) => {
    store.delete(k);
  }),
  isAvailableAsync: jest.fn(async () => true),
};
