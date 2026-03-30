"""FRITZ!Box integration endpoints."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth import require_admin, require_operator, require_user
from app.models.user import User
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
