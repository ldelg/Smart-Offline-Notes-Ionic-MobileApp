import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ldelg.smartofflinenotes',
  appName: 'SmartNotes',
  webDir: 'www',
  android: {
    // API 35+ is edge-to-edge. API 36 ignores the old opt-out attribute.
    // auto insets the WebView on those releases and leaves older ones alone.
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0d0d0d',
    },
    // MainActivity handles predictive back. This callback would swallow the
    // gesture on the root screen, so the system could not close the app.
    App: {
      disableBackButtonHandler: true,
    },
  },
};

export default config;
