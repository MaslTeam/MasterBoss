from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class ServiceResponse(BaseModel):
    """Схема ответа услуги мастера"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    master_id: int
    name: str
    price: float
    duration_min: int
    is_active: bool


class ServiceCreate(BaseModel):
    """Схема создания новой услуги"""
    name: str = Field(..., min_length=1, max_length=150, description="Название услуги")
    price: float = Field(..., gt=0, description="Стоимость в рублях")
    duration_min: int = Field(default=60, gt=0, description="Длительность в минутах")


class ServiceUpdate(BaseModel):
    """Схема обновления услуги"""
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    price: Optional[float] = Field(default=None, gt=0)
    duration_min: Optional[int] = Field(default=None, gt=0)
    is_active: Optional[bool] = None


class MasterProfileUpdate(BaseModel):
    """Схема обновления профиля мастера (имя, ниша, pin-код)"""
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    niche: Optional[str] = Field(default=None, min_length=1, max_length=100)
    pin_code: Optional[str] = Field(default=None, min_length=4, max_length=20)


class ChangePinRequest(BaseModel):
    """Схема смены PIN-кода мастера"""
    old_pin: Optional[str] = Field(default=None, description="Текущий PIN-код")
    new_pin: str = Field(..., min_length=4, max_length=20, description="Новый PIN-код")


class LoginRequest(BaseModel):
    """Схема запроса входа мастера по PIN-коду"""
    slug: str = Field(..., description="Slug мастера (например, 'anna')")
    pin: str = Field(..., description="PIN-код доступа")


class LoginResponse(BaseModel):
    """Схема ответа успешного входа"""
    success: bool
    token: str


class MasterResponse(BaseModel):
    """Схема ответа с данными мастера"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    niche: str
    default_deposit: int
    trial_active: bool
    pin_code: Optional[str] = None
    services: list[ServiceResponse] = []


class BookingResponse(BaseModel):
    """Схема ответа с данными записи на услугу"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_name: str
    client_phone: str
    service_name: str
    price: float
    datetime_str: str
    status: str


class BookingStatusResponse(BaseModel):
    """Схема ответа статуса бронирования для polling-уведомлений"""
    id: int
    status: str
    service_name: str
    datetime_str: str
    can_cancel: bool


class TransactionCreate(BaseModel):
    """Схема создания финансовой транзакции"""
    type: Literal["income", "expense"] = Field(..., description="Тип операции: income (доход) или expense (расход)")
    amount: float = Field(..., gt=0, description="Сумма в рублях")
    category: str = Field(..., min_length=1, max_length=100, description="Категория операции")


class TransactionResponse(BaseModel):
    """Схема ответа с данными финансовой транзакции"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    amount: float
    category: str
    date: datetime



class NewCancellationResponse(BaseModel):
    booking_id: int
    client_name: str
    client_phone: str
    service_name: str
    datetime_str: str


class StatsResponse(BaseModel):
    """Схема ответа сводной статистики для личного кабинета мастера"""
    total_income: float
    total_expense: float
    net_profit: float
    tax_amount: float
    bookings: list[BookingResponse]
    transactions: list[TransactionResponse]
    new_cancellations: list[NewCancellationResponse] = []


