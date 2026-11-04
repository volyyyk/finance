/* ============================================================
   notifications.js — локальные уведомления
   1) Раз в неделю напоминание зайти и свериться с расходами.
   2) За 3 дня до списаний по кредитным картам и кредитам.
   Работают через Notification API и periodicSync (если браузер
   поддерживает); без сервера push.
   ============================================================ */

const Notify = (() => {
  const { $, fmtMoney, dateKey } = Utils;
  const DAY_MS  = 86400000;
  const WEEK_MS = 7 * DAY_MS;
  const LS_ALERTS = 'fin_alertedEvents';
  // Момент последнего захода фиксируем до того, как SinceVisit обновит его
  const prevVisit = Number(localStorage.getItem('fin_lastVisit') || 0);

  // Выбранный день напоминания о сверке расходов (0=вс … 6=сб)
  function getCheckDay(){
    const v = Number(localStorage.getItem('fin_checkDay'));
    return Number.isInteger(v) && v >= 0 && v <= 6 ? v : 0;
  }

  // Предстоящие платежи по кредитным картам и кредитам:
  // конец льготного периода и регулярные выплаты долга (операции «Пополнить»)
  function payments(daysAhead){
    const now = new Date(); now.setHours(0,0,0,0);
    const horizon = new Date(now.getTime() + daysAhead * DAY_MS);
    return Events.all().filter(e => {
      const t = e.product.type;
      if (t !== 'credit_card' && t !== 'loan') return false;
      if (e.date < now || e.date > horizon) return false;
      if (e.title.startsWith('Льготный период')) return true;
      return e.direction === 'in';
    });
  }

  // Абсолютный путь к иконке: Android требует корректный URL иконки,
  // badge — маленькая монохромная метка в строке статуса.
  const ICON_URL = new URL('icons/icon-192.png', location.href).toString();
  const APP_URL = new URL('./', location.href).toString();

  async function show(title, body, tag){
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const options = {
      body, tag,
      icon: ICON_URL,                       // крупная иконка (слева)
      badge: ICON_URL,                      // мелкая метка в статус-баре Android
      data: { url: APP_URL }                // открытие приложения по тапу (см. notificationclick в sw.js)
    };
    try {
      // На Android Chrome уведомление показывается ТОЛЬКО через service
      // worker: конструктор new Notification() там выбрасывает ошибку.
      if (navigator.serviceWorker){
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, options);
      } else {
        new Notification(title, options);   // резервный путь для десктопа без SW
      }
      return true;
    } catch (e){ return false; }
  }

  // Напоминание о сверке расходов приходит в выбранный день недели.
  // Если приложение открыто в этот день — сверка уже идёт, отмечаем её
  // выполненной и показываем подсказку в приложении.
  function checkWeekly(){
    const d = new Date();
    if (d.getDay() !== getCheckDay()) return null;
    localStorage.setItem('fin_lastWeeklyTs', String(Date.now()));
    syncMeta();
    return 'Сегодня день сверки расходов — проверьте траты за неделю';
  }

  // Начало месяца: напоминание внести категории кешбэка за новый месяц.
  // Срабатывает один раз за месяц при первой проверке; если категории
  // уже внесены (в хранилище есть записи) — молча отмечаем месяц
  // обработанным. Ключ месяца совпадает с форматом CbLogic.monthKey.
  const MONTH_NAMES = ['январь','февраль','март','апрель','май','июнь',
    'июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  function cbMonthKey(d = new Date()){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  // Есть ли уже категории кешбэка за текущий месяц
  function cashbackHasEntries(){
    try {
      const data = JSON.parse(localStorage.getItem('fin_cashback') || 'null');
      return !!(data && Array.isArray(data.banks) &&
        data.banks.some(b => Array.isArray(b.cats) && b.cats.length));
    } catch { return false; }
  }
  function checkCashbackMonth(){
    const now = new Date();
    const key = cbMonthKey(now);
    if (localStorage.getItem('fin_cbMonthNotified') === key) return null;
    localStorage.setItem('fin_cbMonthNotified', key); // один раз за месяц
    if (cashbackHasEntries()) return null;           // категории уже внесены
    const text = `Начался ${MONTH_NAMES[now.getMonth()]} — добавьте категории кешбэка за новый месяц`;
    show('Кешбэк за новый месяц', text, 'fin-cb-month');
    return text;
  }

  function dayText(days){
    return days <= 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} дн.`;
  }

  // Напоминания о скорых списаниях; каждое событие уведомляется один раз
  function checkPayments(){
    const now = new Date(); now.setHours(0,0,0,0);
    const items = payments(3);
    let alerted = {};
    try { alerted = JSON.parse(localStorage.getItem(LS_ALERTS) || '{}'); } catch {}
    Object.keys(alerted).forEach(k => { if (alerted[k] < now.getTime()) delete alerted[k]; });

    const paymentTexts = [];
    items.forEach(e => {
      const days = Math.round((e.date - now) / DAY_MS);
      const key  = `${e.product.id}:${dateKey(e.date)}`;
      const text = `${e.title}${e.amount ? ': ' + fmtMoney(e.amount) : ''} — ${dayText(days)}`;
      paymentTexts.push(text);
      if (!alerted[key]){
        alerted[key] = e.date.getTime();
        show('Скорое списание', text, key);
      }
    });
    localStorage.setItem(LS_ALERTS, JSON.stringify(alerted));

    // Плашка под заголовком: скорые списания, день сверки и кешбэк нового месяца
    const aside = $('alertsNotice');
    const message = $('alertsMessage');
    if (message){
      const texts = [];
      const weekly = checkWeekly();
      if (weekly) texts.push(weekly);
      const cbMonth = checkCashbackMonth();
      if (cbMonth) texts.push(cbMonth);
      texts.push(...paymentTexts);
      if (texts.length){ message.textContent = texts.join(' · '); if (aside) aside.hidden = false; }
      else if (aside) aside.hidden = true;
    }
  }

  // Передаём service worker'у данные для фоновой проверки (periodicSync)
  async function syncMeta(){
    try {
      const reg = await navigator.serviceWorker?.ready;
      // active может быть null во время обновления SW — подстраховываемся
      const sw = reg?.active || reg?.waiting || reg?.installing;
      sw?.postMessage({
        type: 'fin-meta',
        lastVisit: Number(localStorage.getItem('fin_lastVisit') || Date.now()),
        lastWeeklyTs: Number(localStorage.getItem('fin_lastWeeklyTs') || 0),
        checkDay: getCheckDay(),
        cbMonth: localStorage.getItem('fin_cbMonthNotified') || null,
        payments: payments(10).map(e => ({
          key: `${e.product.id}:${dateKey(e.date)}`,
          title: e.title,
          amount: e.amount || 0,
          ts: e.date.getTime()
        }))
      });
    } catch {}
  }

  function updateButton(){
    const btn = $('enableNotifyBtn');
    if (!btn) return;
    if (!('Notification' in window)){ btn.hidden = true; return; }
    if (Notification.permission === 'granted'){
      btn.textContent = '✓ Уведомления включены'; btn.disabled = true;
    } else if (Notification.permission === 'denied'){
      btn.textContent = 'Уведомления заблокированы в браузере'; btn.disabled = true;
    } else {
      btn.textContent = 'Включить уведомления'; btn.disabled = false;
    }
  }

  function init(){
    updateButton();
    const btn = $('enableNotifyBtn');
    if (btn) btn.onclick = async () => {
      if (!('Notification' in window)) return;
      try { await Notification.requestPermission(); } catch {}
      updateButton();
      checkPayments();
      syncMeta();
    };
    checkWeekly();
    checkPayments();
    // Выбор дня напоминания о сверке расходов
    const daySel = $('checkDay');
    if (daySel){
      daySel.value = String(getCheckDay());
      daySel.onchange = () => {
        localStorage.setItem('fin_checkDay', daySel.value);
        syncMeta();
      };
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkPayments();
    });
    window.addEventListener('pagehide', syncMeta);
    window.addEventListener('dataSaved', syncMeta);
    syncMeta();
  }

  return { init, checkPayments, syncMeta };
})();
