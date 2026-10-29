import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from fastapi import HTTPException
from database import SessionLocal
from models import Master, Booking, Client
from main import (
    root,
    health_check,
    get_master_by_slug,
    get_master_profile,
    update_master_profile,
    change_master_pin,
    get_master_stats,
    confirm_booking,
    cancel_booking_by_client,
    reject_booking,
    mark_cancellation_read,
    create_transaction,
    get_master_clients,
    handle_chat_message,
    login_master,
    get_all_services,
    create_service,
    update_service,
    deactivate_service,
    get_available_slots,
    get_booking_status,
    parse_expense_with_ai,
    generate_reminder_with_ai,
    business_audit,
    conflict_resolver,
    send_care_card,
    subscribe_notifications,
    send_notification,
    get_upcoming_bookings,
    get_clients_due_return,
    push_subscribe,
    push_send_upcoming,
    push_send_clients_due,
    waitlist_subscribe,
    waitlist_check
)
from schemas import (
    TransactionCreate,
    ChatMessageRequest,
    LoginRequest,
    MasterProfileUpdate,
    ChangePinRequest,
    ServiceCreate,
    ServiceUpdate,
    AIExpenseRequest,
    AIReminderRequest,
    ConflictResolverRequest,
    PushSubscriptionCreate,
    NotificationSend,
    WaitlistSubscriptionCreate
)