class ClientResponse(BaseModel):
    """Схема ответа с данными клиента и историей визитов"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str
    cycle_days: int
    last_visit_date: Optional[datetime] = None
    days_since_last_visit: Optional[int] = None
    is_due_return: bool = False


class AIExpenseRequest(BaseModel):
    """Схема запроса разбора расхода из голосовой/текстовой фразы через GigaChat"""
    phrase: str = Field(..., min_length=2, description="Фраза мастера, например 'купила базы и топ на 3200'")


class AIExpenseResponse(BaseModel):
    """Схема ответа распознанного расхода"""
    amount: float
    category: str
    raw_phrase: str


class AIReminderRequest(BaseModel):
    """Схема запроса на генерацию персонального напоминания клиенту"""
    client_id: int
    client_name: str
    days_ago: int
    cycle_days: int
    service_name: Optional[str] = "Маникюр"


class AIReminderResponse(BaseModel):
    """Схема ответа с текстом напоминания для отправки клиенту в мессенджер"""
    message: str
    client_name: str
    phone: Optional[str] = None


class ChatMessageRequest(BaseModel):
    """Схема запроса от клиента в веб-чате"""
    slug: str = Field(..., description="Slug мастера (например, 'anna')")
    message: Optional[str] = Field(default="Запись через пошаговый выбор", description="Текст сообщения от клиента")
    client_name: Optional[str] = Field(default=None, description="Имя клиента")
    client_phone: Optional[str] = Field(default=None, description="Телефон клиента")
    service_name: Optional[str] = Field(default=None, description="Название выбранной услуги")
    datetime_str: Optional[str] = Field(default=None, description="Выбранная дата и время")
    price: Optional[float] = Field(default=None, description="Стоимость услуги")


class ChatMessageResponse(BaseModel):
    """Схема ответа бота на сообщение клиента в чате"""
    reply_text: str
    booking_created: bool
    booking_id: Optional[int] = None
    details: Optional[dict] = None


class PushSubscriptionCreate(BaseModel):
    """Создание подписки на push-уведомления"""
    slug: str = Field(..., description="Slug мастера или клиента (например 'anna' или 'client_anna')")
    endpoint: str = Field(..., description="URL сервиса push-уведомлений браузера")
    p256dh: Optional[str] = Field(default=None, description="Ключ шифрования p256dh")
    auth: Optional[str] = Field(default=None, description="Ключ шифрования auth")
    user_agent: Optional[str] = Field(default=None, description="User-Agent браузера")


class PushSubscriptionResponse(BaseModel):
    """Ответ при сохранении подписки"""
    success: bool
    message: str


class NotificationSend(BaseModel):
    """Отправка уведомления конкретному получателю"""
    slug: str = Field(..., description="Кому отправить")
    title: str = Field(..., description="Заголовок уведомления")
    body: str = Field(..., description="Текст уведомления")
    icon: Optional[str] = Field(default="/favicon.ico", description="Иконка уведомления")


class UpcomingBookingNotification(BaseModel):
    """Информация о предстоящей записи для напоминания"""
    booking_id: int
    client_name: str
    client_phone: str
    service_name: str
    datetime_str: str
    minutes_until: int


class ClientDueReturn(BaseModel):
    """Клиент, которому пора возвращаться"""
    client_id: int
    name: str
    phone: str
    days_since_last_visit: int
    cycle_days: int


class WaitlistSubscriptionCreate(BaseModel):
    """Подписка на уведомление об освобождении слота"""
    master_slug: str = Field(..., description="Slug мастера (например 'anna')")
    client_name: str = Field(..., description="Имя клиента")
    client_phone: str = Field(..., description="Телефон клиента")
    desired_slot: str = Field(..., description="Желаемый слот, например '01.11, 17:30'")
    endpoint: Optional[str] = Field(default=None, description="Push endpoint браузера")
    p256dh: Optional[str] = Field(default=None, description="Ключ p256dh")
    auth: Optional[str] = Field(default=None, description="Ключ auth")


class WaitlistSubscriptionResponse(BaseModel):
    """Ответ при оформлении подписки на ожидание слота"""
    success: bool
    message: str
    slot: str


class BusinessAuditResponse(BaseModel):
    """Ответ с текстом бизнес-аудита от GigaChat"""
    audit_text: str


class ConflictResolverRequest(BaseModel):
    """Запрос на генерацию ответа клиенту в конфликтной ситуации"""
    slug: str = Field(..., description="Slug мастера")
    client_name: str = Field(..., description="Имя клиента")
    scenario_type: str = Field(..., description="Тип ситуации: late, discount, late_cancel, custom")
    details: Optional[str] = Field(default="", description="Дополнительные детали ситуации")


class ConflictResolverResponse(BaseModel):
    """Ответ с текстом ответа клиенту"""
    reply_text: str


class CareCardResponse(BaseModel):
    """Ответ с текстом памятки по уходу"""
    success: bool
    card_text: str



