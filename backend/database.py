import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Путь к файлу базы данных SQLite masterboss.db
# Поддержка переменной окружения DB_PATH для Docker volume (/app/data/masterboss.db)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.getenv("DB_PATH", os.path.join(BASE_DIR, "masterboss.db"))
DATABASE_URL = f"sqlite:///{DB_FILE}"

# Движок SQLite с поддержкой многопоточности для FastAPI
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

# Фабрика сессий
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Базовый декларативный класс для моделей
Base = declarative_base()


def get_db():
    """Генератор сессии базы данных для FastAPI Dependency Injection"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()