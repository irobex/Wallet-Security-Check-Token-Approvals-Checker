# Roadmap тестирования (RU) — Wallet Guard

Этот документ — **живой чеклист тестирования**. Мы идём по пунктам сверху вниз и **после каждого прогона** отмечаем статус + короткий результат.

Связанные документы:
- `docs/04_HANDOFF_DEBIAN12_CHAT_RU.md` — роли (что делаю я, что делаете вы).
- `docs/03_DEBIAN12_SETUP.md` — деплой на Debian 12.
- `docs/02_TEST_PLAN_RU.md` — “старый” тест-план (как идеи/набор кейсов; этот roadmap — основной рабочий).

---

## Как отмечаем прогресс

Статусы:
- `[ ]` — не проверено
- `[~]` — в процессе / частично
- `[x]` — прошло
- `[!]` — провалилось (нужно чинить)

Формат заметки после пункта (коротко, прямо в строке):
- `— YYYY-MM-DD: OK (…коротко…)`
- или `— YYYY-MM-DD: FAIL (…что сломалось… / ссылка на лог / что чинить…)`

---

## 0) Preconditions (окружение/секреты)

### 0.1 Секреты (нужны ваши действия)
- [ ] **Telegram**: есть `BOT_TOKEN` (BotFather) — без него бот не стартует.
- [ ] **Telegram**: есть `ADMIN_TELEGRAM_ID` (ваш user id) — для админ-алертов.
- [ ] **Ethereum**: есть рабочий `ETH_RPC_URL` с адекватными лимитами на `eth_getLogs`.
- [ ] **TRON**: есть `TRONGRID_API_KEY`.
- [ ] **TRON**: есть `TRON_MNEMONIC` (HD кошелёк).

### 0.2 Конфиги (делаю я)
- [ ] `.env` заполнен и **не коммитится**.
- [ ] `DATABASE_URL` корректный для режима запуска:
  - docker compose: `postgresql://walletguard:walletguard@db:5432/walletguard`
  - локально + db в docker: `postgresql://walletguard:walletguard@localhost:5432/walletguard`
- [ ] `REPORTS_STORAGE_PATH` совпадает с ожидаемой директорией хранения (в docker обычно `/data/reports`).
- [ ] Параметры скана approvals (опционально): `ETH_APPROVALS_*` выставлены разумно (range cap/chunk size).

---

## 1) Infra smoke (Docker / Postgres / миграции)

- [x] `docker compose up -d db` поднимает Postgres без ошибок. — 2025-12-19: OK
- [x] Миграции проходят на чистой БД (созданы таблицы, включая `token_metadata`, `tron_hd_state`). — 2025-12-19: OK (`node dist/db/migrate.js`)
- [x] Полный стек поднимается: `docker compose up -d --build` и все сервисы в `docker compose ps` = running. — 2025-12-19: OK
- [~] Логи без фаталов:
  - `docker compose logs -f bot`
  - `docker compose logs -f payments-worker`
  - `docker compose logs -f reports-worker`
  - `docker compose logs -f monitoring-worker`
  - 2025-12-19: OK (есть только DeprecationWarning про `punycode`, без падений)

---

## 2) Bot UX (ручные сценарии в Telegram)

- [~] `/start` показывает read-only дисклеймер (не просит seed/private key/подпись). — 2025-12-19: нужен ваш прогон в Telegram
- [~] “Проверить кошелёк” → ввод **валидного** `0x...` запускает free preview. — 2025-12-19: первый прогон на `0x000…000` упёрся в RPC/лимиты; теперь zero-address запрещён, нужен повтор на реальном адресе
- [ ] Невалидный ETH-адрес → корректная ошибка (без падения процесса).
- [ ] Free preview содержит реальные поля: approvals total / unlimited count / top tokens (и не занимает “вечность”).

---

## 3) Approvals engine (Ethereum RPC / лимиты / деградация)

- [ ] На “обычном” адресе скан проходит в разумное время, без ошибок `eth_getLogs`.
- [ ] При RPC ошибках/лимитах:
  - бот/воркер не падает
  - пользователю/админу уходит понятное сообщение
- [ ] При превышении лимитов (тяжёлый адрес) система деградирует предсказуемо и пишет warnings в отчёт (capped range/tokens/pairs).

---

## 4) Orders & TRON pay-address (HD)

- [ ] Создание заказа в боте: статус `PENDING_PAYMENT`, выводится TRON-адрес.
- [ ] 2–3 заказа подряд → адреса **разные**, `hd_index` растёт.
- [ ] Кнопка “Проверить оплату” показывает реальный статус из БД (без “магии”).

---

## 5) Payments worker (TronGrid / идемпотентность / EXPIRED)

### 5.1 Без реальной оплаты (делаю я)
- [ ] Worker стабильно тикает (каждые ~15с), не падает при пустых данных.
- [ ] Заказ истекает через 60 минут: `PENDING_PAYMENT/CREATED` → `EXPIRED`.

### 5.2 С реальной оплатой (нужны ваши действия)
- [ ] Вы делаете **тестовую оплату USDT TRC20** на адрес заказа (сумма тарифа).
- [ ] Payments worker находит входящий Transfer и переводит заказ в `PAID`.
- [ ] Идемпотентность: один `tx_hash` не “прилипает” к двум заказам; повторная обработка не ломает доставку.

### 5.3 Оплата после EXPIRED (совместно, по желанию)
- [ ] Заказ был `EXPIRED`, потом пришла оплата → всё равно становится `PAID` и отчёт доставляется (MVP правило).

