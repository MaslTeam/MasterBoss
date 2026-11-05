"""
Демо-кабинет для жюри и показов.

Мастер со slug «demo» создаётся при каждом старте сервера и наполняется
правдоподобными данными за последние 2 месяца: визиты с доходом, расходы,
клиенты, которым пора вернуться, новые заявки и подтверждённые записи на
ближайшие дни. Все даты считаются от «сейчас», поэтому демо никогда не устаревает.

Войти в демо можно без PIN: POST /api/demo/login (на сайте — кнопка на главной
или адрес /demo). Кнопка «Сбросить демо» в кабинете возвращает данные к исходным.

Телефоны клиентов вымышленные (+7 999 000-…).
"""
import json
import random
import secrets
from datetime import datetime, timedelta

from models import Master, Client, Booking, Transaction, Service, PushSubscription, WaitlistSubscription
import auth

DEMO_SLUG = "demo"
DEMO_NAME = "Мария Nails (демо)"

DEMO_SERVICES = [
    ("Маникюр с покрытием", 2500, 90),
    ("Снятие + укрепление", 2800, 120),
    ("Педикюр с покрытием", 3200, 90),
    ("Экспресс-маникюр", 1800, 45),
]

DEMO_CLIENTS = [
    "Ирина Соколова", "Мария Петрова", "Екатерина Волкова", "Ольга Смирнова",
    "Дарья Кузнецова", "Алина Морозова", "Светлана Попова", "Наталья Лебедева",
    "Юлия Новикова", "Ксения Фёдорова",
]

# Откуда пришли клиенты: метка ?from= в ссылке записи
DEMO_REFS = ["insta"] * 5 + ["tg"] * 3 + ["max"] * 2 + [None] * 2


def _fmt(dt: datetime) -> str:
    return dt.strftime("%d.%m, %H:%M")


def _phone(i: int) -> str:
    return f"+7 (999) 000-{10 + i:02d}-{20 + i:02d}"


def ensure_demo_master(db, work_schedule: dict) -> Master:
    """Создаёт демо-мастера, если его нет, и заново заполняет данными."""
    master = db.query(Master).filter(Master.slug == DEMO_SLUG).first()
    if not master:
        master = Master(
            name=DEMO_NAME,
            slug=DEMO_SLUG,
            niche="Маникюр",
            trial_active=True,
            default_deposit=500,
            # Случайный PIN, который никто не знает: вход только через /api/demo/login
            pin_code=auth.hash_pin(secrets.token_hex(8)),
            work_schedule=json.dumps(work_schedule),
            slot_step_min=60,
            is_demo=True,
            created_at=datetime.now(),
        )
        db.add(master)
        db.commit()
        db.refresh(master)
    reset_demo_data(db, master, work_schedule)
    return master


