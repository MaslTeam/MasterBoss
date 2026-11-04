import os
import sys
import re
import json
import hmac
import secrets
import threading
import time
from datetime import datetime, timedelta
from typing import Optional

# Добавляем путь к backend для корректного импорта модулей
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Query, Request, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import or_
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from pywebpush import WebPushException, webpush

from database import engine, get_db, Base, SessionLocal
from models import Master, Client, Booking, Transaction, Service, PushSubscription, WaitlistSubscription
from schemas import (
    MasterResponse,
    BookingResponse,
    BookingStatusResponse,
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
    StatsResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    ServiceResponse,
    ServiceCreate,
    ServiceUpdate,
    MasterProfileUpdate,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    WorkScheduleUpdate,
    ClientResponse,
    AIExpenseRequest,
    AIExpenseResponse,
    AIReminderRequest,
    AIReminderResponse,
    ChangePinRequest,
    PushSubscriptionCreate,
    PushSubscriptionResponse,
    NotificationSend,
    UpcomingBookingNotification,
    ClientDueReturn,
    WaitlistSubscriptionCreate,
    WaitlistSubscriptionResponse,
    BusinessAuditResponse,
    ConflictResolverRequest,
    ConflictResolverResponse,
    CareCardResponse
)
import ai_parser
import auth
import demo_data
from auth import auth_slug, auth_master_id

# Автоматическое создание таблиц, если они еще не существуют
Base.metadata.create_all(bind=engine)


def _ensure_sqlite_columns():
    """create_all() не добавляет новые колонки в уже существующие таблицы.
    Добавляем их вручную, чтобы старая база (локальная или на диске сервера) не падала."""
    from sqlalchemy import inspect, text
    required = {
        "bookings": {"visited_at": "DATETIME", "source": "VARCHAR(20)", "ref": "VARCHAR(20)",
                     "client_token": "VARCHAR(64)", "created_at": "DATETIME"},
        "transactions": {"source": "VARCHAR(20)", "booking_id": "INTEGER"},
        "masters": {"work_schedule": "VARCHAR(500)", "slot_step_min": "INTEGER", "created_at": "DATETIME",
                    "is_demo": "BOOLEAN"},
        "clients": {"return_push_at": "DATETIME"},
        "push_subscriptions": {"client_id": "INTEGER"},
    }
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, columns in required.items():
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl_type in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl_type}"))
                    print(f"[DB migrate] {table}.{name} добавлена", flush=True)


_ensure_sqlite_columns()


def _init_default_data():
    """Создает чистый базовый профиль мастера 'anna' со стартовыми услугами, если БД пуста"""
    db = SessionLocal()
    try:
        master_count = db.query(Master).count()
        if master_count == 0:
            m = Master(
                name="Анна Nails",
                slug="anna",
                niche="Маникюр",
                trial_active=True,
                default_deposit=500,
                pin_code="1234"
            )
            db.add(m)
            db.commit()
            db.refresh(m)
            starter_services = [
                {"name": "Маникюр с покрытием", "price": 2500.0, "duration_min": 90},
                {"name": "Снятие + укрепление", "price": 2800.0, "duration_min": 120},
                {"name": "Педикюр с покрытием", "price": 3200.0, "duration_min": 90},
                {"name": "Экспресс-маникюр", "price": 1800.0, "duration_min": 45},
            ]
            for s in starter_services:
                db.add(Service(master_id=m.id, name=s["name"], price=s["price"], duration_min=s["duration_min"], is_active=True))
            db.commit()
    except Exception as e:
        print(f"[Init warning] {e}")
        db.rollback()
    finally:
        db.close()


_init_default_data()

# Инициализация приложения FastAPI
app = FastAPI(
    title="МастерБосс API",
    description="REST API бэкенд для сервиса МастерБосс (Web-PWA для частных мастеров)",
    version="1.2.0"
)

# Проверка токена для всех /api/app/* (кроме публичных адресов клиентской страницы)
app.middleware("http")(auth.auth_middleware)

# =====================================================================
# VAPID НАСТРОЙКИ ДЛЯ PUSH API
# =====================================================================
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_EMAIL = os.getenv("VAPID_EMAIL", "mailto:masterboss@example.com")


def _get_effective_vapid_key():
    """Получает валидный путь к файлу приватного ключа VAPID или саму строку ключа (при необходимости генерирует файл)"""
    priv_key = VAPID_PRIVATE_KEY
    default_pem = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vapid_private.pem")

    if not priv_key or priv_key == "ВАШ_VAPID_PRIVATE_KEY_ЗДЕСЬ" or priv_key == "vapid_private.pem":
        if os.path.isfile(default_pem):
            return default_pem
        try:
            import py_vapid
            v = py_vapid.Vapid()
            v.generate_keys()
            v.save_key(default_pem)
            return default_pem
        except Exception:
            return None

    # Если указан относительный путь к файлу
    if isinstance(priv_key, str) and not priv_key.startswith("-----BEGIN"):
        candidate_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), priv_key)
        if os.path.isfile(candidate_file):
            return candidate_file
        if priv_key.endswith(".pem"):
            try:
                import py_vapid
                v = py_vapid.Vapid()
                v.generate_keys()
                v.save_key(candidate_file)
                return candidate_file
            except Exception:
                pass
    return priv_key


def send_push_to_subscription(sub: PushSubscription, title: str, body: str, url: str = "/"):
    """Отправляет push-уведомление конкретной подписке браузера без фатальных падений"""
    priv_key = _get_effective_vapid_key()
    if not priv_key:
        # VAPID ключи не настроены — безопасно пропускаем отправку
        return False

    subscription_info = {
        "endpoint": sub.endpoint,
        "keys": {
            "p256dh": sub.p256dh,
            "auth": sub.auth
        }
    }

    payload = {
        "title": title,
        "body": body,
        "url": url,
        "icon": "/favicon.ico",
        "tag": "masterboss-push"
    }

    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=priv_key,
            vapid_claims={"sub": VAPID_EMAIL}
        )
        return True
    except WebPushException as e:
        if e.response and e.response.status_code in (410, 404, 403):
            # Подписка устарела или недействительна — удаляем
            db = SessionLocal()
            try:
                db.query(PushSubscription).filter(PushSubscription.endpoint == sub.endpoint).delete()
                db.commit()
            finally:
                db.close()
        return False
    except Exception as e:
        print(f"[WebPush warning] Не удалось отправить push: {e}")
        return False

# Настройка CORS (настраивается через переменную окружения CORS_ORIGINS)
cors_env = os.getenv("CORS_ORIGINS", "*").strip()
cors_origins_list = [o.strip() for o in cors_env.split(",") if o.strip()]
is_wildcard = "*" in cors_origins_list

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins_list if not is_wildcard else ["*"],
    allow_credentials=not is_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_datetime_str(dt_str: str) -> Optional[datetime]:
    """Разобрать слот в локальное datetime: '29.10, 10:00', 'Завтра, 17:30', '2026-10-29 10:00'."""
    if not dt_str:
        return None
    try:
        now = datetime.now()
        s = dt_str.strip()
        s_lower = s.lower()

        iso_match = re.match(r"(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})", s)
        if iso_match:
            y, mo, d, h, mi = map(int, iso_match.groups())
            return datetime(y, mo, d, h, mi)

        # Ищем время: сначала после запятой (формат "DD.MM, HH:MM"), иначе любое HH:MM
        time_match = re.search(r",\s*(\d{1,2})[:.](\d{2})", s)
        if not time_match:
            time_match = re.search(r"(\d{1,2})[:.](\d{2})", s)
        if not time_match:
            return None
        hour, minute = int(time_match.group(1)), int(time_match.group(2))

        if "послезавтра" in s_lower:
            target_date = now + timedelta(days=2)
        elif "завтра" in s_lower:
            target_date = now + timedelta(days=1)
        elif "сегодня" in s_lower:
            target_date = now
        else:
            date_match = re.search(r"(\d{1,2})\.(\d{1,2})", s)
            if not date_match:
                return None
            day, month = int(date_match.group(1)), int(date_match.group(2))
            target_year = now.year
            try:
                target_date = datetime(target_year, month, day)
            except ValueError:
                return None
            if target_date.date() < now.date():
                target_year += 1
                try:
                    target_date = datetime(target_year, month, day)
                except ValueError:
                    return None

        return target_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
    except Exception:
        return None


def slot_key(dt_str: str) -> Optional[str]:
    """Единый ключ слота 'DD.MM, HH:MM' — чтобы 'Завтра, 12:30' совпадало с календарным окном."""
    parsed = parse_datetime_str(dt_str)
    if parsed:
        return parsed.strftime("%d.%m, %H:%M")
    return dt_str.strip() if dt_str else None

def booking_visit_time(booking: Booking) -> Optional[datetime]:
    """Время визита: scheduled_at, а если его нет — разбор строки.
    parse_datetime_str переносит прошедшие даты на следующий год (это нужно для новых заявок),
    поэтому для уже прошедших визитов возвращаем год назад."""
    if booking.scheduled_at:
        return booking.scheduled_at
    parsed = parse_datetime_str(booking.datetime_str)
    if parsed and parsed - datetime.now() > timedelta(days=180):
        try:
            parsed = parsed.replace(year=parsed.year - 1)
        except ValueError:
            pass
    return parsed


