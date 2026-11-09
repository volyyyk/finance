import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor Configuration for Native Android APK (Standalone WebView, No Chrome browser required)
 * Includes OTA (Over-The-Air) configuration for seamless live bundle updates.
 */
const config: CapacitorConfig = {
  appId: 'com.volyyyk.finance',
  appName: 'Финансы & Кешбэк',
  webDir: 'dist',
  server: {
    // Uses native Android WebView with internal https scheme — will NOT launch or rely on external Google Chrome
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0f172a',
  },
  plugins: {
    // OTA (Over-The-Air) Live Update configuration
    CapacitorUpdater: {
      autoUpdate: true,
      resetWhenUpdate: false,
      statsUrl: '',
      channel: 'production',
    },
  },
};

export default config;
