from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime
import uuid


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    role: str = "viewer"
    avatar_color: str = "#3b82f6"

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed = {"admin", "operator", "viewer"}
        if v not in allowed:
            raise ValueError(f"Role must be one of: {', '.join(allowed)}")
        return v


class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    avatar_color: Optional[str] = None
    password: Optional[str] = None


class UserResponse(UserBase):
    id: uuid.UUID
    is_active: bool
    last_login: Optional[datetime] = None
    created_at: datetime
    api_key: Optional[str] = None

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    """Public user info (no sensitive data)."""
    id: uuid.UUID
    username: str
    full_name: Optional[str]
    role: str
    avatar_color: str
    is_active: bool
    last_login: Optional[datetime]

    model_config = {"from_attributes": True}


# Auth schemas
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# Setup wizard
class SetupRequest(BaseModel):
    # Admin user
    admin_username: str
    admin_email: EmailStr
    admin_password: str
    admin_full_name: Optional[str] = None

    # App settings
    app_name: str = "Discovery CMDB"
    network_range: str = "192.168.178.0/24"
    auto_discovery_enabled: bool = True
    discovery_interval_minutes: int = 60
    health_check_interval_minutes: int = 5

    # ServiceNow (optional)
    servicenow_instance_url: Optional[str] = None
    servicenow_username: Optional[str] = None
    servicenow_password: Optional[str] = None

    # FRITZ!Box (optional)
    fritz_host: Optional[str] = None
    fritz_username: Optional[str] = None
    fritz_password: Optional[str] = None
    fritz_sync_enabled: bool = True

    # Seed data
    seed_sample_data: bool = True


class SetupStatusResponse(BaseModel):
    completed: bool
    admin_exists: bool


class AppSettingUpdate(BaseModel):
    value: str
