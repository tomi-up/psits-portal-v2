"""Database configuration and connection."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Create database engine
engine = create_engine(
    settings.database_url,
    poolclass=QueuePool,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    pool_pre_ping=settings.database_pool_pre_ping,
    echo=settings.debug,  # Log SQL queries in debug mode
)

# Create session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def get_db() -> Session:
    """
    Dependency: Get database session.

    Usage in routes:
        @router.get("/")
        async def get_data(db: Session = Depends(get_db)):
            pass
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialize database (create all tables).

    Run this once on startup or manually.
    """
    from app.models.base import Base

    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created successfully")


def drop_db():
    """
    Drop all tables (development only).

    WARNING: This deletes all data!
    """
    from app.models.base import Base

    logger.warning("Dropping all database tables!")
    Base.metadata.drop_all(bind=engine)
    logger.warning("Database tables dropped")