# =====================================================================
# РАБОЧЕЕ РАСПИСАНИЕ МАСТЕРА И СВОБОДНЫЕ ОКНА
# =====================================================================
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DEFAULT_WORK_SCHEDULE = {d: ["10:00", "20:00"] for d in WEEKDAYS[:6]}
DEFAULT_WORK_SCHEDULE["sun"] = None
DEFAULT_DURATION_MIN = 60
SLOT_DAYS_AHEAD = 14


def get_work_schedule(master: Master) -> dict:
    """Расписание мастера; если не задано — пн–сб 10:00–20:00, воскресенье выходной."""
    try:
        data = json.loads(master.work_schedule) if master.work_schedule else None
    except (ValueError, TypeError):
        data = None
    if not isinstance(data, dict):
        return dict(DEFAULT_WORK_SCHEDULE)
    return {d: data.get(d) for d in WEEKDAYS}


def _to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def validate_work_schedule(schedule: dict) -> dict:
    """Проверяет и нормализует расписание. Бросает HTTPException с понятным текстом."""
    clean = {}
    for day in WEEKDAYS:
        value = schedule.get(day)
        if not value:
            clean[day] = None
            continue
        if not isinstance(value, list) or len(value) != 2:
            raise HTTPException(status_code=400, detail=f"{day}: нужно время начала и конца")
        start, end = value
        if not (re.fullmatch(r"\d{2}:\d{2}", start or "") and re.fullmatch(r"\d{2}:\d{2}", end or "")):
            raise HTTPException(status_code=400, detail=f"{day}: время в формате ЧЧ:ММ")
        if _to_minutes(start) >= _to_minutes(end):
            raise HTTPException(status_code=400, detail=f"{day}: начало должно быть раньше конца")
        clean[day] = [start, end]
    if not any(clean.values()):
        raise HTTPException(status_code=400, detail="Нужен хотя бы один рабочий день")
    return clean


def booking_duration(db: Session, booking: Booking) -> int:
    """Длительность записи по прайсу (по названию услуги), иначе 60 минут."""
    service = (
        db.query(Service)
        .filter(Service.master_id == booking.master_id, Service.name == booking.service_name)
        .first()
    )
    return service.duration_min if service and service.duration_min else DEFAULT_DURATION_MIN


def busy_intervals(db: Session, master_id: int) -> list:
    """Занятые интервалы [начало, конец) по ожидающим и подтверждённым записям."""
    result = []
    active = db.query(Booking).filter(
        Booking.master_id == master_id,
        Booking.status.in_(["pending", "confirmed"])
    ).all()
    for b in active:
        start = booking_visit_time(b)
        if start:
            result.append((start, start + timedelta(minutes=booking_duration(db, b))))
    return result


def is_slot_free(start: datetime, duration_min: int, busy: list) -> bool:
    end = start + timedelta(minutes=duration_min)
    return all(end <= b_start or start >= b_end for b_start, b_end in busy)


def generate_free_slots(db: Session, master: Master, duration_min: int) -> list:
    """Свободные окна на SLOT_DAYS_AHEAD дней по рабочему расписанию:
    процедура целиком помещается в рабочие часы и не пересекается с другими записями."""
    schedule = get_work_schedule(master)
    step = master.slot_step_min or 60
    busy = busy_intervals(db, master.id)
    now = datetime.now()
    slots = []
    for offset in range(0, SLOT_DAYS_AHEAD):
        day = (now + timedelta(days=offset)).date()
        hours = schedule.get(WEEKDAYS[day.weekday()])
        if not hours:
            continue
        day_start = datetime.combine(day, datetime.min.time()) + timedelta(minutes=_to_minutes(hours[0]))
        day_end = datetime.combine(day, datetime.min.time()) + timedelta(minutes=_to_minutes(hours[1]))
        t = day_start
        while t + timedelta(minutes=duration_min) <= day_end:
            # сегодня — только окна минимум через час
            if t >= now + timedelta(hours=1) and is_slot_free(t, duration_min, busy):
                slots.append(t.strftime("%d.%m, %H:%M"))
            t += timedelta(minutes=step)
    return slots


def client_token_ok(booking: Booking, token: Optional[str]) -> bool:
    """Проверка секрета клиента. У записей, созданных до Дня 5, секрета нет — их пропускаем."""
    if not booking.client_token:
        return True
    return bool(token) and hmac.compare_digest(token, booking.client_token)


def find_master_service(db: Session, master_id: int, service_id: Optional[int], service_name: str) -> Optional[Service]:
    """Ищет АКТИВНУЮ услугу мастера: сначала по id, затем по точному названию,
    затем по частичному совпадению («педикюр» → «Педикюр с покрытием»)."""
    active = db.query(Service).filter(Service.master_id == master_id, Service.is_active == True).all()
    if service_id:
        by_id = next((s for s in active if s.id == service_id), None)
        if by_id:
            return by_id
    name = (service_name or "").strip().lower()
    if not name:
        return None
    exact = next((s for s in active if s.name.strip().lower() == name), None)
    if exact:
        return exact
    partial = [s for s in active if name in s.name.lower() or s.name.lower() in name]
    return partial[0] if len(partial) >= 1 else None


def _build_booking_response(booking: Booking) -> BookingResponse:
    """Вспомогательная функция формирования BookingResponse с данными клиента"""
    client_name = booking.client.name if booking.client else "Клиент"
    client_phone = booking.client.phone if booking.client else ""
    visit_at = booking_visit_time(booking)
    can_mark_visit = bool(
        visit_at
        and visit_at <= datetime.now()
        and booking.status in ("confirmed", "completed", "no_show")
    )
    return BookingResponse(
        id=booking.id,
        client_name=client_name,
        client_phone=client_phone,
        service_name=booking.service_name,
        price=booking.price,
        datetime_str=booking.datetime_str,
        status=booking.status,
        scheduled_at=visit_at,
        can_mark_visit=can_mark_visit
    )


# =====================================================================
# 1. СЛУЖЕБНЫЕ И ПУБЛИЧНЫЕ ЭНДПОИНТЫ
# =====================================================================

FRONTEND_DIST = os.getenv(
    "FRONTEND_DIST",
    os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist"))
)


@app.get("/api/health", tags=["Health"])
def health_check():
    """Проверка доступности API сервиса МастерБосс"""
    return {
        "status": "ok",
        "service": "MasterBoss Backend API",
        "version": "1.2.0",
        "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "timezone": time.strftime("%Z"),
    }


@app.get("/api/health/ai", tags=["Health"])
def health_check_ai(probe: bool = Query(True, description="Сделать тестовый запрос в GigaChat")):
    """Проверка GigaChat: задан ли ключ, отвечает ли модель и какая последняя ошибка.
    Откройте в браузере: https://<ваш-домен>/api/health/ai"""
    return ai_parser.ai_status(probe=probe)


@app.get("/", tags=["Health"])
def root():
    """Главная страница: если фронтенд собран, отдает SPA приложение, иначе статус API"""
    index_file = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index_file):
        return FileResponse(index_file)
    return {
        "status": "ok",
        "service": "MasterBoss Backend API",
        "version": "1.2.0"
    }


