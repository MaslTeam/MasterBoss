import os
import sys
from datetime import datetime, timedelta

# Добавляем путь к backend для корректного импорта модулей из любой директории
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Настройка кодировки вывода для корректной работы в Windows-консоли
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from database import engine, SessionLocal, Base
from models import Master, Client, Booking, Transaction, Service


def seed_database():
    print("=" * 60)
    print("  Инициализация и наполнение базы данных МастерБосс (MVP)")
    print("=" * 60)

    # 1. Пересоздание таблиц
    print("\n[1/6] Пересоздание таблиц в SQLite (masterboss.db)...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("      [+] Таблицы успешно созданы.")

    db = SessionLocal()

    try:
        # 2. Создание профиля мастера
        print("\n[2/6] Создание мастера...")
        master = Master(
            name="Анна Nails",
            slug="anna",
            niche="Маникюр",
            trial_active=True,
            default_deposit=500,
            pin_code="1234"
        )
        db.add(master)
        db.commit()
        db.refresh(master)
        print(f"      [+] Мастер создан: {master.name} (slug: '{master.slug}', ниша: {master.niche}, PIN: '{master.pin_code}')")

        # 3. Создание 4 реальных услуг мастера
        print("\n[3/6] Создание 4 услуг мастера в таблице Service...")
        services_data = [
            {"name": "Маникюр с покрытием", "price": 2500.0, "duration_min": 90},
            {"name": "Снятие + укрепление", "price": 2800.0, "duration_min": 120},
            {"name": "Педикюр с покрытием", "price": 3200.0, "duration_min": 90},
            {"name": "Экспресс-маникюр", "price": 1800.0, "duration_min": 45},
        ]

        services = []
        for s in services_data:
            service = Service(
                master_id=master.id,
                name=s["name"],
                price=s["price"],
                duration_min=s["duration_min"],
                is_active=True
            )
            db.add(service)
            services.append(service)

        db.commit()
        for s in services:
            db.refresh(s)
            print(f"      [+] Услуга #{s.id}: «{s.name}» — {s.price:,.0f} ₽ ({s.duration_min} мин)")

        # 4. Создание 12 клиентов
        print("\n[4/6] Создание 12 клиентов с телефонами и датами прошлых визитов...")
        now = datetime.now()

        clients_data = [
            {"name": "Елена Соколова", "phone": "+7 (916) 123-45-67", "cycle_days": 21, "days_ago": 18},
            {"name": "Ольга Морозова", "phone": "+7 (925) 234-56-78", "cycle_days": 21, "days_ago": 12},
            {"name": "Екатерина Новикова", "phone": "+7 (903) 345-67-89", "cycle_days": 28, "days_ago": 24},
            {"name": "Мария Кузнецова", "phone": "+7 (915) 456-78-90", "cycle_days": 21, "days_ago": 5},
            {"name": "Наталья Смирнова", "phone": "+7 (926) 567-89-01", "cycle_days": 14, "days_ago": 9},
            {"name": "Анастасия Васильева", "phone": "+7 (977) 678-90-12", "cycle_days": 21, "days_ago": 20},
            {"name": "Дарья Попова", "phone": "+7 (999) 789-01-23", "cycle_days": 28, "days_ago": 15},
            {"name": "Светлана Ковалева", "phone": "+7 (905) 890-12-34", "cycle_days": 21, "days_ago": 22},
            {"name": "Ирина Федорова", "phone": "+7 (916) 901-23-45", "cycle_days": 21, "days_ago": 3},
            {"name": "Татьяна Лебедева", "phone": "+7 (925) 012-34-56", "cycle_days": 28, "days_ago": 27},
            {"name": "Ксения Романова", "phone": "+7 (903) 123-78-90", "cycle_days": 21, "days_ago": 7},
            {"name": "Виктория Ильина", "phone": "+7 (985) 234-89-01", "cycle_days": 21, "days_ago": 14},
        ]

        clients = []
        for c in clients_data:
            client = Client(
                master_id=master.id,
                name=c["name"],
                phone=c["phone"],
                cycle_days=c["cycle_days"],
                last_visit_date=now - timedelta(days=c["days_ago"])
            )
            db.add(client)
            clients.append(client)

        db.commit()
        for cl in clients:
            db.refresh(cl)
        print(f"      [+] Добавлено клиентов: {len(clients)}")

        # 5. Создание записей на разные даты и статусы (pending, confirmed)
        print("\n[5/6] Создание записей на процедуры (pending, confirmed)...")

        def make_slot(days_ahead: int, hhmm: str):
            h, m = map(int, hhmm.split(":"))
            dt = (now + timedelta(days=days_ahead)).replace(hour=h, minute=m, second=0, microsecond=0)
            return dt.strftime("%d.%m, %H:%M"), dt

        slot_tomorrow_1230, dt_tomorrow_1230 = make_slot(1, "12:30")
        slot_day2_1500, dt_day2_1500 = make_slot(2, "15:00")

        bookings_data = [
            # Занятые динамические слоты (тот же формат, что и /available-slots)
            {"client_idx": 0, "service": "Маникюр с покрытием", "price": 2500.0, "dt": slot_tomorrow_1230, "at": dt_tomorrow_1230, "status": "confirmed"},
            {"client_idx": 1, "service": "Педикюр с покрытием", "price": 3200.0, "dt": slot_day2_1500, "at": dt_day2_1500, "status": "pending"},
            {"client_idx": 2, "service": "Снятие + укрепление", "price": 2800.0, "dt": make_slot(1, "16:30")[0], "at": make_slot(1, "16:30")[1], "status": "pending"},
            {"client_idx": 3, "service": "Экспресс-маникюр", "price": 1800.0, "dt": make_slot(2, "11:00")[0], "at": make_slot(2, "11:00")[1], "status": "confirmed"},
            {"client_idx": 4, "service": "Педикюр с покрытием", "price": 3200.0, "dt": make_slot(2, "14:00")[0], "at": make_slot(2, "14:00")[1], "status": "confirmed"},
            {"client_idx": 5, "service": "Маникюр с покрытием", "price": 2500.0, "dt": make_slot(2, "17:00")[0], "at": make_slot(2, "17:00")[1], "status": "pending"},
            {"client_idx": 6, "service": "Снятие + укрепление", "price": 2800.0, "dt": make_slot(3, "10:30")[0], "at": make_slot(3, "10:30")[1], "status": "confirmed"},
            {"client_idx": 7, "service": "Маникюр с покрытием", "price": 2500.0, "dt": make_slot(3, "13:00")[0], "at": make_slot(3, "13:00")[1], "status": "pending"},
            {"client_idx": 8, "service": "Педикюр с покрытием", "price": 3200.0, "dt": make_slot(3, "16:00")[0], "at": make_slot(3, "16:00")[1], "status": "confirmed"},
            {"client_idx": 9, "service": "Маникюр с покрытием", "price": 2500.0, "dt": make_slot(4, "11:00")[0], "at": make_slot(4, "11:00")[1], "status": "confirmed"},
            {"client_idx": 10, "service": "Экспресс-маникюр", "price": 1800.0, "dt": make_slot(4, "14:00")[0], "at": make_slot(4, "14:00")[1], "status": "pending"},
            {"client_idx": 11, "service": "Педикюр с покрытием", "price": 3200.0, "dt": make_slot(4, "16:30")[0], "at": make_slot(4, "16:30")[1], "status": "confirmed"},
            {"client_idx": 0, "service": "Снятие + укрепление", "price": 2800.0, "dt": make_slot(5, "10:00")[0], "at": make_slot(5, "10:00")[1], "status": "pending"},
            {"client_idx": 1, "service": "Маникюр с покрытием", "price": 2500.0, "dt": make_slot(5, "13:00")[0], "at": make_slot(5, "13:00")[1], "status": "confirmed"},
            {"client_idx": 3, "service": "Педикюр с покрытием", "price": 3200.0, "dt": make_slot(6, "11:30")[0], "at": make_slot(6, "11:30")[1], "status": "confirmed"},
            {"client_idx": 5, "service": "Маникюр с покрытием", "price": 2500.0, "dt": make_slot(6, "15:00")[0], "at": make_slot(6, "15:00")[1], "status": "confirmed"},
            {"client_idx": 7, "service": "Снятие + укрепление", "price": 2800.0, "dt": make_slot(7, "12:00")[0], "at": make_slot(7, "12:00")[1], "status": "pending"},
            {"client_idx": 8, "service": "Экспресс-маникюр", "price": 1800.0, "dt": make_slot(7, "16:00")[0], "at": make_slot(7, "16:00")[1], "status": "confirmed"},
        ]

        bookings = []
        for b in bookings_data:
            booking = Booking(
                master_id=master.id,
                client_id=clients[b["client_idx"]].id,
                service_name=b["service"],
                price=b["price"],
                datetime_str=b["dt"],
                scheduled_at=b["at"],
                status=b["status"]
            )
            db.add(booking)
            bookings.append(booking)

        db.commit()
        print(f"      [+] Добавлено записей: {len(bookings)}")

        # 6. Создание 15 финансовых транзакций
        # Чистая прибыль мастера: Доходы (115 000 руб.) - Расходы (30 000 руб.) = 85 000 руб.
        print("\n[6/6] Создание 15 финансовых транзакций с чистой прибылью ~85 000 руб...")
        transactions_data = [
            # Доходы (10 транзакций) = 115 000 руб.
            {"type": "income", "amount": 14000.0, "category": "Процедуры (выручка за субботу)", "days_ago": 1},
            {"type": "income", "amount": 13000.0, "category": "Процедуры (выручка за воскресенье)", "days_ago": 2},
            {"type": "income", "amount": 15000.0, "category": "Процедуры (выручка за пятницу)", "days_ago": 3},
            {"type": "income", "amount": 12500.0, "category": "Процедуры (маникюр и педикюр)", "days_ago": 5},
            {"type": "income", "amount": 11500.0, "category": "Процедуры (комплексы маникюр+педикюр)", "days_ago": 7},
            {"type": "income", "amount": 11000.0, "category": "Процедуры (постоянные клиенты)", "days_ago": 9},
            {"type": "income", "amount": 10500.0, "category": "Процедуры (Smart-педикюр)", "days_ago": 11},
            {"type": "income", "amount": 9500.0,  "category": "Процедуры (снятие + укрепление)", "days_ago": 13},
            {"type": "income", "amount": 9500.0,  "category": "Процедуры (экспресс-маникюр)", "days_ago": 15},
            {"type": "income", "amount": 8500.0,  "category": "Депозиты и предоплаты записей", "days_ago": 18},

            # Расходы (5 транзакций) = 30 000 руб.
            {"type": "expense", "amount": 18000.0, "category": "Аренда кабинета / рабочего места", "days_ago": 20},
            {"type": "expense", "amount": 5200.0,  "category": "Материалы (базы, топы, гель-лаки Luxio/E.Mi)", "days_ago": 14},
            {"type": "expense", "amount": 3100.0,  "category": "Стерилизация и расходники (крафт-пакеты, перчатки)", "days_ago": 10},
            {"type": "expense", "amount": 2200.0,  "category": "Фрезы для аппарата и дезрастворы Оптимакс", "days_ago": 6},
            {"type": "expense", "amount": 1500.0,  "category": "Угощения для клиентов (кофе Nespresso, сладости)", "days_ago": 4},
        ]

        total_income = 0.0
        total_expense = 0.0

        for t in transactions_data:
            tx = Transaction(
                master_id=master.id,
                type=t["type"],
                amount=t["amount"],
                category=t["category"],
                date=now - timedelta(days=t["days_ago"])
            )
            db.add(tx)
            if t["type"] == "income":
                total_income += t["amount"]
            else:
                total_expense += t["amount"]

        db.commit()
        net_profit = total_income - total_expense

        print(f"      [+] Добавлено транзакций: {len(transactions_data)}")
        print(f"      * Доходы:   {total_income:,.2f} руб.")
        print(f"      * Расходы:  {total_expense:,.2f} руб.")
        print(f"      * Чистая прибыль мастера: {net_profit:,.2f} руб.")

    except Exception as e:
        db.rollback()
        print(f"\n[ОШИБКА] Не удалось наполнить базу данных: {e}")
        raise
    finally:
        db.close()

    print("\n" + "=" * 60)
    print("  Демо-наполнение успешно завершено!")
    print("=" * 60)


if __name__ == "__main__":
    seed_database()
