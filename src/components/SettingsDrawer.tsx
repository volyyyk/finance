import React, { useRef } from 'react';
import { 
  X, 
  Moon, 
  Sun, 
  FileSpreadsheet, 
  Download, 
  Upload, 
  RotateCcw, 
  Trash2, 
  Bell, 
  ShieldAlert,
  Smartphone
} from 'lucide-react';
import { StorageService } from '../services/storageService';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  theme,
  onToggleTheme
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const text = evt.target?.result as string;
        const data = JSON.parse(text);
        if (data.products && Array.isArray(data.products)) {
          StorageService.saveProducts(data.products);
        }
        if (data.goal) {
          StorageService.saveGoal(data.goal);
        }
        if (data.cashback) {
          StorageService.saveCashbackData(data.cashback);
        }
        if (data.cbDict) {
          StorageService.saveCbDict(data.cbDict);
        }
        alert('Данные успешно импортированы!');
        window.location.reload();
      } catch (err) {
        alert('Ошибка при чтении JSON-файла: неверный формат');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div 
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between overflow-y-auto">
          
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Настройки и экспорт
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-6 space-y-5 text-xs sm:text-sm">
              
              {/* Theme Toggle */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                  Оформление и темы
                </label>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? (
                      <Moon className="w-5 h-5 text-amber-400" />
                    ) : (
                      <Sun className="w-5 h-5 text-amber-500" />
                    )}
                    <div className="text-left">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block text-xs sm:text-sm">
                        {theme === 'dark' ? 'Тёмная тема (кешбэк: красная/жёлтая/оранжевая подсветка)' : 'Светлая тема (пастельные тона кешбэка)'}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Нажмите для переключения
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {theme === 'dark' ? 'Dark' : 'Light'}
                  </span>
                </button>
              </div>

              {/* Data Export / Import */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                  Экспорт и резервные копии
                </label>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => StorageService.exportExcel()}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <span className="font-semibold text-xs sm:text-sm">Экспорт в Excel (.xls)</span>
                    </div>
                    <span className="text-xs text-slate-400">Таблица со всеми итогами</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => StorageService.exportJSON()}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Download className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-xs sm:text-sm">Скачать JSON бэкап</span>
                    </div>
                    <span className="text-xs text-slate-400">.json файл</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Upload className="w-4 h-4 text-purple-600" />
                      <span className="font-semibold text-xs sm:text-sm">Импорт из JSON</span>
                    </div>
                    <span className="text-xs text-slate-400">Загрузить файл</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Reset Actions */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                  Сброс и демо-данные
                </label>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Сбросить текущие данные и загрузить демо-примеры?')) {
                        StorageService.resetToSeed();
                      }
                    }}
                    className="w-full flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-500" />
                    <span className="font-semibold text-xs sm:text-sm">Загрузить демо-данные (Seed)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('ВНИМАНИЕ! Вы точно хотите удалить абсолютно все счета, вклады и кешбэки?')) {
                        StorageService.resetToZero();
                      }
                    }}
                    className="w-full flex items-center gap-2.5 p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    <span className="font-semibold text-xs sm:text-sm">Сбросить всё (до нуля)</span>
                  </button>
                </div>
              </div>

            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400">
            <div>Автономное приложение · PWA & Capacitor APK</div>
            <div className="mt-0.5">Данные сохраняются локально в вашем устройстве</div>
          </div>

        </div>
      </div>
    </div>
  );
};
