"""Setup wizard endpoint - first-run configuration."""
import json
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, AppSettings
from app.schemas.user import SetupRequest, SetupStatusResponse, AppSettingUpdate
from app.services.auth import hash_password, generate_api_key, require_admin

router = APIRouter(prefix="/setup", tags=["Setup Wizard"])


def get_setting(db: Session, key: str, default: str = None) -> Optional[str]:
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    return setting.value if setting else default


def set_setting(db: Session, key: str, value: str):
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    if setting:
        setting.value = value
    else:
        db.add(AppSettings(key=key, value=value))
    db.commit()


def is_setup_completed(db: Session) -> bool:
    return get_setting(db, "setup_completed") == "true"


@router.get(
    "/status",
    response_model=SetupStatusResponse,
    summary="Check setup status",
    description="Returns whether the initial setup wizard has been completed.",
)
def setup_status(db: Session = Depends(get_db)):
    completed = is_setup_completed(db)
    admin_exists = db.query(User).filter(User.role == "admin").first() is not None
    return SetupStatusResponse(completed=completed, admin_exists=admin_exists)


@router.post(
    "/complete",
    summary="Complete setup wizard",
    description="Runs the initial setup: creates admin user and saves all configuration. Can only be called once.",
    status_code=status.HTTP_201_CREATED,
)
def complete_setup(request: SetupRequest, db: Session = Depends(get_db)):
    if is_setup_completed(db):
        raise HTTPException(status_code=400, detail="Setup has already been completed")

    # Validate unique username/email
    if db.query(User).filter(User.username == request.admin_username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    # Create admin user
    admin = User(
        username=request.admin_username,
        email=request.admin_email,
        full_name=request.admin_full_name,
        hashed_password=hash_password(request.admin_password),
        role="admin",
        is_active=True,
        api_key=generate_api_key(),
    )
    db.add(admin)

    # Save all settings
    settings_map = {
        "app_name": request.app_name,
        "network_range": request.network_range,
        "auto_discovery_enabled": str(request.auto_discovery_enabled).lower(),
        "discovery_interval_minutes": str(request.discovery_interval_minutes),
        "health_check_interval_minutes": str(request.health_check_interval_minutes),
        "seed_sample_data": str(request.seed_sample_data).lower(),
        "setup_completed": "true",
    }
    if request.servicenow_instance_url:
        settings_map["sn_instance_url"] = request.servicenow_instance_url
        settings_map["sn_username"] = request.servicenow_username or ""
        settings_map["sn_password"] = request.servicenow_password or ""
    if request.fritz_host:
        settings_map["fritz_host"] = request.fritz_host
        settings_map["fritz_username"] = request.fritz_username or ""
        if request.fritz_password:
            settings_map["fritz_password"] = request.fritz_password
        settings_map["fritz_sync_enabled"] = str(request.fritz_sync_enabled).lower()

    for key, value in settings_map.items():
        set_setting(db, key, value)

    db.commit()
    db.refresh(admin)

    # Trigger sample data seeding if requested
    if request.seed_sample_data:
        try:
            from app.seed_data import seed_sample_data
            seed_sample_data(db)
        except Exception:
            pass  # Non-fatal

    from app.services.auth import create_access_token
    token = create_access_token(str(admin.id))

    return {
        "message": "Setup completed successfully",
        "access_token": token,
        "token_type": "bearer",
        "api_key": admin.api_key,
    }


# ---- App Settings CRUD (Admin) ----

router_settings = APIRouter(prefix="/settings", tags=["Application Settings"])

SETTING_DEFINITIONS = {
    "app_name": {"label": "Application Name", "type": "string", "description": "Display name of the CMDB"},
    "network_range": {"label": "Default Network Range", "type": "string", "description": "CIDR range for auto-discovery (e.g. 192.168.178.0/24)"},
    "auto_discovery_enabled": {"label": "Auto Discovery", "type": "boolean", "description": "Enable scheduled network discovery"},
    "discovery_interval_minutes": {"label": "Discovery Interval (min)", "type": "integer", "description": "How often to run network discovery"},
    "health_check_interval_minutes": {"label": "Health Check Interval (min)", "type": "integer", "description": "How often to ping/check CIs"},
    "sn_instance_url": {"label": "ServiceNow Instance URL", "type": "string", "description": "e.g. https://dev12345.service-now.com"},
    "sn_username": {"label": "ServiceNow Username", "type": "string", "description": "ServiceNow API user"},
    "sn_password": {"label": "ServiceNow Password", "type": "secret", "description": "ServiceNow API password"},
    "notification_webhook_url": {"label": "Notification Webhook URL", "type": "string", "description": "POST webhook for alerts (e.g. Slack)"},
    "notification_enabled": {"label": "Notifications Enabled", "type": "boolean", "description": "Send webhook on health status changes"},
    "relationship_hints": {"label": "Relationship Hints (JSON)", "type": "string", "description": "JSON array of relationship hints for discovery (source/target by ip/hostname/id)"},
    "fritz_host": {"label": "FRITZ!Box Host", "type": "string", "description": "FRITZ!Box IP or hostname (e.g. 192.168.178.1 or fritz.box)"},
    "fritz_username": {"label": "FRITZ!Box Username", "type": "string", "description": "FRITZ!Box user for TR-064/mesh"},
    "fritz_password": {"label": "FRITZ!Box Password", "type": "secret", "description": "FRITZ!Box password"},
    "fritz_sync_enabled": {"label": "FRITZ!Box Sync Enabled", "type": "boolean", "description": "Enable mesh relationship sync"},
    "fritz_last_sync": {"label": "FRITZ!Box Last Sync", "type": "string", "description": "Timestamp of last mesh sync"},
    "fritz_last_sync_result": {"label": "FRITZ!Box Last Sync Result", "type": "string", "description": "Summary of last mesh sync"},
}


@router_settings.get(
    "",
    summary="Get all app settings",
    description="Returns all application settings with their current values and metadata.",
)
def get_all_settings(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    result = []
    for key, meta in SETTING_DEFINITIONS.items():
        value = get_setting(db, key)
        entry = {**meta, "key": key, "value": value}
        if meta["type"] == "secret" and value:
            entry["value"] = "***"
        result.append(entry)
    return result


@router_settings.put(
    "/{key}",
    summary="Update a setting",
)
def update_setting(key: str, body: AppSettingUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if key not in SETTING_DEFINITIONS:
        raise HTTPException(status_code=404, detail=f"Unknown setting key: {key}")
    set_setting(db, key, body.value)
    return {"key": key, "value": body.value if SETTING_DEFINITIONS[key]["type"] != "secret" else "***"}


@router_settings.get(
    "/{key}",
    summary="Get a single setting",
)
def get_single_setting(key: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if key not in SETTING_DEFINITIONS:
        raise HTTPException(status_code=404, detail=f"Unknown setting key: {key}")
    value = get_setting(db, key)
    meta = SETTING_DEFINITIONS[key]
    if meta["type"] == "secret" and value:
        value = "***"
    return {"key": key, **meta, "value": value}
