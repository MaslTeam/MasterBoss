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


# =====================================================================
# ЕДИНЫЙ ВЫЗОВ GIGACHAT + ДИАГНОСТИКА
# =====================================================================
# Все функции ниже ходят в GigaChat только через _giga_complete().
# Настройки берутся из переменных окружения:
#   GIGACHAT_CREDENTIALS — ключ авторизации (Authorization key из личного кабинета)
#   GIGACHAT_SCOPE       — GIGACHAT_API_PERS (физлицо) | GIGACHAT_API_B2B | GIGACHAT_API_CORP
#   GIGACHAT_MODEL       — по умолчанию GigaChat-2
#   GIGACHAT_TIMEOUT     — таймаут запроса в секундах, по умолчанию 20

SOURCE_AI = "gigachat"
SOURCE_TEMPLATE = "template"

# Последняя ошибка вызова GigaChat — видна в /api/health/ai
LAST_AI_ERROR: Optional[str] = None


class GigaChatUnavailable(Exception):
    """GigaChat не настроен или вернул ошибку."""


def ai_configured() -> bool:
    return bool((os.getenv("GIGACHAT_CREDENTIALS") or "").strip())


def _giga_complete(system_prompt: str, user_prompt: str) -> str:
    """Отправляет один запрос в GigaChat и возвращает текст ответа.
    При любой проблеме бросает GigaChatUnavailable и пишет причину в лог."""
    global LAST_AI_ERROR
    credentials = (os.getenv("GIGACHAT_CREDENTIALS") or "").strip()
    if not credentials:
        LAST_AI_ERROR = "Переменная GIGACHAT_CREDENTIALS не задана"
        raise GigaChatUnavailable(LAST_AI_ERROR)
    if not credentials.isascii() or " " in credentials:
        LAST_AI_ERROR = ("В GIGACHAT_CREDENTIALS осталась заглушка или лишние символы: ключ состоит только из "
                         "латиницы, цифр и знаков =/+. Вставьте Authorization key из кабинета GigaChat целиком")
        raise GigaChatUnavailable(LAST_AI_ERROR)

    try:
        from gigachat import GigaChat

        with GigaChat(
            credentials=credentials,
            scope=os.getenv("GIGACHAT_SCOPE", "GIGACHAT_API_PERS"),
            model=os.getenv("GIGACHAT_MODEL", "GigaChat-2"),
            timeout=float(os.getenv("GIGACHAT_TIMEOUT", "20")),
            verify_ssl_certs=False,
        ) as giga:
            response = giga.chat({
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ]
            })
            text = (response.choices[0].message.content or "").strip()
    except Exception as e:  # сеть, авторизация, лимиты, неверный scope
        LAST_AI_ERROR = f"{type(e).__name__}: {e}"
        # print — чтобы ошибка точно попала в логи Render
        print(f"[GigaChat ERROR] {LAST_AI_ERROR}", flush=True)
        logger.error("GigaChat error: %s", LAST_AI_ERROR)
        raise GigaChatUnavailable(LAST_AI_ERROR) from e

    if not text:
        LAST_AI_ERROR = "GigaChat вернул пустой ответ"
        raise GigaChatUnavailable(LAST_AI_ERROR)

    LAST_AI_ERROR = None
    return text


def _extract_json(raw: str) -> dict:
    """Достаёт JSON-объект из ответа модели (убирает ```json и лишний текст)."""
    cleaned = raw.strip()
    if "```" in cleaned:
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    start_idx, end_idx = cleaned.find("{"), cleaned.rfind("}")
    if start_idx != -1 and end_idx > start_idx:
        cleaned = cleaned[start_idx:end_idx + 1]
    return json.loads(cleaned)


def ai_status(probe: bool = True) -> dict:
    """Состояние интеграции для /api/health/ai. probe=True делает тестовый запрос."""
    status = {
        "configured": ai_configured(),
        "model": os.getenv("GIGACHAT_MODEL", "GigaChat-2"),
        "scope": os.getenv("GIGACHAT_SCOPE", "GIGACHAT_API_PERS"),
        "ok": False,
        "error": LAST_AI_ERROR,
    }
    if probe and status["configured"]:
        try:
            _giga_complete("Отвечай одним словом.", "Скажи: работает")
            status["ok"] = True
            status["error"] = None
        except GigaChatUnavailable as e:
            status["error"] = str(e)
    elif not status["configured"]:
        status["error"] = "Переменная GIGACHAT_CREDENTIALS не задана"
    return status


