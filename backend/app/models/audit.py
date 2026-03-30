import uuid
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ci_id = Column(UUID(as_uuid=True), ForeignKey("configuration_items.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(64), nullable=False)
    # created | updated | deleted | discovered | health_changed | imported | exported | synced
    actor = Column(String(128), nullable=False, default="system")
    changes = Column(JSON, nullable=True)  # {"field": {"old": ..., "new": ...}}
    description = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    ci = relationship("ConfigurationItem", foreign_keys=[ci_id], back_populates="audit_logs")
