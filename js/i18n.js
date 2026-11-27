/* ============================================================
   i18n.js — переключение языка интерфейса (русский / английский).
   Подключается первым из js/: модули оборачивают русские строки
   в T('…'), статическая разметка помечается атрибутом data-i18n.

   Словарь ключуется исходной русской строкой: t('Добавить продукт')
   возвращает английский вариант, если выбран английский, иначе
   исходную строку. Отсутствующий перевод возвращается как есть,
   поэтому приложение никогда не показывает «пустые» надписи.
   ============================================================ */
const I18n = (() => {
  const LANG_KEY = 'fin_lang';
  const supported = ['ru', 'en'];

  function initialLang(){
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === 'ru' || saved === 'en') return saved;
    } catch {}
    const nav = (typeof navigator !== 'undefined' && navigator.language) || 'ru';
    return /^ru/i.test(nav) ? 'ru' : 'en';
  }

  let lang = initialLang();

  // EN-словарь: ключ — исходная русская строка (включая разметку,
  // если она часть надписи), значение — английский вариант.
  const EN = {
    // ── Шапка, вкладки, настройки (index.html)
    '✓ Сохранено': '✓ Saved',
    'Учёт': 'Accounts',
    'Кешбэк': 'Cashback',
    'Настройки': 'Settings',
    'Установить приложение': 'Install app',
    'Включить уведомления': 'Enable notifications',
    'Напоминание раз в неделю и за 3 дня до списаний': 'Weekly reminder and alerts 3 days before payments',
    'День напоминания о сверке': 'Weekly review day',
    'понедельник': 'Monday', 'вторник': 'Tuesday', 'среда': 'Wednesday',
    'четверг': 'Thursday', 'пятница': 'Friday', 'суббота': 'Saturday', 'воскресенье': 'Sunday',
    'Сервер котировок MOEX (необязательно)': 'MOEX quote server (optional)',
    'Собственный Cloudflare Worker обходит ограничения CORS. Адрес сохраняется только на этом устройстве.':
      'Your own Cloudflare Worker bypasses CORS limits. The address is stored on this device only.',
    'Проверить и сохранить сервер': 'Test and save server',
    'Без Worker приложение использует прямой ISS и резервные каналы.': 'Without a Worker the app uses direct ISS and fallback channels.',
    'Язык интерфейса': 'Interface language',
    'Переключить светлую и тёмную тему': 'Switch light and dark theme',
    ' Тёмная тема': ' Dark theme',
    ' Светлая тема': ' Light theme',
    'Полная резервная копия': 'Full backup',
    'Скачать резервную копию всех данных приложения': 'Download a backup of all app data',
    'Проверка резервной копии…': 'Checking backup…',
    'Резервная копия ещё не создавалась': 'No backup has been created yet',
    'Экспорт в Excel': 'Export to Excel',
    'Скачать таблицу Excel с продуктами, общим балансом и долгом': 'Download an Excel sheet with products, balance and debt',
    'Импорт': 'Import',
    'Загрузить из JSON': 'Load from JSON',
    'Сброс к seed': 'Reset to demo data',
    'Очистить localStorage и загрузить из data/seed.js': 'Clear localStorage and load from data/seed.js',
    'Сбросить всё (до нуля)': 'Reset everything (to zero)',
    'Полностью удалить все данные без восстановления': 'Erase all data permanently',
    'Установка на телефон · ': 'Install on phone · ',
    'Подготовка автономного режима…': 'Preparing offline mode…',
    'Готово к работе без интернета': 'Ready to work offline',
    'Android:': 'Android:',
    'iPhone и iPad:': 'iPhone and iPad:',
    'Банки': 'Banks',
    'Добавить кешбэк': 'Add cashback',
    'Добавить продукт': 'Add product',
    '+ Добавить продукт': '+ Add product',
    'Обновить': 'Update',
    'Доступна новая версия. Сохраните открытые изменения перед обновлением.': 'A new version is available. Save open changes before updating.',
    'Сначала сохраните или закройте редактор, затем нажмите «Обновить».': 'Save or close the editor first, then press “Update”.',
    'Льготный период': 'Grace period',
    'Льготный период: ': 'Grace period: ',
    'Льготный период до': 'Grace period until',
    '— через ': ' — in ',
    'дн.': 'd.',

    // ── Приветствие
    'ВАШИ ФИНАНСЫ · ВАШИ ПРАВИЛА': 'YOUR MONEY · YOUR RULES',
    'Начнём с чистого листа?': 'Start with a clean slate?',
    'Добавьте только свои счета и активы — или сначала изучите приложение на демонстрационных данных. Демо можно включить отдельно, ваши реальные данные не затрагиваются.':
      'Add only your own accounts and assets — or explore the app with demo data first. Demo can be enabled separately; your real data is not touched.',
    'Начать без демо': 'Start without demo',
    'Посмотреть демо-портфель': 'View demo portfolio',
    'Данные хранятся локально в этом браузере. Их можно экспортировать в настройках.': 'Data is stored locally in this browser. You can export it in settings.',

    // ── Портфель, события, графики, результаты
    'Активы и обязательства': 'Assets and liabilities',
    'Все счета, вклады, долги и инвестиционные портфели': 'All accounts, deposits, debts and investment portfolios',
    'МОЙ ПОРТФЕЛЬ': 'MY PORTFOLIO',
    'Структура портфеля': 'Portfolio breakdown',
    'Распределение по типам продуктов': 'Distribution by product type',
    'Структура портфеля по категориям': 'Portfolio breakdown by category',
    'Найти счёт, банк или продукт…': 'Find an account, bank or product…',
    'Ничего не найдено. Попробуйте другое название.': 'Nothing found. Try another name.',
    'Удалить выбранные': 'Delete selected',
    'События и календарь': 'Events and calendar',
    'Ближайшие события': 'Upcoming events',
    'Графики финансового результата': 'Financial result charts',
    'Общий баланс': 'Total balance',
    'Финансовый результат (накопленный)': 'Financial result (cumulative)',
    'Прогноз динамики капитала': 'Capital dynamics forecast',
    'Без учёта событий': 'Without events',
    'С учётом событий': 'With events',
    'Результаты': 'Results',
    'Зафиксировать': 'Pin a snapshot',
    'Сохранить текущую сумму как промежуточный результат': 'Save the current amount as an interim result',
    'Создать цель': 'Create goal',
    'Обзор': 'Overview',
    'Портфель': 'Portfolio',
    'Основная навигация': 'Main navigation',
    'Режим приложения': 'App mode',

    // ── Карточка продукта и редактор
    'КАРТОЧКА ПРОДУКТА': 'PRODUCT CARD',
    'Закрыть': 'Close',
    'Редактировать': 'Edit',
    'Новый продукт': 'New product',
    'Редактировать продукт': 'Edit product',
    'Тип продукта': 'Product type',
    'Название': 'Name',
    'Например, Вклад «Накопительный»': 'E.g. Deposit “Savings”',
    'Текущая сумма (₽)': 'Current amount (₽)',
    'Ставка (% годовых)': 'Rate (% per year)',
    'Дата начала': 'Start date',
    'Дата окончания': 'End date',
    'Действие при окончании': 'Action at maturity',
    '— не выбрано —': '— none —',
    'Закрыть продукт': 'Close the product',
    'Перевести на другой продукт': 'Transfer to another product',
    'Изменить условия': 'Change terms',
    'Перевести на продукт': 'Transfer to product',
    'Новая ставка (% годовых)': 'New rate (% per year)',
    'Новая дата окончания': 'New end date',
    'Комментарий': 'Comment',
    'Банк, брокер и т.п.': 'Bank, broker etc.',
    'Пополнения и снятия': 'Deposits and withdrawals',
    'Пополнить': 'Deposit',
    'Снять': 'Withdraw',
    'Сумма ₽': 'Amount ₽',
    'Дата первой операции': 'First operation date',
    'Когда выполнить пополнение или снятие впервые': 'When the deposit or withdrawal happens first',
    'Дата окончания повторений': 'End of repeats',
    'После этой даты операции выполняться не будут': 'No operations happen after this date',
    '+ Добавить': '+ Add',
    'Отмена': 'Cancel',
    'Сохранить': 'Save',
    'Сохранить продукт': 'Save product',
    'Продолжить': 'Continue',
    'Назад': 'Back',
    'Добавить в портфель': 'Add to portfolio',
    'Добавить актив': 'Add asset',
    '＋ Добавить актив': '＋ Add asset',
    '− Скрыть добавление': '− Hide add panel',
    'Скрыть добавление': 'Hide add panel',
    'Тикер, название или ваше имя': 'Ticker, name or your own name',
    'Найти': 'Search',
    'Акция': 'Stock', 'Облигация': 'Bond', 'Фонд': 'Fund', 'Металл': 'Metal',
    'Граммы': 'Grams', 'Кол-во': 'Qty',
    'Цена покупки ₽': 'Purchase price ₽',
    'Название актива': 'Asset name',
    'Например: ВТБ — Ликвидность': 'E.g.: VTB — Liquidity',
    'Можно оставить биржевое название или указать своё. Тикер и ISIN сохраняются отдельно.':
      'Keep the exchange name or set your own. Ticker and ISIN are stored separately.',
    'Дата покупки (купоны до неё не начисляются)': 'Purchase date (coupons accrue from it)',
    'Цена покупки — в рублях за одну облигацию, без НКД. Свободные деньги укажите уже после покупки. Купоны и погашение учитываются с даты добавления; суммы — до налогов и комиссий.':
      'Purchase price is in rubles per bond, excluding accrued interest. Enter free cash after the purchase. Coupons and redemption count from the add date; amounts are pre-tax.',
    'Основное': 'Basics',
    'Тип, название и сумма': 'Type, name and amount',
    'Условия и доходность': 'Terms and yield',
    'Ставка, даты и дополнительные параметры': 'Rate, dates and extra parameters',
    'Операции и состав': 'Operations and composition',
    'Пополнения, снятия, активы и действия при окончании': 'Deposits, withdrawals, assets and maturity actions',
    'Основные данные': 'Basic details',
    'Выберите категорию': 'Pick a category',
    'Дополнительные параметры можно раскрыть ниже. Ничего важного не удалено.': 'Extra parameters can be expanded below. Nothing important was removed.',
    'Ориентировочный доход за срок': 'Estimated income over the term',
    'Укажите сумму, ставку и срок': 'Enter an amount, rate and term',
    'Расходы за год': 'Expenses per year',
    'По текущей ежемесячной сумме': 'Based on the current monthly amount',
    'Ориентировочная стоимость долга за год': 'Estimated yearly cost of the debt',
    'Без учёта льготного периода и погашений': 'Excluding grace period and repayments',
    'Ориентировочный эффект за год': 'Estimated yearly effect',
    'Рост стоимости, аренда и обслуживание': 'Value growth, rent and upkeep',
    'Сценарий по истории портфеля': 'Scenario based on portfolio history',
    'Сбережения и проценты': 'Savings and interest',
    'Брокерский счёт и активы': 'Brokerage account and assets',
    'Деньги на карте или счёте': 'Money on a card or account',
    'Лимит и задолженность': 'Limit and debt',
    'Кредит и выплаты': 'Loan and payments',
    'Стоимость и аренда': 'Value and rent',
    'Регулярные платежи': 'Regular payments',
    'Вклад': 'Deposit', 'Инвестиции': 'Investments', 'Дебетовая карта': 'Debit card',
    'Кредитная карта': 'Credit card', 'Кредит': 'Loan', 'Квартира': 'Apartment',
    'Обязательный расход': 'Mandatory expense',
    'Шаг 1 из 4 · ': 'Step 1 of 4 · ',
    'Шаг 2 из 4 · ': 'Step 2 of 4 · ',
    'Шаг 3 из 4 · ': 'Step 3 of 4 · ',
    'Шаг 4 из 4 · ': 'Step 4 of 4 · ',

    // ── Вкладки редактора (динамические подписи полей)
    'Сумма в месяц (₽)': 'Monthly amount (₽)',
    'Долг на текущий день (₽)': 'Current debt (₽)',
    'Свободные деньги (кэш, может быть отрицательным) (₽)': 'Free cash (may be negative) (₽)',
    'Стоимость квартиры (₽)': 'Apartment value (₽)',
    'Текущий долг (₽)': 'Current debt (₽)',
    'Ставка по долгу (% годовых)': 'Debt rate (% per year)',
    'Рост стоимости квартиры (% в год)': 'Apartment value growth (% per year)',
    'Не считать в текущем бюджете (доходы и расходы учитываются)': 'Exclude from the budget (income and expenses still count)',
    'Пополнить': 'Deposit', 'Снять': 'Withdraw',
    'Разово': 'Once', 'Еженедельно': 'Weekly', 'Ежемесячно': 'Monthly', 'Ежегодно': 'Yearly',
    'Обычное снятие (в расход)': 'Regular withdrawal (an expense)',
    'Платёж по долгу: ': 'Debt payment: ',
    'Нет операций': 'No operations',
    'Нет действий': 'No actions',
    'Активов нет': 'No assets',
    'Акции': 'Stocks', 'Облигации': 'Bonds', 'Фонды': 'Funds', 'Металлы': 'Metals',
    ' акция': ' stock', ' облигация': ' bond', ' фонд': ' fund', ' металл': ' metal',
    'наимен.': 'items',
    'Переименовать': 'Rename',
    'Убрать': 'Remove',
    'Совпадения по вашим названиям': 'Matches by your own names',
    '· сохранённое название': '· saved name',
    'Правила ПИФ ': 'Fund rules ',
    'Официальная цена и история ВИМ загрузятся при выборе фонда. Тикера MOEX нет.':
      'Official VIM price and history load when you pick the fund. No MOEX ticker.',
    'MOEX недоступна: ': 'MOEX is unavailable: ',
    '. Можно выбрать совпадение по сохранённому названию выше.': '. You can pick a saved-name match above.',
    'Нет подходящих бумаг этого типа': 'No securities of this type',
    'Идёт поиск биржевых бумаг MOEX…': 'Searching MOEX securities…',
    'Выбрано:': 'Selected:',
    'Загрузка данных MOEX…': 'Loading MOEX data…',
    'Не удалось подтвердить, что бумага торгуется: ': 'Could not confirm the security is traded: ',
    '. Добавление заблокировано. Повторите проверку позже.': '. Adding is blocked. Retry later.',
    'Нельзя добавить бумагу: не удалось подтвердить действующий допуск к торгам. ': 'Cannot add the security: active trading status not confirmed. ',

    // ── Дашборд, события, цель, проверка финансов
    'Пока нет продуктов. Добавьте первый!': 'No products yet. Add the first one!',
    'Пополнение': 'Deposit',
    'Снятие': 'Withdrawal',
    'Платёж по долгу': 'Debt payment',
    'Платёж по долгу: Свободные деньги': 'Debt payment: Free cash',
    'Списание': 'Charge',
    'Погашение': 'Redemption',
    'Купон': 'Coupon',
    'сегодня': 'today', 'вчера': 'yesterday', 'завтра': 'tomorrow',
    'Нет предстоящих событий': 'No upcoming events',
    'За это время операций не было': 'No operations in this period',
    'долг ': 'debt ',
    'шт.': 'pcs',
    'Подробнее ⌃': 'Details ⌃',
    'Подробнее ⌄': 'Details ⌄',
    'Не удалось завершить обновление котировок: ': 'Quote update failed: ',
    'не сдаётся': 'not rented',
    'без активов': 'no assets',
    'след.: ': 'next: ',
    'нет событий': 'no events',
    'Для обновления MOEX нужен интернет. Используются ранее сохранённые цены.':
      'MOEX updates need internet. Previously saved prices are used.',
    'MOEX пока не вернул новую котировку': 'MOEX has not returned a fresh quote yet',
    'Ошибка запроса MOEX': 'MOEX request error',
    'Не удалось обновить ': 'Failed to update ',
    ' актив(а). Старые цены сохранены.\n': ' asset(s). Old prices kept.\n',
    'Цель достигнута': 'Goal reached',
    '1 год': '1 year', '2 года': '2 years', '5 лет': '5 years',
    '1.5 года': '1.5 years', '1 мес': '1 mo', '6 мес': '6 mo', ' мес': ' mo',
    'меньше месяца': 'under a month',
    'Название цели — например, «Квартира», «Подушка», «Отпуск».\nМожно оставить пустым.':
      'Goal name — e.g. “Apartment”, “Rainy day”, “Vacation”.\nCan be empty.',
    'Финальная сумма цели (₽).\nТекущий баланс с учётом долгов отмечается на шкале.':
      'Goal target amount (₽).\nThe current balance including debts is marked on the scale.',
    'Укажите положительную сумму цели': 'Enter a positive goal amount',
    'Удалить цель?': 'Delete the goal?',
    'Изменить цель': 'Edit goal',
    'Добавьте первый продукт': 'Add the first product',
    'Начните со счетов, вкладов или инвестиций.': 'Start with accounts, deposits or investments.',
    'Проверьте данные продукта': 'Check product data',
    'Обнаружена запись с неполными или некорректными основными данными.': 'A record with incomplete or invalid core data was found.',
    'Проверьте котировки: ': 'Check quotes: ',
    ' бумаг': ' securities',
    ' запросов завершились ошибкой. ': ' requests failed. ',
    'Цена устарела или дата обновления неизвестна. ': 'The price is stale or its update date is unknown. ',
    ' и ещё ': ' and ',
    'Создайте резервную копию': 'Create a backup',
    'Последняя копия старше 30 дней.': 'The last backup is older than 30 days.',
    'Данные хранятся только в этом браузере; резервная копия ещё не создавалась.':
      'Data lives only in this browser; no backup has been created yet.',
    'замеч.': 'items',
    'Всё в порядке': 'All good',
    'Критичных замечаний по основным данным не обнаружено.': 'No critical issues found in the core data.',
    'Повторить обновление цен': 'Retry price update',
    'Состояние финансов': 'Financial health',
    'Автоматическая проверка данных и резервной копии': 'Automatic data and backup check',
    'Нет данных': 'No data',
    '≈ ': '≈ ',

    // ── Приложение: экспорт/импорт/сброс/тема/Worker
    'Выберите продукты для удаления': 'Select products to delete',
    'Удалить выбранных продуктов: ': 'Delete selected products: ',
    'Экспорт': 'Export',
    'Не удалось создать резервную копию: ': 'Could not create the backup: ',
    'Финансы — экспорт от ': 'Finances — export of ',
    'Тип': 'Type', 'Название': 'Name', 'Сумма ₽': 'Amount ₽',
    'Ставка % годовых': 'Rate % per year',
    'Начало': 'Start', 'Окончание': 'End',
    'Сдаётся': 'Rented', 'Аренда ₽/мес': 'Rent ₽/mo', 'Ремонт %/год': 'Upkeep %/yr',
    'Вне бюджета': 'Off budget', 'Операций': 'Operations', 'Активов': 'Assets',
    'да': 'yes', 'нет': 'no',
    'Общий баланс (активы), ₽': 'Total balance (assets), ₽',
    'Общий долг, ₽': 'Total debt, ₽',
    'Чистый капитал (баланс − долг), ₽': 'Net worth (balance − debt), ₽',
    'Продукты (': 'Products (',
    'Импорт резервной копии?': 'Import the backup?',
    'Это старая копия только со списком продуктов. Остальные разделы текущего приложения сохранятся.':
      'This is a legacy copy with a product list only. Other sections of the current app are kept.',
    'Будут заменены все данные приложения: ': 'All app data will be replaced: ',
    ' продуктов, кешбэк, словари и сохранённые результаты.': ' products, cashback, dictionaries and saved results.',
    'Рекомендуется сначала скачать текущую копию.': 'Downloading the current copy first is recommended.',
    'Восстановлено продуктов: ': 'Restored products: ',
    'Импорт отменён: ': 'Import cancelled: ',
    'Не удалось прочитать файл резервной копии': 'Could not read the backup file',
    'Сброс к демо-данным (seed) — шаг 1 из 3\n\nВсе текущие данные будут удалены и заменены демо-примерами. Продолжить?':
      'Reset to demo data (seed) — step 1 of 3\n\nAll current data will be deleted and replaced with demo examples. Continue?',
    'Сброс к демо-данным — шаг 2 из 3\n\nЕсли данные нужны, сначала сделайте экспорт (Настройки → Экспорт). Удалить всё и загрузить seed?':
      'Reset to demo data — step 2 of 3\n\nIf you need the data, export it first (Settings → Export). Delete everything and load the seed?',
    'Сброс к демо-данным — шаг 3 из 3\n\nПоследнее предупреждение: заменить все данные демо-примерами?':
      'Reset to demo data — step 3 of 3\n\nFinal warning: replace all data with demo examples?',
    'В data/seed.js нет данных (window.SEED_DATA пуст или отсутствует)': 'No data in data/seed.js (window.SEED_DATA is empty or missing)',
    'Полный сброс — шаг 1 из 3\n\nБудут удалены ВСЕ данные, включая цель. Продолжить?':
      'Full reset — step 1 of 3\n\nALL data will be deleted, including the goal. Continue?',
    'Полный сброс — шаг 2 из 3\n\nЭто действие нельзя отменить. Если данные нужны, сначала сделайте экспорт. Удалить всё?':
      'Full reset — step 2 of 3\n\nThis cannot be undone. If you need the data, export it first. Delete everything?',
    'Полный сброс — шаг 3 из 3\n\nПоследнее предупреждение: удалить все данные без возможности восстановления?':
      'Full reset — step 3 of 3\n\nFinal warning: delete all data permanently?',
    'Собственный Worker отключён. Используются прямой ISS и резервные каналы.': 'Custom Worker disabled. Direct ISS and fallback channels are used.',
    'Нужен корректный HTTPS-адрес Worker без пути и параметров.': 'Enter a valid HTTPS Worker address without a path or query.',
    'Проверяем соединение с Worker и MOEX…': 'Testing the Worker and MOEX connection…',
    'Подключено. MOEX отвечает через Worker; строк в ответе: ': 'Connected. MOEX answers via the Worker; rows in response: ',
    'Проверка не пройдена: ': 'Check failed: ',

    // ── PWA-плашки, уведомления
    'Готово к работе без интернета': 'Ready to work offline',
    'Подготовка автономного режима…': 'Preparing offline mode…',
    'Нет подключения. Котировки и ставка ЦБ недоступны.': 'Offline. Quotes and the key rate are unavailable.',
    ' Приложение доступно без интернета.': ' The app works offline.',
    'Чтобы установить приложение, откройте меню «Поделиться» и выберите «На экран Домой».':
      'To install the app, open the “Share” menu and choose “Add to Home Screen”.',
    'Установка не завершена:': 'Installation is not complete:',
    'Автономный режим недоступен: откройте сайт по HTTPS в современном браузере': 'Offline mode unavailable: open the site via HTTPS in a modern browser',
    'Автономный режим не подготовлен': 'Offline mode is not ready',
    'Сегодня день сверки расходов — проверьте траты за неделю': 'Weekly expense review day — check this week’s spending',
    'Пора свериться с расходами': 'Time to review expenses',
    'Сегодня день сверки расходов. Откройте приложение и проверьте траты за неделю.': 'Today is the weekly expense review. Open the app and check this week’s spending.',
    'Кешбэк за новый месяц': 'Cashback for the new month',
    'Начался ': 'The new month started: ',
    ' — добавьте категории кешбэка за месяц': ' — add cashback categories for the month',
    'Скорое списание': 'Upcoming payment',
    '✓ Уведомления включены': '✓ Notifications enabled',
    'Уведомления заблокированы в браузере': 'Notifications are blocked by the browser',

    // ── Карточка продукта (product-detail)
    'Стоимость портфеля': 'Portfolio value',
    'Прогноз за год': 'Yearly forecast',
    ' / год': ' / yr',
    'Состав портфеля': 'Portfolio composition',
    'Свободные деньги': 'Free cash',
    'Позиций': 'Positions',
    'Прогноз доходности на 12 месяцев': '12-month return forecast',
    'Экстраполяция последнего доступного периода. Это сценарий, а не гарантированная доходность. Для облигаций дополнительно учитываются ожидаемые купоны.':
      'Extrapolation of the latest available period. It is a scenario, not a guaranteed return. Bonds also include expected coupons.',
    'с историей · изменение цены': 'with history · price change',
    'с историей · с учётом купонов': 'with history · coupons included',
    'с историей': 'with history',
    'с изменением цены': 'with price change',
    'Результат': 'Result',
    'Эффект за год': 'Yearly effect',
    'Количество активов': 'Number of assets',
    'Сроки': 'Terms',
    'Открытие / начало': 'Opened / start',
    'Окончание / закрытие': 'End / closure',
    'Не указана': 'Not set',
    'Доходность': 'Yield',
    'Ставка': 'Rate',
    '% годовых': '% per year',
    'Срок вклада': 'Deposit term',
    'Прошло срока': 'Term elapsed',
    'В портфеле пока нет рыночных активов.': 'No market assets in the portfolio yet.',
    'Нет рыночных активов для прогноза.': 'No market assets to forecast.',
    'с учётом купонов': 'coupons included',
    'изменение цены': 'price change',
    '%/год': '%/yr',
    'Счёт и движение': 'Account and flows',
    'Годовой эффект': 'Yearly effect',
    'Операций настроено': 'Operations configured',
    'Параметры': 'Parameters',
    'Режим учёта': 'Accounting mode',
    'Вне общего баланса': 'Off the total balance',
    'В общем балансе': 'In the total balance',
    'Кредитный лимит': 'Credit limit',
    'Задолженность': 'Debt',
    'Доступно': 'Available',
    'Использовано лимита': 'Limit used',
    'Условия': 'Terms',
    'Лимит': 'Limit',
    'Условия кредита': 'Loan terms',
    'Прогноз расходов за год': 'Yearly expense forecast',
    'Стоимость и доход': 'Value and income',
    'Аренда': 'Rent',
    '/мес': '/mo',
    'Не сдаётся': 'Not rented',
    'Доходность аренды': 'Rental yield',
    'Рост стоимости': 'Value growth',
    'Содержание': 'Upkeep',
    'План расходов': 'Expense plan',
    'В месяц': 'Per month',
    'Ориентир за год': 'Yearly estimate',
    'Детали': 'Details',
    'Расход в месяц': 'Monthly expense',
    'Текущая задолженность': 'Current debt',
    'Оценочная стоимость': 'Estimated value',
    'Текущая сумма': 'Current amount',
    'Плановый расход': 'Planned expense',
    'Годовая стоимость долга': 'Yearly debt cost',

    // ── Результаты и диаграммы
    'Зафиксируйте первый результат': 'Pin your first snapshot',
    'Пока нет зафиксированных результатов. Нажмите «Зафиксировать», чтобы сохранить текущую сумму.':
      'No snapshots yet. Press “Pin a snapshot” to save the current amount.',
    'Весь портфель': 'Whole portfolio',
    ' продукт(а) · ': ' product(s) · ',
    'Пока нечего распределять': 'Nothing to break down yet',

    // ── Ошибки MOEX/ВИМ/данных (показываются в интерфейсе)
    'Тайм-аут запроса (': 'Request timeout (',
    ' с)': ' s)',
    'MOEX ISS вернул пустой или некорректный JSON': 'MOEX ISS returned empty or invalid JSON',
    'не указан': 'not specified',
    'Ответ не является JSON (Content-Type: ': 'The response is not JSON (Content-Type: ',
    'Нет подключения к интернету': 'No internet connection',
    'Не удалось получить данные MOEX за ': 'Could not fetch MOEX data in ',
    ' с. Проверены: ': ' s. Tried: ',
    'Укажите корректный HTTPS-адрес Cloudflare Worker без пути': 'Enter a valid HTTPS Cloudflare Worker address without a path',
    'Worker ответил, но блок marketdata не соответствует формату ISS compact/extended':
      'The Worker answered but the marketdata block does not match the ISS compact/extended format',
    'MOEX ISS: блок "': 'MOEX ISS: block "',
    '" отсутствует или имеет неизвестную структуру (получены блоки: ': '" is missing or has an unknown structure (got blocks: ',
    'MOEX не допускает эту бумагу к обычным биржевым торгам. Закрытые или снятые с торгов инструменты добавить нельзя.':
      'MOEX does not allow this security on regular exchange trading. Closed or delisted instruments cannot be added.',
    'MOEX: превышено время загрузки графика': 'MOEX: schedule loading timed out',
    'Пока поддерживаются только рублёвые облигации': 'Only ruble bonds are supported for now',
    'Тип купона не указан MOEX': 'Coupon type is not specified by MOEX',
    'Тип купона не определён': 'Coupon type unknown',
    'Купон': 'Coupon', 'Основной долг': 'Principal',
    'сумма не объявлена': 'amount not announced',
    'График выплат': 'Payment schedule',
    'График пока недоступен': 'Schedule not available yet',
    'Ближайший купон: ': 'Next coupon: ',
    '· погашение: ': '· maturity: ',
    '· погашена': '· redeemed',
    '· зачислено: ': '· received: ',
    'Покупка: ': 'Purchase: ',
    ' / шт · НКД сейчас: ': ' / unit · accrued interest: ',
    '· рыночная цена': '· market price',
    ' · цена покупки': ' · purchase price',
    'Официальная стоимость пая ВИМ: ': 'Official VIM unit price: ',
    ' на ': ' on ',
    ' · СЧА: ': ' · NAV: ',
    'нет данных': 'no data',
    ' · изменение за ': ' · change over ',
    ' мес.: ': ' mo.: ',
    ' · годовой темп: ': ' · annual pace: ',
    ' · автообновление': ' · auto-refresh',
    'Источник: ': 'Source: ',
    'ВИМ Инвестиции': 'VIM Investments',
    ' · получено ': ' · fetched ',
    'ещё не обновлялось': 'not updated yet',
    'Последняя официальная стоимость пая: ': 'Last official unit price: ',
    ' · история ': ' · history ',
    ' · котировка обновляется вручную': ' · quote updates manually',
    'Фонд закрыт и не торгуется; динамика за последние 6 мес. отсутствует, рост в прогнозе не предполагается':
      'The fund is closed and not traded; no 6-month dynamics, no growth assumed in the forecast',
    'Изменение цены за ': 'Price change over ',
    ' · годовой прогноз ': ' · yearly forecast ',
    ' · учтено в прогнозе': ' · included in the forecast',
    'История цены за 12/6/3/1 мес. пока недоступна · рост не предполагается':
      '12/6/3/1-month price history is not available yet · no growth assumed',
    'MOEX: обновлено ': 'MOEX: updated ',
    'нет подтверждённой свежей цены': 'no confirmed fresh price',
    ' · режим ': ' · board ',
    'MOEX ответил, но актуальная цена пока недоступна': 'MOEX answered but a current price is not available yet',
    'Ошибка запроса ВИМ': 'VIM request error',
    'Неизвестный номер правил ПИФ': 'Unknown fund rules number',
    'ВИМ не вернул историю фонда': 'VIM returned no fund history',
    'снимок цен недоступен': 'price snapshot unavailable',
    'снимок цен вернул HTTP ': 'price snapshot returned HTTP ',
    'снимок цен вернул не JSON': 'price snapshot returned non-JSON',
    'снимок цен без корректной стоимости пая': 'price snapshot has no valid unit price',
    'Ключевая ставка не загружена:': 'Key rate not loaded:',
    'Модуль MoexAPI не найден. Проверьте, подключен ли js/moex.js': 'MoexAPI module not found. Check that js/moex.js is connected',
    'Модуль MoexAPI не загружен': 'MoexAPI module is not loaded',

    // ── Резервные копии (backup.js)
    'Финансовый учёт': 'Personal finance',
    'В резервной копии нет списка продуктов': 'The backup has no product list',
    'Файл не является корректным JSON': 'The file is not valid JSON',
    'Неизвестный формат резервной копии или неподдерживаемая версия': 'Unknown backup format or unsupported version',
    'В резервной копии обнаружены некорректные данные приложения': 'The backup contains invalid app data',
    'В резервной копии отсутствует основной список продуктов': 'The backup is missing the main product list',
    'Основной список продуктов повреждён': 'The main product list is corrupted',
    'Не удалось восстановить данные. Предыдущие данные возвращены: ': 'Could not restore the data. Previous data has been returned: ',
    'Продукт №': 'Product #',
    ': неверный формат': ': invalid format',
    ': отсутствует идентификатор': ': missing identifier',
    'Повторяется идентификатор продукта: ': 'Duplicate product identifier: ',
    'Продукт «': 'Product “',
    '»: неизвестный тип': '”: unknown type',
    ': неверное название': ': invalid name',
    ': неверная сумма': ': invalid amount',
    ': неверный список операций': ': invalid operation list',
    ': неверный список активов': ': invalid asset list',
    'Раздел ': 'Section ',
    ' повреждён — импорт отменён': ' is corrupted — import cancelled',

    // ── Кешбэк
    'Кешбэк текущего месяца': 'This month’s cashback',
    'Предзаказ кешбэка на следующий месяц': 'Next month’s cashback pre-order',
    ' · предзаказ': ' · pre-order',
    '✓ Скопировано': '✓ Copied',
    'Не удалось скопировать автоматически — выделите и скопируйте текст вручную':
      'Automatic copy failed — select and copy the text manually',
    'В ответе не нашлось ни одного кешбэка. Попросите нейросеть прислать JSON ещё раз.':
      'No cashback found in the response. Ask the AI to send the JSON again.',
    'Не удалось найти блок кода с JSON. Попросите нейросеть прислать ответ ещё раз — одним блоком кода.':
      'Could not find a JSON code block. Ask the AI to resend the answer as a single code block.',
    'обновлён %': 'updated %',
    'новый банк': 'new bank',
    'новая категория': 'new category',
    'Это предварительный план на следующий месяц — условия можно внести заранее.':
      'This is a draft plan for next month — terms can be entered in advance.',
    'Начнём с первого банка': 'Start with the first bank',
    'Добавим первые категории?': 'Add the first categories?',
    'Добавьте банки, которыми пользуетесь, и приложение покажет, где выгоднее платить в каждой категории.':
      'Add the banks you use and the app will show where paying is best in each category.',
    'Банки уже добавлены. Осталось указать проценты кешбэка — вручную или с помощью распознавания условий.':
      'Banks are added. Now enter cashback percentages — manually or by recognising terms.',
    '+ Добавить первый банк': '+ Add the first bank',
    '+ Добавить категории': '+ Add categories',
    'Укажите категорию (выберите из списка или впишите новую)': 'Pick a category (choose from the list or type a new one)',
    'Укажите процент кешбэка': 'Enter the cashback percent',
    'Укажите подкатегорию или снимите галочку': 'Enter a subcategory or untick it',
    'Кешбэков нет': 'No cashback',
    'Банков пока нет — добавьте первый': 'No banks yet — add the first one',
    'Укажите хотя бы один банк': 'Add at least one bank',
    'Эти банки уже есть в списке': 'These banks are already in the list',
    'Пока пусто': 'Empty for now',
    'Укажите название банка': 'Enter the bank name',
    'Укажите название категории': 'Enter the category name',
    'Банк': 'Bank',
    'Категория': 'Category',
    'Подкатегория': 'Subcategory',
    'проц': '%',
    'Сохранить банк': 'Save bank',
    'Добавить банк': 'Add bank',
    'Добавить категорию': 'Add category',
    'Кешбэк-словари': 'Cashback dictionaries',
    'Постоянные банки и категории кешбэка': 'Permanent banks and cashback categories',
    'Месяц, для которого добавляем кешбэки: ': 'Month to add cashback for: ',
    'Банки, которые уже есть в приложении: ': 'Banks already in the app: ',
    'пока нет': 'none yet',
    'Категории кешбэка, которые уже есть: ': 'Cashback categories already present: ',
    'Ты — помощник по кешбэк-программам банков. Я отправлю тебе фото или описание условий кешбэка банка.':
      'You are a bank cashback-programme assistant. I will send you a photo or a description of a bank’s cashback terms.',
    'Твоя задача: извлечь условия кешбэка и вернуть их в машиночитаемом виде.':
      'Your task: extract the cashback terms and return them in a machine-readable form.',
    'Правила ответа:': 'Response rules:',
    '1. В ответе должен быть ровно один блок кода с JSON — и ничего больше, до или после. Если на фото несколько банков, верни все банки отдельными объектами в одном JSON-массиве:':
      '1. The answer must contain exactly one code block with JSON — nothing before or after. If the photo shows several banks, return all of them as separate objects in one JSON array:',
    '2. "subcategory" — null, если подкатегории нет. "percent" — число без знака %, можно дробное (например 3.5).':
      '2. "subcategory" is null when there is none. "percent" is a number without the % sign, decimals allowed (e.g. 3.5).',
    '3. Максимально согласуй ответ с моими справочниками ниже: если банк или категория уже есть в списках, используй точно такое же написание. Новую категорию называй коротко (1–3 слова).':
      '3. Match my dictionaries below as closely as possible: if a bank or category already exists, use the exact same spelling. Name new categories briefly (1–3 words).',
    '4. Если данных на фото не хватает (не видно процентов, категорию или срок действия) — сначала задай мне уточняющие вопросы и дождись ответа; блок кода пока не присылай. Не выдумывай категории и проценты.':
      '4. If the photo lacks data (no visible percent, category or validity period) — ask me clarifying questions first and wait for answers; do not send a code block yet. Do not invent categories or percentages.',
    'Условия кешбэков банков (фото или текст) — вставьте ответ нейросети': 'Bank cashback terms (photo or text) — paste the AI answer',

    // ── Дни недели, месяцы, длительности
    'Пн': 'Mon', 'Вт': 'Tue', 'Ср': 'Wed', 'Чт': 'Thu', 'Пт': 'Fri', 'Сб': 'Sat', 'Вс': 'Sun',
    'январь': 'January', 'февраль': 'February', 'март': 'March', 'апрель': 'April',
    'май': 'May', 'июнь': 'June', 'июль': 'July', 'август': 'August',
    'сентябрь': 'September', 'октябрь': 'October', 'ноябрь': 'November', 'декабрь': 'December',
    'января': 'January', 'февраля': 'February', 'марта': 'March', 'апреля': 'April',
    'мая': 'May', 'июня': 'June', 'июля': 'July', 'августа': 'August',
    'сентября': 'September', 'октября': 'October', 'ноября': 'November', 'декабря': 'December',
    'сейчас': 'now', '10 лет': '10 years',
    'Золото': 'Gold', 'Серебро': 'Silver', 'Палладий': 'Palladium', 'Платина': 'Platinum',
    'Брокерский счёт': 'Brokerage account',
    'Бывший VTBL (RSHL): с 26.12.2023 закрытый ЗПИФ-А, биржевые торги прекращены. Актуальной биржевой котировки нет.':
      'Former VTBL (RSHL): a closed ZPIF-A since 26.12.2023, exchange trading stopped. No current exchange quote.',
    ' · рыночная цена': ' · market price',
    ' мес.; автоматическое обновление.': ' mo.; auto-refresh',
    '. История: ': '. History: ',
    '. СЧА: ': '. NAV: ',
    'с ': 'from ',
    'Название актива для отображения:': 'Asset display name:',
    'Перевести средства': 'Transfer funds',
    'Свежая цена MOEX пока не получена; цену покупки можно указать вручную.':
      'No fresh MOEX price yet; the purchase price can be entered manually.',
    'Укажите вес в граммах (можно дробный) и цену покупки в рублях за грамм':
      'Enter the weight in grams (decimals allowed) and the purchase price in rubles per gram',
    'Укажите целое положительное количество и цену покупки в рублях':
      'Enter a positive whole quantity and the purchase price in rubles',
    'Дата покупки должна быть не позже сегодняшней даты и раньше погашения':
      'The purchase date must be no later than today and before maturity',
    'Укажите сумму операции': 'Enter the operation amount',
    'Укажите дату первой операции': 'Enter the first operation date',
    'Дата окончания не может быть раньше даты первой операции':
      'The end date cannot be earlier than the first operation date',

    // ── Сводка и проверка финансов (шаблонные строки)
    'Расчётный результат за год': 'Yearly result',
    'Расчётный результат за месяц': 'Monthly result',
    'Продуктов': 'Products',
    'Активы ': 'Assets ',
    ' · Долги ': ' · Debts ',
    'от активов · с учётом роста стоимости': 'of assets · value growth included',
    'от активов': 'of assets',
    'обязательств': 'liabilities',
    'из': 'of',
    'Состояние финансов': 'Financial health',
    'Проверьте котировки: ': 'Check quotes: ',
    ' бумаг': ' securities',
    'Жизнь при жизни': 'Life while living',

    ' года': ' yr', ' лет': ' yr', 'шт.': 'pcs',
  };

  function t(ru, params){
    if (typeof ru !== 'string') return ru;
    let s = ru;
    if (lang === 'en' && Object.prototype.hasOwnProperty.call(EN, ru)) s = EN[ru];
    if (params) for (const [k, v] of Object.entries(params)) s = s.split('{' + k + '}').join(String(v));
    return s;
  }

  function setLang(next){
    if (!supported.includes(next)) return;
    lang = next;
    try { localStorage.setItem(LANG_KEY, next); } catch {}
    if (typeof document !== 'undefined'){
      document.documentElement.lang = lang;
      document.dispatchEvent(new Event('i18nchange'));
    }
  }

  // Перевод статической разметки: data-i18n (текст), data-i18n-ph
  // (placeholder), data-i18n-title (title), data-i18n-aria (aria-label).
  // Пустой атрибут = ключ берётся из текущего содержимого и запоминается,
  // поэтому повторные применения и возврат на русский работают идемпотентно.
  function translateEl(el){
    if (el.dataset.i18n != null){
      if (!el.dataset.i18n) el.dataset.i18n = el.textContent.trim();
      el.textContent = t(el.dataset.i18n);
    }
    if (el.dataset.i18nPh != null){
      if (!el.dataset.i18nPh) el.dataset.i18nPh = el.getAttribute('placeholder') || '';
      el.setAttribute('placeholder', t(el.dataset.i18nPh));
    }
    if (el.dataset.i18nTitle != null){
      if (!el.dataset.i18nTitle) el.dataset.i18nTitle = el.getAttribute('title') || '';
      el.setAttribute('title', t(el.dataset.i18nTitle));
    }
    if (el.dataset.i18nAria != null){
      if (!el.dataset.i18nAria) el.dataset.i18nAria = el.getAttribute('aria-label') || '';
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    }
  }
  function applyStatic(root){
    if (typeof document === 'undefined') return;
    const scope = root || document;
    for (const el of scope.querySelectorAll('[data-i18n],[data-i18n-ph],[data-i18n-title],[data-i18n-aria]')) translateEl(el);
  }

  function localeTag(){ return lang === 'en' ? 'en-US' : 'ru-RU'; }

  if (typeof document !== 'undefined'){
    document.documentElement.lang = lang;
    document.addEventListener('DOMContentLoaded', () => applyStatic(document));
  }

  return { t, setLang, applyStatic, localeTag, get lang(){ return lang; } };
})();
