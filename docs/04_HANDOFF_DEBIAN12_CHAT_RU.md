# Handoff в новый чат (Debian 12) — Wallet Guard

Этот файл нужен для “переезда” в новый чат на вкладке Debian 12.  
Задача новому ассистенту: **прочитать этот файл**, затем **сделать деплой на Debian 12** и **пройти тест-план совместно с владельцем проекта**.

---

## 0) Что это за проект (1 абзац)

Wallet Guard — Telegram-бот + воркеры, которые:
- принимают **публичный ETH адрес** (read-only),
- делают **free preview** approvals,
- продают платный отчёт (Lite/Pro/Max) за крипто через **платёжный агрегатор (NOWPayments)**,
- автоматически детектят оплату и доставляют отчёт (CSV/HTML/PDF),
- для Max включают мониторинг на 30 дней (daily alerts при новых spenders/unlimited approvals).

---

## 1) Что уже реализовано (текущее состояние)

### 1.1 Компоненты
- **Telegram bot**: `src/bot/bot.ts`
  - /start, “Проверить кошелёк”, free preview (реальный), выбор тарифа
  - создание заказа в Postgres, создание инвойса через NOWPayments API
  - кнопки в отчёте: HIGH / revoke links / скачать CSV
- **payments-worker**: `src/workers/paymentsWorker.ts`
  - каждые 15с проверяет `PENDING_PAYMENT` и `EXPIRED`
  - опрашивает NOWPayments по `provider_payment_id` и ставит `PAID`
  - авто `EXPIRED` через 60 минут
- **reports-worker**: `src/workers/reportsWorker.ts`
  - `PAID → REPORTING → генерировать отчёт → сохранить → отправить → DELIVERED`
  - генерирует CSV/HTML/PDF по тарифу
  - для MAX создаёт мониторинг подписку на 30 дней
- **monitoring-worker**: `src/workers/monitoringWorker.ts`
  - daily рескан approvals, snapshot diff, алерты пользователю, деактивация истёкших
- **Approvals engine** (Ethereum): `src/reports/engine.ts`
  - Approval events via `eth_getLogs`, allowance snapshot, token metadata cache (Postgres),
    unlimited detection, spender type, risk scoring + actions + revoke links
- **Admin alerts**: `src/core/adminAlerts.ts`
  - ошибки бота/воркеров → сообщение на `ADMIN_TELEGRAM_ID` (если задан)

### 1.2 БД и миграции
- Миграции: `src/db/migrations/*.sql`
- Мигратор: `src/db/migrate.ts` (multi-migrations + `schema_migrations`)
- Таблицы: `users`, `orders`, `reports`, `monitoring_subscriptions`, `token_metadata`

### 1.3 Docker / Debian
- `docker-compose.yml` — db + bot + payments-worker + reports-worker + monitoring-worker
- `Dockerfile` — runtime на Playwright base image + Chromium (для PDF)
- Debian гайд: `docs/03_DEBIAN12_SETUP.md`

---

## 2) Что новому ассистенту нужно прочитать (обязательно)

1) `docs/project.md` — продуктовый+технический ТЗ (флоу, БД, UX).
2) `docs/01_REPORT_ENGINE.md` — правила approvals / risk scoring / форматы.
3) `docs/03_DEBIAN12_SETUP.md` — деплой на Debian 12 (обновлён под текущий репо).
4) `docs/02_TEST_PLAN_RU.md` — план тестирования (unit/integration/e2e + негативные).
5) `docs/CHANGELOG_RU.md` — что менялось по ходу разработки.

Опционально (для контекста): `docs/00_ROADMAP_RU.md`.

---

## 3) Роли: кто что делает (важно)

### 3.1 Что ассистент делает сам (в новом чате)
- Дает команды деплоя на Debian 12, проверяет логи, исправляет конфиги/ошибки в коде.
- Настраивает `.env` на сервере (НО значения секретов получает от владельца).
- Проверяет, что контейнеры стартуют, миграции применяются, PDF генерируется.
- Проводит “технические” тесты без участия владельца:
  - статус контейнеров, миграции, health-check логикой,
  - имитация `PAID` (если нужно) для проверки reports-worker (через SQL update) — по согласованию.

### 3.2 Что делает владелец проекта (вы)
Секреты/аккаунты и действия, которые ассистент сам не может сделать:
- **Telegram**:
  - создать бота у BotFather → дать `BOT_TOKEN`
  - узнать `ADMIN_TELEGRAM_ID` (ваш telegram user id)
