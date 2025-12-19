# Публикация репозитория на GitHub (RU) — Wallet Guard

Цель: опубликовать текущий код на GitHub так, чтобы сервер (пользователь `walletguard`) мог делать `git push/pull` по SSH.

---

## Вариант A (рекомендуется): Deploy key с write-доступом (ключ только для этого репозитория)

### 1) На GitHub: создать пустой репозиторий
- GitHub → **New repository**
- Name: например `wallet-security-check-approvals-revoke`
- **Не** ставить галочки “Add a README / .gitignore / license” (у нас уже есть)
- Create repository

### 2) На GitHub: добавить deploy key
- Repo → **Settings** → **Deploy keys** → **Add deploy key**
- Title: `debian12-walletguard`
- Key: вставить публичный ключ сервера (строка начинается с `ssh-ed25519 ...`)
- Обязательно поставить галочку **Allow write access**
- Add key

### 3) На сервере: привязать remote и запушить

После того как репозиторий создан, берём SSH URL вида:
`git@github.com:<ORG_OR_USER>/<REPO>.git`

Дальше на сервере (в каталоге проекта):

```bash
git remote add origin git@github.com:<ORG_OR_USER>/<REPO>.git
git push -u origin main
```

---

## Вариант B: SSH key в аккаунт GitHub (ключ “на весь аккаунт”)

Если вы не хотите deploy key, можно добавить ключ в:
GitHub → Settings → **SSH and GPG keys** → New SSH key.

Минусы:
- ключ даст доступ к вашему аккаунту (обычно это нежелательно для прод-сервера).

---

## Проверка, что SSH доступ работает

На сервере:

```bash
ssh -T git@github.com
```

Ожидаемо: сообщение вида “Hi <user>! You've successfully authenticated…”.


