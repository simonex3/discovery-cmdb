import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Relationship(Base):
    __tablename__ = "relationships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("configuration_items.id", ondelete="CASCADE"), nullable=False, index=True)
    target_id = Column(UUID(as_uuid=True), ForeignKey("configuration_items.id", ondelete="CASCADE"), nullable=False, index=True)
    relationship_type = Column(String(64), nullable=False)
    # depends_on | connects_to | hosted_on | runs_on | part_of | backs_up_to | replicates_to | monitors
    description = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    source = relationship("ConfigurationItem", foreign_keys=[source_id], back_populates="relationships_as_source")
    target = relationship("ConfigurationItem", foreign_keys=[target_id], back_populates="relationships_as_target")