@app.get(
    "/api/master/{slug}",
    response_model=MasterResponse,
    tags=["Master"],
    summary="Получить профиль мастера и список активных услуг (публичный для клиента)"
)
def get_master_by_slug(slug: str, db: Session = Depends(get_db)):
    """Возвращает данные мастера по slug и только АКТИВНЫЕ услуги из таблицы Service"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )

    # Список только АКТИВНЫХ услуг
    active_services = [s for s in master.services if s.is_active]

    return MasterResponse(
        id=master.id,
        name=master.name,
        slug=master.slug,
        niche=master.niche,
        default_deposit=master.default_deposit,
        trial_active=master.trial_active,
        pin_code=None,  # безопасность: не передаем pin клиенту
        services=[ServiceResponse.model_validate(s) for s in active_services]
    )


# =====================================================================
# 2. БЕЗОПАСНОСТЬ И АВТОРИЗАЦИЯ КАБИНЕТА МАСТЕРА
# =====================================================================

@app.post(
    "/api/app/login",
    response_model=LoginResponse,
    tags=["Auth"],
    summary="Авторизация мастера по PIN-коду"
)
def login_master(payload: LoginRequest, db: Session = Depends(get_db)):
    """
    Принимает { slug, pin }.
    Проверяет pin_code мастера в базе данных.
    При успехе возвращает { success: True, token: f'master_token_{master.id}' }.
    Иначе 401 Unauthorized.
    """
    slug = (payload.slug or "").strip().lower()
    if _login_blocked(slug):
        raise HTTPException(status_code=429, detail="Слишком много попыток. Подождите 10 минут")

    master = db.query(Master).filter(Master.slug == slug).first()
    # Одинаковый ответ для «нет мастера» и «неверный PIN» — не подсказываем, какие адреса заняты
    if not master or not auth.verify_pin(payload.pin.strip(), master.pin_code):
        _login_failed(slug)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный адрес страницы или PIN-код"
        )

    # Старые PIN в открытом виде при первом входе превращаются в хэш
    if not auth.is_hashed(master.pin_code):
        master.pin_code = auth.hash_pin(payload.pin.strip())
        db.commit()

    _LOGIN_FAILS.pop(slug, None)
    return LoginResponse(
        success=True,
        token=auth.create_token(master.id, master.slug),
        slug=master.slug,
        name=master.name
    )


# Простая защита от перебора PIN: не больше 5 ошибок за 10 минут на один адрес
_LOGIN_FAILS: dict[str, list[float]] = {}


def _login_blocked(slug: str) -> bool:
    now = time.time()
    attempts = [t for t in _LOGIN_FAILS.get(slug, []) if now - t < 600]
    _LOGIN_FAILS[slug] = attempts
    return len(attempts) >= 5


def _login_failed(slug: str):
    _LOGIN_FAILS.setdefault(slug, []).append(time.time())


# Стартовые услуги по нише: мастер правит их в настройках
STARTER_SERVICES = {
    "Маникюр": [
        ("Маникюр с покрытием", 2500, 90), ("Снятие + укрепление", 2800, 120),
        ("Педикюр с покрытием", 3200, 90), ("Экспресс-маникюр", 1800, 45),
    ],
    "Брови и ресницы": [
        ("Коррекция и окрашивание бровей", 1500, 45), ("Ламинирование бровей", 2500, 60),
        ("Ламинирование ресниц", 2800, 75), ("Наращивание ресниц", 3500, 120),
    ],
    "Массаж": [
        ("Классический массаж спины", 2000, 45), ("Общий массаж", 3500, 90),
        ("Антицеллюлитный массаж", 3000, 60), ("Массаж лица", 2000, 40),
    ],
    "Репетитор": [
        ("Пробное занятие", 500, 30), ("Занятие 60 минут", 1500, 60),
        ("Занятие 90 минут", 2100, 90), ("Подготовка к экзамену", 2000, 90),
    ],
    "Автосервис": [
        ("Диагностика", 1500, 60), ("Замена масла", 1200, 45),
        ("Шиномонтаж (4 колеса)", 2500, 60), ("Компьютерная диагностика", 2000, 60),
    ],
}
DEFAULT_STARTER = [("Консультация", 1000, 30), ("Услуга 60 минут", 2000, 60), ("Услуга 90 минут", 3000, 90)]


@app.post(
    "/api/app/register",
    response_model=LoginResponse,
    tags=["Auth"],
    summary="Регистрация мастера: страница записи, стартовые услуги, вход"
)
def register_master(payload: RegisterRequest, db: Session = Depends(get_db)):
    slug = payload.slug.strip().lower()
    slug_error = auth.validate_slug(slug)
    if slug_error:
        raise HTTPException(status_code=400, detail=slug_error)
    pin_error = auth.validate_pin_format(payload.pin.strip())
    if pin_error:
        raise HTTPException(status_code=400, detail=pin_error)
    if db.query(Master).filter(Master.slug == slug).first():
        raise HTTPException(status_code=409, detail="Этот адрес уже занят. Попробуйте добавить город или цифру")

    niche = payload.niche.strip()
    master = Master(
        name=payload.name.strip(),
        slug=slug,
        niche=niche,
        trial_active=True,
        default_deposit=500,
        pin_code=auth.hash_pin(payload.pin.strip()),
        work_schedule=json.dumps(DEFAULT_WORK_SCHEDULE),
        slot_step_min=60,
        created_at=datetime.now(),
    )
    db.add(master)
    db.commit()
    db.refresh(master)

    for name, price, duration in STARTER_SERVICES.get(niche, DEFAULT_STARTER):
        db.add(Service(master_id=master.id, name=name, price=float(price), duration_min=duration, is_active=True))
    db.commit()

    return LoginResponse(
        success=True,
        token=auth.create_token(master.id, master.slug),
        slug=master.slug,
        name=master.name
    )


# =====================================================================
# ДЕМО-КАБИНЕТ ДЛЯ ЖЮРИ И СЧЁТЧИК ПИЛОТА
# =====================================================================

def _seed_demo():
    db = SessionLocal()
    try:
        demo_data.ensure_demo_master(db, DEFAULT_WORK_SCHEDULE)
        print("[Demo] демо-кабинет /c/demo заполнен свежими данными", flush=True)
    except Exception as e:
        db.rollback()
        print(f"[Demo warning] {e}", flush=True)
    finally:
        db.close()


_seed_demo()


@app.post(
    "/api/demo/login",
    response_model=LoginResponse,
    tags=["Auth"],
    summary="Вход в демо-кабинет без PIN (для жюри и показов)"
)
def demo_login(db: Session = Depends(get_db)):
    master = db.query(Master).filter(Master.slug == demo_data.DEMO_SLUG).first()
    if not master:
        master = demo_data.ensure_demo_master(db, DEFAULT_WORK_SCHEDULE)
    return LoginResponse(
        success=True,
        token=auth.create_token(master.id, master.slug),
        slug=master.slug,
        name=master.name,
        is_demo=True
    )


@app.post(
    "/api/app/demo/reset",
    tags=["Auth"],
    summary="Вернуть демо-кабинет к исходным данным"
)
def demo_reset(master_id: int = Depends(auth_master_id), db: Session = Depends(get_db)):
    master = db.query(Master).filter(Master.id == master_id).first()
    if not master or not master.is_demo:
        raise HTTPException(status_code=403, detail="Сбросить можно только демо-кабинет")
    demo_data.reset_demo_data(db, master, DEFAULT_WORK_SCHEDULE)
    return {"success": True}


REF_LABELS = {"insta": "Instagram", "tg": "Telegram", "max": "MAX", "vk": "ВКонтакте", "avito": "Авито", "qr": "QR-код"}


def _booking_created(b: Booking) -> Optional[datetime]:
    return b.created_at or b.scheduled_at


@app.get(
    "/api/app/pilot-stats",
    tags=["App"],
    summary="Сколько записей пришло через ссылку мастера (счётчик пилота)"
)
def pilot_stats(master_id: int = Depends(auth_master_id), db: Session = Depends(get_db)):
    bookings = db.query(Booking).filter(Booking.master_id == master_id, Booking.source == "link").all()
    now = datetime.now()
    by_ref = {}
    for b in bookings:
        key = b.ref or "direct"
        by_ref[key] = by_ref.get(key, 0) + 1
    visits = [b for b in bookings if b.status == "completed"]
    created = [_booking_created(b) for b in bookings if _booking_created(b)]
    return {
        "total": len(bookings),
        "last_7_days": sum(1 for d in created if d >= now - timedelta(days=7)),
        "last_30_days": sum(1 for d in created if d >= now - timedelta(days=30)),
        "visits": len(visits),
        "revenue": round(sum(b.price for b in visits), 2),
        "by_ref": sorted(
            [{"ref": k, "label": REF_LABELS.get(k, "Прямая ссылка" if k == "direct" else k), "count": v}
             for k, v in by_ref.items()],
            key=lambda x: -x["count"]
        ),
        "since": min(created).strftime("%d.%m.%Y") if created else None,
    }


@app.get(
    "/api/public/pilot-stats",
    tags=["Health"],
    summary="Общие цифры пилота для презентации (без демо-кабинета и без личных данных)"
)
def public_pilot_stats(db: Session = Depends(get_db)):
    real_masters = db.query(Master).filter(or_(Master.is_demo == False, Master.is_demo.is_(None))).all()
    ids = [m.id for m in real_masters]
    bookings = db.query(Booking).filter(Booking.master_id.in_(ids), Booking.source == "link").all() if ids else []
    now = datetime.now()
    created = [_booking_created(b) for b in bookings if _booking_created(b)]
    return {
        "masters": len(real_masters),
        "masters_with_bookings": len({b.master_id for b in bookings}),
        "bookings_via_link": len(bookings),
        "bookings_last_7_days": sum(1 for d in created if d >= now - timedelta(days=7)),
        "visits_via_link": sum(1 for b in bookings if b.status == "completed"),
        "since": min(created).strftime("%d.%m.%Y") if created else None,
    }


# =====================================================================
# 3. УПРАВЛЕНИЕ ПРОФИЛЕМ И УСЛУГАМИ МАСТЕРА
# =====================================================================

@app.get(
    "/api/app/profile",
    tags=["Profile"],
    summary="Получить профиль мастера для личного кабинета (включая текущий PIN-код)"
)
def get_master_profile(
    slug: str = Depends(auth_slug),
    db: Session = Depends(get_db)
):
    """Возвращает данные мастера, включая PIN-код, для отображения и редактирования в настройках"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )
    return {
        "id": master.id,
        "name": master.name,
        "slug": master.slug,
        "niche": master.niche,
        "default_deposit": master.default_deposit,
        "trial_active": master.trial_active,
        "work_schedule": get_work_schedule(master),
        "slot_step_min": master.slot_step_min or 60,
        "is_demo": bool(master.is_demo),
    }