def run_all_tests():
    db = SessionLocal()
    try:
        print("=======================================================")
        print("     ЗАПУСК ПОЛНОГО КОМПЛЕКСНОГО ТЕСТИРОВАНИЯ         ")
        print("=======================================================")

        # 0. Health check
        print("\n>>> 0. Health check")
        h = health_check()
        assert h["status"] == "ok"
        print(f"    [+] Health check OK: {h}")

        # 1. Login & Auth
        print("\n>>> 1. Testing login_master and PIN validation")
        master = db.query(Master).filter(Master.slug == "anna").first()
        current_pin = master.pin_code if master else "1234"
        login_res = login_master(LoginRequest(slug="anna", pin=current_pin), db=db)
        assert login_res.success is True
        print(f"    [+] Login success with current PIN '{current_pin}': token={login_res.token}")

        try:
            login_master(LoginRequest(slug="anna", pin="wrong_pin_9999"), db=db)
            assert False, "Should have failed with 401"
        except HTTPException as e:
            assert e.status_code == 401
            print(f"    [+] Wrong PIN correctly rejected with 401: {e.detail}")

        # 2. Master profile
        print("\n>>> 2. Testing get_master_profile & update_master_profile")
        profile = get_master_profile(slug="anna", db=db)
        assert profile["slug"] == "anna"
        print(f"    [+] Current profile: {profile['name']} ({profile['niche']})")

        # 3. Available slots
        print("\n>>> 3. Testing get_available_slots")
        slots = get_available_slots("anna", db=db)
        assert len(slots) > 0
        print(f"    [+] Total available slots: {len(slots)}. Sample: {slots[:3]}")

        # 4. Service CRUD
        print("\n>>> 4. Testing Service CRUD")
        new_svc = create_service(ServiceCreate(name="Парафинотерапия рук", price=1500.0, duration_min=40), slug="anna", db=db)
        assert new_svc.name == "Парафинотерапия рук"
        print(f"    [+] Created service #{new_svc.id}: {new_svc.name}")

        updated_svc = update_service(new_svc.id, ServiceUpdate(price=1700.0), slug="anna", db=db)
        assert updated_svc.price == 1700.0
        print(f"    [+] Updated service #{new_svc.id} price to {updated_svc.price}")

        deact = deactivate_service(new_svc.id, slug="anna", db=db)
        assert deact["success"] is True
        print(f"    [+] Deactivated service #{new_svc.id}")

        all_svc = get_all_services(slug="anna", db=db)
        assert any(s.id == new_svc.id for s in all_svc)
        print(f"    [+] Total services in settings: {len(all_svc)}")

        # 5. Client Chat & Booking
        print("\n>>> 5. Testing handle_chat_message (Booking creation & collision detection)")
        free_slot = slots[0]
        chat_req = ChatMessageRequest(
            slug="anna",
            client_name="Виктория Тестовая",
            client_phone="+7 (912) 345-67-89",
            service_name="Маникюр с покрытием",
            datetime_str=free_slot,
            price=2500.0
        )
        book_res = handle_chat_message(chat_req, db=db)
        assert book_res.booking_created is True
        new_booking_id = book_res.booking_id
        print(f"    [+] Booking created successfully! ID={new_booking_id}, slot={free_slot}")

        # Collision check on same slot
        try:
            handle_chat_message(chat_req, db=db)
            assert False, "Double booking should have raised 400"
        except HTTPException as e:
            assert e.status_code == 400
            assert "Слот уже забронирован" in e.detail
            print(f"    [+] Collision prevented correctly: {e.detail}")

        # 6. Booking status polling & Client properties
        print("\n>>> 6. Testing booking status & properties")
        status_res = get_booking_status(new_booking_id, db=db)
        assert status_res.status == "pending"
        print(f"    [+] Booking #{new_booking_id} status: {status_res.status}, can_cancel: {status_res.can_cancel}")

        # Confirm booking
        print("\n>>> 7. Testing confirm_booking")
        conf_res = confirm_booking(new_booking_id, db=db)
        assert conf_res.status == "confirmed"
        print(f"    [+] Booking #{new_booking_id} confirmed!")

        # 8. AI Features
        print("\n>>> 8. Testing AI endpoints")
        # 8.1 Expense parsing
        exp_res = parse_expense_with_ai(AIExpenseRequest(phrase="Купила базы и топ Luxio на 4500"))
        assert exp_res.amount == 4500.0
        print(f"    [+] AI expense parsed: {exp_res.amount} ₽, category: '{exp_res.category}'")

        # 8.2 Client reminder
        test_client = db.query(Client).filter(Client.master_id == master.id).first()
        rem_res = generate_reminder_with_ai(
            AIReminderRequest(
                client_id=test_client.id,
                client_name=test_client.name,
                days_ago=25,
                cycle_days=21,
                service_name="Маникюр"
            ),
            db=db
        )
        assert len(rem_res.message) > 10
        print(f"    [+] AI reminder generated for {test_client.name}: '{rem_res.message[:60]}...'")

        # 8.3 Business audit
        audit_res = business_audit(slug="anna", db=db)
        assert len(audit_res.audit_text) > 10
        print(f"    [+] AI business audit: '{audit_res.audit_text[:60]}...'")

        # 8.4 Conflict resolver
        conflict_res = conflict_resolver(
            ConflictResolverRequest(
                slug="anna",
                client_name="Ольга",
                scenario_type="late",
                details="Опоздание на 25 минут"
            ),
            db=db
        )
        assert len(conflict_res.reply_text) > 10
        print(f"    [+] AI conflict reply: '{conflict_res.reply_text[:60]}...'")

        # 8.5 Post-care card
        care_res = send_care_card(new_booking_id, db=db)
        assert care_res.success is True
        print(f"    [+] AI care card generated: '{care_res.card_text[:60]}...'")

        # 9. Transactions & Master Stats
        print("\n>>> 9. Testing Transactions & Master Stats")
        tx = create_transaction(
            TransactionCreate(type="expense", amount=1200.0, category="Расходники"),
            slug="anna",
            db=db
        )
        assert tx.amount == 1200.0
        print(f"    [+] Created transaction #{tx.id}: {tx.amount} ₽")

        stats = get_master_stats(slug="anna", db=db)
        assert stats.total_income >= 0
        assert stats.net_profit == round(stats.total_income - stats.total_expense, 2)
        print(f"    [+] Master stats: Income={stats.total_income} ₽, Expense={stats.total_expense} ₽, Profit={stats.net_profit} ₽")

        # 10. Clients & LTV due return
        print("\n>>> 10. Testing get_master_clients & get_clients_due_return")
        clients = get_master_clients(slug="anna", db=db)
        assert len(clients) > 0
        due_clients = get_clients_due_return(slug="anna", db=db)
        print(f"    [+] Total clients: {len(clients)}, due for return: {len(due_clients)}")

        # 11. Upcoming booking notifications
        print("\n>>> 11. Testing get_upcoming_bookings")
        up_bookings = get_upcoming_bookings(slug="anna", db=db)
        print(f"    [+] Upcoming bookings in next hour: {len(up_bookings)}")

        # 12. Push Notifications & Waitlist
        print("\n>>> 12. Testing Push Notifications & Waitlist")
        sub_res = push_subscribe(
            PushSubscriptionCreate(
                slug="anna",
                endpoint="https://fcm.googleapis.com/fcm/send/test-endpoint-anna",
                p256dh="test_p256dh_key",
                auth="test_auth_key",
                user_agent="Test Browser"
            ),
            db=db
        )
        assert sub_res.success is True
        print(f"    [+] Push subscribe result: {sub_res.message}")

        # Push send upcoming (gracefully handled even with mock keys)
        push_up = push_send_upcoming(slug="anna", db=db)
        print(f"    [+] Push send upcoming handled gracefully: {push_up}")

        # Waitlist subscribe
        wl_res = waitlist_subscribe(
            WaitlistSubscriptionCreate(
                master_slug="anna",
                client_name="Елена Ожидающая",
                client_phone="+7 (999) 888-77-66",
                desired_slot="01.11, 15:00"
            ),
            db=db
        )
        assert wl_res.success is True
        print(f"    [+] Waitlist subscribed for slot {wl_res.slot}")

        wl_check = waitlist_check(slug="client_anna", db=db)
        assert wl_check["count"] >= 1
        print(f"    [+] Waitlist check OK, pending waitlist entries: {wl_check['count']}")

        # 13. Reject booking
        print("\n>>> 13. Testing reject_booking")
        rej_res = reject_booking(new_booking_id, db=db)
        assert rej_res.status == "cancelled"
        print(f"    [+] Booking #{new_booking_id} rejected ('Занято в блокноте')")

        # 14. Mark cancellation read
        print("\n>>> 14. Testing mark_cancellation_read")
        mark_res = mark_cancellation_read(new_booking_id, db=db)
        assert mark_res["success"] is True
        print(f"    [+] Cancellation alert marked as read")

        print("\n=======================================================")
        print("  ПОЛНЫЙ КОМПЛЕКС ТЕСТОВ БЭКЕНДА УСПЕШНО ПРОЙДЕН!    ")
        print("=======================================================")

    finally:
        db.close()


if __name__ == "__main__":
    run_all_tests()
