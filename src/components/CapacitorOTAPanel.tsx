import React, { useState } from 'react';
import { 
  Smartphone, 
  RefreshCw, 
  CheckCircle2, 
  Download, 
  Terminal, 
  Radio, 
  Cpu, 
  Copy, 
  Check, 
  ShieldCheck, 
  AlertTriangle 
} from 'lucide-react';
import { OTAService, OTAManifest } from '../services/otaService';

export const CapacitorOTAPanel: React.FC = () => {
  const [channel, setChannel] = useState<'production' | 'staging' | 'dev'>(OTAService.getChannel());
  const [bundleVer, setBundleVer] = useState(OTAService.getBundleVersion());
  const [isChecking, setIsChecking] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<OTAManifest | null>(null);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const platformInfo = OTAService.getPlatformInfo();

  const handleChannelChange = (newCh: 'production' | 'staging' | 'dev') => {
    setChannel(newCh);
    OTAService.setChannel(newCh);
    setPendingUpdate(null);
    setCheckMessage(null);
  };

  const handleCheckUpdates = async () => {
    setIsChecking(true);
    setCheckMessage(null);
    try {
      const update = await OTAService.checkForUpdates(bundleVer, channel);
      if (update) {
        setPendingUpdate(update);
        setCheckMessage(`Найдено новое OTA-обновление: v${update.version} (${(update.sizeBytes / 1024 / 1024).toFixed(2)} МБ)`);
      } else {
        setPendingUpdate(null);
        setCheckMessage('У вас установлена самая актуальная версия бандла.');
      }
    } catch (e) {
      setCheckMessage('Не удалось подключиться к серверу обновлений');
    } finally {
      setIsChecking(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!pendingUpdate) return;
    setIsDownloading(true);
    setDownloadProgress(0);

    for (let p = 10; p <= 100; p += 15) {
      await new Promise(r => setTimeout(r, 120));
      setDownloadProgress(p);
    }

    OTAService.applyUpdate(pendingUpdate);
    setBundleVer(pendingUpdate.version);
    setIsDownloading(false);
    setPendingUpdate(null);
    setCheckMessage(`✅ Обновление v${pendingUpdate.version} успешно установлено без переустановки APK!`);
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              <span>Native Android & Capacitor Engine</span>
              <span>·</span>
              <span>Без Google Chrome</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
              Нативное APK и OTA-обновления
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Standalone WebView</span>
            </span>
          </div>
        </div>

        {/* Runtime Diagnostics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 block">Платформа среды</span>
            <strong className="text-slate-900 dark:text-slate-100 text-sm mt-0.5 block">
              {platformInfo.mode}
            </strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 block">Идентификатор пакета (AppId)</span>
            <strong className="text-slate-900 dark:text-slate-100 text-sm font-mono mt-0.5 block">
              {platformInfo.appId}
            </strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 block">Внутренняя схема</span>
            <strong className="text-emerald-600 dark:text-emerald-400 text-sm font-mono mt-0.5 block">
              {platformInfo.scheme} (изолированный WebView)
            </strong>
          </div>
        </div>
      </div>

      {/* OTA (Over-The-Air) Live Updates Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-xs transition-colors space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-500" />
              OTA Live Updates (Обновление бандла без пересборки APK)
            </h2>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Позволяет доставлять новые экраны, исправления и стили напрямую в нативное приложение
            </div>
          </div>

          {/* Channel selector */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {(['production', 'staging', 'dev'] as const).map(ch => (
              <button
                key={ch}
                onClick={() => handleChannelChange(ch)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors capitalize ${
                  channel === ch
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        {/* Current bundle status */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm">
          <div>
            <span className="text-slate-500 block text-xs">Текущая ревизия бандла:</span>
            <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
              {bundleVer}
            </span>
          </div>

          <button
            type="button"
            disabled={isChecking || isDownloading}
            onClick={handleCheckUpdates}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Проверка реестра...' : 'Проверить обновления OTA'}</span>
          </button>
        </div>

        {checkMessage && (
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-slate-200">
            {checkMessage}
          </div>
        )}

        {/* Pending update card */}
        {pendingUpdate && (
          <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-sm font-bold text-slate-900 dark:text-slate-100 block">
                  Доступен OTA-релиз v{pendingUpdate.version} ({pendingUpdate.channel})
                </strong>
                <span className="text-xs text-slate-500">
                  Контрольная сумма: <code className="font-mono text-xs">{pendingUpdate.checksum}</code>
                </span>
              </div>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2.5 py-1 rounded-lg">
                Готов к загрузке
              </span>
            </div>

            <div className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
              <span className="font-semibold block">Что нового:</span>
              <ul className="list-disc pl-4 space-y-0.5">
                {pendingUpdate.changelog.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>

            {isDownloading ? (
              <div className="space-y-1 pt-2">
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>Загрузка бандла...</span>
                  <span className="font-bold">{downloadProgress}%</span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-200"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleApplyUpdate}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Установить обновление (OTA Hot Swap)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* APK Compilation Instructions & Config Generator */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-xs transition-colors space-y-5">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-500" />
            Инструкция сборки нативного APK (Capacitor)
          </h2>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Сборка автономного APK без браузера Google Chrome: локальный WebView запускает приложение на 100% офлайн
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-2.5 text-xs sm:text-sm">
          {OTAService.getBuildInstructions().map((step, idx) => (
            <div 
              key={idx}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start gap-3"
            >
              <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                {idx + 1}
              </span>
              <span className="text-slate-800 dark:text-slate-200">
                {step}
              </span>
            </div>
          ))}
        </div>

        {/* Config Files Snippets */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
          
          {/* capacitor.config.ts */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-950 text-slate-200">
            <div className="px-3.5 py-2 bg-slate-900 flex items-center justify-between text-xs border-b border-slate-800">
              <span className="font-mono text-slate-400">capacitor.config.ts</span>
              <button
                type="button"
                onClick={() => copyToClipboard(OTAService.getCapacitorConfigSnippet(), 'cap')}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
              >
                {copiedType === 'cap' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedType === 'cap' ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
            <pre className="p-3 text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed text-slate-300">
              {OTAService.getCapacitorConfigSnippet()}
            </pre>
          </div>

          {/* AndroidManifest.xml */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-950 text-slate-200">
            <div className="px-3.5 py-2 bg-slate-900 flex items-center justify-between text-xs border-b border-slate-800">
              <span className="font-mono text-slate-400">AndroidManifest.xml</span>
              <button
                type="button"
                onClick={() => copyToClipboard(OTAService.getAndroidManifestSnippet(), 'manifest')}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
              >
                {copiedType === 'manifest' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedType === 'manifest' ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
            <pre className="p-3 text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed text-slate-300">
              {OTAService.getAndroidManifestSnippet()}
            </pre>
          </div>

        </div>

        {/* Action Button to download build script */}
        <div className="pt-2 flex flex-wrap gap-3 justify-end">
          <button
            type="button"
            onClick={() => downloadFile(`#!/bin/bash
# Сборка автономного APK через Capacitor без использования Google Chrome
set -e
echo "1. Сборка React бандла..."
npm run build

echo "2. Синхронизация с платформой Android..."
npx cap sync android

echo "3. Компиляция нативного APK..."
cd android && ./gradlew assembleRelease

echo "Готово! APK файл доступен в: android/app/build/outputs/apk/release/app-release-unsigned.apk"
`, 'build-native-apk.sh')}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Скачать скрипт build-native-apk.sh</span>
          </button>
        </div>

      </div>

      {/* GitHub Repository Push & Patch Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-xs transition-colors space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-purple-500" />
              Публикация в GitHub (volyyyk/finance)
            </h2>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Коммит с 3 списками кешбэка, подсветкой, JS-оптимизациями и Capacitor подготовлен в ветке <code>main</code>
            </div>
          </div>
          <span className="px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            commit: 51576a1
          </span>
        </div>

        <div className="space-y-3 text-xs sm:text-sm">
          <p className="text-slate-700 dark:text-slate-300">
            Для отправки (push) в удалённый репозиторий <strong>https://github.com/volyyyk/finance.git</strong> на GitHub требуется авторизация (токен GitHub Personal Access Token с правами <code>repo</code>).
          </p>

          <div className="p-3.5 rounded-xl bg-slate-950 text-slate-200 font-mono text-xs space-y-2">
            <div className="text-slate-400 text-[11px]">// Команда для отправки изменений в main:</div>
            <div className="flex items-center justify-between text-emerald-400 font-bold overflow-x-auto">
              <span>git push origin main</span>
              <button
                type="button"
                onClick={() => copyToClipboard('git push origin main', 'gitpush')}
                className="text-slate-400 hover:text-white ml-2 text-[11px]"
              >
                {copiedType === 'gitpush' ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
            <div className="text-slate-400 text-[11px] pt-1">// Либо с токеном в один клик:</div>
            <div className="text-slate-300 text-[11px] overflow-x-auto">
              git push https://&lt;GITHUB_TOKEN&gt;@github.com/volyyyk/finance.git main
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href="/update.patch"
              download="finance-update.patch"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-purple-500" />
              <span>Скачать update.patch (304 КБ)</span>
            </a>

            <a
              href="/update.bundle"
              download="finance-update.bundle"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              <span>Скачать Git Bundle (92 КБ)</span>
            </a>
          </div>
        </div>
      </div>

    </div>
  );
};