@app.put(
    "/api/app/profile",
    tags=["Profile"],
    summary="Обновить имя, нишу и PIN-код мастера"
)
def update_master_profile(
    payload: MasterProfileUpdate,
    slug: str = Depends(auth_slug),
    db: Session = Depends(get_db)
):
    """Обновляет имя мастера, нишу и pin_code"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )

    if payload.name is not None and payload.name.strip():
        master.name = payload.name.strip()
    if payload.niche is not None and payload.niche.strip():
        master.niche = payload.niche.strip()
    if payload.pin_code is not None and payload.pin_code.strip():
        if master.is_demo:
            raise HTTPException(status_code=403, detail="В демо-кабинете PIN не меняется")
        pin_error = auth.validate_pin_format(payload.pin_code.strip())
        if pin_error:
            raise HTTPException(status_code=400, detail=pin_error)
        master.pin_code = auth.hash_pin(payload.pin_code.strip())

    db.commit()
    db.refresh(master)

    return {
        "success": True,
        "id": master.id,
        "name": master.name,
        "slug": master.slug,
        "niche": master.niche
    }





@app.put(
    "/api/app/schedule",
    tags=["Profile"],
    summary="Сохранить рабочие дни, часы и шаг записи"
)
def update_work_schedule(payload: WorkScheduleUpdate, slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    clean = validate_work_schedule(payload.schedule)
    master.work_schedule = json.dumps(clean)
    master.slot_step_min = payload.slot_step_min
    db.commit()
    return {"success": True, "work_schedule": clean, "slot_step_min": master.slot_step_min}


@app.put(
    "/api/app/pin",
    tags=["Profile"],
    summary="Сменить PIN-код (пароль) доступа в кабинет мастера"
)
def change_master_pin(
    payload: ChangePinRequest,
    slug: str = Depends(auth_slug),
    db: Session = Depends(get_db)
):
    """Специальный защищенный эндпоинт для смены PIN-кода"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )

    if master.is_demo:
        raise HTTPException(status_code=403, detail="В демо-кабинете PIN не меняется")
    if not payload.old_pin or not auth.verify_pin(payload.old_pin.strip(), master.pin_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Текущий PIN-код указан неверно"
        )

    new_pin_clean = payload.new_pin.strip()
    pin_error = auth.validate_pin_format(new_pin_clean)
    if pin_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=pin_error)

    master.pin_code = auth.hash_pin(new_pin_clean)
    db.commit()

    return {"success": True, "message": "PIN-код успешно обновлен"}


@app.get(
    "/api/app/services",
    response_model=list[ServiceResponse],
    tags=["Services"],
    summary="Получить все услуги мастера (включая неактивные)"
)
def get_all_services(slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """Возвращает все услуги мастера для управления в настройках кабинета"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )
    return db.query(Service).filter(Service.master_id == master.id).order_by(Service.id.asc()).all()


@app.post(
    "/api/app/services",
    response_model=ServiceResponse,
    tags=["Services"],
    summary="Создать новую услугу мастера"
)
def create_service(
    service_in: ServiceCreate,
    slug: str = Depends(auth_slug),
    db: Session = Depends(get_db)
):
    """Создает новую услугу { name, price, duration_min }"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )

    new_svc = Service(
        master_id=master.id,
        name=service_in.name.strip(),
        price=float(service_in.price),
        duration_min=int(service_in.duration_min),
        is_active=True
    )
    db.add(new_svc)
    db.commit()
    db.refresh(new_svc)
    return new_svc


@app.put(
    "/api/app/services/{service_id}",
    response_model=ServiceResponse,
    tags=["Services"],
    summary="Редактировать услугу мастера"
)
def update_service(
    service_id: int,
    service_in: ServiceUpdate,
    slug: str = Depends(auth_slug),
    db: Session = Depends(get_db)
):
    """Редактирует название, цену, тайминг или активность услуги"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )

    svc = db.query(Service).filter(Service.id == service_id, Service.master_id == master.id).first()
    if not svc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Услуга с ID {service_id} не найдена"
        )

    if service_in.name is not None and service_in.name.strip():
        svc.name = service_in.name.strip()
    if service_in.price is not None:
        svc.price = float(service_in.price)
    if service_in.duration_min is not None:
        svc.duration_min = int(service_in.duration_min)
    if service_in.is_active is not None:
        svc.is_active = bool(service_in.is_active)

    db.commit()
    db.refresh(svc)
    return svc


@app.delete(
    "/api/app/services/{service_id}",
    tags=["Services"],
    summary="Деактивировать услугу мастера"
)
def deactivate_service(
    service_id: int,
    slug: str = Depends(auth_slug),
    db: Session = Depends(get_db)
):
    """Деактивирует услугу (is_active = False)"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )

    svc = db.query(Service).filter(Service.id == service_id, Service.master_id == master.id).first()
    if not svc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Услуга с ID {service_id} не найдена"
        )

    svc.is_active = False
    db.commit()
    return {"success": True, "message": "Услуга деактивирована", "id": service_id}


# =====================================================================
# 4. ДИНАМИЧЕСКИЕ СЛОТЫ И СТАТУС БРОНИ
# =====================================================================

@app.get(
    "/api/master/{slug}/available-slots",
    response_model=list[str],
    tags=["Slots"],
    summary="Динамическая генерация свободных слотов на 3 дня вперед"
)
def get_available_slots(
    slug: str,
    service_id: Optional[int] = Query(None, description="Услуга: окна считаются по её длительности"),
    db: Session = Depends(get_db)
):
    """
    Свободные окна на 14 дней вперёд по рабочему расписанию мастера.
    Окно попадает в список, только если процедура целиком помещается в рабочие часы
    и не пересекается с ожидающими и подтверждёнными записями.
    Формат: ["05.11, 10:00", "05.11, 11:00", ...]
    """
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )
    duration = DEFAULT_DURATION_MIN
    if service_id:
        service = db.query(Service).filter(Service.id == service_id, Service.master_id == master.id).first()
        if service and service.duration_min:
            duration = service.duration_min
    return generate_free_slots(db, master, duration)


@app.get(
    "/api/booking/{booking_id}/status",
    response_model=BookingStatusResponse,
    tags=["Bookings"],
    summary="Проверить статус бронирования (для live polling клиентом)"
)
def get_booking_status(
    booking_id: int,
    token: Optional[str] = Query(None, description="client_token из ответа на запись"),
    db: Session = Depends(get_db)
):
    """
    Возвращает { id, status, service_name, datetime_str, can_cancel } для записи.
    Нужен client_token, который клиент получил при записи: чужие записи перебором номеров не посмотреть.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking or not client_token_ok(booking, token):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Запись с ID {booking_id} не найдена"
        )

    visit_at = booking.scheduled_at or parse_datetime_str(booking.datetime_str)
    can_cancel = bool(visit_at and (visit_at - datetime.now()) >= timedelta(hours=24))

    return BookingStatusResponse(
        id=booking.id,
        status=booking.status,
        service_name=booking.service_name,
        datetime_str=booking.datetime_str,
        can_cancel=can_cancel
    )


# =====================================================================
# 5. СТАТИСТИКА, ТРАНЗАКЦИИ И ДЕЙСТВИЯ НАД ЗАЯВКАМИ
# =====================================================================

@app.get(
    "/api/app/stats",
    response_model=StatsResponse,
    tags=["App"],
    summary="Сводная статистика мастера: доходы, расходы, прибыль, налог, записи и транзакции"
)
def get_master_stats(slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )

    all_transactions = db.query(Transaction).filter(Transaction.master_id == master.id).all()
    total_income = sum(t.amount for t in all_transactions if t.type == "income")
    total_expense = sum(t.amount for t in all_transactions if t.type == "expense")
    net_profit = round(total_income - total_expense, 2)
    tax_amount = round(total_income * 0.04, 2)

    recent_bookings = (
        db.query(Booking)
        .filter(Booking.master_id == master.id)
        .order_by(Booking.id.desc())
        .limit(20)
        .all()
    )
    bookings_response = [_build_booking_response(b) for b in recent_bookings]

    recent_transactions = (
        db.query(Transaction)
        .filter(Transaction.master_id == master.id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(20)
        .all()
    )
    transactions_response = [TransactionResponse.model_validate(t) for t in recent_transactions]

    # Новые отмены
    new_cancellations = (
        db.query(Booking)
        .filter(
            Booking.master_id == master.id,
            Booking.status == 'cancelled_by_client',
            Booking.master_notified_cancellation == False
        )
        .all()
    )
    cancellations_response = [
        {
            "booking_id": b.id,
            "client_name": b.client.name if b.client else "Клиент",
            "client_phone": b.client.phone if b.client else "",
            "service_name": b.service_name,
            "datetime_str": b.datetime_str
        }
        for b in new_cancellations
    ]

    return StatsResponse(
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        net_profit=net_profit,
        tax_amount=tax_amount,
        bookings=bookings_response,
        transactions=transactions_response,
        new_cancellations=cancellations_response
    )


@app.post(
    "/api/app/booking/{booking_id}/confirm",
    response_model=BookingResponse,
    tags=["Bookings"],
    summary="Подтвердить бронь клиента в 1 клик"
)
def confirm_booking(booking_id: int, master_id: int = Depends(auth_master_id), db: Session = Depends(get_db)):
    """Переводит статус брони в 'confirmed'"""
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.master_id == master_id).first()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Запись с ID {booking_id} не найдена"
        )

    booking.status = "confirmed"
    db.commit()
    db.refresh(booking)
    return _build_booking_response(booking)


@app.post(
    "/api/booking/{booking_id}/cancel-by-client",
    response_model=BookingResponse,
    tags=["Bookings"],
    summary="Отмена брони клиентом"
)
def cancel_booking_by_client(
    booking_id: int,
    token: Optional[str] = Query(None, description="client_token из ответа на запись"),
    db: Session = Depends(get_db)
):
    """Отменяет бронь клиентом, если до визита 24+ часа. Нужен client_token этой записи."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking or not client_token_ok(booking, token):
        raise HTTPException(status_code=404, detail="Запись не найдена")

    # Защита от повторной отмены уже отменённой записи
    if booking.status in ("cancelled", "cancelled_by_client"):
        raise HTTPException(
            status_code=400,
            detail=f"Запись уже отменена (статус: {booking.status})"
        )

    visit_at = booking.scheduled_at or parse_datetime_str(booking.datetime_str)
    if not visit_at:
        raise HTTPException(
            status_code=400,
            detail="Онлайн-отмена недоступна: время визита не определено."
        )
    if visit_at - datetime.now() < timedelta(hours=24):
        raise HTTPException(
            status_code=400,
            detail="Онлайн-отмена недоступна: до визита осталось менее 24 часов. Пожалуйста, свяжитесь с мастером лично."
        )

    booking.status = "cancelled_by_client"
    booking.master_notified_cancellation = False
    
    # Освобождаем слот - в данной реализации достаточно смены статуса, 
    # так как слоты считаются по статусам 'pending' и 'confirmed'.
    
    db.commit()
    db.refresh(booking)

    # Уведомляем подписчиков waitlist, что слот освободился
    master = db.query(Master).filter(Master.id == booking.master_id).first()
    if master:
        notify_waitlist_on_slot_free(booking.datetime_str, master, db)

    return _build_booking_response(booking)