# ---------------------------------------------------------------------
# Числа словами: «три тысячи двести» → 3200 (для запасного парсера расходов)
# ---------------------------------------------------------------------
_NUM_WORDS = {
    "ноль": 0, "один": 1, "одна": 1, "одну": 1, "два": 2, "две": 2, "три": 3, "четыре": 4,
    "пять": 5, "шесть": 6, "семь": 7, "восемь": 8, "девять": 9, "десять": 10,
    "одиннадцать": 11, "двенадцать": 12, "тринадцать": 13, "четырнадцать": 14,
    "пятнадцать": 15, "шестнадцать": 16, "семнадцать": 17, "восемнадцать": 18,
    "девятнадцать": 19, "двадцать": 20, "тридцать": 30, "сорок": 40, "пятьдесят": 50,
    "шестьдесят": 60, "семьдесят": 70, "восемьдесят": 80, "девяносто": 90,
    "сто": 100, "двести": 200, "триста": 300, "четыреста": 400, "пятьсот": 500,
    "шестьсот": 600, "семьсот": 700, "восемьсот": 800, "девятьсот": 900,
    "полторы": 1.5, "полтора": 1.5,
}
_THOUSAND_WORDS = {"тысяча", "тысячи", "тысяч", "тыщ", "тыщи", "тыща", "косарь", "косаря", "косарей"}


def words_to_number(text: str) -> float:
    """Находит в тексте сумму, записанную словами. Возвращает 0, если не нашла."""
    tokens = re.findall(r"[а-яё]+|\d+(?:[.,]\d+)?", text.lower())
    total, current, found = 0.0, 0.0, False
    for tok in tokens:
        if tok in _NUM_WORDS:
            current += _NUM_WORDS[tok]
            found = True
        elif re.fullmatch(r"\d+(?:[.,]\d+)?", tok) and found:
            current += float(tok.replace(",", "."))
        elif tok in _THOUSAND_WORDS:
            total += (current or 1) * 1000
            current = 0
            found = True
    return total + current if found else 0.0


