"""
Авторизация кабинета мастера.

- PIN хранится хэшем (PBKDF2-SHA256, соль на каждого мастера).
- После входа мастер получает подписанный токен (HMAC-SHA256) на 30 дней.
- Токен передаётся в заголовке  Authorization: Bearer <токен>.
- Middleware проверяет токен для всех /api/app/* (кроме публичных адресов)
  и кладёт id и slug мастера в request.state — эндпоинты берут slug ТОЛЬКО оттуда,
  поэтому подменить ?slug=чужой_мастер в адресе нельзя.

Секрет подписи — переменная окружения SECRET_KEY. Если её нет, секрет генерируется
при старте: всё работает, но после перезапуска сервера всем придётся войти заново.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from typing import Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

TOKEN_TTL_SECONDS = 30 * 24 * 3600

_SECRET = os.getenv("SECRET_KEY", "").strip()
if not _SECRET:
    _SECRET = secrets.token_hex(32)
    print("[Auth] SECRET_KEY не задан — сгенерирован временный. Задайте SECRET_KEY в окружении, "
          "иначе после перезапуска мастерам придётся входить заново.", flush=True)
_SECRET_BYTES = _SECRET.encode()

# Адреса /api/app/*, которые открыты без токена (ими пользуется клиентская страница записи)
PUBLIC_APP_PATHS = {
    "/api/app/login",
    "/api/app/register",
    "/api/app/notifications/push-subscribe",   # клиент; подписку мастера эндпоинт проверяет сам
    "/api/app/waitlist/subscribe",
    "/api/app/waitlist/check",
}

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$")
RESERVED_SLUGS = {
    "app", "api", "c", "admin", "assets", "register", "login", "docs", "static",
    "sw", "demo", "help", "support", "masterboss",
}


# ---------------------------------------------------------------------
# PIN
# ---------------------------------------------------------------------
def hash_pin(pin: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt.encode(), 200_000).hex()
    return f"pbkdf2${salt}${digest}"


def is_hashed(stored: str) -> bool:
    return bool(stored) and stored.startswith("pbkdf2$")


def verify_pin(pin: str, stored: str) -> bool:
    """Проверяет PIN. Поддерживает старые PIN в открытом виде (до хэширования)."""
    if not stored:
        return False
    if not is_hashed(stored):
        return hmac.compare_digest(pin, stored)
    try:
        _, salt, digest = stored.split("$", 2)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt.encode(), 200_000).hex()
    return hmac.compare_digest(check, digest)


def validate_pin_format(pin: str) -> Optional[str]:
    """Возвращает текст ошибки или None."""
    if not re.fullmatch(r"\d{4,8}", pin or ""):
        return "PIN — от 4 до 8 цифр"
    if pin in {"0000", "1111", "1234", "12345", "123456", "4321"}:
        return "Слишком простой PIN. Придумайте другой"
    return None


def validate_slug(slug: str) -> Optional[str]:
    if not SLUG_RE.fullmatch(slug or ""):
        return "Адрес: 3–30 символов, латиница, цифры и дефис, без дефиса в начале и конце"
    if slug in RESERVED_SLUGS:
        return "Этот адрес зарезервирован. Выберите другой"
    return None


# ---------------------------------------------------------------------
# Токен
# ---------------------------------------------------------------------
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_token(master_id: int, slug: str) -> str:
    payload = _b64(json.dumps({"mid": master_id, "slug": slug, "exp": int(time.time()) + TOKEN_TTL_SECONDS}).encode())
    signature = _b64(hmac.new(_SECRET_BYTES, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def read_token(token: str) -> Optional[dict]:
    try:
        payload, signature = token.split(".", 1)
        expected = _b64(hmac.new(_SECRET_BYTES, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, signature):
            return None
        data = json.loads(_unb64(payload))
        if int(data.get("exp", 0)) < time.time():
            return None
        return data
    except Exception:
        return None


def token_from_request(request: Request) -> Optional[dict]:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return read_token(header[7:].strip())
    return None


# ---------------------------------------------------------------------
# Middleware и зависимости
# ---------------------------------------------------------------------
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/app/") and path not in PUBLIC_APP_PATHS and request.method != "OPTIONS":
        data = token_from_request(request)
        if not data:
            return JSONResponse(status_code=401, content={"detail": "Нужно войти в кабинет"})
        request.state.master_id = int(data["mid"])
        request.state.master_slug = str(data["slug"])
    return await call_next(request)


def auth_slug(request: Request) -> str:
    """Зависимость FastAPI: slug мастера из токена (параметр ?slug= в адресе игнорируется)."""
    slug = getattr(request.state, "master_slug", None)
    if not slug:
        raise HTTPException(status_code=401, detail="Нужно войти в кабинет")
    return slug


def auth_master_id(request: Request) -> int:
    """Зависимость FastAPI: id мастера из токена."""
    mid = getattr(request.state, "master_id", None)
    if not mid:
        raise HTTPException(status_code=401, detail="Нужно войти в кабинет")
    return mid
