import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'myApp',
  webDir: 'www',
  plugins: {
    Keyboard: {
      resize: 'body',
      style: 'dark',
    },
  },
};

export default config;
