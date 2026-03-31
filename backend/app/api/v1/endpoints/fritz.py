"""FRITZ!Box integration endpoints."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth import require_admin, require_operator, require_user
from app.models.user import User
from app.models.ci import ConfigurationItem
from app.models.audit import AuditLog
from app.services.fritzbox import FritzBoxService
from app.api.v1.endpoints.setup import get_setting, set_setting

router = APIRouter(prefix="/fritz", tags=["FRITZ!Box Integration"])


class FritzConfig(BaseModel):
    host: str
    username: str | None = None
    password: str | None = None
    sync_enabled: bool = True


@router.get("/config", summary="Get FRITZ!Box configuration")
def get_fritz_config(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return {
        "host": get_setting(db, "fritz_host", ""),
        "username": get_setting(db, "fritz_username", ""),
        "configured": bool(get_setting(db, "fritz_host")),
        "sync_enabled": get_setting(db, "fritz_sync_enabled", "true") == "true",
    }


@router.post("/config", summary="Save FRITZ!Box configuration")
def save_fritz_config(config: FritzConfig, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    set_setting(db, "fritz_host", config.host)
    set_setting(db, "fritz_username", config.username or "")
    if config.password:
        set_setting(db, "fritz_password", config.password)
    set_setting(db, "fritz_sync_enabled", str(config.sync_enabled).lower())
    return {"message": "FRITZ!Box configuration saved"}


@router.post("/sync", summary="Sync mesh relationships from FRITZ!Box")
def sync_fritz(db: Session = Depends(get_db), user: User = Depends(require_operator)):
    svc = FritzBoxService.from_settings(db)
    result = svc.sync_mesh(db, actor=user.username)
    return result


@router.get("/sync/status", summary="Get last FRITZ!Box sync status")
def get_sync_status(db: Session = Depends(get_db), _: User = Depends(require_user)):
    return {
        "last_sync": get_setting(db, "fritz_last_sync"),
        "last_sync_result": get_setting(db, "fritz_last_sync_result"),
        "configured": bool(get_setting(db, "fritz_host")),
    }


@router.post("/sync/netdev", summary="Sync full mesh topology via data.lua netDev (recommended)")
def sync_fritz_netdev(db: Session = Depends(get_db), user: User = Depends(require_operator)):
    svc = FritzBoxService.from_settings(db)
    return svc.sync_netdev(db, actor=user.username)


@router.post("/sync/hosts", summary="Sync all Fritz!Box connected hosts as CI dependencies")
def sync_fritz_hosts(db: Session = Depends(get_db), user: User = Depends(require_operator)):
    svc = FritzBoxService.from_settings(db)
    result = svc.sync_hosts(db, actor=user.username)
    return result


@router.get("/diagnose", summary="Diagnose FRITZ!Box connectivity")
def diagnose(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    svc = FritzBoxService.from_settings(db)
    return svc.diagnose()


@router.post("/reboot", summary="Reboot the FRITZ!Box router")
def reboot_fritzbox(db: Session = Depends(get_db), user: User = Depends(require_operator)):
    svc = FritzBoxService.from_settings(db)
    if not svc.host:
        raise HTTPException(status_code=400, detail="FRITZ!Box not configured")
    result = svc.reboot_device()
    fritz_ci = db.query(ConfigurationItem).filter(ConfigurationItem.ip_address == svc.host).first()
    db.add(AuditLog(
        ci_id=fritz_ci.id if fritz_ci else None,
        action="reboot",
        actor=user.username,
        description=f"Reboot command sent to FRITZ!Box ({svc.host})",
    ))
    db.commit()
    return result


@router.post("/reboot/{ci_id}", summary="Reboot a FRITZ!Box mesh device by CI ID")
def reboot_fritz_device(
    ci_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_operator),
):
    svc = FritzBoxService.from_settings(db)
    if not svc.host:
        raise HTTPException(status_code=400, detail="FRITZ!Box not configured")
    ci = db.query(ConfigurationItem).filter(ConfigurationItem.id == ci_id).first()
    if not ci:
        raise HTTPException(status_code=404, detail="CI not found")
    if not ci.ip_address:
        raise HTTPException(status_code=400, detail="CI has no IP address")
    result = svc.reboot_device(host=ci.ip_address)
    db.add(AuditLog(
        ci_id=ci.id,
        action="reboot",
        actor=user.username,
        description=f"Reboot command sent to {ci.name} ({ci.ip_address})",
    ))
    db.commit()
    return result


@router.get("/devices", summary="List all FRITZ!Box devices (routers and access points) from CI inventory")
def list_fritz_devices(db: Session = Depends(get_db), _: User = Depends(require_user)):
    """Return all CIs that are Fritz!Box devices (routers/APs from AVM)."""
    from sqlalchemy import or_
    cis = db.query(ConfigurationItem).filter(
        ConfigurationItem.status != "retired",
        or_(
            ConfigurationItem.ci_type.in_(["router", "access_point"]),
        ),
    ).order_by(ConfigurationItem.ci_type, ConfigurationItem.name).all()

    from app.schemas.ci import CIResponse
    return [CIResponse.model_validate(ci) for ci in cis]
