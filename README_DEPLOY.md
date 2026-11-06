# 🚀 Руководство по деплою проекта МастерБосс (MasterBoss)

Сервис полностью подготовлен к релизу: все тестовые и демонстрационные данные удалены, база данных очищена, фронтенд и бэкенд объединены для быстрого fullstack-развертывания в едином контейнере или сервисе.

---

## 📋 Исходное состояние после очистки

- **База данных (`masterboss.db`):** 
  - Клиентов: `0`
  - Записей: `0`
  - Финансовых транзакций: `0` (баланс `0 ₽`)
  - Подписок: `0`
  - Создан чистый мастер: slug `anna`; PIN берётся из `INITIAL_MASTER_PIN` (если переменная пустая — случайный, печатается в лог при старте)
  - Демо-кабинет `demo` для показа: вход без PIN по адресу `/demo`, данные пересоздаются при каждом старте
  - Добавлены 4 базовые услуги (мастер может отредактировать или удалить их в настройках)
- **Удалены временные и отладочные файлы:** `api_resp.json`, `check_enc.txt`.
- **Созданы конфигурации:** [Dockerfile](file:///./Dockerfile), [docker-compose.yml](file:///./docker-compose.yml), [.gitignore](file:///./.gitignore), [.env.example](file:///./.env.example).

---

## ☁️ ВАРИАНТ 1: Amvera Cloud (рекомендуемый для этого проекта)

Проект уже содержит `Dockerfile` и `amvera.yml`: Amvera собирает единый контейнер,
в котором FastAPI раздаёт и API, и собранный React-фронтенд.

### Шаг 1. Создайте приложение
1. Войдите в [cloud.amvera.ru](https://cloud.amvera.ru) → **Создать проект** → **Приложение**.
2. Выберите тариф не ниже **«Начальный»** (на «Пробном» 100 МБ ОЗУ может не хватить
   для сборки Node.js + Python и для работы SQLite).
3. Задайте имя проекта (например, `masterboss`).

### Шаг 2. Подключите репозиторий
Вкладка **«Репозиторий»** → **GitHub**:
- выберите репозиторий `MaslTeam/MasterBoss`;
- целевую ветку — `main`;
- создайте webhook-секрет и добавьте его в GitHub
  (Settings → Webhooks → Add webhook, Content-type `application/json`, событие **Push**).

После `git push` в `main` Amvera автоматически подтянет код и запустит сборку.

> Если GitHub-интеграция не нужна, можно пушить напрямую в Amvera:
> ```bash
> git remote add amvera https://git.amvera.ru/<логин>/<имя-проекта>
> git push amvera main:master
> ```

### Шаг 3. Проверьте конфигурацию
В корне репозитория уже лежит `amvera.yml`:
```yaml
run:
  containerPort: 8000   # uvicorn слушает 8000; без этого Amvera ждёт приложение на 80 → 502
  persistenceMount: /data  # постоянное хранилище для SQLite
```
`Dockerfile` кладёт базу в `/data/masterboss.db`, поэтому после пересборки данные не теряются.

### Шаг 4. Добавьте переменные и секреты
Вкладка **«Переменные»** → **Добавить переменную или секрет**:

| Имя | Тип | Значение |
|---|---|---|
| `GIGACHAT_CREDENTIALS` | секрет | ключ GigaChat API (Authorization key) |
| `GIGACHAT_MODEL` | переменная | `GigaChat-2` |
| `GIGACHAT_SCOPE` | переменная | `GIGACHAT_API_PERS` (для физлица) |
| `SECRET_KEY` | секрет | случайная строка: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `INITIAL_MASTER_PIN` | секрет | PIN мастера `anna`, 4–8 цифр, не `1234` |
| `PUBLIC_URL` | переменная | `https://<ваш-домен>` — нужен для ссылок в напоминаниях |
| `CORS_ORIGINS` | переменная | `https://<ваш-домен>` (или `*`) |
| `VAPID_PUBLIC_KEY` | переменная | `BDwLS9UhWmV794dMkB0ZJQ5_-tsz3eNLuCrNM4UHMh7XxDVq3v-2_8OxNYKcqa-MOqESfJGsK6A_r_PAp22p6q4` |
| `VAPID_PRIVATE_KEY` | секрет | см. блок ниже |
| `VAPID_EMAIL` | переменная | `mailto:ваша-почта@example.com` |

**VAPID_PRIVATE_KEY (push-уведомления).** Приватный ключ не хранится в git.
Возьмите значение из локального файла `backend/vapid_private.pem` (он уже соответствует
публичному ключу выше) и вставьте **всё содержимое PEM** в секрет, включая строки
`-----BEGIN PRIVATE KEY-----` и `-----END PRIVATE KEY-----`.

Если интерфейс не принимает многострочное значение:
1. Разверните проект один раз.
2. Во вкладке **«Репозиторий» → Data** загрузите файл `vapid_private.pem`.
3. Укажите `VAPID_PRIVATE_KEY=/data/vapid_private.pem` и перезапустите приложение.

Без корректного приватного ключа сайт работает, но push-уведомления не отправляются.

### Шаг 5. Соберите и проверьте
Нажмите **«Собрать»** (или сделайте push). Дождитесь статуса **«Успешно развернуто»**.
Проверка:
- `https://<домен>/api/health` → `{"status":"ok",...}`
- `https://<домен>/` → лендинг
- `https://<домен>/app` → вход в кабинет мастера
- `https://<домен>/demo` → демо-кабинет без PIN

Если открывается 502 — приложение слушает не тот порт: проверьте `run.containerPort: 8000`
и что в логах есть `Uvicorn running on http://0.0.0.0:8000`.

### Шаг 6. Домен и HTTPS
Вкладка **«Домены»** → **Добавить доменное имя** → тип **HTTPS** → **Бесплатный домен Амвера**
(вид `https://<проект>-<логин>.<регион>.amvera.tech`). HTTPS обязателен для Service Worker
и Web Push. После выдачи домена обновите `PUBLIC_URL` и `CORS_ORIGINS` и перезапустите контейнер.

### Шаг 7. Первый вход
1. Откройте `/app`.
2. Адрес страницы — `anna`, PIN — из `INITIAL_MASTER_PIN`
   (если переменная не задана, PIN печатается в лог при первом старте).
3. Вкладка **«Профиль»**: смените имя, нишу и PIN, проверьте услуги и цены.
4. Ссылка для клиентов: `https://<домен>/c/anna`.

> ⚠️ Сразу смените PIN: `1234` и подобные простые комбинации сервис не принимает,
> но PIN из лога нужно считать до того, как он попадёт к посторонним.

---

## 🛠️ ВАРИАНТ 2: Деплой через Docker Compose (VPS / VDS)

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
- `SECRET_KEY` — длинная случайная строка для подписи входа (`python -c "import secrets; print(secrets.token_hex(32))"`).
- `INITIAL_MASTER_PIN` — PIN первого мастера `anna` (4–8 цифр).
- `PUBLIC_URL` — адрес сайта, например `https://masterboss.onrender.com`.
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

## ☁️ ВАРИАНТ 3: Деплой на PaaS (Render / Railway / Timeweb Cloud Apps)

### Render.com:
1. Создайте новый **Web Service** и подключите ваш GitHub-репозиторий.
2. В настройках:
   - **Environment:** `Docker`
   - **Dockerfile Path:** `./Dockerfile`
3. В разделе **Environment Variables** добавьте:
   - `GIGACHAT_CREDENTIALS` = ваш токен
   - `GIGACHAT_MODEL` = `GigaChat-2`
   - `PORT` = `8000`
4. В разделе **Disks** (при наличии платного тарифа) подключите диск на путь `/data`, либо база будет создаваться в директории приложения.
5. Нажмите **Deploy**.

---

## 🌐 ВАРИАНТ 4: Ручной запуск на сервере (без Docker)

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
2. Введите адрес страницы `anna` и PIN из переменной `INITIAL_MASTER_PIN` (или из лога первого запуска). Новые мастера регистрируются сами на `/register`
3. Откройте вкладку **«Профиль»** и при желании:
   - Смените имя мастера и нишу.
   - Смените PIN-код на свой личный.
   - Отредактируйте цены и длительность процедур.
4. Ссылка для записи клиентов: `https://your-domain.ru/c/anna`