@app.post(
    "/api/app/booking/{booking_id}/mark-cancellation-read",
    tags=["App"],
    summary="Закрыть алерт об отмене записи мастером"
)
def mark_cancellation_read(booking_id: int, master_id: int = Depends(auth_master_id), db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.master_id == master_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    
    booking.master_notified_cancellation = True
    db.commit()
    return {"success": True}


@app.post(
    "/api/app/transaction",
    response_model=TransactionResponse,
    tags=["Transactions"],
    summary="Добавить новую финансовую операцию"
)
def create_transaction(
    transaction_in: TransactionCreate,
    slug: str = Depends(auth_slug),
    db: Session = Depends(get_db)
):
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )

    new_tx = Transaction(
        master_id=master.id,
        type=transaction_in.type,
        amount=transaction_in.amount,
        category=transaction_in.category,
        date=datetime.now(),
        source=transaction_in.source or "manual"
    )
    db.add(new_tx)
    db.commit()
    db.refresh(new_tx)

    return TransactionResponse.model_validate(new_tx)


def _get_master_or_404(db: Session, slug: str) -> Master:
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(status_code=404, detail=f"Мастер со слагом '{slug}' не найден")
    return master


def _get_master_booking_or_404(db: Session, master: Master, booking_id: int) -> Booking:
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.master_id == master.id).first()
    if not booking:
        raise HTTPException(status_code=404, detail=f"Запись с ID {booking_id} не найдена")
    return booking


def _check_visit_time(booking: Booking):
    """«Пришла / Не пришла» можно нажать только когда время визита уже наступило."""
    if booking.status not in ("confirmed", "completed", "no_show"):
        raise HTTPException(status_code=400, detail="Отметить визит можно только у подтверждённой записи")
    visit_at = booking_visit_time(booking)
    if not visit_at:
        raise HTTPException(status_code=400, detail="Не удалось определить время визита")
    if visit_at > datetime.now():
        raise HTTPException(
            status_code=400,
            detail=f"Визит ещё не начался ({visit_at.strftime('%d.%m %H:%M')}). Отметить можно после этого времени"
        )
    return visit_at


