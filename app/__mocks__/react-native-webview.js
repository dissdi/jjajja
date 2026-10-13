// jest 전용: react-native-webview는 네이티브 모듈이 없으면 import 시점에 터진다.
// node_modules 옆 __mocks__는 jest가 자동 적용한다. 개별 테스트는 jest.mock으로 덮어쓸 수 있다.
const React = require('react');
const { View } = require('react-native');

const WebView = React.forwardRef(function WebView(props, ref) {
  React.useImperativeHandle(ref, () => ({ goBack() {}, goForward() {}, reload() {}, stopLoading() {}, injectJavaScript() {} }));
  return React.createElement(View, { testID: props.testID });
});

module.exports = { __esModule: true, WebView, default: WebView };
