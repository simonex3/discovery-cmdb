from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid


class CIBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Display name of the CI")
    ci_type: str = Field(default="other", description="Type: server|router|switch|access_point|firewall|nas|vm|container|service|database|desktop|laptop|mobile|iot|printer|other")
    category: Optional[str] = Field(None, description="Category: hardware|software|network|service")
    status: str = Field(default="active", description="Status: active|inactive|maintenance|retired")
    ip_address: Optional[str] = Field(None, description="IPv4 or IPv6 address")
    mac_address: Optional[str] = Field(None, description="MAC address (AA:BB:CC:DD:EE:FF)")
    hostname: Optional[str] = None
    fqdn: Optional[str] = None
    open_ports: Optional[List[Dict[str, Any]]] = Field(None, description='List of open ports: [{"port": 22, "protocol": "tcp", "service": "ssh"}]')
    manufacturer: Optional[str] = None
    model_name: Optional[str] = None
    serial_number: Optional[str] = None
    os: Optional[str] = None
    os_version: Optional[str] = None
    environment: str = Field(default="production", description="Environment: production|development|test|home_automation|media|security")
    location: Optional[str] = None
    owner: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    properties: Dict[str, Any] = Field(default_factory=dict, description="Flexible key-value properties")


class CICreate(CIBase):
    pass


class CIUpdate(BaseModel):
    name: Optional[str] = None
    ci_type: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    hostname: Optional[str] = None
    fqdn: Optional[str] = None
    open_ports: Optional[List[Dict[str, Any]]] = None
    manufacturer: Optional[str] = None
    model_name: Optional[str] = None
    serial_number: Optional[str] = None
    os: Optional[str] = None
    os_version: Optional[str] = None
    environment: Optional[str] = None
    location: Optional[str] = None
    owner: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    properties: Optional[Dict[str, Any]] = None
    health_status: Optional[str] = None


class CIResponse(CIBase):
    id: uuid.UUID
    health_status: str
    last_seen: Optional[datetime]
    last_discovered: Optional[datetime]
    servicenow_sys_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    relationships_count: int = 0

    model_config = {"from_attributes": True}


class CIPaginatedResponse(BaseModel):
    items: List[CIResponse]
    total: int
    page: int
    page_size: int
    pages: int


class DependencyNode(BaseModel):
    ci: CIResponse
    relationship_type: str
    direction: str  # upstream | downstream


class DependencyTree(BaseModel):
    ci: CIResponse
    upstream: List[DependencyNode]
    downstream: List[DependencyNode]