def reset_demo_data(db, master: Master, work_schedule: dict):
    """Удаляет все данные демо-мастера и создаёт их заново."""
    mid = master.id
    db.query(Transaction).filter(Transaction.master_id == mid).delete(synchronize_session=False)
    db.query(Booking).filter(Booking.master_id == mid).delete(synchronize_session=False)
    db.query(WaitlistSubscription).filter(WaitlistSubscription.master_id == mid).delete(synchronize_session=False)
    db.query(Client).filter(Client.master_id == mid).delete(synchronize_session=False)
    db.query(Service).filter(Service.master_id == mid).delete(synchronize_session=False)
    db.query(PushSubscription).filter(
        PushSubscription.slug.in_([DEMO_SLUG, f"client_{DEMO_SLUG}"])
    ).delete(synchronize_session=False)

    master.name = DEMO_NAME
    master.niche = "Маникюр"
    master.is_demo = True
    master.work_schedule = json.dumps(work_schedule)
    master.slot_step_min = 60
    db.commit()

    rng = random.Random(2026)
    now = datetime.now().replace(second=0, microsecond=0)
    today = now.replace(hour=0, minute=0)

    services = []
    for name, price, duration in DEMO_SERVICES:
        s = Service(master_id=mid, name=name, price=float(price), duration_min=duration, is_active=True)
        db.add(s)
        services.append(s)

    clients = []
    for i, name in enumerate(DEMO_CLIENTS):
        c = Client(master_id=mid, name=name, phone=_phone(i), cycle_days=21)
        db.add(c)
        clients.append(c)
    db.commit()

    # Постоянные клиентки ходят регулярно; последние три давно не были — им «пора вернуться»
    regular = clients[:7]
    lapsed = clients[7:]

    def add_booking(client, service, when, status, ref="__random__", created_days_before=None):
        ref_value = rng.choice(DEMO_REFS) if ref == "__random__" else ref
        created = when - timedelta(days=created_days_before if created_days_before is not None else rng.randint(1, 6))
        b = Booking(
            master_id=mid,
            client_id=client.id,
            service_name=service.name,
            price=float(service.price),
            datetime_str=_fmt(when),
            scheduled_at=when,
            status=status,
            master_notified_cancellation=True,
            source="link",
            ref=ref_value,
            client_token=secrets.token_urlsafe(16),
            created_at=min(created, now),
        )
        db.add(b)
        db.flush()
        return b

    # ---- Прошедшие визиты за ~2 месяца ----
    last_visit = {}
    no_show_left = 2
    for days_ago in range(58, 0, -1):
        day = today - timedelta(days=days_ago)
        if day.weekday() == 6:          # воскресенье — выходной
            continue
        for hour in rng.sample([10, 12, 14, 16, 18], k=rng.choice([0, 1, 1, 2, 2, 3])):
            pool = regular if days_ago < 24 else clients
            client = rng.choice(pool)
            if client in lapsed and days_ago < 26:
                client = rng.choice(regular)
            service = rng.choices(services, weights=[6, 2, 3, 2])[0]
            when = day.replace(hour=hour)
            if no_show_left and days_ago in (33, 12):
                add_booking(client, service, when, "no_show")
                no_show_left -= 1
                continue
            b = add_booking(client, service, when, "completed")
            b.visited_at = when + timedelta(minutes=service.duration_min)
            db.add(Transaction(
                master_id=mid, type="income", amount=float(service.price),
                category=f"Услуга: {service.name}", date=when, source="booking", booking_id=b.id,
            ))
            last_visit[client.id] = when

    for client in clients:
        client.last_visit_date = last_visit.get(client.id)
    # Гарантируем трёх клиенток «пора вернуться» с понятными сроками
    for client, days in zip(lapsed, (27, 33, 41)):
        client.last_visit_date = (today - timedelta(days=days)).replace(hour=14)

    # ---- Расходы ----
    expenses = [
        (55, "Аренда кабинета / места", 12000, "manual"),
        (25, "Аренда кабинета / места", 12000, "manual"),
        (50, "Материалы (базы, топы, гель-лаки)", 3200, "ai"),
        (38, "Стерилизация и крафт-пакеты", 900, "manual"),
        (30, "Материалы (базы, топы, гель-лаки)", 2450, "ai"),
        (19, "Реклама", 1500, "manual"),
        (9, "Материалы (базы, топы, гель-лаки)", 1850, "ai"),
        (3, "Стерилизация и крафт-пакеты", 700, "manual"),
    ]
    for days_ago, category, amount, source in expenses:
        db.add(Transaction(
            master_id=mid, type="expense", amount=float(amount), category=category,
            date=(today - timedelta(days=days_ago)).replace(hour=20), source=source,
        ))

    # ---- Ближайшие записи ----
    def next_workday(offset):
        day = today + timedelta(days=offset)
        while day.weekday() == 6:
            day += timedelta(days=1)
        return day

    # Сегодня через ~50 минут — видно во вкладке «Напомнить за час»
    soon = now + timedelta(minutes=50)
    soon = soon.replace(minute=(soon.minute // 5) * 5)
    if soon.date() == now.date() and 9 <= soon.hour <= 20:
        add_booking(regular[0], services[0], soon, "confirmed", ref="insta", created_days_before=2)

    d1, d2, d3, d4 = next_workday(1), next_workday(2), next_workday(3), next_workday(4)
    add_booking(regular[1], services[2], d1.replace(hour=11), "confirmed", ref="tg")
    add_booking(regular[2], services[0], d1.replace(hour=15), "pending", ref="insta", created_days_before=0)
    add_booking(regular[3], services[1], d2.replace(hour=12), "confirmed", ref="max")
    add_booking(regular[4], services[3], d3.replace(hour=17), "pending", ref=None, created_days_before=0)
    # Отмена клиенткой — в кабинете будет красное уведомление
    cancelled = add_booking(regular[5], services[0], d4.replace(hour=13), "cancelled_by_client", ref="tg")
    cancelled.master_notified_cancellation = False

    db.commit()
