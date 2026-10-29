import os
import re
import json
import logging
from typing import Optional
from dotenv import load_dotenv

# Загружаем переменные окружения (.env)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend", ".env"))
load_dotenv()

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Ты — NLU-парсер онлайн-записи к бьюти-мастеру. Твоя задача — извлечь данные из сообщения клиента и вернуть ИСКЛЮЧИТЕЛЬНО валидный JSON-объект без форматирования и markdown.

Формат JSON:
{
  "client_name": "Имя клиента (найденное в тексте или переданное)",
  "client_phone": "Номер телефона (найденный в тексте или переданный)",
  "service_name": "Название услуги (например: Маникюр, Педикюр, Снятие + покрытие, Наращивание)",
  "datetime_str": "Дата и время в понятном виде (например: Завтра в 16:00, Четверг 15:00)",
  "price": 2500,
  "reply_to_client": "Короткий вежливый ответ ассистента клиенту с повторением выбранной услуги, даты и времени: 'Зафиксировала заявку на [услуга] в [время]. Передала мастеру на сверку с бумажным блокнотом!'"
}

Пример входного текста: "Привет, я Катя 89991112233 хочу на педикюр в пятницу к 18:00"
Пример ответа: {"client_name": "Катя", "client_phone": "89991112233", "service_name": "Педикюр", "datetime_str": "Пятница, 18:00", "price": 2500, "reply_to_client": "Катя, здравствуйте! Заявку на педикюр на пятницу в 18:00 зафиксировала. Передала мастеру на сверку с бумажным блокнотом!"}"""


def _fallback_parse(text: str, client_name: str = "", client_phone: str = "") -> dict:
    """
    Надежный regex-fallback парсер на случай отсутствия токена,
    недоступности сети или сбоя ответа нейросети.
    Гарантирует, что сервис никогда не упадет с ошибкой 500.
    """
    text_clean = text.strip()
    text_lower = text_clean.lower()

    # 1. Извлечение телефона
    phone = ""
    phone_match = re.search(r'(\+?[78][-( ]?\d{3}[-) ]?\d{3}[- ]?\d{2}[- ]?\d{2}|\+?[78]\d{10})', text_clean)
    if phone_match:
        phone = re.sub(r'[^\d+]', '', phone_match.group(1))
        if phone.startswith('8') and len(phone) == 11:
            phone = '+7' + phone[1:]
    if not phone and client_phone:
        phone = client_phone.strip()

    # 2. Извлечение имени
    name = client_name.strip() if client_name and client_name.strip() != "Клиент" else ""
    if not name:
        name_match = re.search(r'(?:я|меня зовут|от)\s+([А-ЯЁ][а-яё]+|[A-Z][a-z]+)', text_clean, re.IGNORECASE)
        if name_match:
            candidate = name_match.group(1).capitalize()
            # Исключаем служебные слова
            if candidate.lower() not in {"хочу", "буду", "завтра", "сегодня", "маникюр", "педикюр", "номер"}:
                name = candidate
    if not name:
        name = "Клиент"

    # 3. Определение услуги
    if "педикюр" in text_lower:
        service_name = "Педикюр"
        price = 2800.0
    elif "наращиван" in text_lower:
        service_name = "Наращивание ногтей"
        price = 3500.0
    elif "сняти" in text_lower:
        service_name = "Снятие + покрытие"
        price = 2200.0
    elif "маникюр" in text_lower:
        service_name = "Маникюр + покрытие"
        price = 2500.0
    else:
        service_name = "Маникюр + покрытие"
        price = 2500.0

    # 4. Определение даты и времени
    day_str = ""
    for d, d_val in [
        ("сегодня", "Сегодня"),
        ("послезавтра", "Послезавтра"),
        ("завтра", "Завтра"),
        ("понедельник", "Понедельник"),
        ("вторник", "Вторник"),
        ("сред", "Среда"),
        ("четверг", "Четверг"),
        ("пятниц", "Пятница"),
        ("суббот", "Суббота"),
        ("воскресень", "Воскресенье")
    ]:
        if d in text_lower:
            day_str = d_val
            break

    time_match = re.search(r'(\d{1,2}[:.]\d{2})|(?:в|к)\s*(\d{1,2})(?::(\d{2}))?', text_clean, re.IGNORECASE)
    time_str = ""
    if time_match:
        if time_match.group(1):
            time_str = time_match.group(1).replace(".", ":")
        elif time_match.group(2):
            hh = time_match.group(2)
            mm = time_match.group(3) or "00"
            time_str = f"{hh}:{mm}"

    if day_str and time_str:
        datetime_str = f"{day_str}, {time_str}"
    elif day_str:
        datetime_str = f"{day_str}, 16:00"
    elif time_str:
        datetime_str = f"Завтра в {time_str}"
    else:
        datetime_str = "Завтра, 16:00"

    # 5. Формирование ответа
    if name and name != "Клиент":
        reply_to_client = f"{name}, здравствуйте! Заявку на {service_name.lower()} на {datetime_str} зафиксировала. Передала мастеру на сверку с бумажным блокнотом!"
    else:
        reply_to_client = f"Зафиксировала заявку на {service_name.lower()} на {datetime_str}. Передала мастеру на сверку с бумажным блокнотом!"

    return {
        "client_name": name,
        "client_phone": phone,
        "service_name": service_name,
        "datetime_str": datetime_str,
        "price": price,
        "reply_to_client": reply_to_client
    }


def parse_booking_message(text: str, client_name: str = "", client_phone: str = "") -> dict:
    """
    Интеллектуальный парсинг сообщения клиента через GigaChat от Сбера.
    При возникновении любых проблем (нет ключа, сбой сети, невалидный JSON)
    срабатывает безопасный fallback-парсер.
    """
    credentials = os.getenv("GIGACHAT_CREDENTIALS")

    if credentials:
        try:
            from gigachat import GigaChat

            # Убеждаемся в наличии модели по умолчанию
            os.environ.setdefault("GIGACHAT_MODEL", "GigaChat-2")

            user_prompt = (
                f"Сообщение клиента: {text}\n"
                f"Имя из формы: {client_name or 'не указано'}\n"
                f"Телефон из формы: {client_phone or 'не указан'}"
            )

            with GigaChat(
                credentials=os.getenv("GIGACHAT_CREDENTIALS"),
                scope="GIGACHAT_API_PERS",
                verify_ssl_certs=False
            ) as giga:
                response = giga.chat({
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt}
                    ]
                })

                raw_text = response.choices[0].message.content or ""

            # Очистка ответа от Markdown ```json ... ```
            cleaned = raw_text.strip()
            if "```" in cleaned:
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
                cleaned = re.sub(r"\s*```$", "", cleaned)
                cleaned = cleaned.strip()

            start_idx = cleaned.find("{")
            end_idx = cleaned.rfind("}")
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                cleaned = cleaned[start_idx:end_idx + 1]

            data = json.loads(cleaned)

            # Нормализация данных и валидация
            parsed_name = str(data.get("client_name") or "").strip()
            if not parsed_name or parsed_name.lower() in {"клиент", "не указано", "имя клиента"}:
                parsed_name = client_name.strip() if client_name else "Клиент"

            parsed_phone = str(data.get("client_phone") or "").strip()
            if not parsed_phone or parsed_phone.lower() in {"не указано", "номер не указан"}:
                parsed_phone = client_phone.strip() if client_phone else ""

            parsed_service = str(data.get("service_name") or "").strip()
            if not parsed_service:
                parsed_service = "Маникюр + покрытие"

            parsed_datetime = str(data.get("datetime_str") or "").strip()
            if not parsed_datetime:
                parsed_datetime = "Завтра, 16:00"

            try:
                parsed_price = float(data.get("price") or 2500)
            except (ValueError, TypeError):
                parsed_price = 2500.0

            reply = str(data.get("reply_to_client") or "").strip()
            if not reply:
                reply = f"Зафиксировала заявку на {parsed_service} на {parsed_datetime}. Передала мастеру на сверку с бумажным блокнотом!"

            return {
                "client_name": parsed_name,
                "client_phone": parsed_phone,
                "service_name": parsed_service,
                "datetime_str": parsed_datetime,
                "price": parsed_price,
                "reply_to_client": reply
            }

        except Exception as e:
            logger.warning(f"Ошибка вызова GigaChat, используем fallback: {e}")

    # Fallback при отсутствии ключа или ошибке
    return _fallback_parse(text, client_name, client_phone)


EXPENSE_SYSTEM_PROMPT = """Ты — финансовый ассистент частного мастера бьюти-сферы (маникюр, педикюр).
Твоя задача — извлечь из фразы мастера сумму расхода и определить наиболее подходящую категорию.
Категории (выбери строго одну из них):
- "Материалы (базы, топы, гель-лаки)"
- "Аренда кабинета / места"
- "Стерилизация и крафт-пакеты"
- "Фрезы и инструмент"
- "Кофе, чай и угощения"
- "Реклама и продвижение"
- "Обучение и курсы"
- "Прочее"

