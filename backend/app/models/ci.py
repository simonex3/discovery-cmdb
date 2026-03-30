import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, JSON, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class ConfigurationItem(Base):
    __tablename__ = "configuration_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Core identity
    name = Column(String(255), nullable=False)
    ci_type = Column(String(64), nullable=False, default="other")
    # server | router | switch | access_point | firewall | nas | vm | container
    # service | database | desktop | laptop | mobile | iot | printer | other
    category = Column(String(64), nullable=True)
    # hardware | software | network | service
    status = Column(String(32), nullable=False, default="active")
    # active | inactive | maintenance | retired

    # Network
    ip_address = Column(String(45), nullable=True, index=True)
    mac_address = Column(String(17), nullable=True)
    hostname = Column(String(255), nullable=True, index=True)
    fqdn = Column(String(512), nullable=True)
    open_ports = Column(JSON, nullable=True)  # [{"port": 22, "protocol": "tcp", "service": "ssh"}]

    # Hardware / Software
    manufacturer = Column(String(255), nullable=True)
    model_name = Column(String(255), nullable=True)
    serial_number = Column(String(255), nullable=True)
    os = Column(String(128), nullable=True)
    os_version = Column(String(128), nullable=True)

    # Organization
    environment = Column(String(64), nullable=False, default="production")
    # production | development | test | home_automation | media | security
    location = Column(String(255), nullable=True)
    owner = Column(String(255), nullable=True)
    department = Column(String(255), nullable=True)

    # Description
    description = Column(Text, nullable=True)
    tags = Column(JSON, nullable=False, default=list)
    properties = Column(JSON, nullable=False, default=dict)  # Flexible key-value pairs

    # Health
    health_status = Column(String(32), nullable=False, default="unknown")
    # healthy | degraded | down | unknown
    last_seen = Column(DateTime(timezone=True), nullable=True)
    last_discovered = Column(DateTime(timezone=True), nullable=True)

    # ServiceNow
    servicenow_sys_id = Column(String(32), nullable=True, unique=True, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    relationships_as_source = relationship(
        "Relationship",
        foreign_keys="Relationship.source_id",
        back_populates="source",
        cascade="all, delete-orphan",
    )
    relationships_as_target = relationship(
        "Relationship",
        foreign_keys="Relationship.target_id",
        back_populates="target",
        cascade="all, delete-orphan",
    )
    audit_logs = relationship(
        "AuditLog",
        foreign_keys="AuditLog.ci_id",
        back_populates="ci",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_ci_ip_status", "ip_address", "status"),
        Index("ix_ci_type_env", "ci_type", "environment"),
    )

    @property
    def relationships_count(self) -> int:
        return len(self.relationships_as_source) + len(self.relationships_as_target)
