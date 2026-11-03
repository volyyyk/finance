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

  async function show(title, body, tag){
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const options = { body, tag, icon: '/icons/icon-192.png' };
      if (reg) await reg.showNotification(title, options);
      else new Notification(title, options);
      return true;
    } catch (e){ return false; }
  }

  function checkWeekly(){
    if (!prevVisit) return;
    if (Date.now() - prevVisit >= WEEK_MS){
      show('Пора свериться с расходами',
        'Прошла неделя с последнего захода. Откройте приложение и сверьтесь с расходами.',
        'fin-weekly');
    }
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

    const texts = [];
    items.forEach(e => {
      const days = Math.round((e.date - now) / DAY_MS);
      const key  = `${e.product.id}:${dateKey(e.date)}`;
      const text = `${e.title}${e.amount ? ': ' + fmtMoney(e.amount) : ''} — ${dayText(days)}`;
      texts.push(text);
      if (!alerted[key]){
        alerted[key] = e.date.getTime();
        show('Скорое списание', text, key);
      }
    });
    localStorage.setItem(LS_ALERTS, JSON.stringify(alerted));

    const aside = $('alertsNotice');
    const message = $('alertsMessage');
    if (message){
      if (texts.length){ message.textContent = '⚠ ' + texts.join(' · '); if (aside) aside.hidden = false; }
      else if (aside) aside.hidden = true;
    }
  }

  // Передаём service worker'у данные для фоновой проверки (periodicSync)
  async function syncMeta(){
    try {
      const reg = await navigator.serviceWorker?.ready;
      reg?.active?.postMessage({
        type: 'fin-meta',
        lastVisit: Number(localStorage.getItem('fin_lastVisit') || Date.now()),
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
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkPayments();
    });
    window.addEventListener('pagehide', syncMeta);
    window.addEventListener('dataSaved', syncMeta);
    syncMeta();
  }

  return { init, checkPayments, syncMeta };
})();