@app.post(
    "/api/app/booking/{booking_id}/visited",
    response_model=BookingResponse,
    tags=["Bookings"],
    summary="Клиент пришёл: статус completed + автоматический доход"
)
def mark_booking_visited(booking_id: int, slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """Переводит запись в 'completed', ставит клиенту дату визита и создаёт доход
    по цене записи. Повторное нажатие не создаёт второй доход."""
    master = _get_master_or_404(db, slug)
    booking = _get_master_booking_or_404(db, master, booking_id)
    visit_at = _check_visit_time(booking)

    booking.status = "completed"
    booking.visited_at = datetime.now()

    if booking.client:
        if not booking.client.last_visit_date or booking.client.last_visit_date < visit_at:
            booking.client.last_visit_date = visit_at

    income = db.query(Transaction).filter(Transaction.booking_id == booking.id).first()
    if not income:
        db.add(Transaction(
            master_id=master.id,
            type="income",
            amount=booking.price,
            category=f"Услуга: {booking.service_name}",
            date=visit_at,
            source="booking",
            booking_id=booking.id,
        ))

    db.commit()
    db.refresh(booking)
    return _build_booking_response(booking)


@app.post(
    "/api/app/booking/{booking_id}/no-show",
    response_model=BookingResponse,
    tags=["Bookings"],
    summary="Клиент не пришёл: статус no_show, доход по визиту удаляется"
)
def mark_booking_no_show(booking_id: int, slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """Переводит запись в 'no_show'. Если до этого по ошибке нажали «Пришла»,
    созданный доход удаляется."""
    master = _get_master_or_404(db, slug)
    booking = _get_master_booking_or_404(db, master, booking_id)
    _check_visit_time(booking)

    booking.status = "no_show"
    booking.visited_at = datetime.now()
    db.query(Transaction).filter(Transaction.booking_id == booking.id).delete()

    db.commit()
    db.refresh(booking)
    return _build_booking_response(booking)


@app.put(
    "/api/app/transaction/{transaction_id}",
    response_model=TransactionResponse,
    tags=["Transactions"],
    summary="Изменить сумму или категорию операции"
)
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    slug: str = Depends(auth_slug),
    db: Session = Depends(get_db)
):
    master = _get_master_or_404(db, slug)
    tx = db.query(Transaction).filter(Transaction.id == transaction_id, Transaction.master_id == master.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Операция не найдена")
    if payload.amount is not None:
        tx.amount = payload.amount
    if payload.category is not None and payload.category.strip():
        tx.category = payload.category.strip()
    db.commit()
    db.refresh(tx)
    return TransactionResponse.model_validate(tx)


@app.delete(
    "/api/app/transaction/{transaction_id}",
    tags=["Transactions"],
    summary="Удалить операцию"
)
def delete_transaction(transaction_id: int, slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    master = _get_master_or_404(db, slug)
    tx = db.query(Transaction).filter(Transaction.id == transaction_id, Transaction.master_id == master.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Операция не найдена")
    db.delete(tx)
    db.commit()
    return {"success": True, "deleted_id": transaction_id}


# =====================================================================
# 6. КЛИЕНТЫ И ВОЗВРАТ (LTV) + УМНЫЙ GIGACHAT ФУНКЦИОНАЛ
# =====================================================================

@app.get(
    "/api/app/clients",
    response_model=list[ClientResponse],
    tags=["Clients"],
    summary="Список клиентов мастера с историей посещений и статусом возврата"
)
def get_master_clients(slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """Возвращает клиентов мастера с расчетом дней после последнего визита"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{slug}' не найден"
        )

    clients = db.query(Client).filter(Client.master_id == master.id).order_by(Client.id.asc()).all()
    now = datetime.now()

    result = []
    for c in clients:
        days_since = None
        if c.last_visit_date:
            days_since = (now - c.last_visit_date).days

        # Клиенту пора напомнить, если прошло более (cycle_days - 3) дней
        is_due = False
        if days_since is not None and days_since >= (c.cycle_days - 3):
            is_due = True

        result.append(ClientResponse(
            id=c.id,
            name=c.name,
            phone=c.phone,
            cycle_days=c.cycle_days,
            last_visit_date=c.last_visit_date,
            days_since_last_visit=days_since,
            is_due_return=is_due
        ))

    # Сортируем: сначала те, кому пора вернуться
    result.sort(key=lambda x: (not x.is_due_return, -(x.days_since_last_visit or 0)))
    return result


@app.post(
    "/api/app/ai/parse-expense",
    response_model=AIExpenseResponse,
    tags=["AI"],
    summary="Умное распознавание расхода из текста/фразы через GigaChat"
)
def parse_expense_with_ai(payload: AIExpenseRequest):
    """
    Разбирает фразу мастера (например: 'купила базы Luxio на 4800')
    и возвращает извлеченную сумму и категорию расхода.
    """
    parsed = ai_parser.parse_expense_phrase(payload.phrase)
    if parsed["amount"] <= 0:
        # Раньше здесь молча подставлялось 1000 ₽ — теперь честно просим уточнить
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Не нашёл сумму во фразе. Напишите её цифрами, например: «базы и топы 3200»"
        )
    return AIExpenseResponse(
        amount=parsed["amount"],
        category=parsed["category"],
        raw_phrase=payload.phrase,
        source=parsed["source"]
    )


@app.post(
    "/api/app/ai/reminder",
    response_model=AIReminderResponse,
    tags=["AI"],
    summary="Генерация продающего напоминания клиенту через GigaChat"
)
def generate_reminder_with_ai(payload: AIReminderRequest, master_id: int = Depends(auth_master_id), db: Session = Depends(get_db)):
    """
    Генерирует персональный текст сообщения для WhatsApp/SMS,
    приглашающий постоянного клиента обновить покрытие.
    """
    client = db.query(Client).filter(Client.id == payload.client_id, Client.master_id == master_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    phone = client.phone
    master = client.master
    master_slug = master.slug if master else "anna"
    # PUBLIC_URL (например https://masterboss.onrender.com) делает ссылку кликабельной в мессенджере
    booking_url = f"{os.getenv('PUBLIC_URL', '').rstrip('/')}/c/{master_slug}"

    result = ai_parser.generate_client_reminder(
        client_name=payload.client_name,
        days_ago=payload.days_ago,
        cycle_days=payload.cycle_days,
        service_name=payload.service_name or "маникюр",
        master_name=master.name if master else "Анна Nails",
        booking_url=booking_url
    )

    return AIReminderResponse(
        message=result["message"],
        client_name=payload.client_name,
        phone=phone,
        source=result["source"]
    )


# =====================================================================
# 7. ПРИЕМ ЗАЯВКИ ИЗ КЛИЕНТСКОГО ЧАТА С ПРОВЕРКОЙ ЗАНЯТОСТИ СЛОТА
# =====================================================================

@app.post(
    "/api/chat/message",
    response_model=ChatMessageResponse,
    tags=["Chat"],
    summary="Прием сообщения клиента и создание подтвержденной заявки на запись"
)
def handle_chat_message(payload: ChatMessageRequest, db: Session = Depends(get_db)):
    """
    Принимает данные онлайн-записи от клиента:
    1. Ищет мастера по slug.
    2. Проверяет корректность телефона и имени клиента.
    3. Извлекает параметры услуги, времени и цены.
    4. Перед созданием Booking проверяет: не занят ли уже этот слот (status in ['pending', 'confirmed']).
       Если занят — возвращает 400 Bad Request с текстом: 'Слот уже забронирован'.
    5. Если свободен — создает Booking и возвращает booking_id.
    """
    master = db.query(Master).filter(Master.slug == payload.slug).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Мастер со слагом '{payload.slug}' не найден"
        )

    # Строгая проверка номера телефона (минимум 10 цифр)
    phone = (payload.client_phone or "").strip()
    phone_digits = re.sub(r"\D", "", phone)
    if not phone or len(phone_digits) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Укажите корректный номер телефона"
        )

    # Приводим телефон к единому стандарту +7 (XXX) XXX-XX-XX
    if len(phone_digits) == 10:
        clean_phone = f"+7 ({phone_digits[0:3]}) {phone_digits[3:6]}-{phone_digits[6:8]}-{phone_digits[8:10]}"
    elif len(phone_digits) == 11 and phone_digits[0] in ("7", "8"):
        clean_phone = f"+7 ({phone_digits[1:4]}) {phone_digits[4:7]}-{phone_digits[7:9]}-{phone_digits[9:11]}"
    else:
        clean_phone = phone

    # Строгая проверка имени клиента
    name = (payload.client_name or "").strip()
    if not name or name.lower() in ("клиент", "client"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Укажите ваше имя"
        )

    # Извлечение параметров услуги и времени.
    # ЦЕНА от браузера ИГНОРИРУЕТСЯ: её берём только из прайса мастера (таблица Service).
    service_name = (payload.service_name or "").strip()
    datetime_str = (payload.datetime_str or "").strip()

    # Fallback на ai_parser, если услуга или время пришли свободным текстом
    if ((not payload.service_id and not service_name) or not datetime_str) and payload.message and payload.message.strip():
        parsed_data = ai_parser.parse_booking_message(
            text=payload.message,
            client_name=name,
            client_phone=clean_phone
        )
        service_name = service_name or (parsed_data.get("service_name") or "").strip()
        datetime_str = datetime_str or (parsed_data.get("datetime_str") or "").strip()

    if not datetime_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не выбрана дата и время записи"
        )

    service = find_master_service(db, master.id, payload.service_id, service_name)
    if not service:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Услуга не найдена в прайсе мастера. Выберите услугу из списка"
        )
    service_name = service.name
    price = service.price

    scheduled_at = parse_datetime_str(datetime_str)
    if scheduled_at:
        datetime_str = scheduled_at.strftime("%d.%m, %H:%M")

    # =================================================================
    # ПРОВЕРКА ЗАНЯТОСТИ СЛОТА (с нормализацией «Завтра» ↔ «29.10»)
    # =================================================================
    requested_key = slot_key(datetime_str)
    active_same_master = db.query(Booking).filter(
        Booking.master_id == master.id,
        Booking.status.in_(["pending", "confirmed"])
    ).all()
    existing_booking = next(
        (b for b in active_same_master if slot_key(b.datetime_str) == requested_key),
        None
    )

    if existing_booking or (
        scheduled_at and not is_slot_free(scheduled_at, service.duration_min or DEFAULT_DURATION_MIN,
                                          busy_intervals(db, master.id))
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Слот уже забронирован"
        )

    # Поиск или создание клиента по контактам
    client = db.query(Client).filter(
        Client.master_id == master.id,
        (Client.phone == clean_phone) | (Client.phone == phone) | (Client.phone == phone_digits)
    ).first()

    if not client:
        client = Client(
            master_id=master.id,
            name=name,
            phone=clean_phone,
            cycle_days=21,
            last_visit_date=None  # визита ещё не было: дата ставится по кнопке «Пришла»
        )
        db.add(client)
        db.commit()
        db.refresh(client)
    else:
        client.name = name
        client.phone = clean_phone
        db.commit()
        db.refresh(client)

    # Создание бронирования со статусом 'pending'
    source = payload.source if payload.source in ("link", "test") else "api"
    ref = re.sub(r"[^a-z0-9_-]", "", (payload.ref or "").lower())[:20] or None
    new_booking = Booking(
        source=source,
        ref=ref if source == "link" else None,
        client_token=secrets.token_urlsafe(16),
        created_at=datetime.now(),
        master_id=master.id,
        client_id=client.id,
        service_name=service_name,
        price=float(price),
        datetime_str=datetime_str,
        scheduled_at=scheduled_at,
        status="pending"
    )
    db.add(new_booking)
    db.commit()
    db.refresh(new_booking)

    # Пуш-подписка этого браузера теперь принадлежит этому клиенту
    if payload.push_endpoint:
        db.query(PushSubscription).filter(
            PushSubscription.slug == f"client_{master.slug}",
            PushSubscription.endpoint == payload.push_endpoint
        ).update({"client_id": client.id})
        db.commit()

    reply_text = f"{name}, заявка на {service_name.lower()} на {datetime_str} зафиксирована! Передала мастеру на сверку с бумажным блокнотом."

    return ChatMessageResponse(
        reply_text=reply_text,
        booking_created=True,
        booking_id=new_booking.id,
        client_token=new_booking.client_token,
        details={
            "booking_id": new_booking.id,
            "client_name": name,
            "client_phone": clean_phone,
            "service_name": service_name,
            "datetime_str": datetime_str,
            "price": float(price),
            "reply_to_client": reply_text
        }
    )


# =====================================================================
# 8. УВЕДОМЛЕНИЯ В БРАУЗЕРЕ (PUSH)
# =====================================================================

@app.post(
    "/api/app/notifications/subscribe",
    response_model=PushSubscriptionResponse,
    tags=["Notifications"],
    summary="Сохранить подписку на push-уведомления браузера"
)
def subscribe_notifications(payload: PushSubscriptionCreate, slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """Сохраняет подписку браузера мастера на уведомления (endpoint, ключи шифрования)"""
    payload.slug = slug
    existing = db.query(PushSubscription).filter(
        PushSubscription.slug == payload.slug,
        PushSubscription.endpoint == payload.endpoint
    ).first()
    if existing:
        return PushSubscriptionResponse(success=True, message="Подписка уже существует")

    sub = PushSubscription(
        slug=payload.slug,
        endpoint=payload.endpoint,
        p256dh=payload.p256dh,
        auth=payload.auth,
        user_agent=payload.user_agent
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return PushSubscriptionResponse(success=True, message="Подписка оформлена")


@app.post(
    "/api/app/notifications/send",
    tags=["Notifications"],
    summary="Отправить уведомление в браузер получателю"
)
def send_notification(payload: NotificationSend, slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """Возвращает список подписок для frontend, который покажет уведомление через Notification API"""
    if payload.slug not in (slug, f"client_{slug}"):
        raise HTTPException(status_code=403, detail="Можно отправлять только своим подписчикам")
    subs = db.query(PushSubscription).filter(PushSubscription.slug == payload.slug).all()
    if not subs:
        return {"success": False, "message": f"Нет активных подписок для '{payload.slug}'", "count": 0}
    return {
        "success": True,
        "message": f"Найдено подписок: {len(subs)}",
        "count": len(subs),
        "notification": {
            "title": payload.title,
            "body": payload.body,
            "icon": payload.icon or "/favicon.ico"
        },
        "subscriptions": [s.endpoint for s in subs]
    }


@app.get(
    "/api/app/notifications/upcoming",
    response_model=list[UpcomingBookingNotification],
    tags=["Notifications"],
    summary="Записи на ближайший час (для напоминаний)"
)
def get_upcoming_bookings(slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """Возвращает брони, которые начнутся в ближайшие 60 минут"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(status_code=404, detail=f"Мастер '{slug}' не найден")

    now = datetime.now()
    soon = now + timedelta(hours=1)

    bookings = (
        db.query(Booking)
        .filter(
            Booking.master_id == master.id,
            Booking.status.in_(["pending", "confirmed"]),
            Booking.scheduled_at.isnot(None)
        )
        .all()
    )

    result = []
    for b in bookings:
        visit_at = b.scheduled_at
        if visit_at and now <= visit_at <= soon:
            minutes_until = int((visit_at - now).total_seconds() // 60)
            result.append(UpcomingBookingNotification(
                booking_id=b.id,
                client_name=b.client_name,
                client_phone=b.client_phone or "",
                service_name=b.service_name,
                datetime_str=b.datetime_str,
                minutes_until=max(0, minutes_until)
            ))

    return result


@app.get(
    "/api/app/notifications/clients-due",
    response_model=list[ClientDueReturn],
    tags=["Notifications"],
    summary="Клиенты, которым пора возвращаться (для уведомлений)"
)
def get_clients_due_return(slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """Возвращает клиентов, у которых прошло более cycle_days дней с последнего визита"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(status_code=404, detail=f"Мастер '{slug}' не найден")

    now = datetime.now()
    clients = db.query(Client).filter(Client.master_id == master.id).all()

    result = []
    for c in clients:
        if c.last_visit_date:
            days_since = (now - c.last_visit_date).days
            if days_since >= c.cycle_days:
                result.append(ClientDueReturn(
                    client_id=c.id,
                    name=c.name,
                    phone=c.phone,
                    days_since_last_visit=days_since,
                    cycle_days=c.cycle_days
                ))

    result.sort(key=lambda x: x.days_since_last_visit, reverse=True)
    return result


@app.post(
    "/api/app/notifications/push-subscribe",
    response_model=PushSubscriptionResponse,
    tags=["Notifications"],
    summary="Оформить push-подписку браузера (VAPID)"
)
def push_subscribe(payload: PushSubscriptionCreate, request: Request, db: Session = Depends(get_db)):
    """Сохраняет push-подписку браузера с ключами шифрования для отправки уведомлений даже при закрытой вкладке.
    Подписка мастера (slug без client_) требует токен. Подписка клиента с booking_id
    привязывается к этому клиенту — напоминания придут только ему."""
    if not payload.p256dh or not payload.auth:
        raise HTTPException(
            status_code=400,
            detail="Для push-подписки нужны ключи p256dh и auth (от service worker)"
        )

    client_id = None
    if payload.slug.startswith("client_"):
        if payload.booking_id:
            master_slug = payload.slug[len("client_"):]
            booking = (
                db.query(Booking).join(Master, Booking.master_id == Master.id)
                .filter(Booking.id == payload.booking_id, Master.slug == master_slug)
                .first()
            )
            if booking and client_token_ok(booking, payload.booking_token):
                client_id = booking.client_id
    else:
        token = auth.token_from_request(request)
        if not token or token.get("slug") != payload.slug:
            raise HTTPException(status_code=401, detail="Подписка мастера доступна только из кабинета")

    existing = db.query(PushSubscription).filter(
        PushSubscription.slug == payload.slug,
        PushSubscription.endpoint == payload.endpoint
    ).first()
    if existing:
        # Обновляем ключи, если они изменились
        existing.p256dh = payload.p256dh
        existing.auth = payload.auth
        existing.user_agent = payload.user_agent
        if client_id:
            existing.client_id = client_id
        db.commit()
        return PushSubscriptionResponse(success=True, message="Подписка обновлена")

    sub = PushSubscription(
        slug=payload.slug,
        endpoint=payload.endpoint,
        p256dh=payload.p256dh,
        auth=payload.auth,
        user_agent=payload.user_agent,
        client_id=client_id
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return PushSubscriptionResponse(success=True, message="Push-подписка оформлена")


@app.post(
    "/api/app/notifications/push-send-upcoming",
    tags=["Notifications"],
    summary="Отправить push-напоминания о записях на ближайший час"
)
def push_send_upcoming(slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """Раз в час проверяет ближайшие записи и отправляет push-уведомления клиентам"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(status_code=404, detail=f"Мастер '{slug}' не найден")

    now = datetime.now()
    soon = now + timedelta(hours=1)

    bookings = (
        db.query(Booking)
        .filter(
            Booking.master_id == master.id,
            Booking.status.in_(["pending", "confirmed"]),
            Booking.scheduled_at.isnot(None)
        )
        .all()
    )

    subs = db.query(PushSubscription).filter(PushSubscription.slug == f"client_{slug}").all()
    if not subs:
        return {"success": False, "message": f"Нет push-подписок для клиентов мастера '{slug}'", "sent": 0}

    sent = 0
    for b in bookings:
        visit_at = b.scheduled_at
        if visit_at and now <= visit_at <= soon:
            minutes_until = int((visit_at - now).total_seconds() // 60)
            for sub in subs:
                if send_push_to_subscription(
                    sub,
                    title=f"⏰ Напоминание о записи",
                    body=f"{b.client_name}, через {minutes_until} мин. у вас {b.service_name} ({b.datetime_str})",
                    url=f"/c/{slug}"
                ):
                    sent += 1

    return {"success": True, "message": f"Отправлено push-уведомлений: {sent}", "sent": sent}


@app.post(
    "/api/app/notifications/push-send-clients-due",
    tags=["Notifications"],
    summary="Отправить push-уведомления клиентам, которым пора возвращаться"
)
def push_send_clients_due(slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """Отправляет push-уведомления клиентам с длительным отсутствием"""
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(status_code=404, detail=f"Мастер '{slug}' не найден")

    now = datetime.now()
    clients = db.query(Client).filter(Client.master_id == master.id).all()

    subs = db.query(PushSubscription).filter(PushSubscription.slug == f"client_{slug}").all()
    if not subs:
        return {"success": False, "message": f"Нет push-подписок для клиентов мастера '{slug}'", "sent": 0}

    sent = 0
    for c in clients:
        if c.last_visit_date:
            days_since = (now - c.last_visit_date).days
            if days_since >= c.cycle_days:
                for sub in subs:
                    if send_push_to_subscription(
                        sub,
                        title=f"📬 Пора обновить покрытие, {c.name}!",
                        body=f"Последний визит был {days_since} дней назад (цикл {c.cycle_days} дн.). Записаться онлайн: /c/{slug}",
                        url=f"/c/{slug}"
                    ):
                        sent += 1

    return {"success": True, "message": f"Отправлено push-уведомлений: {sent}", "sent": sent}


def notify_waitlist_on_slot_free(desired_slot: str, master: Master, db: Session):
    """Отправляет push-уведомления всем подписчикам waitlist, когда слот освободился"""
    subs = (
        db.query(WaitlistSubscription)
        .filter(
            WaitlistSubscription.master_id == master.id,
            WaitlistSubscription.desired_slot == desired_slot,
            WaitlistSubscription.is_notified == False
        )
        .all()
    )

    sent = 0
    for sub in subs:
        if sub.endpoint and sub.p256dh and sub.auth:
            if send_push_to_subscription(
                type('Sub', (), {
                    'endpoint': sub.endpoint,
                    'p256dh': sub.p256dh,
                    'auth': sub.auth
                })(),
                title="🔔 Освободилось удобное время!",
                body=f"Слот на {desired_slot} стал свободен. Запишитесь онлайн: /c/{master.slug}",
                url=f"/c/{master.slug}"
            ):
                sent += 1
        sub.is_notified = True
        db.add(sub)

    db.commit()
    return sent


@app.post(
    "/api/app/waitlist/subscribe",
    response_model=WaitlistSubscriptionResponse,
    tags=["Waitlist"],
    summary="Подписаться на уведомление об освобождении слота"
)
def waitlist_subscribe(payload: WaitlistSubscriptionCreate, db: Session = Depends(get_db)):
    """Клиент подписывается на уведомление, если желаемый слот занят.
    Как только слот освободится — клиент получит push-уведомление."""
    master = db.query(Master).filter(Master.slug == payload.master_slug).first()
    if not master:
        raise HTTPException(status_code=404, detail=f"Мастер '{payload.master_slug}' не найден")

    existing = db.query(WaitlistSubscription).filter(
        WaitlistSubscription.master_id == master.id,
        WaitlistSubscription.desired_slot == payload.desired_slot,
        WaitlistSubscription.client_phone == payload.client_phone,
        WaitlistSubscription.is_notified == False
    ).first()
    if existing:
        return WaitlistSubscriptionResponse(
            success=True,
            message="Вы уже подписаны на уведомление об этом слоте",
            slot=payload.desired_slot
        )

    sub = WaitlistSubscription(
        master_id=master.id,
        client_name=payload.client_name,
        client_phone=payload.client_phone,
        client_slug=f"client_{payload.master_slug}",
        desired_slot=payload.desired_slot,
        endpoint=payload.endpoint,
        p256dh=payload.p256dh,
        auth=payload.auth
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    return WaitlistSubscriptionResponse(
        success=True,
        message="Подписка оформлена. Сообщим, когда слот освободится 🔔",
        slot=payload.desired_slot
    )


@app.get(
    "/api/app/waitlist/check",
    tags=["Waitlist"],
    summary="Проверить освободившиеся слоты для подписчиков (для опроса фронтендом)"
)
def waitlist_check(slug: str = Query(...), db: Session = Depends(get_db)):
    """Возвращает слоты, которые освободились и на которые есть подписчики waitlist.
    Фронтенд может опрашивать этот эндпоинт, чтобы показать уведомления клиенту."""
    # slug приходит в формате 'client_anna' — извлекаем мастерский slug
    master_slug = slug.replace("client_", "") if slug.startswith("client_") else slug
    master = db.query(Master).filter(Master.slug == master_slug).first()
    if not master:
        raise HTTPException(status_code=404, detail=f"Мастер '{master_slug}' не найден")

    subs = (
        db.query(WaitlistSubscription)
        .filter(
            WaitlistSubscription.master_id == master.id,
            WaitlistSubscription.is_notified == True,
            WaitlistSubscription.created_at >= datetime.utcnow() - timedelta(days=7)
        )
        .all()
    )

    # Только время слотов: имена и телефоны клиентов наружу не отдаём
    slots = sorted({sub.desired_slot for sub in subs})
    return {"slots": [{"slot": s} for s in slots], "count": len(slots)}


@app.post(
    "/api/app/booking/{booking_id}/reject",
    response_model=BookingResponse,
    tags=["Bookings"],
    summary="Отклонить бронь (Занято в блокноте ❌)"
)
def reject_booking(booking_id: int, master_id: int = Depends(auth_master_id), db: Session = Depends(get_db)):
    """Переводит статус брони в 'cancelled' и уведомляет подписчиков waitlist"""
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.master_id == master_id).first()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Запись с ID {booking_id} не найдена"
        )

    booking.status = "cancelled"
    db.commit()
    db.refresh(booking)

    # Уведомляем подписчиков waitlist, что слот освободился
    master = db.query(Master).filter(Master.id == booking.master_id).first()
    if master:
        notify_waitlist_on_slot_free(booking.datetime_str, master, db)

    return _build_booking_response(booking)


# =====================================================================
# 9. GIGACHAT AI ЭНДПОИНТЫ
# =====================================================================

@app.post(
    "/api/app/ai/business-audit",
    response_model=BusinessAuditResponse,
    tags=["AI"],
    summary="Бизнес-аудит месяца от GigaChat"
)
def business_audit(slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """
    Собирает статистику мастера за текущий месяц и генерирует аудит через GigaChat.
    """
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(status_code=404, detail=f"Мастер '{slug}' не найден")

    now = datetime.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Доходы за месяц
    income_tx = (
        db.query(Transaction)
        .filter(
            Transaction.master_id == master.id,
            Transaction.type == "income",
            Transaction.date >= month_start
        )
        .all()
    )
    total_income = round(sum(t.amount for t in income_tx), 2)

    # Расходы за месяц
    expense_tx = (
        db.query(Transaction)
        .filter(
            Transaction.master_id == master.id,
            Transaction.type == "expense",
            Transaction.date >= month_start
        )
        .all()
    )
    total_expense = round(sum(t.amount for t in expense_tx), 2)
    net_profit = round(total_income - total_expense, 2)

    # Брони за месяц
    month_bookings = (
        db.query(Booking)
        .filter(
            Booking.master_id == master.id,
            Booking.scheduled_at >= month_start
        )
        .all()
    )
    bookings_count = len(month_bookings)
    cancelled_count = sum(1 for b in month_bookings if b.status in ("cancelled", "cancelled_by_client", "no_show"))

    # Клиенты в базе
    clients_count = db.query(Client).filter(Client.master_id == master.id).count()

    stats_data = {
        "income": total_income,
        "expense": total_expense,
        "profit": net_profit,
        "bookings_count": bookings_count,
        "cancelled_count": cancelled_count,
        "clients_count": clients_count
    }

    result = ai_parser.generate_business_audit(stats_data)
    return BusinessAuditResponse(**result)


@app.post(
    "/api/app/ai/conflict-resolver",
    response_model=ConflictResolverResponse,
    tags=["AI"],
    summary="Генерация тактичного ответа клиенту в конфликтной ситуации"
)
def conflict_resolver(payload: ConflictResolverRequest, slug: str = Depends(auth_slug), db: Session = Depends(get_db)):
    """
    Генерирует ответ на сообщение клиента в конфликтной ситуации через GigaChat.
    """
    master = db.query(Master).filter(Master.slug == slug).first()
    if not master:
        raise HTTPException(status_code=404, detail=f"Мастер '{slug}' не найден")

    result = ai_parser.generate_conflict_reply(
        scenario_type=payload.scenario_type,
        client_name=payload.client_name,
        details=payload.details or ""
    )
    return ConflictResolverResponse(**result)


@app.post(
    "/api/app/booking/{booking_id}/send-care-card",
    response_model=CareCardResponse,
    tags=["Bookings", "AI"],
    summary="Отправить памятку по уходу клиенту после визита"
)
def send_care_card(booking_id: int, master_id: int = Depends(auth_master_id), db: Session = Depends(get_db)):
    """
    Генерирует памятку по уходу для клиента после завершенного визита.
    """
    booking = (
        db.query(Booking)
        .filter(Booking.id == booking_id, Booking.master_id == master_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail=f"Запись с ID {booking_id} не найдена")

    if booking.status != "completed":
        raise HTTPException(
            status_code=400,
            detail="Памятку можно отправить после визита: сначала отметьте «Пришла»"
        )

    # Загружаем связанного клиента, если ещё не загружен
    if not booking.client:
        db.refresh(booking, attribute_names=["client"])
    client_name = booking.client.name if booking.client else "Клиент"
    service_name = booking.service_name

    result = ai_parser.generate_post_care_card(service_name=service_name, client_name=client_name)
    card_text = result.get("care_card_text", "")

    return CareCardResponse(success=True, card_text=card_text, source=result.get("source", "template"))


# =====================================================================
# 10. ФОНОВЫЙ ШЕДУЛЕР: АВТОМАТИЧЕСКИЕ PUSH-УВЕДОМЛЕНИЯ
# =====================================================================

def check_and_send_upcoming_reminders():
    """
    Проверяет брони, которые начнутся в ближайший час,
    и отправляет push-уведомления клиентам (если еще не отправляли).
    Запускается каждые 5 минут в фоновом потоке.
    """
    db = SessionLocal()
    try:
        now = datetime.now()
        soon = now + timedelta(hours=1)

        bookings = (
            db.query(Booking)
            .filter(
                Booking.status.in_(["pending", "confirmed"]),
                Booking.reminder_sent == False,
                Booking.scheduled_at.isnot(None),
                Booking.scheduled_at >= now,
                Booking.scheduled_at <= soon,
            )
            .all()
        )

        for b in bookings:
            if not b.client:
                db.refresh(b, attribute_names=["client"])
            client_name = b.client.name if b.client else "Клиент"

            # Находим push-подписки этого клиента (slug = client_{master_slug})
            master = db.query(Master).filter(Master.id == b.master_id).first()
            if not master:
                continue

            # Только браузеры этого клиента (раньше уходило всем клиентам мастера)
            subs = (
                db.query(PushSubscription)
                .filter(
                    PushSubscription.slug == f"client_{master.slug}",
                    PushSubscription.client_id == b.client_id
                )
                .all()
            )

            for sub in subs:
                if sub.endpoint and sub.p256dh and sub.auth:
                    send_push_to_subscription(
                        type("Sub", (), {
                            "endpoint": sub.endpoint,
                            "p256dh": sub.p256dh,
                            "auth": sub.auth,
                        })(),
                        title=f"⏰ Напоминание о записи",
                        body=f"{client_name}, через {max(0, int((b.scheduled_at - now).total_seconds() // 60))} мин. у вас {b.service_name} ({b.datetime_str})",
                        url=f"/c/{master.slug}",
                    )

            b.reminder_sent = True
            db.add(b)

        db.commit()
    except Exception as e:
        print(f"[Reminder scheduler error] {e}")
        db.rollback()
    finally:
        db.close()


def check_and_send_returning_clients():
    """
    Проверяет клиентов, которым пора возвращаться (прошел cycle_days),
    и отправляет им push-уведомления.
    Запускается реже — раз в 30 минут.
    """
    db = SessionLocal()
    try:
        now = datetime.now()
        masters = db.query(Master).all()

        for master in masters:
            clients = db.query(Client).filter(Client.master_id == master.id).all()
            for c in clients:
                if not c.last_visit_date:
                    continue
                # Один пуш за цикл: после нового визита отметка сбрасывается сама
                if c.return_push_at and c.return_push_at >= c.last_visit_date:
                    continue
                days_since = (now - c.last_visit_date).days
                if days_since < c.cycle_days:
                    continue
                subs = (
                    db.query(PushSubscription)
                    .filter(
                        PushSubscription.slug == f"client_{master.slug}",
                        PushSubscription.client_id == c.id
                    )
                    .all()
                )
                sent = False
                for sub in subs:
                    if sub.endpoint and sub.p256dh and sub.auth:
                        sent = send_push_to_subscription(
                            type("Sub", (), {
                                "endpoint": sub.endpoint,
                                "p256dh": sub.p256dh,
                                "auth": sub.auth,
                            })(),
                            title=f"Пора на повторный визит, {c.name}!",
                            body=f"С прошлого визита прошло {days_since} дн. Выберите удобное время: /c/{master.slug}",
                            url=f"/c/{master.slug}",
                        ) or sent
                if subs:
                    c.return_push_at = now
        db.commit()
    except Exception as e:
        print(f"[Returning clients scheduler error] {e}")
        db.rollback()
    finally:
        db.close()


def reminder_scheduler_loop():
    """Фоновый цикл: проверка напоминаний каждые 5 минут, возврата клиентов — каждые 30 минут."""
    while True:
        check_and_send_upcoming_reminders()
        time.sleep(300)  # 5 минут
        check_and_send_returning_clients()
        time.sleep(1500)  # 25 минут (всего 30 минут между проверками возврата)


# Запуск фонового потока при старте приложения
scheduler_thread = threading.Thread(target=reminder_scheduler_loop, daemon=True)
scheduler_thread.start()


# =====================================================================
# 11. РАЗДАЧА СТАТИКИ СОБРАННОГО ФРОНТЕНДА (ДЛЯ PRODUCTION DEPLOY)
# =====================================================================
if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/sw.js", include_in_schema=False)
    def serve_sw():
        dist_sw = os.path.join(FRONTEND_DIST, "sw.js")
        if os.path.isfile(dist_sw):
            return FileResponse(dist_sw, media_type="application/javascript")
        public_sw = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "public", "sw.js")
        return FileResponse(public_sw, media_type="application/javascript")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa_app(full_path: str):
        if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            raise HTTPException(status_code=404, detail="API route not found")

        file_candidate = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_candidate):
            return FileResponse(file_candidate)

        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend index.html not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
