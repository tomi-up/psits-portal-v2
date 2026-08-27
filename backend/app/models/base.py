"""Base model class with common fields."""

from sqlalchemy import Column, DateTime, func, String
from sqlalchemy.orm import declarative_base
from datetime import datetime
import uuid

Base = declarative_base()


class BaseModel(Base):
    """Base model with common fields for all tables."""

    __abstract__ = True

    id = Column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )

    created_at = Column(
        DateTime,
        default=func.now(),
        nullable=False,
        index=True
    )

    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