---

## 6) Reports worker (CSV/HTML/PDF + доставка)

### 6.1 Симуляция оплаты (делаю я, чтобы не ждать перевод)
- [ ] Мы можем согласованно “симулировать” `PAID` (SQL update) и проверить генерацию отчётов.
- [ ] Order проходит `PAID → REPORTING → DELIVERED` без дублей/зависаний.

### 6.2 Артефакты и доставка
- [ ] **CSV** генерируется всегда и реально скачивается.
- [ ] **HTML** генерируется для Pro/Max и отправляется/доступен пользователю.
- [ ] **PDF** генерируется для Max (Playwright/Chromium) и отправляется/доступен пользователю.

### 6.3 Кнопки отчёта
- [ ] “Показать HIGH” выдаёт только HIGH items.
- [ ] “Revoke links” выдаёт корректные revoke-ссылки.
- [ ] “Скачать CSV” отдаёт файл/ссылку на файл.

---

## 7) Monitoring worker (Max 30 дней)

- [ ] После покупки Max создаётся запись в `monitoring_subscriptions` с `expires_at ~ +30 дней`.
- [ ] Monitoring worker делает initial tick и сохраняет snapshot.
- [ ] При появлении новых risky approvals (новый spender / unlimited) отправляется alert пользователю.
- [ ] По истечению `expires_at` подписка деактивируется.

---

## 8) Admin alerts (уведомления админу)

- [ ] При ошибке в bot/workers отправляется уведомление на `ADMIN_TELEGRAM_ID`.
- [ ] В алерте нет секретов (mnemonic/API keys).

---

## 9) Security & compliance (обязательное)

- [ ] Бот нигде не просит seed/private key/подпись.
- [ ] Логи не содержат секреты: `TRON_MNEMONIC`, `BOT_TOKEN`, `TRONGRID_API_KEY`.
- [ ] `.env` не попадает в git/артефакты.

---

## 10) Performance (MVP ориентиры)

- [ ] Lite: типичный прогон укладывается примерно в <= 20s.
- [ ] Pro: <= 60s.
- [ ] Max: <= 90s (включая PDF).
- [ ] Нагрузочный кейс (тяжёлый адрес) не “кладёт” сервисы (деградация + warning вместо падения).

---

## 11) Операционные проверки (после деплоя)

- [ ] Перезапуск сервисов не ломает идемпотентность (нет дублей доставок).
- [ ] После reboot сервера (если используем systemd) сервис поднимается автоматически.
- [ ] Бэкап (минимум): `pg_dump` и архив `data/reports` выполняются без сюрпризов.

---

## Журнал прогонов (сюда добавляем записи)

### YYYY-MM-DD — <кратко что прогоняли>
- **Скоуп**: infra / bot / payments / reports / monitoring / security / perf
- **Результат**: PASS / FAIL
- **Заметки**:
  - ...

### 2025-12-19 — Infra smoke + миграции + старт сервисов
- **Скоуп**: infra
- **Результат**: PASS
- **Заметки**:
  - Postgres поднят, volume permissions выровнены (host bind-mount `data/postgres` должен быть owned by UID 999).
  - Миграции `001_init.sql`, `002_token_metadata.sql` применены.
  - Все сервисы поднялись и не падают.

### 2025-12-19 — Bot UX: первый прогон (обнаружены лимиты RPC и проблема Postgres permissions)
- **Скоуп**: bot / infra
- **Результат**: FAIL
- **Заметки**:
  - Free preview на `0x000…000` упёрся в лимиты провайдера (Infura) → бот показал fallback (“выберите тариф”).
  - При этом прилетел admin alert от reports-worker из-за `pg_filenode.map: Permission denied` (Postgres bind-mount).
  - Фиксы: Postgres переведён на named volume, zero-address заблокирован; нужен повторный прогон на реальном адресе.

### 2025-12-19 — E2E: оплата 3 USDT TRC20 + доставка отчёта (с ретраями Infura)
- **Скоуп**: payments / reports
- **Результат**: PASS *(после фикса троттлинга/ретраев)*
- **Заметки**:
  - Платёж на TRON-адрес заказа найден, заказ стал `PAID`.
  - Первичная генерация упала на Infura rate limit `-32005 Too Many Requests`, но после включения троттлинга/ретраев отчёт успешно доставлен.
  - Заказ завершён `DELIVERED`, CSV сгенерирован.



### 2025-12-19 — TRON auto-sweep: восстановление зависшей оплаты (OUT_OF_ENERGY) + фиксы
- **Скоуп**: payments
- **Результат**: PASS
- **Заметки**:
  - Обнаружено: USDT sweep мог "успешно" возвращать `txid`, но фактически транзакция завершалась `OUT_OF_ENERGY` (receipt), из-за чего USDT оставался на pay-адресе, а TRX расходовался.
  - Фикс: sweep теперь ждёт receipt, валится на failed-результате с понятным сообщением, и при `OUT_OF_ENERGY` увеличивает TRX на pay-адресе + повторяет попытку.
  - Практика: восстановили уже полученные **3 USDT** со старого pay-адреса `TDaN1sDt5uQNnBBqDy27Ph2qhtpE49XLY1` на `TUwhDsN2T2mj7JsYySHhywQBfW4SkDjMgA`.
  - Tx:
    - topup TRX: `7a06f3fb60bc117f0ede58e1308b93e80ab830b406650b2fdac0f679a7bc3dcf`
    - sweep USDT: `81359de0e59433856a8e5b853326f0e6040592a674acaa65e2637adeec7cee3e`
