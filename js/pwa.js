(() => {
  const installButton = document.getElementById('installApp');
  const notice = document.getElementById('pwaNotice');
  const message = document.getElementById('pwaMessage');
  const updateButton = document.getElementById('updateApp');
  let installPrompt;
  let registration;
  let waitingWorker;
  let offlineReady = false;
  let updateError = '';
  let installed = false;
  let offlineIssue = '';
  const offlineStatus = document.getElementById('offlineStatus');
  const guide = document.getElementById('installGuide');
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function showStatus() {
    installButton.hidden = Boolean(installed || standalone());
    offlineStatus.textContent = offlineIssue || (offlineReady ? 'Готово к работе без интернета' : 'Подготовка автономного режима…');
    updateButton.hidden = !waitingWorker;
    if (updateError) { message.textContent = updateError; notice.hidden = false; return; }
    if (waitingWorker) message.textContent = 'Доступна новая версия. Сохраните открытые изменения перед обновлением.';
    else if (!navigator.onLine) message.textContent = 'Нет подключения. Котировки и ставка ЦБ недоступны.' +
      (offlineReady ? ' Приложение доступно без интернета.' : '');
    else if (ios && !standalone() && document.getElementById('settingsMenu').open) message.textContent = 'Чтобы установить приложение, откройте меню «Поделиться» и выберите «На экран Домой».';
    else { notice.hidden = true; return; }
    notice.hidden = false;
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = standalone();
  });
  installButton.addEventListener('click', async () => {
    if (!installPrompt) { guide.open = true; guide.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const prompt = installPrompt;
    installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch (error) { guide.open = true; console.warn('Установка не завершена:', error); }
    showStatus();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    installPrompt = null;
    installButton.hidden = true;
    showStatus();
  });
  window.addEventListener('online', showStatus);
  window.addEventListener('offline', showStatus);
  updateButton.addEventListener('click', () => {
    if (document.getElementById('modalBg').classList.contains('show')) {
      updateError = 'Сначала сохраните или закройте редактор, затем нажмите «Обновить».';
      showStatus();
      updateError = '';
      return;
    }
    updateButton.disabled = true;
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
  });
  showStatus();

  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    offlineIssue = 'Автономный режим недоступен: откройте сайт по HTTPS в современном браузере';
    showStatus();
    return;
  }
  let controlled = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) window.location.reload();
    controlled = true;
  });
  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      const checkWaiting = () => {
        waitingWorker = registration.waiting;
        showStatus();
      };
      checkWaiting();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') checkWaiting();
        });
      });
      navigator.serviceWorker.ready.then(async reg => {
        offlineReady = true; showStatus();
        // Фоновая проверка уведомлений, если браузер поддерживает Periodic Background Sync
        try {
          const status = await navigator.permissions?.query({ name: 'periodic-background-sync' });
          if (reg.periodicSync && status?.state === 'granted'){
            await reg.periodicSync.register('finance-check', { minInterval: 86400000 });
          }
        } catch { /* не поддерживается — уведомления сработают при открытии приложения */ }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) registration.update().catch(() => {});
      });
    } catch (error) {
      offlineIssue = 'Автономный режим не подготовлен';
      offlineStatus.textContent = offlineIssue;
      message.textContent = 'Не удалось подготовить работу без интернета. Перезагрузите страницу при стабильном подключении.';
      notice.hidden = false;
      console.warn('Ошибка регистрации service worker:', error);
    }
  });
})();
