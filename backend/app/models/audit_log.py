"""Audit logging model."""

from sqlalchemy import Column, String, ForeignKey, Index, JSON

from app.models.base import BaseModel


class AuditLog(BaseModel):
    """Immutable audit log for tracking system actions."""

    __tablename__ = "audit_logs"

    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)  # e.g., "payment.voided", "event.created"
    entity_type = Column(String(50), nullable=False)  # e.g., "event", "payment"
    entity_id = Column(String(36), nullable=False)
    old_values = Column(JSON, nullable=True)  # Previous values (for updates)
    new_values = Column(JSON, nullable=True)  # New values (for creates/updates)
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(String(512), nullable=True)
    details = Column(JSON, nullable=True)  # Additional context

    __table_args__ = (
        Index('ix_audit_logs_user_id', 'user_id'),
        Index('ix_audit_logs_action', 'action'),
        Index('ix_audit_logs_entity', 'entity_type', 'entity_id'),
        # created_at already gets an index from BaseModel's index=True
    )

    def __repr__(self):
        return f"<AuditLog(id={self.id}, action={self.action}, entity={self.entity_type}:{self.entity_id})>"