Верни ТОЛЬКО валидный JSON без markdown:
{
  "amount": 3500.0,
  "category": "Материалы (базы, топы, гель-лаки)"
}
"""


def _fallback_parse_expense(text: str) -> dict:
    """Fallback распознавание расхода регулярными выражениями"""
    text_lower = text.lower()

    # Поиск суммы (например "3500", "3 500", "2.5к", "2500 руб", "15 тыс")
    amount = 0.0
    # Ищем к/к/тыс/тысяча (например 2.5к, 15к, 10 тыс, 3 тысяча)
    k_match = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:к|k|тыс|тысяча)\b', text_lower)
    if k_match:
        val_str = k_match.group(1).replace(",", ".")
        try:
            amount = float(val_str) * 1000
        except ValueError:
            pass

    if amount <= 0:
        # Ищем числа от 10 до 1000000
        matches = re.findall(r'(\d[\d\s]*\d|\d+)', text)
        candidates = []
        for m in matches:
            clean = m.replace(" ", "")
            try:
                num = float(clean)
                if num > 10:  # отсекаем даты, дни и т.п.
                    candidates.append(num)
            except ValueError:
                pass
        if candidates:
            # Берем наибольшее число как сумму расхода
            amount = candidates[-1]

    if amount <= 0:
        amount = 1000.0

    # Определение категории
    if any(w in text_lower for w in ["аренд", "кабинет", "помещен", "место"]):
        cat = "Аренда кабинета / места"
    elif any(w in text_lower for w in ["баз", "топ", "гель", "лак", "цвет", "luxio", "e.mi", "материал", "страз"]):
        cat = "Материалы (базы, топы, гель-лаки)"
    elif any(w in text_lower for w in ["стерил", "пакет", "перчатк", "маск", "дез", "оптимакс", "сухожар", "салфетк"]):
        cat = "Стерилизация и крафт-пакеты"
    elif any(w in text_lower for w in ["фрез", "аппарат", "кусачк", "ножниц", "инструмент", "пилк", "бафик"]):
        cat = "Фрезы и инструмент"
    elif any(w in text_lower for w in ["кофе", "чай", "капсул", "конфет", "печень", "угощен", "молоко", "nespresso"]):
        cat = "Кофе, чай и угощения"
    elif any(w in text_lower for w in ["реклам", "таргет", "инст", "промо", "визитк", "блогер"]):
        cat = "Реклама и продвижение"
    elif any(w in text_lower for w in ["курс", "обучен", "вебинар", "мк", "повышен"]):
        cat = "Обучение и курсы"
    else:
        cat = "Прочее"

    return {"amount": float(amount), "category": cat}


def parse_expense_phrase(text: str) -> dict:
    """Умное распознавание расхода через GigaChat с fallback"""
    credentials = os.getenv("GIGACHAT_CREDENTIALS")
    if credentials:
        try:
            from gigachat import GigaChat
            os.environ.setdefault("GIGACHAT_MODEL", "GigaChat-2")
            with GigaChat(
                credentials=credentials,
                scope="GIGACHAT_API_PERS",
                verify_ssl_certs=False
            ) as giga:
                response = giga.chat({
                    "messages": [
                        {"role": "system", "content": EXPENSE_SYSTEM_PROMPT},
                        {"role": "user", "content": f"Фраза мастера о расходе: {text}"}
                    ]
                })
                raw = (response.choices[0].message.content or "").strip()

            cleaned = raw
            if "```" in cleaned:
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
                cleaned = re.sub(r"\s*```$", "", cleaned).strip()

            start_idx = cleaned.find("{")
            end_idx = cleaned.rfind("}")
            if start_idx != -1 and end_idx != -1:
                cleaned = cleaned[start_idx:end_idx + 1]
            data = json.loads(cleaned)

            amt = float(data.get("amount") or 0)
            cat = str(data.get("category") or "Прочее")
            if amt > 0:
                return {"amount": amt, "category": cat}
        except Exception as e:
            logger.warning(f"GigaChat expense parse error: {e}")

    return _fallback_parse_expense(text)


def generate_client_reminder(client_name: str, days_ago: int, cycle_days: int, service_name: str = "маникюр", master_name: str = "Анна Nails") -> str:
    """Генерация теплого продающего напоминания клиенту для возврата"""
    credentials = os.getenv("GIGACHAT_CREDENTIALS")
    if credentials:
        try:
            from gigachat import GigaChat
            prompt = (
                f"Напиши короткое, дружелюбное и вежливое сообщение в WhatsApp для клиентки по имени {client_name}. "
                f"Мастер: {master_name}. Прошло уже {days_ago} дней с прошлого визита на {service_name} (привычный цикл: {cycle_days} дней). "
                f"Пригласи обновить покрытие, подчеркни заботу о здоровье ногтей и упомяни, что есть удобные окошки на этой неделе. "
                f"Добавь ссылку /c/anna для быстрой онлайн-записи. Максимум 3-4 предложения, теплый тон с эмодзи."
            )
            with GigaChat(
                credentials=credentials,
                scope="GIGACHAT_API_PERS",
                verify_ssl_certs=False
            ) as giga:
                res = giga.chat({
                    "messages": [
                        {"role": "system", "content": "Ты — заботливый помощник топ-мастера бьюти-сферы. Пиши естественные, вовлекающие тексты напоминаний без канцеляризмов."},
                        {"role": "user", "content": prompt}
                    ]
                })
                text = (res.choices[0].message.content or "").strip()
                if text:
                    return text
        except Exception as e:
            logger.warning(f"GigaChat reminder error: {e}")

    # Fallback генератор
    return (
        f"{client_name}, добрый день! 💖 Это {master_name}.\n"
        f"Прошло уже {days_ago} дней после нашего последнего визита на {service_name.lower()}, "
        f"ноготки уже подросли и самое время обновить покрытие для идеальной носки ✨\n"
        f"Для вас есть удобные окошки на этой неделе! Выбрать время онлайн: /c/anna"
    )


# =====================================================================
# ГИГАЧАТ: БИЗНЕС-АУДИТ, КОНФЛИКТЫ, ПАМЯТКА УХОДА
# =====================================================================

def _fallback_business_audit(stats_data: dict) -> dict:
    income = stats_data.get("income", 0)
    expense = stats_data.get("expense", 0)
    profit = stats_data.get("profit", 0)
    bookings_count = stats_data.get("bookings_count", 0)
    cancelled_count = stats_data.get("cancelled_count", 0)
    clients_count = stats_data.get("clients_count", 0)

    cancel_rate = (cancelled_count / bookings_count * 100) if bookings_count > 0 else 0
    margin = (profit / income * 100) if income > 0 else 0

    audit_text = (
        f"📊 Аудит за месяц:\n"
        f"1. Сильная сторона: выполнено {bookings_count} визитов, выручка {income:,.0f} ₽ — стабильная загрузка.\n"
        f"2. Узкое место: отмены на уровне {cancel_rate:.1f}% ({cancelled_count} шт.), это потерянный доход.\n"
        f"3. Совет: поднимите чек на самую популярную услугу на 10-15% или добавьте допродажу ухода — это добавит до 20% прибыли.\n"
        f"Маржинальность сейчас {margin:.1f}%. Чистая прибыль: {profit:,.0f} ₽."
    )
    return {"audit_text": audit_text}


def generate_business_audit(stats_data: dict) -> dict:
    """
    Генерирует бизнес-аудит через GigaChat с безопасным fallback.
    """
    credentials = os.getenv("GIGACHAT_CREDENTIALS")
    if credentials:
        try:
            from gigachat import GigaChat

            prompt = (
                "Ты — опытный финансовый трекер бьюти-бизнеса. Проанализируй показатели мастера за месяц:\n"
                f"Выручка: {stats_data.get('income', 0)} ₽, "
                f"Расходы: {stats_data.get('expense', 0)} ₽, "
                f"Чистая прибыль: {stats_data.get('profit', 0)} ₽, "
                f"Всего визитов: {stats_data.get('bookings_count', 0)}, "
                f"Отмен: {stats_data.get('cancelled_count', 0)}.\n"
                "Сформулируй краткий аудит:\n"
                "1. Главная сильная сторона месяца (1 предложение).\n"
                "2. Узкое горлышко/потеря денег (1 предложение).\n"
                "3. Конкретный совет, как заработать на 15-20% больше в следующем месяце "
                "(например, поднять чек на популярную услугу или допродать уход).\n"
                "Пиши кратко, профессионально и мотивирующе, без воды."
            )

            with GigaChat(
                credentials=credentials,
                scope="GIGACHAT_API_PERS",
                verify_ssl_certs=False
            ) as giga:
                response = giga.chat({
                    "messages": [
                        {"role": "system", "content": "Ты — финансовый аналитик бьюти-бизнеса."},
                        {"role": "user", "content": prompt}
                    ]
                })
                text = (response.choices[0].message.content or "").strip()
                if text:
                    return {"audit_text": text}
        except Exception as e:
            logger.warning(f"GigaChat business audit error: {e}")

    return _fallback_business_audit(stats_data)


def _fallback_conflict_reply(scenario_type: str, client_name: str, details: str = "") -> dict:
    templates = {
        "late": (
            f"{client_name}, здравствуйте! Я вижу, что вы опаздываете более чем на 20 минут. "
            f"К сожалению, я не смогу провести полную процедуру в оставшееся время, так как у меня следующая клиентка. "
            f"Давайте перенесём запись на другое удобное время или сократим объём работ. Спасибо за понимание!"
        ),
        "discount": (
            f"{client_name}, привет! Цены на мои услуги установлены и одинаковы для всех, "
            f"чтобы качество оставалось на высоком уровне. Я не могу сделать скидку, "
            f"но могу предложить бонус за следующую запись или программу лояльности. Спасибо за понимание!"
        ),
        "late_cancel": (
            f"{client_name}, здравствуйте! К сожалению, отмена менее чем за 24 часа до визита "
            f"не подлежит возврату предоплаты, так как время уже зарезервировано specially для вас. "
            f"Вы можете перенести запись на другой день. Спасибо за понимание моих правил!"
        ),
        "custom": (
            f"{client_name}, спасибо за ваше сообщение! Я рассмотрю ситуацию ({details}) и отвечу вам в ближайшее время. "
            f"Моя цель — сохранить комфорт для обоих и соблюдать правила записи."
        ),
    }
    reply_text = templates.get(scenario_type, templates["custom"])
    return {"reply_text": reply_text}


def generate_conflict_reply(scenario_type: str, client_name: str, details: str = "") -> dict:
    """
    Генерирует тактичный ответ клиенту в конфликтной ситуации через GigaChat с fallback.
    """
    credentials = os.getenv("GIGACHAT_CREDENTIALS")
    if credentials:
        try:
            from gigachat import GigaChat

            prompt = (
                "Ты — эксперт по сервису и этикету в сфере услуг. Напиши тактичный, доброжелательный, но твердый ответ "
                f"клиенту {client_name} на ситуацию: {scenario_type} ({details}). "
                "Цель: сохранить лояльность, но отстоять границы мастера, время и правила записи. Не более 3-4 предложений."
            )

            with GigaChat(
                credentials=credentials,
                scope="GIGACHAT_API_PERS",
                verify_ssl_certs=False
            ) as giga:
                response = giga.chat({
                    "messages": [
                        {"role": "system", "content": "Ты — эксперт по клиентскому сервису в бьюти-сфере."},
                        {"role": "user", "content": prompt}
                    ]
                })
                text = (response.choices[0].message.content or "").strip()
                if text:
                    return {"reply_text": text}
        except Exception as e:
            logger.warning(f"GigaChat conflict reply error: {e}")

    return _fallback_conflict_reply(scenario_type, client_name, details)


def _fallback_post_care_card(service_name: str, client_name: str) -> dict:
    care_card_text = (
        f"{client_name}, спасибо за визит на {service_name}! 💖\n"
        f"Правила ухода в первые 48 часов:\n"
        f"1. ✨ Не мочите ногти первые 6 часов после покрытия.\n"
        f"2. 🧴 Используйте масло для кутикулы каждый день.\n"
        f"3. 🧤 Носите перчатки при уборке и мытье посуды.\n"
        f"Жду вас на коррекцию через 3-4 недели! ✨"
    )
    return {"care_card_text": care_card_text}


def generate_post_care_card(service_name: str, client_name: str) -> dict:
    """
    Генерирует памятку по уходу после процедуры через GigaChat с fallback.
    """
    credentials = os.getenv("GIGACHAT_CREDENTIALS")
    if credentials:
        try:
            from gigachat import GigaChat

            prompt = (
                f"Напиши короткую теплую памятку клиенту {client_name} после процедуры {service_name}. "
                "Включи: благодарность за визит и ровно 3 главных правила домашнего ухода в первые 48 часов "
                "списком с эмодзи. До 400 символов."
            )

            with GigaChat(
                credentials=credentials,
                scope="GIGACHAT_API_PERS",
                verify_ssl_certs=False
            ) as giga:
                response = giga.chat({
                    "messages": [
                        {"role": "system", "content": "Ты — заботливый бьюти-мастер, пишешь клиентам."},
                        {"role": "user", "content": prompt}
                    ]
                })
                text = (response.choices[0].message.content or "").strip()
                if text:
                    return {"care_card_text": text}
        except Exception as e:
            logger.warning(f"GigaChat care card error: {e}")

    return _fallback_post_care_card(service_name, client_name)

