# Debian 12 Setup — Wallet Guard (Telegram bot + workers) via Docker Compose

Этот гайд поднимает Wallet Guard на **Debian 12** как долгоживущий сервис через Docker Compose.

### Что потребуется заранее (вы готовите)
- `BOT_TOKEN` (BotFather)
- `ADMIN_TELEGRAM_ID` (ваш Telegram user id) — для алертов
- `ETH_RPC_URL` (Ethereum RPC с нормальными лимитами на `eth_getLogs`)
- `TRONGRID_API_KEY`
- `TRON_MNEMONIC` (HD кошелёк; хранить в секрете)

---

## 1) SSH на сервер

```bash
ssh root@YOUR_SERVER_IP
```

---

## 2) Обновление системы и базовые пакеты

```bash
apt update
apt -y upgrade
apt -y install ca-certificates curl gnupg git ufw
```

---

## 3) Создать non-root пользователя

```bash
adduser walletguard
usermod -aG sudo walletguard
su - walletguard
```

---

## 4) Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

---

## 5) Установка Docker Engine + Docker Compose plugin

### 5.1 Добавить репозиторий Docker

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### 5.2 Установить

```bash
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 5.3 Разрешить пользователю запускать docker

```bash
sudo usermod -aG docker walletguard
newgrp docker
docker --version
docker compose version
```

---

## 6) Клонировать репозиторий

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/YOUR_GITHUB_USERNAME/wallet-security-check-approvals-revoke.git wallet-guard
cd wallet-guard
```

---

## 7) Создать persistent директории

```bash
mkdir -p data/reports
```

Примечание: Postgres хранится в **Docker named volume** (это защищает от проблем с правами на bind-mount).  
Поэтому `data/postgres` создавать не нужно.

---

## 8) Создать `.env` (production)

В корне проекта:

```bash
nano .env
```

Минимальный шаблон:

```bash
BOT_TOKEN=
ADMIN_TELEGRAM_ID=

DATABASE_URL=postgresql://walletguard:walletguard@db:5432/walletguard
REPORTS_STORAGE_PATH=/data/reports

ETH_RPC_URL=

TRON_MNEMONIC=
TRONGRID_API_KEY=

# Ethereum approvals scan tuning (optional)
ETH_APPROVALS_FROM_BLOCK=0
ETH_APPROVALS_CHUNK_SIZE=50000
ETH_APPROVALS_MAX_RANGE_BLOCKS=2000000
```

Важно:
- никогда не коммитьте `.env`
- держите `TRON_MNEMONIC` в секрете

---

## 9) Собрать образ

```bash
docker compose pull
docker compose build
```

---

## 10) Запуск Postgres + миграции

Сначала БД:

```bash
docker compose up -d db
```

Миграции (используем уже собранный `dist`, поэтому запускаем `node dist/db/migrate.js` внутри контейнера):

```bash
docker compose run --rm bot node dist/db/migrate.js
```

---

## 11) Запустить весь стек

```bash
docker compose up -d
docker compose ps
```

Проверить логи:

```bash
docker compose logs -f bot
docker compose logs -f payments-worker
docker compose logs -f reports-worker
docker compose logs -f monitoring-worker
```

---

## 12) Автозапуск (systemd)

```bash
sudo nano /etc/systemd/system/wallet-guard.service
```

Вставить:

```ini
[Unit]
Description=Wallet Guard (Telegram bot + workers)
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/walletguard/apps/wallet-guard
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0
User=walletguard
Group=walletguard

[Install]
WantedBy=multi-user.target
```

Активировать:

```bash
sudo systemctl daemon-reload
sudo systemctl enable wallet-guard.service
sudo systemctl start wallet-guard.service
sudo systemctl status wallet-guard.service --no-pager
```

---

## 13) Обновление (deploy новой версии)

```bash
cd ~/apps/wallet-guard
git pull
docker compose build --no-cache
docker compose up -d
docker compose logs -f
```

---

## 14) Бэкапы (минимум)

### 14.1 Postgres

```bash
docker compose exec -T db pg_dump -U walletguard walletguard > ~/walletguard_backup.sql
```

### 14.2 Отчёты

```bash
tar -czf ~/walletguard_reports_backup.tar.gz data/reports
```

---

## 15) Smoke checklist (после деплоя)

- бот отвечает на `/start`
- free preview работает на тестовом адресе
- создание заказа выдаёт уникальный TRON-адрес
- payments-worker видит TRC20 Transfer (после тестовой оплаты)
- reports-worker генерирует отчёт и доставляет в Telegram
- сервис переживает reboot (если включён systemd unit)