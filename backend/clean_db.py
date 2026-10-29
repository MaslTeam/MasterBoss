import os
import sys

# Добавляем путь к backend
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from database import engine, SessionLocal, Base
from models import Master, Client, Booking, Transaction, Service, PushSubscription, WaitlistSubscription


def clean_database():
    """
    Полная очистка всех демо-данных из базы данных SQLite.
    Создает чистую структуру таблиц и оставляет базовый аккаунт мастера 'anna' с PIN 1234
    и 4 базовыми услугами. 
    Все демо-клиенты, демо-записи, демо-транзакции и подписки удаляются!
    """
    print("=" * 60)
    print("  ОЧИСТКА ВСЕХ ДЕМО-ДАННЫХ ДЛЯ PRODUCTION ДЕПЛОЯ")
    print("=" * 60)

    # 1. Сброс и создание чистых таблиц
    print("\n[1/3] Пересоздание чистой структуры таблиц...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("      [+] Таблицы успешно созданы.")

    db = SessionLocal()
    try:
        # 2. Создание чистого профиля мастера
        print("\n[2/3] Создание чистого профиля мастера...")
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
        print(f"      [+] Мастер создан: {master.name} (slug: '{master.slug}', PIN: '{master.pin_code}')")

        # 3. Стартовые услуги прайс-листа мастера
        print("\n[3/3] Добавление стартового каталога услуг...")
        services_data = [
            {"name": "Маникюр с покрытием", "price": 2500.0, "duration_min": 90},
            {"name": "Снятие + укрепление", "price": 2800.0, "duration_min": 120},
            {"name": "Педикюр с покрытием", "price": 3200.0, "duration_min": 90},
            {"name": "Экспресс-маникюр", "price": 1800.0, "duration_min": 45},
        ]

        for s in services_data:
            svc = Service(
                master_id=master.id,
                name=s["name"],
                price=s["price"],
                duration_min=s["duration_min"],
                is_active=True
            )
            db.add(svc)

        db.commit()
        print("      [+] Добавлено 4 стартовые услуги (мастер может изменить или удалить их в настройках).")

        # Итог
        clients_count = db.query(Client).count()
        bookings_count = db.query(Booking).count()
        tx_count = db.query(Transaction).count()
        push_count = db.query(PushSubscription).count()
        wl_count = db.query(WaitlistSubscription).count()

        print("\n" + "=" * 60)
        print("  ИТОГОВОЕ СОСТОЯНИЕ БАЗЫ ДАННЫХ:")
        print(f"  * Клиентов:       {clients_count} (чисто)")
        print(f"  * Записей:        {bookings_count} (чисто)")
        print(f"  * Транзакций:     {tx_count} (чисто, баланс: 0 ₽)")
        print(f"  * Push-подписок:  {push_count} (чисто)")
        print(f"  * Лист ожидания:  {wl_count} (чисто)")
        print(f"  * Аккаунт мастера: '{master.slug}' (PIN: '{master.pin_code}')")
        print("=" * 60)
        print("  БАЗА ДАННЫХ ПОЛНОСТЬЮ ОЧИЩЕНА И ГОТОВА К ДЕПЛОЮ!")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"[ОШИБКА] Не удалось очистить БД: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    clean_database()
