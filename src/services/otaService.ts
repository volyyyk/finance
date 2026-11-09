import { Capacitor } from '@capacitor/core';

export interface OTAManifest {
  version: string;
  build: number;
  releaseDate: string;
  checksum: string;
  channel: 'production' | 'staging' | 'dev';
  changelog: string[];
  mandatory: boolean;
  downloadUrl?: string;
  sizeBytes: number;
}

export interface OTAStatus {
  isNative: boolean;
  platform: string;
  appVersion: string;
  bundleVersion: string;
  channel: 'production' | 'staging' | 'dev';
  lastChecked: string | null;
  pendingUpdate: OTAManifest | null;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
}

const OTA_KEY_CHANNEL = 'fin_ota_channel';
const OTA_KEY_APPLIED = 'fin_ota_applied_bundle';

export const OTAService = {
  getAppVersion(): string {
    return '1.0.0';
  },

  getBundleVersion(): string {
    return localStorage.getItem(OTA_KEY_APPLIED) || '2026.11.09-r1';
  },

  getChannel(): 'production' | 'staging' | 'dev' {
    const ch = localStorage.getItem(OTA_KEY_CHANNEL);
    if (ch === 'staging' || ch === 'dev') return ch;
    return 'production';
  },

  setChannel(ch: 'production' | 'staging' | 'dev') {
    localStorage.setItem(OTA_KEY_CHANNEL, ch);
  },

  isNativeAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  },

  getPlatformInfo() {
    return {
      isNative: Capacitor.isNativePlatform(),
      platform: Capacitor.getPlatform(),
      mode: Capacitor.isNativePlatform() ? 'Native Standalone WebView (APK)' : 'Web PWA (Browser/Homescreen)',
      noChromeRequired: true,
      scheme: 'https://',
      appId: 'com.volyyyk.finance'
    };
  },

  async checkForUpdates(currentBundle: string, channel: 'production' | 'staging' | 'dev'): Promise<OTAManifest | null> {
    // Simulated remote OTA registry check
    await new Promise(r => setTimeout(r, 900));

    // Staging or higher versions available
    const availableUpdates: Record<string, OTAManifest> = {
      production: {
        version: '1.0.1',
        build: 101,
        releaseDate: '2026-11-09T18:00:00Z',
        checksum: 'sha256-a9f83e27cb099182',
        channel: 'production',
        sizeBytes: 1420500,
        mandatory: false,
        changelog: [
          '3 сворачиваемых списка кешбэка с контрастной подсветкой (светлая/тёмная темы)',
          'JS-оптимизации: мгновенная мемоизация расчётов и плавная отрисовка графиков',
          'Capacitor Standalone Native APK без внешнего браузера Chrome',
          'Поддержка прямых OTA (Over-The-Air) обновлений бандла'
        ]
      },
      staging: {
        version: '1.0.2-beta.3',
        build: 102,
        releaseDate: '2026-11-09T20:30:00Z',
        checksum: 'sha256-ff712b308e539ac1',
        channel: 'staging',
        sizeBytes: 1438900,
        mandatory: false,
        changelog: [
          'Сверхбыстрый виртуализированный фильтр котировок MOEX',
          'Автономные локальные пуш-уведомления через Capacitor LocalNotifications',
          'Экспериментальная синхронизация бандла'
        ]
      },
      dev: {
        version: '1.1.0-nightly',
        build: 200,
        releaseDate: '2026-11-09T22:00:00Z',
        checksum: 'sha256-00ba34c11ef920',
        channel: 'dev',
        sizeBytes: 1495000,
        mandatory: false,
        changelog: [
          'Ночной билд с расширенным профилированием памяти'
        ]
      }
    };

    const target = availableUpdates[channel];
    if (target && target.version !== currentBundle) {
      return target;
    }
    return null;
  },

  applyUpdate(manifest: OTAManifest): void {
    localStorage.setItem(OTA_KEY_APPLIED, manifest.version);
  },

  getCapacitorConfigSnippet(): string {
    return JSON.stringify({
      appId: "com.volyyyk.finance",
      appName: "Финансы & Кешбэк",
      webDir: "dist",
      server: {
        androidScheme: "https",
        cleartext: false
      },
      android: {
        allowMixedContent: false,
        captureInput: true,
        webContentsDebuggingEnabled: false,
        backgroundColor: "#0f172a"
      },
      plugins: {
        CapacitorUpdater: {
          autoUpdate: true,
          statsUrl: "",
          channel: "production"
        }
      }
    }, null, 2);
  },

  getAndroidManifestSnippet(): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.volyyyk.finance">

    <!-- Standalone Android APK without relying on external Google Chrome browser -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="Финансы"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="false">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:name=".MainActivity"
            android:label="Финансы"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;
  },

  getBuildInstructions(): string[] {
    return [
      'Шаг 1: npm run build (сборка оптимизированного Web-бандла в папку dist)',
      'Шаг 2: npx cap add android (инициализация нативной Android платформы, если ещё не создана)',
      'Шаг 3: npx cap sync android (копирование бандла dist и плагинов в Android Studio проект)',
      'Шаг 4: cd android && ./gradlew assembleRelease (компиляция нативного standalone APK без Chrome)',
      'Шаг 5: Для OTA обновлений: загрузите собранный zip архива dist на ваш сервер или S3/Capgo. Приложение скачивает обновление на лету без переустановки APK!'
    ];
  }
};
