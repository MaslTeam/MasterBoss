# 🚀 Руководство по деплою проекта МастерБосс (MasterBoss)

Сервис полностью подготовлен к релизу: все тестовые и демонстрационные данные удалены, база данных очищена, фронтенд и бэкенд объединены для быстрого fullstack-развертывания в едином контейнере или сервисе.

---

## 📋 Исходное состояние после очистки

- **База данных (`masterboss.db`):** 
  - Клиентов: `0`
  - Записей: `0`
  - Финансовых транзакций: `0` (баланс `0 ₽`)
  - Подписок: `0`
  - Создан чистый мастер: slug `anna`, PIN `1234`
  - Добавлены 4 базовые услуги (мастер может отредактировать или удалить их в настройках)
- **Удалены временные и отладочные файлы:** `api_resp.json`, `check_enc.txt`.
- **Созданы конфигурации:** [Dockerfile](file:///./Dockerfile), [docker-compose.yml](file:///./docker-compose.yml), [.gitignore](file:///./.gitignore), [.env.example](file:///./.env.example).

---

## 🛠️ ВАРИАНТ 1: Деплой через Docker Compose (Рекомендуемый, самый простой)

Подходит для любого сервера (VPS / VDS на Ubuntu / Debian: Timeweb, Selectel, Beget, Reg.ru, Hetzner и др.).

### Шаг 1. Скопируйте проект на сервер
```bash
git clone <ваш-репозиторий> /opt/masterboss
cd /opt/masterboss
```
*(Либо загрузите архив через SCP/FileZilla в папку `/opt/masterboss`)*

### Шаг 2. Создайте файл `.env` на сервере
Скопируйте шаблон:
```bash
cp .env.example .env
```
При необходимости отредактируйте:
- `GIGACHAT_CREDENTIALS` — ваш ключ GigaChat API.
- `PORT=8000` — порт, на котором будет доступно приложение.

### Шаг 3. Запустите контейнер
```bash
docker compose up -d --build
```
Все! Приложение автоматически:
1. Соберет фронтенд через Node.js.
2. Установит Python-зависимости бэкенда.
3. Смонтирует том `masterboss_data` (база данных сохранится даже при перезагрузке и обновлении контейнера).
4. Запустит сервис на порту `8000`.

---

## ☁️ ВАРИАНТ 2: Деплой на PaaS (Render / Railway / Timeweb Cloud Apps)

### Render.com:
1. Создайте новый **Web Service** и подключите ваш GitHub-репозиторий.
2. В настройках:
   - **Environment:** `Docker`
   - **Dockerfile Path:** `./Dockerfile`
3. В разделе **Environment Variables** добавьте:
   - `GIGACHAT_CREDENTIALS` = ваш токен
   - `GIGACHAT_MODEL` = `GigaChat-2`
   - `PORT` = `8000`
4. В разделе **Disks** (при наличии платного тарифа) подключите диск на путь `/app/data`, либо база будет создаваться в директории приложения.
5. Нажмите **Deploy**.

---

## 🌐 ВАРИАНТ 3: Ручной запуск на сервере (без Docker)

### 1. Сборка фронтенда:
```bash
cd frontend
npm install
npm run build
cd ..
```

### 2. Запуск бэкенда:
```bash
cd backend
python -m venv venv
source venv/bin/activate    # на Linux (или venv\Scripts\activate на Windows)
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
Так как бэкенд теперь автоматически раздает собранную папку `frontend/dist`, приложение целиком доступно на порту `8000`.

---

## 🔒 Настройка домена и бесплатного SSL (HTTPS) через Nginx

Для работы Web Push уведомлений и Service Worker браузеры **требуют HTTPS**.

### 1. Установите Nginx и Certbot:
```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Создайте конфигурацию Nginx (`/etc/nginx/sites-available/masterboss`):
```nginx
server {
    server_name your-domain.ru www.your-domain.ru;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Активируйте сайт и выпустите SSL:
```bash
sudo ln -s /etc/nginx/sites-available/masterboss /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.ru -d www.your-domain.ru
```

---

## 🔑 Вход в личный кабинет после деплоя

После открытия вашего сайта:
1. Перейдите по адресу: `https://your-domain.ru/app`
2. Введите PIN-код по умолчанию: **`1234`**
3. Откройте вкладку **«Настройки»** (иконка шестеренки) и при желании:
   - Смените имя мастера и нишу.
   - Смените PIN-код на свой личный.
   - Отредактируйте цены и длительность процедур.
4. Ссылка для записи клиентов: `https://your-domain.ru/c/anna`