def _plural(n: int, one: str, few: str, many: str) -> str:
    n = abs(int(n))
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many

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
    Парсинг сообщения клиента через GigaChat.
    При любой проблеме срабатывает запасной regex-парсер.
    Цена из ответа модели НЕ используется — её берёт сервер из прайса мастера.
    """
    user_prompt = (
        f"Сообщение клиента: {text}\n"
        f"Имя из формы: {client_name or 'не указано'}\n"
        f"Телефон из формы: {client_phone or 'не указан'}"
    )
    try:
        data = _extract_json(_giga_complete(SYSTEM_PROMPT, user_prompt))
    except (GigaChatUnavailable, ValueError) as e:
        logger.warning(f"Парсинг заявки через GigaChat не удался, используем шаблон: {e}")
        result = _fallback_parse(text, client_name, client_phone)
        result["source"] = SOURCE_TEMPLATE
        return result

    parsed_name = str(data.get("client_name") or "").strip()
    if not parsed_name or parsed_name.lower() in {"клиент", "не указано", "имя клиента"}:
        parsed_name = client_name.strip() if client_name else "Клиент"

    parsed_phone = str(data.get("client_phone") or "").strip()
    if not parsed_phone or parsed_phone.lower() in {"не указано", "номер не указан"}:
        parsed_phone = client_phone.strip() if client_phone else ""

    parsed_service = str(data.get("service_name") or "").strip() or "Маникюр + покрытие"
    parsed_datetime = str(data.get("datetime_str") or "").strip() or "Завтра, 16:00"
    reply = str(data.get("reply_to_client") or "").strip() or (
        f"Зафиксировала заявку на {parsed_service} на {parsed_datetime}. "
        f"Передала мастеру на сверку с бумажным блокнотом!"
    )

    return {
        "client_name": parsed_name,
        "client_phone": parsed_phone,
        "service_name": parsed_service,
        "datetime_str": parsed_datetime,
        "price": None,
        "reply_to_client": reply,
        "source": SOURCE_AI,
    }


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




EXPENSE_CATEGORIES = [
    "Материалы (базы, топы, гель-лаки)",
    "Аренда кабинета / места",
    "Стерилизация и крафт-пакеты",
    "Фрезы и инструмент",
    "Кофе, чай и угощения",
    "Реклама и продвижение",
    "Обучение и курсы",
    "Прочее",
]


def _guess_expense_category(text_lower: str) -> str:
    if any(w in text_lower for w in ["аренд", "кабинет", "помещен", "место"]):
        return "Аренда кабинета / места"
    if any(w in text_lower for w in ["баз", "топ", "гель", "лак", "цвет", "luxio", "e.mi", "материал", "страз"]):
        return "Материалы (базы, топы, гель-лаки)"
    if any(w in text_lower for w in ["стерил", "пакет", "перчатк", "маск", "дез", "оптимакс", "сухожар", "салфетк"]):
        return "Стерилизация и крафт-пакеты"
    if any(w in text_lower for w in ["фрез", "аппарат", "кусачк", "ножниц", "инструмент", "пилк", "бафик"]):
        return "Фрезы и инструмент"
    if any(w in text_lower for w in ["кофе", "чай", "капсул", "конфет", "печень", "угощен", "молоко", "nespresso"]):
        return "Кофе, чай и угощения"
    if any(w in text_lower for w in ["реклам", "таргет", "инст", "промо", "визитк", "блогер"]):
        return "Реклама и продвижение"
    if any(w in text_lower for w in ["курс", "обучен", "вебинар", "мк", "повышен"]):
        return "Обучение и курсы"
    return "Прочее"


def _fallback_parse_expense(text: str) -> dict:
    """Запасное распознавание расхода без нейросети.
    Если сумму найти не удалось, возвращает amount = 0 (НЕ подставляет 1000)."""
    text_lower = text.lower()
    amount = 0.0

    # 1) «2.5к», «15 тыс», «3 тысячи»
    k_match = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:к|k|тыс[а-я]*|тыщ[а-я]*)(?![а-яё])', text_lower)
    if k_match:
        try:
            amount = float(k_match.group(1).replace(",", ".")) * 1000
        except ValueError:
            amount = 0.0

    # 2) Цифрами: «3200», «3 200», «1 500 руб»
    if amount <= 0:
        candidates = []
        for m in re.findall(r'\d[\d ]*\d|\d+', text):
            try:
                num = float(m.replace(" ", ""))
            except ValueError:
                continue
            if num > 10:  # отсекаем даты и количество штук
                candidates.append(num)
        if candidates:
            amount = max(candidates)

    # 3) Словами: «три тысячи двести»
    if amount <= 0:
        amount = words_to_number(text_lower)

    return {"amount": float(amount), "category": _guess_expense_category(text_lower)}


def parse_expense_phrase(text: str) -> dict:
    """Распознавание расхода: сначала GigaChat, при сбое — запасной парсер.
    Возвращает {"amount", "category", "source"}; amount = 0 значит «сумму не нашли»."""
    try:
        data = _extract_json(_giga_complete(EXPENSE_SYSTEM_PROMPT, f"Фраза мастера о расходе: {text}"))
        amt = float(data.get("amount") or 0)
        cat = str(data.get("category") or "Прочее")
        if cat not in EXPENSE_CATEGORIES:
            cat = _guess_expense_category(text.lower())
        if amt > 0:
            return {"amount": amt, "category": cat, "source": SOURCE_AI}
    except (GigaChatUnavailable, ValueError, TypeError) as e:
        logger.warning(f"Расход через GigaChat не распознан, используем шаблон: {e}")

    result = _fallback_parse_expense(text)
    result["source"] = SOURCE_TEMPLATE
    return result


def generate_client_reminder(client_name: str, days_ago: int, cycle_days: int, service_name: str = "маникюр",
                             master_name: str = "Анна Nails", booking_url: str = "/c/anna") -> dict:
    """Генерация тёплого напоминания клиенту. Возвращает {"message", "source"}."""
    prompt = (
        f"Напиши короткое, дружелюбное и вежливое сообщение для клиентки по имени {client_name}. "
        f"Мастер: {master_name}. Прошло {days_ago} дней с прошлого визита на {service_name} "
        f"(привычный цикл: {cycle_days} дней). Пригласи обновить покрытие, подчеркни заботу о здоровье ногтей "
        f"и упомяни, что есть удобные окошки на этой неделе. Добавь ссылку {booking_url} для быстрой онлайн-записи. "
        f"Максимум 3-4 предложения, тёплый тон с эмодзи."
    )
    try:
        text = _giga_complete(
            "Ты — заботливый помощник топ-мастера бьюти-сферы. Пиши естественные, вовлекающие тексты напоминаний без канцеляризмов.",
            prompt,
        )
        return {"message": text, "source": SOURCE_AI}
    except GigaChatUnavailable:
        pass

    days_word = _plural(days_ago, "день", "дня", "дней")
    return {
        "message": (
            f"{client_name}, добрый день! 💖 Это {master_name}.\n"
            f"С нашего последнего визита на {service_name.lower()} прошло {days_ago} {days_word} — "
            f"самое время обновить покрытие ✨\n"
            f"На этой неделе есть удобные окошки, выбрать время онлайн: {booking_url}"
        ),
        "source": SOURCE_TEMPLATE,
    }


# =====================================================================
# ГИГАЧАТ: БИЗНЕС-АУДИТ, КОНФЛИКТЫ, ПАМЯТКА УХОДА
# =====================================================================

def _rub(x: float) -> str:
    return f"{x:,.0f}".replace(",", " ")


def _fallback_business_audit(stats_data: dict) -> dict:
    income = stats_data.get("income", 0)
    profit = stats_data.get("profit", 0)
    bookings_count = int(stats_data.get("bookings_count", 0))
    cancelled_count = int(stats_data.get("cancelled_count", 0))

    if income <= 0 or bookings_count < 3:
        audit_text = (
            "📊 Аудит за месяц:\n"
            f"Пока мало данных для выводов: {bookings_count} {_plural(bookings_count, 'запись', 'записи', 'записей')}, "
            f"выручка {_rub(income)} ₽.\n"
            "Отмечайте визиты и вносите расходы — после 5–10 визитов аудит покажет, где теряются деньги."
        )
        return {"audit_text": audit_text, "source": SOURCE_TEMPLATE}

    cancel_rate = cancelled_count / bookings_count * 100
    margin = profit / income * 100
    audit_text = (
        "📊 Аудит за месяц:\n"
        f"1. Сильная сторона: {bookings_count} {_plural(bookings_count, 'запись', 'записи', 'записей')}, "
        f"выручка {_rub(income)} ₽.\n"
        f"2. Узкое место: отмены {cancel_rate:.0f}% ({cancelled_count} шт.) — это потерянный доход.\n"
        "3. Совет: поднимите цену самой популярной услуги на 10–15% или добавьте допродажу ухода.\n"
        f"Маржинальность {margin:.0f}%, чистая прибыль {_rub(profit)} ₽."
    )
    return {"audit_text": audit_text, "source": SOURCE_TEMPLATE}


def generate_business_audit(stats_data: dict) -> dict:
    """Бизнес-аудит через GigaChat с запасным шаблоном. Возвращает {"audit_text", "source"}."""
    prompt = (
        "Проанализируй показатели частного бьюти-мастера за месяц:\n"
        f"Выручка: {stats_data.get('income', 0)} ₽, "
        f"Расходы: {stats_data.get('expense', 0)} ₽, "
        f"Чистая прибыль: {stats_data.get('profit', 0)} ₽, "
        f"Всего записей: {stats_data.get('bookings_count', 0)}, "
        f"Отмен: {stats_data.get('cancelled_count', 0)}, "
        f"Клиентов в базе: {stats_data.get('clients_count', 0)}.\n"
        "Сформулируй краткий аудит:\n"
        "1. Главная сильная сторона месяца (1 предложение).\n"
        "2. Узкое место или потеря денег (1 предложение).\n"
        "3. Конкретный совет, как заработать на 15–20% больше в следующем месяце.\n"
        "Если данных слишком мало для выводов — так и скажи и посоветуй, что начать отмечать.\n"
        "Пиши кратко, по-русски, без воды и без выдуманных цифр."
    )
    try:
        text = _giga_complete("Ты — финансовый аналитик бьюти-бизнеса.", prompt)
        return {"audit_text": text, "source": SOURCE_AI}
    except GigaChatUnavailable:
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
            f"не подлежит возврату предоплаты, так как время уже зарезервировано специально для вас. "
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
    """Тактичный ответ клиенту в конфликтной ситуации. Возвращает {"reply_text", "source"}."""
    prompt = (
        "Напиши тактичный, доброжелательный, но твёрдый ответ "
        f"клиенту {client_name} на ситуацию: {scenario_type} ({details}). "
        "Цель: сохранить лояльность, но отстоять границы мастера, время и правила записи. Не более 3-4 предложений."
    )
    try:
        text = _giga_complete("Ты — эксперт по клиентскому сервису в бьюти-сфере.", prompt)
        return {"reply_text": text, "source": SOURCE_AI}
    except GigaChatUnavailable:
        result = _fallback_conflict_reply(scenario_type, client_name, details)
        result["source"] = SOURCE_TEMPLATE
        return result


def _fallback_post_care_card(service_name: str, client_name: str) -> dict:
    care_card_text = (
        f"{client_name}, спасибо за визит на {service_name}! 💖\n"
        f"Правила ухода в первые 48 часов:\n"
        f"1. ✨ Не мочите ногти первые 6 часов после покрытия.\n"
        f"2. 🧴 Используйте масло для кутикулы каждый день.\n"
        f"3. 🧤 Носите перчатки при уборке и мытье посуды.\n"
        f"Жду вас на коррекцию через 3-4 недели! ✨"
    )
    return {"care_card_text": care_card_text, "source": SOURCE_TEMPLATE}


def generate_post_care_card(service_name: str, client_name: str) -> dict:
    """Памятка по уходу после процедуры. Возвращает {"care_card_text", "source"}."""
    prompt = (
        f"Напиши короткую тёплую памятку клиенту {client_name} после процедуры {service_name}. "
        "Включи: благодарность за визит и ровно 3 главных правила домашнего ухода в первые 48 часов "
        "списком с эмодзи. До 400 символов."
    )
    try:
        text = _giga_complete("Ты — заботливый бьюти-мастер, пишешь клиентам.", prompt)
        return {"care_card_text": text, "source": SOURCE_AI}
    except GigaChatUnavailable:
        return _fallback_post_care_card(service_name, client_name)
