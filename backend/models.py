from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey
)
from sqlalchemy.orm import relationship
from database import Base


class Master(Base):
    """Модель мастера (пользователя сервиса МастерБосс)"""
    __tablename__ = "masters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    slug = Column(String(60), unique=True, index=True, nullable=False)  # например, 'anna'
    niche = Column(String(100), nullable=False)                         # например, 'Маникюр'
    trial_active = Column(Boolean, default=True, nullable=False)
    default_deposit = Column(Integer, default=500, nullable=False)
    pin_code = Column(String(20), default="1234", nullable=False)

    # Связи
    services = relationship("Service", back_populates="master", cascade="all, delete-orphan")
    clients = relationship("Client", back_populates="master", cascade="all, delete-orphan")
    bookings = relationship("Booking", back_populates="master", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="master", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Master(id={self.id}, name='{self.name}', slug='{self.slug}')>"


class Service(Base):
    """Модель услуги/процедуры мастера"""
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    price = Column(Float, nullable=False)
    duration_min = Column(Integer, default=60, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Связи
    master = relationship("Master", back_populates="services")

    def __repr__(self):
        return f"<Service(id={self.id}, name='{self.name}', price={self.price}, duration_min={self.duration_min})>"


class Client(Base):
    """Модель клиента частного мастера"""
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False, index=True)
    phone = Column(String(30), nullable=False, index=True)
    cycle_days = Column(Integer, default=21, nullable=False)            # Периодичность посещений в днях
    last_visit_date = Column(DateTime, nullable=True)                   # Дата последнего визита

    # Связи
    master = relationship("Master", back_populates="clients")
    bookings = relationship("Booking", back_populates="client", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Client(id={self.id}, name='{self.name}', phone='{self.phone}')>"


class Booking(Base):
    """Модель записи клиента на процедуру/услугу"""
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    service_name = Column(String(150), nullable=False)                  # Название услуги/процедуры
    price = Column(Float, nullable=False, default=0.0)                  # Стоимость услуги
    datetime_str = Column(String(50), nullable=False)                   # Дата и время записи строкой (например '2026-10-26 14:00')
    scheduled_at = Column(DateTime, nullable=True)                      # точная дата и время визита для расчета таймингов
    status = Column(String(30), nullable=False, default="pending")      # 'pending', 'confirmed', 'cancelled'
    master_notified_cancellation = Column(Boolean, default=True)        # флаг прочтения мастером алерта об отмене
    reminder_sent = Column(Boolean, default=False, nullable=False)      # флаг: отправлено ли напоминание за час

    # Связи
    master = relationship("Master", back_populates="bookings")
    client = relationship("Client", back_populates="bookings")

    @property
    def client_name(self) -> str:
        return self.client.name if self.client else "Клиент"

    @property
    def client_phone(self) -> str:
        return self.client.phone if self.client else ""

    def __repr__(self):
        return f"<Booking(id={self.id}, service='{self.service_name}', price={self.price}, status='{self.status}')>"


class PushSubscription(Base):
    """Подписка на push-уведомления браузера (мастер или клиент)"""
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(60), nullable=False, index=True)  # 'anna' или 'client_anna'
    endpoint = Column(String(500), nullable=False)
    p256dh = Column(String(500), nullable=True)
    auth = Column(String(200), nullable=True)
    user_agent = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Transaction(Base):
    """Модель финансовой транзакции (доходы и расходы)"""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(20), nullable=False)                           # 'income' или 'expense'
    amount = Column(Float, nullable=False)                              # Сумма в рублях
    category = Column(String(100), nullable=False)                      # Категория (например 'Процедура', 'Материалы', 'Аренда')
    date = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Связи
    master = relationship("Master", back_populates="transactions")

    def __repr__(self):
        return f"<Transaction(id={self.id}, type='{self.type}', amount={self.amount}, category='{self.category}')>"


class WaitlistSubscription(Base):
    """Подписка на уведомление об освобождении слота (клиент хочет слот, который сейчас занят)"""
    __tablename__ = "waitlist_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id", ondelete="CASCADE"), nullable=False, index=True)
    client_name = Column(String(120), nullable=False)
    client_phone = Column(String(30), nullable=False)
    client_slug = Column(String(60), nullable=False, index=True)        # 'client_anna'
    desired_slot = Column(String(50), nullable=False)                   # '01.11, 17:30'
    endpoint = Column(String(500), nullable=True)                       # для push
    p256dh = Column(String(500), nullable=True)
    auth = Column(String(200), nullable=True)
    is_notified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Связи
    master = relationship("Master")

    def __repr__(self):
        return f"<WaitlistSubscription(id={self.id}, slot='{self.desired_slot}', client='{self.client_name}')>"