- **Ethereum**:
  - дать рабочий `ETH_RPC_URL` (с нормальными лимитами на `eth_getLogs`)
- **Платёжный агрегатор (NOWPayments)**:
  - зарегистрировать аккаунт NOWPayments
  - настроить payout wallet (куда выводить средства)
  - сгенерировать `NOWPAYMENTS_API_KEY` и передать ассистенту
  - выполнить тестовую оплату по инвойсу/адресу, который выдаст бот

---

## 4) Деплой на Debian 12 — целевой сценарий (совместно)

### 4.1 Быстрый чеклист деплоя (ассистент ведёт, вы подтверждаете шаги)
- Установить Docker + Docker Compose plugin (по `docs/03_DEBIAN12_SETUP.md`)
- Клонировать репо на сервер
- Создать директории: `data/postgres`, `data/reports`
- Создать `.env` на сервере (в корне проекта) со значениями:
  - `BOT_TOKEN`
  - `ADMIN_TELEGRAM_ID`
  - `DATABASE_URL=postgresql://walletguard:walletguard@db:5432/walletguard`
  - `ETH_RPC_URL`
  - `NOWPAYMENTS_API_KEY`
  - `REPORTS_STORAGE_PATH=/data/reports`
  - (опционально) `ETH_APPROVALS_*` параметры
- `docker compose up -d --build`
- Применить миграции (варианты):
  - либо отдельным “одноразовым” запуском контейнера (ассистент подскажет команду),
  - либо временно выполнить `npm run db:migrate` локально на сервере (если доступно) — ассистент выберет вариант.
- Проверить логи всех сервисов
- (опционально) оформить systemd unit из гайда

### 4.2 Что проверяем сразу после деплоя
- `bot` отвечает на `/start`
- создаётся заказ, бот выдаёт адрес/сумму от NOWPayments
- payments-worker не падает, polls NOWPayments API
- reports-worker запускается (и умеет рендерить PDF — важно для MAX)
- monitoring-worker запускается и делает initial tick
- admin alerts приходят, если искусственно вызвать ошибку (по желанию)

---

## 5) Тестирование после деплоя (совместно) — что “сам” и что “с вами”

### 5.1 Ассистент сам (без ваших транзакций)
- Проверка миграций/таблиц
- Проверка “бот → создание заказа → кнопка Проверить оплату”
- Тест генерации отчёта через **симуляцию**:
  - вручную поставить конкретному заказу `status='PAID'` в БД (по согласованию)
  - дождаться reports-worker → получить CSV/HTML/PDF
- Проверка кнопок отчёта: HIGH / revoke links / скачать CSV

### 5.2 С вами (нужны действия с кошельком/оплатой)
- Реальная оплата по реквизитам NOWPayments:
  - вы оплачиваете инвойс/адрес, который выдаст бот
  - ассистент мониторит логи payments-worker → статус заказа становится `PAID`
  - reports-worker доставляет отчёт

### 5.3 Мониторинг MAX (совместно)
- Вы покупаете Max (или ассистент симулирует доставленный MAX order, если договоримся)
- Должна появиться запись в `monitoring_subscriptions` с `expires_at ~ +30 дней`
- Ассистент запускает monitoring tick (или ждём initial tick) и подтверждаем, что snapshot сохраняется

---

## 6) Известные ограничения/предупреждения для нового чата

- Approvals scan через **plain RPC + eth_getLogs** может быть тяжёлым:
  - используйте нормальный RPC (Alchemy/Infura/др.) или настройте `ETH_APPROVALS_*`
  - в отчёте появляются warnings при “обрезании” диапазона/пар/токенов
- `.env.example` не создаётся в этой среде, используется `env.example` (копировать в `.env`).

---

## 7) Первое сообщение новому ассистенту (готовый текст)

Скопируйте и отправьте в новый чат:

“Прочитай `docs/04_HANDOFF_DEBIAN12_CHAT_RU.md`, затем следуй ему: сначала деплой на Debian 12 по `docs/03_DEBIAN12_SETUP.md`, потом пройди тестирование по `docs/05_TEST_ROADMAP_RU.md`. В процессе говори, что ты делаешь сам, а где нужны мои действия (BotFather/ключи/NOWPayments/тестовая оплата).”


