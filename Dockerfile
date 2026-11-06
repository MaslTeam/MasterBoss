# ==========================================
# ЭТАП 1: Сборка фронтенда (Node.js)
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /build

# Установка зависимостей фронтенда
COPY frontend/package*.json ./
RUN npm install

# Копирование исходников и сборка Vite SPA
COPY frontend/ ./
ARG VITE_API_URL=""
ARG VITE_VAPID_PUBLIC_KEY="BDwLS9UhWmV794dMkB0ZJQ5_-tsz3eNLuCrNM4UHMh7XxDVq3v-2_8OxNYKcqa-MOqESfJGsK6A_r_PAp22p6q4"
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_VAPID_PUBLIC_KEY=${VITE_VAPID_PUBLIC_KEY}

RUN npm run build

# ==========================================
# ЭТАП 2: Запуск полного приложения (Python)
# ==========================================
FROM python:3.11-slim AS runner

WORKDIR /app

# Установка системных зависимостей для сборки cryptography
# tzdata нужен, чтобы datetime.now() работал по московскому времени
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Московский часовой пояс для всего контейнера (слоты, напоминания, правило отмены за 24 ч)
ENV TZ=Europe/Moscow
# Логи (включая PIN первого мастера) должны появляться сразу, а не после заполнения буфера
ENV PYTHONUNBUFFERED=1

# Установка Python-библиотек
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Копирование исходников бэкенда
COPY backend/ ./backend/

# Копирование собранного фронтенда
COPY --from=frontend-builder /build/dist ./frontend/dist

# Папка для сохранения базы данных SQLite.
# /data — путь по умолчанию для постоянного хранилища Amvera и томов Docker.
RUN mkdir -p /data
ENV DB_PATH=/data/masterboss.db
ENV FRONTEND_DIST=/app/frontend/dist
ENV PORT=8000

WORKDIR /app/backend

EXPOSE 8000

# Запуск Uvicorn-сервера.
# На Amvera (AMVERA=1) всегда слушаем 8000 — этот же порт указан в amvera.yml
# (run.containerPort). На Render/других PaaS используется их переменная PORT.
CMD ["sh", "-c", "if [ \"$AMVERA\" = \"1\" ]; then PORT=8000; fi; exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
